import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { checkWalkPosition, resolveWalkMovement } from '../src/controls/walkCollision.js';

const box = (width, height, depth, x = 0, y = height / 2, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshBasicMaterial());
  mesh.position.set(x, y, z);
  return mesh;
};
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('lowered ceiling footprints leave concave corners and gaps between patches clear', () => {
  const ceiling = box(4, 0.1, 4, 2, 1.85, 2);
  ceiling.userData.type = 'ceiling'; ceiling.visible = false;
  ceiling.userData.walkFootprints = [[{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 1 }, { x: 1, z: 1 }, { x: 1, z: 4 }, { x: 0, z: 4 }]];
  const check = position => checkWalkPosition({ position, obstacles: [ceiling], bodyHeight: 2 });
  assert.equal(check({ x: 2, z: 2 }).blocked, false);
  assert.equal(check({ x: 0.5, z: 2 }).reason, 'headroom');
  assert.equal(check({ x: 1.1, z: 2 }).blocked, true, 'the person radius overlaps the ceiling edge');
  ceiling.userData.walkFootprints = [
    [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 4 }, { x: 0, z: 4 }],
    [{ x: 3, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 3, z: 4 }],
  ];
  assert.equal(check({ x: 2, z: 2 }).blocked, false);
  assert.equal(check({ x: 3.5, z: 2 }).blocked, true);
});

test('a long movement stops before a thin wall instead of crossing between its endpoints', () => {
  const wall = box(4, 3, 0.01);
  wall.userData.type = 'wall';
  const start = { x: 0, z: -2 };
  assert.equal(checkWalkPosition({ position: start, obstacles: [wall] }).blocked, false);
  assert.equal(checkWalkPosition({ position: { x: 0, z: 2 }, obstacles: [wall] }).blocked, false);
  const result = resolveWalkMovement({ position: start, delta: { x: 0, z: 4 }, obstacles: [wall] });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'wall');
  assert.equal(result.obstacle, wall);
  assert.ok(result.position.z <= -0.235);
  assert.ok(result.position.z > -0.315);
  assert.deepEqual(start, { x: 0, z: -2 }, 'movement must not modify the caller position');
  assert.equal(checkWalkPosition({ position: result.position, obstacles: [wall] }).blocked, false);
});

test('closed door blocks passage and rotating its leaf open clears the same doorway', () => {
  const doorway = new THREE.Group();
  doorway.add(box(0.08, 2.2, 0.12, -0.54), box(0.08, 2.2, 0.12, 0.54));
  doorway.add(box(1.16, 0.2, 0.12, 0, 2.1));
  const hinge = new THREE.Group();
  hinge.position.x = -0.5;
  const leaf = box(1, 1.98, 0.06, 0.5, 0.99);
  hinge.add(leaf);
  doorway.add(hinge);
  const options = { position: { x: 0, z: -1.5 }, delta: { x: 0, z: 3 }, bodyHeight: 1.75, obstacles: [doorway] };
  const closed = resolveWalkMovement(options);
  assert.equal(closed.blocked, true);
  assert.equal(closed.obstacle, leaf);
  hinge.rotation.y = Math.PI / 2;
  const open = resolveWalkMovement(options);
  assert.equal(open.blocked, false, 'the door group bounds must not fill the open doorway');
  approx(open.position.x, 0); approx(open.position.z, 1.5);
});

test('head clearance uses full standing height rather than lower camera eye height', () => {
  const lintel = box(1.2, 0.4, 0.2, 0, 2.2);
  lintel.userData.isWall = true;
  const options = { position: { x: 0, z: -1 }, delta: { x: 0, z: 2 }, obstacles: [lintel] };
  const shorter = resolveWalkMovement({ ...options, bodyHeight: 1.75 });
  assert.equal(shorter.blocked, false);
  approx(shorter.position.z, 1);
  const taller = resolveWalkMovement({ ...options, bodyHeight: 2.1 });
  assert.equal(taller.blocked, true);
  assert.equal(taller.reason, 'headroom');
  assert.equal(taller.obstacle, lintel);
  assert.ok(taller.position.z < -0.3);
});

test('hidden cutaway ceilings still constrain standing height unless explicitly excluded', () => {
  const ceiling = new THREE.Group();
  ceiling.userData.type = 'ceiling';
  ceiling.visible = false;
  ceiling.add(box(4, 0.15, 4, 0, 1.95));
  const options = { position: { x: 0, z: 0 }, bodyHeight: 2, obstacles: [ceiling] };
  assert.equal(checkWalkPosition(options).blocked, true);
  assert.equal(checkWalkPosition(options).reason, 'headroom');
  assert.equal(checkWalkPosition({ ...options, includeCeilings: false }).blocked, false);
  assert.equal(checkWalkPosition({ ...options, bodyHeight: 1.75 }).blocked, false);
});

