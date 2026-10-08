import test from 'node:test';
import assert from 'node:assert/strict';
import { ScanResponseError, validateScanBackend, validateScanResponse } from '../src/tracer/scanResponse.js';

const response = () => ({ walls: [], room_boundaries: [], measurements: {
  status: 'ok', linear: [], areas: [], warnings: [], calibration: null,
} });

test('generic old backend health is rejected before uploading an image', () => {
  for (const health of [null, {}, { status: 'running' },
    { status: 'running', scan_api_version: 1, capabilities: { printed_measurements: true } },
    { status: 'running', scan_api_version: 0, capabilities: { printed_measurements: true, automatic_room_boundaries: true } },
  ]) {
    assert.throws(() => validateScanBackend(health), error => error.code === 'BACKEND_OUTDATED');
  }
});

test('current health supports scanning even if the local OCR executable is unavailable', () => {
  for (const available of [true, false]) {
    const health = { status: 'running', scan_api_version: 1,
      capabilities: { printed_measurements: true, automatic_room_boundaries: true },
      ocr: { engine: 'tesseract-local', available } };
    assert.strictEqual(validateScanBackend(health), health);
  }
});

test('an older wall-only backend is reported as incompatible, not a plan with no dimensions', () => {
  const legacy = { walls: [{ id: 'wall-1' }], rooms_detected: [], rooms_and_objects: [] };
  assert.throws(() => validateScanResponse(legacy), error => {
    assert.ok(error instanceof ScanResponseError);
    assert.equal(error.name, 'ScanResponseError');
    assert.equal(error.code, 'BACKEND_OUTDATED');
    assert.deepEqual(error.fields, ['measurements', 'room_boundaries']);
    assert.match(error.message, /running backend/i);
    assert.match(error.message, /port 5050/);
    assert.match(error.message, /cannot tell whether your image contains printed dimensions/);
    return true;
  });
});

test('partial old responses cannot silently clear detected room boundaries', () => {
  for (const field of ['measurements', 'room_boundaries']) {
    const input = response();
    delete input[field];
    assert.throws(() => validateScanResponse(input), error => error.code === 'BACKEND_OUTDATED'
      && error.fields.length === 1 && error.fields[0] === field);
  }
});

test('a completed scan with no readable labels remains a valid empty result', () => {
  const input = response();
  input.measurements.warnings = ['No readable explicit-unit dimensions found.'];
  assert.strictEqual(validateScanResponse(input), input);
});

test('supported OCR unavailable and error results preserve their specific explanation', () => {
  for (const status of ['unavailable', 'error']) {
    const input = response();
    input.measurements.status = status;
    input.measurements.warnings = [status === 'unavailable' ? 'Local Tesseract OCR is not installed.' : 'Local dimension reading timed out.'];
    const before = structuredClone(input);
    assert.strictEqual(validateScanResponse(input), input);
    assert.deepEqual(input, before);
  }
});

test('malformed payloads fail before callers can use them as an empty scan', () => {
  for (const input of [null, [], 'server error',
    { ...response(), walls: null }, { ...response(), room_boundaries: {} },
    { ...response(), measurements: null },
    { ...response(), measurements: { ...response().measurements, linear: {} } },
    { ...response(), measurements: { ...response().measurements, areas: null } },
    { ...response(), measurements: { ...response().measurements, status: 'unknown' } },
    { ...response(), measurements: { ...response().measurements, warnings: [null] } },
  ]) {
    assert.throws(() => validateScanResponse(input), error => error.code === 'INVALID_SCAN_RESPONSE');
  }
});

test('successful readings and extension fields are returned unchanged', () => {
  const input = response();
  input.measurements.linear = [{ id: 'length-1', value_m: 4.5, confidence: .97 }];
  input.measurements.areas = [{ id: 'area-1', value_m2: 4.4, confidence: .96 }];
  input.room_boundaries = [{ id: 'room-1', points: [] }];
  input.room_scan = { warnings: ['Review one open boundary.'] };
  const before = structuredClone(input);
  assert.strictEqual(validateScanResponse(input), input);
  assert.deepEqual(input, before);
});
