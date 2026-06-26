import * as THREE from 'three';

const clampPositive = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
};

// Shared wall material — smooth white plaster look
const wallMaterial = new THREE.MeshStandardMaterial({
  color: 0xf5f2ed,
  roughness: 0.55,
  metalness: 0.0,
});

// Wall-type presentation: exterior walls render thicker/darker, half walls render
// short (partition height) — mirrors the CLASS_PROPS lookup pattern in generators/object.js.
const WALL_TYPE_PROPS = {
  exterior: { heightMul: 1.0, thicknessMul: 1.3, color: 0xd9d2c5 },
  interior: { heightMul: 1.0, thicknessMul: 1.0, color: 0xf5f2ed },
  half: { heightMul: 0.35, thicknessMul: 0.8, color: 0xcfc9bd },
};

export function createWall({ start, end, height = 3, thickness = 0.15, color, wall_type }) {
  if (!start || !end) throw new Error('Wall requires start and end points');

  const x1 = start.x;
  const z1 = start.y;
  const x2 = end.x;
  const z2 = end.y;

  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  if (length === 0) throw new Error('Wall start/end cannot be the same point');

  const centerX = (x1 + x2) / 2;
  const centerZ = (z1 + z2) / 2;

  const typeProps = WALL_TYPE_PROPS[wall_type] || WALL_TYPE_PROPS.interior;
  const wallHeight = Math.max(clampPositive(height, 3) * typeProps.heightMul, 0.4);
  const wallThickness = Math.max(clampPositive(thickness, 0.15) * typeProps.thicknessMul, 0.12);

  const geometry = new THREE.BoxGeometry(length, wallHeight, wallThickness);

  // Use custom color if provided, otherwise fall back to the wall-type color
  let mat;
  if (color !== undefined && color !== 0x888888) {
    mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.0 });
  } else if (wall_type && wall_type !== 'interior') {
    mat = new THREE.MeshStandardMaterial({ color: typeProps.color, roughness: 0.55, metalness: 0.0 });
  } else {
    mat = wallMaterial;
  }

  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  mesh.position.set(centerX, wallHeight / 2, centerZ);

  const angle = Math.atan2(dz, dx);
  mesh.rotation.y = -angle;

  // Add subtle baseboards on both sides of the wall
  const baseboardH = 0.08;
  const baseboardD = 0.02;
  const baseboardMat = new THREE.MeshStandardMaterial({
    color: 0xebe7e0, roughness: 0.6, metalness: 0.0,
  });
  const baseboardGeo = new THREE.BoxGeometry(length, baseboardH, baseboardD);
  [-1, 1].forEach((side) => {
    const baseboard = new THREE.Mesh(baseboardGeo, baseboardMat);
    baseboard.position.set(0, -wallHeight / 2 + baseboardH / 2, side * (wallThickness / 2 + baseboardD / 2));
    baseboard.castShadow = true;
    baseboard.receiveShadow = true;
    mesh.add(baseboard);
  });

  return mesh;
}
