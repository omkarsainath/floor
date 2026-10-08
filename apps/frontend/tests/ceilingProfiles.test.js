import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { CEILING_TYPES, getCeilingType } from '../src/design/ceilingTypes.js';
import { buildCeilingProfile, getCeilingHeights } from '../src/design/ceilingProfiles.js';
import { getFinishStyle, normalizeRoomDesign } from '../src/design/roomDesignCatalog.js';
import { createRoomDesignController } from '../src/design/roomDesignController.js';
import { disposeRoomFinish } from '../src/design/finishGeometry.js';
import { checkWalkPosition } from '../src/controls/walkCollision.js';
import { persistLayout } from '../src/state/projectPersistence.js';
import { parseLayout } from '../src/loaders/jsonLoader.js';
import { createCeiling } from '../src/generators/ceiling.js';

const rectangle = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
const lShape = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 1.5 }, { x: 2, y: 1.5 }, { x: 2, y: 4 }, { x: 0, y: 4 }];
const roomFor = (points = rectangle, height = 2.8) => ({ id: 'living', name: 'Living Room', height, points: structuredClone(points), boundary_source: 'manual' });
const settings = { ceilingDropM: 0.15, ceilingRiseM: 1, ceilingAxis: 'x' };
const approx = (value, expected, tolerance = 1e-5) => assert.ok(Math.abs(value - expected) <= tolerance, `${value} != ${expected}`);
const create = (type, selection = settings, room = roomFor()) => buildCeilingProfile({ room, style: getCeilingType(`ceiling-${type}`), selection });

function contains(polygon, point) {
  let inside = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t) < 3e-5) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < a.x + (point.y - a.y) * dx / dy) inside = !inside;
  }
  return inside;
}

function triangles(group) {
  group.updateWorldMatrix(true, true);
  const all = [];
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    assert.equal(mesh.userData.walkSurfaceTriangles, true, 'ceiling collision must use its real surface instead of its bounding box');
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex();
    assert.ok(position?.count > 0);
    const count = index?.count ?? position.count;
    for (let offset = 0; offset + 2 < count; offset += 3) {
      all.push([0, 1, 2].map(corner => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(offset + corner) : offset + corner).applyMatrix4(mesh.matrixWorld)));
    }
  });
  assert.ok(all.length > 0, 'each requested ceiling needs visible geometry');
  return all;
}

function ceilingAt(group, x, z) {
  group.updateWorldMatrix(true, true);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 0, z), new THREE.Vector3(0, 1, 0), 0, 10);
  const hit = ray.intersectObject(group, true)[0];
  assert.ok(hit, `no ceiling over (${x}, ${z})`);
  return hit.point.y;
}

test('reported ceiling heights distinguish raised profiles, recessed fields, and level ceilings', () => {
  for (const style of CEILING_TYPES) {
    const heights = getCeilingHeights({ roomHeight: 2.8, style, selection: settings });
    if (style.raised) {
      approx(heights.minHeightM, 1.65);
      approx(heights.maxHeightM, 2.65);
    } else if (['coffered', 'tray', 'false-drop'].includes(style.ceilingType)) {
      approx(heights.minHeightM, 2.65);
      approx(heights.maxHeightM, 2.765);
    } else {
      approx(heights.minHeightM, 2.65);
      approx(heights.maxHeightM, 2.65);
    }
  }
});

test('all 12 ceilings have finite geometry clipped to rectangular and concave room polygons', () => {
  for (const points of [rectangle, lShape]) for (const style of CEILING_TYPES) {
    const room = roomFor(points), snapshot = structuredClone(room);
    const group = buildCeilingProfile({ room, style, selection: settings });
    assert.equal(group.userData.type, 'ceiling');
    assert.equal(group.userData.isRoomFinish, true);
    const levels = getCeilingHeights({ roomHeight: room.height, style, selection: settings });
    for (const triangle of triangles(group)) {
      for (const p of triangle) {
        assert.ok([p.x, p.y, p.z].every(Number.isFinite), style.id);
        assert.ok(p.y >= levels.minHeightM - 0.06 && p.y <= room.height + 0.01, `${style.id}: height ${p.y}`);
        assert.ok(contains(points, { x: p.x, y: p.z }), `${style.id}: vertex outside room (${p.x}, ${p.z})`);
      }
      const centroid = triangle.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / 3);
      assert.ok(contains(points, { x: centroid.x, y: centroid.z }), `${style.id}: triangle fills a concave corner`);
      for (let i = 0; i < 3; i++) {
        const midpoint = triangle[i].clone().add(triangle[(i + 1) % 3]).multiplyScalar(0.5);
        assert.ok(contains(points, { x: midpoint.x, y: midpoint.z }), `${style.id}: triangle crosses room boundary`);
      }
    }
    assert.deepEqual(room, snapshot, `${style.id}: the finish must not edit source room dimensions`);
    disposeRoomFinish(group);
  }
});

