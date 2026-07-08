#!/usr/bin/env python3
"""Load a YOLO dataset into FiftyOne for visualization and inspection.

Usage:
    python scripts/fiftyone_viewer.py apps/room-and-object/data.yaml

This script reads the YOLO data.yaml, loads train/val/test images and labels,
creates a FiftyOne dataset, and launches the FiftyOne App in your browser.
"""

import argparse
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    raise ImportError("PyYAML is required. Install with: pip install pyyaml")

try:
    import fiftyone as fo
except ImportError:
    print("FiftyOne is not installed. Install with: pip install -U fiftyone")
    sys.exit(1)

from fiftyone import types as fot


def resolve_yolo_path(yaml_path: Path, rel_path: str) -> Path:
    """Resolve a path relative to the directory containing data.yaml."""
    base = yaml_path.parent
    candidate = base / rel_path
    return candidate.resolve()


def load_yolo_dataset(name: str, yaml_path: Path) -> fo.Dataset:
    """Create a FiftyOne Dataset from a YOLO data.yaml file."""
    with open(yaml_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    train = resolve_yolo_path(yaml_path, data.get("train"))
    val = resolve_yolo_path(yaml_path, data.get("val")) if data.get("val") else None
    test = resolve_yolo_path(yaml_path, data.get("test")) if data.get("test") else None

    # Delete existing dataset with same name to avoid conflicts on reload
    if fo.dataset_exists(name):
        fo.delete_dataset(name)

    dataset = fo.Dataset.from_dir(
        dataset_type=fot.YOLOv5Dataset,
        dataset_dir=str(yaml_path.parent),
        yaml_path=str(yaml_path),
        split="train",
        dataset_name=name,
    )

    # Add validation split if available
    if val and val.exists():
        val_view = fo.Dataset.from_dir(
            dataset_type=fot.YOLOv5Dataset,
            dataset_dir=str(yaml_path.parent),
            yaml_path=str(yaml_path),
            split="val",
        )
        for sample in val_view:
            sample.tags.append("val")
            dataset.add_sample(sample)

    # Add test split if available
    if test and test.exists():
        test_view = fo.Dataset.from_dir(
            dataset_type=fot.YOLOv5Dataset,
            dataset_dir=str(yaml_path.parent),
            yaml_path=str(yaml_path),
            split="test",
        )
        for sample in test_view:
            sample.tags.append("test")
            dataset.add_sample(sample)

    print(f"Loaded dataset: {name}")
    print(f"  Samples: {len(dataset)}")
    print(f"  Classes: {dataset.default_classes}")
    return dataset


def main():
    parser = argparse.ArgumentParser(
        description="Visualize a YOLO dataset with FiftyOne."
    )
    parser.add_argument(
        "yaml_path",
        help="Path to the YOLO data.yaml file (e.g., apps/room-and-object/data.yaml)",
    )
    parser.add_argument(
        "--name",
        default=None,
        help="FiftyOne dataset name (defaults to the parent directory name)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=5151,
        help="Port for the FiftyOne App (default: 5151)",
    )
    args = parser.parse_args()

    yaml_path = Path(args.yaml_path).resolve()
    if not yaml_path.exists():
        print(f"ERROR: YAML file not found: {yaml_path}")
        sys.exit(1)

    dataset_name = args.name or yaml_path.parent.name
    dataset = load_yolo_dataset(dataset_name, yaml_path)

    session = fo.launch_app(dataset, port=args.port)
    print(f"FiftyOne App running at http://localhost:{args.port}")
    session.wait()


if __name__ == "__main__":
    main()
