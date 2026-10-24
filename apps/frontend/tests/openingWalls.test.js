import test from 'node:test';
import assert from 'node:assert/strict';
import { openingWallsForPlan } from '../src/tracer/openingWalls.js';
import { buildMetricLayout } from '../src/tracer/planMeasurements.js';
import { buildWallSegments } from '../src/measurements/modelMeasurements.js';

const wall = (x1, y1, x2, y2) => ({
  start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness_px: 15,
});
const door = { class: 'door', bbox: { x1: 200, y1: 90, x2: 300, y2: 110 } };
const fixture = () => ({
  walls: [wall(0, 100, 200, 100), wall(300, 100, 500, 100)],
  doors: [door], metersPerPixel: .01,
});

test('door wall overlay connects the jambs in image pixels without changing the plan', () => {
  const input = fixture(), original = structuredClone(input);
  const spans = openingWallsForPlan(input);
  assert.equal(spans.length, 1);
  assert.deepEqual(spans[0], { start: { x: 200, y: 100 }, end: { x: 300, y: 100 }, thickness_px: 15 });
  assert.deepEqual(input, original);
  const layout = buildMetricLayout(input);
  const fills = buildWallSegments(layout.walls,
    layout.objects.map(object => ({ ...object, sillBase: 0, winTop: 2.4 })))
    .filter(segment => segment.isOpeningFill);
  assert.equal(fills.length, 1);
  assert.equal(fills[0].yOffset, 2.4);
  assert.ok(Math.abs(fills[0].height - .6) < 1e-8);
});

test('vertical window draws one span even though 3D has both sill and header', () => {
  const input = { walls: [wall(100, 0, 100, 200), wall(100, 300, 100, 500)],
    objects: [{ class: 'window', bbox: { x1: 90, y1: 200, x2: 110, y2: 300 } }],
    metersPerPixel: .01 };
  const spans = openingWallsForPlan(input);
  assert.equal(spans.length, 1);
  assert.deepEqual(spans[0].start, { x: 100, y: 200 });
  assert.deepEqual(spans[0].end, { x: 100, y: 300 });
  const layout = buildMetricLayout(input);
  const fills = buildWallSegments(layout.walls,
    layout.objects.map(object => ({ ...object, sillBase: .9, winTop: 2 })))
    .filter(segment => segment.isOpeningFill);
  assert.equal(fills.length, 2);
});

test('existing host walls and overlapping detections do not duplicate overlay spans', () => {
  const spans = openingWallsForPlan({ ...fixture(), walls: [wall(0, 100, 500, 100)],
    objects: [{ ...door, class: 'window' }] });
  assert.equal(spans.length, 1);
  assert.deepEqual(spans[0].start, { x: 200, y: 100 });
  assert.deepEqual(spans[0].end, { x: 300, y: 100 });
});

test('corner-supported windows use the same return as the 3D wall builder', () => {
  const spans = openingWallsForPlan({ ...fixture(), doors: [],
    objects: [{ ...door, class: 'window' }],
    walls: [wall(0, 100, 200, 100), wall(300, 0, 300, 300)] });
  assert.equal(spans.length, 1);
  assert.deepEqual(spans[0].start, { x: 200, y: 100 });
  assert.deepEqual(spans[0].end, { x: 300, y: 100 });
});

test('missing hosts, unsupported gaps and furniture boxes do not invent walls', () => {
  assert.deepEqual(openingWallsForPlan({ doors: [door] }), []);
  assert.deepEqual(openingWallsForPlan({ ...fixture(), doors: [] }), []);
  assert.deepEqual(openingWallsForPlan({ ...fixture(), doors: [], objects: [{ ...door, class: 'sofa' }] }), []);
  assert.deepEqual(openingWallsForPlan({ ...fixture(), walls: [wall(0, 100, 150, 100), wall(350, 100, 500, 100)] }), []);
});

test('preview scale and doubled image resolution retain the same opening endpoints', () => {
  const unscaled = openingWallsForPlan({ ...fixture(), metersPerPixel: null });
  assert.deepEqual(unscaled[0].start, { x: 200, y: 100 });
  assert.deepEqual(unscaled[0].end, { x: 300, y: 100 });
  const input = fixture();
  input.walls.forEach(w => {
    for (const p of [w.start, w.end]) { p.x *= 2; p.y *= 2; }
    w.thickness_px *= 2;
  });
  input.doors = [{ ...door, bbox: Object.fromEntries(Object.entries(door.bbox).map(([k, v]) => [k, v * 2])) }];
  input.metersPerPixel /= 2;
  assert.deepEqual(openingWallsForPlan(input)[0], {
    start: { x: 400, y: 200 }, end: { x: 600, y: 200 }, thickness_px: 30,
  });
});
