import { polygonArea } from './modelMeasurements.js';
import { validateBoundary } from '../tracer/planMeasurements.js';

const EPS = 1e-8;
const TOLERANCE = 1e-6;
const pointOK = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);
const copy = value => structuredClone(value);

export class DimensionConstraintError extends Error {
  constructor(message, code = 'INVALID_CONSTRAINT', details = {}) {
    super(message);
    this.name = 'DimensionConstraintError';
    this.code = code;
    this.details = details;
  }
}

function fail(message, code, details) { throw new DimensionConstraintError(message, code, details); }
function axisOf(a, b) {
  if (!pointOK(a) || !pointOK(b)) return null;
  if (Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) > EPS) return 'x';
  if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) > EPS) return 'y';
  return null;
}
const other = axis => axis === 'x' ? 'y' : 'x';
const pointsOf = room => room.points || room.polygon;

// Detector endpoints are pixel estimates, so an intended horizontal/vertical
// wall can differ by a few pixels. Correct only small skew, and move shared
// endpoints together. Genuine diagonal walls retain their angled geometry.
function alignSmallSkew(segments, pixelScale = 0) {
  const limit = Math.min(.06, Math.max(.02, pixelScale * 2));
  const vertices = new Map(), changes = [];
  for (const {start,end} of segments) for (const point of [start,end]) {
    const key = `${point.x},${point.y}`;
    if (!vertices.has(key)) vertices.set(key, {points:[], x:point.x, y:point.y});
    vertices.get(key).points.push(point);
  }
  const nodes = [...vertices.values()], indices = new Map([...vertices.keys()].map((key,i)=>[key,i]));
  for (const axis of ['x','y']) {
    const parent=nodes.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
    for (const {start,end} of segments) {
      const drift=Math.abs(start[axis]-end[axis]),span=Math.abs(start[other(axis)]-end[other(axis)]);
      if(span>EPS&&drift<=limit&&drift/span<=Math.tan(3*Math.PI/180)){
        const a=indices.get(`${start.x},${start.y}`),b=indices.get(`${end.x},${end.y}`);
        parent[find(a)]=find(b);
      }
    }
    const groups=new Map();
    nodes.forEach((node,i)=>{const id=find(i);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(node);});
    for(const group of groups.values()){
      const value=group.reduce((sum,n)=>sum+n[axis],0)/group.length;
      for(const node of group)node[`aligned_${axis}`]=value;
    }
  }
  for(const node of nodes) for(const point of node.points) for(const axis of ['x','y']){
    if(Math.abs(point[axis]-node[`aligned_${axis}`])>EPS)changes.push({axis,before_m:point[axis],after_m:node[`aligned_${axis}`]});
    point[axis]=node[`aligned_${axis}`];
  }
  return changes;
}

function rectangleOverlap(points, bounds) {
  let output = points;
  for (const [axis, value, direction] of [['x', bounds.x1, 1], ['x', bounds.x2, -1], ['y', bounds.y1, 1], ['y', bounds.y2, -1]]) {
    const input = output;
    output = [];
    input.forEach((a, i) => {
      const b = input[(i + 1) % input.length];
      const insideA = (a[axis] - value) * direction >= 0, insideB = (b[axis] - value) * direction >= 0;
      if (insideA) output.push(a);
      if (insideA !== insideB) {
        const t = (value - a[axis]) / (b[axis] - a[axis]);
        output.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
      }
    });
    if (!output.length) return 0;
  }
  return polygonArea(output) || 0;
}

function wallBounds(wall) {
  if (!pointOK(wall.start) || !pointOK(wall.end) || Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y)<EPS) {
    fail(`Wall ${wall.id || ''} needs two distinct, finite endpoints.`, 'INVALID_WALL');
  }
  const axis = axisOf(wall.start, wall.end), normal = axis ? other(axis) : null;
  const thickness = Number(wall.thickness ?? 0.15);
  if (!(thickness > 0) || !Number.isFinite(thickness)) fail('Wall thickness must be a positive number in metres.');
  // Diagonal walls have no constant world-axis face. They still participate in
  // endpoint mapping and floor-overlap checks using their oriented footprint.
  if (!axis) return { axis, normal, thickness };
  const bounds = {};
  bounds[`${axis}1`] = Math.min(wall.start[axis], wall.end[axis]);
  bounds[`${axis}2`] = Math.max(wall.start[axis], wall.end[axis]);
  bounds[`${normal}1`] = wall.start[normal] - thickness / 2;
  bounds[`${normal}2`] = wall.start[normal] + thickness / 2;
  return { axis, normal, thickness, bounds };
}

