import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWalkCamera } from '../src/controls/walkCamera.js';

const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const cameraAt = () => {
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 1000);
  camera.position.set(3, 12, 7);
  camera.lookAt(0, 0, 0);
  return camera;
};

test('175 cm body with a measured 163 cm eye level places the camera at 1.63 m', () => {
  const camera = cameraAt();
  const walker = createWalkCamera(camera, { personHeightM: 1.75, eyeHeightM: 1.63 });
  assert.equal(camera.position.y, 12, 'creating the helper must preserve the orbit view');
  const direction = camera.getWorldDirection(new THREE.Vector3());
  walker.attach();
  approx(camera.position.y, 1.63);
  approx(camera.position.x, 3);
  approx(camera.position.z, 7);
  const after = camera.getWorldDirection(new THREE.Vector3());
  approx(after.x, direction.x); approx(after.z, direction.z);
  assert.equal(walker.getState().eyeHeightSource, 'measured');
  assert.equal(camera.fov, 45);
  assert.deepEqual(camera.scale.toArray(), [1, 1, 1]);
});

test('look rotates in place, clamps extreme pitch and movement keeps fixed eye elevation', () => {
  const camera = cameraAt();
  const walker = createWalkCamera(camera, { eyeHeightM: 1.63, floorY: 0.2 });
  walker.attach();
  const original = camera.position.clone();
  const originalDirection = camera.getWorldDirection(new THREE.Vector3());
  for (let i = 0; i < 500; i++) walker.look(0.05, 0.02);
  assert.deepEqual(camera.position.toArray(), original.toArray());
  assert.ok(walker.getState().pitch < Math.PI / 2);
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(originalDirection) > 0.1);
  walker.moveTo({ x: 8, z: -2, y: 100 });
  approx(camera.position.y, 1.83);
  approx(camera.position.x, 8); approx(camera.position.z, -2);
  walker.look(0, -100);
  assert.ok(walker.getState().pitch > -Math.PI / 2);
  approx(camera.position.y, 1.83);
  walker.resetLook();
  approx(camera.getWorldDirection(new THREE.Vector3()).y, 0);
});

test('automatic eye level is explicitly estimated and recomputes when body height changes', () => {
  const camera = cameraAt();
  const walker = createWalkCamera(camera);
  walker.attach();
  approx(camera.position.y, 1.75 * 0.93);
  assert.equal(walker.getState().eyeHeightSource, 'estimated');
  assert.equal(walker.setPersonHeight(1.9), true);
  approx(camera.position.y, 1.9 * 0.93);
  walker.setEyeHeight(1.72);
  walker.setPersonHeight(1.8);
  approx(camera.position.y, 1.72);
  assert.equal(walker.getState().eyeHeightSource, 'measured');
  walker.setPersonHeight(1.6);
  approx(camera.position.y, 1.6 * 0.93);
  assert.equal(walker.getState().eyeHeightSource, 'estimated');
  walker.setEyeHeight(1.45);
  walker.setEyeHeight(null);
  approx(camera.position.y, 1.6 * 0.93);
  assert.equal(walker.getState().eyeHeightSource, 'estimated');
});

test('invalid dimensions and movement leave camera and saved state untouched', () => {
  const camera = cameraAt();
  const walker = createWalkCamera(camera, { personHeightM: 1.75, eyeHeightM: 1.63 });
  walker.attach();
  const before = walker.getState();
  for (const value of [null, undefined, NaN, Infinity, '1.75', 0.49, 2.51]) {
    assert.equal(walker.setPersonHeight(value), false);
  }
  for (const value of [undefined, NaN, Infinity, '1.63', 0, 0.1, 1.75, 1.8]) {
    assert.equal(walker.setEyeHeight(value), false);
  }
  assert.equal(walker.look(NaN, 0), false);
  assert.equal(walker.look(0, Infinity), false);
  assert.equal(walker.moveTo({ x: 5, z: NaN }), false);
  assert.equal(walker.moveTo(null), false);
  assert.deepEqual(walker.getState(), before);
  assert.throws(() => createWalkCamera(camera, { personHeightM: 0.2 }), RangeError);
  assert.throws(() => createWalkCamera(camera, { eyeHeightM: 2 }), RangeError);
  assert.throws(() => createWalkCamera(camera, { floorY: Infinity }), RangeError);
});

test('leaving Walk allows orbit changes, and reentering preserves the new heading', () => {
  const camera = cameraAt();
  const walker = createWalkCamera(camera);
  walker.attach();
  walker.detach();
  camera.position.set(4, 10, -5);
  camera.lookAt(4, 10, 5);
  walker.setPersonHeight(1.8);
  walker.setEyeHeight(1.66);
  assert.equal(camera.position.y, 10);
  assert.equal(walker.look(1, 1), false);
  assert.equal(walker.moveTo({ x: 100, z: 100 }), false);
  walker.attach();
  approx(camera.position.y, 1.66);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  approx(direction.x, 0); approx(direction.z, 1);
  const target = new THREE.Vector3();
  assert.equal(walker.syncTarget(target, 2), true);
  approx(target.x, 4); approx(target.y, 1.66); approx(target.z, -3);
});

test('floor and eye height are world measurements even with a translated camera parent', () => {
  const camera = cameraAt();
  const parent = new THREE.Group();
  parent.position.set(10, 2, -5);
  parent.rotation.y = 0.4;
  parent.add(camera);
  const before = camera.getWorldPosition(new THREE.Vector3());
  const walker = createWalkCamera(camera, { eyeHeightM: 1.63, floorY: 0.2 });
  walker.attach();
  const state = walker.getState();
  approx(state.position.x, before.x); approx(state.position.z, before.z);
  approx(state.position.y, 1.83);
  walker.look(0.2, 0.4);
  approx(walker.getState().position.y, 1.83);
  walker.moveTo({ x: 2, z: 3 });
  approx(walker.getState().position.x, 2); approx(walker.getState().position.z, 3);
  approx(walker.getState().position.y, 1.83);
});
