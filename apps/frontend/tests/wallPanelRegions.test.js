import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeWallPanelRegions, wallRegionFrame, projectWallRegionPoint, createWallPanelRegion, clipWallSurfacesToRegion } from '../src/design/wallPanelRegions.js';
import { roomWallSurfaces } from '../src/design/roomSurfaces.js';
import { buildRoomFinish, disposeRoomFinish } from '../src/design/finishGeometry.js';
import { buildWallSegments } from '../src/measurements/modelMeasurements.js';
import { getFinishStyle } from '../src/design/roomDesignCatalog.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const room = { id: 'room', height: 3, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }] };
const south = { id: 'south', start: { x: -1, y: -0.1 }, end: { x: 5, y: -0.1 }, height: 3, thickness: 0.2 };
const east = { id: 'east', start: { x: 4.1, y: 0 }, end: { x: 4.1, y: 3 }, height: 3, thickness: 0.2 };
const styleId = 'living-wallPanel-veneer';
const region = { id: 'selection-1', wallId: 'south', startM: 1.5, endM: 4.5, bottomM: 0.3, topM: 2.7, styleId };
const area = surfaces => surfaces.reduce((sum, s) => sum + Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y) * s.height, 0);
const meshes = group => { const nodes = []; group.traverse(node => { if (node.isMesh) nodes.push(node); }); return nodes; };
const build = (selection, walls = [south, east], r = room, wallSurfaces = roomWallSurfaces(r, walls)) => buildRoomFinish({
  room: r, walls, wallSurfaces, selection, styleLookup: getFinishStyle,
});

test('marked region persistence accepts finite physical bounds and rejects malformed/duplicate entries', () => {
  const values = [region, { ...region }, { ...region, id: 'nan', topM: NaN }, { ...region, id: 'zero', endM: region.startM },
    { ...region, id: 'negative', bottomM: -1 }, { ...region, id: 'string', endM: '4.5' }, { ...region, id: 'missing', styleId: undefined }];
  const before = structuredClone(values);
  assert.deepEqual(normalizeWallPanelRegions(values), [region]);
  assert.deepEqual(values, before);
  assert.deepEqual(normalizeWallPanelRegions(null), []);
  assert.equal(normalizeWallPanelRegions(Array.from({ length: 60 }, (_, i) => ({ ...region, id: `r${i}` }))).length, 32);
});

test('two 3D corners use original parent-wall metres, snap to millimetres, and clamp physical extents', () => {
  assert.deepEqual(wallRegionFrame(south), { origin: south.start, tangent: { x: 1, y: 0 }, length: 6 });
  assert.deepEqual(projectWallRegionPoint(south, { x: 2, y: 1.7, z: 0 }), { alongM: 3, heightM: 1.7 });
  assert.deepEqual(createWallPanelRegion(south, { x: 3.4996, y: 2.7002, z: 0 }, { x: 0.4996, y: 0.2996, z: 0 }, { id: region.id, styleId }), region);
  const clamped = createWallPanelRegion(south, { x: -5, y: -1, z: 0 }, { x: 9, y: 4, z: 0 }, { id: 'full', styleId });
  assert.equal(clamped.startM, 0); assert.equal(clamped.endM, 6); assert.equal(clamped.bottomM, 0); assert.equal(clamped.topM, 3);
  assert.equal(createWallPanelRegion(south, { x: 1, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, { id: 'flat', styleId }), null);
  assert.equal(projectWallRegionPoint(south, { x: 1, y: NaN, z: 0 }), null);
  assert.equal(wallRegionFrame({ start: south.start, end: south.start }), null);
});

test('clipping preserves wall area around both a window and a door without mutating geometry', () => {
  const segments = buildWallSegments([south], [
    { bbox: { x1: 1, y1: -0.2, x2: 2, y2: 0 }, sillBase: 0.9, winTop: 2.1 },
    { bbox: { x1: 3, y1: -0.2, x2: 4, y2: 0 }, sillBase: 0, winTop: 2.4 },
  ]);
  const surfaces = roomWallSurfaces(room, segments), before = structuredClone({ surfaces, south, region });
  const clipped = clipWallSurfacesToRegion(surfaces, south, region);
  near(area(clipped), 3 * 2.4 - 1.2 - 0.5 * 2.1);
  for (const piece of clipped) {
    assert.ok(piece.start.x >= 0.5 && piece.end.x <= 3.5);
    assert.ok(piece.yOffset >= 0.3 && piece.yOffset + piece.height <= 2.700001);
    assert.equal(piece.wallPanelRegionId, region.id);
    near(piece.normal.y, 1);
  }
  assert.deepEqual({ surfaces, south, region }, before);
  const group = build({ wallPanelRegions: [region] }, [south], room, surfaces);
  group.updateMatrixWorld(true);
  const ray = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1)).intersectObject(group, true);
  assert.equal(ray(1.5, 1.5).length, 0, 'window remains uncovered');
  assert.equal(ray(3.2, 1.5).length, 0, 'door remains uncovered');
  assert.ok(ray(1.5, 0.5).length, 'marked wall below the window can receive panels');
  assert.ok(ray(3.2, 2.6).length, 'marked lintel above the door can receive panels');
  assert.equal(ray(0.3, 1.5).length, 0, 'outside marked width stays bare');
  assert.equal(ray(0.7, 2.9).length, 0, 'outside marked height stays bare');
  disposeRoomFinish(group);
});