test('furniture blocks movement, while normal hidden objects and invisible click meshes do not', () => {
  const sofa = box(2, 0.85, 0.9);
  const options = { position: { x: 0, z: 0 }, obstacles: [sofa] };
  assert.equal(checkWalkPosition(options).blocked, true);
  assert.equal(checkWalkPosition(options).reason, 'object');
  sofa.visible = false;
  assert.equal(checkWalkPosition(options).blocked, false);
  sofa.visible = true;
  sofa.material.transparent = true;
  sofa.material.opacity = 0;
  assert.equal(checkWalkPosition(options).blocked, false);
  sofa.material.opacity = 1;
  sofa.userData.walkIgnore = true;
  assert.equal(checkWalkPosition(options).blocked, false);
  delete sofa.userData.walkIgnore;
  const helperGroup = new THREE.Group();
  helperGroup.userData.isHelper = true;
  helperGroup.add(sofa);
  assert.equal(checkWalkPosition({ ...options, obstacles: [helperGroup] }).blocked, false);
});

test('rotated parent transforms affect collision footprint without using its enclosing rectangle', () => {
  const parent = new THREE.Group();
  parent.position.set(10, 0.4, -2);
  parent.rotation.y = Math.PI / 4;
  const wall = box(4, 3, 0.1);
  wall.userData.type = 'wall';
  parent.add(wall);
  const options = { obstacles: [parent], floorY: 0.4 };
  assert.equal(checkWalkPosition({ ...options, position: { x: 10, z: -2 } }).blocked, true);
  // This point is inside the rotated mesh's world AABB, but far from the wall.
  assert.equal(checkWalkPosition({ ...options, position: { x: 11, z: -1 } }).blocked, false);
  assert.equal(checkWalkPosition({ ...options, position: { x: 0, z: 0 } }).blocked, false);
  parent.position.x = 20;
  assert.equal(checkWalkPosition({ ...options, position: { x: 10, z: -2 } }).blocked, false);
  assert.equal(checkWalkPosition({ ...options, position: { x: 20, z: -2 } }).blocked, true);
});

test('floor elevation changes available headroom and flat floor geometry permits walking', () => {
  const floor = box(6, 0.2, 6, 0, 0.3);
  const lintel = box(1.2, 0.4, 0.2, 0, 2.2);
  const options = { position: { x: 0, z: 0 }, bodyHeight: 1.75, obstacles: [floor, lintel] };
  assert.equal(checkWalkPosition({ ...options, floorY: 0.4 }).reason, 'headroom');
  assert.equal(checkWalkPosition({ ...options, floorY: 0.4, bodyHeight: 1.5 }).blocked, false);
  assert.equal(checkWalkPosition({ ...options, floorY: 0, obstacles: [lintel] }).blocked, false);
});

test('an invalid starting position remains blocked instead of teleporting through an obstacle', () => {
  const wall = box(4, 3, 0.1);
  const result = resolveWalkMovement({ position: { x: 0, z: 0 }, delta: { x: 0, z: 10 }, obstacles: [wall] });
  assert.equal(result.blocked, true);
  assert.deepEqual(result.position, { x: 0, z: 0 });
});

test('invalid movement coordinates and body dimensions are rejected', () => {
  const valid = { position: { x: 0, z: 0 }, delta: { x: 1, z: 0 } };
  for (const invalid of [
    { position: { x: NaN, z: 0 } }, { bodyHeight: 0 }, { bodyHeight: Infinity },
    { bodyRadius: -1 }, { floorY: NaN },
  ]) {
    assert.throws(() => checkWalkPosition({ ...valid, ...invalid }), TypeError);
    assert.throws(() => resolveWalkMovement({ ...valid, ...invalid }), TypeError);
  }
  assert.throws(() => resolveWalkMovement({ ...valid, delta: { x: 0, z: Infinity } }), TypeError);
});

function slopedCeiling(indexed = true) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 1.5, 0, 4, 3.5, 0, 4, 3.5, 4, 0, 1.5, 4,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const ceiling = new THREE.Mesh(indexed ? geometry : geometry.toNonIndexed(), new THREE.MeshBasicMaterial());
  ceiling.userData.type = 'ceiling';
  ceiling.userData.walkSurfaceTriangles = true;
  return ceiling;
}

