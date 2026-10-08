"""Overlay the frontend's actual ceiling polygons on their source scan.

python render_ceiling_validation.py original.jpg ceiling.json output.png
This is a diagnostic drawing, not an AI-generated image or accuracy metric.
"""
import json
import sys
import cv2
import numpy as np

source, geometry, output = sys.argv[1:]
image = cv2.imread(source)
if image is None:
    raise SystemExit(f'Cannot read {source}')
data = json.load(open(geometry))
mask = np.zeros(image.shape[:2], np.uint8)
points = lambda ring: np.rint([[p['x'], p['y']] for p in ring]).astype(np.int32)
for region in data['coverage']:
    cv2.fillPoly(mask, [points(region['points'])], 255)
    for hole in region.get('holes', []):
        cv2.fillPoly(mask, [points(hole)], 0)
image[mask > 0] = (image[mask > 0] * .72 + np.array([210, 175, 60]) * .28).astype(np.uint8)
for region in data['coverage']:
    for ring in [region['points'], *region.get('holes', [])]:
        cv2.polylines(image, [points(ring)], True, (190, 95, 15), 2)
cv2.putText(image, 'BLUE: ceiling footprint (3D geometry replay)', (15, 22),
            cv2.FONT_HERSHEY_SIMPLEX, .55, (170, 65, 0), 1, cv2.LINE_AA)
if not cv2.imwrite(output, image):
    raise SystemExit(f'Cannot write {output}')