// A room outline is a clear-floor boundary, not a centreline polygon. Small
// tracing errors can be snapped to a real face; ambiguous nearby faces cannot.
function bindRoomFaces(room, walls, pixelScale = 0) {
  const points = pointsOf(room);
  const bindings = [], adjustments = [];
  // Six source-image pixels accommodate clicking and scan rounding, with an
  // 8 cm cap so coarse images cannot attach a floating room to distant walls.
  const limit = Math.min(.08, Math.max(.03, (Number(pixelScale) || 0) * 6));
  const winding = Math.sign(points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0));
  const unmatched = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length], axis = axisOf(a, b), normal = other(axis);
    const low = Math.min(a[axis], b[axis]), high = Math.max(a[axis], b[axis]);
    const candidates = walls.flatMap(wall => {
      const data = wallBounds(wall);
      if (data.axis !== axis) return [];
      const overlap = Math.min(high, data.bounds[`${axis}2`]) - Math.max(low, data.bounds[`${axis}1`]);
      if (overlap <= Math.min(0.05, (high - low) / 4)) return [];
      // Polygon winding identifies the room-facing side, even for concave
      // rooms and clockwise traces. Never bind to the outside of thin walls.
      const side = winding * Math.sign(b[axis] - a[axis]) * (axis === 'x' ? 1 : -1);
      return [{ coordinate: wall.start[normal] + side * data.thickness / 2,
        wall_id: wall.id, limit }]
        .map(face => ({ ...face, distance: Math.abs(face.coordinate - a[normal]) }))
        .filter(face => face.distance <= face.limit + EPS);
    }).sort((a, b) => a.distance - b.distance);
    if (!candidates.length) { unmatched.push({ edge: i, axis }); return; }
    const best = candidates[0];
    if (candidates.some(c => Math.abs(c.distance - best.distance) < EPS && Math.abs(c.coordinate - best.coordinate) > EPS)) {
      fail(`Room “${room.name || room.id}” has an ambiguous wall face. Trace its inside edge more precisely.`, 'AMBIGUOUS_ROOM_FACE');
    }
    bindings.push({ edge: i, axis, normal, ...best });
  });
  if (!bindings.some(b => b.axis === 'x') || !bindings.some(b => b.axis === 'y')) {
    const missing = ['x', 'y'].filter(axis => !bindings.some(b => b.axis === axis));
    const edges = unmatched.filter(edge => missing.includes(edge.axis)).map(edge => edge.edge);
    fail(`Room “${room.name || room.id}”: no matching ${missing.map(axis => axis === 'x' ? 'horizontal' : 'vertical').join(' or ')} inside wall face within ${(limit * 100).toFixed(1)} cm. Check the highlighted room edges and nearby detected walls.`, 'UNBOUND_ROOM_AREA', { room_id: room.id, edges, tolerance_m: limit });
  }
  bindings.forEach(binding => {
    for (const index of [binding.edge, (binding.edge + 1) % points.length]) {
      const before = points[index][binding.normal];
      points[index][binding.normal] = binding.coordinate;
      if (Math.abs(before - binding.coordinate) > EPS) adjustments.push({ room_id: room.id, corner: index,
        axis: binding.normal, before_m: before, after_m: binding.coordinate, wall_id: binding.wall_id });
    }
  });
  validateBoundary(points);
  return adjustments;
}

function assertClearFloor(room, walls) {
  walls.forEach(wall => {
    if (Number(wall.yOffset) > 0) return;
    const data = wallBounds(wall);
    let points = pointsOf(room), bounds = data.bounds;
    if (!data.axis) {
      const dx=wall.end.x-wall.start.x,dy=wall.end.y-wall.start.y,length=Math.hypot(dx,dy);
      // Rotate the room into the wall's coordinates; an axis-aligned bounding
      // box would incorrectly report empty space beside a diagonal as masonry.
      points=points.map(p=>({x:((p.x-wall.start.x)*dx+(p.y-wall.start.y)*dy)/length,
        y:((p.y-wall.start.y)*dx-(p.x-wall.start.x)*dy)/length}));
      bounds={x1:0,x2:length,y1:-data.thickness/2,y2:data.thickness/2};
    }
    if (rectangleOverlap(points, bounds) > 1e-7) {
      fail(`Room “${room.name || room.id}” overlaps wall ${wall.id || ''}. Trace the inside wall faces before applying its dimensions.`, 'ROOM_OVERLAPS_WALL');
    }
  });
}

