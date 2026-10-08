import base64
import hashlib
import json
import os
import signal
import shutil
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import cv2
import numpy as np

from wall_geometry import consolidate_walls, exclude_object_interior_walls
from wall_evidence import paired_wall_proposals, assess_walls
from plan_measurements import extract_plan_measurements, exclude_dimension_walls
from room_boundaries import detect_room_boundaries
from door_geometry import deduplicate_doors
from stair_detection import detect_stairs, detect_stairs_from_image, detect_stairs_from_walls, has_stair_tread_geometry
from wall_ai import yolo_class_ids, yolo_runtime_available, classify_wall_types, detect_boxes_yolo, detect_classified_boxes_yolo, detect_door_swing, detect_lines, detect_lines_yolo, estimate_scale_from_doors, load_image, load_params, save_params, train_params

# Optional DB + auto-trainer + embeddings (gracefully degrade if MySQL not available)
try:
    import db as DB
    import auto_trainer
    import embeddings as EMB
    DB_AVAILABLE = True
    print("[init] MySQL database + YOLO embeddings: ENABLED")
except Exception as e:
    DB_AVAILABLE = False
    EMB = None
    print(f"[init] MySQL database integration: DISABLED ({e})")
    print("[init] Install pymysql: pip install pymysql")

# AI Assistant (Gemini)
try:
    import ai_assistant as AI
    AI_AVAILABLE = True
    print("[init] AI Assistant: ENABLED")
except Exception as e:
    AI = None
    AI_AVAILABLE = False
    print(f"[init] AI Assistant: DISABLED ({e})")

try:
    import adk_pipeline as ADK_PIPELINE
    ADK_AVAILABLE = True
    print("[init] ADK Pipeline: ENABLED")
except Exception as e:
    ADK_PIPELINE = None
    ADK_AVAILABLE = False
    print(f"[init] ADK Pipeline: DISABLED ({e})")

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent.parent
DATA_DIR = BACKEND_DIR / "outputs" / "self_train"
LABELS_FILE = DATA_DIR / "labels.jsonl"
PARAMS_FILE = DATA_DIR / "params.json"
COMBINED_WEIGHTS = REPO_ROOT / "models" / "best.pt"  # yolov8m: door + wall + window (read-only reference)
YOLO_WEIGHTS = REPO_ROOT / "models" / "wall_best.pt"
DOOR_YOLO_WEIGHTS = REPO_ROOT / "models" / "door_best.pt"
ROOM_OBJECT_YOLO_WEIGHTS = REPO_ROOT / "apps" / "room-and-object" / "runs" / "room_object_yolo" / "weights" / "best.pt"
WINDOW_GLASS_YOLO_WEIGHTS = REPO_ROOT / "models" / "window_glass_best.pt"

MAX_BODY_SIZE = 20 * 1024 * 1024  # 20 MB — reject oversized uploads before reading
SCAN_API_VERSION = 1


def scan_runtime_info():
    """Report loaded capabilities separately from optional OCR availability."""
    yolo_ready = yolo_runtime_available()
    return {
        'status': 'running',
        'pid': os.getpid(),
        'scan_api_version': SCAN_API_VERSION,
        'database_enabled': DB_AVAILABLE,
        'capabilities': {'printed_measurements': True, 'automatic_room_boundaries': True,
                         'outlined_wall_detection': True, 'door_deduplication': True,
                         'labeled_stair_detection': True,
                         'object_detection': yolo_ready and ROOM_OBJECT_YOLO_WEIGHTS.exists(),
                         'door_detection': yolo_ready and _effective_weights(DOOR_YOLO_WEIGHTS) is not None,
                         'window_detection': yolo_ready and _effective_weights(WINDOW_GLASS_YOLO_WEIGHTS) is not None},
        'ocr': {'engine': 'tesseract-local', 'available': shutil.which('tesseract') is not None},
    }


def _effective_weights(specialized: Path, fallback: Path = COMBINED_WEIGHTS):
    """Return specialized weights path if it exists, else fall back to the combined model.
    Specialized models are trained separately (R1 fix) but won't exist until first retrain.
    Until then, COMBINED_WEIGHTS handles all three classes (0=door, 1=wall, 2=window)."""
    if specialized.exists():
        return specialized
    if fallback.exists():
        return fallback
    return None


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except Exception:
        print(f"[config] Invalid {name}={raw!r}; using default {default}")
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


WALL_YOLO_CONF = _env_float("WALL_YOLO_CONF", 0.25)
DOOR_YOLO_CONF = _env_float("DOOR_YOLO_CONF", 0.35)
ROOM_OBJECT_YOLO_CONF = _env_float("ROOM_OBJECT_YOLO_CONF", 0.25)
WINDOW_GLASS_YOLO_CONF = _env_float("WINDOW_GLASS_YOLO_CONF", 0.25)
AI_REVIEW_MAX_OBJECTS = max(20, int(os.environ.get("AI_REVIEW_MAX_OBJECTS", "80")))
CLOUD_DETECTION_REVIEW_ENABLED = _env_bool("CLOUD_DETECTION_REVIEW_ENABLED", False)
AUTO_TRAIN_ON_DETECT = _env_bool("AUTO_TRAIN_ON_DETECT", False)
AUTO_TRAIN_ON_CORRECTION = _env_bool("AUTO_TRAIN_ON_CORRECTION", False)
AI_STRUCTURAL_PASS_ENABLED = _env_bool("AI_STRUCTURAL_PASS_ENABLED", True)
CV_PILLAR_AUGMENT_ENABLED = False  # pillar detection removed
ADK_PIPELINE_ENABLED = _env_bool("ADK_PIPELINE_ENABLED", False)

# These must stay identical to auto_trainer.PRODUCTION_WEIGHTS — that module promotes
# retrained weights into exactly these paths, and this module's in-memory YOLO cache
# (wall_ai._YOLO_MODEL_CACHE) is keyed by path string, so any drift here means promoted
# weights silently never get picked up.
if DB_AVAILABLE:
    assert auto_trainer.PRODUCTION_WEIGHTS == {
        "wall_yolo": YOLO_WEIGHTS,
        "door_yolo": DOOR_YOLO_WEIGHTS,
        "room_object_yolo": ROOM_OBJECT_YOLO_WEIGHTS,
        "window_glass_yolo": WINDOW_GLASS_YOLO_WEIGHTS,
    }, "train_server.py weights paths drifted from auto_trainer.PRODUCTION_WEIGHTS"


def resolve_image_path(path_str: str) -> Path:
    if not path_str:
        return BACKEND_DIR / "sample_inputs" / "test.jpeg"
    if path_str.startswith("/"):
        return REPO_ROOT / path_str.lstrip("/")
    return Path(path_str)


def read_labels():
    if not LABELS_FILE.exists():
        return []
    rows = []
    for line in LABELS_FILE.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def append_label(entry: dict):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with LABELS_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def wall_key(wall: dict) -> str:
    start = wall["start"]
    end = wall["end"]
    if (start["x"], start["y"]) > (end["x"], end["y"]):
        start, end = end, start
    def r(v):
        return round(float(v), 1)
    return f"{r(start['x'])}_{r(start['y'])}_{r(end['x'])}_{r(end['y'])}"


