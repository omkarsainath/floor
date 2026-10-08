import * as THREE from 'three';

// A standing cylinder against transformed mesh bounds, or exact height-clipped
// triangles for generated ceiling profiles. Test components separately so an
// open door is not a solid group-sized box. This is clearance feedback, not a
// human motion simulation.
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function hull(points) {
  points.sort((a, b) => a.x - b.x || a.z - b.z);
  const half = points => {
    const out = [];
    for (const p of points) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop();
      out.push(p);
    }
    return out;
  };
  const lower = half(points), upper = half([...points].reverse());
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function intersects(point, polygon, radius) {
  let inside = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if ((a.z > point.z) !== (b.z > point.z)
      && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t) < radius - 1e-7) return true;
  }
  return inside;
}

// Ceiling meshes are static between edits, so reuse their projected occupied
// regions while the person moves. Geometry/height/transform edits invalidate
// the cache; WeakMap entries disappear when a preview is disposed/replaced.
const surfaceCache = new WeakMap();
const surfaceBoundsCache = new WeakMap();
function refreshSurfaceBounds(geometry) {
  const position = geometry?.getAttribute('position');
  if (!position) return;
  // Three does not update boundingBox when positions.needsUpdate is set.
  // Refresh before broad-phase height checks, including the first encounter
  // with an existing (possibly stale) bounding box.
  const version = position.isInterleavedBufferAttribute ? position.data.version : position.version;
  const previous = surfaceBoundsCache.get(geometry);
  if (!geometry.boundingBox || !previous || previous.position !== position || previous.version !== version) {
    geometry.computeBoundingBox();
    surfaceBoundsCache.set(geometry, { position, version });
  }
}
function clipHeight(polygon, height, keepAbove) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = keepAbove ? a.y - height : height - a.y;
    const db = keepAbove ? b.y - height : height - b.y;
    if (da >= 0) result.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      result.push({ x: a.x + (b.x - a.x) * t, y: height, z: a.z + (b.z - a.z) * t });
    }
  }
  return result;
}
function surfacePolygons(mesh, bottom, top) {
  const geometry = mesh.geometry, position = geometry.getAttribute('position'), index = geometry.getIndex();
  if (!position || position.itemSize < 3) return [];
  const positionVersion = position.isInterleavedBufferAttribute ? position.data.version : position.version;
  const matrix = mesh.matrixWorld.elements, range = geometry.drawRange;
  const previous = surfaceCache.get(mesh);
  if (previous && previous.geometry === geometry && previous.position === position && previous.index === index
    && previous.positionVersion === positionVersion && previous.indexVersion === index?.version
    && previous.bottom === bottom && previous.top === top && previous.start === range.start && previous.count === range.count
    && previous.matrix.every((value, i) => value === matrix[i])) return previous.polygons;
  const polygons = [], total = index ? index.count : position.count;
  const end = Math.min(total, range.start + range.count);
  for (let offset = Math.max(0, range.start); offset + 2 < end; offset += 3) {
    const triangle = [];
    for (let corner = 0; corner < 3; corner++) {
      const vertex = index ? index.getX(offset + corner) : offset + corner;
      triangle.push(new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(mesh.matrixWorld));
    }
    if (triangle.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) continue;
    if (Math.min(...triangle.map(p => p.y)) >= top || Math.max(...triangle.map(p => p.y)) <= bottom) continue;
    const clipped = clipHeight(clipHeight(triangle, bottom, true), top, false);
    // A vertical face projects to an edge; retain it so a person's radius
    // cannot pass through a vaulted ceiling's low edge or a dropped fascia.
    if (clipped.length >= 2) polygons.push(clipped.map(p => ({ x: p.x, z: p.z })));
  }
  surfaceCache.set(mesh, { geometry, position, index, positionVersion, indexVersion: index?.version,
    bottom, top, start: range.start, count: range.count, matrix: [...matrix], polygons });
  return polygons;
}
function colliders({ obstacles = [], floorY = 0, bodyHeight = 1.75, includeCeilings = true }) {
  const result = [], seen = new Set();
  for (const root of Array.isArray(obstacles) ? obstacles : [obstacles]) {
    if (!root) continue;
    root.updateWorldMatrix(true, true);
    root.traverse(mesh => {
      if (!mesh.isMesh || seen.has(mesh)) return;
      seen.add(mesh);
      let wall = false, ceiling = false, hidden = false, helper = false;
      for (let parent = mesh; parent; parent = parent.parent) {
        wall ||= parent.userData.isWall || parent.userData.type === 'wall';
        ceiling ||= parent.userData.type === 'ceiling';
        hidden ||= !parent.visible;
        helper ||= parent.userData.isHelper || parent.userData.walkIgnore;
      }
      if (helper || (hidden && !(ceiling && includeCeilings)) || (ceiling && !includeCeilings)) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!materials.some(m => m && m.visible !== false && !(m.transparent && m.opacity <= 0.001))) return;
      const geometry = mesh.geometry;
      if (mesh.userData.walkSurfaceTriangles === true) refreshSurfaceBounds(geometry);
      if (!geometry?.boundingBox) geometry?.computeBoundingBox();
      const box = geometry?.boundingBox;
      if (!box || box.isEmpty()) return;
      const corners = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        corners.push(new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld));
      }
      const minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
      if (maxY <= floorY + 0.025 || minY >= floorY + bodyHeight - 1e-6) return;
      // Generated ceiling patches expose their actual world-space polygons.
      // Using the bounding rectangle here would block the missing part of an
      // L-shaped room or the gap between two separate ceiling strips.
      const supplied = mesh.userData.walkFootprints || (mesh.userData.walkFootprint ? [mesh.userData.walkFootprint] : null);
      const polygons = mesh.userData.walkSurfaceTriangles === true
        ? surfacePolygons(mesh, floorY + 0.025, floorY + bodyHeight - 1e-6)
        : Array.isArray(supplied) && supplied.length && supplied.every(p => Array.isArray(p) && p.length >= 3
          && p.every(v => Number.isFinite(v.x) && Number.isFinite(v.z))) ? supplied : [hull(corners)];
      // A high portion of a sloped roof may be inside its global bounding box
      // while entirely above the person. Never fall back to that box here.
      if (!polygons.length) return;
      result.push({ mesh, polygons, minX: Math.min(...corners.map(p => p.x)),
        maxX: Math.max(...corners.map(p => p.x)), minZ: Math.min(...corners.map(p => p.z)), maxZ: Math.max(...corners.map(p => p.z)),
        reason: ceiling || minY > floorY + 0.6 ? 'headroom' : wall ? 'wall' : 'object' });
    });
  }
  return result;
}
function validate({ position, bodyHeight = 1.75, bodyRadius = 0.23, floorY = 0 }) {
  if (![position?.x, position?.z, bodyHeight, bodyRadius, floorY].every(Number.isFinite) || bodyHeight <= 0 || bodyRadius <= 0) {
    throw new TypeError('Walking requires finite coordinates and positive body dimensions in metres.');
  }
}
function hitAt(position, candidates, radius) {
  return candidates.find(c => position.x + radius > c.minX && position.x - radius < c.maxX
    && position.z + radius > c.minZ && position.z - radius < c.maxZ && c.polygons.some(p => intersects(position, p, radius)));
}
export function checkWalkPosition(options) {
  validate(options);
  const hit = hitAt(options.position, colliders(options), options.bodyRadius ?? 0.23);
  return { position: { ...options.position }, blocked: !!hit, reason: hit?.reason || null, obstacle: hit?.mesh || null };
}
export function resolveWalkMovement(options) {
  validate(options);
  const { delta, bodyRadius = 0.23 } = options;
  if (![delta?.x, delta?.z].every(Number.isFinite)) throw new TypeError('Invalid walking displacement.');
  const candidates = colliders(options);
  const position = { ...options.position };
  let hit = hitAt(position, candidates, bodyRadius);
  // Never silently teleport out of an invalid start or through a thin wall.
  if (hit) return { position, blocked: true, reason: hit.reason, obstacle: hit.mesh };
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / Math.min(0.08, bodyRadius / 2)));
  for (let i = 0; i < steps; i++) {
    const next = { x: position.x + delta.x / steps, z: position.z + delta.z / steps };
    hit = hitAt(next, candidates, bodyRadius);
    if (hit) break;
    Object.assign(position, next);
  }
  return { position, blocked: !!hit, reason: hit?.reason || null, obstacle: hit?.mesh || null };
}
