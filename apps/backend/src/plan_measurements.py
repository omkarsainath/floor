"""Local, conservative reading of printed plan dimensions.

Coordinates are in the uploaded image's pixels. Text alone never determines a
scale: a length must be associated with a nearby thin dimension line with marks
at both ends. The result is a reviewable suggestion, not a surveying guarantee.
Tesseract is optional; the installed command is used directly so no cloud API or
Python OCR wrapper is required. Room-area labels remain annotations until a user
identifies the room boundary.
"""
import csv
import io
import math
import re
import shutil
import subprocess

import cv2
import numpy as np


FEET_TO_METERS = 0.3048
SQFT_TO_M2 = FEET_TO_METERS ** 2
_NUMBER = r"(?:\d+(?:\.\d+)?)"
_AREA = re.compile(
    rf"(?<![\d.\-])(?P<value>{_NUMBER})\s*(?P<unit>"
    r"sq\.?\s*ft\.?|sq\.?\s*feet|square\s+feet|ft\s*(?:²|\^\s*2|2)|"
    r"sq\.?\s*m\.?|square\s+met(?:er|re)s?|m\s*(?:²|\^\s*2|2))(?![A-Za-z0-9])",
    re.IGNORECASE,
)
_LENGTH = re.compile(
    rf"(?<![\d.\-])(?P<value>{_NUMBER})\s*(?:"
    rf"(?P<feet>ft\b|feet\b|foot\b|')\s*(?:[-–]?\s*(?P<inches>{_NUMBER})\s*(?:in\b|inch(?:es)?\b|\"))?"
    r"|(?P<metric>millimet(?:er|re)s?\b|centimet(?:er|re)s?\b|met(?:er|re)s?\b|mm\b|cm\b|m\b)"
    r"|(?P<inch>in\b|inch(?:es)?\b|\"))",
    re.IGNORECASE,
)


def parse_measurements(text):
    """Extract explicit-unit lengths and areas without guessing missing units."""
    normalized = str(text).translate(str.maketrans({
        '′': "'", '’': "'", '‘': "'", '″': '"', '“': '"', '”': '"',
    }))
    results, area_spans = [], []
    for match in _AREA.finditer(normalized):
        value = float(match['value'])
        if not math.isfinite(value) or value <= 0:
            continue
        unit = match['unit'].lower()
        results.append({'kind': 'area', 'value_m2': value * (SQFT_TO_M2 if ('ft' in unit or 'feet' in unit) else 1),
                        'text': match.group(), 'start': match.start(), 'end': match.end()})
        area_spans.append(match.span())
    for match in _LENGTH.finditer(normalized):
        if any(match.start() < end and match.end() > start for start, end in area_spans):
            continue
        value = float(match['value'])
        if match['feet']:
            if not match['inches'] and re.match(r'\s*[-–]?\s*\d', normalized[match.end():]):
                continue  # Missing inch mark: do not quietly truncate 12' 6 to 12'.
            inches = float(match['inches'] or 0)
            if inches >= 12:  # Usually a recognition error; do not silently carry.
                continue
            value = (value + inches / 12) * FEET_TO_METERS
        elif match['inch']:
            value *= FEET_TO_METERS / 12
        else:
            unit = match['metric'].lower()
            value *= 0.001 if unit.startswith(('mm', 'milli')) else 0.01 if unit.startswith(('cm', 'centi')) else 1
        if value > 0 and math.isfinite(value):
            results.append({'kind': 'length', 'value_m': value, 'text': match.group(),
                            'start': match.start(), 'end': match.end()})
    return sorted(results, key=lambda item: item['start'])


