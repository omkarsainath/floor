import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createObject } from '../src/generators/object.js';
import { furniturePlacement } from '../src/generators/furniturePlacement.js';
import { parseLayout, loadLayout } from '../src/loaders/jsonLoader.js';
import { getPlanBounds } from '../src/ui/renderMode.js';
import { createWall } from '../src/generators/wall.js';
import { CATEGORIES, snapWallAttachedPlacement } from '../src/ui/catalogPanel.js';

const object = (cls, w = 1.8, d = 2.1) => ({
  id: cls, class: cls, bbox: { x1: 1, y1: 2, x2: 1 + w, y2: 2 + d },
});

test('bed local depth follows its long axis and honors saved yaw', () => {
  const p = furniturePlacement(object('bed'));
  assert.ok(Math.abs(p.width - 1.8) < 1e-9);
  assert.ok(Math.abs(p.depth - 2.1) < 1e-9);
  assert.equal(p.yaw, 0);
  const sideways = furniturePlacement(object('bed', 2.1, 1.8));
  assert.equal(sideways.yaw, Math.PI / 2);
  const restored = createObject({ ...object('bed'), rotationY: 0.71 });
  assert.equal(restored.rotation.y, 0.71);
});

test('nearest wall cannot exchange the detected footprint axes', () => {
  const sofa = object('sofa', 2.5, 0.9);
  const p = furniturePlacement({ ...sofa, walls: [{ start: {x: 0, y: 0}, end: {x: 0, y: 10} }] });
  assert.equal(p.width, 2.5);
  assert.ok(Math.abs(p.depth - 0.9) < 1e-9);
  assert.ok(p.yaw === 0 || p.yaw === Math.PI);
});

test('catalog uses the stated width and depth even when depth is longer', () => {
  const p = furniturePlacement({ ...object('armchair', 0.8, 0.9), source: 'catalog' });
  assert.ok(Math.abs(p.width - 0.8) < 1e-9);
  assert.ok(Math.abs(p.depth - 0.9) < 1e-9);
  assert.equal(p.yaw, 0);
});

test('detailed furniture has finite geometry, rounded surfaces and fabric normals', () => {
  for (const cls of ['bed','single-bed','double-bed','queen-bed','king-bed','sofa','sofa-2','sofa-3','l-sofa','loveseat','chair','dining-chair','armchair','lounge-chair','accent chair','dining table','coffee table']) {
    const root = createObject(object(cls));
    assert.equal(root.userData.detailedFurniture, true, cls);
    let rounded = 0;
    root.traverse(child => {
      if (!child.isMesh) return;
      const positions = child.geometry.attributes.position.array;
      assert.ok(positions.every(Number.isFinite), cls);
      child.geometry.computeBoundingBox();
      assert.equal(child.geometry.boundingBox.isEmpty(), false, cls);
      if (child.geometry instanceof RoundedBoxGeometry) rounded++;
      assert.equal(child.material.metalness, 0, cls);
    });
    assert.ok(rounded > 0, cls);
    const bounds = new THREE.Box3().setFromObject(root);
    assert.ok(bounds.min.y >= -0.01, cls);
    assert.ok(bounds.max.y > 0.4, cls);
  }
});

test('editing one object material does not recolor another copy', () => {
  const first = createObject(object('sofa'));
  const second = createObject(object('sofa'));
  const original = second.children[0].material.color.getHex();
  first.children[0].material.color.set(0xff0000);
  assert.equal(second.children[0].material.color.getHex(), original);
});

test('bathroom sink, commode and gas stove use recognizable detailed fixture parts', () => {
  const expected = {
    sink: ['basin', 'basin-interior', 'drain', 'faucet', 'faucet-spout'],
    commode: ['floor-pedestal-body', 'toilet-seat', 'soft-close-lid', 'visible-cistern', 'flush-button'],
    stove: ['glass-hob', 'burner-ring', 'burner-cap', 'pan-support', 'control-knob'],
  };
  for (const [cls, required] of Object.entries(expected)) {
    const root = createObject(object(cls, cls === 'stove' ? 0.75 : 0.6, 0.55));
    const parts = [];
    root.traverse(child => {
      if (!child.isMesh) return;
      if (child.userData.fixturePart) parts.push(child.userData.fixturePart);
      assert.ok(child.geometry.attributes.position.array.every(Number.isFinite), cls);
    });
    required.forEach(part => assert.ok(parts.includes(part), `${cls} missing ${part}`));
    const bounds = new THREE.Box3().setFromObject(root);
    assert.equal(bounds.isEmpty(), false, cls);
    assert.ok(bounds.min.y >= -0.01, cls);
  }
});

