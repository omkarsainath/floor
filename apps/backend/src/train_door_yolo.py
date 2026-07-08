import ast
import argparse
from pathlib import Path


def load_names(data_yaml: Path) -> list[str]:
    if not data_yaml.exists():
        return ["door"]
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
    return ["door"]


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="/Users/apple/Documents/ai-3d-project/apps/door_detection_dataset")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--name", default="door_yolo")
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

    model = YOLO(args.model)
    model.train(
        data=str(output_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        project=str(dataset_root / "runs"),
        name=args.name,
    )


if __name__ == "__main__":
    main()