def _original_bbox(x, y, width, height, rotation, image_width, image_height, scale):
    """Map a Tesseract box back from a resized, quarter-turned image."""
    points = [(x, y), (x + width, y + height)]
    if rotation == 90:  # cv2 ROTATE_90_CLOCKWISE: (x,y) -> (H-y,x)
        points = [(py, image_height - px) for px, py in points]
    elif rotation == 270:
        points = [(image_width - py, px) for px, py in points]
    xs, ys = zip(*points)
    scale_x, scale_y = scale if isinstance(scale, tuple) else (scale, scale)
    return [round(min(xs) / scale_x, 2), round(min(ys) / scale_y, 2),
            round(max(xs) / scale_x, 2), round(max(ys) / scale_y, 2)]


def _read_ocr(image, executable):
    height, width = image.shape[:2]
    scale = min(1.0, 2200 / max(height, width))
    small = cv2.resize(image, (round(width * scale), round(height * scale))) if scale < 1 else image
    h, w = small.shape[:2]
    scale = (w / width, h / height)  # actual rounded resize, not nominal scale
    lines = []
    for rotation in (0, 90, 270):
        rotated = (small if rotation == 0 else cv2.rotate(small, cv2.ROTATE_90_CLOCKWISE if rotation == 90 else cv2.ROTATE_90_COUNTERCLOCKWISE))
        ok, encoded = cv2.imencode('.png', rotated)
        if not ok:
            raise ValueError('Cannot encode image for local OCR')
        run = subprocess.run([executable, 'stdin', 'stdout', '--psm', '11', 'tsv'],
                             input=encoded.tobytes(), capture_output=True, timeout=12, check=True)
        grouped = {}
        for row in csv.DictReader(io.StringIO(run.stdout.decode('utf-8', errors='replace')), delimiter='\t', quoting=csv.QUOTE_NONE):
            if row.get('level') != '5' or not row.get('text', '').strip():
                continue
            key = tuple(row.get(k) for k in ('page_num', 'block_num', 'par_num', 'line_num'))
            grouped.setdefault(key, []).append(row)
        for words in grouped.values():
            text = ' '.join(word['text'].strip() for word in words)
            x = min(int(word['left']) for word in words)
            y = min(int(word['top']) for word in words)
            right = max(int(word['left']) + int(word['width']) for word in words)
            bottom = max(int(word['top']) + int(word['height']) for word in words)
            # A bad unit/quote makes a dimension unsafe even if its digits scored well.
            confidence = min(max(0, float(word['conf'])) for word in words)
            # Preserve individual word locations. Two measurements or a room
            # name may share an OCR line, but must not share its entire box.
            tokens, offset = [], 0
            for word in words:
                token = word['text'].strip()
                tokens.append({'start': offset, 'end': offset + len(token),
                               'confidence': round(max(0, float(word['conf'])) / 100, 3),
                               'bbox': _original_bbox(int(word['left']), int(word['top']),
                                                      int(word['width']), int(word['height']),
                                                      rotation, w, h, scale)})
                offset += len(token) + 1
            lines.append({'text': text, 'confidence': round(confidence / 100, 3), 'words': tokens,
                          'bbox': _original_bbox(x, y, right - x, bottom - y, rotation, w, h, scale),
                          'axis': 'x' if rotation == 0 else 'y'})
    return lines


