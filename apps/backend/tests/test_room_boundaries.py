"""Room topology regressions, independent of model weights, OCR and database."""
import json
from pathlib import Path
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from room_boundaries import detect_room_boundaries


def wall(x1, y1, x2, y2, thickness=10):
    return {'start': {'x': x1, 'y': y1}, 'end': {'x': x2, 'y': y2}, 'thickness_px': thickness}


def rectangle(x1=40, y1=40, x2=440, y2=340, thickness=10):
    return [wall(x1, y1, x2, y1, thickness), wall(x2, y1, x2, y2, thickness),
            wall(x2, y2, x1, y2, thickness), wall(x1, y2, x1, y1, thickness)]


def area(identifier, bounds, value=4.4, confidence=0.95):
    return {'id': identifier, 'bbox': bounds, 'text': f'A: {value} m²', 'value_m2': value, 'confidence': confidence}


class RoomBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.image = np.full((400, 500, 3), 255, np.uint8)

    def test_subpixel_fit_and_inside_face_endpoint_do_not_leave_ceiling_hole(self):
        walls=rectangle()
        walls[-1]=wall(39.8,340,40.2,40)
        walls[2]=wall(440,340,48,340)
        original=json.dumps(walls)
        result=detect_room_boundaries(self.image,walls)
        self.assertEqual(len(result['rooms']),1)
        self.assertAlmostEqual(result['rooms'][0]['area_px2'],390*290,places=3)
        self.assertEqual(json.dumps(walls),original)

    def test_small_collinear_break_requires_drawn_boundary_evidence(self):
        walls=rectangle()[1:]+[wall(40,40,220,40),wall(221,40,440,40)]
        self.assertFalse(detect_room_boundaries(self.image,walls)['rooms'])
        for y in (35,45): cv2.line(self.image,(40,y),(440,y),(0,0,0),1)
        self.assertEqual(len(detect_room_boundaries(self.image,walls)['rooms']),1)

    def test_enclosed_room_uses_inside_faces_and_unique_area_label(self):
        result = detect_room_boundaries(self.image, rectangle(), measurements={'areas': [area('a1', [100, 100, 180, 125])]})
        self.assertEqual(len(result['rooms']), 1)
        room = result['rooms'][0]
        self.assertEqual(room['area_px2'], 390 * 290)
        self.assertEqual({(point['x'], point['y']) for point in room['points']}, {(45, 45), (435, 45), (435, 335), (45, 335)})
        self.assertEqual(room['declared_area_m2'], 4.4)
        self.assertEqual(room['boundary_reference'], 'inside_faces')
        self.assertEqual(result['unresolved'], [])
        json.dumps(result, allow_nan=False)

    def test_shared_wall_produces_two_nonoverlapping_rooms(self):
        result = detect_room_boundaries(self.image, rectangle() + [wall(240, 40, 240, 340)],
                                        measurements={'areas': [area('a1', [100, 100, 160, 125]), area('a2', [300, 100, 360, 125], 8)]})
        self.assertEqual(len(result['rooms']), 2)
        self.assertEqual([room['area_px2'] for room in result['rooms']], [190 * 290, 190 * 290])
        self.assertEqual([room['declared_area_m2'] for room in result['rooms']], [4.4, 8])

    def test_only_evidenced_door_gap_is_closed(self):
        walls = rectangle()[:-1] + [wall(40, 40, 40, 150), wall(40, 210, 40, 340)]
        measurements = {'areas': [area('a1', [100, 100, 160, 125])]}
        self.assertEqual(detect_room_boundaries(self.image, walls, measurements=measurements)['rooms'], [])
        result = detect_room_boundaries(self.image, walls, doors=[{'bbox': {'x1': 33, 'y1': 150, 'x2': 98, 'y2': 210}}], measurements=measurements)
        self.assertEqual(len(result['rooms']), 1)
        self.assertEqual(result['rooms'][0]['area_px2'], 390 * 290)
        self.assertEqual(len(result['closures']), 1)
        self.assertEqual(len(walls), 5)  # Source walls are never changed.

    def test_window_gap_and_duplicate_opening_close_once(self):
        walls = rectangle()[1:] + [wall(40, 40, 150, 40), wall(220, 40, 440, 40)]
        window = {'class': 'window', 'bbox': {'x1': 150, 'y1': 35, 'x2': 220, 'y2': 45}}
        result = detect_room_boundaries(self.image, walls, objects=[window, window])
        self.assertEqual(len(result['rooms']), 1)
        self.assertEqual(len(result['closures']), 1)

    def test_missing_wall_is_not_closed_by_room_or_unrelated_door_box(self):
        walls = rectangle()[:-1]
        result = detect_room_boundaries(self.image, walls,
                                       doors=[{'bbox': {'x1': 40, 'y1': 40, 'x2': 100, 'y2': 340}}],
                                       objects=[{'class': 'bedroom', 'bbox': {'x1': 40, 'y1': 40, 'x2': 440, 'y2': 340}}],
                                       measurements={'areas': [area('a1', [100, 100, 160, 125])]})
        self.assertEqual(result['rooms'], [])
        self.assertEqual(result['unresolved'][0]['reason'], 'no_enclosed_room')

    def test_multiple_areas_in_open_plan_are_ambiguous(self):
        result = detect_room_boundaries(self.image, rectangle(), measurements={
            'areas': [area('kitchen', [100, 100, 160, 125]), area('dining', [300, 200, 360, 225], 12)]})
        self.assertEqual(len(result['rooms']), 1)
        self.assertNotIn('declared_area_m2', result['rooms'][0])
        self.assertEqual(len(result['unresolved']), 2)
        self.assertEqual({item['reason'] for item in result['unresolved']}, {'multiple_area_labels_in_open_region'})

    def test_low_confidence_label_does_not_become_exact_target(self):
        result = detect_room_boundaries(self.image, rectangle(), measurements={'areas': [area('a1', [100, 100, 160, 125], confidence=0.6)]})
        self.assertNotIn('declared_area_m2', result['rooms'][0])
        self.assertEqual(result['unresolved'][0]['reason'], 'low_ocr_confidence')

    def test_label_overlapping_boundary_is_not_assigned_by_center_only(self):
        result = detect_room_boundaries(self.image, rectangle(), measurements={'areas': [area('a1', [39, 100, 100, 125])]})
        self.assertNotIn('declared_area_m2', result['rooms'][0])
        self.assertEqual(result['unresolved'][0]['reason'], 'no_enclosed_room')

    def test_concave_room_preserves_indent(self):
        coordinates = [(40, 40), (440, 40), (440, 190), (240, 190), (240, 340), (40, 340)]
        walls = [wall(*a, *b) for a, b in zip(coordinates, coordinates[1:] + coordinates[:1])]
        result = detect_room_boundaries(self.image, walls)
        self.assertEqual(len(result['rooms']), 1)
        room = result['rooms'][0]
        # The rendered walls have butt ends. Their concave junction leaves a
        # 5-by-5 pixel pocket, which belongs to the actual clear floor polygon.
        self.assertEqual(room['area_px2'], 390 * 140 + 190 * 150 + 5 * 5)
        self.assertGreaterEqual(len(room['points']), 6)
        self.assertLess(room['area_px2'], 390 * 290)

    def test_disconnected_furniture_outline_does_not_create_extra_room(self):
        result = detect_room_boundaries(self.image, rectangle() + rectangle(120, 120, 200, 220, 2))
        self.assertEqual(len(result['rooms']), 1)
        self.assertEqual(result['rooms'][0]['area_px2'], 390 * 290)

    def test_rotated_rooms_remain_unresolved(self):
        points = [(250, 40), (440, 190), (250, 340), (60, 190)]
        walls = [wall(*a, *b) for a, b in zip(points, points[1:] + points[:1])]
        result = detect_room_boundaries(self.image, walls, measurements={'areas': [area('a1', [200, 150, 280, 175])]})
        self.assertEqual(result['rooms'], [])
        self.assertTrue(any('Angled' in warning for warning in result['warnings']))

    def test_missing_pixel_thickness_measured_from_image(self):
        walls = rectangle()
        for item in walls:
            del item['thickness_px']
            cv2.line(self.image, (int(item['start']['x']), int(item['start']['y'])),
                     (int(item['end']['x']), int(item['end']['y'])), (0, 0, 0), 9)
        result = detect_room_boundaries(self.image, walls)
        self.assertEqual(len(result['rooms']), 1)
        self.assertEqual(len(result['wall_thicknesses']), 4)
        self.assertTrue(all(item['thickness_px'] == 11 for item in result['wall_thicknesses']))
        self.assertNotIn('thickness_px', walls[0])

    def test_missing_unknown_thickness_is_not_replaced_with_arbitrary_room(self):
        walls = rectangle()
        for item in walls:
            del item['thickness_px']
        result = detect_room_boundaries(self.image, walls)
        self.assertEqual(result['rooms'], [])
        self.assertTrue(any('thickness' in warning for warning in result['warnings']))

    def test_detected_room_box_names_polygon_but_does_not_define_its_shape(self):
        result = detect_room_boundaries(self.image, rectangle(), objects=[
            {'class': 'kitchen-verandah', 'bbox': {'x1': 90, 'y1': 80, 'x2': 390, 'y2': 300}}])
        self.assertEqual(result['rooms'][0]['name'], 'Kitchen Verandah')
        self.assertEqual(result['rooms'][0]['area_px2'], 390 * 290)


if __name__ == '__main__':
    unittest.main()
