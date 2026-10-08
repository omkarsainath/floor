"""Conservative wall proposal cleanup in original-image pixels.

Nearby lines are not necessarily the same wall. Offset proposals may merge only
when the image contains a continuous dark wall band between them. Open intervals
are never filled during merging. Endpoint repair uses intersections, not centroids.
"""
from copy import deepcopy
import math

import cv2
import numpy as np


AUTHORED = {"manual", "corrected", "seed"}


def exclude_object_interior_walls(walls, objects):
    """Remove automatic line detections contained inside verified stair footprints.

    Furniture models are not reliable enough to decide structural geometry: a
    false/oversized bed or cabinet box can overlap and erase a real partition.
    Stair treads are the one intentional repeated-line case handled here. Real
    boundary walls lie at the box edge, so the inset preserves them.
    """
    footprints = []
    for obj in objects or []:
        cls = str(obj.get("class") or "").lower().replace("_", " ").replace("-", " ")
        if "stair" not in cls:
            continue
        bbox = obj.get("bbox")
        if not isinstance(bbox, dict):
            continue
        try:
            x1, y1, x2, y2 = (float(bbox[k]) for k in ("x1", "y1", "x2", "y2"))
        except (KeyError, TypeError, ValueError):
            continue
        width, height = x2 - x1, y2 - y1
        if width <= 8 or height <= 8:
            continue
        inset = max(3.0, min(width, height) * 0.035)
        if x1 + inset < x2 - inset and y1 + inset < y2 - inset:
            footprints.append((x1 + inset, y1 + inset, x2 - inset, y2 - inset))

    kept = []
    for wall in walls or []:
        if wall.get("source") in AUTHORED:
            kept.append(wall)
            continue
        try:
            a, b = _points(wall)
        except (KeyError, TypeError, ValueError):
            kept.append(wall)
            continue
        samples = np.linspace(a, b, 17)
        inside_object = any(
            np.mean((samples[:, 0] > x1) & (samples[:, 0] < x2) &
                    (samples[:, 1] > y1) & (samples[:, 1] < y2)) >= 0.80
            for x1, y1, x2, y2 in footprints
        )
        if not inside_object:
            kept.append(wall)
    return kept


def wall_mask(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    return cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]


def _points(wall):
    return tuple(np.array([wall[k]["x"], wall[k]["y"]], dtype=float) for k in ("start", "end"))


def _set_points(wall, a, b):
    result = deepcopy(wall)
    if tuple(a) > tuple(b):
        a, b = b, a
    result["start"], result["end"] = (
        {"x": round(float(p[0]), 4), "y": round(float(p[1]), 4)} for p in (a, b)
    )
    return result


def _support(mask, a, b):
    count = max(5, min(100, int(np.linalg.norm(b - a)) + 1))
    pts = np.rint(np.linspace(a, b, count)).astype(int)
    valid = (pts[:, 0] >= 0) & (pts[:, 0] < mask.shape[1]) & (pts[:, 1] >= 0) & (pts[:, 1] < mask.shape[0])
    hits = np.zeros(count, dtype=bool)
    hits[valid] = mask[pts[valid, 1], pts[valid, 0]] > 0
    return float(hits.mean())


def _outline(wall):
    """Validated face coordinates; a white centre is valid only for a paired band."""
    faces = wall.get('outline_faces')
    if not isinstance(faces, dict) or faces.get('axis') not in ('x', 'y'):
        return None
    try:
        axis = 0 if faces['axis'] == 'x' else 1
        low, high = float(faces['low']), float(faces['high'])
        a, b = _points(wall)
        if not np.isfinite([low, high]).all() or high <= low:
            return None
        if max(abs(a[1-axis] - (low+high)/2), abs(b[1-axis] - (low+high)/2)) > 1.5:
            return None
        return axis, low, high
    except (KeyError, TypeError, ValueError):
        return None


def _outline_support(wall, mask):
    axis, low, high = _outline(wall)
    a, b = _points(wall)
    supports = []
    for face in (low, high):
        # The centre of a two-pixel antialiased stroke can fall between pixels.
        scores = []
        for offset in (-1, 0, 1):
            c, d = a.copy(), b.copy()
            c[1-axis] = d[1-axis] = face + offset
            scores.append(_support(mask, c, d))
        supports.append(max(scores))
    return min(supports)