test('sloped ceiling blocks only low portions and includes standing body radius at the transition', () => {
  for (const indexed of [true, false]) {
    const ceiling = slopedCeiling(indexed);
    const check = x => checkWalkPosition({ position: { x, z: 2 }, obstacles: [ceiling], bodyHeight: 2, bodyRadius: 0.23 });
    assert.equal(check(0.5).reason, 'headroom');
    assert.equal(check(3).blocked, false, 'the higher half remains clear despite the low global bounds');
    assert.equal(check(1.1).blocked, true, 'body radius overlaps the lower roof beside the camera');
    assert.equal(check(1.24).blocked, false);
    const moving = resolveWalkMovement({ position: { x: 3, z: 2 }, delta: { x: -2.5, z: 0 }, obstacles: [ceiling], bodyHeight: 2 });
    assert.equal(moving.reason, 'headroom');
    assert.ok(moving.position.x >= 1.23 && moving.position.x < 1.31);
  }
});

test('ceiling profile clipping uses world transforms and invalidates after a transform or height change', () => {
  const parent = new THREE.Group(), ceiling = slopedCeiling();
  parent.add(ceiling);
  parent.position.set(7, 0.4, -3);
  parent.rotation.y = Math.PI / 2;
  const options = { obstacles: [parent], bodyHeight: 2, floorY: 0.4 };
  // Local (3, 2) maps to world (9, -6); local (.5, 2) to (9, -3.5).
  assert.equal(checkWalkPosition({ ...options, position: { x: 9, z: -6 } }).blocked, false);
  assert.equal(checkWalkPosition({ ...options, position: { x: 9, z: -3.5 } }).blocked, true);
  assert.equal(checkWalkPosition({ ...options, bodyHeight: 1.4, position: { x: 9, z: -3.5 } }).blocked, false);
  assert.equal(checkWalkPosition({ ...options, position: { x: 9, z: -3.5 } }).blocked, true);
  parent.position.x = 17;
  assert.equal(checkWalkPosition({ ...options, position: { x: 9, z: -3.5 } }).blocked, false);
  assert.equal(checkWalkPosition({ ...options, position: { x: 19, z: -3.5 } }).blocked, true);
});

test('hidden profiled ceilings obey includeCeilings and do not fill gaps between roof triangles', () => {
  const parent = new THREE.Group(), ceiling = slopedCeiling();
  parent.userData.type = 'ceiling'; parent.visible = false; parent.add(ceiling);
  const options = { obstacles: [parent], position: { x: 0.5, z: 2 }, bodyHeight: 2 };
  assert.equal(checkWalkPosition(options).blocked, true);
  assert.equal(checkWalkPosition({ ...options, includeCeilings: false }).blocked, false);
  // Keep only the first triangle. The old low half-box would incorrectly fill
  // the missing triangle on the left-hand side of the rectangle.
  ceiling.geometry.setDrawRange(0, 3);
  assert.equal(checkWalkPosition(options).blocked, false);
  assert.equal(checkWalkPosition({ ...options, position: { x: 0.5, z: 0.1 } }).blocked, true);
  ceiling.geometry.setDrawRange(0, Infinity);
  assert.equal(checkWalkPosition(options).blocked, true);
});

test('profile collision refreshes edited vertex buffers and clips geometry below the floor', () => {
  const ceiling = slopedCeiling();
  const options = { obstacles: [ceiling], position: { x: 0.5, z: 2 }, bodyHeight: 2 };
  assert.equal(checkWalkPosition(options).blocked, true);
  const positions = ceiling.geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) + 2);
  positions.needsUpdate = true; ceiling.geometry.computeBoundingBox();
  assert.equal(checkWalkPosition(options).blocked, false);
  for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) - 5);
  positions.needsUpdate = true; ceiling.geometry.computeBoundingBox();
  assert.equal(checkWalkPosition(options).blocked, false, 'roof triangles below the standing floor are irrelevant');
});

test('edited ceiling vertices refresh stale bounds before broad-phase rejection', () => {
  const ceiling = slopedCeiling();
  const options = { obstacles: [ceiling], position: { x: 0.5, z: 2 }, bodyHeight: 2 };
  const positions = ceiling.geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) + 3);
  positions.needsUpdate = true;
  assert.equal(checkWalkPosition(options).blocked, false, 'initial high surface creates a cached high bounding box');
  for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) - 3);
  positions.needsUpdate = true;
  // Deliberately do not computeBoundingBox, matching a live profile edit.
  assert.equal(checkWalkPosition(options).blocked, true, 'a lowered roof must not be skipped using the old high bounds');
  for (let i = 0; i < positions.count; i++) positions.setX(i, positions.getX(i) + 10);
  positions.needsUpdate = true;
  assert.equal(checkWalkPosition(options).blocked, false);
  assert.equal(checkWalkPosition({ ...options, position: { x: 10.5, z: 2 } }).blocked, true, 'updated horizontal bounds are used too');
});
