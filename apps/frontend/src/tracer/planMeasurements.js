// Tracer coordinates are image pixels. The viewer receives metres exactly once.
export const SQFT_PER_M2 = 1 / (0.3048 ** 2);

function normalizedText(value) {
  return String(value ?? '').trim().toLowerCase()
    .replace(/[′’‘]/g, "'").replace(/[″“”]/g, '"')
    .replace(/²/g, '2').replace(/\b\d{1,3}(?:,\d{3})+\b/g, number => number.replace(/,/g, ''));
}

export function parseLength(value) {
  const text = normalizedText(value);
  const imperial = text.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)(?:\s*-?\s*(\d+(?:\.\d+)?)\s*(?:"|in|inches|inch))?$/);
  if (imperial) {
    const feet = Number(imperial[1]), inches = Number(imperial[2] || 0);
    return inches < 12 && feet * 12 + inches > 0 ? (feet * 12 + inches) * 0.0254 : null;
  }
  const metric = text.match(/^(\d+(?:\.\d+)?)\s*(m|metres?|meters?|cm|mm|in|inches|inch|")?$/);
  if (!metric) return null;
  const factor = { cm: 0.01, mm: 0.001, in: 0.0254, inches: 0.0254, inch: 0.0254, '"': 0.0254 }[metric[2]] || 1;
  const metres = Number(metric[1]) * factor;
  return metres > 0 ? metres : null;
}

export function parseArea(value) {
  const text = normalizedText(value).replace(/^a\s*:\s*/, '').replace(/\^\s*2/g, '2');
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(sq\.?\s*ft\.?|sqft|ft2|square\s+feet|sq\.?\s*m\.?|sqm|m2|square\s+met(?:er|re)s)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  return amount > 0 ? amount * (/ft|feet/.test(match[2]) ? 0.3048 ** 2 : 1) : null;
}

// Width is left-to-right on the plan; depth is top-to-bottom. Keep the entered
// units for editing, and metric targets separately from the traced pixel size.
export function roomSizeTargets(widthText = '', depthText = '') {
  const result = {};
  for (const [axis, value] of [['width', widthText], ['depth', depthText]]) {
    const text = String(value).trim();
    if (!text) continue;
    const metres = parseLength(text);
    if (!metres || !Number.isFinite(metres)) throw new Error(`Invalid room ${axis}. Enter a positive length, such as 4 m, 400 cm or 12 ft.`);
    result[`declared_${axis}_m`] = metres;
    result[`declared_${axis}_text`] = text;
  }
  return result;
}

export function roomSizeConstraints(room) {
  const points = validateBoundary(room.points);
  const x1 = Math.min(...points.map(p => p.x)), x2 = Math.max(...points.map(p => p.x));
  const y1 = Math.min(...points.map(p => p.y)), y2 = Math.max(...points.map(p => p.y));
  return ['width', 'depth'].filter(axis => room[`declared_${axis}_m`] > 0).map(axis => ({
    id: `${axis}-${room.id}`, type: 'length', room_id: room.id, source: 'manual-room-size',
    start: { x: x1, y: y1 }, end: axis === 'width' ? { x: x2, y: y1 } : { x: x1, y: y2 },
    target_m: room[`declared_${axis}_m`],
    text: `${room.name || 'Room'} ${axis}: ${room[`declared_${axis}_text`] || `${room[`declared_${axis}_m`]} m`}`,
  }));
}

export function polygonArea(points) {
  return Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
}

// Canvas users often click the first corner again to close a polygon, or
// double-click the last corner. Store an open vertex list for geometry/export.
export function finishRoomBoundary(points) {
  const same = (a, b) => a && b && Math.hypot(a.x-b.x, a.y-b.y) < 1e-8;
  const clean = [];
  for (const point of points) {
    if (!same(point, clean.at(-1))) clean.push({ ...point });
  }
  if (clean.length > 1 && same(clean[0], clean.at(-1))) clean.pop();
  return validateBoundary(clean);
}

export function validateBoundary(points) {
  if (!Array.isArray(points) || points.length < 3 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new Error('A room needs at least three valid corners.');
  }
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const on = (a, b, c) => Math.abs(cross(a, b, c)) < 1e-8 && c.x >= Math.min(a.x, b.x) && c.x <= Math.max(a.x, b.x) && c.y >= Math.min(a.y, b.y) && c.y <= Math.max(a.y, b.y);
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-8) throw new Error('Room corners must be distinct.');
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) {
        throw new Error('Room boundary crosses itself. Trace the corners in order.');
      }
    }
  }
  if (polygonArea(points) < 1e-8) throw new Error('Room boundary has no area.');
  return points;
}

export function scaleFromReference(reference) {
  const pixels = Math.hypot(reference.end.x - reference.start.x, reference.end.y - reference.start.y);
  if (!Number.isFinite(pixels) || pixels < 1 || !Number.isFinite(reference.meters) || reference.meters <= 0) {
    throw new Error('Choose two distinct dimension endpoints and a positive real length.');
  }
  return reference.meters / pixels;
}

export function scaleFromRoomArea(points, areaM2) {
  validateBoundary(points);
  if (!Number.isFinite(areaM2) || areaM2 <= 0) throw new Error('The printed room area must be positive.');
  return Math.sqrt(areaM2 / polygonArea(points));
}