test('each ceiling type produces its own geometry rather than a renamed identical flat surface', () => {
  const hashes = new Map();
  for (const style of CEILING_TYPES) {
    const group = buildCeilingProfile({ room: roomFor(), style, selection: settings });
    const hash = createHash('sha256');
    const geometry = triangles(group).map(triangle => triangle.map(p => [p.x, p.y, p.z].map(value => Math.round(value * 1e5))).sort()).sort();
    hash.update(JSON.stringify(geometry));
    const signature = hash.digest('hex');
    assert.equal(hashes.has(signature), false, `${style.id} duplicates ${hashes.get(signature)}`);
    hashes.set(signature, style.id);
    disposeRoomFinish(group);
  }
});

test('cathedral geometry has a higher ridge and lower sides without raising the original room height', () => {
  const room = roomFor(), group = create('cathedral', settings, room);
  const center = ceilingAt(group, 3, 2), left = ceilingAt(group, 0.15, 2), right = ceilingAt(group, 5.85, 2);
  approx(center, 2.65, 0.015);
  approx(left, right, 0.015);
  assert.ok(center - left > 0.8);
  approx(ceilingAt(group, 3, 0.3), center, 0.015);
  assert.equal(room.height, 2.8);
  disposeRoomFinish(group);
});

test('shed direction changes the axis of its physical slope', () => {
  const acrossX = create('shed', { ...settings, ceilingAxis: 'x' });
  const acrossZ = create('shed', { ...settings, ceilingAxis: 'z' });
  assert.ok(Math.abs(ceilingAt(acrossX, 0.3, 2) - ceilingAt(acrossX, 5.7, 2)) > 0.8);
  approx(ceilingAt(acrossX, 3, 0.3), ceilingAt(acrossX, 3, 3.7), 0.015);
  assert.ok(Math.abs(ceilingAt(acrossZ, 3, 0.3) - ceilingAt(acrossZ, 3, 3.7)) > 0.8);
  approx(ceilingAt(acrossZ, 0.3, 2), ceilingAt(acrossZ, 5.7, 2), 0.015);
  disposeRoomFinish(acrossX); disposeRoomFinish(acrossZ);
});

test('barrel vault and generic vaulted ceilings retain different visible height profiles', () => {
  const barrel = create('barrel-vault'), vaulted = create('vaulted');
  const samples = [[0.3, 2], [0.9, 2], [1.5, 2], [2.1, 2], [3, 0.5], [3, 2]];
  assert.ok(samples.some(([x, z]) => Math.abs(ceilingAt(barrel, x, z) - ceilingAt(vaulted, x, z)) > 0.015), 'vault types should not share an identical profile');
  assert.ok(ceilingAt(barrel, 3, 2) > ceilingAt(barrel, 0.3, 2));
  disposeRoomFinish(barrel); disposeRoomFinish(vaulted);
});

test('a 175 cm person clears a high ridge but is blocked by the low side, even with ceilings hidden', () => {
  const ceiling = create('cathedral');
  const check = position => checkWalkPosition({ position, obstacles: [ceiling], bodyHeight: 1.75, bodyRadius: 0.1 });
  assert.equal(check({ x: 3, z: 2 }).blocked, false);
  assert.equal(check({ x: 0.15, z: 2 }).reason, 'headroom');
  ceiling.visible = false;
  assert.equal(check({ x: 3, z: 2 }).blocked, false);
  assert.equal(check({ x: 0.15, z: 2 }).reason, 'headroom');
  disposeRoomFinish(ceiling);

  const concave = create('flat', { ceilingDropM: 0.15 }, roomFor(lShape, 1.8));
  assert.equal(checkWalkPosition({ position: { x: 4, z: 3 }, obstacles: [concave], bodyHeight: 1.75 }).blocked, false);
  assert.equal(checkWalkPosition({ position: { x: 1, z: 3 }, obstacles: [concave], bodyHeight: 1.75 }).reason, 'headroom');
  disposeRoomFinish(concave);
});

