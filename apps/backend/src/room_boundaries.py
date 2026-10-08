"""Derive room inside faces from detected walls, in original-image pixels.

Only an enclosed wall network defines a room. Object-detection rectangles and
area text are evidence for naming/assigning an existing room, never its shape.
Door/window boxes can close a collinear gap temporarily for room topology; these
closures are returned separately and must not be rendered as solid walls.
"""
import math

import cv2
import numpy as np
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union


AREA_CONFIDENCE = 0.85
ROOM_CLASSES = {
    'room', 'bedroom', 'bathroom', 'bath', 'ensuite', 'ensuite-bath', 'kitchen',
    'living-room', 'dining-room', 'dining', 'living', 'porch', 'laundry',
    'balcony', 'verandah', 'kitchen-verandah', 'toilet', 'hall', 'study',
    'utility', 'storeroom', 'store-room', 'office', 'garage',
}
OPENING_CLASSES = {'door', 'window', 'glass-window', 'sliding-door', 'double-door'}


def _finite(value):
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def _bbox(item):
    value = item.get('bbox') if isinstance(item, dict) else None
    if isinstance(value, dict):
        value = [value.get(key) for key in ('x1', 'y1', 'x2', 'y2')]
    if not isinstance(value, (list, tuple)) or len(value) != 4 or not all(_finite(v) for v in value):
        return None
    x1, y1, x2, y2 = map(float, value)
    return (x1, y1, x2, y2) if x2 > x1 and y2 > y1 else None


def _class(item):
    return str(item.get('class', item.get('name', ''))).strip().lower().replace('_', '-').replace(' ', '-')


def _thickness_from_image(mask, a, b):
    """Sample a filled wall band; do not turn an arbitrary default into evidence."""
    axis = 0 if abs(b[1] - a[1]) < 0.01 else 1
    normal = 1 - axis
    widths = []
    for fraction in np.linspace(0.15, 0.85, 11):
        p = np.rint(a + fraction * (b - a)).astype(int)
        if not (0 <= p[0] < mask.shape[1] and 0 <= p[1] < mask.shape[0]):
            continue
        profile = mask[:, p[0]] if axis == 0 else mask[p[1], :]
        center = int(p[normal])
        if not profile[center]:
            continue
        lo = hi = center
        while lo > 0 and profile[lo - 1] and center - lo < 64:
            lo -= 1
        while hi + 1 < len(profile) and profile[hi + 1] and hi - center < 64:
            hi += 1
        if 2 <= hi - lo + 1 <= 64:
            widths.append(hi - lo + 1)
    return float(np.median(widths)) if len(widths) >= 6 else None


def _wall_records(image, walls):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    records, warnings = [], []
    for index, wall in enumerate(walls or []):
        try:
            a, b = (np.array([wall[key]['x'], wall[key]['y']], dtype=float) for key in ('start', 'end'))
        except (KeyError, TypeError, ValueError):
            continue
        if not np.isfinite([a, b]).all() or np.linalg.norm(b - a) < 1:
            continue
        delta = abs(b-a)
        raster_tolerance = max(1., max(image.shape[:2])*.0008)
        axis = (0 if delta[1] <= min(raster_tolerance,delta[0]*.002)
                else 1 if delta[0] <= min(raster_tolerance,delta[1]*.002) else None)
        if axis is None:
            warnings.append('Angled walls need manual room boundaries; automatic exact room areas support horizontal/vertical walls.')
            continue
        # Subpixel fitted slope is not an architectural diagonal. Normalize
        # only the private topology copy; retain original detection coordinates.
        a[1-axis] = b[1-axis] = (a[1-axis]+b[1-axis])/2
        thickness = wall.get('thickness_px')
        if not _finite(thickness) or float(thickness) <= 0:
            thickness = _thickness_from_image(mask, a, b)
        if thickness is None:
            warnings.append('A wall has no reliable pixel thickness; rooms depending on that wall need review.')
            continue
        thickness = float(thickness)
        if thickness > min(image.shape[:2]) / 4:
            continue
        if a[axis] > b[axis]:
            a, b = b, a
        records.append({'start': {'x': float(a[0]), 'y': float(a[1])},
                        'end': {'x': float(b[0]), 'y': float(b[1])},
                        'thickness_px': thickness, 'axis': axis,
                        'lo': float(a[axis]), 'hi': float(b[axis]),
                        'normal': float(a[1 - axis]), 'wall_index': index})
    return records, warnings


