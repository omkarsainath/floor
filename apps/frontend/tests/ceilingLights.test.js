import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CEILING_LIGHT_TYPES, normalizeCeilingLights, ceilingLightFootprint, ceilingLightDepth, buildCeilingLight, disposeCeilingLight } from '../src/design/ceilingLights.js';
import { checkWalkPosition } from '../src/controls/walkCollision.js';
import { suspendDefaultLights } from '../src/ui/renderMode.js';

const approx = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
const fixture = (type, extra = {}) => ({ id: 'fixture', type, x: 1, z: 2, ...extra });
const physicalBounds = group => {
  group.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  group.traverse(object => { if (object.isMesh) bounds.union(new THREE.Box3().setFromObject(object)); });
  return bounds;
};

test('normalization rejects invalid placements, keeps zeros and false, bounds values and produces stable unique IDs', () => {
  const source = [null, [], { type: 'unknown', x: 1, z: 2 }, fixture('downlight', { x: '1' }), fixture('pendant', { z: Infinity }),
    fixture('pendant', { id: ' repeat ', x: 0, z: 0, enabled: false, rotation: 0, lumens: 9000, temperatureK: 0, dropM: 0 }),
    fixture('linear-led', { id: 'repeat', rotation: 5 * Math.PI, dropM: 100, lumens: '900', temperatureK: '6000' }),
    fixture('chandelier', { id: '', dropM: 100 }), fixture('surface-spot', { id: 'repeat-2' })];
  const before = structuredClone(source), output = normalizeCeilingLights(source);
  assert.equal(output.length, 4);
  assert.equal(new Set(output.map(light => light.id)).size, 4);
  assert.deepEqual(output[0], { id: 'repeat', type: 'pendant', x: 0, z: 0, enabled: false, rotation: 0, lumens: 5000, temperatureK: 2200, dropM: 0.1 });
  assert.equal(output[1].id, 'repeat-2');
  assert.equal(output[1].dropM, 0);
  assert.equal(output[1].lumens, 600);
  assert.equal(output[1].temperatureK, 2700);
  assert.ok(Math.abs(output[1].rotation) <= Math.PI);
  assert.equal(output[2].dropM, 1.5);
  assert.deepEqual(output, normalizeCeilingLights(output), 'save and reload must not change IDs or dimensions');
  assert.deepEqual(source, before, 'normalization must not mutate a saved project');
  assert.equal(normalizeCeilingLights(Array.from({ length: 30 }, (_, i) => fixture('downlight', { id: `light-${i}` }))).length, 16);
  assert.deepEqual(normalizeCeilingLights({}), []);
});

test('all five lights have finite distinct physical geometry inside their declared metre dimensions', () => {
  const signatures = new Set();
  for (const type of CEILING_LIGHT_TYPES) for (const dropM of [0.1, 0.45, 1.5]) {
    const placement = fixture(type.id, { dropM, rotation: Math.PI / 5 });
    const before = structuredClone(placement);
    const group = buildCeilingLight({ placement, ceilingY: 3, roomId: 'living' });
    const bounds = physicalBounds(group), radius = ceilingLightFootprint(placement);
    assert.equal(group.userData.isCeilingLight, true);
    assert.equal(group.userData.ceilingLightId, placement.id);
    assert.equal(group.userData.roomId, 'living');
    approx(bounds.min.y, 3 - ceilingLightDepth(placement));
    assert.ok(bounds.max.y <= 3 + 1e-6, 'fixture must not protrude above its mounting plane');
    const shapes = [];
    group.traverse(object => {
      if (!object.isMesh) return;
      assert.equal(object.userData.type, 'ceiling');
      shapes.push(object.geometry.type);
      const positions = object.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
        assert.ok([point.x, point.y, point.z].every(Number.isFinite));
        assert.ok(Math.hypot(point.x - placement.x, point.z - placement.z) <= radius + 1e-6, `${type.id}: footprint is too small`);
      }
    });
    if (dropM === 0.45) signatures.add(shapes.join('|') + bounds.getSize(new THREE.Vector3()).toArray().map(n => n.toFixed(3)).join(','));
    assert.deepEqual(placement, before);
    disposeCeilingLight(group);
  }
  assert.equal(signatures.size, 5, 'each selection needs a distinct visible fixture');
});

