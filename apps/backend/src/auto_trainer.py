"""
Auto-trainer: triggers YOLO retraining automatically after uploads/corrections.
Runs in a background thread so the server stays responsive.

Covers all three production models (wall, door, room-and-object), fine-tuning
each from its current production weights and promoting the result only if it
passes a basic sanity check.
"""

import os
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Tuple

import cv2
import numpy as np
import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]

# Where uploaded images get saved
UPLOADS_DIR = REPO_ROOT / "apps" / "backend" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Training dataset output dirs
TRAIN_DATASET_DIR = REPO_ROOT / "apps" / "backend" / "train_dataset"
RUNS_DIR = TRAIN_DATASET_DIR / "runs"
BACKUP_DIR = TRAIN_DATASET_DIR / "backups"

# Weights paths (production — these get promoted into by a successful retrain)
WALL_WEIGHTS = REPO_ROOT / "apps" / "dataset" / "runs" / "wall_yolo" / "weights" / "best.pt"
DOOR_WEIGHTS = REPO_ROOT / "apps" / "door_detection_dataset" / "runs" / "door_yolo" / "weights" / "best.pt"
ROOM_OBJ_WEIGHTS = REPO_ROOT / "apps" / "room-and-object" / "runs" / "room_object_yolo" / "weights" / "best.pt"
WINDOW_GLASS_WEIGHTS = REPO_ROOT / "apps" / "window_glass_detection_dataset" / "runs" / "window_glass_yolo" / "weights" / "best.pt"

MODEL_TYPES = ("wall_yolo", "door_yolo", "room_object_yolo", "window_glass_yolo")

# Classes handled by the dedicated window/glass model instead of room_object_yolo.
# Kept tiny/thin structural elements out of the 50-class furniture+room model, where
# they were starved of capacity and training signal (see auto-train history).
WINDOW_GLASS_CLASSES = ("window", "glass-window", "glass-wall", "glass-grill", "glass-banister")

DATASET_DIRS = {
    "wall_yolo": TRAIN_DATASET_DIR / "wall",
    "door_yolo": TRAIN_DATASET_DIR / "door",
    "room_object_yolo": TRAIN_DATASET_DIR / "room_object",
    "window_glass_yolo": TRAIN_DATASET_DIR / "window_glass",
}

SOURCE_DATA_YAML = {
    "wall_yolo": REPO_ROOT / "apps" / "cubicasa5k_external" / "cubicasa5k-2-6" / "data.yaml",
    "door_yolo": REPO_ROOT / "apps" / "door_detection_dataset" / "data.yaml",
    "room_object_yolo": REPO_ROOT / "apps" / "room-and-object" / "data.yaml",
    "window_glass_yolo": REPO_ROOT / "apps" / "window_glass_detection_dataset" / "data.yaml",
}

PRODUCTION_WEIGHTS = {
    "wall_yolo": WALL_WEIGHTS,
    "door_yolo": DOOR_WEIGHTS,
    "room_object_yolo": ROOM_OBJ_WEIGHTS,
    "window_glass_yolo": WINDOW_GLASS_WEIGHTS,
}

ENTITY_TYPE_FOR_MODEL = {
    "wall_yolo": "wall",
    "door_yolo": "door",
    "room_object_yolo": "object",
    "window_glass_yolo": "object",
}

STOCK_BASE_WEIGHTS = "yolov8n.pt"

_training_lock = threading.Lock()
_is_training = False
_current_log_id = None  # training_logs row id for the in-flight run, if any


def mark_interrupted():
    """Mark the in-flight training run (if any) as failed instead of leaving it stuck
    in 'running' forever. SIGTERM bypasses Python's try/except entirely, so this must
    be called from an explicit signal handler (registered in train_server.py), not
    relied on as a regular exception path."""
    if _current_log_id is None:
        return
    try:
        from db import update_training_log
        update_training_log(
            _current_log_id, status="failed",
            error_message="Interrupted: process received a termination signal mid-run",
        )
    except Exception:
        pass

_ROOM_OBJECT_CLASS_INDEX = None  # lazy cache: {normalized_name: index}
_WINDOW_GLASS_CLASS_INDEX = None  # lazy cache: {normalized_name: index}