// Dimension arrows are often outside the building. Bind their projected
// endpoints to actual wall faces/endpoints; a floating reference must not move
// by itself while the measured wall remains unchanged.
function bindLengthReference(constraint, walls) {
  const axis = axisOf(constraint.start, constraint.end);
  const candidates = walls.flatMap(wall => {
    const data = wallBounds(wall);
    if (data.normal === axis) return [-1, 0, 1].map(side => ({
      coordinate: wall.start[axis] + side * data.thickness / 2,
      anchor: { wall_id: wall.id, axis, kind: 'face', side },
    }));
    return ['start', 'end'].map(endpoint => ({ coordinate: wall[endpoint][axis],
      anchor: { wall_id: wall.id, axis, kind: 'endpoint', endpoint } }));
  });
  const adjustments = [];
  for (const key of ['start', 'end']) {
    const coordinate = constraint[key][axis];
    const sorted = candidates.map(c => ({ ...c, distance: Math.abs(c.coordinate - coordinate) }))
      .filter(c => c.distance <= 0.03 + EPS).sort((a, b) => a.distance - b.distance);
    const best = sorted[0];
    if (!best) fail(`Dimension “${constraint.text || constraint.id}” has an endpoint that does not align with a wall face or endpoint. Pick the intended extension-line endpoints more precisely.`, 'UNBOUND_LENGTH');
    if (sorted.some(c => Math.abs(c.distance - best.distance) < EPS && Math.abs(c.coordinate - best.coordinate) > EPS)) {
      fail(`Dimension “${constraint.text || constraint.id}” is ambiguous between wall faces. Pick the intended inside, outside or centreline endpoint.`, 'AMBIGUOUS_LENGTH');
    }
    constraint[`${key}_anchor`] = best.anchor;
    constraint[key][axis] = best.coordinate;
    if (best.distance > EPS) adjustments.push({ constraint_id: constraint.id, endpoint: key, axis,
      before_m: coordinate, after_m: best.coordinate, wall_id: best.anchor.wall_id });
  }
  if (!axisOf(constraint.start, constraint.end)) fail('The dimension endpoints resolve to the same wall position.', 'INVALID_CONSTRAINT');
  return adjustments;
}

function makeAxis(values, ties, offset, fixedCoordinate) {
  const coordinates = [...values].sort((a, b) => a - b).filter((value, i, sorted) => i === 0 || value - sorted[i - 1] > EPS);
  const index = value => {
    let lo = 0, hi = coordinates.length - 1;
    while (lo < hi) { const middle = (lo + hi) >> 1; if (coordinates[middle] < value - EPS) lo = middle + 1; else hi = middle; }
    if (Math.abs(coordinates[lo] - value) > EPS * 2) fail('Internal measurement coordinate was not found.');
    return lo;
  };
  const parent = coordinates.map((_, i) => i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  ties.forEach(([a, b]) => { parent[find(index(a))] = find(index(b)); });
  // Anchor the building rather than an unrelated outer footprint or dimension
  // graphic. Otherwise those extra coordinates can trap an expanding room.
  const fixed = find(fixedCoordinate === undefined ? 0 : index(fixedCoordinate)), groups = new Map();
  const variables = coordinates.map((_, i) => {
    const group = find(i);
    if (group === fixed) return -1;
    if (!groups.has(group)) groups.set(group, offset + groups.size);
    return groups.get(group);
  });
  const at = (i, state) => coordinates[i] + (variables[i] < 0 ? 0 : state[variables[i]]);
  const map = (value, state) => {
    if (coordinates.length === 1) return value + at(0, state) - coordinates[0];
    let lo = 0, hi = coordinates.length - 1;
    while (lo + 1 < hi) { const middle = (lo + hi) >> 1; if (coordinates[middle] < value) lo = middle; else hi = middle; }
    if (value < coordinates[0]) return value + at(0, state) - coordinates[0];
    if (value > coordinates.at(-1)) return value + at(coordinates.length - 1, state) - coordinates.at(-1);
    const fraction = (value - coordinates[lo]) / (coordinates[hi] - coordinates[lo]);
    return at(lo, state) * (1 - fraction) + at(hi, state) * fraction;
  };
  // Unmeasured coordinates must follow nearby measured walls. Leaving them
  // stationary makes an expanding room collide with its original coordinate
  // positions and falsely reports compatible multi-room dimensions as invalid.
  const spreadStep = (step, state, active) => {
    const anchors=coordinates.map((_,i)=>i).filter(i=>variables[i]<0||active.has(variables[i]));
    const done=new Set();
    coordinates.forEach((_,i)=>{
      const variable=variables[i];if(variable<0||active.has(variable)||done.has(variable))return;
      done.add(variable);
      const group=coordinates.map((_,j)=>j).filter(j=>variables[j]===variable);
      const lo=group[0],hi=group.at(-1),before=anchors.filter(j=>j<lo).at(-1),after=anchors.find(j=>j>hi);
      const change=j=>variables[j]<0?0:step[variables[j]];
      if(before===undefined)step[variable]=after===undefined?0:change(after);
      else if(after===undefined)step[variable]=change(before);
      else {
        const fraction=((at(lo,state)+at(hi,state))/2-at(before,state))/(at(after,state)-at(before,state));
        step[variable]=change(before)*(1-fraction)+change(after)*fraction;
      }
    });
  };
  return { coordinates, variables, count: groups.size, at, map, spreadStep,
    valid: state => coordinates.every((value, i) => i === 0 || at(i, state) - at(i - 1, state) > Math.max(EPS, (value - coordinates[i - 1]) * 1e-6)) };
}

function linearSolve(matrix, vector) {
  const n = vector.length, rows = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    if (Math.abs(rows[pivot][col]) < 1e-20) return null;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    for (let j = col; j <= n; j++) rows[col][j] /= divisor;
    for (let row = 0; row < n; row++) if (row !== col) {
      const factor = rows[row][col];
      for (let j = col; j <= n; j++) rows[row][j] -= factor * rows[col][j];
    }
  }
  return rows.map(row => row[n]);
}

