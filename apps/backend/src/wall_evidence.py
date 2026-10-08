"""Multi-style wall proposals and conservative, auditable evidence assessment.

All geometry is in input-image pixels. No image resampling, colour classes, or
room-closing inference is used. Scores are heuristic evidence, NOT probabilities.
"""
from copy import deepcopy
from dataclasses import asdict, dataclass
import math

import cv2
import numpy as np

from wall_geometry import AUTHORED


@dataclass(frozen=True)
class WallEvidenceConfig:
    min_face_length_ratio: float = .018
    max_thickness_ratio: float = .025
    min_pair_width_ratio: float = .002
    angle_tolerance_degrees: float = 2.0
    min_boundary_support: float = .72
    min_accepted_score: float = .64
    long_wall_ratio: float = .12
    max_faces: int = 900


def points(w):
    return [np.array([w[k]['x'], w[k]['y']], float) for k in ('start', 'end')]


def point(p):
    return dict(x=round(float(p[0]), 3), y=round(float(p[1]), 3))


def cross(a,b):
    return a[0]*b[1]-a[1]*b[0]


def sample(mask, pts):
    p = np.rint(pts).astype(int)
    valid = (p[..., 0] >= 0) & (p[..., 0] < mask.shape[1]) & (p[..., 1] >= 0) & (p[..., 1] < mask.shape[0])
    out = np.zeros(valid.shape, float)
    out[valid] = mask[p[..., 1][valid], p[..., 0][valid]] / 255.
    return out


def masks(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    # Local contrast recovers pale pencil/grey faces without eroding partitions.
    # Canny supplies geometry; thresholded pixels only measure band interiors.
    enhanced = cv2.createCLAHE(clipLimit=2., tileGridSize=(8, 8)).apply(gray)
    edge = cv2.Canny(enhanced, 25, 85)
    ink = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    return enhanced, edge, ink


def paired_wall_proposals(image, measurements=None, config=None):
    """Pair nearby, parallel LSD boundary segments at arbitrary angles.

    Long support on BOTH faces is required. Greyscale intensity and interior
    hatching are recorded but do not decide whether a band is architectural.
    """
    cfg = config or WallEvidenceConfig()
    gray, edges, ink = masks(image)
    size = max(gray.shape)
    minimum = max(6., size * cfg.min_face_length_ratio)  # 6: raster fit floor
    raw = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD).detect(gray)[0]
    if raw is None:
        return []
    faces = []
    for coords in raw[:, 0]:
        a, b = coords[:2].astype(float), coords[2:].astype(float)
        if tuple(a) > tuple(b):
            a, b = b, a
        length = np.linalg.norm(b-a)
        if length >= minimum:
            faces.append((a, b, (b-a)/length, length))
    faces.sort(key=lambda f: -f[3])
    faces = faces[:cfg.max_faces]
    if not faces:
        return []
    tolerance = max(1, round(size*.0007))
    near_edge = cv2.dilate(edges, np.ones((2*tolerance+1, 2*tolerance+1), np.uint8))
    result = []
    face_a=np.array([f[0] for f in faces]); face_b=np.array([f[1] for f in faces])
    face_u=np.array([f[2] for f in faces])
    for i, (a, b, u, length) in enumerate(faces):
        n = np.array([-u[1], u[0]])
        offsets_a=(face_a-a)@n; offsets_b=(face_b-a)@n
        widths=np.abs((offsets_a+offsets_b)/2)
        possible=np.flatnonzero((np.arange(len(faces))>i)
            & (abs(u[0]*face_u[:,1]-u[1]*face_u[:,0])<=math.sin(math.radians(cfg.angle_tolerance_degrees)))
            & (widths>=max(2.5,size*cfg.min_pair_width_ratio)) & (widths<=size*cfg.max_thickness_ratio))
        for j in possible:
            c,d,v,other_length=faces[j]
            offsets = np.array([np.dot(c-a, n), np.dot(d-a, n)])
            width = abs(float(np.mean(offsets)))
            if not max(2.5, size*cfg.min_pair_width_ratio) <= width <= size*cfg.max_thickness_ratio:
                continue
            if abs(offsets[0]-offsets[1]) > max(tolerance*2, width*.18):
                continue
            lo, hi = sorted([np.dot(c-a, u), np.dot(d-a, u)])
            lo, hi = max(0., lo), min(length, hi)
            if hi-lo < max(minimum, width*2.5):
                continue
            aa, bb = a+u*lo, a+u*hi
            count = max(12, min(180, round(hi-lo)))
            first = np.linspace(aa, bb, count)
            shift = n*float(np.mean(offsets))
            supports = [sample(near_edge, first).mean(), sample(near_edge, first+shift).mean()]
            if min(supports) < cfg.min_boundary_support:
                continue
            # Skip pairs crossing another continuous boundary: cabinet/window
            # rails must not form one thick envelope across several members.
            inside = np.stack([sample(edges, first+shift*f) for f in np.linspace(.3, .7, 7)])
            if np.max(inside.mean(axis=1)) > .65:
                continue
            center_a, center_b = aa+shift/2, bb+shift/2
            fill = sample(ink, np.stack([first+shift*f for f in np.linspace(.15, .85, 7)])).mean()
            result.append({'start': point(center_a), 'end': point(center_b),
                           'thickness_px': round(width, 3), 'detector': 'boundary-pair',
                           'boundary_support': round(float(min(supports)), 3),
                           'band_style': 'solid' if fill > .8 else 'outlined' if fill < .15 else 'hatched-or-grey',
                           'geometry_evidence': 'paired_boundaries'})
    # Long single strokes can be thin partitions. Preserve their orientation;
    # later junction/semantic checks decide acceptance, rather than eroding them.
    for a,b,u,length in faces:
        if length >= size*.045:
            result.append({'start':point(a),'end':point(b),'detector':'single-boundary',
                           'geometry_evidence':'unverified_single_stroke'})
    return deduplicate(result, size)


