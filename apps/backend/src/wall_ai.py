import json
import math
from pathlib import Path
from typing import Dict, List, Tuple

import cv2
import numpy as np

from wall_geometry import consolidate_walls, snap_wall_endpoints, supported_proposals
from outlined_walls import detect_outlined_walls

try:
    from ultralytics import YOLO
except Exception:
    YOLO = None

_YOLO_MODEL_CACHE: Dict[str, "YOLO"] = {}


def yolo_runtime_available() -> bool:
    """Whether this Python environment can execute the trained YOLO models."""
    return YOLO is not None


def load_image(image_path: str) -> np.ndarray:
    image = cv2.imread(image_path)
    if image is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")
    return image


def line_angle_deg(line: Dict) -> float:
    dx = line["end"]["x"] - line["start"]["x"]
    dy = line["end"]["y"] - line["start"]["y"]
    return math.degrees(math.atan2(dy, dx))


def line_center(line: Dict) -> Tuple[float, float]:
    return (
        (line["start"]["x"] + line["end"]["x"]) / 2.0,
        (line["start"]["y"] + line["end"]["y"]) / 2.0,
    )


def _erase_text_regions(mask: np.ndarray, measurements) -> np.ndarray:
    result = mask.copy()
    for box in (measurements or {}).get("ocr_text_regions", []):
        try:
            x1, y1, x2, y2 = (float(value) for value in box)
        except (TypeError, ValueError):
            continue
        pad_x = max(2, int(round((y2 - y1) * .22)))
        pad_y = max(2, int(round((y2 - y1) * .18)))
        a = (max(0, int(x1) - pad_x), max(0, int(y1) - pad_y))
        b = (min(mask.shape[1] - 1, int(math.ceil(x2)) + pad_x),
             min(mask.shape[0] - 1, int(math.ceil(y2)) + pad_y))
        cv2.rectangle(result, a, b, 0, -1)
    return result


def preprocess_image(image: np.ndarray, wall_thickness: int, measurements=None) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    # A trained wall thickness is not a safe denoising-kernel size. The old
    # 11x11 opening (from a 10 px reference wall) completely erased thinner
    # plans before line detection. Directional extraction below already rejects
    # short text/furniture strokes, so retain every wall scale here and only
    # close one-pixel antialiasing/JPEG gaps.
    close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    clean = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, close_kernel, iterations=1)
    return _erase_text_regions(clean, measurements)


def merge_segments(segments: List[Dict], coord_tol: int, gap_tol: int) -> List[Dict]:
    # Compatibility helper: only overlap on the same centreline is sufficient
    # evidence without the image. Preserve both ends and never mutate callers.
    lines = [{"start": {"x": s["start"], "y": s["coord"]},
              "end": {"x": s["end"], "y": s["coord"]}} for s in segments]
    return [{"coord": w["start"]["y"], "start": w["start"]["x"], "end": w["end"]["x"]}
            for w in consolidate_walls(lines, max_sep=min(coord_tol, 0.25))]


