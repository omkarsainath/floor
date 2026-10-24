// Repair L/T junctions without moving the supporting lines or attracting parallel
// endpoints across doorways. All candidates use the original geometry.
export function snapRadiusForPlan(width, height, minimum = 8) {
  const largest = Math.max(Number(width) || 0, Number(height) || 0);
  // Coordinates are original-image pixels, not CSS/display pixels. A fixed
  // eight-pixel radius is effectively tiny on 2K/4K uploaded plans.
  return Math.max(minimum, Math.min(32, Math.round(largest * 0.012)));
}

export function snapWallIntersections(walls, radius = 8, openings = []) {
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const length = v => Math.hypot(v.x, v.y);
  return walls.map((wall, index) => {
    const u = subtract(wall.end, wall.start);
    const wallLength = length(u);
    if (wallLength < 0.5) return structuredClone(wall);
    const result = structuredClone(wall);
    for (const key of ['start', 'end']) {
      // A jamb is an intentional endpoint, not a broken corner. Moving it to
      // a nearby return enlarges the gap beyond the opening and loses its
      // header/sill in 3D. Use wall-relative projections (also for diagonals).
      const atJamb = openings.some(opening => {
        const b = opening.bbox;
        if (!b || !['x1', 'y1', 'x2', 'y2'].every(k => Number.isFinite(b[k]))) return false;
        const dx = Math.abs(b.x2 - b.x1), dy = Math.abs(b.y2 - b.y1);
        const ux = u.x / wallLength, uy = u.y / wallLength;
        if ((dx > dy * 2 && Math.abs(ux) < .5) || (dy > dx * 2 && Math.abs(uy) < .5)) return false;
        const points = [[b.x1,b.y1], [b.x1,b.y2], [b.x2,b.y1], [b.x2,b.y2]]
          .map(([x,y]) => ({ x: x-wall[key].x, y: y-wall[key].y }));
        const along = points.map(p => p.x*ux+p.y*uy);
        const across = points.map(p => -p.x*uy+p.y*ux);
        const thickness = Number(wall.thickness_px) || Math.min(dx,dy);
        const tolerance = Math.max(.5, Math.min(radius, thickness*.75));
        return Math.min(...across) <= thickness/2 && Math.max(...across) >= -thickness/2
          && Math.min(Math.abs(Math.min(...along)), Math.abs(Math.max(...along))) <= tolerance;
      });
      if (atJamb) continue;
      const candidates = [];
      walls.forEach((other, j) => {
        if (index === j) return;
        const v = subtract(other.end, other.start);
        const otherLength = length(v);
        const determinant = cross(u, v);
        if (otherLength < 0.5 || Math.abs(determinant) / (wallLength * otherLength) < 0.25) return;
        const delta = subtract(other.start, wall.start);
        const t = cross(delta, v) / determinant;
        const s = cross(delta, u) / determinant;
        const otherLimit = radius / otherLength;
        if (s < -otherLimit || s > 1 + otherLimit) return;
        const point = { x: wall.start.x + t * u.x, y: wall.start.y + t * u.y };
        const distance = length(subtract(point, wall[key]));
        // Short masonry returns may need extending by more than 25% of their
        // length. Only limit shortening, so a repair cannot collapse a wall.
        const extending = key === 'start' ? t <= 0 : t >= 1;
        const limit = extending ? radius : Math.min(radius, wallLength * 0.25);
        // Include existing intersections: an already joined endpoint must not
        // be pulled away to a second nearby supporting line.
        if (distance <= limit) candidates.push({ distance, point });
      });
      candidates.sort((a, b) => a.distance - b.distance || a.point.x - b.point.x || a.point.y - b.point.y);
      if (candidates.length && candidates[0].distance > 1e-5) {
        result[key] = candidates[0].point;
        // Editing endpoints does not author a new wall thickness/height.
        result.geometry_edited = true;
      }
    }
    return result;
  });
}

export function replaceAutoDoors(previous, detected) {
  const authored = previous.filter(d => d.source !== 'auto' && !d.id?.startsWith('door_auto_'));
  const overlaps = (a, b) => {
    const x = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
    const y = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
    const small = Math.min((a.x2 - a.x1) * (a.y2 - a.y1), (b.x2 - b.x1) * (b.y2 - b.y1));
    return small > 0 && x * y / small >= 0.7;
  };
  const result = structuredClone(authored);
  for (const door of detected) {
    if (!result.some(existing => overlaps(existing.bbox, door.bbox))) result.push(structuredClone(door));
  }
  return result;
}