def _opening_closures(walls, doors, objects):
    openings = [item for item in doors if isinstance(item, dict)]
    openings.extend(item for item in objects if isinstance(item, dict) and _class(item) in OPENING_CLASSES)
    closures, seen = [], set()
    for opening in openings:
        bounds = _bbox(opening)
        if bounds is None or (_finite(opening.get('confidence')) and float(opening['confidence']) < 0.45):
            continue
        candidates = []
        for i, first in enumerate(walls):
            axis, normal = first['axis'], first['normal']
            along_lo, along_hi = bounds[axis], bounds[axis + 2]
            normal_lo, normal_hi = bounds[1 - axis], bounds[3 - axis]
            for second in walls[i + 1:]:
                if axis != second['axis']:
                    continue
                thickness = min(first['thickness_px'], second['thickness_px'])
                if abs(normal - second['normal']) > thickness * 0.7:
                    continue
                left, right = sorted((first, second), key=lambda w: w['lo'])
                lo, hi = left['hi'], right['lo']
                tolerance = max(2, min(thickness * 1.5, max(thickness * .8, (along_hi-along_lo)*.15)))
                if hi - lo <= 1 or not normal_lo - tolerance <= normal <= normal_hi + tolerance:
                    continue
                # Both gap ends need opening-box evidence. A large box for a
                # nearby room/furniture item cannot close an entire missing wall.
                if not (abs(along_lo - lo) <= tolerance and abs(along_hi - hi) <= tolerance):
                    continue
                score = abs(along_lo - lo) + abs(along_hi - hi) + abs(normal - (normal_lo + normal_hi) / 2) * 0.1
                candidates.append((score, lo, hi, normal, axis, thickness))
        candidates.sort()
        if not candidates:
            continue
        best = candidates[0]
        # Adjacent parallel hosts with equally good geometry are ambiguous.
        if (len(candidates) > 1 and candidates[1][0] - best[0] < 0.5
                and (candidates[1][4] != best[4]
                     or abs(candidates[1][3]-best[3]) > min(candidates[1][5],best[5])*.5)):
            continue
        _, lo, hi, normal, axis, thickness = best
        key = (round(lo, 3), round(hi, 3), round(normal, 3), axis)
        if key in seen:
            continue
        seen.add(key)
        a, b = ((lo, normal), (hi, normal)) if axis == 0 else ((normal, lo), (normal, hi))
        closures.append({'start': {'x': a[0], 'y': a[1]}, 'end': {'x': b[0], 'y': b[1]},
                         'thickness_px': thickness, 'source': 'opening-closure'})
    return closures


def _solid(wall):
    a, b = (tuple(wall[key][coord] for coord in ('x', 'y')) for key in ('start', 'end'))
    return LineString([a, b]).buffer(wall['thickness_px'] / 2, cap_style=2, join_style=2)


def _interior_polygons(records, closures, image):
    if not records:
        return []
    solids = [_solid(wall) for wall in [*records, *closures]]
    gray = cv2.cvtColor(image,cv2.COLOR_BGR2GRAY) if image.ndim==3 else image
    ink=cv2.threshold(gray,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)[1]
    ink=cv2.dilate(ink,np.ones((3,3),np.uint8))
    for i,first in enumerate(records):
        for second in records[i+1:]:
            if first['axis']!=second['axis']: continue
            width=min(first['thickness_px'],second['thickness_px'])
            if abs(first['normal']-second['normal'])>width*.1: continue
            left,right=sorted((first,second),key=lambda w:w['lo'])
            gap=right['lo']-left['hi']
            if not 0<gap<=min(width*.25,max(image.shape[:2])*.003): continue
            axis=first['axis']; normal=(first['normal']+second['normal'])/2
            supported=True
            for sign in (-1,1):
                samples=np.zeros((9,2)); samples[:,axis]=np.linspace(left['hi'],right['lo'],9)
                samples[:,1-axis]=normal+sign*width/2
                pixels=np.rint(samples).astype(int)
                pixels[:,0]=pixels[:,0].clip(0,ink.shape[1]-1); pixels[:,1]=pixels[:,1].clip(0,ink.shape[0]-1)
                supported &= np.mean(ink[pixels[:,1],pixels[:,0]]>0)>=.6
            if supported:
                a,b=({'x':left['hi'],'y':normal},{'x':right['lo'],'y':normal}) if axis==0 else ({'x':normal,'y':left['hi']},{'x':normal,'y':right['lo']})
                solids.append(_solid({'start':a,'end':b,'thickness_px':width}))
    # Fill only a local endpoint-to-perpendicular-wall junction. Detectors
    # sometimes stop at the inside face instead of the intersecting centreline.
    # No collinear gap repair; bounded by the two intersecting half-widths.
    for wall in records:
        for key in ('start','end'):
            p=wall[key]
            for host in records:
                if host['axis']==wall['axis']: continue
                q=dict(p); q['x' if wall['axis']==0 else 'y']=host['normal']
                distance=abs(q['x']-p['x'])+abs(q['y']-p['y'])
                along=p['y' if host['axis']==1 else 'x']
                if (0<distance<=(host['thickness_px']+wall['thickness_px'])/2
                        and host['lo']<=along<=host['hi']):
                    solids.append(_solid({**wall,'start':p,'end':q}))
    union = unary_union(solids)
    components = [union] if union.geom_type == 'Polygon' else list(getattr(union, 'geoms', []))
    components = [part for part in components if part.geom_type == 'Polygon']
    if not components:
        return []
    # The main connected structural network owns rooms. Disconnected furniture
    # outlines inside it must not become additional tiny "rooms".
    main = max(components, key=lambda part: (part.bounds[2] - part.bounds[0]) * (part.bounds[3] - part.bounds[1]))
    minimum_area = max(100, image.shape[0] * image.shape[1] * 0.0003)
    result = []
    for ring in main.interiors:
        polygon = Polygon(ring).simplify(0.001, preserve_topology=True)
        width, height = polygon.bounds[2] - polygon.bounds[0], polygon.bounds[3] - polygon.bounds[1]
        if polygon.is_valid and polygon.area >= minimum_area and min(width, height) >= 8 and max(width, height) / min(width, height) <= 25:
            result.append(polygon)
    return sorted(result, key=lambda item: (round(item.bounds[1], 3), round(item.bounds[0], 3)))


