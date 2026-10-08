import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addAIObject, removeAIObjects } from '../src/ai/objectActions.js';

function context() {
  const saved = new Map();
  return { scene: new THREE.Scene(), layout: { units: 'm', walls: [], objects: [] },
    selectableMeshes: [], storage: { setItem: (k, v) => saved.set(k, v) }, saved };
}

test('AI additions persist identical unique IDs for scene and project', () => {
  const ctx = context();
  const first = addAIObject({ object_type: 'sofa', width: 2, depth: 0.9 }, ctx);
  const second = addAIObject({ object_type: 'sofa', x: 10 }, ctx);
  assert.notEqual(first.userData.layoutId, second.userData.layoutId);
  assert.deepEqual(ctx.layout.objects.map(o => o.id), ctx.scene.children.map(m => m.userData.layoutId));
  assert.deepEqual(JSON.parse(ctx.saved.get('preciseFloorplan')).objects, ctx.layout.objects);
});

test('nearby AI removal keeps distant and authored furniture in scene and saved project', () => {
  const ctx = context();
  const nearby = addAIObject({ object_type: 'sofa' }, ctx);
  const distant = addAIObject({ object_type: 'sofa', x: 10 }, ctx);
  delete nearby.userData.aiPlaced; // After reload, identity comes from the saved record.
  ctx.layout.objects.push({ id: 'authored', class: 'sofa', source: 'catalog' });
  assert.equal(removeAIObjects({ object_type: 'Sofa', near_x: 0, near_z: 0 }, ctx), 1);
  assert.deepEqual(ctx.scene.children, [distant]);
  assert.deepEqual(ctx.selectableMeshes, [distant]);
  assert.deepEqual(ctx.layout.objects.map(o => o.id), [distant.userData.layoutId, 'authored']);
  assert.deepEqual(JSON.parse(ctx.saved.get('preciseFloorplan')).objects, ctx.layout.objects);
});

test('invalid AI dimensions do not alter scene or project', () => {
  const ctx = context();
  assert.equal(addAIObject({ object_type: 'bed', width: -1 }, ctx), null);
  assert.equal(addAIObject({ object_type: 'bed', x: NaN }, ctx), null);
  assert.equal(ctx.scene.children.length, 0);
  assert.equal(ctx.layout.objects.length, 0);
  assert.equal(ctx.saved.size, 0);
});
