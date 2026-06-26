import os
import json
from datetime import datetime
from collections import Counter

import cv2
import numpy as np
import supervision as sv
from roboflow import Roboflow

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass

# --------- CONFIG ---------
API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
# default image; override with FLOOR_PLAN_PATH env
DEFAULT_IMG = os.environ.get(
    "FLOOR_PLAN_PATH",
    os.path.join(os.path.dirname(__file__), "../sample_inputs/test.jpeg"),
)
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "../outputs")
# --------------------------

def ensure_output_dir(path: str):
    os.makedirs(path, exist_ok=True)
    print(f"✓ Output directory created: {path}")


def to_float(val, default=0.0):
    try:
        return float(val)
    except Exception:
        return default


def to_int(val, default=0):
    try:
        return int(val)
    except Exception:
        return default


def sanitize_predictions(preds):
    sanitized = []
    for p in preds or []:
        x = to_float(p.get("x"), None)
        y = to_float(p.get("y"), None)
        w = to_float(p.get("width"), None)
        h = to_float(p.get("height"), None)
        conf = to_float(p.get("confidence"), None)
        if None in (x, y, w, h, conf):
            continue
        p_clean = dict(p)
        p_clean["x"] = x
        p_clean["y"] = y
        p_clean["width"] = w
        p_clean["height"] = h
        p_clean["confidence"] = conf
        p_clean["class_id"] = to_int(p.get("class_id", 0))
        sanitized.append(p_clean)
    return sanitized


def load_models():
    rf = Roboflow(api_key=API_KEY)
    wall_project = rf.workspace("floorplan-recognition").project("cubicasa5k-2-qpmsa")
    wall_model = wall_project.version(6).model

    room_project = rf.workspace("room-detection-2pjsh").project("room-detection-6nzte")
    room_model = room_project.version(1).model

    object_project = rf.workspace().project("floor_plan_detection")
    object_model = object_project.version(3).model

    print("✓ Models loaded successfully")
    print("  • Wall model: cubicasa5k-2-qpmsa v6 (detection)")
    print("  • Room model: room-detection-6nzte v1 (detection)")
    print("  • Object model: floor_plan_detection (detection)")
    return wall_model, room_model, object_model


def roboflow_to_detections(result, detection_type="detection"):
    xyxy, class_ids, confidences, labels = [], [], [], []
    for pred in result.get("predictions", []):
        x_center = to_float(pred.get("x"))
        y_center = to_float(pred.get("y"))
        width = to_float(pred.get("width"))
        height = to_float(pred.get("height"))
        if any(v is None for v in [x_center, y_center, width, height]):
            continue
        x1 = x_center - width / 2
        y1 = y_center - height / 2
        x2 = x_center + width / 2
        y2 = y_center + height / 2
        xyxy.append([x1, y1, x2, y2])
        class_ids.append(to_int(pred.get("class_id", 0)))
        confidences.append(to_float(pred.get("confidence", 0.0)))
        labels.append(f"{detection_type}: {pred.get('class', 'cls')}")
    if not xyxy:
        return sv.Detections.empty(), []
    return sv.Detections(
        xyxy=np.array(xyxy),
        class_id=np.array(class_ids),
        confidence=np.array(confidences),
    ), labels


