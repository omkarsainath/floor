#!/usr/bin/env python3
"""Evaluate a YOLO model on a dataset and visualize results in FiftyOne.

Usage:
    python scripts/fiftyone_evaluate.py \
        apps/room-and-object/data.yaml \
        apps/room-and-object/runs/room_object_yolo/weights/best.pt \
        --split valid

This script:
    1. Loads a YOLO validation/test split into FiftyOne.
    2. Runs the YOLO model on it (or uses cached predictions).
    3. Stores predictions and evaluates them against ground truth.
    4. Launches the FiftyOne App for error analysis.
"""

import argparse
import sys
from pathlib import Path

try:
    import fiftyone as fo
except ImportError:
    print("FiftyOne is not installed. Install with: pip install -U fiftyone")
    sys.exit(1)

try:
    from ultralytics import YOLO
except ImportError:
    print("Ultralytics is not installed. Install with: pip install ultralytics")
    sys.exit(1)

from fiftyone import types as fot


def evaluate_yolo(data_yaml: Path, weights: Path, split: str, dataset_name: str, port: int):
    """Run YOLO on a split and evaluate in FiftyOne."""
    if fo.dataset_exists(dataset_name):
        fo.delete_dataset(dataset_name)

    # Load ground truth for the chosen split
    dataset = fo.Dataset.from_dir(
        dataset_type=fot.YOLOv5Dataset,
        dataset_dir=str(data_yaml.parent),
        yaml_path=str(data_yaml),
        split=split,
        dataset_name=dataset_name,
    )

    print(f"Loaded {len(dataset)} ground-truth samples from split '{split}'")

    # Run YOLO predictions
    print(f"Running YOLO model: {weights}")
    model = YOLO(str(weights))
    results = model.predict(
        source=[sample.filepath for sample in dataset],
        imgsz=1280,
        conf=0.25,
        iou=0.45,
        verbose=False,
    )

    # Convert YOLO predictions to FiftyOne detections
    for sample, pred in zip(dataset, results):
        detections = []
        for box in pred.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            label = model.names[cls_id]
            detections.append(
                fo.Detection(
                    label=label,
                    bounding_box=[x1 / pred.orig_shape[1], y1 / pred.orig_shape[0],
                                  (x2 - x1) / pred.orig_shape[1], (y2 - y1) / pred.orig_shape[0]],
                    confidence=conf,
                )
            )
        sample["predictions"] = fo.Detections(detections=detections)
        sample.save()

    print("Predictions stored under 'predictions' field")

    # Evaluate
    eval_key = f"eval_{split}"
    dataset.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        eval_key=eval_key,
        compute_mAP=True,
    )

    # Print summary
    print(dataset.get_evaluation_info(eval_key))

    session = fo.launch_app(dataset, port=port)
    print(f"FiftyOne App running at http://localhost:{port}")
    session.wait()


def main():
    parser = argparse.ArgumentParser(description="Evaluate a YOLO model with FiftyOne")
    parser.add_argument("yaml_path", help="Path to YOLO data.yaml")
    parser.add_argument("weights", help="Path to YOLO .pt weights")
    parser.add_argument("--split", default="val", help="Dataset split to evaluate (train/val/test)")
    parser.add_argument("--name", default=None, help="FiftyOne dataset name")
    parser.add_argument("--port", type=int, default=5152, help="Port for FiftyOne App")
    args = parser.parse_args()

    data_yaml = Path(args.yaml_path).resolve()
    weights = Path(args.weights).resolve()

    if not data_yaml.exists():
        print(f"ERROR: data.yaml not found: {data_yaml}")
        sys.exit(1)
    if not weights.exists():
        print(f"ERROR: weights file not found: {weights}")
        sys.exit(1)

    dataset_name = args.name or f"eval_{data_yaml.parent.name}_{weights.stem}"
    evaluate_yolo(data_yaml, weights, args.split, dataset_name, args.port)


if __name__ == "__main__":
    main()
