import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoomDesignController } from '../src/design/roomDesignController.js';
import { parseLayout } from '../src/loaders/jsonLoader.js';
import { persistLayout } from '../src/state/projectPersistence.js';

const points = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
const wall = (id, x1, y1, x2, y2) => ({ id, start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.2, height: 3 });
function project() {
  return {
    units: 'm', metersPerUnit: 1, calibration: { status: 'confirmed', source: 'manual' },
    rooms: [
      { id: 'hall', name: 'Living Room', height: 3, points: points(0.1, 0.1, 3.9, 2.9), boundary_source: 'manual', declared_area_m2: 10.64 },
      { id: 'bed', name: 'Master Bedroom', height: 3, points: points(4.1, 0.1, 7.9, 2.9), boundary_source: 'manual' },
    ],
    walls: [wall('south', 0, 0, 8, 0), wall('north', 0, 3, 8, 3), wall('west', 0, 0, 0, 3), wall('east', 8, 0, 8, 3), wall('shared', 4, 0, 4, 3)],
    objects: [{ id: 'sofa', class: 'sofa', bbox: { x1: 0.5, y1: 0.5, x2: 2.5, y2: 1.3 }, height_m: 0.8 }],
    dimension_constraints: [
      { id: 'length', type: 'length', start: { x: 0, y: 0 }, end: { x: 8, y: 0 }, target_m: 8 },
      { id: 'area', type: 'area', room_id: 'hall', target_m2: 10.64 },
    ],
  };
}
function setup(layout = project(), save = () => true) {
  const scene = new THREE.Scene();
  const floors = new Map(layout.rooms.map(room => [room.id, { visible: true }]));
  const controller = createRoomDesignController({ scene, getLayout: () => layout, getWallSegments: () => layout.walls, getBaseFloor: id => floors.get(id), save });
  return { controller, scene, floors, layout };
}
function withoutDesign(layout) {
  const snapshot = structuredClone(layout);
  snapshot.rooms.forEach(room => { delete room.design; });
  return snapshot;
}
const hallSelection = {
  roomType: 'living', floor: 'living-floor-polished-gv', ceiling: 'living-ceiling-layered-tray',
  wallPanel: 'living-wallPanel-charcoal-louvers', accentWallId: 'west', ceilingDropM: 0.15,
};

test('applying and resetting finishes affects only the selected room and preserves measured geometry', () => {
  const { controller, layout, floors } = setup();
  const before = structuredClone(layout);
  assert.equal(controller.apply('hall', hallSelection).ok, true);
  assert.deepEqual(layout.rooms[0].design, hallSelection);
  assert.equal(layout.rooms[1].design, undefined);
  assert.equal(floors.get('hall').visible, false);
  assert.equal(floors.get('bed').visible, true);
  assert.deepEqual(withoutDesign(layout), before);

  const bedroom = { roomType: 'bedroom', floor: 'bedroom-floor-engineered-wood' };
  assert.equal(controller.apply('bed', bedroom).ok, true);
  const bedroomGroup = controller.getGroup('bed');
  assert.equal(controller.reset('hall').ok, true);
  assert.equal(layout.rooms[0].design, undefined);
  assert.deepEqual(layout.rooms[1].design, bedroom);
  assert.equal(controller.getGroup('hall'), undefined);
  assert.equal(controller.getGroup('bed'), bedroomGroup);
  assert.equal(floors.get('hall').visible, true);
  assert.equal(floors.get('bed').visible, false);
  assert.deepEqual(withoutDesign(layout), before);
  controller.destroy();
});

test('saved room choices survive project persistence, parsing, and rebuilding the scene', () => {
  const data = new Map();
  const storage = { setItem(key, value) { data.set(key, value); } };
  const original = setup(project(), layout => persistLayout(layout, storage));
  assert.equal(original.controller.apply('hall', hallSelection).ok, true);
  assert.ok(data.get('floorplanTimestamp'));
  const parsed = parseLayout(JSON.parse(data.get('preciseFloorplan')));
  assert.deepEqual(parsed.rooms[0].design, hallSelection);
  assert.deepEqual(parsed.dimension_constraints, original.layout.dimension_constraints);
  assert.deepEqual(parsed.rooms[0].points, original.layout.rooms[0].points);

  const restored = setup(parsed);
  restored.controller.rebuild();
  assert.equal(restored.controller.getGroups().length, 1);
  assert.ok(restored.controller.getGroup('hall').children.length > 0);
  assert.equal(restored.floors.get('hall').visible, false);
  assert.equal(restored.floors.get('bed').visible, true);
  original.controller.destroy();
  restored.controller.destroy();
});