def supported_proposals(walls, image, minimum=0.65):
    """Reject bounding-box centrelines that run mostly through empty pixels."""
    mask = wall_mask(image)
    result = []
    for wall in walls:
        support = _outline_support(wall, mask) if _outline(wall) else _support(mask, *_points(wall))
        if support >= minimum:
            result.append({**wall, "pixel_support": round(support, 3)})
    return result


def _center_on_band(wall, mask):
    """Locate the median filled-wall centre, without crossing a white channel."""
    if wall.get("source") in AUTHORED or _outline(wall):
        return wall
    a, b = _points(wall)
    delta = b - a
    axis = 0 if abs(delta[1]) < 0.01 else 1 if abs(delta[0]) < 0.01 else None
    if axis is None:
        return wall
    normal = 1 - axis
    centres, widths = [], []
    for t in np.linspace(0.15, 0.85, 17):
        p = np.rint(a + t * delta).astype(int)
        along, coord = p[axis], p[normal]
        if not (0 <= along < mask.shape[1 - axis]):
            continue
        profile = mask[:, along] if axis == 0 else mask[along, :]
        # Allow antialiased edge proposals just outside a dark band, not a jump
        # across a corridor to the nearest unrelated wall.
        near = [c for c in range(max(0, coord - 2), min(len(profile), coord + 3)) if profile[c]]
        if not near:
            continue
        seed = min(near, key=lambda c: (abs(c - coord), c))
        lo = hi = seed
        while lo > 0 and profile[lo - 1] and seed - lo < 64:
            lo -= 1
        while hi + 1 < len(profile) and profile[hi + 1] and hi - seed < 64:
            hi += 1
        if hi - lo + 1 > 64:
            continue
        centres.append((lo + hi) / 2)
        widths.append(hi - lo + 1)
    if len(centres) < 11:
        return wall
    center = float(np.median(centres))
    if np.mean(np.abs(np.array(centres) - center) <= 2) < 0.75:
        return wall
    a[normal] = b[normal] = center
    result = _set_points(wall, a, b)
    result["thickness_px"] = float(np.median(widths))
    result["pixel_support"] = round(_support(mask, a, b), 3)
    return result


def _same_band(first, second, mask, max_sep):
    a, b = _points(first)
    c, d = _points(second)
    u = (b - a) / np.linalg.norm(b - a)
    v = (d - c) / np.linalg.norm(d - c)
    if abs(float(u[0] * v[1] - u[1] * v[0])) > 0.005:
        return None
    n = np.array([-u[1], u[0]])
    offsets = [float(np.dot(p - a, n)) for p in (c, d)]
    sep = max(abs(x) for x in offsets)
    if sep > max_sep:
        return None
    end = float(np.linalg.norm(b - a))
    lo, hi = sorted(float(np.dot(p - a, u)) for p in (c, d))
    overlap_lo, overlap_hi = max(0, lo), min(end, hi)
    if overlap_hi < overlap_lo - 1e-6:
        return None  # Never bridge a doorway or other unsupported gap.
    first_outline, second_outline = _outline(first), _outline(second)
    if first_outline and second_outline:
        if first_outline[0] != second_outline[0] or max(abs(first_outline[n] - second_outline[n]) for n in (1, 2)) > 1.5:
            return None
    elif first_outline or second_outline:
        outlined = first if first_outline else second
        plain = second if first_outline else first
        _, low, high = first_outline or second_outline
        # Discard a thin detector's duplicate face of this same outlined band.
        # User-authored centre lines also take priority within its envelope.
        if sep > (high-low)/2 + 1.5 or (plain.get('source') not in AUTHORED and
                plain.get('thickness_px', math.inf) > max(4, outlined['outline_faces'].get('stroke_px', 1)*2)):
            return None
    elif sep > 0.25:
        if mask is None or overlap_hi - overlap_lo < 3:
            return None
        # Every cross-band offset must have longitudinal support: two dark
        # parallel walls separated by white space must remain separate.
        for offset in np.linspace(0, sum(offsets) / 2, max(3, math.ceil(sep) + 1)):
            if _support(mask, a + u * overlap_lo + n * offset,
                        a + u * overlap_hi + n * offset) < 0.7:
                return None
    return a, u, min(0, lo), max(end, hi)


