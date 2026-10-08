import { validateBoundary } from '../tracer/planMeasurements.js';

export function isDesignableRoom(room) {
  if (['detection_bbox', 'detector_bbox', 'bbox_estimate'].includes(room?.boundary_source) || room?.area_source === 'bbox') return false;
  try { validateBoundary(room?.points || room?.polygon); return true; } catch { return false; }
}

// Match actual wall faces to each inside room boundary, then keep only the
// horizontal/vertical pieces left by the SAME opening cuts used by the viewer.
// This avoids decorating a neighbour's face or putting panels across glass.
export function roomWallSurfaces(room, wallSegments = []) {
  if (!isDesignableRoom(room)) return [];
  const points = room.points || room.polygon;
  const winding = Math.sign(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y;
  }, 0));
  const surfaces = [], seen = new Set();
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-6) return;
    const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
    const normal = { x: -uy * winding, y: ux * winding };
    for (const wall of wallSegments) {
      const wallLength = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      if (wallLength < 1e-6) continue;
      if (Math.abs(((wall.end.x - wall.start.x) * ux + (wall.end.y - wall.start.y) * uy) / wallLength) < 0.9999) continue;
      const distance = (wall.start.x - a.x) * normal.x + (wall.start.y - a.y) * normal.y;
      const half = (wall.thickness || 0.15) / 2;
      // Inside-face and older centreline room polygons are both usable as a
      // visual boundary; always anchor the finish to the actual wall face.
      if (distance > 0.015 || Math.abs(distance + half) > Math.max(0.04, half + 0.015)) continue;
      const project = p => (p.x - a.x) * ux + (p.y - a.y) * uy;
      const start = Math.max(0, Math.min(project(wall.start), project(wall.end)));
      const end = Math.min(length, Math.max(project(wall.start), project(wall.end)));
      const bottom = Math.max(0, wall.yOffset || 0);
      const top = Math.min(room.height || 3, (wall.yOffset || 0) + (wall.height || 3));
      if (end - start < 1e-6 || top - bottom < 1e-6) continue;
      const p = t => ({ x: a.x + ux * t + normal.x * (distance + half), y: a.y + uy * t + normal.y * (distance + half) });
      const surface = { start: p(start), end: p(end), normal, yOffset: bottom, height: top - bottom,
        parentWallId: wall.parentWallId || wall.id, thickness: wall.thickness };
      const key = JSON.stringify([surface.parentWallId, surface.start, surface.end, bottom, top]);
      if (!seen.has(key)) { surfaces.push(surface); seen.add(key); }
    }
  });
  return surfaces;
}