test('diagonal and reversed walls keep the same physical rectangle and room-facing normal', () => {
  const rotate = p => ({ x: (p.x - p.y) / Math.sqrt(2), y: (p.x + p.y) / Math.sqrt(2) });
  const rotatedRoom = { ...room, points: room.points.map(rotate) };
  const rotatedWall = { ...south, start: rotate(south.start), end: rotate(south.end) };
  const surfaces = roomWallSurfaces(rotatedRoom, [rotatedWall]);
  const reversed = { ...rotatedWall, start: rotatedWall.end, end: rotatedWall.start };
  const originalRegion = { ...region, startM: 1, endM: 2 };
  const reverseRegion = { ...originalRegion, startM: 4, endM: 5 };
  const first = clipWallSurfacesToRegion(surfaces, rotatedWall, originalRegion);
  const second = clipWallSurfacesToRegion(surfaces, reversed, reverseRegion);
  near(area(first), 2.4); near(area(second), 2.4);
  ['x', 'y'].forEach(axis => { near(first[0].start[axis], second[0].start[axis]); near(first[0].end[axis], second[0].end[axis]); });
  assert.deepEqual(first[0].normal, surfaces[0].normal);
  const point = rotate({ x: 0.5, y: 0 });
  near(projectWallRegionPoint(reversed, { x: point.x, y: 1, z: point.y }).alongM, 4.5);
});

test('matching wall IDs do not permit nonparallel, remote, or different wall faces', () => {
  const [surface] = roomWallSurfaces(room, [south]);
  assert.deepEqual(clipWallSurfacesToRegion([{ ...surface, parentWallId: 'east' }], south, region), []);
  assert.deepEqual(clipWallSurfacesToRegion([{ ...surface, end: { x: 3, y: 1 } }], south, region), []);
  assert.deepEqual(clipWallSurfacesToRegion([{ ...surface, start: { x: 0, y: 0.6 }, end: { x: 4, y: 0.6 } }], south, region), []);
  assert.deepEqual(clipWallSurfacesToRegion([surface], south, { ...region, bottomM: 4, topM: 5 }), []);
});

test('separate marked wall areas override full-wall presets and retain exact selected heights', () => {
  const southRegion = { ...region, bottomM: 0, topM: 3, styleId: 'bedroom-wallPanel-wainscoting' };
  const eastRegion = { ...region, id: 'east-area', wallId: 'east', startM: 0.3, endM: 1.5, bottomM: 1.5, topM: 2.8 };
  const selection = { wallPanel: styleId, accentWallId: 'south', wallPanelRegions: [southRegion, eastRegion] };
  const group = build(selection);
  group.updateMatrixWorld(true);
  const nodes = meshes(group);
  assert.ok(nodes.length);
  assert.deepEqual(new Set(nodes.map(node => node.userData.wallPanelRegionId)), new Set([region.id, 'east-area']));
  const southNodes = nodes.filter(node => node.userData.wallPanelRegionId === region.id);
  const bounds = southNodes.reduce((box, node) => box.union(new THREE.Box3().setFromObject(node)), new THREE.Box3());
  near(bounds.min.x, 0.5); near(bounds.max.x, 3.5); near(bounds.min.y, 0); near(bounds.max.y, 3);
  const eastBounds = nodes.filter(node => node.userData.wallPanelRegionId === 'east-area').reduce((box, node) => box.union(new THREE.Box3().setFromObject(node)), new THREE.Box3());
  near(eastBounds.min.z, 0.3); near(eastBounds.max.z, 1.5); near(eastBounds.min.y, 1.5); near(eastBounds.max.y, 2.8);
  assert.ok(eastBounds.max.x < 4, 'east panels project inward, not through the wall');
  disposeRoomFinish(group);
});

test('invalid marked styles never cover a whole wall, and legacy full-wall panels keep preset heights', () => {
  const invalid = build({ wallPanel: styleId, wallPanelRegions: [{ ...region, styleId: 'living-floor-polished-gv' }] });
  assert.equal(meshes(invalid).length, 0);
  disposeRoomFinish(invalid);
  const legacy = build({ wallPanel: 'bedroom-wallPanel-wainscoting', accentWallId: 'south' });
  legacy.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(legacy);
  near(bounds.min.x, 0); near(bounds.max.x, 4); near(bounds.min.y, 0.02); near(bounds.max.y, 1.1);
  assert.ok(meshes(legacy).every(node => node.userData.wallPanelRegionId === undefined));
  disposeRoomFinish(legacy);
});
