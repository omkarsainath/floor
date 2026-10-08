import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FINISH_STYLES, getFinishStyle } from '../src/design/roomDesignCatalog.js';
import { buildRoomFinish, disposeRoomFinish } from '../src/design/finishGeometry.js';
import { buildWallSegments, polygonArea } from '../src/measurements/modelMeasurements.js';
import { roomWallSurfaces } from '../src/design/roomSurfaces.js';
import { checkWalkPosition } from '../src/controls/walkCollision.js';
import { buildCeilingLight } from '../src/design/ceilingLights.js';

const room = { id: 'r', name: 'Living', height: 2.3,
  points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 4 }, { x: 0, y: 4 }] };
const wall = { id: 's', start: { x: 0, y: -0.1 }, end: { x: 4, y: -0.1 }, thickness: 0.2, height: room.height };
const surfaces = roomWallSurfaces(room, [wall]);
const build = (selection, r = room, wallSurfaces = surfaces) => buildRoomFinish({ room: r, wallSurfaces, selection, styleLookup: getFinishStyle });
const meshes = group => { const result = []; group.traverse(node => { if (node.isMesh) result.push(node); }); return result; };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);

test('all 40 styles generate finite bounded geometry without changing the measured room or walls', () => {
  const before = structuredClone({ room, surfaces });
  for (const style of FINISH_STYLES) {
    const group = build({ roomType: style.roomType, [style.category]: style.id, accentWallId: 's', ceilingDropM: 0.15 });
    const nodes = meshes(group);
    assert.ok(nodes.length > 0 && nodes.length < 1000, style.id);
    assert.ok(nodes.some(node => node.userData.category === style.category), style.id);
    for (const node of nodes) {
      assert.ok(node.geometry.attributes.position.array.every(Number.isFinite), style.id);
      assert.ok(node.geometry.attributes.normal.array.every(Number.isFinite), style.id);
      assert.equal(node.userData.roomId, 'r');
    }
    disposeRoomFinish(group); assert.equal(group.children.length, 0);
  }
  assert.deepEqual({ room, surfaces }, before);
});

test('floor shape follows a concave outline and tile UV scale follows its metre dimensions', () => {
  const group = build({ floor: 'living-floor-polished-gv' });
  const floor = meshes(group)[0], p = floor.geometry.attributes.position, uv = floor.geometry.attributes.uv;
  let area = 0;
  for (let i = 0; i < p.count; i += 3) {
    area += Math.abs((p.getX(i + 1) - p.getX(i)) * (p.getZ(i + 2) - p.getZ(i)) - (p.getZ(i + 1) - p.getZ(i)) * (p.getX(i + 2) - p.getX(i))) / 2;
  }
  near(area, polygonArea(room.points));
  for (let i = 0; i < p.count; i++) { near(uv.getX(i), p.getX(i) / 0.8); near(uv.getY(i), p.getZ(i) / 1.6); }
  assert.equal(floor.userData.walkIgnore, true);
  disposeRoomFinish(group);
});

test('hidden lowered ceiling keeps its exact footprint and nominal underside for walking', () => {
  const group = build({ ceiling: 'living-ceiling-layered-tray', ceilingDropM: 0.15 });
  group.traverse(node => { if (node.userData.type === 'ceiling') node.visible = false; });
  for (const mesh of meshes(group)) {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) assert.ok(!(p.getX(i) > 1.00001 && p.getZ(i) > 1.00001));
  }
  const check = (position, bodyHeight) => checkWalkPosition({ position, bodyHeight, bodyRadius: 0.08, obstacles: [group] });
  assert.equal(check({ x: 2, z: 2 }, 2.4).blocked, false, 'missing concave corner stays clear');
  assert.equal(check({ x: 0.2, z: 0.2 }, 2.1).blocked, false);
  assert.equal(check({ x: 0.2, z: 0.2 }, 2.2).reason, 'headroom');
  const minY = Math.min(...meshes(group).map(mesh => { mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox.min.y; }));
  near(minY, room.height - 0.15);
  disposeRoomFinish(group);
});

test('layered accent and TV panels keep actual window holes open', () => {
  const segments = buildWallSegments([wall], [{ bbox: { x1: 1, y1: -0.2, x2: 2, y2: 0 }, sillBase: 0.9, winTop: 2.1 }]);
  const group = build({ wallPanel: 'living-wallPanel-fabric-blocks', tvPanel: 'living-tvPanel-backlit-veneer', accentWallId: 's' }, room, roomWallSurfaces(room, segments));
  group.updateMatrixWorld(true);
  const ray = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1)).intersectObject(group, true);
  assert.equal(ray(1.5, 1.5).length, 0);
  assert.ok(ray(0.5, 1.5).length > 0);
  const wallFront = Math.max(...meshes(group).filter(n => n.userData.category === 'wallPanel').map(n => n.userData.finishDepthM));
  const tvBack = Math.min(...meshes(group).filter(n => n.userData.category === 'tvPanel').map(n => { const box = new THREE.Box3().setFromObject(n); return box.min.z; }));
  assert.ok(tvBack > wallFront, 'TV backdrop clears the thick upholstered wall panels');
  disposeRoomFinish(group);
});

test('bedroom cascade returns down the chosen wall, and its ceiling visibility includes the return', () => {
  const group = build({ ceiling: 'bedroom-ceiling-headboard-cascade', accentWallId: 's', ceilingDropM: 0.15 });
  const ceiling = group.children.find(n => n.userData.type === 'ceiling');
  assert.ok(ceiling);
  const returns = meshes(ceiling).filter(n => n.userData.type === 'wallFinish');
  assert.ok(returns.length); returns.forEach(n => assert.equal(n.userData.parentWallId, 's'));
  ceiling.visible = false;
  assert.equal(returns[0].parent.parent, ceiling);
  disposeRoomFinish(group);
});

test('resource disposal is isolated and accent colour does not recolour the marble base', () => {
  const selection = { floor: 'living-floor-polished-gv', wallPanel: 'living-wallPanel-charcoal-louvers', color: '#ff0000', accentWallId: 's' };
  const first = build(selection), second = build(selection);
  let disposed = 0;
  meshes(second).forEach(n => n.material.addEventListener('dispose', () => disposed++));
  const neutral = build({ floor: selection.floor });
  assert.deepEqual(meshes(first)[0].material.map.image.data, meshes(neutral)[0].material.map.image.data);
  disposeRoomFinish(first); assert.equal(disposed, 0);
  disposeRoomFinish(second); assert.ok(disposed > 0); disposeRoomFinish(neutral);
});

test('disposing a room finish releases each fixture light shadow resource exactly once', () => {
  const group = build({});
  let disposed = 0;
  for (const type of ['downlight', 'pendant']) {
    const fixture = buildCeilingLight({ roomId: room.id, ceilingY: room.height,
      placement: { id: type, type, x: 0.5, z: 0.5 } });
    fixture.traverse(node => {
      if (!node.isLight) return;
      // Future shadow activation must remain safe through the room controller's
      // shared disposal path, not only through disposeCeilingLight directly.
      node.shadow.map = new THREE.WebGLRenderTarget(4, 4);
      node.shadow.mapPass = new THREE.WebGLRenderTarget(4, 4);
      node.shadow.map.addEventListener('dispose', () => disposed++);
      node.shadow.mapPass.addEventListener('dispose', () => disposed++);
    });
    group.add(fixture);
  }
  disposeRoomFinish(group);
  assert.equal(disposed, 4);
  assert.equal(group.children.length, 0);
  disposeRoomFinish(group);
  assert.equal(disposed, 4, 'an already emptied room has no light resources left to dispose twice');
});
