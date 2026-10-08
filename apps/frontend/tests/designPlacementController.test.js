import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoomDesignController } from '../src/design/roomDesignController.js';
import { ceilingAttachment } from '../src/design/ceilingLightPlacement.js';
import { parseLayout } from '../src/loaders/jsonLoader.js';
import { persistLayout } from '../src/state/projectPersistence.js';

const points = (x0, x1) => [{ x: x0, y: 0.1 }, { x: x1, y: 0.1 }, { x: x1, y: 3.9 }, { x: x0, y: 3.9 }];
const wall = (id, x0, z0, x1, z1) => ({ id, start: { x: x0, y: z0 }, end: { x: x1, y: z1 }, height: 2.8, thickness: 0.2 });
const light = { id: 'light-1', type: 'downlight', x: 1.5, z: 2, lumens: 600, temperatureK: 3000, enabled: true };
const region = { id: 'area-1', wallId: 'south', startM: 0.5, endM: 2.5, bottomM: 0.5, topM: 2.3, styleId: 'living-wallPanel-charcoal-louvers' };
const base = { roomType: 'living', ceiling: 'ceiling-cathedral', ceilingDropM: 0.15, ceilingRiseM: 0.6, ceilingAxis: 'x' };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
function setup(save = () => true, imported) {
  const layout = imported || { units: 'm', metersPerUnit: 1, rooms: [
    { id: 'hall', name: 'Living Room', height: 2.8, points: points(0.1, 3.9), boundary_source: 'manual' },
    { id: 'bed', name: 'Bedroom', height: 2.8, points: points(4.1, 7.9), boundary_source: 'manual' },
  ], walls: [wall('south', 0, 0, 8, 0), wall('north', 0, 4, 8, 4), wall('west', 0, 0, 0, 4), wall('east', 8, 0, 8, 4), wall('shared', 4, 0, 4, 4)], objects: [],
  dimension_constraints: [{ id: 'area', type: 'area', room_id: 'hall', target_m2: 14.44 }] };
  const controller = createRoomDesignController({ scene: new THREE.Scene(), getLayout: () => layout, getWallSegments: () => layout.walls, save });
  return { controller, layout };
}
const fixture = (controller, id = 'light-1') => {
  let result; controller.getGroup('hall')?.traverse(n => { if (n.isGroup && n.userData.ceilingLightId === id) result = n; }); return result;
};

test('lights and marked wall areas save and reload without changing measurements; changing the ceiling remounts a fixture', () => {
  const data = new Map(), storage = { setItem(k, v) { data.set(k, v); } };
  const { controller, layout } = setup(value => persistLayout(value, storage));
  const snapshot = structuredClone(layout);
  assert.equal(controller.apply('hall', { ...base, ceilingLights: [light], wallPanel: region.styleId, wallPanelRegions: [region] }).ok, true);
  let mount = fixture(controller);
  const attachment = ceilingAttachment(layout.rooms[0], controller.getGroup('hall'), light);
  near(mount.position.y, attachment.ceilingY);
  assert.ok(new THREE.Vector3(0, -1, 0).applyQuaternion(mount.quaternion).dot(attachment.normal) > 0.9999);
  controller.setCeilingsVisible(false);
  assert.equal(mount.visible, true);
  const emitters = []; mount.traverse(n => { if (n.isLight) emitters.push(n); });
  assert.ok(emitters.every(n => n.visible && n.intensity > 0));
  const oldHeight = mount.position.y;
  assert.equal(controller.apply('hall', { ...layout.rooms[0].design, ceiling: 'ceiling-flat', ceilingDropM: 0.3 }).ok, true);
  mount = fixture(controller); near(mount.position.y, 2.5); assert.notEqual(mount.position.y, oldHeight);
  near(mount.rotation.x, 0); near(mount.rotation.z, 0);
  const design = layout.rooms[0].design;
  const loaded = parseLayout(JSON.parse(data.get('preciseFloorplan')));
  assert.deepEqual(loaded.rooms[0].design, design);
  const restored = setup(undefined, loaded); restored.controller.rebuild();
  near(fixture(restored.controller).position.y, 2.5);
  delete layout.rooms[0].design; assert.deepEqual(layout, snapshot);
  controller.destroy(); restored.controller.destroy();
});

test('invalid light positions, duplicate coverage, and hanging below the floor keep the previous saved preview', () => {
  const { controller, layout } = setup();
  assert.equal(controller.apply('hall', { ...base, ceilingLights: [light] }).ok, true);
  const previous = layout.rooms[0].design, group = controller.getGroup('hall');
  for (const lights of [[{ ...light, x: 4.5 }], [light, { ...light, id: 'overlap', x: light.x + 0.03 }], [{ ...light, type: 'linear-led', x: 0.4 }]]) {
    assert.equal(controller.apply('hall', { ...base, ceilingLights: lights }).ok, false);
    assert.equal(layout.rooms[0].design, previous); assert.equal(controller.getGroup('hall'), group);
  }
  assert.equal(controller.apply('hall', { ...base, ceilingRiseM: 1.8, ceilingLights: [{ ...light, type: 'pendant', x: 0.6, dropM: 1.5 }] }).ok, false);
  assert.equal(controller.getGroup('hall'), group);
  controller.destroy();
});

test('panel regions are room-scoped, reject overlap and restore the old preview when saving fails', () => {
  let saveWorks = true;
  const { controller, layout } = setup(() => saveWorks);
  const selection = { ...base, wallPanel: region.styleId, wallPanelRegions: [region], ceilingLights: [light] };
  assert.equal(controller.apply('hall', selection).ok, true);
  const previous = layout.rooms[0].design, group = controller.getGroup('hall');
  assert.equal(controller.apply('hall', { ...selection, wallPanelRegions: [region, { ...region, id: 'overlap', startM: 2 }] }).ok, false);
  assert.equal(controller.apply('bed', selection).ok, false);
  assert.equal(layout.rooms[1].design, undefined);
  assert.equal(controller.apply('hall', { ...selection, wallPanelRegions: [{ ...region, endM: 7 }] }).ok, false);
  saveWorks = false;
  assert.equal(controller.apply('hall', { ...selection, ceilingLights: [] }).ok, false);
  assert.equal(layout.rooms[0].design, previous); assert.equal(controller.getGroup('hall'), group);
  saveWorks = true;
  assert.equal(controller.apply('hall', { ...selection, wallPanel: undefined, wallPanelRegions: [], ceilingLights: [] }).ok, true);
  let panels = 0, lights = 0;
  controller.getGroup('hall').traverse(n => { if (n.userData.wallPanelRegionId) panels++; if (n.isLight) lights++; });
  assert.equal(panels, 0); assert.equal(lights, 0);
  controller.destroy();
});