def create_3d_bbox_dict(prediction, class_name, detection_type, img_width, img_height, combined_json_3d):
    x_center = to_float(prediction.get("x"))
    y_center = to_float(prediction.get("y"))
    width = to_float(prediction.get("width"))
    height = to_float(prediction.get("height"))
    x1 = x_center - width / 2
    y1 = y_center - height / 2
    x2 = x_center + width / 2
    y2 = y_center + height / 2
    width = max(img_width, 1)
    height = max(img_height, 1)
    return {
        "id": f"{detection_type}_{len(combined_json_3d['detections'][detection_type + 's'])}",
        "class": class_name,
        "confidence": round(prediction.get("confidence", 0.0), 4),
        "bbox_2d": {
            "center": [prediction["x"], prediction["y"]],
            "dimensions": [prediction["width"], prediction["height"]],
            "corners": {
                "top_left": [x1, y1],
                "top_right": [x2, y1],
                "bottom_left": [x1, y2],
                "bottom_right": [x2, y2],
            },
        },
        "bbox_normalized": {
            "center": [prediction["x"] / width, prediction["y"] / height],
            "dimensions": [prediction["width"] / width, prediction["height"] / height],
            "corners": {
                "top_left": [x1 / width, y1 / height],
                "top_right": [x2 / width, y1 / height],
                "bottom_left": [x1 / width, y2 / height],
                "bottom_right": [x2 / width, y2 / height],
            },
        },
        "properties_3d": {
            "height": 2.4,
            "depth": 0.2,
            "category": detection_type,
            "color": {
                "wall": [139 / 255, 0, 0, 1.0],
                "room": [0, 0, 1.0, 0.3],
                "object": [1.0, 0.65, 0, 1.0],
            }[detection_type],
        },
    }


def create_simple_bbox_dict(prediction):
    return {
        "center_x": prediction["x"],
        "center_y": prediction["y"],
        "width": prediction["width"],
        "height": prediction["height"],
        "coordinates": {
            "x1": prediction["x"] - prediction["width"] / 2,
            "y1": prediction["y"] - prediction["height"] / 2,
            "x2": prediction["x"] + prediction["width"] / 2,
            "y2": prediction["y"] + prediction["height"] / 2,
        },
    }


