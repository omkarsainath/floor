export class ScanResponseError extends Error {
  constructor(message, code, fields = []) {
    super(message);
    this.name = 'ScanResponseError';
    this.code = code;
    this.fields = fields;
  }
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const outdatedMessage = 'The running backend does not include automatic measurement and room scanning. '
  + 'Stop the older backend on port 5050, start the updated backend, and scan again. '
  + 'This scan cannot tell whether your image contains printed dimensions. Your existing plan was kept.';

/** Fast compatibility check before uploading the image or running detection. */
export function validateScanBackend(health) {
  if (!record(health) || !Number.isInteger(health.scan_api_version) || health.scan_api_version < 1
    || health.capabilities?.printed_measurements !== true || health.capabilities?.automatic_room_boundaries !== true) {
    throw new ScanResponseError(outdatedMessage, 'BACKEND_OUTDATED');
  }
  return health;
}

/** Check the scan contract before changing any tracer state. An old server can
 * return successful wall detections without ever running OCR or room scanning;
 * that is different from a current server scanning a plan and finding no text. */
export function validateScanResponse(data) {
  if (!record(data)) {
    throw new ScanResponseError('The scan server returned an invalid response. Your existing plan was kept. Try scanning again.',
      'INVALID_SCAN_RESPONSE');
  }

  const missing = ['measurements', 'room_boundaries'].filter(field => !Object.hasOwn(data, field));
  if (missing.length) {
    throw new ScanResponseError(outdatedMessage, 'BACKEND_OUTDATED', missing);
  }

  const invalid = [];
  if (!Array.isArray(data.walls)) invalid.push('walls');
  if (!Array.isArray(data.room_boundaries)) invalid.push('room_boundaries');
  if (!record(data.measurements)) invalid.push('measurements');
  else {
    if (!['ok', 'unavailable', 'error'].includes(data.measurements.status)) invalid.push('measurements.status');
    for (const field of ['linear', 'areas', 'warnings']) {
      if (!Array.isArray(data.measurements[field])) invalid.push(`measurements.${field}`);
    }
    if (Array.isArray(data.measurements.warnings) && data.measurements.warnings.some(value => typeof value !== 'string')) {
      invalid.push('measurements.warnings');
    }
  }
  if (invalid.length) {
    throw new ScanResponseError(
      `The scan server returned invalid measurement data (${invalid.join(', ')}). `
      + 'Your existing plan was kept. Restart the updated backend and scan again.',
      'INVALID_SCAN_RESPONSE', invalid);
  }
  return data;
}