def _dimension_lines(image):
    """Find thin, long rules with arrowheads/ticks, distinct from thick walls."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    results = []
    for axis in ('x', 'y'):
        oriented = mask if axis == 'x' else mask.T.copy()
        length = max(45, round(oriented.shape[1] * 0.08)) | 1
        opened = cv2.morphologyEx(oriented, cv2.MORPH_OPEN, np.ones((1, length), np.uint8))
        count, _, stats, centroids = cv2.connectedComponentsWithStats(opened)
        for i in range(1, count):
            start, top, width, thickness, _ = (int(v) for v in stats[i])
            if width < length or thickness > max(5, min(8, min(image.shape[:2]) * 0.005)):
                continue
            end, center = start + width - 1, int(round(centroids[i][1]))
            if center < 4 or center >= oriented.shape[0] - 4:
                continue
            # Require a terminal mark on each end. At least two pixels beyond
            # the rule's thickness must be ink in both endpoint neighbourhoods.
            radius = max(5, min(14, round(min(image.shape[:2]) * 0.009)))
            y0, y1 = max(0, center - radius), min(oriented.shape[0], center + radius + 1)
            def marked(endpoint):
                endpoint = int(round(endpoint))
                x0, x1 = max(0, endpoint - radius), min(oriented.shape[1], endpoint + radius + 1)
                patch = oriented[y0:y1, x0:x1] > 0
                rows = np.flatnonzero(patch.any(axis=1))
                center_in_patch = center - y0
                return bool(len(rows) and rows[0] <= center_in_patch - thickness / 2 - 1
                            and rows[-1] >= center_in_patch + thickness / 2 + 1)
            if not marked(start) or not marked(end):
                continue
            # A connected rule can contain several adjacent dimensions. Split
            # at extension ticks crossing the rule, using tick centres instead
            # of outer stroke edges (which overstate short spans).
            tall = np.flatnonzero(np.all(oriented[y0:y1, start:end + 1] > 0, axis=0)) + start
            groups = np.split(tall, np.flatnonzero(np.diff(tall) > 1) + 1) if len(tall) else []
            ticks = [float((group[0] + group[-1]) / 2) for group in groups if len(group) <= max(7, thickness * 2)]
            left = next((tick for tick in ticks if abs(tick - start) <= radius), float(start))
            right = next((tick for tick in reversed(ticks) if abs(tick - end) <= radius), float(end))
            terminals = [left, *(tick for tick in ticks if left + radius < tick < right - radius), right]
            for lo, hi in zip(terminals, terminals[1:]):
                if hi - lo < length:
                    continue
                a, b = ((lo, center), (hi, center)) if axis == 'x' else ((center, lo), (center, hi))
                results.append({'axis': axis, 'start': {'x': float(a[0]), 'y': float(a[1])},
                                'end': {'x': float(b[0]), 'y': float(b[1])}, 'span_px': float(hi - lo),
                                'stroke_width_px': thickness, 'source': 'dimension-line'})
    return results


def _measurement_box(line, item):
    """Use only OCR words overlapping this value/unit, never interpolate text width."""
    words = [word for word in line.get('words', [])
             if word['start'] < item['end'] and word['end'] > item['start']]
    if not words:
        return list(line['bbox']), float(line['confidence']), False
    boxes = np.array([word['bbox'] for word in words], dtype=float)
    precise = words[0]['start'] == item['start'] and words[-1]['end'] == item['end']
    return [float(boxes[:, 0].min()), float(boxes[:, 1].min()),
            float(boxes[:, 2].max()), float(boxes[:, 3].max())], min(float(word['confidence']) for word in words), precise


def _associate_reference(candidate, lines):
    x1, y1, x2, y2 = candidate['bbox']
    axis = candidate['axis']
    center_along, center_normal = ((x1 + x2) / 2, (y1 + y2) / 2) if axis == 'x' else ((y1 + y2) / 2, (x1 + x2) / 2)
    text_height = (y2 - y1) if axis == 'x' else (x2 - x1)
    other = 'y' if axis == 'x' else 'x'
    possible = []
    for line in lines:
        if line['axis'] != axis:
            continue
        lo, hi = line['start'][axis], line['end'][axis]
        gap = abs(line['start'][other] - center_normal)
        middle_error = abs(center_along - (lo + hi) / 2) / max(1, hi - lo)
        if gap <= max(16, text_height * 3) and middle_error <= 0.22 and lo <= center_along <= hi:
            possible.append((gap + middle_error * 30, line))
    possible.sort(key=lambda item: item[0])
    if not possible or (len(possible) > 1 and possible[1][0] - possible[0][0] < 3):
        return None  # Ambiguous stacked dimension lines require manual reference.
    return possible[0][1]


def measurements_from_ocr(image, ocr_lines):
    """Deterministic association stage; also useful for testing OCR-independent geometry."""
    references = _dimension_lines(image)
    linear, areas, warnings = [], [], []
    for line in ocr_lines:
        parsed = parse_measurements(line['text'])
        lengths_in_line = sum(item['kind'] == 'length' for item in parsed)
        for item in parsed:
            target = areas if item['kind'] == 'area' else linear
            candidate = {k: v for k, v in item.items() if k not in ('start', 'end', 'kind')}
            bbox, confidence, located_words = _measurement_box(line, item)
            candidate.update({'bbox': bbox, 'confidence': confidence, 'axis': line.get('axis', 'x'),
                              'ocr_line_bbox': list(line['bbox']),
                              'ocr_text': line['text'], 'source': 'printed-text'})
            value_key = 'value_m2' if item['kind'] == 'area' else 'value_m'
            duplicate = next((previous for previous in target if abs(previous[value_key] - candidate[value_key]) < 1e-6
                              and np.linalg.norm(np.array(previous['bbox']) - np.array(candidate['bbox'])) < 20), None)
            if duplicate:
                if candidate['confidence'] > duplicate['confidence']:
                    duplicate['confidence'] = candidate['confidence']
                continue
            candidate['id'] = ('area-' if item['kind'] == 'area' else 'dimension-') + str(len(target) + 1)
            if item['kind'] == 'length':
                candidate['reference'] = _associate_reference(candidate, references) if lengths_in_line == 1 or located_words else None
                candidate['scale_m_per_px'] = candidate['value_m'] / candidate['reference']['span_px'] if candidate['reference'] else None
            target.append(candidate)
    reliable = [item for item in linear if item['reference'] and item['confidence'] >= 0.7]
    calibration = None
    if len(reliable) >= 2:
        scales = np.array([item['scale_m_per_px'] for item in reliable])
        median = float(np.median(scales))
        if np.max(np.abs(scales - median) / median) <= 0.03:
            calibration = {'scale_m_per_px': median, 'source': 'printed-dimensions', 'status': 'suggested',
                           'dimension_ids': [item['id'] for item in reliable]}
        else:
            warnings.append('Printed dimensions disagree by more than 3%. Check OCR values and reference endpoints; the image may be stretched.')
    if linear and not calibration:
        warnings.append('Only readable lengths with dimension-line endpoints bound to walls can be applied automatically. Unmatched readings remain for review.')
    if areas:
        warnings.append('Printed areas need one enclosed inside-wall boundary. Ambiguous labels or open room boundaries remain for review.')
    if not linear and not areas:
        warnings.append('No readable explicit-unit dimensions found. Calibrate using a known distance in the drawing.')
    # Axis-x words come from the plan's normal orientation. Expose their boxes
    # so wall extraction can remove printed names/logos from its private mask;
    # rotated OCR passes are only for vertical dimensions and would over-mask.
    text_regions = []
    furniture_labels = []
    for line in ocr_lines:
        if line.get('axis', 'x') != 'x':
            continue
        # A furniture caption is evidence, not a room-sized exclusion mask.
        # In particular BED ROOM / BEDROOM must never stand in for a bed.
        label = str(line.get('text', '')).lower()
        if (re.fullmatch(r'(?:(?:king|queen|single|double|twin|bunk)(?:[ -]+size)?[ -]+)?bed', label.strip())
                and float(line.get('confidence', 0)) >= .35 and line.get('bbox')):
            furniture_labels.append({'class': 'bed', 'bbox': line['bbox'], 'text': line['text']})
        elif (re.fullmatch(r'loft|overhead storage|rolling shutter|dishwasher|refrigerator', label.strip())
              and float(line.get('confidence',0))>=.5 and line.get('bbox')):
            furniture_labels.append({'class':'storage','bbox':line['bbox'],'text':line['text']})
        words = line.get('words') or []
        boxes = [word.get('bbox') for word in words if float(word.get('confidence', 0)) >= .2]
        if not words and float(line.get('confidence', 0)) >= .2 and line.get('bbox'):
            boxes = [line['bbox']]
        for box in boxes:
            if isinstance(box, (list, tuple)) and len(box) == 4:
                text_regions.append([float(value) for value in box])
    # OCR occasionally labels a whole bathroom/door drawing as one word. Such
    # boxes must never erase the structural network in the wall detector.
    text_regions = plausible_text_regions(text_regions, image.shape)
    return {'status': 'ok', 'engine': 'tesseract-local', 'linear': linear, 'areas': areas,
            'calibration': calibration, 'warnings': warnings, 'ocr_text_regions': text_regions,
            'furniture_labels': furniture_labels}


def plausible_text_regions(boxes, image_shape):
    """Limit text masks using the drawing's typical word height and page scale."""
    valid = [list(map(float, b)) for b in boxes if isinstance(b, (list, tuple)) and len(b) == 4
             and b[2] > b[0] and b[3] > b[1]]
    if not valid:
        return []
    heights = [b[3]-b[1] for b in valid]
    limit = min(max(image_shape[:2])*.04, float(np.median(heights))*2.4)
    return [b for b in valid if b[3]-b[1] <= limit and b[2]-b[0] <= max(image_shape[:2])*.4]


