import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from stair_detection import _tread_bbox, detect_stairs_from_image, detect_stairs_from_walls, has_stair_tread_geometry


def test_labeled_parallel_treads_form_stair_bbox():
    image = np.full((320, 320), 255, dtype=np.uint8)
    for y in range(105, 226, 15):
        cv2.line(image, (105, y), (215, y), 0, 2)
    result = _tread_bbox(image, (145, 145, 28, 16, 92), image.shape)
    assert result is not None
    assert result["class"] == "stairs"
    assert result["source"] == "ocr-tread-fallback"
    assert result["bbox"]["x1"] < 145 < result["bbox"]["x2"]
    assert result["bbox"]["y1"] <= 110
    assert result["bbox"]["y2"] >= 220


def test_label_without_treads_is_not_a_stair():
    image = np.full((320, 320), 255, dtype=np.uint8)
    cv2.rectangle(image, (80, 80), (240, 240), 0, 2)
    assert _tread_bbox(image, (145, 145, 28, 16, 92), image.shape) is None


def test_model_stair_box_requires_regular_tread_geometry():
    image = np.full((240, 320), 255, dtype=np.uint8)
    bbox = {"x1": 50, "y1": 35, "x2": 270, "y2": 205}
    for y in range(60, 181, 15):
        cv2.line(image, (85, y), (235, y), 0, 2)
    assert has_stair_tread_geometry(image, bbox)


def test_staircase_text_and_room_partitions_are_not_treads():
    image = np.full((240, 360), 255, dtype=np.uint8)
    cv2.putText(image, "STAIR CASE", (72, 180), cv2.FONT_HERSHEY_SIMPLEX,
                1.2, 0, 2, cv2.LINE_AA)
    # A few room/shaft dividers above the label resemble the supplied false
    # positive, but there are not enough repeated steps to form a staircase.
    cv2.rectangle(image, (75, 25), (285, 125), 0, 2)
    for x in (115, 155, 205, 245):
        cv2.line(image, (x, 25), (x, 125), 0, 2)
    bbox = {"x1": 55, "y1": 15, "x2": 305, "y2": 210}
    assert not has_stair_tread_geometry(image, bbox)


def test_unlabeled_repeated_wall_candidates_become_one_staircase():
    walls = []
    for y in range(70, 191, 15):
        walls.append({"start": {"x": 90, "y": y}, "end": {"x": 230, "y": y}})
    result = detect_stairs_from_walls(walls, (260, 320))
    assert len(result) == 1
    assert result[0]["class"] == "stairs"
    assert result[0]["source"] == "wall-tread-fallback"
    assert result[0]["bbox"]["y1"] < 70
    assert result[0]["bbox"]["y2"] > 190


def test_unrelated_parallel_room_walls_are_not_staircase():
    walls = [
        {"start": {"x": 10, "y": y}, "end": {"x": 280 - y, "y": y}}
        for y in (20, 48, 83, 127, 178, 231, 289)
    ]
    assert detect_stairs_from_walls(walls, (320, 320)) == []


def test_l_shaped_unlabeled_stairs_are_found_in_source_image_and_merged():
    image = np.full((420, 360, 3), 255, dtype=np.uint8)
    # Upper flight: vertical treads. Turning/lower flight: horizontal treads.
    for x in range(170, 291, 15):
        cv2.line(image, (x, 80), (x, 200), (0, 0, 0), 2)
    for y in range(215, 336, 15):
        cv2.line(image, (75, y), (230, y), (0, 0, 0), 2)
    result = detect_stairs_from_image(image)
    assert len(result) == 1
    assert result[0]["class"] == "stairs"
    assert result[0]["bbox"]["x1"] < 100
    assert result[0]["bbox"]["x2"] > 270
    assert result[0]["bbox"]["y1"] < 100
    assert result[0]["bbox"]["y2"] > 320