def combined_walls(labels: list, image_path: str | None) -> list:
    combined = []
    seen = set()
    for entry in labels:
        if image_path and entry.get("imagePath") != image_path:
            continue
        for wall in entry.get("walls", []):
            key = wall_key(wall)
            if key in seen:
                continue
            seen.add(key)
            combined.append(wall)
    return combined


def normalize_wall(wall: dict) -> dict:
    return {
        "start": {
            "x": float(wall["start"]["x"]),
            "y": float(wall["start"]["y"]),
        },
        "end": {
            "x": float(wall["end"]["x"]),
            "y": float(wall["end"]["y"]),
        },
    }


def _walls_similar(a: dict, b: dict, tol: float = 25.0) -> bool:
    """Check if two walls are roughly the same (within tol pixels at both endpoints)."""
    try:
        ax1, ay1 = float(a["start"]["x"]), float(a["start"]["y"])
        ax2, ay2 = float(a["end"]["x"]), float(a["end"]["y"])
        bx1, by1 = float(b["start"]["x"]), float(b["start"]["y"])
        bx2, by2 = float(b["end"]["x"]), float(b["end"]["y"])
    except Exception:
        return False
    # Direct orientation
    d1 = ((ax1 - bx1) ** 2 + (ay1 - by1) ** 2) ** 0.5
    d2 = ((ax2 - bx2) ** 2 + (ay2 - by2) ** 2) ** 0.5
    if d1 < tol and d2 < tol:
        return True
    # Reversed orientation
    d1r = ((ax1 - bx2) ** 2 + (ay1 - by2) ** 2) ** 0.5
    d2r = ((ax2 - bx1) ** 2 + (ay2 - by1) ** 2) ** 0.5
    return d1r < tol and d2r < tol


def merge_yolo_with_corrections(yolo_walls: list, db_walls: list, image=None) -> list:
    """User corrections take priority; never average their coordinates away."""
    authored = [w for w in db_walls if (w.get("source") or "").lower() in ("corrected", "manual", "seed")]
    return consolidate_walls(authored + list(yolo_walls), image=image)


def merge_yolo_with_correction_doors(yolo_doors: list, db_doors: list) -> list:
    corrections = [d for d in db_doors or [] if (d.get("source") or "").lower() in ("corrected", "manual")]
    return deduplicate_doors(corrections + list(yolo_doors or []))


MODEL_TYPE_FOR_ENTITY = {"wall": "wall_yolo", "door": "door_yolo", "object": "room_object_yolo"}


def _apply_correction(fp_id, entity_type, action, entity_id, old_data, new_data, proposed_by="human"):
    """Apply one correction to the underlying entity row (insert/update/deactivate) and
    log it to the corrections table. Shared by /api/correct (human) and the Gemini vision
    review step (AI) so there's one code path for mutating walls/doors/objects.
    Returns the entity_type if something was applied, else None."""
    if not entity_type or not action:
        return None

    if action == "add" and new_data:
        created_id = None
        if entity_type == "wall":
            ids = DB.save_walls(fp_id, [new_data], source="corrected")
            created_id = ids[0] if ids else None
        elif entity_type == "door":
            ids = DB.save_doors(fp_id, [new_data], source="corrected")
            created_id = ids[0] if ids else None
        elif entity_type == "object":
            ids = DB.save_objects(fp_id, [new_data], source="corrected")
            created_id = ids[0] if ids else None
        if not created_id:
            return None
        DB.save_correction(
            fp_id, entity_type, created_id, action, old_data, new_data, proposed_by=proposed_by
        )
        return entity_type

    if action == "modify" and new_data and entity_id:
        DB.save_correction(
            fp_id, entity_type, entity_id, action, old_data, new_data, proposed_by=proposed_by
        )
        if entity_type == "wall":
            DB.update_wall(entity_id, start=new_data.get("start"), end=new_data.get("end"), source="corrected")
        elif entity_type == "door":
            DB.update_door(entity_id, bbox=new_data.get("bbox"), swing_dir=new_data.get("swing_dir"), source="corrected")
        elif entity_type == "object":
            DB.update_object(entity_id, class_name=new_data.get("class"), bbox=new_data.get("bbox"), source="corrected")
        return entity_type

    if action == "delete" and entity_id:
        DB.save_correction(
            fp_id, entity_type, entity_id, action, old_data, new_data, proposed_by=proposed_by
        )
        if entity_type == "wall":
            DB.deactivate_wall(entity_id)
        elif entity_type == "door":
            DB.deactivate_door(entity_id)
        elif entity_type == "object":
            DB.deactivate_object(entity_id)
        return entity_type

    return None


def _trigger_retrain_for_entities(fp_id, entity_types, touched_classes=None):
    """Trigger an auto-retrain for each model_type whose entity_type was actually touched.
    touched_classes (optional) lets window/glass-* object corrections also retrain the
    dedicated window_glass_yolo model, since those classes share entity_type='object'
    with room_object_yolo but are trained separately."""
    if not AUTO_TRAIN_ON_DETECT:
        print("[auto-train] Skipping correction retrain during auto-detect (AUTO_TRAIN_ON_DETECT=0)")
        return
    for et in entity_types:
        mt = MODEL_TYPE_FOR_ENTITY.get(et)
        if mt:
            auto_trainer.trigger_auto_train("correction", fp_id, model_type=mt)
    if touched_classes and any(
        auto_trainer.map_class_name_to_window_glass_index(c) is not None for c in touched_classes
    ):
        auto_trainer.trigger_auto_train("correction", fp_id, model_type="window_glass_yolo")


def _apply_correction_to_list(items: list, action: str, index: int | None, replacement: dict | None):
    """Mirror a correction onto an in-memory detection list for immediate API response."""
    if action == "add":
        if replacement:
            items.append(replacement)
        return
    if index is None or not (0 <= index < len(items)):
        return
    if action == "modify" and replacement:
        items[index] = replacement
    elif action == "delete":
        items.pop(index)


ROOM_LABEL_CLASSES = {
    "bedroom",
    "bathroom",
    "kitchen",
    "living room",
    "dining room",
    "study room",
    "lobby",
    "foyer",
    "pre-foyer",
    "utility",
    "terrace",
    "balcony",
    "garage",
    "parking",
    "walkin",
    "wash",
    "sit-out",
    "laundry",
    "lift",
    "stairwell",
}


