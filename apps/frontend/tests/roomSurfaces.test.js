import test from 'node:test';
import assert from 'node:assert/strict';
import { roomWallSurfaces, isDesignableRoom } from '../src/design/roomSurfaces.js';
import { buildWallSegments } from '../src/measurements/modelMeasurements.js';

const room = { id: 'r1', height: 3, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }] };
const wall = { id: 'south', start: { x: -1, y: -0.1 }, end: { x: 5, y: -0.1 }, height: 3, thickness: 0.2 };
const area = surfaces => surfaces.reduce((sum, s) => sum + Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y) * s.height, 0);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('room wall surfaces attach to inside face, clip to room edge and preserve inputs', () => {
  const before = structuredClone({ room, wall });
  const [surface] = roomWallSurfaces(room, [wall]);
  assert.deepEqual(surface.start, { x: 0, y: 0 });
  assert.deepEqual(surface.end, { x: 4, y: 0 });
  near(surface.normal.x, 0); near(surface.normal.y, 1); near(area([surface]), 12);
  assert.deepEqual({ room, wall }, before);
});

test('window and door cutouts survive accent-wall association including upper and lower pieces', () => {
  const segments = buildWallSegments([wall], [
    { bbox: { x1: 1, y1: -0.2, x2: 2, y2: 0 }, sillBase: 0.9, winTop: 2.1 },
    { bbox: { x1: 3, y1: -0.2, x2: 4, y2: 0 }, sillBase: 0, winTop: 2.4 },
  ]);
  const surfaces = roomWallSurfaces(room, segments);
  near(area(surfaces), 12 - 1.2 - 2.4);
  const covers = (x, y) => surfaces.some(s => x > Math.min(s.start.x, s.end.x) && x < Math.max(s.start.x, s.end.x) && y > s.yOffset && y < s.yOffset + s.height);
  assert.equal(covers(1.5, 1.5), false); assert.equal(covers(3.5, 1.5), false);
  assert.equal(covers(1.5, 0.4), true); assert.equal(covers(1.5, 2.7), true); assert.equal(covers(3.5, 2.7), true);
});

test('winding and shared walls choose the correct room-facing surface', () => {
  const forward = roomWallSurfaces(room, [wall]);
  const reversed = roomWallSurfaces({ ...room, points: [...room.points].reverse() }, [wall]);
  near(area(forward), area(reversed)); near(reversed[0].normal.y, 1);
  const other = { ...room, points: [{ x: 0, y: -3 }, { x: 4, y: -3 }, { x: 4, y: -0.2 }, { x: 0, y: -0.2 }] };
  const [opposite] = roomWallSurfaces(other, [wall]);
  near(opposite.start.y, -0.2); near(opposite.normal.y, -1);
});

test('unrelated parallel walls and invalid detection rectangles cannot get room finishes', () => {
  assert.equal(roomWallSurfaces(room, [{ ...wall, start: { x: 0, y: 1 }, end: { x: 4, y: 1 } }]).length, 0);
  assert.equal(isDesignableRoom({ ...room, boundary_source: 'detection_bbox' }), false);
  assert.equal(isDesignableRoom({ points: [] }), false);
  assert.equal(roomWallSurfaces({ ...room, area_source: 'bbox' }, [wall]).length, 0);
});

test('diagonal inside faces remain at their measured coordinates', () => {
  const rotate = p => ({ x: (p.x - p.y) / Math.sqrt(2), y: (p.x + p.y) / Math.sqrt(2) });
  const diagonalRoom = { ...room, points: room.points.map(rotate) };
  const [surface] = roomWallSurfaces(diagonalRoom, [{ ...wall, start: rotate(wall.start), end: rotate(wall.end) }]);
  near(area([surface]), 12); near(surface.start.x, 0); near(surface.start.y, 0);
  near(surface.end.x, 4 / Math.sqrt(2)); near(surface.end.y, 4 / Math.sqrt(2));
});
