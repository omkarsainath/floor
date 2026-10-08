"""Measurement extraction tests independent of model weights and database state."""
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
import plan_measurements as measurements


def rule(image, start, end):
    cv2.line(image, start, end, (0, 0, 0), 1)
    if start[1] == end[1]:
        for x, sign in ((start[0], 1), (end[0], -1)):
            cv2.line(image, (x, start[1]), (x + sign * 7, start[1] - 4), (0, 0, 0), 1)
            cv2.line(image, (x, start[1]), (x + sign * 7, start[1] + 4), (0, 0, 0), 1)
    else:
        for y, sign in ((start[1], 1), (end[1], -1)):
            cv2.line(image, (start[0], y), (start[0] - 4, y + sign * 7), (0, 0, 0), 1)
            cv2.line(image, (start[0], y), (start[0] + 4, y + sign * 7), (0, 0, 0), 1)


def line(text, box, axis='x', confidence=0.95):
    return {'text': text, 'bbox': box, 'axis': axis, 'confidence': confidence}


class PrintedUnitTests(unittest.TestCase):
    def test_user_example_imperial_lengths(self):
        result = measurements.parse_measurements('41′0″ × 30′10″')
        self.assertAlmostEqual(result[0]['value_m'], 12.4968)
        self.assertAlmostEqual(result[1]['value_m'], 9.398)

    def test_feet_inches_variants(self):
        for text in ('12\' 6"', '12\'-6"', '12 ft 6 in', '12 feet 6 inches'):
            with self.subTest(text=text):
                self.assertAlmostEqual(measurements.parse_measurements(text)[0]['value_m'], 3.81)

    def test_metric_units_and_standalone_inches(self):
        for text, expected in [('125 cm', 1.25), ('230 millimetres', 0.23), ('2.75 m', 2.75), ('36 inches', 0.9144)]:
            with self.subTest(text=text):
                self.assertAlmostEqual(measurements.parse_measurements(text)[0]['value_m'], expected)

    def test_area_is_not_also_a_linear_measurement(self):
        result = measurements.parse_measurements('Bedroom 120 sq ft; Kitchen 12.5 m²; Living 180 sqft; Bath 6 m2')
        self.assertEqual([item['kind'] for item in result], ['area'] * 4)
        self.assertAlmostEqual(result[0]['value_m2'], 11.1483648)
        self.assertEqual(result[1]['value_m2'], 12.5)
        self.assertEqual(result[3]['value_m2'], 6)

    def test_prefixed_user_area_and_compact_metric_dimension(self):
        for text in ('A: 4.4 m²', 'A:4.4m^2', 'Area: 4.4 m ^ 2', 'A: 4.4 m2'):
            with self.subTest(text=text):
                result = measurements.parse_measurements(text)
                self.assertEqual(len(result), 1)
                self.assertEqual(result[0]['kind'], 'area')
                self.assertEqual(result[0]['value_m2'], 4.4)
        self.assertEqual(measurements.parse_measurements('4.50m')[0]['value_m'], 4.5)

    def test_unlabelled_or_invalid_numbers_do_not_calibrate(self):
        for text in ('120', 'scale 1:100', '0 m', '30\'15"', '-2 m', "12' 6"):
            with self.subTest(text=text):
                self.assertEqual(measurements.parse_measurements(text), [])


