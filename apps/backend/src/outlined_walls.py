"""Pixel-evidenced centre lines for architectural walls drawn as hollow bands.

Filled-wall detection cannot find these walls: their centre pixels are white.
This detector pairs parallel ink faces, then retains a connected architectural
network. It preserves opening gaps where both wall faces are absent.
"""
from __future__ import annotations

import math

import cv2
import numpy as np

from wall_geometry import consolidate_walls, supported_proposals

def _ink(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    return cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]


def _faces(mask, axis, minimum_length):
    kernel = (minimum_length, 1) if axis == 0 else (1, minimum_length)
    directional = cv2.morphologyEx(mask, cv2.MORPH_OPEN,
                                  cv2.getStructuringElement(cv2.MORPH_RECT, kernel))
    rows = directional if axis == 0 else directional.T
    groups = []
    maximum_stroke = max(4, round(max(mask.shape) * .003))
    for normal, row in enumerate(rows):
        changes = np.diff(np.r_[0, row > 0, 0].astype(np.int8))
        for start, end in zip(np.flatnonzero(changes == 1), np.flatnonzero(changes == -1) - 1):
            if end - start + 1 < minimum_length:
                continue
            matching = [g for g in groups if g['last'] == normal - 1 and normal - g['first'] < maximum_stroke
                        and min(g['end'], end) - max(g['start'], start) >= minimum_length * .75]
            if matching:
                group = max(matching, key=lambda g: min(g['end'], end) - max(g['start'], start))
                group.update(last=normal, start=min(group['start'], int(start)), end=max(group['end'], int(end)))
            else:
                groups.append({'first': normal, 'last': normal, 'start': int(start), 'end': int(end)})
    result = [{'axis': axis, 'coordinate': float(round((g['first'] + g['last']) / 2)),
               'start': g['start'], 'end': g['end'], 'stroke': g['last'] - g['first'] + 1} for g in groups]
    return sorted(result, key=lambda f: (f["coordinate"], f["start"]))


