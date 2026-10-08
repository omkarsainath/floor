import test from 'node:test';
import assert from 'node:assert/strict';
import { snapRadiusForPlan, snapWallIntersections, replaceAutoDoors } from '../src/tracer/wallGeometry.js';

const wall = (x1, y1, x2, y2, extra = {}) => ({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, ...extra });

test('snap repairs L/T junctions without tilting axes or losing metadata', () => {
  const input = [wall(0, 20, 98, 20, { height: 3 }), wall(100, 23, 100, 80), wall(50, 24, 50, 60)];
  const before = structuredClone(input);
  const result = snapWallIntersections(input);
  assert.deepEqual(result[0], wall(0, 20, 100, 20, { height: 3 }));
  assert.deepEqual(result[1].start, { x: 100, y: 20 });
  assert.deepEqual(result[2].start, { x: 50, y: 20 });
  assert.deepEqual(input, before);
  assert.deepEqual(snapWallIntersections(result), result);
});

test('short walls, doorway gaps and close parallel walls survive snapping', () => {
  for (const input of [
    [wall(0, 0, 6, 0)],
    [wall(0, 0, 40, 0), wall(46, 0, 100, 0)],
    [wall(0, 0, 100, 0), wall(0, 4, 100, 4)],
  ]) assert.deepEqual(snapWallIntersections(input, 18), input);
});

test('high-resolution plans use a larger bounded corner snap radius', () => {
  assert.equal(snapRadiusForPlan(600, 800), 10);
  assert.equal(snapRadiusForPlan(2048, 2048), 25);
  assert.equal(snapRadiusForPlan(6000, 4000), 32);
  const input = [wall(0, 100, 980, 100), wall(1000, 118, 1000, 900)];
  const result = snapWallIntersections(input, snapRadiusForPlan(2048, 2048));
  assert.deepEqual(result[0].end, { x: 1000, y: 100 });
  assert.deepEqual(result[1].start, { x: 1000, y: 100 });
});

test('repeated detections replace auto doors and respect authored doors', () => {
  const manual = { id: 'manual', source: 'manual', swingDir: 'left-inside', bbox: { x1: 10, y1: 10, x2: 50, y2: 50 } };
  const detections = [
    { id: 'door_auto_0', source: 'auto', bbox: { x1: 12, y1: 10, x2: 52, y2: 50 } },
    { id: 'door_auto_1', source: 'auto', bbox: { x1: 100, y1: 10, x2: 140, y2: 50 } },
  ];
  const once = replaceAutoDoors([manual], detections);
  assert.equal(once.length, 2);
  assert.deepEqual(once[0], manual);
  assert.deepEqual(replaceAutoDoors(once, detections), once);
  assert.deepEqual(replaceAutoDoors(once, []), [manual]);
});