test('profile settings survive apply, project persistence and reload without changing measurement targets', () => {
  const room = roomFor();
  const layout = { units: 'm', rooms: [room], walls: [], objects: [],
    calibration: { status: 'confirmed' }, dimension_constraints: [{ id: 'area', type: 'area', room_id: room.id, target_m2: 24 }] };
  const targetSnapshot = structuredClone(layout.dimension_constraints);
  const pointsSnapshot = structuredClone(room.points);
  const selection = normalizeRoomDesign({ roomType: 'living', ceiling: 'ceiling-cathedral', ceilingDropM: 0.22, ceilingRiseM: 0.9, ceilingAxis: 'z' });
  assert.equal(getFinishStyle(selection.ceiling), getCeilingType('ceiling-cathedral'));
  const data = new Map(), storage = { setItem(key, value) { data.set(key, value); } };
  const controller = createRoomDesignController({ scene: new THREE.Scene(), getLayout: () => layout, getWallSegments: () => [], save: value => persistLayout(value, storage) });
  assert.equal(controller.apply(room.id, selection).ok, true);
  assert.deepEqual(room.design, selection);
  assert.deepEqual(room.points, pointsSnapshot);
  assert.equal(room.height, 2.8);
  assert.deepEqual(layout.dimension_constraints, targetSnapshot);
  const reloaded = parseLayout(JSON.parse(data.get('preciseFloorplan')));
  assert.deepEqual(reloaded.rooms[0].design, selection);
  const restored = createRoomDesignController({ scene: new THREE.Scene(), getLayout: () => reloaded, getWallSegments: () => [] });
  restored.rebuild();
  const group = restored.getGroup(room.id);
  assert.ok(group);
  approx(ceilingAt(group, 3, 2), 2.58, 0.015);
  assert.ok(ceilingAt(group, 3, 0.15) < 1.8);
  assert.deepEqual(reloaded.dimension_constraints, targetSnapshot);
  controller.destroy(); restored.destroy();
});

test('base ceiling slabs respect room heights and do not fill a concave void or bridge separate rooms', () => {
  const low = roomFor(lShape, 1.8), high = roomFor(rectangle.map(p => ({ x: p.x + 10, y: p.y })), 3.2);
  high.id = 'high';
  const source = structuredClone([low, high]), ceiling = createCeiling([low, high]);
  const check = position => checkWalkPosition({ position, obstacles: [ceiling], bodyHeight: 1.9 });
  assert.equal(check({ x: 1, z: 3 }).reason, 'headroom');
  assert.equal(check({ x: 4, z: 3 }).blocked, false);
  assert.equal(check({ x: 8, z: 2 }).blocked, false);
  assert.equal(check({ x: 12, z: 2 }).blocked, false);
  approx(ceilingAt(ceiling, 12, 2), 3.175);
  assert.deepEqual([low, high], source);
  ceiling.traverse(mesh => { mesh.geometry?.dispose(); mesh.material?.dispose(); });
});

test('an impossible drop and rise cannot save or replace an existing room design', () => {
  const room = roomFor(rectangle, 2), layout = { rooms: [room], walls: [] };
  const controller = createRoomDesignController({ scene: new THREE.Scene(), getLayout: () => layout, getWallSegments: () => [], save: () => true });
  assert.equal(controller.apply(room.id, { roomType: 'living', ceiling: 'ceiling-flat' }).ok, true);
  const previous = room.design, group = controller.getGroup(room.id);
  const result = controller.apply(room.id, { roomType: 'living', ceiling: 'ceiling-dome', ceilingDropM: 0.3, ceilingRiseM: 1.8 });
  assert.equal(result.ok, false);
  assert.match(result.message, /Reduce the ceiling drop or rise/);
  assert.equal(room.design, previous);
  assert.equal(controller.getGroup(room.id), group);
  controller.destroy();
});
