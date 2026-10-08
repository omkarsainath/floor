/**
 * JSON loader for layout.sample.json
 * Responsibilities: fetch, parse, basic validation of rooms and walls.
 * Does not handle geometry detection or scaling logic.
 */
import { validateBoundary } from '../tracer/planMeasurements.js';

// Required shape helpers
function validatePoint(pt, label) {
  if (!pt || typeof pt !== 'object') throw new Error(`${label} must be an object with x and y`);
  for (const key of ['x', 'y']) {
    if (pt[key] === null || pt[key] === '' || typeof pt[key] === 'boolean' || !Number.isFinite(Number(pt[key]))) {
      throw new Error(`${label}.${key} must be finite`);
    }
  }
  const x = Number(pt.x);
  const y = Number(pt.y);
  return { x, y };
}

function positiveDimension(value, fallback, label) {
  if (value === undefined) return fallback;
  if (value === null || value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value)) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return Number(value);
}

function convertToMetres(data) {
  const unitFactors = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 };
  if (data.units && unitFactors[data.units] === undefined) throw new Error(`Unsupported layout units: ${data.units}`);
  const explicit = data.metersPerUnit === undefined ? null : positiveDimension(data.metersPerUnit, 1, 'metersPerUnit');
  const factor = data.units ? unitFactors[data.units] : (explicit ?? 1);
  if (data.units && explicit !== null && Math.abs(explicit - factor) > 1e-10) throw new Error('units and metersPerUnit disagree');
  if (factor === 1) return data;
  const point = p => { const valid = validatePoint(p, 'point'); return { x: valid.x * factor, y: valid.y * factor }; };
  const dimensions = item => ({ ...item, ...(item.height !== undefined ? { height: positiveDimension(item.height, 3, 'height') * factor } : {}),
    ...(item.thickness !== undefined ? { thickness: positiveDimension(item.thickness, 0.15, 'thickness') * factor } : {}) });
  return { ...data, units: 'm', metersPerUnit: 1,
    ...(data.dimension_constraints ? { dimension_constraints: data.dimension_constraints.map(c => c.type === 'length'
      ? { ...c, start: point(c.start), end: point(c.end) } : { ...c }) } : {}),
    walls: (data.walls || []).map(w => ({ ...dimensions(w), start: point(w.start), end: point(w.end) })),
    rooms: (data.rooms || []).map(r => ({ ...dimensions(r), points: (r.points || r.polygon || []).map(p => point(Array.isArray(p) ? { x: p[0], y: p[1] } : p)) })),
    objects: (data.objects || []).map((o, i) => {
      const valid = validateObject(o, i);
      return { ...dimensions(valid), bbox: Object.fromEntries(Object.entries(valid.bbox).map(([k, v]) => [k, v * factor])),
        ...(valid.sillHeight !== undefined ? { sillHeight: Number(valid.sillHeight) * factor } : {}) };
    }) };
}

function validateRoom(room, index) {
  if (!room || typeof room !== 'object') throw new Error(`rooms[${index}] must be an object`);
  const id = typeof room.id === 'string' && room.id.length ? room.id : `room-${index}`;
  const boundary = room.points || room.polygon;
  if (!Array.isArray(boundary) || boundary.length < 3) {
    throw new Error(`rooms[${index}] must have points (>=3)`);
  }
  const points = boundary.map((pt, i) => validatePoint(Array.isArray(pt) ? { x: pt[0], y: pt[1] } : pt, `rooms[${index}].points[${i}]`));
  if (points.length > 3 && points[0].x === points.at(-1).x && points[0].y === points.at(-1).y) points.pop();
  validateBoundary(points);
  const height = positiveDimension(room.height, 3, `rooms[${index}].height`);
  return { ...room, id, name: room.name || id, points, height };
}

function validateWall(wall, index) {
  if (!wall || typeof wall !== 'object') throw new Error(`walls[${index}] must be an object`);
  const id = typeof wall.id === 'string' && wall.id.length ? wall.id : `wall-${index}`;
  const start = validatePoint(wall.start, `walls[${index}].start`);
  const end = validatePoint(wall.end, `walls[${index}].end`);
  if (Math.hypot(start.x - end.x, start.y - end.y) < 1e-8) throw new Error(`walls[${index}] has zero length`);
  const height = positiveDimension(wall.height, 3, `walls[${index}].height`);
  const thickness = positiveDimension(wall.thickness, 0.2, `walls[${index}].thickness`);
  return { ...wall, id, start, end, height, thickness, material: wall.material || 'default', wall_type: wall.wall_type || 'interior' };
}

