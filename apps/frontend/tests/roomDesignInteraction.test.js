import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchRoomWallHit } from '../src/ui/roomDesignInteraction.js';
import { normalizeRoomDesign } from '../src/design/roomDesignCatalog.js';
import { createRoomDesignController } from '../src/design/roomDesignController.js';

const surface = { start: { x: 0, y: 0.1 }, end: { x: 4, y: 0.1 }, normal: { x: 0, y: 1 }, yOffset: 0, height: 3, parentWallId: 'wall' };
test('3D wall marking accepts only the selected room face and never caps, outside faces, or neighbouring walls', () => {
  const object = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.2));
  object.userData.parentWallId = 'wall'; object.updateMatrixWorld(true);
  const hit = { object, point: new THREE.Vector3(2, 1.2, 0.1), face: { normal: new THREE.Vector3(0, 0, 1) } };
  assert.equal(matchRoomWallHit(hit, [surface]), surface);
  assert.equal(matchRoomWallHit({ ...hit, face: { normal: new THREE.Vector3(0, 0, -1) } }, [surface]), null);
  assert.equal(matchRoomWallHit({ ...hit, face: { normal: new THREE.Vector3(0, 1, 0) } }, [surface]), null);
  assert.equal(matchRoomWallHit({ ...hit, point: new THREE.Vector3(5, 1, 0.1) }, [surface]), null);
  assert.equal(matchRoomWallHit({ ...hit, point: new THREE.Vector3(2, 1, 2) }, [surface]), null);
  assert.equal(matchRoomWallHit(hit, [{ ...surface, parentWallId: 'other-room' }]), null);
  // World-space normals, rather than unrotated geometry normals, choose the face.
  object.rotation.y = Math.PI / 2; object.updateMatrixWorld(true);
  const rotated = { ...surface, start: { x: 0.1, y: 0 }, end: { x: 0.1, y: -4 }, normal: { x: 1, y: 0 } };
  assert.equal(matchRoomWallHit({ ...hit, point: new THREE.Vector3(0.1, 1.2, -2) }, [rotated]), rotated);
  object.geometry.dispose(); object.material.dispose();
});

test('invalid marked data cannot silently become a full-wall finish or replace the saved design', () => {
  const bad = { roomType: 'living', wallPanel: 'living-wallPanel-charcoal-louvers', accentWallId: 'wall',
    wallPanelRegions: [{ id: 'bad', wallId: 'wall', startM: 0.5, endM: 2, bottomM: 0.4, topM: 2.2, styleId: 'missing-style' }] };
  assert.equal(normalizeRoomDesign(bad).wallPanel, undefined);
  const room = { id: 'room', name: 'Living Room', height: 3, boundary_source: 'manual', points: [{ x: 0.1, y: 0.1 }, { x: 3.9, y: 0.1 }, { x: 3.9, y: 2.9 }, { x: 0.1, y: 2.9 }] };
  const wall = { id: 'wall', start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, height: 3, thickness: 0.2 };
  const layout = { rooms: [room], walls: [wall] };
  const controller = createRoomDesignController({ scene: new THREE.Scene(), getLayout: () => layout, getWallSegments: () => [wall], save: () => true });
  assert.equal(controller.apply('room', { roomType: 'living', ceiling: 'ceiling-flat' }).ok, true);
  const saved = room.design, group = controller.getGroup('room');
  assert.equal(controller.apply('room', bad).ok, false);
  assert.equal(room.design, saved); assert.equal(controller.getGroup('room'), group);
  assert.equal(controller.apply('room', { roomType: 'living', ceilingLights: [{ type: 'unknown', x: 2, z: 2 }] }).ok, false);
  assert.equal(room.design, saved);
  controller.destroy();
});
