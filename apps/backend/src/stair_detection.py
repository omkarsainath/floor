"""Conservative floor-plan stair detection using UP/DN labels and tread lines.

The object detector is the primary source.  This fallback targets a common plan
notation that object models often miss: a small UP/DN label inside a run of
regular, parallel stair treads.
"""

import re

import cv2
import numpy as np


def _words(image):
    try:
        import pytesseract
        data = pytesseract.image_to_data(
            image, config="--psm 11", output_type=pytesseract.Output.DICT
        )
    except Exception:
        return []
    words = []
    for index, raw in enumerate(data.get("text", [])):
        text = re.sub(r"[^A-Z]", "", str(raw).upper())
        if text not in {"UP", "DN", "DOWN"}:
            continue
        try:
            confidence = float(data.get("conf", [0])[index])
            x, y = int(data["left"][index]), int(data["top"][index])
            w, h = int(data["width"][index]), int(data["height"][index])
        except (KeyError, TypeError, ValueError, IndexError):
            continue
        if confidence >= 25 and w > 0 and h > 0:
            words.append((x, y, w, h, confidence))
    return words


def _tread_bbox(gray, label, image_shape):
    """Return a tread envelope around an OCR label, or None when ambiguous."""
    image_h, image_w = image_shape[:2]
    lx, ly, lw, lh, ocr_conf = label
    cx, cy = lx + lw / 2, ly + lh / 2
    # Stairs are usually much longer than their UP/DN label.  Keep the search
    # local enough that a label cannot claim an unrelated room across the plan.
    rx = max(45, int(image_w * 0.075))
    ry = max(80, int(image_h * 0.14))
    x0, x1 = max(0, int(cx - rx)), min(image_w, int(cx + rx))
    y0, y1 = max(0, int(cy - ry)), min(image_h, int(cy + ry))
    roi = gray[y0:y1, x0:x1]
    if roi.size == 0:
        return None

    edges = cv2.Canny(cv2.GaussianBlur(roi, (3, 3), 0), 45, 140)
    minimum = max(12, int(min(roi.shape[:2]) * 0.16))
    raw = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=18,
                          minLineLength=minimum, maxLineGap=5)
    if raw is None:
        return None

    horizontal, vertical = [], []
    for x2a, y2a, x2b, y2b in raw[:, 0]:
        dx, dy = abs(x2b - x2a), abs(y2b - y2a)
        if dx >= max(minimum, dy * 4):
            horizontal.append((min(x2a, x2b), (y2a + y2b) / 2, max(x2a, x2b)))
        elif dy >= max(minimum, dx * 4):
            vertical.append((min(y2a, y2b), (x2a + x2b) / 2, max(y2a, y2b)))

    def envelope(lines, horizontal_run):
        if len(lines) < 4:
            return None
        # Merge double edges belonging to the same printed tread.
        positions = sorted(line[1] for line in lines)
        unique = []
        for position in positions:
            if not unique or position - unique[-1] >= 3:
                unique.append(position)
        if len(unique) < 4:
            return None
        gaps = np.diff(unique)
        regular = gaps[(gaps >= 3) & (gaps <= max(28, np.median(gaps) * 2.4))]
        if len(regular) < 3:
            return None
        starts, ends = [line[0] for line in lines], [line[2] for line in lines]
        overlap_start, overlap_end = np.percentile(starts, 65), np.percentile(ends, 35)
        if overlap_end - overlap_start < minimum * 0.65:
            return None
        pad = max(4, int(np.median(regular)))
        if horizontal_run:
            return (overlap_start, unique[0] - pad, overlap_end, unique[-1] + pad, len(unique))
        return (unique[0] - pad, overlap_start, unique[-1] + pad, overlap_end, len(unique))

    choices = [candidate for candidate in (
        envelope(horizontal, True), envelope(vertical, False)
    ) if candidate]
    if not choices:
        return None
    bx1, by1, bx2, by2, count = max(choices, key=lambda item: item[4])
    bx1, by1, bx2, by2 = bx1 + x0, by1 + y0, bx2 + x0, by2 + y0
    # The label must be inside, or immediately adjacent to, the tread envelope.
    margin = max(18, min(bx2 - bx1, by2 - by1) * 0.7)
    if not (bx1 - margin <= cx <= bx2 + margin and by1 - margin <= cy <= by2 + margin):
        return None
    confidence = min(0.88, 0.48 + count * 0.035 + max(0, ocr_conf) / 1000)
    return {
        "class": "stairs",
        "confidence": round(float(confidence), 3),
        "bbox": {"x1": round(float(max(0, bx1)), 1), "y1": round(float(max(0, by1)), 1),
                 "x2": round(float(min(image_w, bx2)), 1), "y2": round(float(min(image_h, by2)), 1)},
        "source": "ocr-tread-fallback",
    }


