import json
import math
from pathlib import Path
from typing import Dict, List, Tuple

import cv2
import numpy as np

try:
    from ultralytics import YOLO
except Exception:
    YOLO = None

_YOLO_MODEL_CACHE: Dict[str, "YOLO"] = {}


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


def preprocess_image(image: np.ndarray, wall_thickness: int) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    kernel_size = max(3, int(round(wall_thickness)))
    if kernel_size % 2 == 0:
        kernel_size += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
    opened = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=1)
    clean = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel, iterations=1)
    return clean


def merge_segments(segments: List[Dict], coord_tol: int, gap_tol: int) -> List[Dict]:
    if not segments:
        return []
    segments.sort(key=lambda s: (s["coord"], s["start"]))
    merged = [segments[0]]
    for seg in segments[1:]:
        last = merged[-1]
        if abs(seg["coord"] - last["coord"]) <= coord_tol and seg["start"] <= last["end"] + gap_tol:
            last["end"] = max(last["end"], seg["end"])
            last["coord"] = (last["coord"] + seg["coord"]) / 2.0
        else:
            merged.append(seg)
    return merged


def detect_lines(image: np.ndarray, params: Dict) -> List[Dict]:
    wall_thickness = int(params.get("wall_thickness", 3))
    pre = preprocess_image(image, wall_thickness)

    max_dim = max(image.shape[0], image.shape[1])
    min_len = max(16, int(max_dim * 0.025), int(params["min_line_length"] * 0.5))
    thickness_tol = max(8, wall_thickness * 2)

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
        maxLineGap=params["max_line_gap"],
    )
    if hough is not None:
        angle_tol = 10
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

    merge_coord = max(8, int(max_dim * 0.01))
    merge_gap = max(15, int(max_dim * 0.015))
    merged_h = merge_segments(horizontals, coord_tol=merge_coord, gap_tol=merge_gap)
    merged_v = merge_segments(verticals, coord_tol=merge_coord, gap_tol=merge_gap)

    # Final minimum length filter — remove short noise fragments
    final_min_len = max(40, int(max_dim * 0.05))

    results = []
    for seg in merged_h:
        length = seg["end"] - seg["start"]
        if length >= final_min_len:
            results.append(
                {
                    "start": {"x": int(seg["start"]), "y": int(seg["coord"])},
                    "end": {"x": int(seg["end"]), "y": int(seg["coord"])},
                }
            )
    for seg in merged_v:
        length = seg["end"] - seg["start"]
        if length >= final_min_len:
            results.append(
                {
                    "start": {"x": int(seg["coord"]), "y": int(seg["start"])},
                    "end": {"x": int(seg["coord"]), "y": int(seg["end"])},
                }
            )
    return results


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


def _merge_collinear_lines(lines: List[Dict], coord_tol: int = 10, gap_tol: int = 20) -> List[Dict]:
    """Merge nearly-collinear wall segments (horizontal or vertical) into longer walls.
    Also deduplicates overlapping parallel segments."""
    h_segs = []  # {coord: y, start: x1, end: x2}
    v_segs = []  # {coord: x, start: y1, end: y2}

    for ln in lines:
        sx, sy = ln["start"]["x"], ln["start"]["y"]
        ex, ey = ln["end"]["x"], ln["end"]["y"]
        dx, dy = abs(ex - sx), abs(ey - sy)
        if dx >= dy:  # horizontal
            h_segs.append({"coord": (sy + ey) / 2.0, "start": min(sx, ex), "end": max(sx, ex)})
        else:  # vertical
            v_segs.append({"coord": (sx + ex) / 2.0, "start": min(sy, ey), "end": max(sy, ey)})

    merged_h = merge_segments(h_segs, coord_tol=coord_tol, gap_tol=gap_tol)
    merged_v = merge_segments(v_segs, coord_tol=coord_tol, gap_tol=gap_tol)

    result = []
    for seg in merged_h:
        result.append({
            "start": {"x": int(seg["start"]), "y": int(seg["coord"])},
            "end":   {"x": int(seg["end"]),   "y": int(seg["coord"])},
        })
    for seg in merged_v:
        result.append({
            "start": {"x": int(seg["coord"]), "y": int(seg["start"])},
            "end":   {"x": int(seg["coord"]), "y": int(seg["end"])},
        })
    return result