def main():
    ensure_output_dir(OUTPUT_DIR)

    try:
        wall_model, room_model, object_model = load_models()
    except Exception as e:
        print(f"✗ Error loading models: {e}")
        return

    img_path = DEFAULT_IMG if os.path.exists(DEFAULT_IMG) else "floor-plan.jpg"
    print(f"Using image: {img_path}")

    # Inference
    try:
        print("\n🔄 Running wall detection...")
        wall_result = wall_model.predict(img_path, confidence=50, overlap=50).json()
        wall_result["predictions"] = sanitize_predictions(wall_result.get("predictions"))
        print(f"  ✓ Wall detections: {len(wall_result.get('predictions', []))}")
    except Exception as e:
        print(f"✗ Error in wall detection: {e}")
        wall_result = {"predictions": [], "image": {"width": 0, "height": 0}}

    try:
        print("🔄 Running room detection...")
        try:
            room_result = room_model.predict(img_path, confidence=90, overlap=30).json()
        except Exception:
            room_result = room_model.predict(img_path, confidence=19).json()
        room_result["predictions"] = sanitize_predictions(room_result.get("predictions"))
        print(f"  ✓ Room detections: {len(room_result.get('predictions', []))}")
    except Exception as e:
        print(f"✗ Error in room detection: {e}")
        room_result = {"predictions": [], "image": {"width": 0, "height": 0}}

    try:
        print("🔄 Running object detection...")
        object_result = object_model.predict(img_path, confidence=40, overlap=30).json()
        object_result["predictions"] = sanitize_predictions(object_result.get("predictions"))
        print(f"  ✓ Object detections: {len(object_result.get('predictions', []))}")
    except Exception as e:
        print(f"✗ Error in object detection: {e}")
        object_result = {"predictions": [], "image": {"width": 0, "height": 0}}

    print("\n" + "=" * 50)
    print(f"✓ Wall detections: {len(wall_result.get('predictions', []))}")
    print(f"✓ Room detections: {len(room_result.get('predictions', []))}")
    print(f"✓ Object detections: {len(object_result.get('predictions', []))}")

    # Save raw JSONs
    print("\n💾 Saving raw JSON outputs...")
    try:
        with open(os.path.join(OUTPUT_DIR, "wall_detections.json"), "w") as f:
            json.dump(wall_result, f, indent=2)
        print("  ✓ Raw wall detections saved")
    except Exception as e:
        print(f"  ✗ Error saving wall JSON: {e}")

    try:
        with open(os.path.join(OUTPUT_DIR, "room_detections.json"), "w") as f:
            json.dump(room_result, f, indent=2)
        print("  ✓ Raw room detections saved")
    except Exception as e:
        print(f"  ✗ Error saving room JSON: {e}")

    try:
        with open(os.path.join(OUTPUT_DIR, "object_detections.json"), "w") as f:
            json.dump(object_result, f, indent=2)
        print("  ✓ Raw object detections saved")
    except Exception as e:
        print(f"  ✗ Error saving object JSON: {e}")

    # Convert detections
    wall_detections, wall_labels = roboflow_to_detections(wall_result, "Wall")
    room_detections, room_labels = roboflow_to_detections(room_result, "Room")
    object_detections, object_labels = roboflow_to_detections(object_result, "Object")

    # Load image
    image = cv2.imread(img_path)
    if image is None:
        print(f"✗ Error: Could not read image '{img_path}', creating dummy.")
        image = np.ones((800, 800, 3), dtype=np.uint8) * 255
    original_image = image.copy()

    # Annotators
    wall_box_annotator = sv.BoxAnnotator(color=sv.Color(r=139, g=0, b=0), thickness=2)
    room_box_annotator = sv.BoxAnnotator(color=sv.Color(r=0, g=0, b=255), thickness=2)
    object_box_annotator = sv.BoxAnnotator(color=sv.Color(r=255, g=165, b=0), thickness=2)
    label_annotator = sv.LabelAnnotator(text_color=sv.Color(255, 255, 255), text_scale=0.5)

    annotated_image = image.copy()
    if len(wall_detections) > 0:
        annotated_image = wall_box_annotator.annotate(scene=annotated_image, detections=wall_detections)
    if len(room_detections) > 0:
        annotated_image = room_box_annotator.annotate(scene=annotated_image, detections=room_detections)
    if len(object_detections) > 0:
        annotated_image = object_box_annotator.annotate(scene=annotated_image, detections=object_detections)

    if len(wall_detections) > 0:
        annotated_image = label_annotator.annotate(scene=annotated_image, detections=wall_detections, labels=wall_labels)
    if len(room_detections) > 0:
        annotated_image = label_annotator.annotate(scene=annotated_image, detections=room_detections, labels=room_labels)
    if len(object_detections) > 0:
        annotated_image = label_annotator.annotate(scene=annotated_image, detections=object_detections, labels=object_labels)

    annotated_image_path = os.path.join(OUTPUT_DIR, "combined_detection_result.jpg")
    cv2.imwrite(annotated_image_path, annotated_image)
    print(f"✓ Annotated image saved as '{annotated_image_path}'")

    # Legend
    legend_height, legend_width = 180, 450
    legend = np.ones((legend_height, legend_width, 3), dtype=np.uint8) * 255
    cv2.putText(legend, "Detection Legend", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    cv2.rectangle(legend, (10, 50), (40, 80), (0, 0, 139), -1)
    cv2.rectangle(legend, (10, 50), (40, 80), (0, 0, 0), 2)
    cv2.putText(legend, "Walls (cubicasa5k)", (50, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
    cv2.rectangle(legend, (10, 90), (40, 120), (255, 0, 0), -1)
    cv2.rectangle(legend, (10, 90), (40, 120), (0, 0, 0), 2)
    cv2.putText(legend, "Rooms (plangost)", (50, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
    cv2.rectangle(legend, (10, 130), (40, 160), (0, 165, 255), -1)
    cv2.rectangle(legend, (10, 130), (40, 160), (0, 0, 0), 2)
    cv2.putText(legend, "Objects", (50, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
    legend_path = os.path.join(OUTPUT_DIR, "detection_legend.jpg")
    cv2.imwrite(legend_path, legend)
    print(f"✓ Detection legend saved as '{legend_path}'")

    # Separate visualizations
    try:
        walls_only = original_image.copy()
        if len(wall_detections) > 0:
            walls_only = wall_box_annotator.annotate(scene=walls_only, detections=wall_detections)
            walls_only = label_annotator.annotate(scene=walls_only, detections=wall_detections, labels=wall_labels)
        cv2.imwrite(os.path.join(OUTPUT_DIR, "walls_only.jpg"), walls_only)
        print("  ✓ Walls only saved")
    except Exception as e:
        print(f"  ✗ Error saving walls only: {e}")

    try:
        rooms_only = original_image.copy()
        if len(room_detections) > 0:
            rooms_only = room_box_annotator.annotate(scene=rooms_only, detections=room_detections)
            rooms_only = label_annotator.annotate(scene=rooms_only, detections=room_detections, labels=room_labels)
        cv2.imwrite(os.path.join(OUTPUT_DIR, "rooms_only.jpg"), rooms_only)
        print("  ✓ Rooms only saved")
    except Exception as e:
        print(f"  ✗ Error saving rooms only: {e}")

    try:
        objects_only = original_image.copy()
        if len(object_detections) > 0:
            objects_only = object_box_annotator.annotate(scene=objects_only, detections=object_detections)
            objects_only = label_annotator.annotate(scene=objects_only, detections=object_detections, labels=object_labels)
        cv2.imwrite(os.path.join(OUTPUT_DIR, "objects_only.jpg"), objects_only)
        print("  ✓ Objects only saved")
    except Exception as e:
        print(f"  ✗ Error saving objects only: {e}")

    # 3D JSON
    print("\n💾 Creating 3D rendering JSON...")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    image_width = wall_result.get("image", {}).get("width", 800)
    image_height = wall_result.get("image", {}).get("height", 600)

    combined_json_3d = {
        "metadata": {
            "project_name": "FloorPlan_3D_Rendering",
            "timestamp": timestamp,
            "image_info": {
                "filename": os.path.basename(img_path),
                "width": image_width,
                "height": image_height,
                "scale_factor": 1.0,
                "units": "pixels",
            },
            "processing_info": {
                "wall_confidence_threshold": 28,
                "room_confidence_threshold": 19,
                "object_confidence_threshold": 40,
                "overlap_threshold": 30,
            },
            "model_info": {
                "wall_model": {"name": "cubicasa5k-2-qpmsa", "version": 3, "type": "wall_detection"},
                "room_model": {"name": "plangost", "version": 9, "type": "room_segmentation"},
                "object_model": {"name": "floor_plan_detection", "version": 3, "type": "object_detection"},
            },
        },
        "statistics": {
            "total_detections": len(wall_result.get("predictions", []))
            + len(room_result.get("predictions", []))
            + len(object_result.get("predictions", [])),
            "wall_detections": len(wall_result.get("predictions", [])),
            "room_detections": len(room_result.get("predictions", [])),
            "object_detections": len(object_result.get("predictions", [])),
        },
        "detections": {"walls": [], "rooms": [], "objects": []},
    }

    for pred in wall_result.get("predictions", []):
        try:
            wall_data = create_3d_bbox_dict(pred, pred.get("class", "wall"), "wall", image_width, image_height, combined_json_3d)
            wall_data["properties_3d"].update({"type": "vertical", "thickness": 0.15, "material": "drywall"})
            combined_json_3d["detections"]["walls"].append(wall_data)
        except Exception as e:
            print(f"  Warning: Skipping wall detection: {e}")

    for pred in room_result.get("predictions", []):
        try:
            room_data = create_3d_bbox_dict(pred, pred.get("class", "room"), "room", image_width, image_height, combined_json_3d)
            room_data["properties_3d"].update({"type": "space", "floor_material": "wood", "ceiling_height": 2.4, "has_lighting": True})
            combined_json_3d["detections"]["rooms"].append(room_data)
        except Exception as e:
            print(f"  Warning: Skipping room detection: {e}")

    for pred in object_result.get("predictions", []):
        try:
            object_data = create_3d_bbox_dict(pred, pred.get("class", "object"), "object", image_width, image_height, combined_json_3d)
            object_class = pred.get("class", "").lower()
            height_mapping = {
                "table": 0.75,
                "chair": 0.9,
                "bed": 0.5,
                "sofa": 0.8,
                "cabinet": 2.0,
                "door": 2.1,
                "window": 1.2,
                "toilet": 0.4,
                "sink": 0.85,
                "bathtub": 0.5,
            }
            object_data["properties_3d"].update({
                "type": "furniture",
                "height": height_mapping.get(object_class, 1.0),
                "interactive": object_class in ["chair", "door", "window"],
                "category": object_class,
            })
            combined_json_3d["detections"]["objects"].append(object_data)
        except Exception as e:
            print(f"  Warning: Skipping object detection: {e}")

    json_3d_path = os.path.join(OUTPUT_DIR, "floorplan_3d_data.json")
    with open(json_3d_path, "w") as f:
        json.dump(combined_json_3d, f, indent=2)
    print(f"✓ 3D rendering JSON saved as '{json_3d_path}'")

    # Simplified JSON
    print("\n💾 Creating simplified combined JSON...")
    combined_json = {
        "image_info": {"filename": os.path.basename(img_path), "width": image_width, "height": image_height},
        "detections": [],
        "statistics": combined_json_3d["statistics"].copy(),
        "model_info": combined_json_3d["metadata"]["model_info"].copy(),
    }

    for idx, pred in enumerate(wall_result.get("predictions", [])):
        try:
            combined_json["detections"].append({
                "id": f"wall_{idx}",
                "type": "wall",
                "class": pred.get("class"),
                "class_id": pred.get("class_id"),
                "confidence": round(pred.get("confidence", 0.0), 4),
                "bbox": create_simple_bbox_dict(pred),
                "model": "cubicasa5k-2-qpmsa-v3",
            })
        except Exception as e:
            print(f"  Warning: Skipping wall detection {idx} in simple JSON: {e}")

    for idx, pred in enumerate(room_result.get("predictions", [])):
        try:
            combined_json["detections"].append({
                "id": f"room_{idx}",
                "type": "room",
                "class": pred.get("class"),
                "class_id": pred.get("class_id"),
                "confidence": round(pred.get("confidence", 0.0), 4),
                "bbox": create_simple_bbox_dict(pred),
                "model": "plangost-v9",
            })
        except Exception as e:
            print(f"  Warning: Skipping room detection {idx} in simple JSON: {e}")

    for idx, pred in enumerate(object_result.get("predictions", [])):
        try:
            combined_json["detections"].append({
                "id": f"object_{idx}",
                "type": "object",
                "class": pred.get("class"),
                "class_id": pred.get("class_id"),
                "confidence": round(pred.get("confidence", 0.0), 4),
                "bbox": create_simple_bbox_dict(pred),
                "model": "floor_plan_detection-v3",
            })
        except Exception as e:
            print(f"  Warning: Skipping object detection {idx} in simple JSON: {e}")

    simple_json_path = os.path.join(OUTPUT_DIR, "combined_detections.json")
    with open(simple_json_path, "w") as f:
        json.dump(combined_json, f, indent=2)
    print(f"✓ Simplified combined JSON saved as '{simple_json_path}'")

    print("\n" + "=" * 60)
    print("✅ PROCESSING COMPLETE!")
    total_detections = combined_json_3d['statistics']['total_detections']
    print(f"  • Total detections: {total_detections}")
    print(f"  • Walls: {combined_json_3d['statistics']['wall_detections']}")
    print(f"  • Rooms: {combined_json_3d['statistics']['room_detections']}")
    print(f"  • Objects: {combined_json_3d['statistics']['object_detections']}")
    print(f"Outputs saved in: {OUTPUT_DIR}")

    # No interactive cv2 windows to keep headless-friendly

if __name__ == "__main__":
    main()