def detect_stairs(image):
    """Detect labeled stair runs without inventing stairs from repeated furniture lines."""
    if image is None or not getattr(image, "size", 0):
        return []
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    found = []
    for label in _words(image):
        candidate = _tread_bbox(gray, label, image.shape)
        if candidate and not any(_iou(candidate["bbox"], old["bbox"]) >= 0.35 for old in found):
            found.append(candidate)
    return found


def detect_stairs_from_walls(walls, image_shape, minimum_treads=7):
    """Find an unlabeled staircase represented by repeated wall candidates."""
    image_h, image_w = image_shape[:2]
    axes = {"h": [], "v": []}
    for wall in walls or []:
        try:
            x1, y1 = float(wall["start"]["x"]), float(wall["start"]["y"])
            x2, y2 = float(wall["end"]["x"]), float(wall["end"]["y"])
        except (KeyError, TypeError, ValueError):
            continue
        dx, dy = abs(x2 - x1), abs(y2 - y1)
        if dx >= max(18, dy * 5):
            axes["h"].append((min(x1, x2), (y1 + y2) / 2, max(x1, x2)))
        elif dy >= max(18, dx * 5):
            axes["v"].append((min(y1, y2), (x1 + x2) / 2, max(y1, y2)))

    found = []
    for axis, candidates in axes.items():
        for anchor in candidates:
            anchor_length = anchor[2] - anchor[0]
            family = []
            for line in candidates:
                length = line[2] - line[0]
                overlap = max(0, min(anchor[2], line[2]) - max(anchor[0], line[0]))
                if (0.60 <= length / max(anchor_length, 1) <= 1.65 and
                        overlap >= min(anchor_length, length) * 0.68):
                    family.append(line)
            family.sort(key=lambda line: line[1])
            unique = []
            edge_pair_tolerance = max(5.0, max(image_h, image_w) * 0.003)
            for line in family:
                if not unique or line[1] - unique[-1][1] >= edge_pair_tolerance:
                    unique.append(line)
            if len(unique) < minimum_treads:
                continue
            # Find a contiguous, regularly spaced run rather than accepting
            # unrelated parallel room walls spread across the whole drawing.
            best = []
            for start in range(len(unique) - minimum_treads + 1):
                run = unique[start:start + minimum_treads]
                gaps = np.diff([line[1] for line in run])
                median = float(np.median(gaps))
                if median >= 3 and np.all((gaps >= median * 0.55) & (gaps <= median * 1.8)):
                    end = start + minimum_treads
                    while end < len(unique):
                        gap = unique[end][1] - unique[end - 1][1]
                        if not median * 0.55 <= gap <= median * 1.8:
                            break
                        end += 1
                    if end - start > len(best):
                        best = unique[start:end]
            if len(best) < minimum_treads:
                continue
            lo = float(np.percentile([line[0] for line in best], 65))
            hi = float(np.percentile([line[2] for line in best], 35))
            if hi - lo < anchor_length * 0.55:
                continue
            pad = max(3.0, float(np.median(np.diff([line[1] for line in best]))) * 0.45)
            if axis == "h":
                bbox = {"x1": lo, "y1": best[0][1] - pad,
                        "x2": hi, "y2": best[-1][1] + pad}
            else:
                bbox = {"x1": best[0][1] - pad, "y1": lo,
                        "x2": best[-1][1] + pad, "y2": hi}
            bbox = {"x1": max(0, bbox["x1"]), "y1": max(0, bbox["y1"]),
                    "x2": min(image_w, bbox["x2"]), "y2": min(image_h, bbox["y2"])}
            result = {"class": "stairs", "confidence": min(0.94, 0.70 + len(best) * 0.02),
                      "bbox": {k: round(float(v), 1) for k, v in bbox.items()},
                      "source": "wall-tread-fallback", "tread_directions": [axis]}
            if not any(_iou(result["bbox"], old["bbox"]) >= 0.35 for old in found):
                found.append(result)
    # An L/U-shaped stair commonly produces one horizontal and one vertical run.
    # Join touching run envelopes so downstream wall cleanup sees one footprint.
    merged = []
    join_gap = max(10.0, max(image_h, image_w) * 0.018)
    for candidate in found:
        box = candidate["bbox"]
        match = None
        for old in merged:
            other = old["bbox"]
            separated_x = max(other["x1"] - box["x2"], box["x1"] - other["x2"], 0)
            separated_y = max(other["y1"] - box["y2"], box["y1"] - other["y2"], 0)
            if separated_x <= join_gap and separated_y <= join_gap:
                match = old
                break
        if match is None:
            merged.append(candidate)
        else:
            other = match["bbox"]
            match["bbox"] = {"x1": min(other["x1"], box["x1"]),
                             "y1": min(other["y1"], box["y1"]),
                             "x2": max(other["x2"], box["x2"]),
                             "y2": max(other["y2"], box["y2"])}
            match["confidence"] = max(match["confidence"], candidate["confidence"])
            match["tread_directions"] = sorted(set(match.get("tread_directions", [])) |
                                                 set(candidate.get("tread_directions", [])))
    return merged