def deduplicate(walls, size):
    """Union overlapping SAME-band intervals only; never bridge a white gap."""
    result = []
    geometry = []
    def cached(w):
        c,d=points(w); delta=d-c; length=math.hypot(*delta)
        return c,d,delta/length,length,float(w.get('thickness_px') or 1)
    ordered = sorted(deepcopy(walls), key=lambda w: (w.get('source') not in AUTHORED,
                     w.get('geometry_evidence') != 'paired_boundaries', -np.linalg.norm(points(w)[1]-points(w)[0])))
    for w in ordered:
        a, b = points(w)
        length = np.linalg.norm(b-a)
        if length < 1:
            continue
        u, width = (b-a)/length, float(w.get('thickness_px') or 1)
        n = np.array([-u[1], u[0]])
        duplicate = False
        for index,old in enumerate(result):
            c,d,v,old_length,ow=geometry[index]
            if abs(cross(u, v)) > .0174524064:  # sin(1 degree)
                continue
            cx,cy=c[0]-a[0],c[1]-a[1]; dx,dy=d[0]-a[0],d[1]-a[1]
            offset = max(abs(cx*n[0]+cy*n[1]),abs(dx*n[0]+dy*n[1]))
            # Width-sensitive tolerance: two separate thin partitions stay apart.
            same_center = offset <= min(width, ow)*.22 + .5
            duplicate_face = (old.get('geometry_evidence') == 'paired_boundaries'
                              and w.get('geometry_evidence') != 'paired_boundaries'
                              and width < ow*.4 and offset <= ow/2+max(1,size*.0015))
            if not (same_center or duplicate_face):
                continue
            lo, hi = sorted([cx*u[0]+cy*u[1],dx*u[0]+dy*u[1]])
            overlap = min(length, hi)-max(0., lo)
            if overlap > 1 and (duplicate_face or old.get('source') in AUTHORED):
                # Keep unmatched lengths instead of discarding a long proposal
                # that only partly duplicates an existing face/authored wall.
                for start,end in ((0.,max(0.,lo)),(min(length,hi),length)):
                    if end-start > max(1.,size*.001):
                        ordered.append({**w,'start':point(a+start*u),'end':point(a+end*u)})
                duplicate=True
                break
            if overlap < min(length, hi-lo)*.75 and not (same_center and .75<width/ow<1.33 and overlap>max(1.,min(width,ow)*.3)):
                continue
            # Only extend equally thick proposals; don't let a face extend a
            # paired envelope across a door where its second face stopped.
            if same_center and .75 < width/ow < 1.33 and old.get('source') not in AUTHORED:
                # Preserve the preferred supporting line. Reprojecting it onto
                # every noisy duplicate progressively drifts a true raster axis.
                start,end=sorted([np.dot(a-c,v),np.dot(b-c,v)])
                old['start'], old['end'] = point(c+v*min(0.,start)), point(c+v*max(old_length,end))
                geometry[index]=cached(old)
            duplicate = True
            break
        if not duplicate:
            result.append(w)
            geometry.append(cached(w))
    return result