def detect_room_boundaries(image, walls, doors=None, objects=None, measurements=None):
    """Return automatic inside-face room polygons and unassigned area labels.

    Declared areas are attached only when one high-confidence label lies wholly
    inside one enclosed room. Several labels in a connected open-plan region do
    not establish invisible partitions and therefore remain unresolved.
    """
    doors, objects, measurements = doors or [], objects or [], measurements or {}
    records, warnings = _wall_records(image, walls)
    closures = _opening_closures(records, doors, objects)
    polygons = _interior_polygons(records, closures, image)
    rooms, unresolved, assignments = [], [], [[] for _ in polygons]
    for index, polygon in enumerate(polygons):
        names = []
        for item in objects:
            if not isinstance(item, dict) or _class(item) not in ROOM_CLASSES:
                continue
            bounds = _bbox(item)
            if bounds and polygon.contains(Point((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)):
                name = str(item.get('class', item.get('name', 'Room'))).replace('_', ' ').replace('-', ' ').title()
                if name not in names:
                    names.append(name)
        rooms.append({'id': f'auto-room-{index + 1}', 'name': ' / '.join(names) or f'Room {index + 1}',
                      'points': [{'x': round(float(x), 4), 'y': round(float(y), 4)} for x, y in list(polygon.exterior.coords)[:-1]],
                      'boundary_source': 'auto_walls', 'boundary_reference': 'inside_faces',
                      'area_px2': round(float(polygon.area), 6)})
    for annotation in measurements.get('areas', []):
        identifier = annotation.get('id')
        bounds = _bbox(annotation)
        if bounds is None or not _finite(annotation.get('value_m2')) or float(annotation['value_m2']) <= 0:
            unresolved.append({'area_annotation_id': identifier, 'reason': 'invalid_area_annotation'})
            continue
        containing = [index for index, polygon in enumerate(polygons) if polygon.contains(box(*bounds))]
        if len(containing) != 1:
            unresolved.append({'area_annotation_id': identifier, 'reason': 'no_enclosed_room' if not containing else 'ambiguous_room'})
            continue
        assignments[containing[0]].append(annotation)
    for room, labels in zip(rooms, assignments):
        if len(labels) > 1:
            unresolved.extend({'area_annotation_id': item.get('id'), 'room_id': room['id'], 'reason': 'multiple_area_labels_in_open_region'} for item in labels)
        elif labels:
            annotation = labels[0]
            if not _finite(annotation.get('confidence')) or float(annotation['confidence']) < AREA_CONFIDENCE:
                unresolved.append({'area_annotation_id': annotation.get('id'), 'room_id': room['id'], 'reason': 'low_ocr_confidence'})
                continue
            room.update({'declared_area_m2': float(annotation['value_m2']),
                         'declared_area_text': annotation.get('text', f"{annotation['value_m2']} m²"),
                         'area_annotation_id': annotation.get('id'),
                         'area_confidence': float(annotation['confidence'])})
    if unresolved:
        warnings.append('Some printed room areas could not be assigned safely to a closed room; review the highlighted labels or correct missing walls.')
    if not rooms and walls:
        warnings.append('No enclosed room boundaries were found. Missing walls or unrecognised openings need correction before applying room areas.')
    return {'rooms': rooms, 'unresolved': unresolved, 'warnings': list(dict.fromkeys(warnings)), 'closures': closures,
            'wall_thicknesses': [{'wall_index': wall['wall_index'], 'thickness_px': wall['thickness_px']} for wall in records]}