def _filter_drawing_scale(walls: List[Dict], image: np.ndarray) -> List[Dict]:
    """Suppress annotation/furniture rules thinner than this drawing's walls.

    Architectural sheets mix scales, so a fixed pixel threshold is unreliable.
    Outlined wall pairs are the strongest thickness evidence; otherwise vote by
    the supported length of long solid bands. Keep multiple legitimate wall
    weights (for example 4 px partitions beside 10 px exterior walls).
    """
    if len(walls) < 4:
        return walls
    maximum = max(image.shape[:2])
    outlined = [float(w.get("thickness_px", 0)) for w in walls
                if w.get("detector") == "cv-outline" and float(w.get("thickness_px", 0)) >= 2]
    if len(outlined) >= 2:
        reference = float(np.median(outlined))
    else:
        votes = {}
        for wall in walls:
            thickness = float(wall.get("thickness_px", 0) or 0)
            length = math.hypot(wall["end"]["x"] - wall["start"]["x"],
                                wall["end"]["y"] - wall["start"]["y"])
            if thickness >= 2 and length >= maximum * .06:
                votes[round(thickness)] = votes.get(round(thickness), 0) + length
        if not votes:
            return walls
        reference = float(max(votes, key=votes.get))
    minimum = max(2.0, reference * .38)
    retained = [wall for wall in walls if wall.get("detector") == "cv-outline"
                or float(wall.get("thickness_px", 0) or 0) >= minimum]

    def connected_to_retained(candidate):
        ax, ay = candidate["start"]["x"], candidate["start"]["y"]
        bx, by = candidate["end"]["x"], candidate["end"]["y"]
        horizontal = abs(bx - ax) >= abs(by - ay)
        gap = max(8.0, maximum * 0.012)
        for other in retained:
            cx, cy = other["start"]["x"], other["start"]["y"]
            dx, dy = other["end"]["x"], other["end"]["y"]
            other_horizontal = abs(dx - cx) >= abs(dy - cy)
            if horizontal == other_horizontal:
                continue
            if horizontal:
                ix, iy = (cx + dx) / 2, (ay + by) / 2
                along_candidate = min(ax, bx) - gap <= ix <= max(ax, bx) + gap
                along_other = min(cy, dy) - gap <= iy <= max(cy, dy) + gap
            else:
                ix, iy = (ax + bx) / 2, (cy + dy) / 2
                along_candidate = min(ay, by) - gap <= iy <= max(ay, by) + gap
                along_other = min(cx, dx) - gap <= ix <= max(cx, dx) + gap
            if along_candidate and along_other:
                # Require the intersection to be near a candidate endpoint. A
                # dimension rule crossing through the middle is not a wall join.
                endpoint_distance = min(math.hypot(ix - ax, iy - ay), math.hypot(ix - bx, iy - by))
                if endpoint_distance <= gap:
                    return True
        return False

    # Some plans draw interior partitions much thinner than exterior walls.
    # Recover only long, ink-supported candidates attached to the validated wall
    # network; later object-footprint cleanup removes furniture-contained lines.
    for wall in walls:
        if wall in retained:
            continue
        thickness = float(wall.get("thickness_px", 0) or 0)
        length = math.hypot(wall["end"]["x"] - wall["start"]["x"],
                            wall["end"]["y"] - wall["start"]["y"])
        if thickness >= 2 and length >= maximum * .18 and connected_to_retained(wall):
            retained.append(wall)
    return retained