def extract_plan_measurements(image, walls=None):
    """Return JSON-safe measurement evidence. Does not modify walls or image."""
    del walls  # Wall proposals do not prove where a printed dimension starts/ends.
    empty = {'engine': 'tesseract-local', 'linear': [], 'areas': [], 'calibration': None}
    if image is None or not isinstance(image, np.ndarray) or image.size == 0:
        return {**empty, 'status': 'error', 'warnings': ['No valid image supplied for dimension reading.']}
    executable = shutil.which('tesseract')
    if not executable:
        return {**empty, 'status': 'unavailable', 'warnings': ['Local Tesseract OCR is not installed. Enter a printed dimension and select its endpoints to calibrate without OCR.']}
    try:
        return measurements_from_ocr(image, _read_ocr(image, executable))
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, cv2.error) as exc:
        return {**empty, 'status': 'error', 'warnings': [f'Local dimension reading failed ({type(exc).__name__}). Manual calibration is still available.']}


def exclude_dimension_walls(walls, measurements, tolerance_px=3.0):
    """Remove auto proposals lying on recognized dimension rules, never authored walls.

    Returns the original wall dictionaries in a new list. A nearby parallel wall
    or perpendicular wall is retained; no broad image-border crop is performed.
    """
    references = [item['reference'] for item in (measurements or {}).get('linear', [])
                  if (item.get('reference') or {}).get('source') == 'dimension-line'
                  and item.get('confidence', 0) >= 0.5]
    result = []
    for wall in walls:
        if str(wall.get('source', '')).lower() in ('manual', 'corrected', 'seed'):
            result.append(wall)
            continue
        try:
            a, b = (np.array([wall[key]['x'], wall[key]['y']], dtype=float) for key in ('start', 'end'))
            length = float(np.linalg.norm(b - a))
            if not np.isfinite(a).all() or not np.isfinite(b).all() or length < 1:
                result.append(wall)
                continue
        except (KeyError, TypeError, ValueError):
            result.append(wall)
            continue
        matched = False
        for reference in references:
            c, d = (np.array([reference[key]['x'], reference[key]['y']], dtype=float) for key in ('start', 'end'))
            span = float(np.linalg.norm(d - c))
            if span <= 0 or float(wall.get('thickness_px') or 1) > max(3, reference.get('stroke_width_px', 1) + 1):
                continue
            unit = (d - c) / span
            normal = np.array([-unit[1], unit[0]])
            if abs(float(np.dot((b - a) / length, unit))) < math.cos(math.radians(2)):
                continue
            if max(abs(float(np.dot(a - c, normal))), abs(float(np.dot(b - c, normal)))) > tolerance_px:
                continue
            lo, hi = sorted(float(np.dot(point - c, unit)) for point in (a, b))
            if lo >= -tolerance_px and hi <= span + tolerance_px:
                matched = True
                break
        if not matched:
            result.append(wall)
    return result
