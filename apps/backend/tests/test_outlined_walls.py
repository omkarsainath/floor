"""White-core walls, duplicate wall faces and repeated door representations."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from outlined_walls import detect_outlined_walls
from wall_geometry import consolidate_walls, supported_proposals
from door_geometry import deduplicate_doors
from room_boundaries import detect_room_boundaries


def plan():
    image = np.full((600, 800, 3), 255, np.uint8)
    cv2.rectangle(image, (70, 120), (710, 530), (0, 0, 0), 2)
    cv2.rectangle(image, (82, 132), (698, 518), (0, 0, 0), 2)
    for x in (400, 412):
        cv2.line(image, (x, 132), (x, 420), (0, 0, 0), 2)
        cv2.line(image, (x, 490), (x, 518), (0, 0, 0), 2)
    return image


def door(x1, y1, x2, y2, **metadata):
    return {'bbox': dict(zip(('x1', 'y1', 'x2', 'y2'), (x1, y1, x2, y2))), **metadata}


class OutlinedWallTests(unittest.TestCase):
    def test_white_core_network_has_one_centerline_per_band_and_preserves_gap(self):
        image = plan()
        walls = detect_outlined_walls(image)
        self.assertEqual(len(walls), 6, walls)
        vertical = [w for w in walls if w['outline_faces']['axis'] == 'y'
                    and abs(w['start']['x'] - 406) <= 1]
        self.assertEqual(len(vertical), 2)
        self.assertEqual([w['start']['y'] for w in vertical], [126, 489])
        self.assertTrue(all(abs(w['thickness_px'] - 12) <= 1 for w in walls))
        self.assertEqual(walls, consolidate_walls(walls, image))
        rooms = detect_room_boundaries(image, walls, [door(399, 420, 413, 490)])['rooms']
        self.assertEqual(len(rooms), 2)
        self.assertTrue(all(r['boundary_reference'] == 'inside_faces' for r in rooms))

    def test_disconnected_double_outline_furniture_is_not_an_extra_room(self):
        image = plan()
        cv2.rectangle(image, (160, 230), (280, 310), (0, 0, 0), 2)
        cv2.rectangle(image, (172, 242), (268, 298), (0, 0, 0), 2)
        walls = detect_outlined_walls(image)
        self.assertEqual(len(walls), 6)
        self.assertFalse(any(150 < w['start']['x'] < 300 and 200 < w['start']['y'] < 330 for w in walls))

    def test_recognized_dimension_rules_are_not_wall_faces(self):
        image = plan()
        for y in (80, 92):
            cv2.line(image, (70, y), (710, y), (0, 0, 0), 2)
        measurements = {'linear': [{'reference': {'start': {'x': 70, 'y': y},
                        'end': {'x': 710, 'y': y}, 'stroke_width_px': 2}} for y in (80, 92)]}
        self.assertEqual(len(detect_outlined_walls(image, measurements)), 6)

    def test_filled_rectangle_does_not_become_an_outlined_wall(self):
        image = np.full((400, 500, 3), 255, np.uint8)
        cv2.rectangle(image, (60, 70), (440, 340), (0, 0, 0), 12)
        self.assertEqual(detect_outlined_walls(image), [])
        self.assertEqual(detect_outlined_walls(None), [])

    def test_face_duplicate_is_absorbed_but_white_center_without_evidence_is_rejected(self):
        image = plan()
        walls = detect_outlined_walls(image)
        top = next(w for w in walls if w['outline_faces']['axis'] == 'x' and w['start']['y'] < 200)
        face = {'start': {'x': 90, 'y': 120}, 'end': {'x': 680, 'y': 120}, 'detector': 'yolo'}
        result = consolidate_walls(walls + [face], image)
        self.assertEqual(len(result), 6)
        self.assertIn(top, result)
        unproved = {'start': top['start'], 'end': top['end']}
        self.assertEqual(supported_proposals([unproved], image), [])
        self.assertEqual(len(supported_proposals([top], image)), 1)

    def test_authored_wall_keeps_geometry_and_input_is_unchanged(self):
        image = plan()
        walls = detect_outlined_walls(image)
        manual = {'start': {'x': 150, 'y': 126}, 'end': {'x': 250, 'y': 126},
                  'source': 'manual', 'height': 2.7}
        original = deepcopy(walls)
        result = consolidate_walls(walls + [manual], image)
        self.assertIn(manual, result)
        self.assertEqual(walls, original)
        self.assertEqual(result, consolidate_walls(result, image))


class DoorDeduplicationTests(unittest.TestCase):
    def test_narrow_opening_and_swing_square_merge_in_both_orientations(self):
        for opening, swing in ((door(100, 90, 190, 105), door(101, 104, 191, 196)),
                               (door(90, 100, 105, 190), door(104, 101, 196, 191))):
            swing.update({'class': 'door', 'confidence': .91, 'swingDir': 'right-inside'})
            before = deepcopy([opening, swing])
            for items in ([opening, swing], [swing, opening]):
                result = deduplicate_doors(items)
                self.assertEqual(len(result), 1)
                self.assertEqual(result[0]['bbox'], opening['bbox'])
                self.assertEqual(result[0]['swing_bbox'], swing['bbox'])
                self.assertEqual(result[0]['swingDir'], 'right-inside')
                self.assertEqual(result[0]['confidence'], .91)
                self.assertNotIn('double', result[0])
            self.assertEqual([opening, swing], before)

    def test_neighbouring_openings_are_not_guessed_to_be_double_doors(self):
        doors = [door(100, 90, 190, 105), door(192, 90, 282, 105)]
        self.assertEqual(deduplicate_doors(doors), doors)

    def test_authored_correction_wins_over_automatic_geometry(self):
        automatic = door(100, 90, 190, 105, confidence=.99)
        manual = door(102, 90, 189, 104, source='manual', swingDir='left-outside')
        result = deduplicate_doors([automatic, manual])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['bbox'], manual['bbox'])
        self.assertEqual(result[0]['swingDir'], 'left-outside')

    def test_explicit_double_door_is_preserved_and_dedup_is_idempotent(self):
        doors = [door(100, 90, 290, 105, double=True), door(101, 91, 289, 106)]
        result = deduplicate_doors(doors)
        self.assertEqual(len(result), 1)
        self.assertTrue(result[0]['double'])
        self.assertEqual(result, deduplicate_doors(result))

    def test_unrelated_swing_or_invalid_box_does_not_erase_a_door(self):
        doors = [door(100, 90, 190, 105), door(200, 104, 290, 196), {'bbox': {}}]
        self.assertEqual(deduplicate_doors(doors), doors)


if __name__ == '__main__':
    unittest.main()