def detect_lines(image: np.ndarray, params: Dict, measurements=None) -> List[Dict]:
    wall_thickness = int(params.get("wall_thickness", 3))
    pre = preprocess_image(image, wall_thickness, measurements)

    max_dim = max(image.shape[0], image.shape[1])
    min_len = max(12, int(params["min_line_length"] * 0.25))
    thickness_tol = max(24, wall_thickness * 4)

    kernel_long = max(22, int(max_dim * 0.035))
    kernel_short = max(10, int(max_dim * 0.018))

    def extract_segments(src: np.ndarray, kernel_len: int, orientation: str) -> List[Dict]:
        if orientation == "h":
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_len, 1))
        else:
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, kernel_len))
        filtered = cv2.erode(src, kernel, iterations=1)
        filtered = cv2.dilate(filtered, kernel, iterations=1)
        contours, _ = cv2.findContours(filtered, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        segments = []
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if orientation == "h":
                if w < min_len or h > thickness_tol:
                    continue
                segments.append({"coord": y + h / 2.0, "start": x, "end": x + w})
            else:
                if h < min_len or w > thickness_tol:
                    continue
                segments.append({"coord": x + w / 2.0, "start": y, "end": y + h})
        return segments

    def segment_support(mask: np.ndarray, seg: Dict, orientation: str) -> float:
        if orientation == "h":
            x_start, x_end = int(seg["start"]), int(seg["end"])
            y = int(round(seg["coord"]))
            length = max(1, x_end - x_start)
            step = max(4, length // 40)
            hits = 0
            total = 0
            for x in range(x_start, x_end + 1, step):
                if 0 <= y < mask.shape[0] and 0 <= x < mask.shape[1]:
                    total += 1
                    if mask[y, x] > 0:
                        hits += 1
            return hits / max(total, 1)
        y_start, y_end = int(seg["start"]), int(seg["end"])
        x = int(round(seg["coord"]))
        length = max(1, y_end - y_start)
        step = max(4, length // 40)
        hits = 0
        total = 0
        for y in range(y_start, y_end + 1, step):
            if 0 <= y < mask.shape[0] and 0 <= x < mask.shape[1]:
                total += 1
                if mask[y, x] > 0:
                    hits += 1
        return hits / max(total, 1)

    horizontals = []
    verticals = []
    for k_len in (kernel_long, kernel_short):
        horizontals.extend(extract_segments(pre, k_len, "h"))
        verticals.extend(extract_segments(pre, k_len, "v"))

    edges = cv2.Canny(pre, params["canny1"], params["canny2"])
    hough = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 180,
        params["hough_threshold"],
        minLineLength=min_len,
        maxLineGap=min(2, params["max_line_gap"]),
    )
    if hough is not None:
        angle_tol = 3
        for x1, y1, x2, y2 in hough[:, 0]:
            dx = x2 - x1
            dy = y2 - y1
            length = math.hypot(dx, dy)
            if length < min_len:
                continue
            angle = abs(math.degrees(math.atan2(dy, dx)))
            if angle > 90:
                angle = 180 - angle
            if angle <= angle_tol:
                x_start, x_end = sorted([x1, x2])
                horizontals.append({"coord": (y1 + y2) / 2.0, "start": x_start, "end": x_end})
            elif angle >= 90 - angle_tol:
                y_start, y_end = sorted([y1, y2])
                verticals.append({"coord": (x1 + x2) / 2.0, "start": y_start, "end": y_end})

    horizontals = [seg for seg in horizontals if segment_support(pre, seg, "h") >= 0.55]
    verticals = [seg for seg in verticals if segment_support(pre, seg, "v") >= 0.55]

    # Keep short returns; merge both detectors only with original-pixel evidence.
    results = []
    for axis, segments in (("h", horizontals), ("v", verticals)):
        for seg in segments:
            a, b, coord = float(seg["start"]), float(seg["end"]), float(seg["coord"])
            results.append({
                "start": {"x": a if axis == "h" else coord, "y": coord if axis == "h" else a},
                "end": {"x": b if axis == "h" else coord, "y": coord if axis == "h" else b},
                "detector": "cv",
            })
    results.extend(detect_outlined_walls(image, measurements))
    supported = supported_proposals(consolidate_walls(results, image=image), image)
    supported = _filter_drawing_scale(supported, image)
    # Small irregular dark symbols (plants/text) can survive directional opening.
    # Keep short returns when their perpendicular profile forms a stable wall band.
    return [w for w in supported if w.get("thickness_px", 0) >= 2 or
            math.hypot(w["end"]["x"] - w["start"]["x"], w["end"]["y"] - w["start"]["y"]) >= 48]


def _get_yolo_model(model_path: str):
    if YOLO is None:
        return None
    model = _YOLO_MODEL_CACHE.get(model_path)
    if model is None:
        model = YOLO(model_path)
        _YOLO_MODEL_CACHE[model_path] = model
    return model


def invalidate_yolo_cache(model_path: str = None) -> None:
    """Drop cached YOLO model(s) so the next detect_*_yolo call reloads from disk.
    Call this immediately after promoting new weights to a path already cached."""
    if model_path is None:
        _YOLO_MODEL_CACHE.clear()
    else:
        _YOLO_MODEL_CACHE.pop(model_path, None)


def _deduplicate_parallel_walls(lines: List[Dict], max_sep: int = 18) -> List[Dict]:
    # Without pixel evidence only coincident proposals are safe to combine.
    return consolidate_walls(lines, max_sep=max_sep)


def _snap_wall_endpoints(lines: List[Dict], snap_dist: int = 10) -> List[Dict]:
    return snap_wall_endpoints(lines, snap_dist)


def _merge_collinear_lines(lines: List[Dict], coord_tol: int = 10, gap_tol: int = 20) -> List[Dict]:
    return consolidate_walls(lines, max_sep=coord_tol)


def yolo_class_ids(model_path: str, kind: str) -> List[int]:
    """Read class IDs from weights, including single-class specialized models."""
    model = _get_yolo_model(model_path)
    if model is None:
        return []
    aliases = {
        "wall": {"wall", "walls"},
        "door": {"door", "doors", "puerta de plano"},
        "window": {"window", "windows", "glass window", "glass wall", "glass grill", "glass banister"},
    }
    names = model.names.items() if isinstance(model.names, dict) else enumerate(model.names)
    return [int(i) for i, name in names
            if str(name).lower().replace("_", " ").replace("-", " ").strip() in aliases[kind]]


def detect_lines_yolo(
    image: np.ndarray,
    model_path: str,
    conf: float = 0.55,
    iou: float = 0.5,
    classes: List[int] = None,
) -> List[Dict]:
    model = _get_yolo_model(model_path)
    if model is None:
        return []

    if classes is None:
        classes = yolo_class_ids(model_path, "wall")
    if not classes:
        return []

    results = model.predict(source=image, conf=conf, iou=iou, classes=classes, agnostic_nms=True, verbose=False)
    if not results:
        return []
    boxes = results[0].boxes
    if boxes is None or boxes.xyxy is None:
        return []

    max_dim = max(image.shape[0], image.shape[1])
    min_len = 12
    min_aspect = 3.0
    max_thickness = max(20, int(max_dim * 0.06))

    raw_lines: List[Dict] = []
    for box_index, (x1, y1, x2, y2) in enumerate(boxes.xyxy.cpu().numpy()):
        width = max(0.0, x2 - x1)
        height = max(0.0, y2 - y1)
        long_side = max(width, height)
        short_side = min(width, height) or 1.0
        if long_side < min_len:
            continue
        if long_side / short_side < min_aspect:
            continue
        if short_side > max_thickness:
            continue
        if width >= height:
            y = (y1 + y2) / 2.0
            raw_lines.append({
                "start": {"x": int(round(x1)), "y": int(round(y))},
                "end": {"x": int(round(x2)), "y": int(round(y))},
            })
        else:
            x = (x1 + x2) / 2.0
            raw_lines.append({
                "start": {"x": int(round(x)), "y": int(round(y1))},
                "end": {"x": int(round(x)), "y": int(round(y2))},
            })

        if raw_lines:
            raw_lines[-1]["detector"] = "yolo"
            if boxes.conf is not None:
                raw_lines[-1]["confidence"] = float(boxes.conf[box_index].item())

    return supported_proposals(consolidate_walls(raw_lines, image=image), image, minimum=0.35)


def detect_door_swing(image: np.ndarray, bbox: dict) -> str:
    """
    Detect door swing direction from the arc symbol in a floor plan image.
    Returns: 'left-inside', 'left-outside', 'right-inside', 'right-outside'
    """
    x1 = int(bbox.get('x1', 0))
    y1 = int(bbox.get('y1', 0))
    x2 = int(bbox.get('x2', 0))
    y2 = int(bbox.get('y2', 0))

    h_img, w_img = image.shape[:2]
    pad = max(4, int(min(x2 - x1, y2 - y1) * 0.1))
    cx1 = max(0, x1 - pad)
    cy1 = max(0, y1 - pad)
    cx2 = min(w_img, x2 + pad)
    cy2 = min(h_img, y2 + pad)

    crop = image[cy1:cy2, cx1:cx2]
    bw = cx2 - cx1
    bh = cy2 - cy1
    if crop.size == 0 or bw == 0 or bh == 0:
        return 'left-inside'

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop.copy()
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    min_r = max(5, int(min(bw, bh) * 0.25))
    max_r = int(max(bw, bh) * 0.9)

    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1,
        minDist=min(bw, bh) // 2,
        param1=60, param2=12,
        minRadius=min_r, maxRadius=max_r
    )

    if circles is not None:
        # Pick circle whose center is closest to any corner — that's the hinge
        corners = [(0, 0), (bw, 0), (0, bh), (bw, bh)]
        best, best_d = None, float('inf')
        for c in circles[0]:
            for corner in corners:
                d = np.hypot(c[0] - corner[0], c[1] - corner[1])
                if d < best_d:
                    best_d, best = d, c

        if best is not None:
            cx, cy_c, r = best
            hinge = 'left' if cx < bw / 2 else 'right'

            # Arc extends away from hinge corner — check edge density above/below center
            edges = cv2.Canny(gray, 30, 100)
            top_den = float(np.sum(edges[:int(cy_c), :]))
            bot_den = float(np.sum(edges[int(cy_c):, :]))
            swing = 'inside' if bot_den > top_den else 'outside'

            return f'{hinge}-{swing}'

    # Fallback: corner edge density
    edges = cv2.Canny(gray, 50, 150)
    cs = max(1, min(bh, bw) // 4)
    tl = float(np.sum(edges[:cs, :cs]))
    tr = float(np.sum(edges[:cs, bw - cs:]))
    bl = float(np.sum(edges[bh - cs:, :cs]))
    br = float(np.sum(edges[bh - cs:, bw - cs:]))
    hinge = 'left' if (tl + bl) > (tr + br) else 'right'
    swing = 'inside' if (bl + br) > (tl + tr) else 'outside'
    return f'{hinge}-{swing}'


def detect_boxes_yolo(
    image: np.ndarray,
    model_path: str,
    conf: float = 0.25,
    iou: float = 0.5,
    classes: List[int] = None,
) -> List[Dict]:
    model = _get_yolo_model(model_path)
    if model is None:
        return []

    results = model.predict(source=image, conf=conf, iou=iou, classes=classes, agnostic_nms=True, verbose=False)
    if not results:
        return []
    boxes = results[0].boxes
    if boxes is None or boxes.xyxy is None:
        return []

    detections: List[Dict] = []
    for x1, y1, x2, y2 in boxes.xyxy.cpu().numpy():
        detections.append(
            {
                "bbox": {
                    "x1": float(x1),
                    "y1": float(y1),
                    "x2": float(x2),
                    "y2": float(y2),
                }
            }
        )
    return detections


def detect_classified_boxes_yolo(
    image: np.ndarray,
    model_path: str,
    conf: float = 0.25,
    iou: float = 0.5,
    classes: List[int] = None,
    image_sizes: Tuple[int, ...] = (640,),
) -> List[Dict]:
    """Detect objects with class names using a YOLO model."""
    model = _get_yolo_model(model_path)
    if model is None:
        return []

    detections: List[Dict] = []
    sizes = tuple(dict.fromkeys(int(size) for size in image_sizes if int(size) >= 320)) or (640,)
    for image_size in sizes:
        results = model.predict(source=image, conf=conf, iou=iou, classes=classes,
                                agnostic_nms=True, imgsz=image_size, verbose=False)
        if not results or results[0].boxes is None or results[0].boxes.xyxy is None:
            continue
        boxes = results[0].boxes
        names = results[0].names
        xyxy = boxes.xyxy.cpu().numpy()
        cls_ids = boxes.cls.cpu().numpy().astype(int) if boxes.cls is not None else []
        confs = boxes.conf.cpu().numpy() if boxes.conf is not None else []
        for index, (x1, y1, x2, y2) in enumerate(xyxy):
            cls_id = int(cls_ids[index]) if index < len(cls_ids) else 0
            detections.append({
                "class": names.get(cls_id, f"class_{cls_id}") if names else f"class_{cls_id}",
                "confidence": round(float(confs[index]) if index < len(confs) else 0.0, 3),
                "bbox": {"x1": float(x1), "y1": float(y1),
                         "x2": float(x2), "y2": float(y2)},
                "inference_size": image_size,
            })
    return _deduplicate_classified_boxes(detections)


def _deduplicate_classified_boxes(detections: List[Dict], threshold: float = 0.5) -> List[Dict]:
    """Combine the same object found by multiple inference resolutions."""
    kept = []
    for candidate in sorted(detections, key=lambda item: item.get("confidence", 0), reverse=True):
        box = candidate.get("bbox") or {}
        area = max(0, box.get("x2", 0) - box.get("x1", 0)) * max(0, box.get("y2", 0) - box.get("y1", 0))
        duplicate = False
        for old in kept:
            if str(old.get("class", "")).lower() != str(candidate.get("class", "")).lower():
                continue
            other = old["bbox"]
            intersection = max(0, min(box["x2"], other["x2"]) - max(box["x1"], other["x1"])) * \
                max(0, min(box["y2"], other["y2"]) - max(box["y1"], other["y1"]))
            other_area = max(0, other["x2"] - other["x1"]) * max(0, other["y2"] - other["y1"])
            union = area + other_area - intersection
            if union > 0 and intersection / union >= threshold:
                duplicate = True
                break
        if not duplicate:
            kept.append(candidate)
    return kept


def estimate_scale_from_doors(doors: List[Dict], standard_door_width_m: float = 0.9) -> Dict:
    """Estimate meters-per-pixel from detected door bbox sizes.
    Floor-plan door symbols are roughly as wide as the door's swing radius,
    so the longer bbox side approximates the standard door width."""
    widths_px = []
    for d in doors:
        bbox = d.get("bbox", {})
        w = abs(bbox.get("x2", 0) - bbox.get("x1", 0))
        h = abs(bbox.get("y2", 0) - bbox.get("y1", 0))
        long_side = max(w, h)
        if long_side > 0:
            widths_px.append(long_side)
    if not widths_px:
        return {"meters_per_pixel": None, "source": None, "sample_count": 0}
    median_px = float(np.median(widths_px))
    return {
        "meters_per_pixel": standard_door_width_m / median_px,
        "source": "door_width_estimate",
        "sample_count": len(widths_px),
    }


def score_detection(detected: List[Dict], labeled: List[Dict]) -> float:
    """One-to-one segment F1 for parameter tuning, including false positives.

    Match parallel segments within 5 px with projected interval IoU >= 0.5.
    This is a local tuning metric, not a dataset-wide accuracy claim.
    """
    candidates = []
    for i, target in enumerate(labeled):
        a = np.array([target["start"]["x"], target["start"]["y"]], dtype=float)
        b = np.array([target["end"]["x"], target["end"]["y"]], dtype=float)
        size = np.linalg.norm(b - a)
        if size < 0.5:
            continue
        u = (b - a) / size
        n = np.array([-u[1], u[0]])
        for j, det in enumerate(detected):
            c = np.array([det["start"]["x"], det["start"]["y"]], dtype=float)
            d = np.array([det["end"]["x"], det["end"]["y"]], dtype=float)
            det_size = np.linalg.norm(d - c)
            if det_size < 0.5 or abs(np.dot((d - c) / det_size, n)) > math.sin(math.radians(5)):
                continue
            if max(abs(np.dot(c - a, n)), abs(np.dot(d - a, n))) > 5:
                continue
            lo, hi = sorted([float(np.dot(c - a, u)), float(np.dot(d - a, u))])
            overlap = max(0, min(size, hi) - max(0, lo))
            iou = overlap / max(size, hi) if lo >= 0 else overlap / (max(size, hi) - lo)
            if iou >= 0.5:
                candidates.append((-iou, i, j))
    used_labels, used_detections = set(), set()
    for _, i, j in sorted(candidates):
        if i not in used_labels and j not in used_detections:
            used_labels.add(i)
            used_detections.add(j)
    return 2 * len(used_labels) / max(len(detected) + len(labeled), 1)


def estimate_wall_thickness(image: np.ndarray, labeled_lines: List[Dict]) -> int:
    if not labeled_lines:
        return 3
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    dist = cv2.distanceTransform(binary, cv2.DIST_L2, 3)
    h, w = binary.shape
    samples = []
    for line in labeled_lines:
        x1 = int(line["start"]["x"])
        y1 = int(line["start"]["y"])
        x2 = int(line["end"]["x"])
        y2 = int(line["end"]["y"])
        steps = max(5, int(math.hypot(x2 - x1, y2 - y1) // 20))
        for i in range(steps + 1):
            t = i / max(steps, 1)
            x = int(round(x1 + (x2 - x1) * t))
            y = int(round(y1 + (y2 - y1) * t))
            if 0 <= x < w and 0 <= y < h:
                thickness = dist[y, x] * 2
                if thickness > 0:
                    samples.append(thickness)
    if not samples:
        return 3
    median = float(np.median(samples))
    return max(3, min(12, int(round(median))))


def _wall_segment_thickness(image: np.ndarray, wall: Dict, dist: np.ndarray) -> float:
    """Sample the distance-transform along one wall segment to estimate its thickness."""
    h, w = dist.shape[:2]
    x1, y1 = int(wall["start"]["x"]), int(wall["start"]["y"])
    x2, y2 = int(wall["end"]["x"]), int(wall["end"]["y"])
    steps = max(5, int(math.hypot(x2 - x1, y2 - y1) // 20))
    samples = []
    for i in range(steps + 1):
        t = i / max(steps, 1)
        x = int(round(x1 + (x2 - x1) * t))
        y = int(round(y1 + (y2 - y1) * t))
        if 0 <= x < w and 0 <= y < h:
            thickness = dist[y, x] * 2
            if thickness > 0:
                samples.append(thickness)
    return float(np.median(samples)) if samples else 0.0


def classify_wall_types(image: np.ndarray, walls: List[Dict]) -> List[Dict]:
    """Tag each wall dict with a "wall_type" of "exterior", "interior", or "half".

    Position (exterior vs interior) is derived from the convex hull of all wall
    endpoints — walls lying on the outer boundary are exterior, the rest interior.
    This is a positional hint, not proof of topology. Never infer half-height from
    stroke width; retain explicit user wall types.
    """
    if not walls:
        return walls

    points = []
    for w in walls:
        points.append((w["start"]["x"], w["start"]["y"]))
        points.append((w["end"]["x"], w["end"]["y"]))
    pts_arr = np.array(points, dtype=np.float32)

    max_dim = max(image.shape[0], image.shape[1]) if image is not None else 1000
    tol = max(8.0, max_dim * 0.02)

    hull_edges = []
    if len(pts_arr) >= 3:
        hull = cv2.convexHull(pts_arr)
        hull_pts = hull.reshape(-1, 2)
        for i in range(len(hull_pts)):
            p1 = hull_pts[i]
            p2 = hull_pts[(i + 1) % len(hull_pts)]
            hull_edges.append((p1, p2))

    def point_near_hull(pt) -> bool:
        if not hull_edges:
            return True
        px, py = pt
        for p1, p2 in hull_edges:
            x1, y1 = p1
            x2, y2 = p2
            edge_len = math.hypot(x2 - x1, y2 - y1)
            if edge_len == 0:
                dist = math.hypot(px - x1, py - y1)
            else:
                t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (edge_len ** 2)
                t = max(0.0, min(1.0, t))
                proj_x = x1 + t * (x2 - x1)
                proj_y = y1 + t * (y2 - y1)
                dist = math.hypot(px - proj_x, py - proj_y)
            if dist <= tol:
                return True
        return False

    result = []
    for w in walls:
        sx, sy = w["start"]["x"], w["start"]["y"]
        ex, ey = w["end"]["x"], w["end"]["y"]
        # Sample several points along the segment, not just its endpoints — a wall
        # that merely *touches* the hull at both ends (e.g. an interior partition
        # spanning the building) would otherwise be misclassified as exterior.
        sample_ts = (0.0, 0.25, 0.5, 0.75, 1.0)
        on_boundary = all(
            point_near_hull((sx + (ex - sx) * t, sy + (ey - sy) * t)) for t in sample_ts
        )
        wall_type = "exterior" if on_boundary else "interior"
        out = dict(w)
        out["wall_type"] = w.get("wall_type", wall_type)
        out["wall_type_inferred"] = "wall_type" not in w or w.get("wall_type_inferred", False)
        result.append(out)
    return result


def train_params(image: np.ndarray, labeled_lines: List[Dict]) -> Tuple[Dict, float, int]:
    grid = {
        "canny1": [40, 60, 80],
        "canny2": [120, 160, 200],
        "hough_threshold": [60, 90, 120],
        "min_line_length": [40, 80, 120],
        "max_line_gap": [6, 12, 20],
    }
    best_score = -1.0
    best_params = None
    best_count = 0

    for c1 in grid["canny1"]:
        for c2 in grid["canny2"]:
            for ht in grid["hough_threshold"]:
                for mll in grid["min_line_length"]:
                    for mlg in grid["max_line_gap"]:
                        params = {
                            "canny1": c1,
                            "canny2": c2,
                            "hough_threshold": ht,
                            "min_line_length": mll,
                            "max_line_gap": mlg,
                        }
                        detected = detect_lines(image, params)
                        score = score_detection(detected, labeled_lines)
                        if score > best_score:
                            best_score = score
                            best_params = params
                            best_count = len(detected)
    if best_params is None:
        best_params = {
            "canny1": 60,
            "canny2": 160,
            "hough_threshold": 90,
            "min_line_length": 80,
            "max_line_gap": 12,
        }
    best_params["wall_thickness"] = estimate_wall_thickness(image, labeled_lines)
    return best_params, best_score, best_count


def save_params(params_path: Path, params: Dict, score: float, detected_count: int) -> None:
    payload = {
        "params": params,
        "score": score,
        "detected_count": detected_count,
    }
    params_path.parent.mkdir(parents=True, exist_ok=True)
    params_path.write_text(json.dumps(payload, indent=2))


def load_params(params_path: Path) -> Dict:
    if not params_path.exists():
        return {
            "canny1": 60,
            "canny2": 160,
            "hough_threshold": 90,
            "min_line_length": 80,
            "max_line_gap": 12,
        }
    data = json.loads(params_path.read_text())
    return data.get("params", data)