const defaultLayout = {
  calibration: { status: 'unscaled', source: 'demo-fallback' },
  warnings: ['Demo room: requested project could not be loaded. These are not your plan measurements.'],
  rooms: [
    {
      id: 'room-default',
      name: 'default',
      height: 3,
      points: [
        { x: -4, y: -3 },
        { x: 4, y: -3 },
        { x: 4, y: 3 },
        { x: -4, y: 3 }
      ]
    }
  ],
  walls: [
    { id: 'w1', start: { x: -4, y: -3 }, end: { x: 4, y: -3 }, height: 3, thickness: 0.2 },
    { id: 'w2', start: { x: 4, y: -3 }, end: { x: 4, y: 3 }, height: 3, thickness: 0.2 },
    { id: 'w3', start: { x: 4, y: 3 }, end: { x: -4, y: 3 }, height: 3, thickness: 0.2 },
    { id: 'w4', start: { x: -4, y: 3 }, end: { x: -4, y: -3 }, height: 3, thickness: 0.2 }
  ],
  objects: []
};

function validateObject(obj, index) {
  if (!obj || typeof obj.class !== 'string' || !obj.bbox) throw new Error(`objects[${index}] requires class and bbox`);
  const bbox = {};
  for (const key of ['x1', 'y1', 'x2', 'y2']) {
    const value = obj.bbox[key];
    if (value === null || value === '' || !Number.isFinite(Number(value))) throw new Error(`objects[${index}].bbox.${key} must be finite`);
    bbox[key] = Number(value);
  }
  return { ...obj, id: obj.id || `obj-${index}`, bbox };
}

function validateLayout(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Layout JSON must be an object');
  for (const name of ['rooms', 'walls', 'objects', 'dimension_constraints']) {
    if (data[name] !== undefined && !Array.isArray(data[name])) throw new Error(`${name} must be an array`);
  }
  data = convertToMetres(data);
  const roomsRaw = Array.isArray(data.rooms) ? data.rooms : [];
  const wallsRaw = Array.isArray(data.walls) ? data.walls : [];
  const objectsRaw = Array.isArray(data.objects) ? data.objects : [];
  const rooms = roomsRaw.map(validateRoom);
  const walls = wallsRaw.map(validateWall);
  const objects = objectsRaw.map(validateObject);
  const dimension_constraints = data.dimension_constraints?.map((c, i) => {
    if (!c || typeof c !== 'object') throw new Error(`dimension_constraints[${i}] must be an object`);
    if (c.type === 'length') return { ...c, target_m: positiveDimension(c.target_m, NaN, 'target_m'),
      start: validatePoint(c.start, 'dimension start'), end: validatePoint(c.end, 'dimension end') };
    if (c.type === 'area' && typeof c.room_id === 'string') return { ...c,
      target_m2: positiveDimension(c.target_m2, NaN, 'target_m2') };
    throw new Error(`dimension_constraints[${i}] must refer to a length or room area`);
  });
  if (dimension_constraints?.some(c => !Number.isFinite(c.type === 'length' ? c.target_m : c.target_m2))) throw new Error('Measurement targets are required');
  return { ...data, rooms, walls, objects, ...(dimension_constraints ? { dimension_constraints } : {}) };
}

function detectionsToLayout(detections) {
  const walls = [];
  const rooms = [];
  const objects = [];
  const coordinate = (v) => {
    if (v === null || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v))) throw new Error('Detection bbox coordinates must be finite');
    return Number(v);
  };

  detections.forEach((d, i) => {
    const typ = (d.type || '').toLowerCase();
    const bbox = d.bbox || {};
    if (!['wall', 'room', 'object'].includes(typ)) return;
    const coords = bbox.coordinates || bbox;
    const x1 = coordinate(coords.x1);
    const y1 = coordinate(coords.y1);
    const x2 = coordinate(coords.x2);
    const y2 = coordinate(coords.y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    if (typ === 'wall') {
      const thickness = Math.min(w, h) || 0.15;
      // let wall generator use its default height; we only supply thickness
      // Orient by the longer side of the bbox
      if (w >= h) {
        const cy = (y1 + y2) / 2;
        walls.push({
          id: d.id || `wall-${i}`,
          start: { x: x1, y: cy },
          end: { x: x2, y: cy },
          // height intentionally omitted to use createWall default
          thickness, thickness_source: Math.min(w, h) > 0 ? 'bbox' : 'default'
        });
      } else {
        const cx = (x1 + x2) / 2;
        walls.push({
          id: d.id || `wall-${i}`,
          start: { x: cx, y: y1 },
          end: { x: cx, y: y2 },
          // height intentionally omitted to use createWall default
          thickness, thickness_source: Math.min(w, h) > 0 ? 'bbox' : 'default'
        });
      }
    } else if (typ === 'room') {
      rooms.push({
        id: d.id || `room-${i}`,
        name: d.class || d.id || `room-${i}`,
        boundary_source: 'detection_bbox',
        area_source: 'bbox',
        points: [
          { x: x1, y: y1 },
          { x: x2, y: y1 },
          { x: x2, y: y2 },
          { x: x1, y: y2 }
        ]
      });
    } else if (typ === 'object') {
      const cls = (d.class || '').toLowerCase();
      if (Number.isFinite(d.confidence) && d.confidence < 0.2) return;
      objects.push({
        id: d.id || `obj-${i}`,
        class: cls || 'object',
        class_id: d.class_id,
        confidence: d.confidence,
        bbox: { x1, y1, x2, y2 }
      });
    }
  });

  return { walls, rooms, objects: _nmsObjects(objects) };
}