test('attachable cabinets snap their rear face to walls and all kitchen cabinet doors are hinged', () => {
  const wall = { id: 'wall', start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, thickness: 0.2 };
  const item = { w: 1.8, d: 0.6 };
  const front = snapWallAttachedPlacement({ x: 2, z: 1 }, item, [wall]);
  const back = snapWallAttachedPlacement({ x: 2, z: -1 }, item, [wall]);
  assert.ok(front && back);
  assert.ok(Math.abs(front.z - 0.4) < 1e-9);
  assert.ok(Math.abs(back.z + 0.4) < 1e-9);
  assert.ok(Math.abs(Math.abs(front.rotation - back.rotation) - Math.PI) < 1e-9);

  const kitchen = CATEGORIES.find(category => category.id === 'kitchen');
  for (const cls of ['kitchen-base-cabinet', 'kitchen-upper-cabinet', 'overhead-cabinet', 'loft-wall-cabinet']) {
    assert.equal(kitchen.items.find(candidate => candidate.id === cls).wallAttached, true);
    const cabinet = createObject({ ...object(cls, 1.2, 0.45), source: 'catalog' });
    let doors = 0;
    cabinet.traverse(child => { if (child.userData.isFurnitureDoor) doors++; });
    assert.ok(doors >= 2, `${cls} has no hinged pair`);
  }
});

test('detected stairs render as a full storey stair run', () => {
  const stairs = createObject(object('stairs', 1.2, 3.4));
  const bounds = new THREE.Box3().setFromObject(stairs);
  assert.equal(stairs.children.filter(child => child.isMesh).length, 12);
  assert.ok(bounds.max.y >= 2.9);
  assert.ok(bounds.max.y <= 3.01);
});

test('accepted furniture and manual doors survive import without confidence or count caps', async () => {
  const data = { units: 'm', scale_m_per_px: 0.01, rooms: [],
    walls: [{ start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, height: 3 }],
    objects: [object('sofa'), object('bed'), object('door'), ...Array.from({length: 35}, (_, i) => ({ ...object('window'), id: `window-${i}` }))] };
  const result = parseLayout(data);
  assert.equal(result.objects.length, 38);
  assert.equal(result.scale_m_per_px, 0.01);
  const previous = globalThis.fetch;
  globalThis.fetch = async () => ({ok: true, json: async () => data});
  try {
    const loaded = await loadLayout('/fixture', {useFallback: false});
    assert.equal(loaded.walls[0].end.x, 10);
    assert.equal(loaded.walls[0].start.x, 0);
    assert.deepEqual(loaded.objects, result.objects);
  } finally { globalThis.fetch = previous; }
});

test('malformed object bounds are rejected', () => {
  assert.throws(() => parseLayout({objects: [{ ...object('bed'), bbox: { x1: 'bad' } }]}), /must be finite/);
});

test('render lighting bounds ignore the large display ground', () => {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(100, 100)));
  scene.add(createWall({start:{x:12,y:6},end:{x:16,y:6},height:3}));
  const bounds = getPlanBounds(scene);
  assert.ok(bounds.min.x >= 12);
  assert.ok(bounds.max.x <= 16);
});

test('lintels do not generate floor-level baseboards', () => {
  const args = {start:{x:0,y:0},end:{x:1,y:0},height:0.6};
  assert.equal(createWall({...args, yOffset:2.4}).children.length, 0);
  assert.equal(createWall(args).children.length, 2);
});

test('local save round-trips catalog dimensions, rotation and calibration', async () => {
  const { persistLayout } = await import('../src/state/projectPersistence.js');
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value) };
  const layout = { scale_m_per_px: 0.025, objects: [{ ...object('bed'), source: 'catalog', rotationY: 0.8 }] };
  assert.equal(persistLayout(layout, storage), true);
  const restored = parseLayout(JSON.parse(values.get('preciseFloorplan')));
  assert.equal(restored.scale_m_per_px, 0.025);
  assert.equal(restored.objects[0].rotationY, 0.8);
  assert.deepEqual(restored.objects[0].bbox, layout.objects[0].bbox);
});

test('render environment fill preserves finish colours and restores shared materials',async()=>{
 const {softenRenderEnvironment}=await import('../src/ui/renderMode.js');
 const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial({color:'#d6c9b1',envMapIntensity:.8});
 scene.add(new THREE.Mesh(new THREE.BoxGeometry(),material),new THREE.Mesh(new THREE.BoxGeometry(),material));
 const color=material.color.getHex();const restore=softenRenderEnvironment(scene);
 assert.ok(Math.abs(material.envMapIntensity-.304)<1e-9);assert.equal(material.color.getHex(),color);
 restore();assert.equal(material.envMapIntensity,.8);restore();assert.equal(material.envMapIntensity,.8);
});