test('rotation transforms the fixture around its ceiling anchor and keeps a downward spotlight target', () => {
  const horizontal = buildCeilingLight({ placement: fixture('linear-led'), ceilingY: 2.7, roomId: 1 });
  const vertical = buildCeilingLight({ placement: fixture('linear-led', { rotation: Math.PI / 2 }), ceilingY: 2.7, roomId: 1 });
  const a = physicalBounds(horizontal).getSize(new THREE.Vector3()), b = physicalBounds(vertical).getSize(new THREE.Vector3());
  approx(a.x, b.z); approx(a.z, b.x); approx(a.y, b.y);
  const spot = buildCeilingLight({ placement: fixture('surface-spot', { rotation: 0.7 }), ceilingY: 2.7, roomId: 1 });
  spot.updateWorldMatrix(true, true);
  const emitter = spot.children.find(object => object.isSpotLight);
  const lightPoint = emitter.getWorldPosition(new THREE.Vector3()), targetPoint = emitter.target.getWorldPosition(new THREE.Vector3());
  approx(lightPoint.x, 1); approx(lightPoint.z, 2);
  approx(targetPoint.x, lightPoint.x); approx(targetPoint.z, lightPoint.z);
  assert.ok(targetPoint.y < lightPoint.y);
  for (const group of [horizontal, vertical, spot]) disposeCeilingLight(group);
});

test('surface fixtures fit their conservative footprint when mounted on a steep ceiling', () => {
  for (const type of ['downlight', 'surface-spot', 'linear-led']) {
    const placement = fixture(type, { rotation: 0.9 });
    const group = buildCeilingLight({ placement, ceilingY: 2.7, roomId: 1 });
    const normal = new THREE.Vector3(0.8, -0.45, 0.4).normalize();
    const mount = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), normal);
    group.quaternion.premultiply(mount);
    group.updateWorldMatrix(true, true);
    const radius = ceilingLightFootprint(placement), anchor = group.position.clone();
    group.traverse(object => {
      if (!object.isMesh) return;
      const positions = object.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const delta = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).sub(anchor);
        assert.ok(Math.hypot(delta.x, delta.z) <= radius + 1e-6, `${type}: tilted fixture escapes its placement footprint`);
        assert.ok(delta.dot(normal) >= -1e-6, 'geometry must stay below the actual sloped mounting plane');
      }
    });
    const emitter = group.children.find(object => object.isLight);
    const emittedAt = emitter.getWorldPosition(new THREE.Vector3()).sub(anchor);
    assert.ok(emittedAt.dot(normal) > 0);
    if (emitter.isSpotLight) {
      const toward = emitter.target.getWorldPosition(new THREE.Vector3()).sub(emitter.getWorldPosition(new THREE.Vector3())).normalize();
      approx(toward.dot(normal), 1);
    }
    disposeCeilingLight(group);
  }
});

test('brightness and colour affect real lights; switching off retains physical fixtures and removes emitted light', () => {
  for (const type of CEILING_LIGHT_TYPES) {
    const on = buildCeilingLight({ placement: fixture(type.id, { lumens: 800, temperatureK: 2700 }), ceilingY: 2.7, roomId: 1 });
    const bright = buildCeilingLight({ placement: fixture(type.id, { lumens: 1600, temperatureK: 6500 }), ceilingY: 2.7, roomId: 1 });
    const off = buildCeilingLight({ placement: fixture(type.id, { enabled: false }), ceilingY: 2.7, roomId: 1 });
    const emitters = group => group.children.filter(object => object.isLight);
    assert.equal(emitters(on).length, 1, 'bound real emitters to one per placed fixture');
    assert.equal(emitters(on)[0].userData.isAuthoredLight, true);
    assert.equal(emitters(on)[0].castShadow, false);
    approx(emitters(bright)[0].intensity, emitters(on)[0].intensity * 2);
    assert.ok(emitters(bright)[0].color.b > emitters(on)[0].color.b);
    assert.equal(emitters(off)[0].intensity, 0);
    assert.ok(off.visible);
    assert.deepEqual(physicalBounds(on), physicalBounds(off));
    off.traverse(object => {
      if (object.isMesh) {
        assert.ok(object.visible);
        assert.ok(object.material.emissive.getHex() === 0 || object.material.emissiveIntensity === 0);
      }
    });
    for (const group of [on, bright, off]) disposeCeilingLight(group);
  }
});