/** Apply mutually compatible dimensions to geometry atomically. Coordinates and
 * targets are metres / square metres. Start from the original calibrated layout
 * on every export and supply the complete set of accepted constraints. */
export function applyDimensionConstraints(input, constraints = input.dimension_constraints || []) {
  const layout = copy(input), accepted = copy(constraints);
  if (!accepted.length) return { layout, report: { status: 'none', constraints: [], max_error_m: 0, max_error_m2: 0 } };
  if (layout.units !== 'm' || (layout.metersPerUnit !== undefined && layout.metersPerUnit !== 1)) {
    fail('Exact dimensions require a layout expressed in metres.', 'INVALID_UNITS');
  }
  const walls = layout.walls || [], rooms = layout.rooms || [];
  const alignmentAdjustments=[];
  const ids = new Set();
  accepted.forEach((constraint, i) => {
    constraint.id ||= `dimension_${i}`;
    if (ids.has(constraint.id)) fail('Dimension constraint IDs must be unique.');
    ids.add(constraint.id);
    if (constraint.type === 'length') {
      if (!axisOf(constraint.start, constraint.end)) fail('Exact length references must be horizontal or vertical.', 'UNSUPPORTED_GEOMETRY');
      if (!(constraint.target_m > 0) || !Number.isFinite(constraint.target_m)) fail('The target length must be positive metres.');
      if (constraint.source === 'manual-room-size') {
        const room = rooms.find(room => room.id === constraint.room_id);
        if (!room) fail(`Room ${constraint.room_id} no longer exists.`, 'MISSING_ROOM');
        if (room.boundary_reference !== 'inside_faces') fail('Trace the inside wall faces before enforcing room width or depth.', 'UNCONFIRMED_ROOM_BOUNDARY');
      }
    } else if (constraint.type === 'area') {
      if (!(constraint.target_m2 > 0) || !Number.isFinite(constraint.target_m2)) fail('The target room area must be positive square metres.');
      const room = rooms.find(room => room.id === constraint.room_id);
      if (!room) fail(`Room ${constraint.room_id} no longer exists. Remove or reassign its area constraint.`, 'MISSING_ROOM');
      if (room.boundary_reference !== 'inside_faces') fail('Trace and confirm the inside wall faces before enforcing a clear room area.', 'UNCONFIRMED_ROOM_BOUNDARY');
    } else fail(`Unsupported measurement type: ${constraint.type}`);
  });
  walls.forEach((wall, index) => {
    wall.id ||= `wall_${index}`;
    wallBounds(wall);
  });
  alignmentAdjustments.push(...alignSmallSkew(walls,layout.image_transform?.meters_per_pixel));
  const outlines = [...rooms.map(pointsOf), ...(Array.isArray(layout.footprint) ? [layout.footprint] : []),
    ...(Array.isArray(layout.footprint?.points) ? [layout.footprint.points] : [])];
  outlines.forEach(points => {
    alignmentAdjustments.push(...alignSmallSkew(points.map((p,i)=>({start:p,end:points[(i+1)%points.length]})),layout.image_transform?.meters_per_pixel));
    validateBoundary(points);
  });
  const constrainedRooms = [...new Set(accepted.filter(c => c.type === 'area' || c.source === 'manual-room-size').map(c => c.room_id))].map(id => rooms.find(room => room.id === id));
  for (const room of constrainedRooms) {
    const points=pointsOf(room);
    if (points.some((point,i)=>!axisOf(point,points[(i+1)%points.length]))) {
      fail(`Room “${room.name || room.id}” needs horizontal and vertical inside edges for exact room dimensions. Other diagonal walls may remain in the plan.`, 'UNSUPPORTED_ROOM_GEOMETRY', {room_id:room.id});
    }
  }
  const boundaryAdjustments = constrainedRooms.flatMap(room => bindRoomFaces(room, walls, layout.image_transform?.meters_per_pixel));
  constrainedRooms.forEach(room => assertClearFloor(room, walls));
  // These spans describe the room, not the original click positions. Rebuild
  // them after snapping so both the floor and its physical walls meet targets.
  accepted.filter(c => c.source === 'manual-room-size').forEach(c => {
    const points = pointsOf(rooms.find(room => room.id === c.room_id));
    const axis = axisOf(c.start, c.end);
    const minimum = { x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)) };
    c.start = { ...minimum };
    c.end = { ...minimum, [axis]: Math.max(...points.map(p => p[axis])) };
  });
  const referenceAdjustments = accepted.filter(c => c.type === 'length').flatMap(c => bindLengthReference(c, walls));
  const values = { x: [], y: [] }, ties = { x: [], y: [] }, buildingCoordinates = { x: [], y: [] };
  const addPoint = p => { values.x.push(p.x); values.y.push(p.y); };
  outlines.forEach(points => points.forEach(addPoint));
  walls.forEach(wall => {
    addPoint(wall.start); addPoint(wall.end);
    for (const axis of ['x','y']) buildingCoordinates[axis].push(wall.start[axis],wall.end[axis]);
    const { normal, thickness } = wallBounds(wall);
    if (!normal) return;
    const center = wall.start[normal];
    values[normal].push(center - thickness / 2, center + thickness / 2);
    buildingCoordinates[normal].push(center - thickness / 2, center + thickness / 2);
    ties[normal].push([center - thickness / 2, center], [center, center + thickness / 2]);
  });
  accepted.filter(c => c.type === 'length').forEach(c => { addPoint(c.start); addPoint(c.end); });
  const anchor = axis => buildingCoordinates[axis].length ? Math.min(...buildingCoordinates[axis]) : undefined;
  const x = makeAxis(values.x, ties.x, 0, anchor('x')), y = makeAxis(values.y, ties.y, x.count, anchor('y'));
  const count = x.count + y.count;
  if (count > 2500 || accepted.length > 100) fail('This plan has too many measurement references for the local exact solver. Simplify duplicate geometry first.', 'PLAN_TOO_COMPLEX');
  const mapPoint = (point, state) => ({ ...point, x: x.map(point.x, state), y: y.map(point.y, state) });
  const targets = accepted.map(c => c.type === 'length' ? c.target_m : c.target_m2);
  const evaluate = state => accepted.map(c => c.type === 'length'
    ? Math.hypot(x.map(c.end.x, state) - x.map(c.start.x, state), y.map(c.end.y, state) - y.map(c.start.y, state))
    : polygonArea(pointsOf(rooms.find(room => room.id === c.room_id)).map(p => mapPoint(p, state))));
  let state = Array(count).fill(0), iterations = 0;
  const residual = values => values.map((value, i) => (value - targets[i]) / Math.max(1, targets[i]));
  const norm = numbers => numbers.reduce((sum, n) => sum + n * n, 0);
  for (; iterations < 100; iterations++) {
    const actual = evaluate(state);
    if (actual.every((value, i) => Math.abs(value - targets[i]) <= 1e-8)) break;
    const errors = residual(actual), jacobian = accepted.map(() => Array(count).fill(0));
    for (let column = 0; column < count; column++) {
      const delta = 1e-5 * Math.max(1, Math.abs(state[column])), shifted = [...state];
      shifted[column] += delta;
      evaluate(shifted).forEach((value, row) => { jacobian[row][column] = (value - actual[row]) / delta / Math.max(1, targets[row]); });
    }
    const gram = jacobian.map((a, i) => jacobian.map((b, j) => a.reduce((sum, value, k) => sum + value * b[k], 0) + (i === j ? 1e-10 : 0)));
    const multipliers = linearSolve(gram, errors.map(value => -value));
    if (!multipliers) break;
    const step = state.map((_, column) => jacobian.reduce((sum, row, i) => sum + row[column] * multipliers[i], 0));
    const active=new Set(step.map((_,i)=>i).filter(i=>jacobian.some(row=>Math.abs(row[i])>1e-10)));
    x.spreadStep(step,state,active);y.spreadStep(step,state,active);
    let next = null;
    for (let factor = 1; factor >= 1 / 1048576; factor /= 2) {
      const candidate = state.map((value, i) => value + step[i] * factor);
      if (x.valid(candidate) && y.valid(candidate) && norm(residual(evaluate(candidate))) < norm(errors) * (1 - 1e-9)) { next = candidate; break; }
    }
    if (!next) break;
    state = next;
  }
  const actual = evaluate(state);
  if (!actual.every((value, i) => Number.isFinite(value) && Math.abs(value - targets[i]) <= TOLERANCE)) {
    fail('These dimensions cannot all be satisfied while preserving wall thickness and room boundaries. Check the printed values and endpoints; no changes were applied.', 'INCOMPATIBLE_DIMENSIONS',
      { constraints: accepted.map((c, i) => ({ id: c.id, target: targets[i], actual: actual[i], error: actual[i] - targets[i] })) });
  }
  layout.walls = walls.map(wall => ({ ...wall, start: mapPoint(wall.start, state), end: mapPoint(wall.end, state) }));
  layout.rooms = rooms.map(room => ({ ...room, ...(room.points ? { points: room.points.map(p => mapPoint(p, state)) } : {}),
    ...(room.polygon ? { polygon: room.polygon.map(p => mapPoint(p, state)) } : {}) }));
  layout.rooms.forEach(room=>validateBoundary(pointsOf(room)));
  const mapBox = box => ({ ...box, x1: x.map(box.x1, state), x2: x.map(box.x2, state), y1: y.map(box.y1, state), y2: y.map(box.y2, state) });
  for (const key of ['objects', 'doors', 'windows']) if (Array.isArray(layout[key])) {
    layout[key] = layout[key].map(object => ({ ...object, ...(object.bbox ? { bbox: mapBox(object.bbox) } : {}),
      ...(pointOK(object.position) ? { position: mapPoint(object.position, state) } : {}) }));
  }
  if (Array.isArray(layout.footprint)) layout.footprint = layout.footprint.map(p => mapPoint(p, state));
  else if (Array.isArray(layout.footprint?.points)) layout.footprint.points = layout.footprint.points.map(p => mapPoint(p, state));
  layout.rooms.filter(room => constrainedRooms.some(r => r.id === room.id)).forEach(room => assertClearFloor(room, layout.walls));
  layout.dimension_constraints = accepted.map(c => c.type === 'length' ? { ...c,
    source_start: copy(c.start), source_end: copy(c.end), source_coordinates: 'input_metres',
    start: mapPoint(c.start, state), end: mapPoint(c.end, state) } : c);
  const measurements = accepted.map((c, i) => ({ id: c.id, type: c.type, target: targets[i], actual: actual[i], error: actual[i] - targets[i], unit: c.type === 'length' ? 'm' : 'm2' }));
  const report = { status: 'satisfied', constraints: measurements, iterations, boundary_adjustments: boundaryAdjustments,
    alignment_adjustments: alignmentAdjustments,
    reference_adjustments: referenceAdjustments,
    max_error_m: Math.max(0, ...measurements.filter(c => c.unit === 'm').map(c => Math.abs(c.error))),
    max_error_m2: Math.max(0, ...measurements.filter(c => c.unit === 'm2').map(c => Math.abs(c.error))),
    scope: 'Applied printed references and inside-face room polygons; unread or unprovided dimensions remain estimates.' };
  layout.dimension_constraint_report = report;
  // This mapping replaces a single pixel scale after local adjustments.
  layout.geometry_transform = { type: 'piecewise_rectilinear', x: x.coordinates.map((value, i) => [value, x.at(i, state)]),
    y: y.coordinates.map((value, i) => [value, y.at(i, state)]) };
  return { layout, report };
}
