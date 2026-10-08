import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { renderedObjectBounds } from '../src/ui/measurementPanel.js';

const box = (width, height, depth) => new THREE.Mesh(
  new THREE.BoxGeometry(width, height, depth), new THREE.MeshBasicMaterial(),
);
// Three.js geometry stores vertex positions in Float32Array.
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const sizeIs = (root, x, y, z) => {
  const size = renderedObjectBounds(root);
  assert.ok(size); approx(size.x, x); approx(size.y, y); approx(size.z, z);
};

test('rendered sizes exclude oversized invisible click meshes, hidden meshes and helper descendants', () => {
  const root = new THREE.Group();
  root.add(box(2, 1, 3));
  const clickHelper = box(100, 100, 100);
  clickHelper.material.transparent = true;
  clickHelper.material.opacity = 0;
  root.add(clickHelper);
  const hidden = box(120, 120, 120); hidden.visible = false;
  root.add(hidden);
  const helper = new THREE.Group(); helper.userData.isHelper = true;
  helper.add(box(140, 140, 140)); root.add(helper);
  const hiddenMaterial = box(160, 160, 160); hiddenMaterial.material.visible = false;
  root.add(hiddenMaterial);
  sizeIs(root, 2, 1, 3);
});

test('object dimensions include current scaling and rotation, with elevation separate from height', () => {
  const parent = new THREE.Group();
  parent.position.set(12, 4, -3);
  const root = new THREE.Group();
  root.position.set(2, 0.8, 1);
  root.scale.set(2, 1.5, 0.5);
  root.rotation.y = Math.PI / 2;
  parent.add(root);
  root.add(box(2, 3, 4));
  sizeIs(root, 2, 4.5, 4);
  root.rotation.y = 0;
  sizeIs(root, 4, 4.5, 2);
  root.scale.y = 2;
  sizeIs(root, 4, 6, 2);
});

test('visible frames and handles extend the measured size and opening pose changes the bounds', () => {
  const root = new THREE.Group();
  const hinge = new THREE.Group();
  const leaf = box(1, 2, 0.05); leaf.position.set(0.5, 1, 0); hinge.add(leaf);
  const handle = box(0.1, 0.1, 0.15); handle.position.set(0.9, 1, 0.075); hinge.add(handle);
  root.add(hinge);
  sizeIs(root, 1, 2, 0.175);
  hinge.rotation.y = Math.PI / 2;
  sizeIs(root, 0.175, 2, 1);
  handle.visible = false;
  sizeIs(root, 0.05, 2, 1);
});

test('empty or entirely hidden geometry returns no measured dimensions', () => {
  const empty = new THREE.Group();
  assert.equal(renderedObjectBounds(empty), null);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 5, 5),
  ]), new THREE.LineBasicMaterial());
  empty.add(line);
  assert.equal(renderedObjectBounds(empty), null);
  const root = new THREE.Group(); root.add(box(2, 3, 4));
  root.visible = false;
  assert.equal(renderedObjectBounds(root), null);
  root.visible = true;
  root.userData.isHelper = true;
  assert.equal(renderedObjectBounds(root), null);
  delete root.userData.isHelper;
  const ancestor = new THREE.Group(); ancestor.visible = false; ancestor.add(root);
  assert.equal(renderedObjectBounds(root), null);
});

test('visible glass still has dimensions and measuring does not mutate local bounds', () => {
  const glass = box(1.2, 1.6, 0.02);
  glass.material.transparent = true; glass.material.opacity = 0.12;
  glass.geometry.computeBoundingBox();
  const original = glass.geometry.boundingBox.clone();
  glass.position.set(50, 3, 4); glass.rotation.y = Math.PI / 2;
  const size = renderedObjectBounds(glass);
  assert.ok(Math.abs(size.x - 0.02) < 1e-6);
  assert.ok(Math.abs(size.y - 1.6) < 1e-6);
  assert.ok(Math.abs(size.z - 1.2) < 1e-6);
  assert.deepEqual(glass.geometry.boundingBox, original);
});
