/**
 * JSON loader for layout.sample.json
 * Responsibilities: fetch, parse, basic validation of rooms and walls.
 * Does not handle geometry detection or scaling logic.
 */

// Required shape helpers
function ensureNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function _isRetainedObjectClass(cls = '') {
  const c = String(cls || '').toLowerCase();
  return (
    c.includes('door')
    || c.includes('window')
    || c.includes('stair')
    || c === 'lift'
    || c.includes('elevator')
  );
}

function limitObjects(objs, doorCap = 30, windowCap = 30, stairCap = 20, liftCap = 20) {
  const doors = objs.filter((o) => (o.class || '').toLowerCase().includes('door'))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, doorCap);
  const windows = objs.filter((o) => (o.class || '').toLowerCase().includes('window'))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, windowCap);
  const stairs = objs.filter((o) => (o.class || '').toLowerCase().includes('stair'))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, stairCap);
  const lifts = objs.filter((o) => {
    const cls = (o.class || '').toLowerCase();
    return cls === 'lift' || cls.includes('elevator');
  })
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, liftCap);
  return [...doors, ...windows, ...stairs, ...lifts];
}

function validatePoint(pt, label) {
  if (!pt || typeof pt !== 'object') throw new Error(`${label} must be an object with x and y`);
  const x = ensureNumber(pt.x);
  const y = ensureNumber(pt.y);
  return { x, y };
}

function validateRoom(room, index) {
  if (!room || typeof room !== 'object') throw new Error(`rooms[${index}] must be an object`);
  const id = typeof room.id === 'string' && room.id.length ? room.id : `room-${index}`;
  if (!Array.isArray(room.points) || room.points.length < 3) {
    throw new Error(`rooms[${index}] must have points (>=3)`);
  }
  const points = room.points.map((pt, i) => validatePoint(pt, `rooms[${index}].points[${i}]`));
  const height = ensureNumber(room.height, 3); // default room height in meters
  return { id, name: room.name || id, points, height };
}

function validateWall(wall, index) {
  if (!wall || typeof wall !== 'object') throw new Error(`walls[${index}] must be an object`);
  const id = typeof wall.id === 'string' && wall.id.length ? wall.id : `wall-${index}`;
  const start = validatePoint(wall.start, `walls[${index}].start`);
  const end = validatePoint(wall.end, `walls[${index}].end`);
  const height = ensureNumber(wall.height, 3);
  const thickness = ensureNumber(wall.thickness, 0.2);
  return { id, start, end, height, thickness, material: wall.material || 'default' };
}