def detect_stairs_from_image(image, minimum_treads=7):
    """Detect unlabeled tread runs before wall-scale filtering can discard them."""
    if image is None or not getattr(image, "size", 0):
        return []
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    edges = cv2.Canny(cv2.GaussianBlur(gray, (3, 3), 0), 45, 140)
    maximum = max(gray.shape[:2])
    raw = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=20,
                          minLineLength=max(18, int(maximum * 0.025)),
                          maxLineGap=max(3, int(maximum * 0.003)))
    if raw is None:
        return []
    proposals = []
    for x1, y1, x2, y2 in raw[:, 0]:
        dx, dy = abs(x2 - x1), abs(y2 - y1)
        if dx >= max(18, dy * 5) or dy >= max(18, dx * 5):
            proposals.append({"start": {"x": float(x1), "y": float(y1)},
                              "end": {"x": float(x2), "y": float(y2)}})
    return detect_stairs_from_walls(proposals, image.shape, minimum_treads)


def has_stair_tread_geometry(image, bbox, minimum_treads=7):
    """Verify that a model-produced stair box contains a real tread run.

    Object models can learn the printed words ``STAIR CASE`` and return the
    label rectangle even when no staircase geometry is present.  A staircase
    must also contain a sufficiently long, regularly spaced family of parallel
    lines with substantial common overlap.
    """
    if image is None or not getattr(image, "size", 0) or not isinstance(bbox, dict):
        return False
    image_h, image_w = image.shape[:2]
    try:
        x1 = max(0, int(round(float(bbox["x1"]))))
        y1 = max(0, int(round(float(bbox["y1"]))))
        x2 = min(image_w, int(round(float(bbox["x2"]))))
        y2 = min(image_h, int(round(float(bbox["y2"]))))
    except (KeyError, TypeError, ValueError):
        return False
    if x2 - x1 < 28 or y2 - y1 < 28:
        return False

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    roi = gray[y1:y2, x1:x2]
    edges = cv2.Canny(cv2.GaussianBlur(roi, (3, 3), 0), 45, 140)
    short_side = min(roi.shape[:2])
    minimum_length = max(12, int(short_side * 0.34))
    raw = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=16,
                          minLineLength=minimum_length, maxLineGap=4)
    if raw is None:
        return False

    horizontal, vertical = [], []
    for ax, ay, bx, by in raw[:, 0]:
        dx, dy = abs(bx - ax), abs(by - ay)
        if dx >= max(minimum_length, dy * 5):
            horizontal.append((min(ax, bx), (ay + by) / 2.0, max(ax, bx)))
        elif dy >= max(minimum_length, dx * 5):
            vertical.append((min(ay, by), (ax + bx) / 2.0, max(ay, by)))

    def regular_run(lines):
        if len(lines) < minimum_treads:
            return False
        # Collapse the two detected edges of each printed tread.
        positions = []
        edge_pair_tolerance = max(5, int(short_side * 0.02))
        for position in sorted(line[1] for line in lines):
            if not positions or position - positions[-1] >= edge_pair_tolerance:
                positions.append(position)
        if len(positions) < minimum_treads:
            return False
        gaps = np.diff(positions)
        median_gap = float(np.median(gaps)) if len(gaps) else 0
        if median_gap < 3:
            return False
        regular = gaps[(gaps >= median_gap * 0.55) & (gaps <= median_gap * 1.8)]
        if len(regular) < minimum_treads - 2:
            return False
        starts = np.array([line[0] for line in lines], dtype=float)
        ends = np.array([line[2] for line in lines], dtype=float)
        common = float(np.percentile(ends, 35) - np.percentile(starts, 65))
        return common >= minimum_length * 0.75

    return regular_run(horizontal) or regular_run(vertical)


def _iou(a, b):
    ix1, iy1, ix2, iy2 = max(a["x1"], b["x1"]), max(a["y1"], b["y1"]), min(a["x2"], b["x2"]), min(a["y2"], b["y2"])
    intersection = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    union = (a["x2"] - a["x1"]) * (a["y2"] - a["y1"]) + (b["x2"] - b["x1"]) * (b["y2"] - b["y1"]) - intersection
    return intersection / union if union > 0 else 0
