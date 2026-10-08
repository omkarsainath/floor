import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyCeilingVisibility } from '../src/controls/controls.js';

test('ceiling toggle reaches every architectural ceiling and preserves fixtures', () => {
  const scene = new THREE.Scene();
  const base = new THREE.Group(); base.userData.type = 'ceiling';
  const profiled = new THREE.Mesh(); profiled.userData.type = 'ceiling';
  const fixture = new THREE.Group(); fixture.userData.isCeilingLight = true;
  const fixtureAttachment = new THREE.Mesh(); fixtureAttachment.userData.type = 'ceiling';
  fixture.add(fixtureAttachment); scene.add(base, profiled, fixture);

  assert.equal(applyCeilingVisibility(scene, false), 2);
  assert.equal(base.visible, false);
  assert.equal(profiled.visible, false);
  assert.equal(fixture.visible, true);
  assert.equal(fixtureAttachment.visible, true);

  assert.equal(applyCeilingVisibility(scene, true), 2);
  assert.equal(base.visible, true);
  assert.equal(profiled.visible, true);
});