def is_training() -> bool:
    return _is_training


def save_uploaded_image(image_bytes: bytes, filename: str) -> str:
    """Save uploaded image to disk. Returns the file path."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = f"{ts}_{filename.replace('/', '_').replace(' ', '_')}"
    path = UPLOADS_DIR / safe_name
    with open(path, "wb") as f:
        f.write(image_bytes)
    return str(path)


def save_uploaded_image_cv(image: np.ndarray, filename: str) -> str:
    """Save a cv2 image to disk. Returns the file path."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = f"{ts}_{filename.replace('/', '_').replace(' ', '_')}"
    if not safe_name.lower().endswith((".jpg", ".jpeg", ".png")):
        safe_name += ".jpg"
    path = UPLOADS_DIR / safe_name
    cv2.imwrite(str(path), image)
    return str(path)


def _normalize_class_name(name: str) -> str:
    normalized = " ".join(name.strip().lower().split())
    synonyms = {
        "column": "pillar",
        "columns": "pillar",
        "pillars": "pillar",
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


def _load_room_object_class_index() -> dict:
    global _ROOM_OBJECT_CLASS_INDEX
    if _ROOM_OBJECT_CLASS_INDEX is None:
        with open(SOURCE_DATA_YAML["room_object_yolo"]) as f:
            names = yaml.safe_load(f)["names"]
        _ROOM_OBJECT_CLASS_INDEX = {
            _normalize_class_name(n): i for i, n in enumerate(names)
        }
    return _ROOM_OBJECT_CLASS_INDEX


def map_class_name_to_index(class_name: str):
    """Return the room-object class index for a DB class_name string, or None if unknown."""
    if not class_name:
        return None
    idx_map = _load_room_object_class_index()
    return idx_map.get(_normalize_class_name(class_name))


def _load_window_glass_class_index() -> dict:
    global _WINDOW_GLASS_CLASS_INDEX
    if _WINDOW_GLASS_CLASS_INDEX is None:
        with open(SOURCE_DATA_YAML["window_glass_yolo"]) as f:
            names = yaml.safe_load(f)["names"]
        _WINDOW_GLASS_CLASS_INDEX = {
            _normalize_class_name(n): i for i, n in enumerate(names)
        }
    return _WINDOW_GLASS_CLASS_INDEX


def map_class_name_to_window_glass_index(class_name: str):
    """Return the window/glass class index for a DB class_name string, or None if it's
    not one of WINDOW_GLASS_CLASSES."""
    if not class_name:
        return None
    normalized = _normalize_class_name(class_name)
    if normalized not in WINDOW_GLASS_CLASSES:
        return None
    return _load_window_glass_class_index().get(normalized)


def _bbox_to_yolo_line(cls_idx: int, x1: float, y1: float, x2: float, y2: float,
                        img_w: int, img_h: int):
    """Axis-aligned bbox -> 'cls cx cy w h' YOLO label line. Returns None for degenerate boxes.

    Clamps to image bounds first — some saved corrections (e.g. grid/auto-fill tools)
    produce coordinates outside [0, img_w]x[0, img_h], which previously produced
    out-of-range normalized values and got the whole image+label pair silently
    dropped as 'corrupt' by ultralytics during training.
    """
    x1 = min(max(x1, 0.0), img_w)
    x2 = min(max(x2, 0.0), img_w)
    y1 = min(max(y1, 0.0), img_h)
    y2 = min(max(y2, 0.0), img_h)
    cx = (x1 + x2) / 2.0 / img_w
    cy = (y1 + y2) / 2.0 / img_h
    bw = abs(x2 - x1) / img_w
    bh = abs(y2 - y1) / img_h
    if x1 == x2 and y1 == y2:
        return None  # a true single point, not a degenerate box/line
    # Walls are line segments, not boxes — axis-aligned ones legitimately have
    # bw==0 or bh==0 (e.g. a horizontal wall has zero height). Floor both to a
    # minimum thickness *before* anything could reject them, otherwise every
    # axis-aligned wall (i.e. nearly all real walls) gets silently dropped here.
    bw = max(bw, 0.01)
    bh = max(bh, 0.01)
    cx = min(max(cx, 0.0), 1.0)
    cy = min(max(cy, 0.0), 1.0)
    return f"{cls_idx} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}"


def generate_labels_for_model(model_type: str, fp_id: int, image_path: str,
                               image_w: int, image_h: int) -> bool:
    """Generate + write a YOLO label file (and copy the image) into the per-model
    dataset dir for one floor plan. Returns True once the image+label pair is in place
    (an empty label file is a valid YOLO negative example, so this still returns True
    even if the floor plan has zero entities for this model_type)."""
    from db import get_walls, get_doors, get_objects

    dataset_dir = DATASET_DIRS[model_type]
    images_dir = dataset_dir / "images" / "train"
    labels_dir = dataset_dir / "labels" / "train"
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    img_dest = images_dir / Path(image_path).name
    if not img_dest.exists():
        import shutil
        shutil.copy2(image_path, img_dest)

    lines = []
    if model_type == "wall_yolo":
        for w in get_walls(fp_id):
            sx, sy = w["start"]["x"], w["start"]["y"]
            ex, ey = w["end"]["x"], w["end"]["y"]
            line = _bbox_to_yolo_line(0, sx, sy, ex, ey, image_w, image_h)
            if line:
                lines.append(line)

    elif model_type == "door_yolo":
        for d in get_doors(fp_id):
            b = d["bbox"]
            line = _bbox_to_yolo_line(0, b["x1"], b["y1"], b["x2"], b["y2"], image_w, image_h)
            if line:
                lines.append(line)

    elif model_type == "room_object_yolo":
        for o in get_objects(fp_id):
            if _normalize_class_name(o["class"]) in WINDOW_GLASS_CLASSES:
                continue  # handled by the dedicated window_glass_yolo model
            idx = map_class_name_to_index(o["class"])
            if idx is None:
                print(f"[auto-train] WARNING: unknown room-object class "
                      f"'{o['class']}' (fp_id={fp_id}), skipping entity")
                continue
            b = o["bbox"]
            line = _bbox_to_yolo_line(idx, b["x1"], b["y1"], b["x2"], b["y2"], image_w, image_h)
            if line:
                lines.append(line)

    elif model_type == "window_glass_yolo":
        for o in get_objects(fp_id):
            idx = map_class_name_to_window_glass_index(o["class"])
            if idx is None:
                continue  # not a window/glass class — not this model's concern
            b = o["bbox"]
            line = _bbox_to_yolo_line(idx, b["x1"], b["y1"], b["x2"], b["y2"], image_w, image_h)
            if line:
                lines.append(line)
    else:
        raise ValueError(f"Unknown model_type: {model_type}")

    label_path = labels_dir / (Path(image_path).stem + ".txt")
    label_path.write_text("\n".join(lines))
    return True


def generate_yolo_labels(fp_id: int, image_path: str, image_w: int, image_h: int):
    """Backward-compat wrapper — generates wall labels only (legacy behavior)."""
    try:
        generate_labels_for_model("wall_yolo", fp_id, image_path, image_w, image_h)
    except ImportError:
        return


def _build_data_yaml(model_type: str) -> Path:
    with open(SOURCE_DATA_YAML[model_type]) as f:
        src = yaml.safe_load(f)
    dataset_dir = DATASET_DIRS[model_type]
    data_yaml_path = dataset_dir / "data.yaml"
    data_config = {
        "train": str(dataset_dir / "images" / "train"),
        "val": str(dataset_dir / "images" / "train"),  # no held-out split yet
        "nc": src["nc"],
        "names": src["names"],
    }
    with open(data_yaml_path, "w") as f:
        yaml.dump(data_config, f)
    return data_yaml_path


def _resolve_base_weights(model_type: str) -> str:
    prod = PRODUCTION_WEIGHTS[model_type]
    if prod.exists():
        return str(prod)
    print(f"[auto-train] No existing weights for {model_type}, starting from {STOCK_BASE_WEIGHTS}")
    return STOCK_BASE_WEIGHTS


def _validate_results(results):
    """Extract mAP50 and sanity-check it. Returns None if invalid/untrustworthy."""
    score = getattr(results, "results_dict", {}).get("metrics/mAP50(B)")
    if score is None:
        return None
    try:
        score = float(score)
    except (TypeError, ValueError):
        return None
    if score != score:  # NaN check
        return None
    if score < 0:
        return None
    return score


SCORE_REGRESSION_TOLERANCE = 0.02  # allow tiny noise-level dips without blocking promotion


def _get_production_score(model_type: str):
    """Last known-good mAP50 for this model_type's currently deployed weights, or
    None if we've never recorded one (e.g. first-ever auto-train, or pre-existing
    weights that were never promoted through this code path)."""
    from db import get_config
    raw = get_config(f"{model_type}_production_score")
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _set_production_score(model_type: str, score: float):
    from db import set_config
    set_config(f"{model_type}_production_score", str(score))


def _should_promote(model_type: str, score: float) -> Tuple[bool, str]:
    """Guard against silently regressing production weights. Returns (ok, reason).
    Without this check, any retrain that produces a technically-valid-but-worse
    mAP50 (e.g. from too little data, or a run that didn't converge) would replace
    a good production model with a worse one — this happened in practice: a wall_yolo
    fine-tune run scored mAP50=0.19 against a production baseline of 0.76."""
    prev_score = _get_production_score(model_type)
    if prev_score is None:
        return True, "no recorded production baseline — promoting first scored run"
    if score >= prev_score - SCORE_REGRESSION_TOLERANCE:
        return True, f"score {score:.4f} >= baseline {prev_score:.4f} - tolerance"
    return False, f"score {score:.4f} is a regression vs. baseline {prev_score:.4f} — not promoting"


def _promote_weights(model_type: str, new_weights_path: Path) -> bool:
    """Atomically replace production weights with new_weights_path, backing up
    the previous file first. Returns True on success."""
    import shutil

    prod_path = PRODUCTION_WEIGHTS[model_type]
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup_path = BACKUP_DIR / f"{model_type}_best.pt.bak"
    prod_path.parent.mkdir(parents=True, exist_ok=True)

    if prod_path.exists():
        shutil.copy2(prod_path, backup_path)

    tmp_path = prod_path.with_suffix(".pt.tmp")
    shutil.copy2(new_weights_path, tmp_path)
    os.replace(tmp_path, prod_path)
    return True


def _rollback_weights(model_type: str) -> bool:
    import shutil

    backup_path = BACKUP_DIR / f"{model_type}_best.pt.bak"
    prod_path = PRODUCTION_WEIGHTS[model_type]
    if not backup_path.exists():
        return False
    tmp_path = prod_path.with_suffix(".pt.tmp")
    shutil.copy2(backup_path, tmp_path)
    os.replace(tmp_path, prod_path)
    return True


def should_auto_train(trigger: str, model_type: str = "wall_yolo") -> bool:
    """Check DB config to decide if auto-training should run."""
    try:
        from db import get_config, get_stats
        if trigger == "upload":
            enabled = get_config("auto_train_on_upload", "true")
        elif trigger == "correction":
            enabled = get_config("auto_train_on_correction", "true")
        else:
            enabled = "true"

        if enabled.lower() != "true":
            return False

        min_images = int(get_config(f"{model_type}_min_images_for_training",
                                     get_config("min_images_for_training", "3")))
        stats = get_stats()
        return stats["floor_plans"] >= min_images
    except Exception:
        return False


def trigger_auto_train(trigger_type: str, fp_id: int = None, model_type: str = "wall_yolo"):
    """
    Trigger auto-training in a background thread.
    Non-blocking — returns immediately.
    """
    global _is_training
    if _is_training:
        print(f"[auto-train] Skipping — already training")
        return False

    if not should_auto_train(trigger_type, model_type):
        print(f"[auto-train] Skipping — conditions not met for {trigger_type}/{model_type}")
        return False

    thread = threading.Thread(
        target=_run_training,
        args=(trigger_type, fp_id, model_type),
        daemon=True,
    )
    thread.start()
    return True


def _run_training(trigger_type: str, fp_id: int, model_type: str):
    """Background training job for a single model_type."""
    global _is_training, _current_log_id

    if not _training_lock.acquire(blocking=False):
        return

    _is_training = True
    log_id = None
    entity_type = ENTITY_TYPE_FOR_MODEL.get(model_type)

    try:
        from db import (
            create_training_log, update_training_log, get_all_floor_plans,
            get_config, get_pending_corrections, mark_corrections_trained,
            update_floor_plan_status,
        )

        log_id = create_training_log(trigger_type, model_type, fp_id)
        _current_log_id = log_id
        update_training_log(log_id, status="running", started_at=datetime.now())

        if fp_id:
            update_floor_plan_status(fp_id, "training")

        epochs = int(get_config(f"{model_type}_training_epochs",
                                 get_config("training_epochs", "50")))
        batch_size = int(get_config(f"{model_type}_training_batch_size",
                                     get_config("training_batch_size", "8")))

        # Generate labels for all floor plans, for this model_type only
        all_fps = get_all_floor_plans()
        train_count = 0
        for fp_row in all_fps:
            fp = _get_floor_plan_details(fp_row["id"])
            if fp and os.path.exists(fp["image_path"]):
                img = cv2.imread(fp["image_path"])
                if img is not None:
                    h, w = img.shape[:2]
                    generate_labels_for_model(model_type, fp["id"], fp["image_path"], w, h)
                    train_count += 1

        if train_count == 0:
            update_training_log(log_id, status="failed", error_message="No training images available")
            return

        data_yaml_path = _build_data_yaml(model_type)
        base_weights = _resolve_base_weights(model_type)

        print(f"[auto-train] Starting {model_type} training: {train_count} images, {epochs} epochs "
              f"(base={base_weights})")
        try:
            from ultralytics import YOLO
            model = YOLO(base_weights)
            run_name = f"{model_type}_auto_train"
            results = model.train(
                data=str(data_yaml_path),
                epochs=epochs,
                batch=batch_size,
                imgsz=640,
                project=str(RUNS_DIR),
                name=run_name,
                exist_ok=True,
                verbose=False,
            )
            new_weights_path = RUNS_DIR / run_name / "weights" / "best.pt"
            score = _validate_results(results)

            promoted = False
            if score is not None and new_weights_path.exists():
                ok_to_promote, reason = _should_promote(model_type, score)
                if ok_to_promote:
                    promoted = _promote_weights(model_type, new_weights_path)
                    if promoted:
                        _set_production_score(model_type, score)
                        import wall_ai
                        wall_ai.invalidate_yolo_cache(str(PRODUCTION_WEIGHTS[model_type]))
                        print(f"[auto-train] Promoted {model_type}: score={score:.4f} ({reason})")
                else:
                    print(f"[auto-train] NOT promoting {model_type}: {reason}")
            else:
                print(f"[auto-train] NOT promoting {model_type}: "
                      f"score={score} invalid — keeping existing weights")

            update_training_log(
                log_id,
                status="completed",
                completed_at=datetime.now(),
                train_images=train_count,
                epochs=epochs,
                score=score,
                weights_path=str(new_weights_path if promoted else PRODUCTION_WEIGHTS[model_type]),
            )

            if promoted and entity_type:
                pending = get_pending_corrections(entity_type=entity_type)
                if pending:
                    ids = [c["id"] for c in pending]
                    mark_corrections_trained(ids)
                    print(f"[auto-train] Marked {len(ids)} '{entity_type}' corrections as trained")

        except ImportError:
            update_training_log(log_id, status="failed", error_message="ultralytics not installed")
            print("[auto-train] Failed: ultralytics not installed")

        if fp_id:
            update_floor_plan_status(fp_id, "trained")

    except Exception as e:
        print(f"[auto-train] Error: {e}")
        traceback.print_exc()
        if log_id:
            try:
                from db import update_training_log
                update_training_log(log_id, status="failed", error_message=str(e))
            except Exception:
                pass
    finally:
        _is_training = False
        _current_log_id = None
        _training_lock.release()


def _get_floor_plan_details(fp_id: int):
    try:
        from db import get_floor_plan
        return get_floor_plan(fp_id)
    except Exception:
        return None
