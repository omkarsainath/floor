from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from shapely.geometry import Point, box

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
# Import without dotenv or a cloud SDK; these tests never call external services.
with patch.dict(sys.modules, {"dotenv": None, "google.generativeai": None}):
    import ai_assistant as assistant


def room(points, **metadata):
    return {"type": "bedroom", "points": [{"x": x, "y": y} for x, y in points], **metadata}


class LocalRoomTests(unittest.TestCase):
    def test_walls_alone_do_not_invent_four_rooms(self):
        layout = {"walls": [{"start": {"x": 0, "y": 0}, "end": {"x": 20, "y": 10}}]}
        with patch.object(assistant, "_get_model", side_effect=AssertionError("No cloud required")):
            result = assistant.detect_rooms_from_layout(layout)
        self.assertEqual(result["rooms"], [])
        self.assertEqual(result["actions"], [])

    def test_concave_room_preserves_boundary_and_uses_polygon_area(self):
        original = room([(0, 0), (4, 0), (4, 1), (1, 1), (1, 4), (0, 4)], name="Bedroom")
        result = assistant.detect_rooms_from_layout({"rooms": [original]})["rooms"][0]
        self.assertEqual(result["points"], original["points"])
        self.assertEqual(result["area_m2"], 7)
        self.assertAlmostEqual(result["area_sqft"], 75.347372916966)
        self.assertTrue(assistant._room_polygon(result).covers(Point(result["center_x"], result["center_z"])))

    def test_invalid_and_estimated_boundaries_are_not_used(self):
        rooms = [room([(0, 0), (2, 2), (0, 2), (2, 0)]),
                 room([(0, 0), (4, 0), (4, 4)], boundary_source="detector_bbox"),
                 room([(0, 0), (float("nan"), 0), (4, 4)])]
        self.assertEqual(assistant.detect_rooms_from_layout({"rooms": rooms})["rooms"], [])

    def test_furniture_never_protrudes_outside_concave_room_or_overlaps(self):
        original = room([(0, 0), (8, 0), (8, 3), (5, 3), (5, 8), (0, 8)])
        rooms = assistant.detect_rooms_from_layout({"rooms": [original]})["rooms"]
        actions = assistant.auto_furnish(rooms)["actions"]
        self.assertTrue(actions)
        footprints = []
        polygon = assistant._room_polygon(original)
        for action in actions:
            x, z, w, d = (action[k] for k in ("x", "z", "width", "depth"))
            footprint = box(x - w / 2, z - d / 2, x + w / 2, z + d / 2)
            self.assertTrue(polygon.covers(footprint))
            self.assertTrue(all(footprint.intersection(other).area <= 1e-8 for other in footprints))
            footprints.append(footprint)

    def test_no_furnishing_from_ai_bounding_boxes_or_unknown_room_types(self):
        self.assertEqual(assistant.auto_furnish([{"type": "bedroom", "width": 6, "depth": 5}])["actions"], [])
        rooms = assistant.detect_rooms_from_layout({"rooms": [
            room([(0, 0), (8, 0), (8, 8), (0, 8)], type="laundry")
        ]})["rooms"]
        self.assertEqual(assistant.auto_furnish(rooms)["actions"], [])


if __name__ == "__main__":
    unittest.main()
