"""Capture real API results and labelled overlays; never estimates accuracy.

Run with the server on 5050: python .../validate_wall_examples.py --output PATH
Optional --inputs image1 image2; --sheet-only makes a contact sheet of originals.
"""
import argparse
import base64
import json
from pathlib import Path
import time
import urllib.request

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[3]


def overlay(image, data):
    result = image.copy()
    size = max(image.shape[:2])
    for index, wall in enumerate(data.get('walls', []) + data.get('wall_review', [])):
        a, b = [np.array([wall[k]['x'], wall[k]['y']], float) for k in ('start', 'end')]
        u = b - a
        n = np.array([-u[1], u[0]]) / max(np.linalg.norm(u), 1e-6)
        half = float(wall.get('thickness_px') or 1) / 2
        color = (0, 150, 0) if wall.get('review_status') != 'uncertain' else (0, 150, 255)
        for sign in (-1, 1):
            cv2.line(result, tuple(np.rint(a + sign*n*half).astype(int)),
                     tuple(np.rint(b + sign*n*half).astype(int)), color, max(1, round(size/1600)))
        cv2.line(result, tuple(np.rint(a).astype(int)), tuple(np.rint(b).astype(int)), (220, 80, 0), 1)
        p = tuple(np.rint((a+b)/2).astype(int))
        cv2.putText(result, str(wall.get('id', f'W{index+1}')), p, cv2.FONT_HERSHEY_SIMPLEX,
                    max(.28, size/3500), (0, 0, 150), max(1, round(size/1800)), cv2.LINE_AA)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--inputs', nargs='*', type=Path)
    parser.add_argument('--sheet-only', action='store_true')
    parser.add_argument('--refresh', action='store_true', help='Overwrite captured results by rescanning')
    args = parser.parse_args()
    paths = args.inputs or sorted(p for p in ROOT.iterdir() if p.suffix.lower() in {'.jpg', '.jpeg', '.webp', '.png', '.avif'})
    paths = list(dict.fromkeys(paths))
    args.output.mkdir(parents=True, exist_ok=True)
    tiles, summary = [], []
    for path in paths:
        image = cv2.imread(str(path))
        if image is None:
            from PIL import Image
            try:
                image = cv2.cvtColor(np.asarray(Image.open(path).convert('RGB')), cv2.COLOR_RGB2BGR)
            except Exception as error:
                print('UNREADABLE', path, str(error), flush=True)
                continue
        if not args.sheet_only:
            dest = args.output / (path.stem + '.json')
            if dest.exists() and not args.refresh:
                data = json.loads(dest.read_text())
            else:
                # Match browser upload decoding (including AVIF), losslessly.
                encoded = cv2.imencode('.png', image)[1].tobytes()
                body = json.dumps({'imageBase64': base64.b64encode(encoded).decode()}).encode()
                request = urllib.request.Request('http://127.0.0.1:5050/api/auto-detect', body,
                                                 {'Content-Type': 'application/json'})
                start = time.monotonic()
                with urllib.request.urlopen(request, timeout=300) as response:
                    data = json.load(response)
                dest.write_text(json.dumps(data, indent=2))
                print(path.name, len(data.get('walls', [])), 'walls', round(time.monotonic()-start, 1), 's', flush=True)
            summary.append({'image': path.name, 'walls': len(data.get('walls', [])),
                            'review': len(data.get('wall_review', [])), 'rejected': len(data.get('wall_rejected', []))})
            original = image.copy()
            image = overlay(image, data)
            cv2.imwrite(str(args.output / (path.stem + '.png')), image)
            cv2.imwrite(str(args.output / (path.stem + '-accepted.png')),
                        overlay(original, {**data, 'wall_review': []}))
        h, w = image.shape[:2]
        scale = min(300/w, 360/h)
        small = cv2.resize(image, (round(w*scale), round(h*scale)))
        tile = np.full((390, 320, 3), 255, np.uint8)
        tile[25:25+small.shape[0], :small.shape[1]] = small
        cv2.putText(tile, path.name, (5, 18), cv2.FONT_HERSHEY_SIMPLEX, .5, (0, 0, 0), 1)
        tiles.append(tile)
    while len(tiles) % 4:
        tiles.append(np.full_like(tiles[0], 255))
    cv2.imwrite(str(args.output / 'contact-sheet.jpg'), np.vstack([np.hstack(tiles[i:i+4]) for i in range(0, len(tiles), 4)]))
    (args.output / 'summary.json').write_text(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
