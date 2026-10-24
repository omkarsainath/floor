import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPoojaUnit, POOJA_CATALOG } from '../src/generators/pooja.js';
import { createObject } from '../src/generators/object.js';
import { CATEGORIES } from '../src/ui/catalogPanel.js';
import { parseLayout } from '../src/loaders/jsonLoader.js';
import { queueObjectAnimations, advanceObjectAnimations } from '../src/generators/objectAnimations.js';

for (const spec of POOJA_CATALOG) {
  test(`${spec.id}: finite geometry, footprint scaling and reversible independent parts`, () => {
    const root = createPoojaUnit(spec.id, spec.w * 1.3, spec.d * .8);
    const bounds = new THREE.Box3().setFromObject(root);
    assert.ok(Math.abs(bounds.min.y) < 1e-6);
    assert.ok(Math.abs(bounds.max.y - spec.h) < 1e-6);
    assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).x - spec.w * 1.3) < 1e-6);
    const parts = [];
    root.traverse(node => {
      if (node.isMesh) assert.ok(node.geometry.attributes.position.array.every(Number.isFinite), node.name);
      if (node.userData._animType) parts.push(node);
    });
    assert.ok(parts.length >= 2);
    for (const part of parts) {
      const queue = [], data = part.userData;
      const value = () => data._animProp === 'ry' ? part.rotation.y : part.position.z;
      assert.equal(queueObjectAnimations(part, queue), true);
      advanceObjectAnimations(queue, 1);
      assert.equal(value(), data._openState);
      assert.ok(parts.filter(p => p !== part).every(p => !p.userData._animOpen));
      if (data._animProp === 'ry') {
        const knob = part.getObjectByName('front-knob') || part.getObjectByName('cabinet-knob');
        root.updateMatrixWorld(true);
        assert.ok(knob.getWorldPosition(new THREE.Vector3()).z > spec.d * .8 / 2, 'hinge swings outward');
      }
      queueObjectAnimations(part, queue);advanceObjectAnimations(queue, 1);
      assert.ok(Math.abs(value() - data._closedState) < 1e-9);
    }
  });
}

test('all six pooja choices are available and survive a saved layout reload', () => {
  const items = CATEGORIES.find(c => c.id === 'pooja').items;
  assert.ok(items.some(i => i.id === 'pooja-unit'), 'retain the original unit');
  for (const spec of POOJA_CATALOG) {
    assert.ok(items.some(i => i.id === spec.id && i.wallAttached));
    const data = {id: 'saved-pooja', class: spec.id, source: 'catalog', rotationY: .7, elevation: .1,
      bbox: {x1: 1, y1: 2, x2: 1 + spec.w, y2: 2 + spec.d}};
    const layout = parseLayout(JSON.parse(JSON.stringify({units: 'm', walls: [], rooms: [], objects: [data]})));
    const root = createObject(layout.objects[0]);
    assert.equal(root.userData.poojaVariant, spec.id);
    assert.equal(root.userData.isInteractiveFurniture, true);
    assert.equal(root.userData.layoutId, data.id);
    assert.equal(root.rotation.y, .7);assert.equal(root.position.y, .1);
    assert.equal(root.userData._isWinDoor, undefined);
  }
});

test('teak side perforations are not obstructed by a solid carcass', () => {
  const root = createPoojaUnit('pooja-teak-screen', 1.1, .55);
  assert.equal(root.getObjectByName('side-panel'), undefined);
  root.updateMatrixWorld(true);
  // A side ray through the niche can only hit the thin perforated insert,
  // not a full-depth solid side wall behind it.
  const ray = new THREE.Raycaster(new THREE.Vector3(2, 1.4, 0), new THREE.Vector3(-1, 0, 0));
  assert.ok(ray.intersectObject(root, true).every(hit => hit.object.name !== 'side-panel'));
});

test('pull-out stool clears the storage drawers and moves separately', () => {
  const root = createPoojaUnit('pooja-pullout-stool', .95, .55), queue = [];
  queueObjectAnimations(root, queue, 'stools');advanceObjectAnimations(queue, 1);
  const stool = root.getObjectByName('pull-out-stool');
  const bounds = new THREE.Box3().setFromObject(stool);
  assert.ok(bounds.min.z > .55 / 2);
  root.traverse(node => {
    if (node.userData.furniturePart === 'drawers') {
      assert.equal(node.userData._animOpen, false);
      assert.ok(bounds.max.y < new THREE.Box3().setFromObject(node).min.y);
    }
  });
});

test('unsupported ids fall through and invalid dimensions fail explicitly', () => {
  assert.equal(createPoojaUnit('sofa', 1, 1), null);
  assert.equal(createPoojaUnit('pooja-unit', 1, 1), null);
  for (const value of [0, -1, NaN, Infinity]) {
    assert.throws(() => createPoojaUnit(POOJA_CATALOG[0].id, value, .5), RangeError);
    assert.throws(() => createPoojaUnit(POOJA_CATALOG[0].id, 1, value), RangeError);
  }
});
