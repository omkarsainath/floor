"""
Optimized training for all floor-plan YOLO models.

Speed optimizations:
  - cache=True         → images cached in RAM after first epoch (3-5x faster)
  - Fine-tune from current best.pt weights (not scratch)
  - Early stopping (patience=15) → stops when not improving
  - batch=16           → better hardware utilization
  - cos_lr=True        → cosine schedule, better convergence

Recall / mAP50 improvements:
  - Full curated datasets (not just auto-collected uploads)
  - label_smoothing=0.1 → reduces overconfidence, better generalization
  - mosaic augmentation (on by default)
  - close_mosaic=5     → fine-tunes without mosaic in last 5 epochs
"""

import argparse
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SRC_DIR = Path(__file__).resolve().parent

MODELS = {
    "wall": {
        "dataset": REPO_ROOT / "apps" / "cubicasa5k_external" / "cubicasa5k-2-6",
        "weights":  REPO_ROOT / "apps" / "dataset" / "runs" / "wall_yolo" / "weights" / "best.pt",
        "name": "wall_yolo",
        "epochs": 80,
    },
    "door": {
        "dataset": REPO_ROOT / "apps" / "door_detection_dataset",
        "weights":  REPO_ROOT / "apps" / "door_detection_dataset" / "runs" / "door_yolo" / "weights" / "best.pt",
        "name": "door_yolo",
        "epochs": 40,
    },
    "room_object": {
        "dataset": REPO_ROOT / "apps" / "room-and-object",
        "weights":  REPO_ROOT / "apps" / "room-and-object" / "runs" / "room_object_yolo" / "weights" / "best.pt",
        "name": "room_object_yolo",
        "epochs": 60,
    },
}


def build_data_yaml(dataset_root: Path) -> Path:
    src = dataset_root / "data.yaml"
    out = dataset_root / "data.generated.yaml"
    names = ["wall"]
    nc = 1
    if src.exists():
        import yaml
        raw = yaml.safe_load(src.read_text())
        names = raw.get("names", names)
        nc = raw.get("nc", len(names))

    train_dir = dataset_root / "train" / "images"
    val_dir   = dataset_root / "valid" / "images"
    test_dir  = dataset_root / "test"  / "images"

    out.write_text(
        f"train: {train_dir.resolve()}\n"
        f"val:   {val_dir.resolve()}\n"
        f"test:  {test_dir.resolve()}\n"
        f"nc: {nc}\n"
        f"names: {names}\n"
    )
    return out


def count_images(dataset_root: Path) -> int:
    d = dataset_root / "train" / "images"
    return len(list(d.glob("*"))) if d.exists() else 0


def train_model(key: str, cfg: dict, imgsz: int, batch: int) -> dict:
    from ultralytics import YOLO

    dataset = cfg["dataset"]
    weights_path = cfg["weights"]
    run_name = cfg["name"]
    epochs = cfg["epochs"]
    project = dataset / "runs"

    n_train = count_images(dataset)
    base = str(weights_path) if weights_path.exists() else "yolov8n.pt"
    print(f"\n{'='*60}")
    print(f"  Model      : {run_name}")
    print(f"  Device     : MPS (Apple Metal GPU)")
    print(f"  Train imgs : {n_train}")
    print(f"  Epochs     : {epochs}  (+ early stop patience=15)")
    print(f"  Base       : {base}")
    print(f"{'='*60}")

    if n_train == 0:
        print(f"  SKIP — no training images found in {dataset/'train'/'images'}")
        return {"model": run_name, "skipped": True, "reason": "no images"}

    data_yaml = build_data_yaml(dataset)
    model = YOLO(base)

    t0 = time.time()
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device="mps",          # Apple Metal GPU (MPS) for fast training on Mac
        cache=True,            # RAM-cache images → 3-5x faster epochs
        patience=15,           # early stopping
        cos_lr=True,           # cosine LR for smooth convergence
        close_mosaic=5,        # turn off mosaic for last 5 epochs (sharpens small detections)
        label_smoothing=0.1,   # reduces overconfidence → better recall
        warmup_epochs=2,
        workers=0,             # MPS requires workers=0 on macOS
        project=str(project),
        name=run_name,
        exist_ok=True,
        verbose=True,
    )
    elapsed = time.time() - t0

    # Extract metrics
    rd = getattr(results, "results_dict", {}) or {}
    map50 = rd.get("metrics/mAP50(B)", "?")
    map50_95 = rd.get("metrics/mAP50-95(B)", "?")
    recall = rd.get("metrics/recall(B)", "?")
    precision = rd.get("metrics/precision(B)", "?")

    print(f"\n  [{run_name}] DONE in {elapsed/60:.1f} min")
    print(f"    mAP50    : {map50}")
    print(f"    mAP50-95 : {map50_95}")
    print(f"    Recall   : {recall}")
    print(f"    Precision: {precision}")

    # Promote new weights if they exist
    new_weights = project / run_name / "weights" / "best.pt"
    if new_weights.exists():
        import shutil
        shutil.copy2(new_weights, weights_path)
        print(f"    Promoted → {weights_path}")
    else:
        print(f"    WARNING: best.pt not found at {new_weights}")

    return {
        "model": run_name,
        "skipped": False,
        "map50": map50,
        "recall": recall,
        "elapsed_min": round(elapsed / 60, 1),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", nargs="+", default=["wall", "door", "room_object"],
                        choices=list(MODELS.keys()),
                        help="Which models to train (default: all)")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    args = parser.parse_args()

    try:
        import ultralytics
        print(f"ultralytics {ultralytics.__version__} ready")
    except ImportError:
        sys.exit("ultralytics not installed — run: pip install ultralytics")

    summary = []
    for key in args.models:
        cfg = MODELS[key]
        result = train_model(key, cfg, args.imgsz, args.batch)
        summary.append(result)

    print("\n" + "="*60)
    print("  TRAINING SUMMARY")
    print("="*60)
    for r in summary:
        if r.get("skipped"):
            print(f"  {r['model']:25s}  SKIPPED ({r['reason']})")
        else:
            print(f"  {r['model']:25s}  mAP50={r['map50']}  Recall={r['recall']}  ({r['elapsed_min']}min)")
    print("="*60)


if __name__ == "__main__":
    main()