const defaultLayout = {
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

function dedupeObjects(objs) {
  const filtered = objs
    .filter((o) => {
      const cls = (o.class || '').toLowerCase();
      const conf = o.confidence ?? 0;
      return _isRetainedObjectClass(cls) && conf >= 0.2;
    })
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  const kept = [];
  const dist2 = (a, b) => {
    const dx = a.cx - b.cx;
    const dy = a.cy - b.cy;
    return dx * dx + dy * dy;
  };
  const sizeSimilar = (a, b) => {
    const rw = Math.abs(a.w - b.w) / Math.max(a.w, b.w, 1e-6);
    const rh = Math.abs(a.h - b.h) / Math.max(a.h, b.h, 1e-6);
    return rw < 0.35 && rh < 0.35;
  };

  filtered.forEach((o) => {
    const b = o.bbox || {};
    const cx = ((b.x1 ?? 0) + (b.x2 ?? 0)) / 2;
    const cy = ((b.y1 ?? 0) + (b.y2 ?? 0)) / 2;
    const w = Math.abs((b.x2 ?? 0) - (b.x1 ?? 0));
    const h = Math.abs((b.y2 ?? 0) - (b.y1 ?? 0));
    const cls = (o.class || '').toLowerCase();

    const already = kept.find(
      (k) =>
        k.cls === cls &&
        dist2(k, { cx, cy }) < 0.4 * 0.4 &&
        sizeSimilar(k, { w, h })
    );
    if (already) return;

    kept.push({ ...o, cx, cy, w, h, cls });
  });

  // strip helper fields
  return kept.map(({ cx, cy, w, h, cls, ...rest }) => rest);
}

function validateLayout(data) {
  if (!data || typeof data !== 'object') throw new Error('Layout JSON must be an object');
  const roomsRaw = Array.isArray(data.rooms) ? data.rooms : [];
  const wallsRaw = Array.isArray(data.walls) ? data.walls : [];
  const objectsRaw = Array.isArray(data.objects) ? data.objects : [];
  const rooms = roomsRaw.map(validateRoom);
  const walls = wallsRaw.map(validateWall);
  const objects = limitObjects(dedupeObjects(objectsRaw));
  return { rooms, walls, objects };
}

function detectionsToLayout(detections) {
  const walls = [];
  const rooms = [];
  const objects = [];
  const safeNum = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);

  detections.forEach((d, i) => {
    const typ = (d.type || '').toLowerCase();
    const bbox = d.bbox || {};
    const coords = bbox.coordinates || {};
    const x1 = safeNum(coords.x1);
    const y1 = safeNum(coords.y1);
    const x2 = safeNum(coords.x2);
    const y2 = safeNum(coords.y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    if (typ === 'wall') {
      const thickness = Math.min(Math.max(Math.min(w, h) || 0.05, 0.2), 0.3);
      // let wall generator use its default height; we only supply thickness
      // Orient by the longer side of the bbox
      if (w >= h) {
        const cy = (y1 + y2) / 2;
        walls.push({
          id: d.id || `wall-${i}`,
          start: { x: x1, y: cy },
          end: { x: x2, y: cy },
          // height intentionally omitted to use createWall default
          thickness
        });
      } else {
        const cx = (x1 + x2) / 2;
        walls.push({
          id: d.id || `wall-${i}`,
          start: { x: cx, y: y1 },
          end: { x: cx, y: y2 },
          // height intentionally omitted to use createWall default
          thickness
        });
      }
    } else if (typ === 'room') {
      rooms.push({
        id: d.id || `room-${i}`,
        name: d.class || d.id || `room-${i}`,
        height: 3,
        points: [
          { x: x1, y: y1 },
          { x: x2, y: y1 },
          { x: x2, y: y2 },
          { x: x1, y: y2 }
        ]
      });
    } else if (typ === 'object') {
      const cls = (d.class || '').toLowerCase();
      if (!_isRetainedObjectClass(cls)) return;
      objects.push({
        id: d.id || `obj-${i}`,
        class: cls || 'object',
        class_id: d.class_id,
        confidence: d.confidence,
        bbox: { x1, y1, x2, y2 }
      });
    }
  });

  return { walls, rooms, objects: limitObjects(dedupeObjects(objects)) };
}

function normalizeLayout(layout) {
  const points = [];
  layout.rooms.forEach((r) => {
    r.points.forEach((p) => points.push(p));
  });
  layout.walls.forEach((w) => {
    points.push(w.start, w.end);
  });
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
  const target = 20; // scene span in world units
  const scale = target / span;

  const tx = (p) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale });

  const normalized = {
    rooms: layout.rooms.map((r) => ({
      ...r,
      points: r.points.map(tx),
      height: r.height || 3
    })),
    walls: layout.walls.map((w) => ({
      ...w,
      start: tx(w.start),
      end: tx(w.end),
      height: w.height || 3,
      thickness: w.thickness || 0.2
    }))
  };

  if (layout.objects) {
    normalized.objects = layout.objects.map((o) => {
      const x1 = o.bbox?.x1 ?? 0;
      const y1 = o.bbox?.y1 ?? 0;
      const x2 = o.bbox?.x2 ?? 0;
      const y2 = o.bbox?.y2 ?? 0;
      const p1 = tx({ x: x1, y: y1 });
      const p2 = tx({ x: x2, y: y2 });
      return {
        ...o,
        bbox: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
      };
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

export async function loadLayout(url = '/apps/backend/outputs/combined_detections.json', { useFallback = true } = {}) {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Failed to load layout JSON: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    let layout;
    if (Array.isArray(data.detections)) {
      const mapped = detectionsToLayout(data.detections);
      layout = validateLayout(mapped);
    } else {
      layout = validateLayout(data);
    }
    layout = normalizeLayout(layout);
    layout = snapDoorsToWalls(layout);
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
