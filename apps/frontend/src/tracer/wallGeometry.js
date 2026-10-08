// Repair L/T junctions without moving the supporting lines or attracting parallel
// endpoints across doorways. All candidates use the original geometry.
export function snapRadiusForPlan(width, height, minimum = 8) {
  const largest = Math.max(Number(width) || 0, Number(height) || 0);
  // Coordinates are original-image pixels, not CSS/display pixels. A fixed
  // eight-pixel radius is effectively tiny on 2K/4K uploaded plans.
  return Math.max(minimum, Math.min(32, Math.round(largest * 0.012)));
}

export function snapWallIntersections(walls, radius = 8) {
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const length = v => Math.hypot(v.x, v.y);
  return walls.map((wall, index) => {
    const u = subtract(wall.end, wall.start);
    const wallLength = length(u);
    if (wallLength < 0.5) return structuredClone(wall);
    const limit = Math.min(radius, wallLength * 0.25);
    const result = structuredClone(wall);
    for (const key of ['start', 'end']) {
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
        const otherLimit = Math.min(radius / otherLength, 0.25);
        if (s < -otherLimit || s > 1 + otherLimit) return;
        const point = { x: wall.start.x + t * u.x, y: wall.start.y + t * u.y };
        const distance = length(subtract(point, wall[key]));
        if (distance > 1e-5 && distance <= limit) candidates.push({ distance, point });
      });
      candidates.sort((a, b) => a.distance - b.distance || a.point.x - b.point.x || a.point.y - b.point.y);
      if (candidates.length) result[key] = candidates[0].point;
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
