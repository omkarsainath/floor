import * as THREE from 'three';

const clampPositive = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
};

// Classification supplies appearance/defaults only. It must never multiply
// measured dimensions (including the short pieces above/below an opening).
const WALL_TYPE_PROPS = {
  exterior: { height: 3, color: 0xd9d2c5 },
  interior: { height: 3, color: 0xf5f2ed },
  half: { height: 1.05, color: 0xcfc9bd },
};

// Create a fresh owned material so _ensureOwnMaterial never needs to clone it.
const _mkMat = (col) => {
  const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.0 });
  m.userData._ownedByMesh = true;
  return m;
};

export function createWall({ start, end, height, thickness = 0.15, color, wall_type, yOffset = 0 }) {
  if (!start || !end) throw new Error('Wall requires start and end points');

  const x1 = start.x;
  const z1 = start.y;
  const x2 = end.x;
  const z2 = end.y;

  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  if (!Number.isFinite(length) || length === 0) throw new Error('Wall endpoints must be finite and different');

  const centerX = (x1 + x2) / 2;
  const centerZ = (z1 + z2) / 2;

  const typeProps = WALL_TYPE_PROPS[wall_type] || WALL_TYPE_PROPS.interior;
  const wallHeight = clampPositive(height, typeProps.height);
  const wallThickness = clampPositive(thickness, 0.15);

  const geometry = new THREE.BoxGeometry(length, wallHeight, wallThickness);

  // Six separate material instances, one per BoxGeometry face group:
  //   0=+X (right end)  1=-X (left end)  2=+Y (top)  3=-Y (bottom)
  //   4=+Z (broad face A — tagged as inside/outside by rebuildWalls)
  //   5=-Z (broad face B — tagged as inside/outside by rebuildWalls)
  const baseColor = (color !== undefined && color !== 0x888888) ? color : typeProps.color;
  const materials = Array.from({ length: 6 }, () => _mkMat(baseColor));

  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = 'wall';

  mesh.position.set(centerX, yOffset + wallHeight / 2, centerZ);

  const angle = Math.atan2(dz, dx);
  mesh.rotation.y = -angle;

  // Subtle baseboards on both sides of the wall
  const baseboardH = Math.min(0.08, wallHeight);
  const baseboardD = 0.02;
  const baseboardMat = new THREE.MeshStandardMaterial({
    color: 0xebe7e0, roughness: 0.6, metalness: 0.0,
  });
  baseboardMat.userData._ownedByMesh = true;
  const baseboardGeo = new THREE.BoxGeometry(length, baseboardH, baseboardD);
  (yOffset === 0 ? [-1, 1] : []).forEach((side) => {
    const baseboard = new THREE.Mesh(baseboardGeo, baseboardMat);
    baseboard.position.set(0, -wallHeight / 2 + baseboardH / 2, side * (wallThickness / 2 + baseboardD / 2));
    baseboard.castShadow = true;
    baseboard.receiveShadow = true;
    mesh.add(baseboard);
  });

  return mesh;
}