test('invalid room outlines and unrelated accent walls are rejected without changing the project', () => {
  const { controller, layout } = setup();
  assert.deepEqual(controller.getWallChoices('hall').map(choice => choice.id).sort(), ['north', 'shared', 'south', 'west']);
  assert.equal(controller.apply('hall', { ...hallSelection, accentWallId: 'east' }).ok, false);
  assert.equal(controller.apply('hall', { ...hallSelection, accentWallId: undefined }).ok, false);
  assert.equal(layout.rooms[0].design, undefined);
  layout.rooms.push({ id: 'crossed', name: 'Hall', points: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }] });
  layout.rooms.push({ id: 'estimate', name: 'Hall', points: points(0, 0, 2, 2), boundary_source: 'detection_bbox' });
  for (const id of ['crossed', 'estimate', 'missing']) assert.equal(controller.apply(id, hallSelection).ok, false);
  assert.equal(controller.getGroups().length, 0);
  assert.equal(layout.rooms.at(-2).design, undefined);
  assert.equal(layout.rooms.at(-1).design, undefined);
  controller.destroy();
});

test('save failure rolls back an apply or reset and keeps the previous live preview', () => {
  let saveWorks = true;
  const { controller, layout, floors, scene } = setup(project(), () => saveWorks);
  assert.equal(controller.apply('hall', hallSelection).ok, true);
  const previous = layout.rooms[0].design;
  const liveGroup = controller.getGroup('hall');
  const meshCount = liveGroup.children.length;
  saveWorks = false;
  assert.equal(controller.apply('hall', { roomType: 'living', floor: 'living-floor-spc-wood' }).ok, false);
  assert.equal(layout.rooms[0].design, previous);
  assert.equal(controller.getGroup('hall'), liveGroup);
  assert.equal(liveGroup.children.length, meshCount);
  assert.equal(liveGroup.parent, scene);
  assert.equal(floors.get('hall').visible, false);
  assert.equal(scene.children.length, 1);
  assert.equal(controller.reset('hall').ok, false);
  assert.equal(layout.rooms[0].design, previous);
  assert.equal(controller.getGroup('hall'), liveGroup);
  assert.equal(floors.get('hall').visible, false);
  assert.equal(controller.apply('bed', { roomType: 'bedroom', floor: 'bedroom-floor-herringbone' }).ok, false);
  assert.equal(layout.rooms[1].design, undefined);
  assert.equal(controller.getGroup('bed'), undefined);
  assert.equal(floors.get('bed').visible, true);
  controller.destroy();
});

test('repeated rebuilds replace and dispose previews without accumulating duplicate finish groups', () => {
  const { controller, scene, layout, floors } = setup();
  assert.equal(controller.apply('hall', hallSelection).ok, true);
  for (let i = 0; i < 3; i++) {
    const old = controller.getGroup('hall');
    let disposed = 0;
    old.traverse(node => node.geometry?.addEventListener('dispose', () => { disposed += 1; }));
    // A paint update does not change the selected design or duplicate it.
    layout.walls[2].faceColors = { inside: '#aabbcc' };
    controller.rebuild();
    assert.notEqual(controller.getGroup('hall'), old);
    assert.equal(old.parent, null);
    assert.equal(old.children.length, 0);
    assert.ok(disposed > 0);
    assert.equal(controller.getGroups().length, 1);
    assert.equal(scene.children.filter(node => node.userData.isRoomFinish).length, 1);
    assert.equal(floors.get('hall').visible, false);
  }
  delete layout.rooms[0].design;
  controller.rebuild();
  assert.equal(controller.getGroups().length, 0);
  assert.equal(floors.get('hall').visible, true);
  assert.equal(scene.children.length, 0);
  controller.destroy();
});

test('ceiling visibility follows the viewer toggle and does not hide an undecorated base floor', () => {
  const { controller, floors, layout } = setup();
  const selection = { roomType: 'living', ceiling: 'living-ceiling-layered-tray' };
  assert.equal(controller.apply('hall', selection).ok, true);
  assert.equal(layout.rooms[0].design.ceilingDropM, 0.15);
  const ceilings = () => {
    const nodes = [];
    controller.getGroup('hall').traverse(node => { if (node.userData.type === 'ceiling') nodes.push(node); });
    return nodes;
  };
  assert.ok(ceilings().length > 0);
  assert.ok(ceilings().every(node => !node.visible));
  assert.equal(floors.get('hall').visible, true);
  controller.setCeilingsVisible(true);
  assert.ok(ceilings().every(node => node.visible));
  controller.rebuild();
  assert.ok(ceilings().every(node => node.visible));
  controller.setCeilingsVisible(false);
  assert.ok(ceilings().every(node => !node.visible));
  controller.destroy();
});

test('a saved ceiling drop is reflected in its physical underside height', () => {
  const { controller, layout } = setup();
  const selection = { roomType: 'bathroom', ceiling: 'bathroom-ceiling-pvc-planks', ceilingDropM: 0.27 };
  assert.equal(controller.apply('hall', selection).ok, true);
  const heights = [];
  controller.getGroup('hall').traverse(node => {
    if (node.isMesh && node.userData.type === 'ceiling') heights.push(new THREE.Box3().setFromObject(node).min.y);
  });
  assert.ok(heights.length > 0);
  assert.ok(heights.every(height => Math.abs(height - 2.73) < 1e-6));
  assert.equal(layout.rooms[0].height, 3);
  controller.destroy();
});
