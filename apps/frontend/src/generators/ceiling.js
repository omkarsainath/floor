import * as THREE from 'three';

/**
 * Single-slab ceiling for the entire plan.
 * Uses the bounding box of all room points; places a thin box at the max room height.
 */
export function createCeiling(
  rooms,
  { color = 0xf0ece5, thickness = 0.05, padding = 0.1 } = {}
) {
  if (!Array.isArray(rooms) || rooms.length === 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxHeight = 0;

  rooms.forEach((room) => {
    const height = Number.isFinite(room.height) ? room.height : 3;
    if (height > maxHeight) maxHeight = height;
    if (Array.isArray(room.points)) {
      room.points.forEach((p) => {
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
      });
    }
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  const width = (maxX - minX) + padding * 2;
  const depth = (maxY - minY) + padding * 2;
  const heightY = maxHeight;

  const geometry = new THREE.BoxGeometry(width, thickness, depth);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  mesh.position.set(centerX, heightY, centerY);

  return mesh;
}