def _normalize_class_name(class_name: str) -> str:
    normalized = " ".join(str(class_name or "").strip().lower().replace("_", " ").split())
    synonyms = {
        "window panel": "window",
        "windows": "window",
        "glass window": "glass-window",
        "glass windows": "glass-window",
        "glasswall": "glass-wall",
        "glass wall": "glass-wall",
        "glass walls": "glass-wall",
        "grill": "glass-grill",
        "grills": "glass-grill",
        "window grill": "glass-grill",
        "window grills": "glass-grill",
        "grill window": "glass-grill",
        "glass grill": "glass-grill",
        "glass grills": "glass-grill",
        "stair": "stairs",
        "staircase": "stairs",
        "staircases": "stairs",
        "elevator": "lift",
        "elevators": "lift",
        "elevator shaft": "lift",
        "banister": "glass-banister",
        "banisters": "glass-banister",
        "glass banister": "glass-banister",
        "glass banisters": "glass-banister",
        "railing": "glass-banister",
        "railings": "glass-banister",
        "glass railing": "glass-banister",
        "glass railings": "glass-banister",
        "balustrade": "glass-banister",
        "balustrades": "glass-banister",
        "glass balustrade": "glass-banister",
    }
    return synonyms.get(normalized, normalized)


def _bbox_iou(a: dict, b: dict) -> float:
    try:
        ax1, ay1, ax2, ay2 = float(a["x1"]), float(a["y1"]), float(a["x2"]), float(a["y2"])
        bx1, by1, bx2, by2 = float(b["x1"]), float(b["y1"]), float(b["x2"]), float(b["y2"])
    except Exception:
        return 0.0
    ix1, iy1 = max(min(ax1, ax2), min(bx1, bx2)), max(min(ay1, ay2), min(by1, by2))
    ix2, iy2 = min(max(ax1, ax2), max(bx1, bx2)), min(max(ay1, ay2), max(by1, by2))
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    a_area = abs((ax2 - ax1) * (ay2 - ay1))
    b_area = abs((bx2 - bx1) * (by2 - by1))
    union = a_area + b_area - inter
    return inter / union if union > 0 else 0.0