class DimensionAssociationTests(unittest.TestCase):
    def setUp(self):
        self.image = np.full((560, 800, 3), 255, np.uint8)

    def test_external_rules_supply_span_not_image_width(self):
        rule(self.image, (100, 50), (700, 50))
        rule(self.image, (100, 510), (700, 510))
        result = measurements.measurements_from_ocr(self.image, [
            line('41\'0"', [370, 15, 430, 36]), line('41\'0"', [370, 525, 430, 548]),
        ])
        self.assertAlmostEqual(result['calibration']['scale_m_per_px'], 12.4968 / 600)
        self.assertEqual(result['linear'][0]['reference']['span_px'], 600)
        json.dumps(result, allow_nan=False)

    def test_vertical_dimension_reference(self):
        rule(self.image, (50, 100), (50, 500))
        result = measurements.measurements_from_ocr(self.image, [line('30\'10"', [15, 260, 36, 340], axis='y')])
        self.assertEqual(result['linear'][0]['reference']['span_px'], 400)
        self.assertAlmostEqual(result['linear'][0]['scale_m_per_px'], 9.398 / 400)
        self.assertIsNone(result['calibration'])  # A single reading needs review.

    def test_wall_near_label_does_not_prove_reference(self):
        cv2.rectangle(self.image, (100, 48), (700, 62), (0, 0, 0), -1)
        result = measurements.measurements_from_ocr(self.image, [line('41\'0"', [370, 15, 430, 36])])
        self.assertIsNone(result['linear'][0]['reference'])
        self.assertIsNone(result['calibration'])

    def test_plain_unmarked_rule_is_not_dimension_reference(self):
        cv2.line(self.image, (100, 50), (700, 50), (0, 0, 0), 1)
        result = measurements.measurements_from_ocr(self.image, [line('41\'0"', [370, 15, 430, 36])])
        self.assertIsNone(result['linear'][0]['reference'])

    def test_thin_rectangle_corners_do_not_count_as_arrowheads(self):
        cv2.rectangle(self.image, (100, 50), (700, 400), (0, 0, 0), 1)
        result = measurements.measurements_from_ocr(self.image, [line('41\'0"', [370, 15, 430, 36])])
        self.assertIsNone(result['linear'][0]['reference'])

    def test_area_only_never_scales_building(self):
        result = measurements.measurements_from_ocr(self.image, [line('Bedroom 120 sq ft', [100, 100, 240, 122])])
        self.assertEqual(len(result['areas']), 1)
        self.assertEqual(result['linear'], [])
        self.assertIsNone(result['calibration'])

    def test_ocr_regions_preserve_names_for_text_masking(self):
        row = line('MASTER BED ROOM', [100, 100, 300, 125], confidence=.91)
        result = measurements.measurements_from_ocr(self.image, [row])
        self.assertEqual(result['linear'], [])
        self.assertEqual(result['areas'], [])
        self.assertEqual(result['ocr_text_regions'], [[100.0, 100.0, 300.0, 125.0]])

    def test_disagreement_blocks_calibration(self):
        rule(self.image, (100, 50), (700, 50))
        rule(self.image, (50, 100), (50, 500))
        result = measurements.measurements_from_ocr(self.image, [
            line('41\'0"', [370, 15, 430, 36]), line('30\'10"', [15, 260, 36, 340], axis='y'),
        ])
        self.assertIsNone(result['calibration'])
        self.assertTrue(any('disagree' in warning for warning in result['warnings']))

    def test_multiple_values_in_one_text_line_do_not_share_reference(self):
        rule(self.image, (100, 50), (700, 50))
        result = measurements.measurements_from_ocr(self.image, [line('12\' x 10\'', [340, 15, 460, 36])])
        self.assertEqual(len(result['linear']), 2)
        self.assertTrue(all(item['reference'] is None for item in result['linear']))

    def test_adjacent_dimension_rules_split_at_extension_tick_centres(self):
        cv2.line(self.image, (100, 60), (700, 60), (0, 0, 0), 3)
        for x in (100, 400, 700):
            cv2.line(self.image, (x, 40), (x, 80), (0, 0, 0), 3)
        result = measurements.measurements_from_ocr(self.image, [
            line('4.50m', [220, 20, 280, 40]), line('3.00m', [520, 20, 580, 40]),
        ])
        first, second = result['linear']
        self.assertEqual(first['reference']['start']['x'], 100)
        self.assertEqual(first['reference']['end']['x'], 400)
        self.assertEqual(first['reference']['span_px'], 300)
        self.assertEqual(first['scale_m_per_px'], 4.5 / 300)
        self.assertEqual(second['reference']['start']['x'], 400)
        self.assertEqual(second['reference']['end']['x'], 700)
        self.assertIsNone(result['calibration'])  # Different printed scales need review.

    def test_individual_ocr_word_boxes_locate_two_dimensions_on_one_row(self):
        rule(self.image, (100, 60), (400, 60))
        rule(self.image, (420, 60), (700, 60))
        row = line('4.50m 4.20m', [220, 20, 580, 40])
        row['words'] = [
            {'start': 0, 'end': 5, 'bbox': [220, 20, 280, 40], 'confidence': 0.94},
            {'start': 6, 'end': 11, 'bbox': [530, 20, 590, 40], 'confidence': 0.96},
        ]
        result = measurements.measurements_from_ocr(self.image, [row])
        self.assertEqual(result['linear'][0]['reference']['span_px'], 300)
        self.assertEqual(result['linear'][1]['reference']['span_px'], 280)
        self.assertAlmostEqual(result['calibration']['scale_m_per_px'], 0.015)

    def test_two_values_in_same_ocr_word_cannot_locate_two_references(self):
        rule(self.image, (100, 60), (700, 60))
        row = line("12'x10'", [370, 20, 430, 40])
        row['words'] = [{'start': 0, 'end': 7, 'bbox': row['bbox'], 'confidence': 0.95}]
        result = measurements.measurements_from_ocr(self.image, [row])
        self.assertEqual(len(result['linear']), 2)
        self.assertTrue(all(item['reference'] is None for item in result['linear']))

    def test_area_anchor_uses_value_words_not_neighbouring_room_name(self):
        row = line('Kitchen Verandah A: 4.4 m²', [100, 100, 660, 120], confidence=0.1)
        row['words'] = [
            {'start': 0, 'end': 7, 'bbox': [100, 100, 180, 120], 'confidence': 0.1},
            {'start': 8, 'end': 16, 'bbox': [185, 100, 280, 120], 'confidence': 0.7},
            {'start': 17, 'end': 19, 'bbox': [560, 100, 580, 120], 'confidence': 0.9},
            {'start': 20, 'end': 23, 'bbox': [585, 100, 625, 120], 'confidence': 0.97},
            {'start': 24, 'end': 26, 'bbox': [630, 100, 660, 120], 'confidence': 0.94},
        ]
        result = measurements.measurements_from_ocr(self.image, [row])
        area = result['areas'][0]
        self.assertEqual(area['value_m2'], 4.4)
        self.assertEqual(area['bbox'], [585, 100, 660, 120])
        self.assertEqual(area['ocr_line_bbox'], row['bbox'])
        self.assertEqual(area['confidence'], 0.94)

    def test_rotation_mapping(self):
        self.assertEqual(measurements._original_bbox(10, 20, 30, 40, 90, 800, 600, 1), [20, 560, 60, 590])
        self.assertEqual(measurements._original_bbox(10, 20, 30, 40, 270, 800, 600, 1), [740, 10, 780, 40])

    def test_missing_local_ocr_is_graceful(self):
        with patch.object(measurements.shutil, 'which', return_value=None):
            result = measurements.extract_plan_measurements(self.image)
        self.assertEqual(result['status'], 'unavailable')
        self.assertIsNone(result['calibration'])

    def test_timeout_is_graceful(self):
        with patch.object(measurements.shutil, 'which', return_value='/tmp/tesseract'), patch.object(
                measurements, '_read_ocr', side_effect=measurements.subprocess.TimeoutExpired('tesseract', 12)):
            self.assertEqual(measurements.extract_plan_measurements(self.image)['status'], 'error')

    def test_dimension_rules_are_removed_only_from_matching_auto_walls(self):
        rule(self.image, (100, 50), (700, 50))
        evidence = measurements.measurements_from_ocr(self.image, [line('41\'0"', [370, 15, 430, 36])])
        def wall(x1, y1, x2, y2, **metadata):
            return {'start': {'x': x1, 'y': y1}, 'end': {'x': x2, 'y': y2}, **metadata}
        false_rules = [wall(100, 50, 700, 50, source='auto'), wall(500, 51, 200, 51)]
        real_walls = [wall(100, 55, 700, 55), wall(200, 50, 200, 400),
                      wall(100, 50, 700, 50, thickness_px=12), wall(50, 50, 740, 50)]
        authored = [wall(100, 50, 700, 50, source=source) for source in ('manual', 'corrected', 'seed')]
        self.assertEqual(measurements.exclude_dimension_walls(false_rules + real_walls + authored, evidence), real_walls + authored)

    def test_unmatched_text_does_not_remove_walls(self):
        walls = [{'start': {'x': 100, 'y': 50}, 'end': {'x': 700, 'y': 50}}]
        evidence = measurements.measurements_from_ocr(self.image, [line('41\'0"', [370, 15, 430, 36])])
        self.assertEqual(measurements.exclude_dimension_walls(walls, evidence), walls)
        self.assertEqual(measurements.exclude_dimension_walls(walls, None), walls)


if __name__ == '__main__':
    unittest.main()
