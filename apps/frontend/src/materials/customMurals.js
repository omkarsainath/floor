import * as THREE from 'three';

const IMAGE_RE = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const finite = Number.isFinite;

export function normalizeCustomMurals(value, wallLength = Infinity, wallHeight = 3) {
  if (!Array.isArray(value)) return [];
  const result = [], ids = new Set();
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || ids.has(item.id)) continue;
    const { startM, endM, bottomM, topM } = item;
    if (!['inside', 'outside'].includes(item.face) || ![startM, endM, bottomM, topM].every(finite)) continue;
    if (startM < 0 || endM > wallLength + 0.002 || bottomM < 0 || topM > wallHeight + 0.002
      || endM - startM < 0.05 || topM - bottomM < 0.05) continue;
    if (typeof item.imageData !== 'string' || item.imageData.length > 2_000_000 || !IMAGE_RE.test(item.imageData)) continue;
    result.push({ id: item.id.slice(0, 128), face: item.face, startM, endM, bottomM, topM,
      imageData: item.imageData, name: typeof item.name === 'string' ? item.name.slice(0, 120) : 'Custom mural' });
    ids.add(item.id);
    if (result.length === 24) break;
  }
  return result;
}

export function normalizeCustomPaintAreas(value, wallLength = Infinity, wallHeight = 3) {
  if (!Array.isArray(value)) return [];
  const result = [], ids = new Set();
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || ids.has(item.id)) continue;
    const { startM, endM, bottomM, topM } = item;
    if (!['inside', 'outside'].includes(item.face) || ![startM, endM, bottomM, topM].every(finite)) continue;
    if (startM < 0 || endM > wallLength + 0.002 || bottomM < 0 || topM > wallHeight + 0.002
      || endM - startM < 0.05 || topM - bottomM < 0.05 || !COLOR_RE.test(item.color || '')) continue;
    result.push({ id: item.id.slice(0, 128), face: item.face, startM, endM, bottomM, topM,
      color: item.color.toLowerCase() });
    ids.add(item.id);
    if (result.length === 24) break;
  }
  return result;
}

const project = (wall, point) => {
  const dx = wall.end.x - wall.start.x, dz = wall.end.y - wall.start.y, length = Math.hypot(dx, dz);
  return length > 0 ? ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dz) / length : 0;
};

export function buildCustomMurals({ walls = [], segments = [], center = { x: 0, y: 0 }, textureLoader = new THREE.TextureLoader() } = {}) {
  const root = new THREE.Group();
  root.userData = { isWallMuralGroup: true, walkIgnore: true };
  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x, dz = wall.end.y - wall.start.y, length = Math.hypot(dx, dz);
    if (!(length > 0)) continue;
    const murals = normalizeCustomMurals(wall.customMurals, length, Number.isFinite(wall.height) ? wall.height : 3)
      .map(item => ({ ...item, kind: 'image' }));
    const paintAreas = normalizeCustomPaintAreas(wall.customPaintAreas, length, Number.isFinite(wall.height) ? wall.height : 3)
      .map(item => ({ ...item, kind: 'paint' }));
    const tx = dx / length, tz = dz / length, nx = -tz, nz = tx;
    const midX = (wall.start.x + wall.end.x) / 2, midZ = (wall.start.y + wall.end.y) / 2;
    const insideSign = nx * (center.x - midX) + nz * (center.y - midZ) >= 0 ? 1 : -1;
    const pieces = segments.filter(segment => String(segment.parentWallId ?? segment.id) === String(wall.id));
    for (const mural of [...murals, ...paintAreas]) {
      const texture = mural.kind === 'image' ? textureLoader.load(mural.imageData) : null;
      if (texture) {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
      }
      const material = new THREE.MeshStandardMaterial({ map: texture, color: mural.kind === 'paint' ? mural.color : 0xffffff, roughness: 0.72,
        metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const sign = mural.face === 'inside' ? insideSign : -insideSign;
      let used = false;
      for (const segment of pieces) {
        const a = project(wall, segment.start), b = project(wall, segment.end);
        const lo = Math.max(mural.startM, Math.min(a, b)), hi = Math.min(mural.endM, Math.max(a, b));
        const floor = Number.isFinite(segment.yOffset) ? segment.yOffset : 0;
        const top = floor + (Number.isFinite(segment.height) ? segment.height : 3);
        const y0 = Math.max(mural.bottomM, floor), y1 = Math.min(mural.topM, top);
        if (hi - lo < 0.001 || y1 - y0 < 0.001) continue;
        const offset = (Number.isFinite(wall.thickness) ? wall.thickness / 2 : 0.075) + 0.004;
        const at = along => ({ x: wall.start.x + tx * along + nx * sign * offset,
          z: wall.start.y + tz * along + nz * sign * offset });
        const p0 = at(lo), p1 = at(hi);
        const u0 = (lo - mural.startM) / (mural.endM - mural.startM), u1 = (hi - mural.startM) / (mural.endM - mural.startM);
        const v0 = (y0 - mural.bottomM) / (mural.topM - mural.bottomM), v1 = (y1 - mural.bottomM) / (mural.topM - mural.bottomM);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([
          p0.x, y0, p0.z, p1.x, y0, p1.z, p1.x, y1, p1.z,
          p0.x, y0, p0.z, p1.x, y1, p1.z, p0.x, y1, p0.z,
        ], 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1], 2));
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { isWallMural: true, isWallPaintArea: mural.kind === 'paint', walkIgnore: true,
          muralId: mural.id, parentWallId: wall.id, face: mural.face };
        mesh.receiveShadow = true; root.add(mesh); used = true;
      }
      if (!used) { texture?.dispose(); material.dispose(); }
    }
  }
  return root;
}

export function disposeCustomMurals(group) {
  if (!group?.userData?.isWallMuralGroup) return;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) { materials.add(node.material); if (node.material.map) textures.add(node.material.map); }
  });
  textures.forEach(texture => texture.dispose()); materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose());
  group.removeFromParent(); group.clear();
}