// Suppress duplicate object detections that come from multiple models firing on the
// same physical element. Standard IoU alone misses cases where a small precise bbox
// (door frame) is nearly fully contained in a large bbox (door swing arc), so we
// suppress when either IoU > 0.3 OR intersection-over-smaller > 0.5.
// Within each duplicate pair, the higher-confidence detection wins.
function _nmsObjects(objects) {
  if (objects.length <= 1) return objects;

  // Group by class family so we only suppress same-type overlaps
  const classFam = (cls) => {
    const c = (cls || '').toLowerCase();
    if (c.includes('door'))   return 'door';
    if (c.includes('window')) return 'window';
    if (c.includes('glass'))  return 'glass';
    return c; // exact class for others
  };

  // Sort descending by confidence so we always keep the better detection first
  const sorted = [...objects].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const kept = [];

  for (const obj of sorted) {
    const b = obj.bbox;
    const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
    if (areaB <= 0) { kept.push(obj); continue; }

    let suppress = false;
    for (const k of kept) {
      if (classFam(obj.class) !== classFam(k.class)) continue;
      const kb = k.bbox;
      const ix1 = Math.max(b.x1, kb.x1), iy1 = Math.max(b.y1, kb.y1);
      const ix2 = Math.min(b.x2, kb.x2), iy2 = Math.min(b.y2, kb.y2);
      const iArea = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
      if (iArea <= 0) continue;

      const areaK = (kb.x2 - kb.x1) * (kb.y2 - kb.y1);
      const iou   = iArea / (areaB + areaK - iArea);
      const ios   = iArea / Math.min(areaB, areaK); // containment check
      if (iou > 0.3 || ios > 0.5) { suppress = true; break; }
    }

    if (!suppress) kept.push(obj);
  }

  return kept;
}

function normalizeLayout(layout) {
  const points = [];
  layout.rooms.forEach((r) => { r.points.forEach((p) => points.push(p)); });
  layout.walls.forEach((w) => { points.push(w.start, w.end); });
  if (layout.objects) {
    layout.objects.forEach((o) => {
      const b = o.bbox || {};
      points.push({ x: b.x1 ?? 0, y: b.y1 ?? 0 });
      points.push({ x: b.x2 ?? 0, y: b.y2 ?? 0 });
    });
  }
  if (!points.length) return layout;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const span = Math.max(maxX - minX, maxY - minY, 1);

  // If the layout carries calibrated scale metadata, only center — do not rescale.
  const calibrated = layout.units === 'm' || layout.metersPerUnit === 1;
  const scale = calibrated ? 1 : (20 / span);

  const tx = (p) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale });

  const normalized = {
    ...layout,
    units: 'm', metersPerUnit: 1,
    calibration: layout.calibration || { status: calibrated ? 'confirmed' : 'unscaled', source: calibrated ? 'imported-units' : 'fit_to_20m' },
    ...(layout.dimension_constraints ? { dimension_constraints: layout.dimension_constraints.map(c => c.type === 'length'
      ? { ...c, start: tx(c.start), end: tx(c.end) } : { ...c }) } : {}),
    rooms: layout.rooms.map((r) => ({
      ...r,
      points: r.points.map(tx),
      height: r.height || 3,
    })),
    walls: layout.walls.map((w) => ({
      ...w,
      start: tx(w.start),
      end: tx(w.end),
      height: w.height || 3,
      thickness: (w.thickness || 0.2) * (!calibrated && w.thickness_source === 'bbox' ? scale : 1),
    })),
  };

  if (layout.scale) normalized.scale = layout.scale;

  if (layout.objects) {
    normalized.objects = layout.objects.map((o) => {
      const x1 = o.bbox?.x1 ?? 0;
      const y1 = o.bbox?.y1 ?? 0;
      const x2 = o.bbox?.x2 ?? 0;
      const y2 = o.bbox?.y2 ?? 0;
      const p1 = tx({ x: x1, y: y1 });
      const p2 = tx({ x: x2, y: y2 });
      return { ...o, bbox: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y } };
    });
  }

  return normalized;
}

