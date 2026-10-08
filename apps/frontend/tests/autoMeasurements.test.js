import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAutomaticMeasurements, AUTOMATIC_MEASUREMENT_CONFIDENCE } from '../src/tracer/autoMeasurements.js';
import { polygonArea } from '../src/tracer/planMeasurements.js';
import { summarizeMeasurements } from '../src/measurements/modelMeasurements.js';

const point = (x, y) => ({ x, y });
const rectangle = (x1, y1, x2, y2) => [point(x1, y1), point(x2, y1), point(x2, y2), point(x1, y2)];
const wall = (id, x1, y1, x2, y2) => ({ id, start: point(x1, y1), end: point(x2, y2),
  thickness_px: 20, thickness: .15, source: 'auto' });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

function fixture() {
  return { walls: [wall('top', -10, -10, 210, -10), wall('left', -10, -10, -10, 210),
    wall('right', 210, -10, 210, 210), wall('bottom', -10, 210, 210, 210)],
  rooms: [{ id: 'verandah', name: 'Kitchen Verandah', points: rectangle(0, 0, 200, 200),
    boundary_source: 'auto_walls', boundary_reference: 'inside_faces', declared_area_m2: 4.4,
    declared_area_text: 'A: 4.4 m²', area_annotation_id: 'area-1' }],
  objects: [{ id: 'window', class: 'window', bbox: { x1: 205, y1: 60, x2: 215, y2: 120 } }],
  measurements: { linear: [{ id: 'length-1', text: '4.50m', value_m: 4.5, confidence: .97,
    reference: { source: 'dimension-line', start: point(0, -60), end: point(200, -60), span_px: 200 } }],
  areas: [{ id: 'area-1', text: 'A: 4.4 m²', value_m2: 4.4, bbox: [70, 80, 130, 105], confidence: .97 }] } };
}

test('a single Auto Detect result applies a scanned 4.50m span and 4.4m² room without manual input', () => {
  const input = fixture(), before = structuredClone(input);
  const result = prepareAutomaticMeasurements(input);
  assert.deepEqual(input, before);
  assert.equal(result.status, 'applied');
  assert.deepEqual(result.applied, { lengths: 1, areas: 1 });
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.scaleSource, 'auto-printed-dimensions');
  close(polygonArea(result.layout.rooms[0].points), 4.4);
  const left = result.layout.walls.find(w => w.id === 'left'), right = result.layout.walls.find(w => w.id === 'right');
  close(right.start.x - right.thickness / 2 - left.start.x - left.thickness / 2, 4.5);
  close((result.layout.objects[0].bbox.x1 + result.layout.objects[0].bbox.x2) / 2, right.start.x);
  assert.equal(summarizeMeasurements(result.layout).constraint_status, 'satisfied');
});

test('an unambiguous printed room area can calibrate and constrain geometry without a linear label', () => {
  const input = fixture(); input.measurements.linear = [];
  const result = prepareAutomaticMeasurements(input);
  assert.equal(result.status, 'applied');
  assert.equal(result.scaleSource, 'auto-printed-area');
  close(result.metersPerPixel, Math.sqrt(4.4 / 40000));
  close(polygonArea(result.layout.rooms[0].points), 4.4);
});

test('repeated scanning replaces automatic state and repeated dimension graphics do not duplicate targets', () => {
  const input = fixture();
  input.measurements.linear.push({ ...structuredClone(input.measurements.linear[0]), id: 'length-repeat',
    reference: { source: 'dimension-line', start: point(0, 250), end: point(200, 250) } });
  const first = prepareAutomaticMeasurements(input);
  const second = prepareAutomaticMeasurements({ ...input, existingRooms: first.rooms, existingConstraints: first.constraints,
    metersPerPixel: first.metersPerPixel, calibration: first.calibration, scaleSource: first.scaleSource });
  assert.equal(second.rooms.length, 1); assert.equal(second.constraints.length, 1);
  assert.deepEqual(first.layout, second.layout);
});

test('manual dimensions, boundaries and calibration survive another scan', () => {
  const input = fixture();
  const manualRoom = { ...structuredClone(input.rooms[0]), boundary_source: 'manual', declared_area_m2: 6 };
  const manualLength = { id: 'edited', type: 'length', start: point(0, -60), end: point(200, -60),
    target_m: 5, source: 'printed-dimensions', annotation_id: 'length-1', text: '5m' };
  const calibration = { status: 'confirmed', reference: { meters: 2 } };
  const result = prepareAutomaticMeasurements({ ...input, existingRooms: [manualRoom], existingConstraints: [manualLength],
    metersPerPixel: .01, scaleSource: 'manual', calibration, manualScaleLocked: true });
  assert.deepEqual(result.rooms, [manualRoom]); assert.deepEqual(result.constraints, [manualLength]);
  assert.deepEqual(result.calibration, calibration); close(result.metersPerPixel, .01);
  assert.deepEqual(result.applied, { lengths: 0, areas: 0 });
  assert.ok(result.unresolved.some(issue => /preserved/.test(issue.reason)));
  close(polygonArea(result.layout.rooms[0].points), 6);
});

