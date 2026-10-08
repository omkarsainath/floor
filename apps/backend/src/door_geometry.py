"""Fuse repeated opening detections without guessing adjacent double doors."""
from copy import deepcopy
import math


def _bounds(door):
    try:
        b = tuple(float(door['bbox'][k]) for k in ('x1', 'y1', 'x2', 'y2'))
        return b if all(math.isfinite(v) for v in b) and b[2] > b[0] and b[3] > b[1] else None
    except (KeyError, TypeError, ValueError):
        return None


def same_opening(first, second):
    """Match repeated boxes, or a narrow wall cut and its adjacent swing square.

    Centre distance alone is unsafe: two different doors can be close together.
    A swing box must match the opening's span and meet its wall-facing edge.
    """
    a, b = _bounds(first), _bounds(second)
    if a is None or b is None:
        return False
    aw, ah, bw, bh = a[2]-a[0], a[3]-a[1], b[2]-b[0], b[3]-b[1]
    intersection = max(0, min(a[2], b[2])-max(a[0], b[0])) * max(0, min(a[3], b[3])-max(a[1], b[1]))
    if intersection / (aw*ah + bw*bh - intersection) >= .45:
        return True
    # Only compare different representations. Two adjacent slender opening
    # boxes are separate doors regardless of their gap or matching size.
    for opening, swing in ((a, b), (b, a)):
        widths = (opening[2]-opening[0], opening[3]-opening[1])
        axis = 0 if widths[0] >= widths[1] else 1
        length, depth = widths[axis], widths[1-axis]
        sw = (swing[2]-swing[0], swing[3]-swing[1])
        if length < depth*2.5 or not .65 <= sw[0]/sw[1] <= 1.55:
            continue
        overlap = max(0, min(opening[axis+2], swing[axis+2])-max(opening[axis], swing[axis]))
        if overlap / max(length, sw[axis]) < .8:
            continue
        normal = 1-axis
        centre = (opening[normal]+opening[normal+2])/2
        edge_distance = min(abs(swing[normal]-centre), abs(swing[normal+2]-centre))
        if edge_distance <= depth*.75 + 2:
            return True
    return False


def deduplicate_doors(doors):
    """Prefer authored geometry, then a wall opening over its swing footprint."""
    def priority(door):
        bounds = _bounds(door)
        if not bounds:
            return (3, 1, 0)
        w, h = bounds[2]-bounds[0], bounds[3]-bounds[1]
        source = str(door.get('source', '')).lower()
        authored = {'manual': 0, 'corrected': 1}.get(source, 2)
        confidence = door.get('confidence', 0)
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            confidence = 0
        return (authored, 0 if max(w, h) >= min(w, h)*2.5 else 1, -confidence)

    result = []
    for door in sorted((deepcopy(d) for d in doors or [] if isinstance(d, dict)), key=priority):
        existing = next((d for d in result if same_opening(d, door)), None)
        if existing is None:
            result.append(door)
            continue
        bounds, other_bounds = _bounds(existing), _bounds(door)
        if bounds and other_bounds:
            width, height = bounds[2]-bounds[0], bounds[3]-bounds[1]
            other_width, other_height = other_bounds[2]-other_bounds[0], other_bounds[3]-other_bounds[1]
            if max(width, height) >= min(width, height)*2.5 and .65 <= other_width/other_height <= 1.55:
                # Swing inference needs the arc pixels, not the narrow wall cut.
                existing.setdefault('swing_bbox', deepcopy(door['bbox']))
        # Retain explicit annotations. Never infer a double door from overlap.
        for key in ('class', 'confidence', 'double', 'swingDir', 'swing_dir'):
            if key not in existing and key in door:
                existing[key] = door[key]
    return result