// Snap door positions to nearest walls so they attach properly
function snapDoorsToWalls(layout) {
  if (!Array.isArray(layout.objects) || !Array.isArray(layout.walls)) return layout;
  
  const doors = layout.objects.filter((o) => (o.class || '').toLowerCase().includes('door'));
  if (!doors.length) return layout;
  
  console.log('Snapping', doors.length, 'doors to walls');
  
  // Helper: project point onto line segment
  function projectPointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return { x: x1, y: y1, t: 0 }; // degenerate segment
    let t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return { x: x1 + t * dx, y: y1 + t * dy, t };
  }
  
  doors.forEach((d) => {
    const b = d.bbox || {};
    const cx = ((b.x1 ?? 0) + (b.x2 ?? 0)) / 2;
    const cy = ((b.y1 ?? 0) + (b.y2 ?? 0)) / 2;
    const ddx = Math.abs((b.x2 ?? 0) - (b.x1 ?? 0));
    const ddy = Math.abs((b.y2 ?? 0) - (b.y1 ?? 0));
    const doorHoriz = ddx > ddy;
    
    let bestWall = null;
    let bestProj = null;
    let minDist = Infinity;
    
    // Find nearest wall by projecting door center onto wall line
    layout.walls.forEach((w) => {
      const isWallHoriz = Math.abs(w.end.y - w.start.y) < 0.5;
      const isWallVert = Math.abs(w.end.x - w.start.x) < 0.5;
      
      // Skip if orientations don't match
      if ((doorHoriz && !isWallHoriz) || (!doorHoriz && !isWallVert)) return;
      
      const proj = projectPointToSegment(cx, cy, w.start.x, w.start.y, w.end.x, w.end.y);
      const dist = Math.hypot(cx - proj.x, cy - proj.y);
      
      // Only consider if within reasonable distance (3 units)
      if (dist < minDist && dist < 3.0) {
        minDist = dist;
        bestWall = w;
        bestProj = proj;
      }
    });
    
    if (bestWall && bestProj) {
      const isWallHoriz = Math.abs(bestWall.end.y - bestWall.start.y) < 0.5;
      const doorWidth = doorHoriz ? ddx : ddy;
      
      if (isWallHoriz) {
        // Snap to horizontal wall - align y to wall line
        const newY = bestProj.y;
        const halfWidth = doorWidth / 2;
        // Center door on projection point
        b.y1 = newY - 0.06; // small thickness
        b.y2 = newY + 0.06;
        b.x1 = bestProj.x - halfWidth;
        b.x2 = bestProj.x + halfWidth;
        console.log('Snapped door', d.id, 'to horizontal wall at y=', newY.toFixed(2), 'x=', bestProj.x.toFixed(2));
      } else {
        // Snap to vertical wall - align x to wall line
        const newX = bestProj.x;
        const halfWidth = doorWidth / 2;
        b.x1 = newX - 0.06;
        b.x2 = newX + 0.06;
        b.y1 = bestProj.y - halfWidth;
        b.y2 = bestProj.y + halfWidth;
        console.log('Snapped door', d.id, 'to vertical wall at x=', newX.toFixed(2), 'y=', bestProj.y.toFixed(2));
      }
    } else {
      console.log('Could not snap door', d.id, 'nearest distance:', minDist.toFixed(2));
    }
  });
  
  return layout;
}

export async function loadLayout(url = '/apps/backend/outputs/combined_detections.json', { useFallback = false } = {}) {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Failed to load layout JSON: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    let layout;
    if (Array.isArray(data.detections)) {
      const mapped = { ...data, ...detectionsToLayout(data.detections) };
      layout = snapDoorsToWalls(normalizeLayout(validateLayout(mapped)));
    } else {
      layout = validateLayout(data);
    }
    // Saved layouts already use scene units. Never rescale or re-snap accepted objects.
    // Wall/door gap carving is handled by the 3D renderer (main.js); no need to carve here.
    if (useFallback && layout.rooms.length === 0 && layout.walls.length === 0) {
      return validateLayout(defaultLayout);
    }
    return layout;
  } catch (err) {
    if (useFallback) return validateLayout(defaultLayout);
    throw err;
  }
}

// Utility to parse already-fetched JSON (useful for tests)
export function parseLayout(json) {
  return validateLayout(json);
}
