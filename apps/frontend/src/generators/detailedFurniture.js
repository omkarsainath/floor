import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { fabricMaterial, woodMaterial } from './surfaceMaterials.js';
import { createSofaMaterials, addUpholsteredSeat } from './sofaUpholstery.js';

const beds = new Set(['bed', 'single-bed', 'double-bed', 'queen-bed', 'king-bed']);
const sofas = new Set(['sofa', 'sofa-2', 'sofa-3', 'loveseat', 'l-sofa']);
const chairs = new Set(['chair', 'accent chair', 'armchair', 'lounge-chair', 'dining-chair']);

export function createDetailedFurniture(cls, width, depth) {
  const table = cls.includes('table') && cls !== 'round-table';
  if (!beds.has(cls) && !sofas.has(cls) && !chairs.has(cls) && !table) return null;
  // Author details at useful proportions, then fit the supplied local footprint.
  const w = Math.max(width, beds.has(cls) ? 0.8 : 0.45);
  const d = Math.max(depth, beds.has(cls) ? 1.5 : 0.45);
  const group = new THREE.Group();
  group.userData.detailedFurniture = true;
  if (sofas.has(cls)) {
    const materials = createSofaMaterials({ id: cls, label: 'Upholstered sofa', color: '#b8b0a2', category: 'sofas' });
    const seats = cls === 'sofa-2' || cls === 'loveseat' ? 2 : Math.max(2, Math.min(3, Math.round(w / .75)));
    const seatDepth = cls === 'l-sofa' ? Math.min(.95, d * .6) : d;
    const main = cls === 'l-sofa' ? new THREE.Group() : group;
    addUpholsteredSeat(main, w, seatDepth, .86, seats, materials, { openRight: cls === 'l-sofa' });
    if (main !== group) {
      main.position.z = -(d - seatDepth) / 2;
      group.add(main);
    }
    if (cls === 'l-sofa') {
      const chaise = new THREE.Group(), cw = Math.max(.45, w / seats);
      addUpholsteredSeat(chaise, cw, d - seatDepth + .04, .86, 1, materials, { openLeft: true, chaise: true });
      chaise.position.set((w - cw) / 2, 0, seatDepth / 2 - .02);
      group.add(chaise);
    }
    const bounds = new THREE.Box3().setFromObject(group), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    for (const child of group.children) child.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
    group.scale.set(width / size.x, 1, depth / size.z);
    return group;
  }
  const mesh = (geometry, material, x, y, z) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const box = (sx, sy, sz, x, y, z, material, radius = 0.03) => mesh(
    new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(radius, sx / 3, sy / 3, sz / 3)),
    material, x, y, z,
  );
  const legMat = woodMaterial(0x493429);
  const legs = (height, inset = 0.10) => {
    for (const x of [-w / 2 + inset, w / 2 - inset]) {
      for (const z of [-d / 2 + inset, d / 2 - inset]) {
        mesh(new THREE.CylinderGeometry(0.027, 0.018, height, 10), legMat, x, height / 2, z);
      }
    }
  };
  if (beds.has(cls)) {
    const linen = fabricMaterial(0xeee8dc);
    const upholstery = fabricMaterial(0xa79a89);
    const duvetMat = fabricMaterial(0x647b7c);
    const piping = fabricMaterial(0xd7cbb9);
    legs(0.15);
    box(w, 0.24, d - 0.06, 0, 0.25, 0.03, upholstery, 0.06);
    box(w - 0.06, 0.22, d - 0.15, 0, 0.47, 0.025, linen, 0.09);
    box(w - 0.04, 0.018, d - 0.13, 0, 0.48, 0.025, piping, 0.008);
    box(w, 1.12, 0.10, 0, 0.65, -d / 2 + 0.05, upholstery, 0.04);
    const panels = Math.max(3, Math.round(w / 0.3));
    for (let i = 0; i < panels; i++) {
      box(w / panels - 0.013, 0.63, 0.045, -w / 2 + (i + 0.5) * w / panels,
        0.85, -d / 2 + 0.12, upholstery, 0.02);
    }
    const pillowCount = cls === 'single-bed' || w < 1.2 ? 1 : 2;
    for (let i = 0; i < pillowCount; i++) {
      const p = box(w / pillowCount - 0.15, 0.15, Math.min(0.42, d * 0.22),
        (i - (pillowCount - 1) / 2) * w / pillowCount, 0.65, -d / 2 + 0.42, linen, 0.07);
      p.rotation.y = i === 0 ? 0.025 : -0.025;
      p.rotation.x = 0.06;
    }
    // A subdivided cloth surface with gently draped edges and deterministic folds.
    const clothWidth = w + 0.02, clothDepth = d * 0.65;
    const cloth = new THREE.PlaneGeometry(clothWidth, clothDepth, 28, 28);
    cloth.rotateX(-Math.PI / 2);
    const positions = cloth.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      const edge = Math.max(0, (Math.abs(x) / (clothWidth / 2) - 0.86) / 0.14);
      const foot = Math.max(0, (z / (clothDepth / 2) - 0.88) / 0.12);
      positions.setY(i, 0.018 * Math.sin(x * 22 + z * 3) * Math.sin(z * 7)
        - 0.13 * edge * edge - 0.06 * foot * foot);
    }
    cloth.computeVertexNormals();
    duvetMat.side = THREE.DoubleSide;
    mesh(cloth, duvetMat, 0, 0.61, d * 0.16);
    box(w - 0.08, 0.065, 0.19, 0, 0.65, -d * 0.15, duvetMat, 0.025);
    box(w - 0.10, 0.035, 0.24, 0, 0.64, d * 0.30, piping, 0.015);
  } else if (sofas.has(cls) || chairs.has(cls)) {
    const dining = cls === 'chair' || cls === 'dining-chair';
    const fabric = fabricMaterial(dining ? 0xb5a68c : 0xb8b0a2);
    const cushionMat = fabricMaterial(dining ? 0xc7bba6 : 0xc8c0b1);
    const accent = fabricMaterial(0x697d74);
    const arm = dining ? 0.04 : Math.min(0.15, w * 0.13);
    const base = dining ? 0.39 : 0.23;
    legs(dining ? 0.42 : 0.16, dining ? 0.065 : 0.10);
    box(w - 0.035, dining ? 0.08 : 0.22, d - 0.04, 0, base, 0, dining ? legMat : fabric, 0.045);
    const seatY = dining ? 0.48 : 0.43;
    const backY = dining ? 0.75 : 0.72;
    if (!dining) {
      for (const side of [-1, 1]) {
        box(arm, 0.46, d, side * (w - arm) / 2, 0.45, 0, fabric, 0.065);
      }
    }
    const seats = chairs.has(cls) ? 1 : (cls === 'sofa-3' ? 3 : Math.max(2, Math.min(3, Math.round(w / 0.75))));
    const usable = w - arm * 2 - 0.02;
    for (let i = 0; i < seats; i++) {
      const x = -usable / 2 + (i + 0.5) * usable / seats;
      const sw = usable / seats - 0.018;
      const chaise = cls === 'l-sofa' && i === seats - 1;
      const sd = chaise ? d - 0.14 : (cls === 'l-sofa' ? d * 0.56 : d - 0.18);
      const sz = -d / 2 + 0.14 + sd / 2;
      box(sw, 0.045, sd, x, seatY - 0.06, sz, fabric, 0.02);
      box(sw - 0.005, dining ? 0.09 : 0.16, sd - 0.01, x, seatY, sz, cushionMat, 0.065);
      const back = box(sw, dining ? 0.42 : 0.45, 0.14, x, backY, -d / 2 + 0.10, fabric, 0.06);
      back.rotation.x = -0.10;
    }
    if (!dining && w > 1.0) {
      for (const side of [-1, 1]) {
        const pillow = box(0.30, 0.31, 0.105, side * (w / 2 - arm - 0.22), 0.67, -d / 2 + 0.30, accent, 0.05);
        pillow.rotation.z = side * 0.18;
        pillow.rotation.x = -0.15;
      }
    }
  } else if (table) {
    const height = cls.includes('coffee') ? 0.43 : cls.includes('side') ? 0.54 : 0.75;
    const timber = woodMaterial(0x9c7955);
    legs(height - 0.04, 0.08);
    box(w, 0.055, d, 0, height - 0.0275, 0, timber, 0.018);
    box(w - 0.12, 0.085, 0.035, 0, height - 0.10, -d / 2 + 0.08, legMat, 0.005);
    box(w - 0.12, 0.085, 0.035, 0, height - 0.10, d / 2 - 0.08, legMat, 0.005);
  }
  group.scale.set(width / w, 1, depth / d);
  return group;
}