def detect_lines_yolo(
    image: np.ndarray,
    model_path: str,
    conf: float = 0.55,
    iou: float = 0.5,
) -> List[Dict]:
    model = _get_yolo_model(model_path)
    if model is None:
        return []

    results = model.predict(source=image, conf=conf, iou=iou, verbose=False)
    if not results:
        return []
    boxes = results[0].boxes
    if boxes is None or boxes.xyxy is None:
        return []

    max_dim = max(image.shape[0], image.shape[1])
    min_len = max(30, int(max_dim * 0.04))
    min_aspect = 5.0
    max_thickness = max(12, int(max_dim * 0.04))

    raw_lines: List[Dict] = []
    for x1, y1, x2, y2 in boxes.xyxy.cpu().numpy():
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

    # Merge near-parallel duplicates (2% coord tolerance to collapse doubled detections)
    merged = _merge_collinear_lines(raw_lines,
                                     coord_tol=max(10, int(max_dim * 0.02)),
                                     gap_tol=max(15, int(max_dim * 0.02)))

    # Remove short fragments after merging
    final_min = max(40, int(max_dim * 0.05))
    merged = [ln for ln in merged
              if math.hypot(ln["end"]["x"] - ln["start"]["x"],
                            ln["end"]["y"] - ln["start"]["y"]) >= final_min]
    print(f"[yolo-walls] raw={len(raw_lines)}, merged={len(merged)}, max_dim={max_dim}")
    return merged


def detect_boxes_yolo(
    image: np.ndarray,
    model_path: str,
    conf: float = 0.25,
    iou: float = 0.5,
) -> List[Dict]:
    model = _get_yolo_model(model_path)
    if model is None:
        return []

    results = model.predict(source=image, conf=conf, iou=iou, verbose=False)
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
) -> List[Dict]:
    """Detect objects with class names using a YOLO model."""
    model = _get_yolo_model(model_path)
    if model is None:
        return []

    results = model.predict(source=image, conf=conf, iou=iou, verbose=False)
    if not results:
        return []
    boxes = results[0].boxes
    if boxes is None or boxes.xyxy is None:
        return []

    names = results[0].names  # {0: 'ClassName', 1: ...}
    detections: List[Dict] = []
    xyxy = boxes.xyxy.cpu().numpy()
    cls_ids = boxes.cls.cpu().numpy().astype(int) if boxes.cls is not None else []
    confs = boxes.conf.cpu().numpy() if boxes.conf is not None else []

    for i, (x1, y1, x2, y2) in enumerate(xyxy):
        cls_id = int(cls_ids[i]) if i < len(cls_ids) else 0
        class_name = names.get(cls_id, f"class_{cls_id}") if names else f"class_{cls_id}"
        confidence = float(confs[i]) if i < len(confs) else 0.0
        detections.append(
            {
                "class": class_name,
                "confidence": round(confidence, 3),
                "bbox": {
                    "x1": float(x1),
                    "y1": float(y1),
                    "x2": float(x2),
                    "y2": float(y2),
                },
            }
        )
    return detections


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
    if not labeled:
        return 0.0
    matches = 0
    for target in labeled:
        target_angle = line_angle_deg(target)
        target_center = line_center(target)
        best_dist = None
        for det in detected:
            det_angle = line_angle_deg(det)
            if abs(det_angle - target_angle) > 10 and abs(det_angle - target_angle) < 170:
                continue
            det_center = line_center(det)
            dist = math.hypot(det_center[0] - target_center[0], det_center[1] - target_center[1])
            if best_dist is None or dist < best_dist:
                best_dist = dist
        if best_dist is not None and best_dist < 25:
            matches += 1
    return matches / max(len(labeled), 1)


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
    Thickness is then checked independently: any wall noticeably thinner than the
    floor plan's median wall thickness is reclassified as "half", since half-walls
    are a height/thickness property rather than a positional one.
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

    per_wall_thickness = [0.0] * len(walls)
    if image is not None:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        dist_transform = cv2.distanceTransform(binary, cv2.DIST_L2, 3)
        for i, w in enumerate(walls):
            per_wall_thickness[i] = _wall_segment_thickness(image, w, dist_transform)
    nonzero_thicknesses = [t for t in per_wall_thickness if t > 0]
    median_thickness = float(np.median(nonzero_thicknesses)) if nonzero_thicknesses else 0.0
    half_threshold = median_thickness * 0.6

    result = []
    for w, t in zip(walls, per_wall_thickness):
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
        if median_thickness > 0 and t > 0 and t < half_threshold:
            wall_type = "half"
        out = dict(w)
        out["wall_type"] = wall_type
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
