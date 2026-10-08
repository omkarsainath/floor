import { buildMetricLayout, metricDimensionConstraints, polygonArea, scaleFromReference,
  scaleFromRoomArea, validateBoundary } from './planMeasurements.js';
import { applyDimensionConstraints } from '../measurements/dimensionConstraints.js';

// OCR is evidence, not confirmation. Only well-read text with an associated
// physical span / enclosed inside-face polygon may resize the model unaided.
export const AUTOMATIC_MEASUREMENT_CONFIDENCE = 0.85;
const clone = value => structuredClone(value);
const positive = value => Number.isFinite(value) && value > 0;
const pointOK = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const automaticRoom = room => room.boundary_source === 'auto_walls';
const automaticConstraint = constraint => constraint.source === 'auto-printed';
const automaticSource = source => String(source || '').startsWith('auto-printed');
const fixed = number => Number(number.toFixed(5));
const pointKey = point => `${fixed(point.x)},${fixed(point.y)}`;

function contains(points, point) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// For orthogonal boundaries these grid cells exactly identify positive-area
// overlap, including a concave room whose bounding box covers its neighbour.
function roomsOverlap(a, b) {
  const coordinates = axis => [...new Set([...a, ...b].map(point => point[axis]))].sort((x, y) => x - y);
  const xs = coordinates('x'), ys = coordinates('y');
  for (let x = 1; x < xs.length; x++) for (let y = 1; y < ys.length; y++) {
    const point = { x: (xs[x - 1] + xs[x]) / 2, y: (ys[y - 1] + ys[y]) / 2 };
    if (contains(a, point) && contains(b, point)) return true;
  }
  return false;
}

function annotationInside(room, annotation) {
  const box = annotation.bbox;
  return box?.length === 4 && box.every(Number.isFinite)
    && contains(room.points, { x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2 });
}

function axisOf(start, end) {
  if (!pointOK(start) || !pointOK(end)) return null;
  if (Math.abs(start.y - end.y) < 1e-6 && Math.abs(start.x - end.x) >= 1) return 'x';
  if (Math.abs(start.x - end.x) < 1e-6 && Math.abs(start.y - end.y) >= 1) return 'y';
  return null;
}

function spanKey(constraint) {
  const axis = axisOf(constraint.start, constraint.end);
  if (!axis) return null;
  // Top and bottom duplicate dimension graphics measure the same physical span.
  const ends = [constraint.start[axis], constraint.end[axis]].sort((a, b) => a - b);
  return `${axis}:${ends.map(fixed).join(':')}`;
}

/** Prepare image-pixel state for the tracer and validate its complete metric
 * export. Never mutates caller state. A failed fit rolls back every automatic
 * target together; authored measurements survive detection and failures. */
