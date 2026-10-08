// Resolve local dimensions before building geometry. A bed's long axis is its
// depth, unlike a sofa. Never rotate a mesh independently of its footprint.
export function furniturePlacement(obj) {
  const b = obj.bbox || {};
  const width = Math.max(0.15, Math.abs(Number(b.x2) - Number(b.x1)) || 1);
  const depth = Math.max(0.15, Math.abs(Number(b.y2) - Number(b.y1)) || 1);
  const x = ((Number(b.x1) || 0) + (Number(b.x2) || 0)) / 2;
  const z = ((Number(b.y1) || 0) + (Number(b.y2) || 0)) / 2;
  const cls = String(obj.class || '').toLowerCase();
  const lengthwise = cls.includes('bed') || cls === 'bathtub';
  const catalog = obj.source === 'catalog';
  const quarterTurn = catalog ? false : (lengthwise ? width > depth : depth > width);
  let yaw = quarterTurn ? Math.PI / 2 : 0;
  // Only choose which way the back faces. Do not change the detected footprint
  // just because the nearest wall happens to run in a different direction.
  if (!catalog && /bed|sofa|chair|loveseat|wardrobe|cabinet/.test(cls)) {
    let nearest = null;
    let distance = Infinity;
    for (const wall of obj.walls || []) {
      if (!wall.start || !wall.end) continue;
      const dx = wall.end.x - wall.start.x, dz = wall.end.y - wall.start.y;
      const len2 = dx * dx + dz * dz;
      if (!len2) continue;
      const t = Math.max(0, Math.min(1, ((x - wall.start.x) * dx + (z - wall.start.y) * dz) / len2));
      const px = wall.start.x + t * dx - x, pz = wall.start.y + t * dz - z;
      if (Math.hypot(px, pz) < distance) {
        distance = Math.hypot(px, pz);
        nearest = { x: px, z: pz };
      }
    }
    if (nearest && -Math.sin(yaw) * nearest.x - Math.cos(yaw) * nearest.z < 0) yaw += Math.PI;
  }
  if (Number.isFinite(obj.rotationY)) yaw = obj.rotationY;
  return {
    width: quarterTurn ? depth : width,
    depth: quarterTurn ? width : depth,
    x, z, yaw,
    elevation: Number.isFinite(obj.elevation) ? obj.elevation : 0,
  };
}