// Use the annotation's actual text location, not the room detector's rectangle.
// Ambiguous/low-confidence associations are left for the user to enter.
export function areaAnnotationForRoom(points, annotations = []) {
  const contains = p => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };
  const matches = annotations.filter(a => a.confidence >= 0.7 && a.value_m2 > 0 && a.bbox?.length === 4
    && contains({ x: (a.bbox[0] + a.bbox[2]) / 2, y: (a.bbox[1] + a.bbox[3]) / 2 }));
  return matches.length === 1 ? matches[0] : null;
}

export function snapRoomVertex(points, raw, radius = 8) {
  const p = { ...raw };
  const previous = points.at(-1);
  if (previous) {
    if (Math.abs(p.x - previous.x) <= radius) p.x = previous.x;
    if (Math.abs(p.y - previous.y) <= radius) p.y = previous.y;
  }
  if (points.length > 1) {
    if (Math.abs(p.x - points[0].x) <= radius) p.x = points[0].x;
    if (Math.abs(p.y - points[0].y) <= radius) p.y = points[0].y;
  }
  return p;
}

export function metricDimensionConstraints(layout, pixelLengths = []) {
  const { center_px: center, meters_per_pixel: scale } = layout.image_transform;
  const point = p => ({ x: (p.x - center.x) * scale, y: (p.y - center.y) * scale });
  return [
    ...pixelLengths.map(c => ({ ...c, start: point(c.start), end: point(c.end),
      source_reference_px: { start: { ...c.start }, end: { ...c.end } } })),
    ...layout.rooms.flatMap(roomSizeConstraints),
    ...layout.rooms.filter(r => r.declared_area_m2 > 0).map(r => ({ id: `area-${r.id}`, type: 'area', room_id: r.id,
      target_m2: r.declared_area_m2, text: r.declared_area_text || `${r.declared_area_m2} m²` })),
  ];
}

export function buildMetricLayout({ walls, doors = [], objects = [], rooms = [], metersPerPixel, scaleSource,
  calibration = {}, measurements = {}, image = {}, defaults = {} }) {
  const valid = walls.filter(w => w?.start && w?.end && [w.start.x, w.start.y, w.end.x, w.end.y].every(Number.isFinite)
    && Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) > 1);
  const markedPoints = rooms.filter(r => r.boundary_source === 'manual').flatMap(r => validateBoundary(r.points));
  if (!valid.length && !markedPoints.length) throw new Error('No valid walls or marked rooms to export.');
  const xs = [...valid.flatMap(w => [w.start.x, w.end.x]), ...markedPoints.map(p => p.x)];
  const ys = [...valid.flatMap(w => [w.start.y, w.end.y]), ...markedPoints.map(p => p.y)];
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const calibrated = Number.isFinite(metersPerPixel) && metersPerPixel > 0;
  const scale = calibrated ? metersPerPixel : 20 / Math.max(maxX - minX, maxY - minY);
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const point = p => ({ x: (p.x - center.x) * scale, y: (p.y - center.y) * scale });
  const wallHeight = defaults.height || 3, wallThickness = defaults.thickness || 0.15;
  return {
    units: 'm', metersPerUnit: 1, scale_m_per_px: calibrated ? scale : null,
    scale_source: calibrated ? scaleSource : 'fit_to_20m',
    calibration: { ...calibration, status: calibrated ? (calibration.status || 'estimated') : 'unscaled',
      source: calibrated ? scaleSource : 'fit_to_20m', meters_per_pixel: calibrated ? scale : null },
    measurements, source_image: image,
    image_transform: { center_px: center, meters_per_pixel: scale },
    dimension_defaults: { wall_height_m: wallHeight, wall_thickness_m: wallThickness, source: 'user-defaults' },
    rooms: rooms.map((room, i) => ({ ...room, id: room.id || `room_${i}`, points: validateBoundary(room.points).map(point),
      height: room.height || wallHeight, area_source: room.boundary_source === 'auto_walls' ? 'detected_inside_boundary' : 'traced_boundary' })),
    walls: valid.map((w, i) => {
      // Detector thickness is measured in pixels; its old 0.15m placeholder must not override it.
      const measuredThickness = calibrated && Number.isFinite(w.thickness_px) && w.thickness_px > 0;
      const authored = ['manual', 'corrected'].includes(w.source);
      return { ...w, id: w.id || `wall_${i}`, start: point(w.start), end: point(w.end),
        height: authored && w.height > 0 ? w.height : wallHeight,
        thickness: measuredThickness && !authored ? w.thickness_px * scale : (authored && w.thickness > 0 ? w.thickness : wallThickness),
        thickness_source: measuredThickness && !authored ? 'image-stroke' : 'default-or-manual' };
    }),
    objects: [...doors.map(d => ({ ...d, class: 'door' })), ...objects].map((o, i) => {
      const b = o.bbox;
      if (!b || ![b.x1, b.y1, b.x2, b.y2].every(Number.isFinite)) throw new Error('An object has invalid image coordinates.');
      const a = point({ x: b.x1, y: b.y1 }), z = point({ x: b.x2, y: b.y2 });
      return { ...o, id: o.id || `object_${i}`, bbox: { x1: a.x, y1: a.y, x2: z.x, y2: z.y } };
    }),
  };
}
