import * as THREE from 'three';

/** Interior ceiling slabs follow each room footprint and its own height. */
export function createCeiling(rooms, { color = 0xf0ece5, thickness = 0.05 } = {}) {
  if (!Array.isArray(rooms) || !rooms.length) return null;
  const group = new THREE.Group();
  group.userData.type = 'ceiling';
  const depth = Number.isFinite(thickness) && thickness > 0 ? thickness : 0.05;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide });
  for (const room of rooms) {
    if (!Array.isArray(room.points) || room.points.length < 3
      || room.points.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))) continue;
    const points = room.points.map(p => new THREE.Vector2(p.x, p.y));
    if (points[0].distanceTo(points.at(-1)) < 1e-8) points.pop();
    if (!THREE.ShapeUtils.triangulateShape(points, []).length) continue;
    const shape = new THREE.Shape(points);
    for (const hole of room.holes || []) {
      if (hole.length >= 3 && hole.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) {
        shape.holes.push(new THREE.Path(hole.map(p => new THREE.Vector2(p.x,p.y))));
      }
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
    geometry.rotateX(Math.PI / 2);
    const height = Number.isFinite(room.height) && room.height > 0 ? room.height : 3;
    geometry.translate(0, height + depth / 2, 0);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.userData = { type: 'ceiling', roomId: room.id, walkSurfaceTriangles: true };
    group.add(mesh);
  }
  if (!group.children.length) { material.dispose(); return null; }
  return group;
}
