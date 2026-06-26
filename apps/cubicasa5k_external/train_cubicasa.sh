#!/usr/bin/env bash
set -euo pipefail

YOLO="/Library/Frameworks/Python.framework/Versions/3.12/bin/yolo"

DATA_YAML="/Users/apple/Documents/ai-3d-project/apps/cubicasa5k_external/cubicasa5k-2-6/data.yaml"
PROJECT="/Users/apple/Documents/ai-3d-project/apps/cubicasa5k_external/cubicasa5k-2-6/runs"
RUN_NAME="wall_yolo_v8n_fast"

echo "========================================"
echo " CubicasA5K — YOLOv8n on MPS           "
echo " imgsz=512  batch=16  M1 optimised      "
echo "========================================"

export PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0

"$YOLO" detect train \
  data="$DATA_YAML" \
  model=yolov8n.pt \
  epochs=80 \
  imgsz=512 \
  batch=16 \
  device=mps \
  workers=0 \
  cache=disk \
  patience=20 \
  cos_lr=True \
  close_mosaic=15 \
  optimizer=AdamW \
  lr0=0.002 \
  lrf=0.01 \
  warmup_epochs=3 \
  warmup_momentum=0.8 \
  weight_decay=0.0005 \
  box=7.5 \
  cls=0.5 \
  dfl=1.5 \
  iou=0.7 \
  mosaic=1.0 \
  fliplr=0.5 \
  flipud=0.25 \
  degrees=5.0 \
  translate=0.1 \
  scale=0.5 \
  shear=2.0 \
  hsv_h=0.015 \
  hsv_s=0.7 \
  hsv_v=0.4 \
  perspective=0.0001 \
  amp=False \
  project="$PROJECT" \
  name="$RUN_NAME" \
  exist_ok=True

echo ""
echo "========================================"
echo " Validation on best weights             "
echo "========================================"

BEST_PT="$PROJECT/$RUN_NAME/weights/best.pt"

"$YOLO" detect val \
  model="$BEST_PT" \
  data="$DATA_YAML" \
  imgsz=512 \
  split=val \
  device=mps \
  workers=0 \
  iou=0.5 \
  conf=0.001

echo ""
echo "Best model saved at: $BEST_PT"
