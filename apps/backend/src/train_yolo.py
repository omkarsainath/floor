import ast
import argparse
from pathlib import Path


def load_names(data_yaml: Path) -> list[str]:
    if not data_yaml.exists():
        return ["wall"]
    names = None
    for line in data_yaml.read_text().splitlines():
        if line.strip().startswith("names:"):
            _, value = line.split(":", 1)
            try:
                names = ast.literal_eval(value.strip())
            except Exception:
                names = None
            break
    if isinstance(names, list) and names:
        return names
    return ["wall"]


def build_data_yaml(dataset_root: Path, output_yaml: Path) -> None:
    data_yaml = dataset_root / "data.yaml"
    names = load_names(data_yaml)
    train_dir = (dataset_root / "train" / "images").resolve()
    val_dir = (dataset_root / "valid" / "images").resolve()
    test_dir = (dataset_root / "test" / "images").resolve()

    output_yaml.parent.mkdir(parents=True, exist_ok=True)
    output_yaml.write_text(
        "\n".join(
            [
                f"train: {train_dir}",
                f"val: {val_dir}",
                f"test: {test_dir}",
                f"nc: {len(names)}",
                f"names: {names}",
            ]
        )
        + "\n"
    )


EXISTING_WEIGHTS = Path("/Users/apple/Documents/ai-3d-project/apps/dataset/runs/wall_yolo/weights/best.pt")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset",
        default="/Users/apple/Documents/ai-3d-project/apps/cubicasa5k_external/cubicasa5k-2-6",
    )
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--model", default=None)
    args = parser.parse_args()

    dataset_root = Path(args.dataset).resolve()
    output_yaml = dataset_root / "data.generated.yaml"
    build_data_yaml(dataset_root, output_yaml)

    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise SystemExit(
            "ultralytics is not installed. Run: pip install ultralytics"
        ) from exc

    # Full retrain from pretrained nano — fine-tuning causes BN stat drift
    base_weights = args.model or "yolov8n.pt"
    print(f"[train] Base weights: {base_weights}")

    model = YOLO(base_weights)
    model.train(
        data=str(output_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        project=str(dataset_root / "runs"),
        name="wall_yolo",
        exist_ok=True,
        device="mps",
        cache=False,
        workers=0,
        patience=10,
        fraction=0.5,         # 3320 imgs → 415 batches/epoch, fits M1 8GB
        cos_lr=True,
        close_mosaic=10,      # disable mosaic last 10 epochs for stable convergence
        optimizer="auto",     # let ultralytics choose (AdamW, lr=0.002 for fresh training)
        lr0=0.01,
        lrf=0.01,
        warmup_epochs=3,
        iou=0.7,              # correct NMS threshold for dense floor-plan walls
        box=7.5,
        cls=0.5,
        flipud=0.5,           # KEY improvement — floor plans are orientation-agnostic
        fliplr=0.5,
        mosaic=1.0,           # standard augmentation for training from scratch
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        translate=0.1,
        scale=0.5,
        erasing=0.4,
        verbose=True,
    )


if __name__ == "__main__":
    main()
