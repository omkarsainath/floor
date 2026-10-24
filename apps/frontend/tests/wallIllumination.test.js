import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addWallIllumination } from '../src/design/wallIllumination.js';
import { createLightSwitch } from '../src/design/lightSwitch.js';

test('wall washers point toward the relief on either wall face and switch independently', () => {
  for (const side of [-1, 1]) {
    const group = new THREE.Group();
    addWallIllumination(group, [{lo:0,hi:4,bottom:0,top:3}],
      {left:1,right:3,bottom:.5,top:2.5}, side, .16);
    assert.equal(group.children.length, 1);
    const light = group.children[0];
    const direction = new THREE.Vector3(0,0,-1).applyQuaternion(light.quaternion);
    const towardWall = new THREE.Vector3(0,0,side*.16-light.position.z).normalize();
    assert.ok(direction.dot(towardWall) > .999);
    assert.ok(light.width <= 2 && light.height <= 2);
    const control = createLightSwitch();
    control.setCircuitEnabled('ceiling',false); control.update(group);
    assert.equal(light.intensity,.9);
    control.setCircuitEnabled('wall',false); control.update(group);
    assert.equal(light.intensity,0);
    control.setCircuitEnabled('wall',true); control.update(group);
    assert.equal(light.intensity,.9);
  }
});

test('wall washers exclude spans outside the panel', () => {
  const group = new THREE.Group();
  addWallIllumination(group,[{lo:5,hi:6,bottom:0,top:3}],
    {left:0,right:4,bottom:0,top:3},1,.16);
  assert.equal(group.children.length,0);
});