test('low hanging fixture blocks standing headroom even with the ceiling hidden', () => {
  const group = buildCeilingLight({ placement: fixture('pendant', { dropM: 1 }), ceilingY: 2.7, roomId: 1 });
  const options = { position: { x: 1, z: 2 }, obstacles: [group], bodyHeight: 1.75, bodyRadius: 0.1 };
  assert.equal(checkWalkPosition(options).reason, 'headroom');
  group.visible = false;
  assert.equal(checkWalkPosition(options).reason, 'headroom');
  assert.equal(checkWalkPosition({ ...options, includeCeilings: false }).blocked, false);
  assert.equal(checkWalkPosition({ ...options, position: { x: 2, z: 2 } }).blocked, false);
  disposeCeilingLight(group);
});

test('fixtures own their resources and disposal does not affect another placement', () => {
  const scene = new THREE.Scene();
  const a = buildCeilingLight({ placement: fixture('chandelier'), ceilingY: 2.7, roomId: 1 });
  const b = buildCeilingLight({ placement: fixture('chandelier'), ceilingY: 2.7, roomId: 1 });
  scene.add(a, b);
  const resources = new Set(), disposalCounts = new Map();
  a.traverse(object => { if (object.isMesh) { resources.add(object.geometry); resources.add(object.material); } });
  for (const resource of resources) { disposalCounts.set(resource, 0); resource.addEventListener('dispose', () => disposalCounts.set(resource, disposalCounts.get(resource) + 1)); }
  let otherDisposed = false;
  b.traverse(object => { if (object.isMesh) for (const resource of [object.geometry, object.material]) resource.addEventListener('dispose', () => { otherDisposed = true; }); });
  disposeCeilingLight(a);
  assert.equal(a.parent, null); assert.equal(a.children.length, 0);
  assert.ok([...disposalCounts.values()].every(count => count === 1));
  assert.equal(otherDisposed, false);
  assert.equal(b.parent, scene);
  disposeCeilingLight(b);
  assert.throws(() => buildCeilingLight({ placement: fixture('bad'), ceilingY: 2.7 }), /valid placement/);
  assert.throws(() => buildCeilingLight({ placement: fixture('pendant'), ceilingY: NaN }), /valid placement/);
});

test('render lighting preserves authored fixtures and does not overwrite changes made while rendering', () => {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(), hiddenFill = new THREE.HemisphereLight();
  hiddenFill.visible = false;
  const fixtureGroup = buildCeilingLight({ placement: fixture('pendant'), ceilingY: 2.7, roomId: 1 });
  const authored = fixtureGroup.children.find(object => object.isLight);
  scene.add(sun, hiddenFill, fixtureGroup);
  const restore = suspendDefaultLights(scene);
  assert.equal(sun.visible, false);
  assert.equal(hiddenFill.visible, false);
  assert.equal(authored.visible, true);
  // Switch off the existing fixture and add another during Render.
  authored.visible = false;
  authored.intensity = 0;
  const added = buildCeilingLight({ placement: fixture('downlight', { id: 'added', lumens: 1200 }), ceilingY: 2.7, roomId: 1 });
  scene.add(added);
  const addedEmitter = added.children.find(object => object.isLight), addedIntensity = addedEmitter.intensity;
  restore();
  assert.equal(sun.visible, true);
  assert.equal(hiddenFill.visible, false);
  assert.equal(authored.visible, false);
  assert.equal(authored.intensity, 0);
  assert.equal(addedEmitter.visible, true);
  assert.equal(addedEmitter.intensity, addedIntensity);
  // Repeated cleanup is harmless and does not restore a stale default state.
  sun.visible = false;
  restore();
  assert.equal(sun.visible, false);
  const restoreAgain = suspendDefaultLights(scene);
  assert.equal(authored.visible, false);
  assert.equal(addedEmitter.visible, true);
  restoreAgain();
  disposeCeilingLight(fixtureGroup); disposeCeilingLight(added);
});