test('unreadable labels, missing reference lines and unmatched room areas remain unresolved', () => {
  const input = fixture(); input.measurements.linear[0].reference = null;
  input.measurements.areas[0].confidence = AUTOMATIC_MEASUREMENT_CONFIDENCE - .01;
  const result = prepareAutomaticMeasurements(input);
  assert.equal(result.status, 'review');
  assert.equal(result.constraints.length, 0);
  assert.equal(result.rooms[0].declared_area_m2, undefined);
  assert.deepEqual(result.applied, { lengths: 0, areas: 0 });
  assert.ok(result.unresolved.some(issue => issue.kind === 'area'));
  assert.ok(result.unresolved.some(issue => issue.kind === 'length'));
});

test('room rectangles from an object detector cannot impose a printed room area', () => {
  const input = fixture(); input.measurements.linear = [];
  input.rooms[0].boundary_source = 'detection_bbox';
  const result = prepareAutomaticMeasurements(input);
  assert.equal(result.rooms.length, 0);
  assert.equal(result.metersPerPixel, null);
  assert.ok(result.unresolved.some(issue => issue.kind === 'area'));
});

test('multiple area labels inside one merged region cannot silently select one target', () => {
  const input = fixture();
  input.measurements.areas.push({ ...input.measurements.areas[0], id: 'area-2', value_m2: 6, text: '6m²', bbox: [20, 20, 60, 40] });
  const result = prepareAutomaticMeasurements(input);
  assert.equal(result.status, 'partial');
  assert.equal(result.rooms[0].declared_area_m2, undefined);
  assert.deepEqual(result.applied, { lengths: 1, areas: 0 });
  assert.ok(result.unresolved.some(issue => /More than one/.test(issue.reason)));
});

test('conflicting automatic dimensions roll back together without erasing manual work', () => {
  const input = fixture();
  input.measurements.linear.push({ ...structuredClone(input.measurements.linear[0]), id: 'contradiction', value_m: 5, text: '5m' });
  const result = prepareAutomaticMeasurements(input);
  assert.equal(result.status, 'review');
  assert.equal(result.error.code, 'INCOMPATIBLE_DIMENSIONS');
  assert.equal(result.constraints.length, 0); assert.equal(result.rooms.length, 1);
  assert.deepEqual(result.rooms[0].points, input.rooms[0].points);
  assert.equal(result.rooms[0].declared_area_m2, undefined);
  assert.equal(result.rooms[0].area_annotation_id, undefined);
  assert.equal(result.rooms[0].area_source, undefined);
  assert.equal(result.metersPerPixel, null);
  assert.deepEqual(result.applied, { lengths: 0, areas: 0 });
  for (const id of ['length-1', 'contradiction', 'area-1']) assert.ok(result.unresolved.some(issue => issue.id === id));
});

test('a detached dimension graphic cannot resize itself while physical walls stay unchanged', () => {
  const input = fixture(); input.measurements.areas = []; input.rooms = [];
  input.measurements.linear[0].reference.start.x = 50;
  input.measurements.linear[0].reference.end.x = 150;
  const result = prepareAutomaticMeasurements(input);
  assert.equal(result.status, 'review'); assert.equal(result.error.code, 'UNBOUND_LENGTH');
  assert.equal(result.constraints.length, 0);
});

test('a room label rejected by backend boundary association cannot be adopted from its center alone', () => {
  const input = fixture(); delete input.rooms[0].area_annotation_id;
  const result = prepareAutomaticMeasurements(input);
  assert.equal(result.status, 'partial');
  assert.equal(result.rooms[0].declared_area_m2, undefined);
  assert.deepEqual(result.applied, { lengths: 1, areas: 0 });
});

test('old automatic scales do not survive a new scan with no measurement evidence', () => {
  const input = fixture(); input.measurements = {}; input.rooms = [];
  const result = prepareAutomaticMeasurements({ ...input, metersPerPixel: .01,
    scaleSource: 'auto-printed-dimensions', calibration: { status: 'automatic' } });
  assert.equal(result.status, 'none'); assert.equal(result.metersPerPixel, null);
  assert.equal(result.layout.calibration.status, 'unscaled');
});