def box_fraction(samples, box, margin=0.):
    if isinstance(box, dict):
        box = [box[k] for k in ('x1', 'y1', 'x2', 'y2')]
    x1, y1, x2, y2 = box
    return float(np.mean((samples[:, 0] >= x1-margin) & (samples[:, 0] <= x2+margin)
                       & (samples[:, 1] >= y1-margin) & (samples[:, 1] <= y2+margin)))


def labelled_furniture_regions(image, measurements):
    """Recover missed beds only where a furniture caption has a closed outline.

    Never use bedroom boxes or expand a text box to a guessed mattress size.
    Nearby walls remain outside the recovered contour's bounds.
    """
    _, _, ink = masks(image)
    contours, _ = cv2.findContours(ink, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    size = max(image.shape[:2]); regions = []
    for label in measurements.get('furniture_labels', []):
        if label.get('class') not in ('bed','storage'): continue
        storage=label['class']=='storage'
        x1,y1,x2,y2 = label['bbox']; center=((x1+x2)/2,(y1+y2)/2)
        choices=[]
        for contour in contours:
            x,y,w,h = cv2.boundingRect(contour)
            if not (size*(.015 if storage else .06) < min(w,h) and max(w,h)<size*.4
                    and (1/8 if storage else .45)<w/h<(8 if storage else 2.3)): continue
            if w*h>image.shape[0]*image.shape[1]*(.025 if storage else .1): continue
            if not (x<=x1 and x+w>=x2 and y<=y1 and y+h>=y2): continue
            if cv2.pointPolygonTest(contour,center,False)<0: continue
            if cv2.contourArea(contour)/(w*h)<.8: continue
            choices.append((w*h,[x,y,x+w,y+h]))
        if choices: regions.append((max if storage else min)(choices,key=lambda p:p[0])[1])
    return regions


def door_leaf_overlap(samples, width, door, size):
    """A leaf lies in a swing footprint, not along the narrow opening axis.

    Object-only door models often return a square symbol box without swing_bbox.
    Use that footprint too; do not depend on estimated wall thickness, since
    pairing a leaf's two ink strokes can substantially overestimate its width.
    """
    box=door.get('swing_bbox') or door.get('bbox')
    if not box: return False
    x1,y1,x2,y2=[box[k] for k in ('x1','y1','x2','y2')]
    short,long=sorted((x2-x1,y2-y1))
    if short<=0 or short/long<.35 or width>long*.25: return False
    if box_fraction(samples,box,margin=max(size*.001,long*.08))<.85: return False
    # Do not suppress a structural segment on the symbol's outer frame.
    delta=samples[-1]-samples[0]
    inset=max(size*.001,long*.06)
    interior=box_fraction(samples,[x1+inset,y1+inset,x2-inset,y2-inset])
    return interior>.25 or (abs(delta[0])>long*.2 and abs(delta[1])>long*.2)


def repeated_line_regions(image):
    """Local regular runs, with matching endpoints; never union distant runs.

    A pattern may be stairs OR cabinet slats, so it only downgrades wall evidence.
    """
    from outlined_walls import _faces
    _, edges, ink = masks(image)
    # Grey treads can vanish under Otsu although LSD already proposed them.
    # Use the same faint boundaries for repetition as for wall proposals.
    ink = cv2.bitwise_or(ink, edges)
    size = max(ink.shape); found=[]
    for axis in (0,1):
        faces=_faces(ink,axis,max(9,round(size*.035)))
        for anchor in faces:
            length=anchor['end']-anchor['start']
            family=[f for f in faces if abs(f['start']-anchor['start'])<max(size*.012,length*.12)
                    and abs(f['end']-anchor['end'])<max(size*.012,length*.12)]
            unique=[]
            for f in sorted(family,key=lambda f:f['coordinate']):
                if not unique or f['coordinate']-unique[-1]['coordinate']>max(size*.003, f['stroke']*1.5):
                    unique.append(f)
            for start in range(len(unique)-4):
                run=unique[start:start+5]; gaps=np.diff([f['coordinate'] for f in run]); median=float(np.median(gaps))
                if not size*.004<median<min(size*.06,length*.45): continue
                if np.max(abs(gaps-median))>median*.3: continue
                end=start+5
                while end<len(unique) and abs(unique[end]['coordinate']-unique[end-1]['coordinate']-median)<median*.3:
                    run.append(unique[end]); end+=1
                lo=max(f['start'] for f in run); hi=min(f['end'] for f in run)
                low=run[0]['coordinate']-median*.45; high=run[-1]['coordinate']+median*.45
                bbox=[lo,low,hi,high] if axis==0 else [low,lo,high,hi]
                if not any(np.linalg.norm(np.array(bbox)-np.array(old))<size*.02 for old in found): found.append(bbox)
    return found


def measure_band(w, ink, edges, size):
    """Measure normal profiles for solid lines, including diagonal candidates."""
    a, b = points(w)
    if w.get('source') in AUTHORED:
        return w
    u = (b-a)/np.linalg.norm(b-a); n = np.array([-u[1], u[0]])
    if (w.get('geometry_evidence') == 'paired_boundaries' and w.get('band_style') != 'solid') or w.get('outline_faces'):
        w['geometry_evidence'] = 'paired_boundaries'
        return w
    radius = max(3, round(size*.025))
    offsets = np.arange(-radius, radius+1)
    centers, widths = [], []
    for p in np.linspace(a, b, 19)[2:-2]:
        profile = sample(ink, p+offsets[:, None]*n) > .5
        nearby = np.flatnonzero(profile & (abs(offsets) <= max(1, size*.001)))
        if not len(nearby):
            continue
        seed = min(nearby, key=lambda j: abs(offsets[j])); lo = hi = seed
        while lo > 0 and profile[lo-1]: lo -= 1
        while hi+1 < len(profile) and profile[hi+1]: hi += 1
        if lo == 0 or hi == len(profile)-1:
            continue
        centers.append((offsets[lo]+offsets[hi])/2); widths.append(hi-lo+1)
    if len(widths) >= 7:
        shift = float(np.median(centers)); width = float(np.median(widths))
        consistency = float(np.mean(abs(np.array(widths)-width) <= max(1, width*.3)))
        if consistency >= .65:
            w.update(start=point(a+n*shift), end=point(b+n*shift), thickness_px=width,
                     thickness_consistency=round(consistency, 3), geometry_evidence='solid_profile')
    return w


def canonicalize_raster_axis(w):
    """Remove subpixel line-fit tilt only; keep genuinely diagonal walls."""
    if w.get('source') in AUTHORED: return w
    a,b=points(w); delta=b-a
    # A drift under half a raster pixel is fitting noise, not a design angle.
    if abs(delta[1])<.5:
        a[1]=b[1]=(a[1]+b[1])/2
    elif abs(delta[0])<.5:
        a[0]=b[0]=(a[0]+b[0])/2
    return {**w,'start':point(a),'end':point(b)}


def split_openings(w, openings, size):
    """Cut narrow, aligned symbol boxes. Square swing boxes are not wall cuts."""
    if w.get('source') in AUTHORED:
        return [w]
    a, b = points(w); length = np.linalg.norm(b-a); u = (b-a)/length
    n = np.array([-u[1], u[0]]); width = float(w.get('thickness_px') or 1)
    cuts = []
    for obj in openings:
        box = obj.get('bbox', {})
        if not all(k in box for k in ('x1', 'y1', 'x2', 'y2')):
            continue
        x1, y1, x2, y2 = [box[k] for k in ('x1', 'y1', 'x2', 'y2')]
        corners = np.array([[x1,y1], [x2,y1], [x2,y2], [x1,y2]], float)
        along, normal = (corners-a)@u, (corners-a)@n
        if np.ptp(along) < np.ptp(normal)*2 or np.ptp(normal) > max(width*3, size*.015):
            continue
        if abs(float(np.mean(normal))) > width*.6+size*.001:
            continue
        lo, hi = max(0., float(min(along))), min(length, float(max(along)))
        if hi > lo:
            cuts.append((lo, hi))
    intervals = [(0., length)]
    for lo, hi in sorted(cuts):
        intervals = [(s,e) for start,end in intervals for s,e in
                     ((start,min(end,lo)), (max(start,hi),end)) if e-s > max(1, size*.001)]
    return [{**w, 'start': point(a+u*lo), 'end': point(a+u*hi),
             **({'opening_split': True} if cuts else {})} for lo,hi in intervals]


def repair_junctions(walls, ink, edge, openings, size):
    """Small L/T endpoint repairs supported by a band, never room closure."""
    result=deepcopy(walls)
    if not walls: return result
    starts=np.array([points(w)[0] for w in walls]); ends=np.array([points(w)[1] for w in walls])
    vectors=ends-starts; lengths=np.linalg.norm(vectors,axis=1); directions=vectors/lengths[:,None]
    for i,w in enumerate(walls):
        if w.get('source') in AUTHORED: continue
        a,b=points(w); length=np.linalg.norm(b-a); u=(b-a)/length
        width=float(w.get('thickness_px') or 1); normal=np.array([-u[1],u[0]])
        limit=min(length*.12,max(size*.001,width*.7))
        # Vectorized line intersections; only pixel-check geometrically local
        # candidates. Avoid a Python matrix solve for every pair of proposals.
        det=u[0]*directions[:,1]-u[1]*directions[:,0]
        valid=(abs(det)>=.3) & (lengths>=max(width*3,length*.1))
        safe=np.where(valid,det,1.)
        delta=starts-a
        t=(delta[:,0]*directions[:,1]-delta[:,1]*directions[:,0])/safe
        s=(delta[:,0]*u[1]-delta[:,1]*u[0])/safe
        intersections=a+t[:,None]*u
        for name,p in (('start',a),('end',b)):
            choices=[]
            distances=np.linalg.norm(intersections-p,axis=1)
            for j in np.flatnonzero(valid & (distances>0) & (distances<=limit) & (s>=0) & (s<=lengths)):
                q=intersections[j]; distance=distances[j]
                path=np.linspace(p,q,12)
                if any(box_fraction(path,o['bbox'])>0 for o in openings if o.get('bbox')): continue
                filled=float(sample(ink,path).mean())
                faces=min(float(sample(edge,path+sign*normal*width/2).mean()) for sign in (-1,1))
                if max(filled,faces)<.75: continue
                choices.append((distance,q))
            if choices:
                q=min(choices,key=lambda x:x[0])[1]
                result[i][name]=point(q)
                result[i]['junction_repaired']=True
    return result


def assess_walls(image, proposals, measurements=None, objects=None, doors=None, config=None):
    """Return accepted/review/rejected candidates with explicit supporting evidence."""
    cfg = config or WallEvidenceConfig(); size = max(image.shape[:2])
    _, edge, ink = masks(image)
    tolerance=max(1,round(size*.0007))
    near = cv2.dilate(edge, np.ones((2*tolerance+1,2*tolerance+1), np.uint8))
    candidates = [canonicalize_raster_axis(measure_band(deepcopy(w), ink, edge, size)) for w in proposals]
    # A spurious pair between the page rule and a real outer wall must not
    # suppress that real wall as a duplicate face before it is reviewed.
    def near_page(w):
        a,b=points(w); border=size*.012
        return (max(a[0],b[0])<border or max(a[1],b[1])<border
                or min(a[0],b[0])>image.shape[1]-border
                or min(a[1],b[1])>image.shape[0]-border)
    candidates = deduplicate([w for w in candidates if not near_page(w)],size) + deduplicate([w for w in candidates if near_page(w)],size)
    widths = [w['thickness_px'] for w in candidates if w.get('thickness_px', 0) >= size*.002
              and np.linalg.norm(points(w)[1]-points(w)[0]) > size*.12]
    reference = float(np.median(widths)) if widths else max(2., size*.005)
    objects = objects or []; measurements = measurements or {}
    labelled_furniture = labelled_furniture_regions(image, measurements)
    from plan_measurements import plausible_text_regions
    text_regions=plausible_text_regions(measurements.get('ocr_text_regions',[]),image.shape)
    openings=list(doors or [])+[o for o in objects if 'window' in str(o.get('class','')).lower()]
    candidates=repair_junctions(candidates,ink,near,openings,size)
    starts=np.array([points(w)[0] for w in candidates]).reshape(-1,2)
    ends=np.array([points(w)[1] for w in candidates]).reshape(-1,2)
    vectors=ends-starts; lengths=np.linalg.norm(vectors,axis=1)
    directions=vectors/np.maximum(lengths[:,None],1e-6)
    all_widths=np.array([float(w.get('thickness_px') or 1) for w in candidates])
    # Local letter corners give each other two "junctions". They must not be
    # mistaken for a building merely because OCR missed a large coloured title.
    # Propagate structural support through connected line components first.
    adjacency=np.eye(len(candidates),dtype=bool)
    for i in range(len(candidates)):
        for end in (starts[i],ends[i]):
            t=np.clip(np.sum((end-starts)*vectors,axis=1)/np.maximum(lengths**2,1e-6),0,1)
            close=np.linalg.norm(end-(starts+t[:,None]*vectors),axis=1)<=np.maximum(all_widths[i],all_widths)*.75+size*.002
            adjacency[i]|=close
    adjacency|=adjacency.T.copy()
    anchored=lengths>size*.12
    anchored|=np.array([w.get('source') in AUTHORED for w in candidates],dtype=bool)
    if anchored.any():
        while True:
            grown=anchored | np.any(adjacency[:,anchored],axis=1)
            if np.array_equal(grown,anchored):break
            anchored=grown
    else:
        anchored[:]=True  # A tightly cropped detail has no whole-plan context.
    # Repeated treads are evidence of a non-wall pattern even if OCR/model misses
    # the staircase. Keep these as uncertain, not as invented staircase objects.
    runs = repeated_line_regions(image)
    accepted, review, rejected = [], [], []
    for candidate_index,w in enumerate(candidates):
        a,b = points(w); length = np.linalg.norm(b-a); u=(b-a)/length
        n=np.array([-u[1],u[0]]); samples=np.linspace(a,b,61)
        width=float(w.get('thickness_px') or 1)
        support=float(sample(ink,samples).mean())
        boundary=min(float(sample(near,samples+sign*n*width/2).mean()) for sign in (-1,1))
        paired=w.get('geometry_evidence')=='paired_boundaries'
        evidence=boundary if paired else support
        junctions=0; structural_junctions=0
        for end in (a,b):
            t=np.clip(np.sum((end-starts)*vectors,axis=1)/np.maximum(lengths**2,1e-6),0,1)
            distances=np.linalg.norm(end-(starts+t[:,None]*vectors),axis=1)
            if np.any((abs(u[0]*directions[:,1]-u[1]*directions[:,0])>=.25)
                      & (distances<=np.maximum(width,all_widths)*.75+size*.002)):
                junctions+=1
            if np.any((abs(u[0]*directions[:,1]-u[1]*directions[:,0])>=.25)
                      & (distances<=np.maximum(width,all_widths)*.75+size*.002)
                      & (lengths>size*.04) & (all_widths>=reference*.55)):
                structural_junctions+=1
        # T-junctions may fall in the middle of a thin partition, not at one
        # of its fitted endpoints (e.g. a balcony return crossing a facade).
        normal_cross=u[0]*directions[:,1]-u[1]*directions[:,0]
        delta=starts-a
        valid_cross=abs(normal_cross)>.5
        denom=np.where(valid_cross,normal_cross,1.)
        along_candidate=(delta[:,0]*directions[:,1]-delta[:,1]*directions[:,0])/denom
        along_host=(delta[:,0]*u[1]-delta[:,1]*u[0])/denom
        if np.any(valid_cross & (along_candidate>=0) & (along_candidate<=length)
                  & (along_host>=-all_widths*.75) & (along_host<=lengths+all_widths*.75)
                  & (lengths>size*.04) & (all_widths>=reference*.55)):
            structural_junctions+=1
        reasons=[]
        if not anchored[candidate_index] and length<size*.07:
            reasons.append('detached_symbol_component')
        text_overlap=max([box_fraction(samples,box) for box in text_regions] or [0])
        score=.38*evidence+.18*min(1.,length/(size*cfg.long_wall_ratio))+.16*min(1.,junctions/2)+.16*min(1.,width/reference)+(.12 if paired else .06)
        if evidence < .6: reasons.append('weak_pixel_evidence'); score-=.25
        if text_overlap>.35 and length<size*.15:
            reasons.append('text_overlap'); score-=.6
        for dimension in measurements.get('linear',[]):
            rule=dimension.get('reference')
            if not rule or not all(k in rule for k in ('start','end')): continue
            c,d=points(rule); v=d-c; vl=np.linalg.norm(v)
            if vl<1: continue
            if abs(cross(u,v/vl))>.95 and length<size*.045:
                if min(np.linalg.norm(p-q) for p in (a,b) for q in (c,d))<max(width*2,size*.015):
                    reasons.append('possible_dimension_extension'); score-=.4
            if abs(cross(u,v/vl))>.05: continue
            normal=np.array([-v[1],v[0]])/vl
            along=(samples-c)@(v/vl)
            distances=np.min([abs((samples+offset*n-c)@normal) for offset in (-width/2,0,width/2)],axis=0)
            if np.mean((distances<max(size*.001,1.5,float(rule.get('stroke_width_px',1))*2)) & (along>=0) & (along<=vl))>.6:
                reasons.append('dimension_rule_overlap'); score-=.6; break
        diagonal=abs(u[0])>.15 and abs(u[1])>.15
        if (support < .65 or width<reference*.5) and any(
                box_fraction(samples,r,margin=min(r[2]-r[0],r[3]-r[1])*(.5 if diagonal else .04))>.7 for r in runs):
            reasons.append('repeated_tread_or_slat_pattern'); score-=.45
        if any(door_leaf_overlap(samples,width,o,size) for o in doors or []):
            reasons.append('door_swing_region'); score-=.3
        # Contour extraction often returns the inner edge of a double-stroked
        # mattress. Include that narrow rim, not the neighbouring room wall.
        if any(box_fraction(samples,box,margin=min(size*.006,min(box[2]-box[0],box[3]-box[1])*.04))>.85 for box in labelled_furniture):
            reasons.append('furniture_overlap'); score-=.32
        for obj in objects:
            cls=str(obj.get('class','')).lower().replace('-',' ')
            if not obj.get('bbox'): continue
            if not any(token in cls for token in ('chair','table','commode','cabinet','fridge','slab','sink','sofa','stove','wardrobe','counter','machine','crockery')) and cls not in ('bed','tv','duct'):
                continue
            if float(obj.get('confidence',0))<.3: continue
            box=obj['bbox']; furniture_margin=max(size*.012,min(box['x2']-box['x1'],box['y2']-box['y1'])*.12)
            if box_fraction(samples,box,margin=furniture_margin)>.85:
                # Object labels are fallible. Flag rather than erase structure.
                reasons.append('furniture_overlap'); score-=.32; break
        if junctions==0 and length<size*.15:
            reasons.append('isolated_segment'); score-=.12
        anchored_partition=structural_junctions>0 and evidence>.85 and length>max(size*.035,width*8)
        if not paired and width<reference*.5 and (junctions<2 or length<size*.08) and not anchored_partition:
            reasons.append('unverified_thin_stroke'); score-=.2
        # Furniture corners support one another too. Two fitted ink edges and
        # local junctions alone do not establish a short, very thin partition.
        if paired and width<reference*.55 and length<size*.09 and not anchored_partition:
            reasons.append('unverified_thin_stroke'); score-=.2
        # Pairing a mattress/cabinet edge with its surrounding frame creates a
        # short, anomalously wide hollow "wall". Require structural support at
        # both ends before accepting that competing interpretation.
        if paired and width>reference*1.5 and length<size*.1 and structural_junctions<2:
            reasons.append('short_wide_outline'); score-=.25
        border=size*.012
        if min(a[0],b[0])<border and max(a[0],b[0])<border or min(a[1],b[1])<border and max(a[1],b[1])<border or min(a[0],b[0])>image.shape[1]-border or min(a[1],b[1])>image.shape[0]-border:
            reasons.append('possible_page_border'); score-=.35
        if w.get('source') in AUTHORED:
            status='authored'
        elif 'text_overlap' in reasons or 'dimension_rule_overlap' in reasons:
            status='rejected'
        elif score>=cfg.min_accepted_score and not any(r in reasons for r in ('furniture_overlap','repeated_tread_or_slat_pattern','possible_page_border','isolated_segment','unverified_thin_stroke','possible_dimension_extension','door_swing_region','short_wide_outline','detached_symbol_component')):
            status='accepted'
        else:
            status='uncertain'
        w.update(review_status=status, review_reasons=reasons,
                 evidence_score=round(float(np.clip(score,0,1)),3),
                 score_kind='heuristic_not_probability', pixel_support=round(support,3),
                 boundary_support=round(boundary,3), junction_count=junctions,
                 thickness_px=width, thickness_source='paired_faces' if paired else 'normal_profile' if w.get('geometry_evidence')=='solid_profile' else 'unverified_estimate')
        destination=rejected if status=='rejected' else review if status=='uncertain' else accepted
        destination.extend(split_openings(w,openings,size))
    used_ids={str(w['id']) for w in accepted if w.get('source') in AUTHORED and w.get('id') is not None}
    for prefix, group in (('W',accepted),('R',review),('X',rejected)):
        for i,w in enumerate(group,1):
            a,b=points(w); n=np.array([-(b-a)[1],(b-a)[0]])/np.linalg.norm(b-a)
            half=w['thickness_px']/2
            identifier=w.get('id') if w.get('source') in AUTHORED else None
            if identifier is None:
                while f'{prefix}{i}' in used_ids: i+=1
                identifier=f'{prefix}{i}'; used_ids.add(identifier)
            w.update(id=identifier, geometry_reference='centreline',
                     boundary_reference='estimated_parallel_faces',
                     boundary_polygon=[point(p) for p in (a+n*half,b+n*half,b-n*half,a-n*half)])
    return {'walls':accepted,'wall_review':review,'wall_rejected':rejected,
            'wall_geometry':{'coordinate_space':'original_image_pixels','width':image.shape[1],'height':image.shape[0],
                             'resize_transform':{'scale_x':1.,'scale_y':1.,'offset_x':0.,'offset_y':0.},
                             'reference_thickness_px':reference,'parameters':asdict(cfg)}}