export function prepareAutomaticMeasurements({ walls = [], doors = [], objects = [], rooms = [],
  measurements = {}, existingRooms = [], existingConstraints = [], metersPerPixel = null,
  calibration = {}, scaleSource = null, defaults = {}, image = {}, manualScaleLocked } = {}) {
  const manualRooms = clone(existingRooms.filter(room => !automaticRoom(room)));
  const manualConstraints = clone(existingConstraints.filter(constraint => !automaticConstraint(constraint)));
  const unresolved = [], seenIssues = new Set();
  const issue = (item, kind, reason) => {
    const key = `${kind}:${item.id || item.text || ''}:${reason}`;
    if (!seenIssues.has(key)) unresolved.push({ id: item.id, kind, text: item.text || item.name || '', reason });
    seenIssues.add(key);
  };
  const threshold = AUTOMATIC_MEASUREMENT_CONFIDENCE;
  const proposedLengths = [], seenLengths = new Set();
  for (const candidate of measurements.linear || []) {
    if (!(candidate.confidence >= threshold) || !positive(candidate.value_m)) {
      issue(candidate, 'length', 'The printed length or its units were not read confidently enough.'); continue;
    }
    const reference = candidate.reference;
    if (reference?.source !== 'dimension-line' || !axisOf(reference.start, reference.end)) {
      issue(candidate, 'length', 'A horizontal or vertical dimension line with both endpoints was not found.'); continue;
    }
    const constraint = { id: '', type: 'length', start: clone(reference.start), end: clone(reference.end),
      target_m: candidate.value_m, text: candidate.text, source: 'auto-printed',
      annotation_id: candidate.id, confidence: candidate.confidence };
    const key = spanKey(constraint), identity = `${key}:${fixed(constraint.target_m)}`;
    const manual = manualConstraints.find(previous => previous.annotation_id === candidate.id && candidate.id
      || spanKey(previous) === key);
    if (manual) {
      if (Math.abs(manual.target_m - constraint.target_m) > 1e-6) {
        issue(candidate, 'length', 'An edited or manually confirmed measurement already controls this span and was preserved.');
      }
      continue;
    }
    if (seenLengths.has(identity)) continue;
    seenLengths.add(identity);
    constraint.id = `auto-length:${identity}`;
    proposedLengths.push(constraint);
  }

  const proposedRooms = [], areaCandidates = measurements.areas || [], associatedAreas = new Set();
  for (const raw of rooms) {
    const room = clone(raw);
    const confidence = room.boundary_confidence ?? room.confidence;
    if (room.boundary_source !== 'auto_walls' || room.boundary_reference !== 'inside_faces'
      || (confidence !== undefined && !(confidence >= threshold))) {
      issue(room, 'room', 'A confident enclosed inside-wall boundary was not found.'); continue;
    }
    try { validateBoundary(room.points); } catch (error) { issue(room, 'room', error.message); continue; }
    if (room.points.some((point, index) => !axisOf(point, room.points[(index + 1) % room.points.length]))) {
      issue(room, 'room', 'Automatic exact dimensions currently require horizontal and vertical room edges.'); continue;
    }
    if (manualRooms.some(previous => roomsOverlap(previous.points || previous.polygon || [], room.points))) {
      issue(room, 'room', 'An edited or manually traced boundary overlaps this detection and was preserved.'); continue;
    }
    if (proposedRooms.some(previous => roomsOverlap(previous.points, room.points))) {
      issue(room, 'room', 'Detected room boundaries overlap; their areas need review.'); continue;
    }
    // Never trust a stale backend area target without its current OCR evidence.
    delete room.declared_area_m2; delete room.declared_area_text; delete room.area_annotation_id;
    room.id ||= `auto-room:${room.points.map(pointKey).join(';')}`;
    if (manualRooms.some(previous => previous.id === room.id) || proposedRooms.some(previous => previous.id === room.id)) {
      room.id = `auto-room:${room.points.map(pointKey).join(';')}`;
    }
    const inside = areaCandidates.filter(annotation => annotationInside(room, annotation));
    // Multiple distinct numbers inside a region can indicate merged rooms. Do
    // not choose the highest-confidence number and discard the other target.
    if (inside.length === 1) {
      const annotation = inside[0];
      if (raw.area_annotation_id === annotation.id && raw.declared_area_m2 === annotation.value_m2
        && annotation.confidence >= threshold && positive(annotation.value_m2)) {
        room.declared_area_m2 = annotation.value_m2;
        room.declared_area_text = annotation.text;
        room.area_annotation_id = annotation.id;
        room.area_source = 'auto-printed';
        associatedAreas.add(annotation);
      }
    } else if (inside.length > 1) {
      inside.forEach(annotation => issue(annotation, 'area', 'More than one printed area lies in this detected room; its boundary needs review.'));
    }
    proposedRooms.push(room);
  }
  for (const annotation of areaCandidates) {
    if (associatedAreas.has(annotation)) continue;
    // A manual room already using the same annotation is deliberately protected.
    if (manualRooms.some(room => room.area_annotation_id === annotation.id && annotation.id)) continue;
    const reason = annotation.confidence >= threshold && positive(annotation.value_m2)
      ? 'The printed area could not be assigned to one confident inside-wall room boundary.'
      : 'The printed area or its units were not read confidently enough.';
    issue(annotation, 'area', reason);
  }

  let nextScale = positive(metersPerPixel) ? metersPerPixel : null;
  let nextSource = scaleSource, nextCalibration = clone(calibration);
  const locked = manualScaleLocked ?? (calibration.status === 'confirmed' && !automaticSource(scaleSource));
  if (!locked) {
    const reference = [...proposedLengths].sort((a, b) => b.confidence - a.confidence
      || Math.hypot(b.end.x - b.start.x, b.end.y - b.start.y) - Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y))[0];
    const areaRoom = proposedRooms.find(room => positive(room.declared_area_m2));
    if (reference) {
      nextScale = scaleFromReference({ ...reference, meters: reference.target_m });
      nextSource = 'auto-printed-dimensions';
      nextCalibration = { status: 'automatic', reference: { start: clone(reference.start), end: clone(reference.end),
        meters: reference.target_m, text: reference.text, annotation_id: reference.annotation_id } };
    } else if (areaRoom) {
      nextScale = scaleFromRoomArea(areaRoom.points, areaRoom.declared_area_m2);
      nextSource = 'auto-printed-area';
      nextCalibration = { status: 'automatic', reference: { area_m2: areaRoom.declared_area_m2,
        area_px: polygonArea(areaRoom.points), room_id: areaRoom.id, text: areaRoom.declared_area_text } };
    } else if (automaticSource(nextSource)) {
      // A previous scan's printed reference is not evidence for the new scan.
      nextScale = null; nextSource = null; nextCalibration = { status: 'unscaled' };
    }
  }
  const proposed = { rooms: [...manualRooms, ...proposedRooms], constraints: [...manualConstraints, ...proposedLengths],
    metersPerPixel: nextScale, scaleSource: nextSource, calibration: nextCalibration };
  const compile = state => {
    const original = buildMetricLayout({ walls, doors, objects, rooms: state.rooms, metersPerPixel: state.metersPerPixel,
      scaleSource: state.scaleSource, calibration: state.calibration, defaults, measurements, image });
    return applyDimensionConstraints(original, metricDimensionConstraints(original, state.constraints));
  };
  try {
    const { layout, report } = compile(proposed);
    const applied = { lengths: proposedLengths.length, areas: proposedRooms.filter(room => positive(room.declared_area_m2)).length };
    const count = applied.lengths + applied.areas;
    const status = count ? (unresolved.length ? 'partial' : 'applied') : (unresolved.length ? 'review' : 'none');
    return { ...proposed, status, unresolved, layout, report, applied };
  } catch (error) {
    const reason = `Automatic dimensions were not applied: ${error.message}`;
    proposedLengths.forEach(constraint => issue({ ...constraint, id: constraint.annotation_id || constraint.id }, 'length', reason));
    proposedRooms.filter(room => positive(room.declared_area_m2)).forEach(room => issue({ id: room.area_annotation_id,
      text: room.declared_area_text }, 'area', reason));
    if (!proposedLengths.length && !proposedRooms.some(room => positive(room.declared_area_m2))) {
      issue({ id: 'geometry' }, 'geometry', reason);
    }
    // A rejected measurement is not evidence that the detected wall boundary
    // vanished. Keep its unadjusted polygon, with every automatic area target
    // removed, so the user can still inspect/export the recovered rooms.
    const unadjustedRooms = proposedRooms.map(room => {
      const boundary = clone(room);
      delete boundary.declared_area_m2; delete boundary.declared_area_text;
      delete boundary.area_annotation_id; delete boundary.area_source;
      return boundary;
    });
    const rollback = { rooms: [...manualRooms, ...unadjustedRooms], constraints: manualConstraints,
      metersPerPixel: automaticSource(scaleSource) ? null : metersPerPixel,
      scaleSource: automaticSource(scaleSource) ? null : scaleSource,
      calibration: automaticSource(scaleSource) ? { status: 'unscaled' } : clone(calibration) };
    let layout = null, report = null;
    try { ({ layout, report } = compile(rollback)); } catch { /* Existing authored errors remain visible to the normal exporter. */ }
    return { ...rollback, status: 'review', unresolved, layout, report, applied: { lengths: 0, areas: 0 },
      error: { message: error.message, code: error.code || 'INVALID_GEOMETRY' } };
  }
}
