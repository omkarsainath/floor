import { decorateReferenceCeiling } from './referenceCeilings.js';
import { addCeilingIllumination } from './ceilingIllumination.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isProfileCeiling, normalizeCeilingSettings } from './ceilingTypes.js';

const EPS = 1e-8;
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const rect = (x0, z0, x1, z1) => [{ x: x0, y: z0 }, { x: x1, y: z0 }, { x: x1, y: z1 }, { x: x0, y: z1 }];
const triangles = polygon => THREE.ShapeUtils.triangulateShape(polygon.map(p => new THREE.Vector2(p.x, p.y)), [])
  .map(indices => indices.map(i => polygon[i]));

// Intersect a polygon with a counter-clockwise convex design cell.
// Clipping, rather than a bounding-box slab, preserves concave room footprints.
function clip(subject, region) {
  let result = subject;
  for (let i = 0; i < region.length && result.length; i++) {
    const a = region[i], b = region[(i + 1) % region.length], input = result;
    result = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length];
      const dp = cross(a, b, p), dq = cross(a, b, q);
      if (dp >= -EPS) result.push(p);
      if ((dp >= -EPS) !== (dq >= -EPS)) {
        const t = dp / (dp - dq);
        result.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
  return result;
}

/** Configured underside heights in metres; a clipped room may omit a peak. */
export function getCeilingHeights({ roomHeight = 3, style, selection = {} }) {
  const settings = normalizeCeilingSettings(selection);
  const height = Number.isFinite(roomHeight) && roomHeight > 0 ? roomHeight : 3;
  const dropped = height - settings.ceilingDropM;
  if (style?.ceilingType === 'reference') return { minHeightM: dropped, maxHeightM: height - 0.02 };
  if (style?.raised) return { minHeightM: dropped - settings.ceilingRiseM, maxHeightM: dropped };
  if (['coffered', 'tray', 'false-drop'].includes(style?.ceilingType)) return { minHeightM: dropped, maxHeightM: height - 0.035 };
  return { minHeightM: dropped, maxHeightM: dropped };
}

function woodTexture() {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const grain = 0.94 + 0.04 * Math.sin(x * 0.62 + Math.sin(z * 0.085)) + 0.025 * Math.sin(x * 2.8 + z * 0.025);
    const value = Math.round(255 * grain), i = (z * size + x) * 4;
    pixels.set([value, value, value, 255], i);
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

// A closed, thin finish surface. Only its perimeter receives side faces; grid
// boundaries inside a curved surface must not create visible internal ribs.
function surfaceGeometry(polygons, heightAt, thickness, boundary, smooth = false) {
  const positions = [], normals = [], uv = [];
  const push = (p, h, n) => { positions.push(p.x, h, p.y); normals.push(n.x, n.y, n.z); uv.push(p.x, p.y); };
  for (const polygon of polygons) for (const face of triangles(polygon)) {
    if (Math.abs(cross(...face)) < EPS) continue;
    const points = cross(...face) > 0 ? face : [...face].reverse();
    const center = { x: points.reduce((s, p) => s + p.x, 0) / 3, y: points.reduce((s, p) => s + p.y, 0) / 3 };
    const vertices = points.map(p => new THREE.Vector3(p.x, heightAt(p.x, p.y), p.y));
    const flatNormal = new THREE.Vector3().subVectors(vertices[1], vertices[0]).cross(new THREE.Vector3().subVectors(vertices[2], vertices[0])).normalize();
    const normalAt = p => {
      if (!smooth || vertices.every(v => Math.abs(v.y - vertices[0].y) < EPS)) return flatNormal;
      // Sample just inside this face at a ridge so its two sides retain their
      // own normals, while the arches shade smoothly between tessellation cells.
      const x = p.x + (center.x - p.x) * 1e-4, z = p.y + (center.y - p.y) * 1e-4, e = 1e-5;
      return new THREE.Vector3((heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), -1,
        (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e)).normalize();
    };
    for (const p of points) push(p, heightAt(p.x, p.y), normalAt(p));
    for (const p of [...points].reverse()) push(p, heightAt(p.x, p.y) + thickness, normalAt(p).clone().negate());
  }
  for (const polygon of boundary) for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], ha = heightAt(a.x, a.y), hb = heightAt(b.x, b.y);
    const normal = new THREE.Vector3(b.y - a.y, 0, a.x - b.x).normalize();
    for (const [p, h] of [[a, ha], [a, ha + thickness], [b, hb + thickness], [a, ha], [b, hb + thickness], [b, hb]]) push(p, h, normal);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Build any of the 12 reference ceilings using the actual room outline. */
export function buildCeilingProfile({ room, style, selection = {} }) {
  if (!isProfileCeiling(style)) throw new TypeError('Unknown ceiling type.');
  const source = room?.points || room?.polygon;
  if (!Array.isArray(source) || source.length < 3 || source.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))) throw new TypeError('A finite room outline is required.');
  const polygon = source.map(p => ({ x: p.x, y: p.y }));
  if (Math.hypot(polygon[0].x - polygon.at(-1).x, polygon[0].y - polygon.at(-1).y) < EPS) polygon.pop();
  const roomTriangles = triangles(polygon);
  if (!roomTriangles.length) throw new TypeError('A non-empty room outline is required.');
  const settings = normalizeCeilingSettings(selection), height = Number.isFinite(room.height) && room.height > 0 ? room.height : 3;
  const range = getCeilingHeights({ roomHeight: height, style, selection: settings });
  if (range.minHeightM <= 0.1) throw new RangeError('Reduce the ceiling drop or rise to leave positive room height.');
  const group = new THREE.Group();
  group.name = style.label;
  group.userData = { type: 'ceiling', category: 'ceiling', isRoomFinish: true, roomId: room.id,
    styleId: style.id, ceilingType: style.ceilingType, ...range };
  const material = new THREE.MeshStandardMaterial({ color: style.color, roughness: style.roughness, metalness: style.metalness, side: THREE.DoubleSide });
  const accent = material.clone(); accent.color.set(selection.color || style.accentColor);
  const materials = [material, accent];
  const minX = Math.min(...polygon.map(p => p.x)), maxX = Math.max(...polygon.map(p => p.x));
  const minZ = Math.min(...polygon.map(p => p.y)), maxZ = Math.max(...polygon.map(p => p.y));
  const width = maxX - minX, depth = maxZ - minZ, peak = height - settings.ceilingDropM;
  if (width <= EPS || depth <= EPS) { materials.forEach(m => m.dispose()); throw new RangeError('The room must have positive width and depth.'); }
  const addSurface = (polygons, heightAt, thickness, boundary = polygons, mat = material, smooth = false) => {
    if (!polygons.length) return;
    const geometry = surfaceGeometry(polygons, heightAt, thickness, boundary, smooth);
    if (!geometry.attributes.position.count) { geometry.dispose(); return; }
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { ...group.userData, walkSurfaceTriangles: true };
    group.add(mesh);
  };
  const patch = (region, y, mat = material, thickness = 0.018) => {
    const polygons = region ? roomTriangles.map(t => clip(t, region)).filter(p => p.length >= 3) : [polygon];
    addSurface(polygons, () => y, thickness, polygons, mat);
  };
  if (style.ceilingType === 'reference') {
    patch(null, height - .02);
    const light = new THREE.MeshStandardMaterial({ color: style.lightColor, emissive: style.lightColor,
      emissiveIntensity: 3.5, roughness: .3, side: THREE.DoubleSide });
    materials.push(light);
    decorateReferenceCeiling({ style, patch: (region,y,mat,thickness=.018) => {
      const underside = Math.max(peak, Math.min(height-.025,y));
      patch(region,underside,mat,Math.min(thickness,height-underside-.002));
    }, material, accent, light, minX, minZ, width, depth, peak, drop: settings.ceilingDropM });
  } else if (style.raised) {
    const base = range.minHeightM;
    const heightAt = (x, z) => {
      const u = Math.max(-1, Math.min(1, (x - minX) / width * 2 - 1));
      const v = Math.max(-1, Math.min(1, (z - minZ) / depth * 2 - 1));
      const a = settings.ceilingAxis === 'z' ? v : u;
      const arc = value => Math.sqrt(Math.max(0, 1 - value * value));
      let fraction;
      switch (style.ceilingType) {
        case 'cathedral': fraction = 1 - Math.abs(a); break;
        case 'vaulted': fraction = Math.pow(1 - Math.abs(a), 0.7); break;
        case 'barrel-vault': fraction = arc(a); break;
        case 'shed': fraction = (a + 1) / 2; break;
        case 'dome': {
          // Follow the polygonal rim exactly, including vertices introduced by
          // room clipping, so the dome meets its flat surround without spikes.
          const sector = Math.PI * 2 / 64;
          const angle = ((Math.atan2(v, u) % sector) + sector) % sector;
          const rim = Math.cos(sector / 2) / Math.cos(angle - sector / 2);
          fraction = Math.sqrt(Math.max(0, 1 - (u * u + v * v) / (rim * rim)));
          break;
        }
        case 'groin-vault': fraction = Math.max(arc(u), arc(v)); break;
        default: fraction = 0;
      }
      return base + settings.ceilingRiseM * fraction;
    };
    // An even grid includes the central ridge exactly. Geometry cost is bounded
    // independently of image resolution; 32 cells span each bounding-box axis.
    const count = 32, cells = [];
    const addCell = region => {
      for (const triangle of roomTriangles) {
        const clipped = clip(region, cross(...triangle) > 0 ? triangle : [...triangle].reverse());
        if (clipped.length >= 3) cells.push(clipped);
      }
    };
    if (style.ceilingType === 'dome') {
      // Rings put vertices on the actual elliptical rim. Sampling a circle on
      // a square grid produces saw-tooth edges and bad normals near its spring.
      const at = (angle, radius) => ({ x: minX + width * (1 + Math.cos(angle) * radius) / 2,
        y: minZ + depth * (1 + Math.sin(angle) * radius) / 2 });
      const sectors = 64, rings = 24;
      for (let j = 0; j < sectors; j++) {
        const a = j * Math.PI * 2 / sectors, b = (j + 1) * Math.PI * 2 / sectors;
        for (let k = 0; k < rings; k++) {
          const inner = Math.sin(k / rings * Math.PI / 2), outer = Math.sin((k + 1) / rings * Math.PI / 2);
          const region = k === 0 ? [at(a, 0), at(a, outer), at(b, outer)]
            : [at(a, inner), at(a, outer), at(b, outer), at(b, inner)];
          addCell(region);
        }
        // Fill only the flat area between the elliptical dome and room bounds.
        const outerA = 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
        const outerB = 1 / Math.max(Math.abs(Math.cos(b)), Math.abs(Math.sin(b)));
        addCell([at(a, 1), at(a, outerA), at(b, outerB), at(b, 1)]);
      }
    } else for (let ix = 0; ix < count; ix++) for (let iz = 0; iz < count; iz++) {
      const region = rect(minX + width * ix / count, minZ + depth * iz / count, minX + width * (ix + 1) / count, minZ + depth * (iz + 1) / count);
      if (style.ceilingType === 'groin-vault' && ix === iz) {
        addCell([region[0], region[1], region[2]]); addCell([region[0], region[2], region[3]]);
      } else if (style.ceilingType === 'groin-vault' && ix + iz === count - 1) {
        addCell([region[0], region[1], region[3]]); addCell([region[1], region[2], region[3]]);
      } else addCell(region);
    }
    const edge = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      // Align perimeter vertices with the grid to avoid gaps on diagonal edges.
      const cuts = new Set([0]);
      for (let n = 1; n < count; n++) {
        for (const t of [(minX + width * n / count - a.x) / (b.x - a.x), (minZ + depth * n / count - a.y) / (b.y - a.y)]) if (t > EPS && t < 1 - EPS) cuts.add(t);
      }
      for (const t of [...cuts].sort((a, b) => a - b)) edge.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    addSurface(cells, heightAt, 0.02, [edge], material, true);
  } else if (style.ceilingType === 'coffered') {
    patch(null, height - 0.035);
    const nx = Math.max(2, Math.min(16, Math.round(width / 0.9))), nz = Math.max(2, Math.min(16, Math.round(depth / 0.9)));
    const beam = Math.min(0.12, width / nx / 4, depth / nz / 4);
    for (let i = 0; i <= nx; i++) patch(rect(minX + width * i / nx - beam / 2, minZ, minX + width * i / nx + beam / 2, maxZ), peak, material, settings.ceilingDropM - 0.035);
    for (let j = 0; j <= nz; j++) {
      const z = minZ + depth * j / nz;
      // Segments stop at the other beams instead of overlapping at each cross.
      for (let i = 0; i < nx; i++) patch(rect(minX + width * i / nx + beam / 2, z - beam / 2, minX + width * (i + 1) / nx - beam / 2, z + beam / 2), peak, material, settings.ceilingDropM - 0.035);
    }
  } else if (style.ceilingType === 'tray') {
    patch(null, height - 0.035);
    const band = Math.min(0.42, width / 5, depth / 5);
    const area = polygon.reduce((s, p, i) => s + p.x * polygon[(i + 1) % polygon.length].y - polygon[(i + 1) % polygon.length].x * p.y, 0);
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < EPS) continue;
      const nx = -(b.y - a.y) / len * Math.sign(area), nz = (b.x - a.x) / len * Math.sign(area);
      // Clip accepts a positive winding; the room itself can use either order.
      const region = [a, b, { x: b.x + nx * band, y: b.y + nz * band }, { x: a.x + nx * band, y: a.y + nz * band }];
      if (area < 0) region.reverse();
      patch(region, peak, material, settings.ceilingDropM - 0.035);
    }
  } else if (style.ceilingType === 'false-drop') {
    patch(null, height - 0.035);
    const inset = Math.min(0.045, width / 10, depth / 10);
    // A narrow perimeter reveal distinguishes the secondary dropped plane.
    patch(rect(minX + inset, minZ + inset, maxX - inset, maxZ - inset), peak, material, 0.025);
  } else if (style.ceilingType === 'suspended') {
    // Grid and panels have different elevations; no coplanar overlays.
    patch(null, peak + 0.004, accent, 0.014);
    const nx = Math.max(1, Math.min(24, Math.ceil(width / 0.6))), nz = Math.max(1, Math.min(24, Math.ceil(depth / 0.6)));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) patch(rect(minX + width * i / nx + 0.012, minZ + depth * j / nz + 0.012, minX + width * (i + 1) / nx - 0.012, minZ + depth * (j + 1) / nz - 0.012), peak, material, 0.004);
  } else if (style.ceilingType === 'wooden-panel') {
    patch(null, peak + 0.008, accent, 0.01);
    material.map = woodTexture();
    const alongX = settings.ceilingAxis === 'x', span = alongX ? width : depth, count = Math.max(1, Math.min(80, Math.ceil(span / 0.24))), step = span / count;
    for (let i = 0; i < count; i++) patch(alongX ? rect(minX + i * step + 0.003, minZ, minX + (i + 1) * step - 0.003, maxZ)
      : rect(minX, minZ + i * step + 0.003, maxX, minZ + (i + 1) * step - 0.003), peak, material, 0.008);
  } else {
    patch(null, peak);
  }
  if (style.ceilingType === 'reference') {
    // Repeated rings and lattice cells share three materials: batch them so
    // a decorated room does not require hundreds of draw calls per frame.
    for (const mat of materials) {
      const pieces = group.children.filter(mesh => mesh.material === mat);
      if (pieces.length < 2) continue;
      const geometry = mergeGeometries(pieces.map(mesh => mesh.geometry));
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = { ...group.userData, walkSurfaceTriangles: true };
      for (const piece of pieces) { group.remove(piece); piece.geometry.dispose(); }
      group.add(mesh);
    }
  }
  for (const mat of materials) if (!group.children.some(mesh => mesh.material === mat)) { mat.map?.dispose(); mat.dispose(); }
  // Actual generated bounds support diagnostics for an irregular clipped room.
  const bounds = new THREE.Box3().setFromObject(group);
  group.userData.actualMinHeightM = bounds.min.y;
  if (style.ceilingType === 'reference') addCeilingIllumination(group, { peak, color: style.lightColor, roomId: room.id, polygon });
  return group;
}
