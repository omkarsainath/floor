import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildCustomMurals, disposeCustomMurals, normalizeCustomMurals, normalizeCustomPaintAreas } from '../src/materials/customMurals.js';

const imageData = `data:image/png;base64,${Buffer.from('small-test-image').toString('base64')}`;

test('custom mural validation keeps bounded image areas and rejects unsafe or oversized data', () => {
  const valid = { id: 'mural-1', face: 'inside', startM: 0.5, endM: 3.5, bottomM: 0.4, topM: 2.4, imageData, name: 'Garden.jpg' };
  assert.deepEqual(normalizeCustomMurals([valid], 4, 3), [valid]);
  assert.equal(normalizeCustomMurals([{ ...valid, imageData: 'javascript:alert(1)' }], 4, 3).length, 0);
  assert.equal(normalizeCustomMurals([{ ...valid, endM: 5 }], 4, 3).length, 0);
  assert.equal(normalizeCustomMurals([{ ...valid, topM: 0.42 }], 4, 3).length, 0);
});

test('custom mural geometry is clipped to real wall pieces around an opening', () => {
  const wall = { id: 'wall', start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, height: 3, thickness: 0.2,
    customMurals: [{ id: 'mural-1', face: 'inside', startM: 0.5, endM: 3.5, bottomM: 0.4, topM: 2.4, imageData, name: 'Garden.jpg' }] };
  const segments = [
    { ...wall, customMurals: undefined, parentWallId: 'wall', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
    { ...wall, customMurals: undefined, parentWallId: 'wall', start: { x: 3, y: 0 }, end: { x: 4, y: 0 } },
    { ...wall, customMurals: undefined, parentWallId: 'wall', start: { x: 1, y: 0 }, end: { x: 3, y: 0 }, yOffset: 2.1, height: 0.9 },
  ];
  const textureLoader = { load: () => { const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.needsUpdate = true; return texture; } };
  const group = buildCustomMurals({ walls: [wall], segments, center: { x: 2, y: 2 }, textureLoader });
  assert.equal(group.children.length, 3);
  assert.ok(group.children.every(mesh => mesh.userData.muralId === 'mural-1'));
  const uvRanges = group.children.map(mesh => [...mesh.geometry.attributes.uv.array]);
  assert.ok(uvRanges.some(uv => Math.min(...uv) === 0));
  assert.ok(uvRanges.some(uv => Math.max(...uv) === 1));
  disposeCustomMurals(group);
  assert.equal(group.children.length, 0);
});

test('custom paint areas validate colors and share opening-clipped wall geometry', () => {
  const area = { id: 'paint-1', face: 'inside', startM: 0.5, endM: 3.5, bottomM: 0.4, topM: 2.4, color: '#D4907A' };
  assert.deepEqual(normalizeCustomPaintAreas([area], 4, 3), [{ ...area, color: '#d4907a' }]);
  assert.equal(normalizeCustomPaintAreas([{ ...area, color: 'red' }], 4, 3).length, 0);

  const wall = { id: 'wall', start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, height: 3, thickness: 0.2,
    customPaintAreas: [area] };
  const segments = [
    { ...wall, customPaintAreas: undefined, parentWallId: 'wall', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
    { ...wall, customPaintAreas: undefined, parentWallId: 'wall', start: { x: 3, y: 0 }, end: { x: 4, y: 0 } },
    { ...wall, customPaintAreas: undefined, parentWallId: 'wall', start: { x: 1, y: 0 }, end: { x: 3, y: 0 }, yOffset: 2.1, height: 0.9 },
  ];
  const group = buildCustomMurals({ walls: [wall], segments, center: { x: 2, y: 2 } });
  assert.equal(group.children.length, 3);
  assert.ok(group.children.every(mesh => mesh.userData.isWallPaintArea));
  assert.ok(group.children.every(mesh => mesh.material.color.getHexString() === 'd4907a'));
  disposeCustomMurals(group);
});