def consolidate_walls(walls, image=None, max_sep=18, snap_dist=0):
    """Return new wall dictionaries; retain metadata and all unmatched lengths.

    User-authored walls have priority and stay fixed. Auto proposals overlapping
    them are clipped to the remaining intervals, rather than moving the user wall.
    """
    mask = wall_mask(image) if image is not None else None
    clean = []
    for wall in walls:
        try:
            a, b = _points(wall)
            if not np.isfinite([a, b]).all() or np.linalg.norm(b - a) < 0.5:
                continue
        except (KeyError, TypeError, ValueError):
            continue
        item = _set_points(wall, a, b)
        clean.append(_center_on_band(item, mask) if mask is not None else item)
    def sort_key(w):
        return ({"manual": 0, "corrected": 1, "seed": 2}.get(w.get("source"), 3 if _outline(w) else 4),
                tuple(_points(w)[0]), tuple(_points(w)[1]))
    clean.sort(key=sort_key)
    result = []
    for wall in clean:
        pending = [wall]
        for i, existing in enumerate(result):
            remaining = []
            for candidate in pending:
                match = _same_band(existing, candidate, mask, max_sep)
                if match is None:
                    remaining.append(candidate)
                    continue
                a, u, lo, hi = match
                length = np.linalg.norm(_points(existing)[1] - a)
                if existing.get("source") in AUTHORED:
                    c, d = _points(candidate)
                    v = (d - c) / np.linalg.norm(d - c)
                    def on_candidate(t):
                        return c + v * ((t - np.dot(c - a, u)) / np.dot(v, u))
                    if lo < -0.5:
                        remaining.append(_set_points(candidate, on_candidate(lo), on_candidate(0)))
                    if hi > length + 0.5:
                        remaining.append(_set_points(candidate, on_candidate(length), on_candidate(hi)))
                else:
                    existing = _set_points(existing, a + lo * u, a + hi * u)
                    if "confidence" in candidate:
                        existing["confidence"] = max(existing.get("confidence", 0), candidate["confidence"])
                    result[i] = existing
            pending = remaining
            if not pending:
                break
        result.extend(pending)
    # A long proposal can connect two previous overlapping fragments. A second
    # pass is necessary until no count reduction occurs (never fills a gap).
    if len(result) < len(clean):
        result = consolidate_walls(result, image=image, max_sep=max_sep)
    result.sort(key=sort_key)
    return snap_wall_endpoints(result, snap_dist, image) if snap_dist > 0 else result


def snap_wall_endpoints(walls, snap_dist=10, image=None, preserve_authored=True):
    """Extend/trim endpoints along their own line to nearby L/T intersections.

    Use original geometry for every candidate. No transitive clustering, no
    parallel-wall attraction, and never shorten a wall by more than half overall.
    """
    result = deepcopy(walls)
    mask = wall_mask(image) if image is not None else None
    for i, wall in enumerate(walls):
        if preserve_authored and wall.get("source") in AUTHORED:
            continue
        a, b = _points(wall)
        length = np.linalg.norm(b - a)
        if length < 0.5:
            continue
        u = (b - a) / length
        limit = min(snap_dist, length * 0.25)
        for name, point in (("start", a), ("end", b)):
            candidates = []
            for j, other in enumerate(walls):
                if i == j:
                    continue
                c, d = _points(other)
                other_length = np.linalg.norm(d - c)
                if other_length < 0.5:
                    continue
                v = (d - c) / other_length
                matrix = np.column_stack((u, -v))
                if abs(np.linalg.det(matrix)) < 0.25:
                    continue
                t, s = np.linalg.solve(matrix, c - a)
                other_limit = min(snap_dist, other_length * 0.25)
                if not -other_limit <= s <= other_length + other_limit:
                    continue
                intersection = a + t * u
                distance = np.linalg.norm(intersection - point)
                if distance > limit or distance < 1e-5:
                    continue
                if mask is not None and _support(mask, point, intersection) < 0.6:
                    continue
                candidates.append((distance, float(intersection[0]), float(intersection[1])))
            if candidates:
                _, x, y = min(candidates)
                result[i][name] = {"x": round(x, 4), "y": round(y, 4)}
    return result
