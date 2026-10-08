import base64
from copy import deepcopy
import io
import itertools
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch, Mock

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from wall_geometry import consolidate_walls, exclude_object_interior_walls, snap_wall_endpoints
import wall_ai


def wall(x1, y1, x2, y2, **metadata):
    return {"start": {"x": x1, "y": y1}, "end": {"x": x2, "y": y2}, **metadata}


class WallGeometryTests(unittest.TestCase):
    def test_reversed_duplicates_and_extensions_preserved(self):
        walls = [wall(0, 20, 60, 20), wall(100, 20, 30, 20), wall(50, 20, 0, 20)]
        before = deepcopy(walls)
        for order in itertools.permutations(walls):
            self.assertEqual(consolidate_walls(order), [wall(0, 20, 100, 20)])
        self.assertEqual(walls, before)

    def test_bridge_proposal_consolidates_all_overlaps(self):
        walls = [wall(0, 20, 30, 20), wall(60, 20, 100, 20), wall(20, 20, 80, 20)]
        self.assertEqual(consolidate_walls(walls), [wall(0, 20, 100, 20)])

    def test_filled_wall_edges_become_one_centerline(self):
        image = np.full((100, 140, 3), 255, np.uint8)
        image[20:31, 10:121] = 0
        proposals = [wall(10, 20, 100, 20), wall(120, 30, 20, 30)]
        result = consolidate_walls(proposals, image)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["start"], {"x": 10, "y": 25})
        self.assertEqual(result[0]["end"], {"x": 120, "y": 25})
        self.assertEqual(result[0]["thickness_px"], 11)
        self.assertEqual(result, consolidate_walls(result, image))

    def test_nearby_distinct_partitions_survive(self):
        image = np.full((100, 140, 3), 255, np.uint8)
        image[20:25, 10:121] = 0
        image[30:35, 10:121] = 0
        result = consolidate_walls([wall(10, 22, 120, 22), wall(10, 32, 120, 32)], image)
        self.assertEqual(len(result), 2)
        self.assertEqual([w["start"]["y"] for w in result], [22, 32])

    def test_no_image_does_not_justify_parallel_deduplication(self):
        self.assertEqual(len(consolidate_walls([wall(0, 0, 100, 0), wall(0, 4, 100, 4)])), 2)

    def test_door_gap_is_never_merged_or_snapped(self):
        walls = [wall(0, 0, 40, 0), wall(46, 0, 100, 0)]
        self.assertEqual(consolidate_walls(walls, snap_dist=18), walls)

    def test_corner_and_t_junction_keep_axes(self):
        walls = [wall(0, 20, 98, 20), wall(100, 23, 100, 80), wall(50, 24, 50, 60)]
        result = snap_wall_endpoints(walls, 8)
        self.assertEqual(result[0]["end"], {"x": 100, "y": 20})
        self.assertEqual(result[1]["start"], {"x": 100, "y": 20})
        self.assertEqual(result[2]["start"], {"x": 50, "y": 20})
        self.assertEqual(result, snap_wall_endpoints(result, 8))

    def test_short_wall_and_metadata_survive(self):
        walls = [wall(0, 0, 6, 0, source="manual", height=1.2, wall_type="half")]
        self.assertEqual(consolidate_walls(walls, snap_dist=18), walls)

    def test_diagonal_is_not_flattened(self):
        result = consolidate_walls([wall(0, 0, 50, 50), wall(100, 100, 30, 30)])
        self.assertEqual(result, [wall(0, 0, 100, 100)])

    def test_authored_geometry_wins_and_auto_remainder_survives(self):
        image = np.full((80, 140, 3), 255, np.uint8)
        image[20:31, 0:121] = 0
        manual = wall(20, 24, 80, 24, source="manual", height=2.4)
        result = consolidate_walls([wall(0, 25, 120, 25), manual], image)
        self.assertIn(manual, result)
        self.assertEqual(len(result), 3)
        self.assertEqual(result, consolidate_walls(result, image))

    def test_snap_does_not_extend_through_white_space(self):
        image = np.full((120, 120, 3), 255, np.uint8)
        walls = [wall(0, 10, 90, 10), wall(96, 10, 96, 100)]
        self.assertEqual(snap_wall_endpoints(walls, 8, image), walls)

    def test_invalid_coordinates_are_rejected(self):
        result = consolidate_walls([wall(0, 0, 0, 0), wall(0, 0, float("nan"), 2), {}, wall(0, 0, 10, 0)])
        self.assertEqual(result, [wall(0, 0, 10, 0)])

    def test_furniture_boxes_cannot_erase_structural_walls(self):
        furniture = [{"class": "bed", "bbox": {"x1": 30, "y1": 30, "x2": 130, "y2": 100}}]
        perimeter = wall(10, 20, 180, 20)
        bed_edge = wall(45, 55, 115, 55)
        manual = wall(45, 75, 115, 75, source="manual")
        self.assertEqual(
            exclude_object_interior_walls([perimeter, bed_edge, manual], furniture),
            [perimeter, bed_edge, manual],
        )

    def test_verified_stair_treads_are_removed_but_boundary_survives(self):
        stairs = [{"class": "stairs", "bbox": {"x1": 30, "y1": 30, "x2": 130, "y2": 130}}]
        boundary = wall(30, 30, 30, 130)
        tread = wall(45, 60, 115, 60)
        self.assertEqual(exclude_object_interior_walls([boundary, tread], stairs), [boundary])

    def test_room_detection_box_does_not_remove_walls(self):
        detected = wall(20, 50, 180, 50)
        room = [{"class": "bedroom", "bbox": {"x1": 10, "y1": 10, "x2": 190, "y2": 110}}]
        self.assertEqual(exclude_object_interior_walls([detected], room), [detected])

    def test_cv_detects_short_return_without_door_bridge(self):
        image = np.full((180, 220, 3), 255, np.uint8)
        cv2.rectangle(image, (20, 30), (90, 40), (0, 0, 0), -1)
        cv2.rectangle(image, (120, 30), (195, 40), (0, 0, 0), -1)
        cv2.rectangle(image, (185, 30), (195, 66), (0, 0, 0), -1)
        params = wall_ai.load_params(Path('/nonexistent-wall-params'))
        detected = wall_ai.detect_lines(image, params)
        self.assertTrue(any(abs(w["end"]["y"] - w["start"]["y"]) >= 30 for w in detected))
        self.assertFalse(any(w["start"]["x"] < 95 and w["end"]["x"] > 115 for w in detected))

    def test_cv_preserves_thin_plan_walls_with_thick_trained_reference(self):
        image = np.full((220, 300, 3), 255, np.uint8)
        # A complete 5 px wall network, deliberately thinner than the old
        # 11x11 preprocessing kernel derived from the trained reference.
        cv2.rectangle(image, (45, 45), (255, 175), (0, 0, 0), 5)
        cv2.line(image, (150, 45), (150, 175), (0, 0, 0), 5)
        # A long one-pixel dimension rule must not become a wall.
        cv2.line(image, (35, 198), (265, 198), (0, 0, 0), 1)
        params = wall_ai.load_params(Path('/nonexistent-wall-params'))
        params['wall_thickness'] = 10

        detected = wall_ai.detect_lines(image, params)

        self.assertTrue(any(abs(w['start']['y'] - 45) <= 4 and
                            abs(w['end']['x'] - w['start']['x']) >= 180
                            for w in detected))
        self.assertTrue(any(abs(w['start']['x'] - 150) <= 4 and
                            abs(w['end']['y'] - w['start']['y']) >= 100
                            for w in detected))
        self.assertFalse(any(abs(w['start']['y'] - 198) <= 2 and
                             abs(w['end']['x'] - w['start']['x']) >= 180
                             for w in detected))

    def test_scale_filter_keeps_long_thin_partition_joined_to_wall_network(self):
        image = np.full((500, 500, 3), 255, np.uint8)
        candidates = [
            wall(50, 50, 450, 50, detector='cv', thickness_px=12),
            wall(50, 450, 450, 450, detector='cv', thickness_px=12),
            wall(50, 50, 50, 450, detector='cv', thickness_px=12),
            wall(300, 55, 300, 450, detector='cv', thickness_px=2),
            wall(20, 250, 480, 250, detector='cv', thickness_px=1),
        ]
        filtered = wall_ai._filter_drawing_scale(candidates, image)
        self.assertIn(candidates[3], filtered)
        self.assertNotIn(candidates[4], filtered)

    def test_ocr_text_region_is_removed_from_wall_preprocessing_only(self):
        image = np.full((140, 320, 3), 255, np.uint8)
        cv2.line(image, (10, 30), (310, 30), (0, 0, 0), 8)
        cv2.putText(image, 'BEDROOM', (70, 100), cv2.FONT_HERSHEY_SIMPLEX,
                    1.0, (0, 0, 0), 3, cv2.LINE_AA)
        evidence = {'ocr_text_regions': [[65, 72, 230, 108]]}
        mask = wall_ai.preprocess_image(image, 10, evidence)
        self.assertGreater(np.count_nonzero(mask[25:36]), 200)
        self.assertEqual(np.count_nonzero(mask[68:112, 60:235]), 0)

    def test_model_class_ids_follow_names(self):
        with patch.object(wall_ai, '_get_yolo_model', return_value=Mock(names={0: 'wall'})):
            self.assertEqual(wall_ai.yolo_class_ids('test', 'wall'), [0])
            self.assertEqual(wall_ai.yolo_class_ids('test', 'door'), [])
        with patch.object(wall_ai, '_get_yolo_model', return_value=Mock(names={0: 'door', 1: 'wall', 2: 'window'})):
            self.assertEqual(wall_ai.yolo_class_ids('test', 'wall'), [1])

    def test_multiscale_object_detections_are_deduplicated_by_class(self):
        detections = [
            {"class": "Bed", "confidence": .91, "bbox": {"x1": 10, "y1": 10, "x2": 110, "y2": 80}},
            {"class": "bed", "confidence": .72, "bbox": {"x1": 12, "y1": 11, "x2": 112, "y2": 81}},
            {"class": "Side Table", "confidence": .80, "bbox": {"x1": 12, "y1": 11, "x2": 112, "y2": 81}},
        ]
        result = wall_ai._deduplicate_classified_boxes(detections)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["confidence"], .91)
        self.assertEqual(result[1]["class"], "Side Table")

    def test_tuning_score_penalizes_duplicate_predictions(self):
        labels = [wall(0, 0, 100, 0)]
        self.assertEqual(wall_ai.score_detection(labels, labels), 1)
        self.assertAlmostEqual(wall_ai.score_detection(labels * 2, labels), 2 / 3)
        self.assertEqual(wall_ai.score_detection([wall(45, 0, 55, 0)], labels), 0)
        self.assertEqual(wall_ai.score_detection([wall(100, 0, 0, 0)], labels), 1)

    def test_thin_stroke_does_not_imply_half_height(self):
        image = np.full((100, 100, 3), 255, np.uint8)
        walls = [wall(5, 5, 95, 5), wall(5, 90, 95, 90), wall(50, 5, 50, 90)]
        cv2.line(image, (5, 5), (95, 5), (0, 0, 0), 10)
        cv2.line(image, (5, 90), (95, 90), (0, 0, 0), 10)
        cv2.line(image, (50, 5), (50, 90), (0, 0, 0), 2)
        self.assertNotIn('half', [w['wall_type'] for w in wall_ai.classify_wall_types(image, walls)])


class DetectionIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Import real HTTP handler without database initialization, cloud clients,
        # training, socket binding or any external services.
        with patch.dict(sys.modules, {"db": None, "ai_assistant": None, "adk_pipeline": None}):
            import train_server
        cls.server = train_server

    def request(self, data, path='/api/auto-detect'):
        handler = object.__new__(self.server.Handler)
        body = json.dumps(data).encode()
        handler.headers = {"Content-Length": str(len(body))}
        handler.rfile = io.BytesIO(body)
        handler.path = path
        handler._send = Mock()
        handler.do_POST()
        return handler._send.call_args.args

    def test_api_cleans_combined_detectors_and_preserves_editor_walls(self):
        image = np.full((120, 160, 3), 255, np.uint8)
        image[20:31, 10:141] = 0
        encoded = base64.b64encode(cv2.imencode('.png', image)[1]).decode()
        manual = wall(40, 24, 100, 24, source='manual', height=2.4)
        measurements = {'status': 'ok', 'linear': [], 'areas': [], 'calibration': None,
                        'warnings': ['Reference endpoints need review.']}
        with patch.multiple(self.server, DB_AVAILABLE=False, EMB=None, CV_PILLAR_AUGMENT_ENABLED=False), \
             patch.object(self.server, 'extract_plan_measurements', return_value=measurements), \
             patch.object(self.server, 'detect_lines_yolo', return_value=[wall(10, 20, 140, 20)]), \
             patch.object(self.server, 'detect_lines', return_value=[wall(140, 30, 10, 30)]):
            status, payload = self.request({'imageBase64': encoded, 'manualWalls': [manual],
                'useDoorYolo': False, 'useRoomObject': False, 'useWindowGlass': False})
        self.assertEqual(status, 200)
        self.assertTrue(payload['walls_include_seeds'])
        self.assertEqual(len(payload['walls']), 3)  # Manual middle + two auto remainders.
        authored = next(w for w in payload['walls'] if w.get('source') == 'manual')
        self.assertEqual(authored['start'], manual['start'])
        self.assertEqual(authored['height'], 2.4)
        self.assertEqual(payload['detected_count'], len(payload['walls']))
        self.assertFalse(payload['ai_review']['enabled'])
        self.assertEqual(payload['measurements'], measurements)

    def test_health_distinguishes_scan_capability_from_missing_optional_ocr(self):
        handler = object.__new__(self.server.Handler)
        handler.path = '/api/health'
        handler._send = Mock()
        with patch.object(self.server.shutil, 'which', return_value=None):
            handler.do_GET()
        status, payload = handler._send.call_args.args
        self.assertEqual(status, 200)
        self.assertEqual(payload['scan_api_version'], 1)
        self.assertTrue(payload['capabilities']['printed_measurements'])
        self.assertTrue(payload['capabilities']['automatic_room_boundaries'])
        self.assertFalse(payload['ocr']['available'])

    def test_invalid_json_body_returns_400_without_detection(self):
        for body in (b'{bad', b'[]', b'null', b'\xff'):
            handler = object.__new__(self.server.Handler)
            handler.headers = {'Content-Length': str(len(body))}
            handler.rfile = io.BytesIO(body)
            handler.path = '/api/auto-detect'
            handler._send = Mock()
            handler.do_POST()
            self.assertEqual(handler._send.call_args.args[0], 400)

    def test_similar_images_do_not_supply_geometry_or_trigger_cloud_review(self):
        image = np.full((80, 140, 3), 255, np.uint8)
        image[20:31, 10:121] = 0
        encoded = base64.b64encode(cv2.imencode('.png', image)[1]).decode()
        db = Mock()
        db.get_floor_plan_by_hash.return_value = None
        db.save_floor_plan.return_value = 1
        cloud = Mock()
        trainer = Mock()
        trainer.save_uploaded_image_cv.return_value = '/unused/test.png'
        embeddings = Mock()
        embeddings.compute_embedding.return_value = [1, 0, 0]
        with patch.multiple(self.server, DB_AVAILABLE=True, EMB=embeddings, AI_AVAILABLE=True,
                            AI=cloud, CV_PILLAR_AUGMENT_ENABLED=False,
                            CLOUD_DETECTION_REVIEW_ENABLED=False, AUTO_TRAIN_ON_DETECT=False), \
             patch.object(self.server, 'DB', db, create=True), \
             patch.object(self.server, 'auto_trainer', trainer, create=True), \
             patch.object(self.server, 'detect_lines', return_value=[wall(10, 25, 120, 25)]):
            status, payload = self.request({'imageBase64': encoded, 'useYolo': False,
                'useDoorYolo': False, 'useRoomObject': False, 'useWindowGlass': False})
        self.assertEqual(status, 200)
        db.get_best_data_for_image.assert_not_called()
        trainer.trigger_auto_train.assert_not_called()
        self.assertEqual(cloud.mock_calls, [])
        self.assertFalse(payload['db_corrections_loaded'])

    def test_saving_partial_corrections_records_identity_without_retraining(self):
        image = np.full((80, 140, 3), 255, np.uint8)
        encoded = base64.b64encode(cv2.imencode('.png', image)[1]).decode()
        db, trainer = Mock(), Mock()
        db.save_floor_plan.return_value = 2
        trainer.save_uploaded_image_cv.return_value = '/unused/test.png'
        with patch.multiple(self.server, DB_AVAILABLE=True, EMB=None, AUTO_TRAIN_ON_CORRECTION=False), \
             patch.object(self.server, 'DB', db, create=True), \
             patch.object(self.server, 'auto_trainer', trainer, create=True):
            status, payload = self.request({'imageBase64': encoded, 'walls': [wall(10, 20, 100, 20)]},
                                           '/api/save-corrections')
        self.assertEqual(status, 200)
        self.assertTrue(payload['db_saved'])
        self.assertEqual(len(db.save_floor_plan.call_args.kwargs['image_hash']), 64)
        trainer.trigger_auto_train.assert_not_called()


if __name__ == '__main__':
    unittest.main()
