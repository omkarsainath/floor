#!/usr/bin/env python3
"""
Optimised window-glass training script for Apple M1.

Key improvements over v2:
  - device='mps'  →  15-20x faster than CPU
  - imgsz=640     →  4x faster than 1280, still accurate
  - batch=16      →  4x larger batches
  - yolov8s.pt    →  small model, much better recall than nano
  - cls=0.3       →  lower classification loss → better recall/mAP balance
  - proper 80/20 train/val split from train_curated
  - mixup + copy_paste augmentation for transparent glass objects
"""

import os
import random
from pathlib import Path

BASE = Path("/Users/apple/Documents/ai-3d-project/apps/backend/train_dataset/window_glass")
IMG_DIR = BASE / "images" / "train_curated"
LBL_DIR = BASE / "labels" / "train_curated"
SPLIT_DIR = BASE / "splits"
SPLIT_DIR.mkdir(exist_ok=True)

# ── 80/20 train/val split ─────────────────────────────────────────────────────
random.seed(42)
all_images = sorted(IMG_DIR.glob("*.jpg")) + sorted(IMG_DIR.glob("*.png"))
random.shuffle(all_images)

cut = int(len(all_images) * 0.8)
train_imgs = all_images[:cut]
val_imgs   = all_images[cut:]

train_txt = SPLIT_DIR / "train.txt"
val_txt   = SPLIT_DIR / "val.txt"

train_txt.write_text("\n".join(str(p) for p in train_imgs))
val_txt.write_text("\n".join(str(p) for p in val_imgs))

print(f"Train: {len(train_imgs)} images")
print(f"Val:   {len(val_imgs)} images")

# ── data.yaml ─────────────────────────────────────────────────────────────────
data_yaml = BASE / "data_v3.yaml"
data_yaml.write_text(f"""\
train: {train_txt}
val:   {val_txt}

nc: 5
names: ['window', 'glass-window', 'glass-wall', 'glass-grill', 'glass-banister']
""")
print(f"data.yaml written → {data_yaml}")

# ── Train ─────────────────────────────────────────────────────────────────────
from ultralytics import YOLO

model = YOLO("yolov8s.pt")   # small — much better recall than nano

results = model.train(
    data=str(data_yaml),
    epochs=100,
    patience=20,
    batch=16,
    imgsz=640,
    device="mps",
    optimizer="AdamW",
    lr0=0.001,
    lrf=0.01,
    cos_lr=True,
    box=7.5,
    cls=0.3,
    dfl=1.5,
    workers=0,
    cache=True,              # load all images into RAM — eliminates disk I/O bottleneck
    mosaic=1.0,
    mixup=0.0,               # removed — too slow with workers=0
    copy_paste=0.0,          # removed — too slow with workers=0
    fliplr=0.5,
    hsv_h=0.015,
    hsv_s=0.7,
    hsv_v=0.4,
    project="/Users/apple/Documents/ai-3d-project/apps/window_glass_detection_dataset/runs",
    name="window_glass_v3",
    exist_ok=True,
    verbose=True,
    plots=True,
)

print("\n=== Training complete ===")
print(f"Best mAP50:    {results.results_dict.get('metrics/mAP50(B)', 'N/A'):.4f}")
print(f"Best mAP50-95: {results.results_dict.get('metrics/mAP50-95(B)', 'N/A'):.4f}")
print(f"Precision:     {results.results_dict.get('metrics/precision(B)', 'N/A'):.4f}")
print(f"Recall:        {results.results_dict.get('metrics/recall(B)', 'N/A'):.4f}")
