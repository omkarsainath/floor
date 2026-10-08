"""Local image -> real OCR/CV -> API response -> exact frontend geometry.

No model download, database, cloud client, paid service or listening socket.
Skipped on machines without the optional Tesseract executable or Node runtime.
"""
import base64
import json
from pathlib import Path
import shutil
import subprocess
import sys
import unittest
from unittest.mock import Mock, patch
import io

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
ROOT = Path(__file__).resolve().parents[3]


@unittest.skipUnless(shutil.which('tesseract') and shutil.which('node'), 'Local Tesseract and Node required')
class AutomaticScanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Import once: patch.dict restores sys.modules, and reimporting native
        # Torch extensions in the same process can crash on macOS.
        with patch.dict(sys.modules, {'db': None, 'ai_assistant': None, 'adk_pipeline': None}):
            import train_server
        cls.server = train_server

    def test_uploaded_pixels_control_actual_3d_span_and_room_area(self):
        self.check_pixels_to_geometry(outlined=False)

    def test_outlined_walls_control_actual_3d_span_and_room_area(self):
        self.check_pixels_to_geometry(outlined=True)

    def check_pixels_to_geometry(self, outlined):
        image = np.full((520, 1100, 3), 255, np.uint8)
        corners = [(150, 180), (950, 180), (950, 390), (150, 390)]
        if outlined:
            cv2.rectangle(image, (142, 172), (958, 398), (0, 0, 0), 2)
            cv2.rectangle(image, (158, 188), (942, 382), (0, 0, 0), 2)
        else:
            for start, end in zip(corners, corners[1:] + corners[:1]):
                cv2.line(image, start, end, (0, 0, 0), 15)
        cv2.line(image, (158, 110), (942, 110), (0, 0, 0), 1)
        for x, sign in ((158, 1), (942, -1)):
            for dy in (-5, 5):
                cv2.line(image, (x, 110), (x + sign * 8, 110 + dy), (0, 0, 0), 1)
        cv2.putText(image, '4.50 m', (460, 90), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 2)
        cv2.putText(image, 'Kitchen Verandah', (355, 245), cv2.FONT_HERSHEY_SIMPLEX, .8, (0, 0, 0), 2)
        cv2.putText(image, 'A: 4.4 m2', (437, 312), cv2.FONT_HERSHEY_SIMPLEX, .9, (0, 0, 0), 2)
        train_server = self.server
        handler = object.__new__(train_server.Handler)
        body = json.dumps({'imageBase64': base64.b64encode(cv2.imencode('.png', image)[1]).decode(),
                           'useYolo': False, 'useDoorYolo': False, 'useRoomObject': False, 'useWindowGlass': False}).encode()
        handler.headers = {'Content-Length': str(len(body))}
        handler.rfile = io.BytesIO(body)
        handler.path = '/api/auto-detect'
        handler._send = Mock()
        with patch.multiple(train_server, DB_AVAILABLE=False, EMB=None, CV_PILLAR_AUGMENT_ENABLED=False,
                            CLOUD_DETECTION_REVIEW_ENABLED=False):
            handler.do_POST()
        status, payload = handler._send.call_args.args
        self.assertEqual(status, 200)
        self.assertEqual(len(payload['walls']), 4)
        self.assertEqual(len(payload['room_boundaries']), 1)
        self.assertEqual(payload['room_boundaries'][0]['declared_area_m2'], 4.4)
        self.assertEqual(payload['measurements']['linear'][0]['value_m'], 4.5)
        script = '''
import { readFileSync } from 'node:fs';
import { prepareAutomaticMeasurements } from './apps/frontend/src/tracer/autoMeasurements.js';
import { summarizeMeasurements } from './apps/frontend/src/measurements/modelMeasurements.js';
const payload = JSON.parse(readFileSync(0, 'utf8'));
const result = prepareAutomaticMeasurements({...payload, rooms: payload.room_boundaries});
console.log(JSON.stringify({status: result.status, applied: result.applied,
  summary: result.layout ? summarizeMeasurements(result.layout) : null, unresolved: result.unresolved}));
'''
        run = subprocess.run([shutil.which('node'), '--input-type=module', '-e', script], cwd=ROOT,
                             input=json.dumps(payload), text=True, capture_output=True, timeout=20, check=True)
        result = json.loads(run.stdout)
        self.assertEqual(result['status'], 'applied', result['unresolved'])
        self.assertEqual(result['applied'], {'lengths': 1, 'areas': 1})
        self.assertEqual(result['summary']['constraint_status'], 'satisfied')
        self.assertAlmostEqual(result['summary']['rooms'][0]['area_m2'], 4.4, places=6)
        length = next(item for item in result['summary']['constraints'] if item['type'] == 'length')
        self.assertAlmostEqual(length['actual'], 4.5, places=6)


if __name__ == '__main__':
    unittest.main()