def detect_outlined_walls(image, measurements=None):
    """Return evidence-backed hollow-wall proposals in original image pixels."""
    if image is None or not isinstance(image, np.ndarray) or image.size == 0:
        return []
    mask = _ink(image)
    # Text may form convincing parallel faces (bold room names, logos and phone
    # numbers). Remove OCR boxes from this private mask, never from the source.
    for box in (measurements or {}).get('ocr_text_regions', []):
        try:
            x1, y1, x2, y2 = (float(value) for value in box)
        except (TypeError, ValueError):
            continue
        pad = max(2, round((y2 - y1) * .2))
        cv2.rectangle(mask, (max(0, round(x1) - pad), max(0, round(y1) - pad)),
                      (min(mask.shape[1] - 1, round(x2) + pad),
                       min(mask.shape[0] - 1, round(y2) + pad)), 0, -1)
    # Arrow/tick rules outside the building otherwise resemble a second wall
    # face. Use the same visual reference detector as measurement extraction.
    for rule in [m['reference'] for m in (measurements or {}).get('linear', []) if m.get('reference')]:
        a, b = (tuple(round(rule[key][c]) for c in ('x', 'y')) for key in ('start', 'end'))
        cv2.line(mask, a, b, 0, max(3, int(rule.get('stroke_width_px', 1)) + 2))
    maximum = max(mask.shape)
    minimum_length = max(12, round(maximum * .007)) | 1
    maximum_width = max(16, maximum * .018)
    candidates = []
    for axis in (0, 1):
        faces = _faces(mask, axis, minimum_length)
        for i, first in enumerate(faces):
            for second in faces[i + 1:]:
                low, high = first['coordinate'], second['coordinate']
                width = high - low
                if width > maximum_width:
                    break
                if width < max(7, 3 * max(first['stroke'], second['stroke'])):
                    continue
                start, end = max(first['start'], second['start']), min(first['end'], second['end'])
                if end - start + 1 < max(minimum_length * .75, width * .5):
                    continue
                # Sample the interior, not just its centre; filled walls must
                # continue through the separate solid-wall detector.
                along = np.rint(np.linspace(start + 2, end - 2, min(100, end - start))).astype(int)
                normals = np.rint(np.linspace(low + first['stroke'], high - second['stroke'], 7)).astype(int)
                pixels = mask[normals[:, None], along] if axis == 0 else mask[along[:, None], normals].T
                white = float(np.mean(pixels == 0))
                if white < .6:
                    continue
                # Pair neighbouring faces. Skipping a continuous ink stroke
                # would combine a wall with an adjacent cabinet/door leaf.
                interior = range(int(low) + first['stroke'] + 1, int(high) - second['stroke'])
                if any(float(np.mean(mask[n, along] > 0 if axis == 0 else mask[along, n] > 0)) > .65
                       for n in interior):
                    continue
                candidates.append({'axis': axis, 'low': low, 'high': high, 'start': float(start), 'end': float(end),
                                   'face_start': float(min(first['start'], second['start'])),
                                   'face_end': float(max(first['end'], second['end'])),
                                   'width': width, 'coordinate': (low + high) / 2,
                                   'stroke': max(first['stroke'], second['stroke']), 'white': white})

    # Infer recurring wall widths from long paired faces, not from text or
    # short fixture edges. Union intervals so duplicate raster rows do not
    # artificially increase a width's vote.
    votes = {}
    for c in candidates:
        if c['end'] - c['start'] < maximum * .12:
            continue
        key = (round(c['width']), c['axis'], round(c['coordinate'] / 2))
        votes.setdefault(key, []).append((c['start'], c['end']))
    histogram = {}
    for (width, _, _), intervals in votes.items():
        end = -math.inf
        for lo, hi in sorted(intervals):
            histogram[width] = histogram.get(width, 0) + max(0, hi - max(lo, end))
            end = max(end, hi)
    modes = []
    while histogram:
        peak = max(histogram, key=lambda w: sum(v for n, v in histogram.items() if abs(n - w) <= 2))
        weight = sum(v for n, v in histogram.items() if abs(n - peak) <= 2)
        if modes and weight < modes[0][1] * .2:
            break
        modes.append((peak, weight))
        histogram = {n: v for n, v in histogram.items() if abs(n - peak) > 3}
    if modes:
        candidates = [c for c in candidates if any(abs(c['width'] - width) <= 2 for width, _ in modes)]

    # Only pairs joined to a perpendicular pair constitute architectural
    # evidence. Standalone furniture rectangles and window rails do not become
    # a second wall solely because two parallel strokes exist.
    neighbours = [set() for _ in candidates]
    junctions = []
    parallel_joins = []
    for i, first in enumerate(candidates):
        for j in range(i + 1, len(candidates)):
            second = candidates[j]
            if first['axis'] == second['axis']:
                if abs(first['coordinate'] - second['coordinate']) > 1 or abs(first['width'] - second['width']) > 1.5:
                    continue
                left, right = sorted((first, second), key=lambda c: c['start'])
                gap = right['start'] - left['end']
                if gap > max(first['width'], second['width']) * .65:
                    continue
                if gap > 1:
                    along = np.arange(math.ceil(left['end']), math.floor(right['start']) + 1)
                    supports = []
                    for face in (first['low'], first['high']):
                        normal = round(face)
                        pixels = mask[max(0, normal - 1):normal + 2, along] if first['axis'] == 0 else mask[along, max(0, normal - 1):normal + 2].T
                        supports.append(float(np.mean(np.any(pixels > 0, axis=0))))
                    # A corner/return can interrupt one face while the other
                    # continues. An opening breaks both; never join that gap.
                    if max(supports) < .9:
                        continue
                neighbours[i].add(j); neighbours[j].add(i)
                parallel_joins.append((i, j))
                continue
            h, v = (first, second) if first['axis'] == 0 else (second, first)
            x, y = v['coordinate'], h['coordinate']
            extension = maximum * .06
            if not max(h['face_start'], h['start'] - extension) - v['width'] / 2 - 2 <= x <= min(h['face_end'], h['end'] + extension) + v['width'] / 2 + 2:
                continue
            if not max(v['face_start'], v['start'] - extension) - h['width'] / 2 - 2 <= y <= min(v['face_end'], v['end'] + extension) + h['width'] / 2 + 2:
                continue
            neighbours[i].add(j); neighbours[j].add(i)
            junctions.append((i, j, x, y))
    components, unseen = [], set(range(len(candidates)))
    while unseen:
        seed = min(unseen); stack = [seed]; component = set()
        while stack:
            item = stack.pop()
            if item in component:
                continue
            component.add(item); unseen.discard(item)
            stack.extend(neighbours[item] - component)
        if len(component) >= 3:
            components.append(component)
    if not components:
        return []
    # The architectural network spans the drawing. A detached outlined desk or
    # shower must not be imported as another room. No forced bounding rectangle.
    def extent(component):
        xs, ys = [], []
        for i in component:
            c = candidates[i]
            (xs if c['axis'] == 0 else ys).extend([c['start'], c['end']])
            (ys if c['axis'] == 0 else xs).append(c['coordinate'])
        return (max(xs) - min(xs)) * (max(ys) - min(ys))
    largest = max(extent(component) for component in components)
    selected = set().union(*(component for component in components if extent(component) >= largest * .15))
    # Prefer a full envelope to thinner parallel window/furniture rails in its
    # interior. This only suppresses a covered interval, never nearby partitions.
    for i in list(selected):
        small = candidates[i]
        for j in selected:
            large = candidates[j]
            if i == j or small['axis'] != large['axis'] or large['width'] < small['width'] * 1.4:
                continue
            if large['low'] - 1 <= small['low'] and small['high'] <= large['high'] + 1 \
                    and large['start'] <= small['start'] + 2 and large['end'] >= small['end'] - 2:
                selected.discard(i)
                break
    for i, j, x, y in junctions:
        if i not in selected or j not in selected:
            continue
        for index in (i, j):
            c = candidates[index]
            value = x if c['axis'] == 0 else y
            if value < c['start']:
                c['start'] = value
            if value > c['end']:
                c['end'] = value
    for i, j in parallel_joins:
        if i not in selected or j not in selected:
            continue
        left, right = sorted((candidates[i], candidates[j]), key=lambda c: c['start'])
        if left['end'] < right['start']:
            left['end'] = right['start']
    result = []
    for i in sorted(selected):
        c = candidates[i]; axis = 'x' if c['axis'] == 0 else 'y'; normal = 'y' if axis == 'x' else 'x'
        result.append({'start': {axis: c['start'], normal: c['coordinate']},
                       'end': {axis: c['end'], normal: c['coordinate']},
                       'thickness_px': c['width'], 'detector': 'cv-outline',
                       'outline_faces': {'axis': axis, 'low': c['low'], 'high': c['high'], 'stroke_px': c['stroke']},
                       'interior_white_fraction': round(c['white'], 3)})
    result = supported_proposals(consolidate_walls(result, image=image), image)
    # Unsupported proposed junctions can leave isolated text strokes behind.
    # Recheck connectivity using only the surviving physical wall bands.
    network = np.zeros(mask.shape, np.uint8)
    for wall in result:
        a, b = (tuple(round(wall[key][c]) for c in ('x', 'y')) for key in ('start', 'end'))
        cv2.line(network, a, b, 255, max(1, round(wall['thickness_px'])))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(network)
    if count <= 1:
        return []
    extents = stats[1:, cv2.CC_STAT_WIDTH] * stats[1:, cv2.CC_STAT_HEIGHT]
    threshold = float(max(extents)) * .15
    result = [w for w in result if extents[labels[
        round((w['start']['y'] + w['end']['y'])/2),
        round((w['start']['x'] + w['end']['x'])/2)] - 1] >= threshold]
    # A very short perpendicular band wholly inside a wall is its end cap,
    # not another wall. Keep real projecting returns outside that envelope.
    def end_cap(wall):
        axis = wall['outline_faces']['axis']; normal = 'y' if axis == 'x' else 'x'
        for other in result:
            faces = other['outline_faces']
            if faces['axis'] == axis:
                continue
            if faces['low'] - 2 <= wall['start'][axis] <= wall['end'][axis] <= faces['high'] + 2 \
                    and other['start'][normal] <= wall['start'][normal] <= other['end'][normal]:
                return True
        return False
    return [wall for wall in result if not end_cap(wall)]