def _point_to_segment_distance(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return ((px - proj_x) ** 2 + (py - proj_y) ** 2) ** 0.5


def _is_near_any_wall(cx: float, cy: float, walls: list, max_dist: float) -> bool:
    if not walls:
        return False
    for w in walls:
        start = w.get("start") or {}
        end = w.get("end") or {}
        x1, y1 = float(start.get("x", 0)), float(start.get("y", 0))
        x2, y2 = float(end.get("x", 0)), float(end.get("y", 0))
        if _point_to_segment_distance(cx, cy, x1, y1, x2, y2) <= max_dist:
            return True
    return False


def _distance_to_nearest_wall_endpoint(cx: float, cy: float, walls: list) -> float:
    best = float("inf")
    for w in walls or []:
        start = w.get("start") or {}
        end = w.get("end") or {}
        for p in (start, end):
            px, py = float(p.get("x", 0)), float(p.get("y", 0))
            d = ((cx - px) ** 2 + (cy - py) ** 2) ** 0.5
            if d < best:
                best = d
    return best




def _augment_doors_from_object_detections(doors: list, objects: list) -> tuple[list, list, int]:
    augmented_doors = list(doors or [])
    kept_objects = []
    added = 0

    for obj in objects or []:
        cls = _normalize_class_name(obj.get("class"))
        bbox = obj.get("bbox") if isinstance(obj.get("bbox"), dict) else None
        if not bbox:
            kept_objects.append(obj)
            continue

        if "door" not in cls:
            kept_objects.append(obj)
            continue

        duplicate = False
        for d in augmented_doors:
            db = d.get("bbox") if isinstance(d.get("bbox"), dict) else None
            if not db:
                continue
            if _bbox_iou(bbox, db) >= 0.45:
                duplicate = True
                break
        if duplicate:
            continue

        candidate = {**obj, "bbox": bbox, "source": "object-door-fallback"}
        augmented_doors.append(candidate)
        added += 1

    return augmented_doors, kept_objects, added


def _is_duplicate_object_add(new_data: dict, existing_objects: list, iou_thresh: float = 0.5) -> bool:
    if not new_data:
        return False
    new_bbox = new_data.get("bbox")
    new_cls = _normalize_class_name(new_data.get("class"))
    if not new_bbox or not new_cls:
        return False
    for o in existing_objects or []:
        old_bbox = o.get("bbox")
        old_cls = _normalize_class_name(o.get("class"))
        if old_bbox and old_cls == new_cls and _bbox_iou(new_bbox, old_bbox) >= iou_thresh:
            return True
    return False


def _group_detected_objects(objects: list) -> tuple[dict, dict]:
    groups = {
        "rooms": [],
        "windows": [],
        "glass_grills": [],
        "glass_banisters": [],
        "stairs": [],
        "lifts": [],
        "fixtures": [],
    }
    by_class = {}

    for obj in objects or []:
        cls_raw = obj.get("class") or "unknown"
        cls = _normalize_class_name(cls_raw)
        by_class[cls_raw] = by_class.get(cls_raw, 0) + 1

        if "door" in cls:
            continue
        if "grill" in cls:
            groups["glass_grills"].append(obj)
            continue
        if "banister" in cls or "railing" in cls or "balustrade" in cls:
            groups["glass_banisters"].append(obj)
            continue
        if "window" in cls:
            groups["windows"].append(obj)
            continue
        if "pillar" in cls or "column" in cls:
            continue  # pillars removed
        if "stair" in cls:
            groups["stairs"].append(obj)
            continue
        if cls == "lift" or "elevator" in cls:
            groups["lifts"].append(obj)
            continue
        if cls in ROOM_LABEL_CLASSES or cls.endswith(" room"):
            groups["rooms"].append(obj)
            continue
        groups["fixtures"].append(obj)

    summary = {
        "walls": None,
        "doors": None,
        "objects_total": len(objects or []),
        "rooms": len(groups["rooms"]),
        "windows": len(groups["windows"]),
        "glass_grills": len(groups["glass_grills"]),
        "glass_banisters": len(groups["glass_banisters"]),
        "stairs": len(groups["stairs"]),
        "lifts": len(groups["lifts"]),
        "fixtures": len(groups["fixtures"]),
        "objects_by_class": by_class,
    }
    return groups, summary


class Handler(BaseHTTPRequestHandler):
    def _send(self, status=200, payload=None):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "http://localhost:5173")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()
        if payload is not None:
            self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_GET(self):
        path = self.path.split("?")[0]

        if path == '/api/health':
            self._send(200, scan_runtime_info())
            return

        if path == "/api/stats" and DB_AVAILABLE:
            try:
                stats = DB.get_stats()
                # Make datetime serializable
                if stats.get("last_training"):
                    for k, v in stats["last_training"].items():
                        if hasattr(v, "isoformat"):
                            stats["last_training"][k] = v.isoformat()
                self._send(200, stats)
            except Exception as e:
                self._send(500, {"error": str(e)})
            return

        if path == "/api/floor-plans" and DB_AVAILABLE:
            try:
                fps = DB.get_all_floor_plans()
                for fp in fps:
                    for k, v in fp.items():
                        if hasattr(v, "isoformat"):
                            fp[k] = v.isoformat()
                self._send(200, {"floor_plans": fps})
            except Exception as e:
                self._send(500, {"error": str(e)})
            return

        if path == "/api/training-status" and DB_AVAILABLE:
            self._send(200, {"is_training": auto_trainer.is_training()})
            return

        self._send(200, {
            **scan_runtime_info(),
            "db_enabled": DB_AVAILABLE,
            "endpoints": [
                "/api/health (GET)",
                "/api/train (POST)",
                "/api/auto-detect (POST)",
                "/api/save (POST)",
                "/api/correct (POST)",
                "/api/stats (GET)",
                "/api/floor-plans (GET)",
                "/api/training-status (GET)",
            ],
            "models": {
                "wall_yolo": YOLO_WEIGHTS.exists(),
                "door_yolo": DOOR_YOLO_WEIGHTS.exists(),
                "room_object_yolo": ROOM_OBJECT_YOLO_WEIGHTS.exists(),
                "window_glass_yolo": WINDOW_GLASS_YOLO_WEIGHTS.exists(),
                "combined_fallback": COMBINED_WEIGHTS.exists(),
            },
        })

    def do_OPTIONS(self):
        self._send(200, {})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
        except (ValueError, TypeError):
            self._send(400, {"error": "Invalid Content-Length"})
            return
        if length < 0:
            self._send(400, {"error": "Invalid Content-Length"})
            return
        if length > MAX_BODY_SIZE:
            self._send(413, {"error": "Request body too large"})
            return
        try:
            body = self.rfile.read(length).decode("utf-8")
            data = json.loads(body) if body else {}
            if not isinstance(data, dict):
                raise ValueError("Expected a JSON object")
        except (ValueError, UnicodeError):
            self._send(400, {"error": "Request body must be a valid JSON object"})
            return
        path = self.path

        # ---- AI Chat Assistant ----
        if path == "/api/ai-chat":
            if not AI_AVAILABLE:
                self._send(200, {"message": "AI not available. Install: pip install google-generativeai", "actions": []})
                return
            try:
                user_msg = data.get("message", "")
                layout = data.get("layout", {})
                history = data.get("history", [])
                command = data.get("command")  # optional: "detect_rooms", "auto_furnish", "design"

                if command == "detect_rooms":
                    result = AI.detect_rooms_from_layout(layout)
                elif command == "auto_furnish":
                    rooms_result = AI.detect_rooms_from_layout(layout)
                    rooms = rooms_result.get("rooms", [])
                    result = AI.auto_furnish(rooms)
                    result["rooms"] = rooms
                    result["message"] = rooms_result["message"] + "\n\n" + result["message"]
                elif command == "design":
                    style = data.get("style", "modern")
                    result = AI.suggest_design(style, layout)
                else:
                    result = AI.chat(user_msg, layout, history)

                self._send(200, result)
            except Exception as e:
                traceback.print_exc()
                self._send(500, {"message": f"AI error: {str(e)}", "actions": []})
            return

        # ---- Save corrections to DB only (called by View in 3D) ----
        if path == "/api/save-corrections":
            if not DB_AVAILABLE:
                self._send(200, {"status": "ok", "db_saved": False, "reason": "DB not available"})
                return
            try:
                image_base64 = data.get("imageBase64")
                walls_data = [normalize_wall(w) for w in data.get("walls", []) if w.get("start") and w.get("end")]
                doors_data = data.get("doors", [])
                fp_id = data.get("floor_plan_id")

                # Decode image for embedding
                img_for_emb = None
                if image_base64:
                    header, b64d = image_base64.split(",", 1) if "," in image_base64 else ("", image_base64)
                    arr = np.frombuffer(base64.b64decode(b64d), dtype=np.uint8)
                    img_for_emb = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                elif data.get("imagePath"):
                    img_path = resolve_image_path(data["imagePath"])
                    img_for_emb = load_image(str(img_path))

                # Compute YOLO embedding and create/find floor plan
                if img_for_emb is not None:
                    correction_weights = _effective_weights(YOLO_WEIGHTS)
                    yolo_path = str(correction_weights) if correction_weights else None
                    img_embedding = EMB.compute_embedding(img_for_emb, yolo_path) if EMB else None
                    img_h, img_w = img_for_emb.shape[:2]

                    if not fp_id:
                        if image_base64:
                            saved_path = auto_trainer.save_uploaded_image_cv(img_for_emb, "correction.jpg")
                        else:
                            saved_path = str(resolve_image_path(data.get("imagePath", "")))
                        hash_ok, hash_buffer = cv2.imencode('.jpg', img_for_emb)
                        correction_hash = hashlib.sha256(hash_buffer.tobytes()).hexdigest() if hash_ok else None
                        fp_id = DB.save_floor_plan("correction", saved_path, img_w, img_h,
                                                   image_hash=correction_hash, embedding=img_embedding)
                        DB.update_floor_plan_status(fp_id, "detected")
                    else:
                        # Update embedding on existing floor plan
                        if img_embedding is not None:
                            DB.save_embedding(fp_id, img_embedding)

                    if walls_data:
                        DB.save_walls(fp_id, walls_data, source="corrected")
                    if doors_data:
                        DB.save_doors(fp_id, doors_data, source="corrected")

                    # A few edited segments are not a complete training label set.
                    # Saving/viewing a plan must not silently retrain on partial labels.
                    if AUTO_TRAIN_ON_CORRECTION and walls_data:
                        auto_trainer.trigger_auto_train("correction", fp_id, model_type="wall_yolo")
                    if AUTO_TRAIN_ON_CORRECTION and doors_data:
                        auto_trainer.trigger_auto_train("correction", fp_id, model_type="door_yolo")
                    emb_dim = len(img_embedding) if img_embedding is not None else 0
                    print(f"[save-corrections] fp_id={fp_id}, emb_dim={emb_dim}, walls={len(walls_data)}, doors={len(doors_data)}")

                    self._send(200, {"status": "ok", "db_saved": True, "floor_plan_id": fp_id})
                else:
                    self._send(400, {"error": "No image provided"})
            except Exception as e:
                traceback.print_exc()
                self._send(500, {"error": str(e)})
            return

        if path == "/api/train":
            walls = [normalize_wall(w) for w in data.get("walls", []) if w.get("start") and w.get("end")]
            image_path = data.get("imagePath")
            if walls:
                append_label({"imagePath": image_path, "walls": walls})
            labels = read_labels()
            if not labels:
                self._send(400, {"error": "No training data yet."})
                return
            combined = combined_walls(labels, image_path)
            if not combined:
                combined = labels[-1].get("walls", [])
            img_path = resolve_image_path(image_path or labels[-1].get("imagePath"))
            image = load_image(str(img_path))
            params, score, detected_count = train_params(image, combined)
            save_params(PARAMS_FILE, params, score, detected_count)
            # Save corrections to DB (walls + doors with image hash)
            if DB_AVAILABLE:
                try:
                    fp_id = data.get("floor_plan_id")
                    image_base64 = data.get("imageBase64")
                    train_doors = data.get("doors", [])

                    # If no fp_id but we have an image, create a new floor plan entry with hash
                    if not fp_id and (image_base64 or image):
                        img_for_hash = image
                        if image_base64 and img_for_hash is None:
                            header, b64d = image_base64.split(",", 1) if "," in image_base64 else ("", image_base64)
                            arr = np.frombuffer(base64.b64decode(b64d), dtype=np.uint8)
                            img_for_hash = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                        if img_for_hash is not None:
                            img_hash = hashlib.sha256(cv2.imencode('.jpg', img_for_hash)[1].tobytes()).hexdigest()
                            img_h, img_w = img_for_hash.shape[:2]
                            if image_base64:
                                saved_path = auto_trainer.save_uploaded_image_cv(img_for_hash, "correction.jpg")
                            else:
                                saved_path = str(img_path)
                            fp_id = DB.save_floor_plan("correction", saved_path, img_w, img_h, image_hash=img_hash)
                            DB.update_floor_plan_status(fp_id, "detected")

                    if fp_id:
                        if walls:
                            DB.save_walls(fp_id, walls, source="corrected")
                        if train_doors:
                            DB.save_doors(fp_id, train_doors, source="corrected")
                        if walls:
                            auto_trainer.trigger_auto_train("correction", fp_id, model_type="wall_yolo")
                        if train_doors:
                            auto_trainer.trigger_auto_train("correction", fp_id, model_type="door_yolo")
                        print(f"[train] Saved corrections to DB: fp_id={fp_id}, walls={len(walls)}, doors={len(train_doors)}")
                except Exception as db_err:
                    print(f"[train] DB save failed (non-fatal): {db_err}")
                    traceback.print_exc()

            self._send(200, {
                "params": params,
                "score": score,
                "detected_count": detected_count,
                "trained_wall_count": len(combined),
            })
            return

        if path == "/api/auto-detect":
            image_base64 = data.get("imageBase64")
            image_path = data.get("imagePath")
            if image_base64:
                # Uploaded image: decode base64 data URL
                print(f"[auto-detect] Received base64 image ({len(image_base64)} chars)")
                header, b64data = image_base64.split(",", 1) if "," in image_base64 else ("", image_base64)
                img_bytes = base64.b64decode(b64data)
                arr = np.frombuffer(img_bytes, dtype=np.uint8)
                image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if image is None:
                    self._send(400, {"error": "Failed to decode uploaded image"})
                    return
                print(f"[auto-detect] Decoded image: {image.shape}")
            else:
                img_path = resolve_image_path(image_path)
                image = load_image(str(img_path))
                if image is None:
                    self._send(400, {"error": f"Could not load image: {image_path}"})
                    return
                print(f"[auto-detect] Loaded image from path: {img_path} shape={image.shape}")
            params = load_params(PARAMS_FILE)
            use_yolo = data.get("useYolo", True)
            use_door_yolo = data.get("useDoorYolo", True)
            # Recognized dimension rules must not become paired wall faces.
            measurements = extract_plan_measurements(image)
            lines = []
            model_used = "cv"
            _wall_w = _effective_weights(YOLO_WEIGHTS)
            if use_yolo and _wall_w:
                lines = detect_lines_yolo(image, str(_wall_w), conf=WALL_YOLO_CONF)
                if lines:
                    model_used = "yolo+cv"
                    # Supplement YOLO with CV to catch walls the model missed
                    cv_lines = detect_lines(image, params, measurements=measurements)
                    lines = consolidate_walls(lines + cv_lines, image=image)
            if not lines:
                lines = detect_lines(image, params, measurements=measurements)
            # Opening-aware evidence assessment below owns final geometry. Do
            # not snap blindly before doors/windows have been detected.
            lines = consolidate_walls(lines, image=image)
            lines = classify_wall_types(image, lines)
            doors = []
            _door_w = _effective_weights(DOOR_YOLO_WEIGHTS)
            door_classes = yolo_class_ids(str(_door_w), "door") if use_door_yolo and _door_w else []
            if door_classes:
                doors = detect_boxes_yolo(image, str(_door_w), conf=DOOR_YOLO_CONF, classes=door_classes)
            # Room & object detection
            use_room_object = data.get("useRoomObject", True)
            rooms_and_objects = []
            if use_room_object and ROOM_OBJECT_YOLO_WEIGHTS.exists():
                rooms_and_objects = detect_classified_boxes_yolo(
                    image,
                    str(ROOM_OBJECT_YOLO_WEIGHTS),
                    conf=ROOM_OBJECT_YOLO_CONF,
                    image_sizes=(640, 960),
                )
                # The object model sometimes learns the printed "STAIR CASE"
                # label instead of the structure. Never turn text alone into a
                # 3D staircase; require a regular run of visible treads.
                rooms_and_objects = [
                    obj for obj in rooms_and_objects
                    if "stair" not in _normalize_class_name(obj.get("class"))
                    or has_stair_tread_geometry(image, obj.get("bbox"))
                ]
            # Window/glass detection — dedicated model, kept separate from room_object_yolo
            # so thin structural elements aren't starved of capacity by furniture/room classes.
            # Falls back to combined model class 2 until window_glass_best.pt is trained.
            use_window_glass = data.get("useWindowGlass", True)
            _win_w = _effective_weights(WINDOW_GLASS_YOLO_WEIGHTS)
            window_classes = yolo_class_ids(str(_win_w), "window") if use_window_glass and _win_w else []
            if window_classes:
                window_glass_objects = detect_classified_boxes_yolo(
                    image,
                    str(_win_w),
                    conf=WINDOW_GLASS_YOLO_CONF,
                    classes=window_classes,
                )
                rooms_and_objects = rooms_and_objects + window_glass_objects
            # Floor plans conventionally mark stairs with an UP/DN label and a
            # run of parallel treads.  Use that strong local evidence when the
            # general object model misses the structural element.
            stair_fallbacks = detect_stairs(image)
            wall_stairs = detect_stairs_from_walls(lines, image.shape)
            image_stairs = [stair for stair in detect_stairs_from_image(image)
                            if len(stair.get("tread_directions", [])) >= 2
                            or any(_bbox_iou(stair["bbox"], known["bbox"]) >= 0.30 for known in wall_stairs)]
            geometric_stairs = wall_stairs + image_stairs
            # Reject repeated wardrobe/cabinet slats when the object model has
            # already identified the containing furniture footprint.
            furnishing_boxes = [obj.get("bbox") for obj in rooms_and_objects
                                if obj.get("bbox") and not any(token in _normalize_class_name(obj.get("class"))
                                for token in ("stair", "room", "area"))]
            geometric_stairs = [stair for stair in geometric_stairs if not any(
                _bbox_iou(stair["bbox"], box) >= 0.45 for box in furnishing_boxes)]
            stair_fallbacks.extend(
                stair for stair in geometric_stairs
                if not any(_bbox_iou(stair["bbox"], old["bbox"]) >= 0.35 for old in stair_fallbacks)
            )
            for stair in stair_fallbacks:
                if not any(
                    "stair" in _normalize_class_name(obj.get("class"))
                    and _bbox_iou(stair["bbox"], obj.get("bbox") or {}) >= 0.30
                    for obj in rooms_and_objects
                ):
                    rooms_and_objects.append(stair)
            if stair_fallbacks:
                print(f"[auto-detect] OCR/tread fallback found {len(stair_fallbacks)} stair run(s)")
            doors, rooms_and_objects, object_door_added = _augment_doors_from_object_detections(
                doors, rooms_and_objects
            )
            if object_door_added > 0:
                print(f"[auto-detect] Added {object_door_added} door(s) from object-model fallback")
            doors_before_merge = len(doors)
            doors = deduplicate_doors(doors)
            if len(doors) < doors_before_merge:
                print(f"[auto-detect] Removed {doors_before_merge - len(doors)} duplicate door detection(s) "
                      f"using opening geometry: {doors_before_merge} -> {len(doors)}")
            # Only load seed walls for known image paths, not uploaded images
            seed_walls = []
            if not image_base64 and image_path:
                labels = read_labels()
                seed_walls = combined_walls(labels, image_path)
                seed_walls = classify_wall_types(image, seed_walls)

            # Compute YOLO embedding for similarity-based image memory
            _emb_w = _effective_weights(YOLO_WEIGHTS)
            yolo_path = str(_emb_w) if _emb_w else None
            img_embedding = EMB.compute_embedding(image, yolo_path) if EMB else None

            # SHA-256 hash of the raw image bytes for exact-match lookup
            try:
                _enc_ok, _enc_buf = cv2.imencode('.jpg', image)
                img_hash = hashlib.sha256(_enc_buf.tobytes()).hexdigest() if _enc_ok else None
            except Exception:
                img_hash = None

            db_walls = []
            db_doors = []
            db_objects = []
            fp_id = None
            match_type = None
            ai_review = {"enabled": CLOUD_DETECTION_REVIEW_ENABLED, "applied": False, "corrections_count": 0, "summary": None, "error": None}
            adk_evaluation = None

            if DB_AVAILABLE:
                try:
                    # Only exact image matches can supply geometry corrections.
                    prev_data = None
                    if img_hash:
                        hash_fp = DB.get_floor_plan_by_hash(img_hash)
                        if hash_fp:
                            prev_data = DB.get_data_by_floor_plan_id(hash_fp["id"])
                            if prev_data:
                                print(f"[auto-detect] Exact hash match fp_id={hash_fp['id']}: "
                                      f"{len(prev_data.get('walls', []))} walls, {len(prev_data.get('doors', []))} doors")
                    # Similar-looking plans may be resized, cropped or different.
                    # Pixel coordinates are reusable only for an exact image match.
                    if prev_data:
                        db_walls = prev_data.get("walls", [])
                        db_doors = prev_data.get("doors", [])
                        db_objects = prev_data.get("objects", [])
                        match_type = prev_data.get("match_type", "unknown")
                    else:
                        print("[auto-detect] No exact image match — fresh local detection")

                    # Save this detection to DB with embedding + hash
                    filename = data.get("filename", "upload.jpg")
                    if image_base64:
                        saved_path = auto_trainer.save_uploaded_image_cv(image, filename)
                    else:
                        saved_path = str(resolve_image_path(image_path))
                    img_h, img_w = image.shape[:2]
                    fp_id = DB.save_floor_plan(filename, saved_path, img_w, img_h,
                                               image_hash=img_hash,
                                               embedding=img_embedding)
                    DB.update_floor_plan_status(fp_id, "detected")
                    wall_dicts = [
                        {"start": l["start"], "end": l["end"], "wall_type": l.get("wall_type", "interior")}
                        for l in lines
                    ]
                    wall_ids = DB.save_walls(fp_id, wall_dicts, source="auto") if lines else []
                    door_ids = DB.save_doors(fp_id, doors, source="auto") if doors else []
                    object_ids = DB.save_objects(fp_id, rooms_and_objects, source="auto") if rooms_and_objects else []
                    # Trigger auto-training in background, per entity type actually present
                    if AUTO_TRAIN_ON_DETECT:
                        if lines:
                            auto_trainer.trigger_auto_train("upload", fp_id, model_type="wall_yolo")
                        if doors:
                            auto_trainer.trigger_auto_train("upload", fp_id, model_type="door_yolo")
                        if rooms_and_objects:
                            auto_trainer.trigger_auto_train("upload", fp_id, model_type="room_object_yolo")
                        if any(auto_trainer.map_class_name_to_window_glass_index(o.get("class")) is not None
                               for o in rooms_and_objects):
                            auto_trainer.trigger_auto_train("upload", fp_id, model_type="window_glass_yolo")
                    else:
                        print("[auto-train] Skipping upload retrain during auto-detect (AUTO_TRAIN_ON_DETECT=0)")
                    print(f"[auto-detect] Saved to DB: fp_id={fp_id}, emb_dim={len(img_embedding) if img_embedding is not None else 0}, walls={len(lines)}, doors={len(doors)}, objects={len(rooms_and_objects)}")

                    # Hybrid step: have Gemini visually cross-check the YOLO detections
                    # (fix wrong labels, find missed objects) and feed its corrections back
                    # through the same path a human correction would use.
                    if CLOUD_DETECTION_REVIEW_ENABLED and AI_AVAILABLE and (lines or doors or rooms_and_objects) and _enc_ok:
                        try:
                            if ADK_PIPELINE_ENABLED and ADK_AVAILABLE:
                                pipeline_result = ADK_PIPELINE.run_detection_review(
                                    ai_module=AI,
                                    image_bytes=_enc_buf.tobytes(),
                                    walls=wall_dicts,
                                    doors=doors,
                                    objects=rooms_and_objects,
                                    max_review_objects=AI_REVIEW_MAX_OBJECTS,
                                    structural_pass_enabled=AI_STRUCTURAL_PASS_ENABLED,
                                )
                                all_corrections = list(pipeline_result.get("corrections", []))
                                merged_summary = pipeline_result.get("summary")
                                merged_error = pipeline_result.get("error")
                                adk_evaluation = pipeline_result.get("metrics")
                            else:
                                review_objects = rooms_and_objects
                                if len(review_objects) > AI_REVIEW_MAX_OBJECTS:
                                    review_objects = review_objects[:AI_REVIEW_MAX_OBJECTS]
                                    print(
                                        f"[auto-detect] AI review limited to first {len(review_objects)} "
                                        f"objects out of {len(rooms_and_objects)}"
                                    )
                                review = AI.review_detections_with_vision(
                                    _enc_buf.tobytes(), wall_dicts, doors, review_objects
                                )
                                structural_review = {"corrections": [], "summary": None, "error": None}
                                if AI_STRUCTURAL_PASS_ENABLED and hasattr(AI, "review_structural_elements_with_vision"):
                                    structural_review = AI.review_structural_elements_with_vision(_enc_buf.tobytes())
                                all_corrections = list(review.get("corrections", [])) + list(
                                    structural_review.get("corrections", [])
                                )
                                merged_summary = " ".join(
                                    s for s in [review.get("summary"), structural_review.get("summary")] if s
                                ) or None
                                merged_error = "; ".join(
                                    e for e in [review.get("error"), structural_review.get("error")] if e
                                ) or None

                            id_lists = {"wall": wall_ids, "door": door_ids, "object": object_ids}
                            source_lists = {"wall": wall_dicts, "door": doors, "object": rooms_and_objects}
                            touched_entities = set()
                            touched_ai_classes = set()
                            applied_count = 0
                            for corr in all_corrections:
                                et = corr.get("entity_type")
                                action = corr.get("action")
                                idx = corr.get("index")
                                id_list = id_lists.get(et, [])
                                entity_id, old_data = None, None
                                if action in ("modify", "delete"):
                                    if idx is None or not (0 <= idx < len(id_list)):
                                        continue  # can't map to a real row, skip safely
                                    entity_id = id_list[idx]
                                    src_list = source_lists.get(et, [])
                                    old_data = src_list[idx] if idx < len(src_list) else None
                                new_data = None
                                if action in ("add", "modify"):
                                    bbox = corr.get("bbox")
                                    if et == "wall" and bbox:
                                        new_data = {
                                            "start": {"x": bbox.get("x1", 0), "y": bbox.get("y1", 0)},
                                            "end": {"x": bbox.get("x2", 0), "y": bbox.get("y2", 0)},
                                        }
                                    elif et in ("door", "object") and bbox:
                                        new_data = {"bbox": bbox}
                                        if corr.get("class"):
                                            new_data["class"] = corr["class"]
                                if et not in ("wall", "door", "object"):
                                    continue
                                if et in ("wall", "door") and action in ("add", "modify") and not new_data:
                                    continue
                                if et == "object" and action in ("add", "modify") and (
                                    not new_data or not new_data.get("class")
                                ):
                                    continue
                                if et == "object" and action == "add" and _is_duplicate_object_add(
                                    new_data, source_lists.get("object", []), iou_thresh=0.25
                                ):
                                    continue
                                if (
                                    et == "object" and action == "add" and new_data
                                    and "pillar" in _normalize_class_name(new_data.get("class", ""))
                                ):
                                    continue  # pillar additions blocked
                                applied_et = _apply_correction(
                                    fp_id, et, action, entity_id, old_data, new_data, proposed_by="ai"
                                )
                                if applied_et:
                                    touched_entities.add(applied_et)
                                    if applied_et == "object" and new_data:
                                        touched_ai_classes.add(new_data.get("class"))
                                    applied_count += 1
                                    # Reflect corrections immediately in API response payload.
                                    if et == "wall":
                                        replacement = {
                                            "start": new_data["start"], "end": new_data["end"]
                                        } if new_data else None
                                    elif et == "door":
                                        replacement = {"bbox": new_data["bbox"]} if new_data else None
                                    else:  # object
                                        replacement = {
                                            "class": new_data["class"],
                                            "bbox": new_data["bbox"],
                                            "confidence": 0.75,
                                            "source": "ai",
                                        } if new_data else None
                                    _apply_correction_to_list(
                                        source_lists.get(et, []), action, idx, replacement
                                    )
                            if touched_entities:
                                _trigger_retrain_for_entities(fp_id, touched_entities, touched_ai_classes)
                            ai_review = {
                                "applied": applied_count > 0,
                                "corrections_count": applied_count,
                                "summary": merged_summary,
                                "error": merged_error,
                            }
                            print(
                                f"[auto-detect] AI vision review: {applied_count} corrections applied"
                                + (f" (error: {merged_error})" if merged_error else "")
                            )
                        except Exception as ai_err:
                            print(f"[auto-detect] AI vision review failed (non-fatal): {ai_err}")
                            ai_review["error"] = str(ai_err)
                except Exception as db_err:
                    print(f"[auto-detect] DB save failed (non-fatal): {db_err}")
                    traceback.print_exc()

            # Always merge fresh YOLO detection with saved corrections.
            # Corrections must belong to this exact image and retain user priority.
            if db_walls or db_doors:
                final_walls = merge_yolo_with_corrections(lines, db_walls, image=image)
                final_doors = merge_yolo_with_correction_doors(doors, db_doors)
                print(f"[auto-detect] Merged: YOLO {len(lines)} + corrections {len(final_walls)-len(lines)} = {len(final_walls)} walls, "
                      f"YOLO {len(doors)} + corrections {len(final_doors)-len(doors)} = {len(final_doors)} doors")
            else:
                final_walls = lines
                final_doors = doors
                print(f"[auto-detect] Fresh YOLO only: {len(lines)} walls, {len(doors)} doors")

            # Seed labels and the current editor's manual walls participate in the
            # same final cleanup, rather than being appended again by the browser.
            editor_walls = [{**w, "source": "manual"} for w in data.get("manualWalls", [])
                            if isinstance(w, dict)]
            seeds = [{**w, "source": "seed"} for w in seed_walls]
            final_walls = consolidate_walls(editor_walls + seeds + final_walls, image=image)
            final_walls = classify_wall_types(image, final_walls)

            # Detect swing direction for each door using CV arc analysis
            for door in final_doors:
                if door.get('swing_dir') or door.get('swingDir'):
                    door['swingDir'] = door.get('swing_dir') or door['swingDir']
                elif door.get('bbox'):
                    door['swingDir'] = detect_door_swing(image, door.get('swing_bbox') or door['bbox'])
                else:
                    door['swingDir'] = 'left-inside'

            # Objects can also have DB corrections (manual or AI). Merge them similarly.
            if db_objects:
                corrected_objects = [
                    o for o in db_objects
                    if (o.get("source") or "").lower() in ("corrected", "manual")
                ]
                final_objects = list(rooms_and_objects) + corrected_objects
            else:
                final_objects = rooms_and_objects

            # Furniture outlines and stair treads are common false wall lines in
            # furnished/color plans. Remove only automatic segments contained
            # well inside a detected object; preserve perimeter and manual walls.
            final_walls = exclude_object_interior_walls(final_walls, final_objects)

            grouped_objects, detection_summary = _group_detected_objects(final_objects)
            detection_summary["walls"] = len(final_walls)
            detection_summary["doors"] = len(final_doors)

            structural_counts = {
                cls: sum(1 for o in final_objects if _normalize_class_name(o.get("class")) == cls)
                for cls in ("window", "glass-window", "glass-wall", "glass-grill", "glass-banister", "stairs", "lift")
            }
            print(f"[auto-detect] Structural class counts: {structural_counts} "
                  f"(walls={len(final_walls)})")
            if len(final_walls) == 0:
                print("[auto-detect] WARNING: zero walls detected by both YOLO and the CV "
                      "fallback for this image — check input image style vs. training domain.")

            scale_estimate = estimate_scale_from_doors(final_doors)
            final_walls = exclude_dimension_walls(final_walls, measurements)
            evidence = assess_walls(image,
                final_walls + paired_wall_proposals(image, measurements),
                measurements, final_objects, final_doors)
            final_walls = evidence['walls']
            detection_summary['walls'] = len(final_walls)
            try:
                room_scan = detect_room_boundaries(image, final_walls, final_doors, final_objects, measurements)
                # Inside room faces and rendered wall faces must use the same
                # measured stroke widths, including fallback image samples.
                for sample in room_scan.get('wall_thicknesses', []):
                    wall = final_walls[sample['wall_index']]
                    if not isinstance(wall.get('thickness_px'), (int, float)) or not np.isfinite(wall['thickness_px']) or wall['thickness_px'] <= 0:
                        wall['thickness_px'] = sample['thickness_px']
            except Exception:
                traceback.print_exc()
                room_scan = {'rooms': [], 'unresolved': [], 'warnings': [
                    'Automatic room boundaries could not be resolved. Wall detections are available; correct missing walls and rescan.'
                ]}

            self._send(200, {
                "walls": final_walls,
                "wall_review": evidence['wall_review'],
                "wall_rejected": evidence['wall_rejected'],
                "wall_geometry": evidence['wall_geometry'],
                "scan_api_version": SCAN_API_VERSION,
                "seedWalls": seed_walls,
                "walls_include_seeds": True,
                "params": params,
                "model": model_used,
                "floor_plan_id": fp_id,
                "db_saved": fp_id is not None,
                "db_corrections_loaded": len(db_walls) > 0 or len(db_doors) > 0,
                "detection_provenance": {
                    "mode": "fresh_detector_with_saved_corrections"
                    if (db_walls or db_doors) else "fresh_detector",
                    "database_enabled": DB_AVAILABLE,
                    "database_saved": fp_id is not None,
                    "saved_corrections_loaded": len(db_walls) > 0 or len(db_doors) > 0,
                    "manual_walls_preserved": len(editor_walls),
                },
                "yolo_weights": str(_wall_w) if _wall_w else None,
                "door_weights": str(_door_w) if _door_w else None,
                "room_object_weights": str(ROOM_OBJECT_YOLO_WEIGHTS) if ROOM_OBJECT_YOLO_WEIGHTS.exists() else None,
                "window_glass_weights": str(_win_w) if _win_w else None,
                "doors": final_doors,
                "rooms_detected": grouped_objects["rooms"],
                "windows": grouped_objects["windows"],
                "glass_grills": grouped_objects["glass_grills"],
                "glass_banisters": grouped_objects["glass_banisters"],
                "pillars": [],
                "stairs": grouped_objects["stairs"],
                "lifts": grouped_objects["lifts"],
                "fixtures": grouped_objects["fixtures"],
                "rooms_and_objects": final_objects,
                "detected_count": len(final_walls),
                "seed_count": len(seed_walls),
                "scale_estimate": scale_estimate,
                "measurements": measurements,
                "room_boundaries": room_scan['rooms'],
                "room_scan": {key: value for key, value in room_scan.items() if key != 'rooms'},
                "ai_review": ai_review,
                "adk_pipeline_enabled": ADK_PIPELINE_ENABLED and ADK_AVAILABLE,
                "adk_evaluation": adk_evaluation,
                "detection_summary": detection_summary,
            })
            return

        # ---- Save detections to DB & trigger auto-training ----
        if path == "/api/save" and DB_AVAILABLE:
            try:
                image_base64 = data.get("imageBase64")
                filename = data.get("filename", "upload.jpg")
                walls = data.get("walls", [])
                doors = data.get("doors", [])
                objects_ = data.get("objects", [])

                # Decode and save image
                if image_base64:
                    header, b64data = image_base64.split(",", 1) if "," in image_base64 else ("", image_base64)
                    img_bytes = base64.b64decode(b64data)
                    arr = np.frombuffer(img_bytes, dtype=np.uint8)
                    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                    image_path = auto_trainer.save_uploaded_image_cv(image, filename)
                    img_h, img_w = image.shape[:2]
                else:
                    image_path = data.get("imagePath", "")
                    img_w, img_h = data.get("imageWidth", 0), data.get("imageHeight", 0)

                # Save to DB
                fp_id = DB.save_floor_plan(filename, image_path, img_w, img_h)
                DB.update_floor_plan_status(fp_id, "detected")

                if walls:
                    DB.save_walls(fp_id, walls, source="auto")
                if doors:
                    DB.save_doors(fp_id, doors, source="auto")
                if objects_:
                    DB.save_objects(fp_id, objects_, source="auto")

                # Trigger auto-training in background, per entity type actually present
                if walls:
                    auto_trainer.trigger_auto_train("upload", fp_id, model_type="wall_yolo")
                if doors:
                    auto_trainer.trigger_auto_train("upload", fp_id, model_type="door_yolo")
                if objects_:
                    auto_trainer.trigger_auto_train("upload", fp_id, model_type="room_object_yolo")
                if any(auto_trainer.map_class_name_to_window_glass_index(o.get("class")) is not None
                       for o in objects_):
                    auto_trainer.trigger_auto_train("upload", fp_id, model_type="window_glass_yolo")

                self._send(200, {
                    "floor_plan_id": fp_id,
                    "saved": {"walls": len(walls), "doors": len(doors), "objects": len(objects_)},
                    "auto_training": auto_trainer.is_training(),
                })
            except Exception as e:
                traceback.print_exc()
                self._send(500, {"error": str(e)})
            return

        # ---- Save user corrections & trigger retraining ----
        if path == "/api/correct" and DB_AVAILABLE:
            try:
                fp_id = data.get("floor_plan_id")
                corrections = data.get("corrections", [])

                if not fp_id:
                    self._send(400, {"error": "floor_plan_id required"})
                    return

                entity_types_corrected = set()
                touched_classes = set()
                for c in corrections:
                    entity_type = _apply_correction(
                        fp_id,
                        c.get("entity_type"),
                        c.get("action"),
                        c.get("entity_id", 0),
                        c.get("old_data"),
                        c.get("new_data"),
                        proposed_by="human",
                    )
                    if entity_type:
                        entity_types_corrected.add(entity_type)
                        new_data = c.get("new_data")
                        if entity_type == "object" and new_data:
                            touched_classes.add(new_data.get("class"))

                _trigger_retrain_for_entities(fp_id, entity_types_corrected, touched_classes)

                self._send(200, {
                    "corrections_saved": len(corrections),
                    "auto_training": auto_trainer.is_training(),
                })
            except Exception as e:
                traceback.print_exc()
                self._send(500, {"error": str(e)})
            return

        self._send(404, {"error": "Unknown endpoint"})


def _handle_termination(signum, frame):
    # SIGTERM bypasses normal try/except in the training thread, which is how
    # training_logs rows ended up stuck in 'running' forever (see auto-train history).
    if DB_AVAILABLE:
        auto_trainer.mark_interrupted()
    raise SystemExit(0)


def main():
    signal.signal(signal.SIGTERM, _handle_termination)
    server = HTTPServer(("127.0.0.1", 5050), Handler)
    print("Self-train server running on http://localhost:5050")
    server.serve_forever()


if __name__ == "__main__":
    main()
