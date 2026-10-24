import { polygonArea, roomSizeConstraints, validateBoundary } from './planMeasurements.js';
import { roomCutoutOutline } from './roomCutout.js';

const EPS = 1e-8;
const bounds = points => ({ x1: Math.min(...points.map(p => p.x)), x2: Math.max(...points.map(p => p.x)),
  y1: Math.min(...points.map(p => p.y)), y2: Math.max(...points.map(p => p.y)) });
const cross = (a, b) => a.x * b.y - a.y * b.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function inside(point, points) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

// Offset each boundary edge outward. Its inside face remains on the marked
// floor edge; walls never subtract thickness from the user's width/depth.
function offsetPolygon(points, distance) {
  const winding = Math.sign(points.reduce((sum, p, i) => sum + cross(p, points[(i + 1) % points.length]), 0));
  const edges = points.map((a, i) => {
    const b = points[(i + 1) % points.length], d = sub(b, a), length = Math.hypot(d.x, d.y);
    const normal = { x: winding * d.y / length * distance, y: -winding * d.x / length * distance };
    return { a: { x: a.x + normal.x, y: a.y + normal.y }, d };
  });
  return edges.map((edge, i) => {
    const previous = edges[(i + edges.length - 1) % edges.length], divisor = cross(previous.d, edge.d);
    if (Math.abs(divisor) < EPS) return edge.a;
    const t = cross(sub(edge.a, previous.a), edge.d) / divisor;
    return { x: previous.a.x + previous.d.x * t, y: previous.a.y + previous.d.y * t };
  });
}

// Retain scan segments outside the marked rooms, including diagonal segments.
// Wrong scan lines inside a marked room no longer cut through its floor.
function outsideSegments(wall, polygons) {
  const d = sub(wall.end, wall.start), cuts = [0, 1];
  for (const points of polygons) points.forEach((a, i) => {
    const e = sub(points[(i + 1) % points.length], a), divisor = cross(d, e);
    if (Math.abs(divisor) < EPS) return;
    const q = sub(a, wall.start), t = cross(q, e) / divisor, u = cross(q, d) / divisor;
    if (t > EPS && t < 1 - EPS && u >= -EPS && u <= 1 + EPS) cuts.push(t);
  });
  cuts.sort((a, b) => a - b);
  return cuts.slice(1).flatMap((end, i) => {
    const start = cuts[i];
    if ((end - start) * Math.hypot(d.x, d.y) < EPS || polygons.some(p => inside(mix(wall.start, wall.end, (start + end) / 2), p))) return [];
    return [{ ...wall, id: `${wall.id}-outside-${i}`, start: mix(wall.start, wall.end, start), end: mix(wall.start, wall.end, end) }];
  });
}

function intersects(a, b, gap = 0) {
  return a.x1 < b.x2 + gap - EPS && a.x2 > b.x1 - gap + EPS && a.y1 < b.y2 + gap - EPS && a.y2 > b.y1 - gap + EPS;
}

function polygonsOverlap(a, b) {
  if (!intersects(bounds(a), bounds(b))) return false;
  if (a.some(p => inside(p, b)) || b.some(p => inside(p, a))) return true;
  return a.some((p, i) => b.some((q, j) => {
    const d = sub(a[(i + 1) % a.length], p), e = sub(b[(j + 1) % b.length], q);
    const divisor = cross(d, e);
    if (Math.abs(divisor) < EPS) return false;
    const t = cross(sub(q, p), e) / divisor, u = cross(sub(q, p), d) / divisor;
    return t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS;
  }));
}

// A room's floor outline is not evidence of a continuous partition. Preserve
// the covered runs of the original boundary, including gaps at either end.
// Door/window boxes supply their host run so the renderer can add the normal
// lintel/sill; an unlabelled open passage stays open from floor to ceiling.
function boundaryCoverage(points, walls, openings, pixelScale) {
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length], d = sub(b, a), length = Math.hypot(d.x, d.y);
    const unit = { x: d.x / length, y: d.y / length };
    const along = p => ((p.x - a.x) * unit.x + (p.y - a.y) * unit.y) / length;
    const normal = p => cross(unit, sub(p, a));
    const tolerance = Math.min(.15, Math.max(.03, (pixelScale || 0) * 6));
    const runs = [], wallRuns = [];
    for (const wall of walls) {
      const direction = sub(wall.end, wall.start), size = Math.hypot(direction.x, direction.y);
      if (size < EPS || Math.abs(cross(unit, direction)) / size > Math.sin(3 * Math.PI / 180)) continue;
      const limit = (Number(wall.thickness) || .15) / 2 + tolerance;
      if (Math.max(Math.abs(normal(wall.start)), Math.abs(normal(wall.end))) > limit) continue;
      const lo = Math.max(0, Math.min(along(wall.start), along(wall.end)));
      const hi = Math.min(1, Math.max(along(wall.start), along(wall.end)));
      if ((hi - lo) * length > .01) { runs.push([lo, hi]); wallRuns.push([lo, hi]); }
    }
    for (const opening of openings) {
      if (!/door|window/i.test(opening.class || opening.type || '')) continue;
      const box = opening.bbox;
      if (!box) continue;
      const corners = [{x:box.x1,y:box.y1},{x:box.x2,y:box.y1},{x:box.x2,y:box.y2},{x:box.x1,y:box.y2}];
      const distances = corners.map(normal);
      if (Math.min(...distances) > tolerance || Math.max(...distances) < -tolerance) continue;
      const lo = Math.max(0, Math.min(...corners.map(along))), hi = Math.min(1, Math.max(...corners.map(along)));
      if ((hi - lo) * length > .01) runs.push([lo, hi]);
    }
    runs.sort((a, b) => a[0] - b[0]);
    const merged = [];
    // Only close scan rounding seams, never a passage-sized gap.
    const seam = Math.min(.12, Math.max(.025, (pixelScale || 0) * 6)) / length;
    for (const run of runs) {
      const previous = merged.at(-1);
      if (previous && run[0] - previous[1] <= seam + EPS) previous[1] = Math.max(previous[1], run[1]);
      else merged.push([...run]);
    }
    if (merged[0]?.[0] <= seam + EPS) merged[0][0] = 0;
    if (merged.length && 1 - merged.at(-1)[1] <= seam + EPS) merged.at(-1)[1] = 1;
    return { runs: merged, evidenced: wallRuns.length > 0 };
  });
}

// Room sizes are independent, but originally adjoining rooms stay attached
// when either shrinks or grows. Use the closest free placement if needed.
function place(original, width, depth, placed, gap, pixelScale) {
  const tolerance = gap + Math.min(.15, Math.max(.03, (pixelScale || 0) * 6));
  const neighbours = [];
  for (const b of placed) {
    const source = b.source_box;
    const overlapY = Math.min(original.y2, source.y2) - Math.max(original.y1, source.y1);
    const overlapX = Math.min(original.x2, source.x2) - Math.max(original.x1, source.x1);
    if (overlapY > .05) {
      if (Math.abs(original.x1 - source.x2) <= tolerance) neighbours.push({ b, axis: 'x', coordinate: b.x2 + gap, weight: overlapY });
      if (Math.abs(original.x2 - source.x1) <= tolerance) neighbours.push({ b, axis: 'x', coordinate: b.x1 - gap - width, weight: overlapY });
    }
    if (overlapX > .05) {
      if (Math.abs(original.y1 - source.y2) <= tolerance) neighbours.push({ b, axis: 'y', coordinate: b.y2 + gap, weight: overlapX });
      if (Math.abs(original.y2 - source.y1) <= tolerance) neighbours.push({ b, axis: 'y', coordinate: b.y1 - gap - depth, weight: overlapX });
    }
  }
  const desired = { x: original.x1, y: original.y1 };
  const primary = neighbours.sort((a, b) => b.weight - a.weight)[0];
  if (primary) {
    desired[primary.axis] = primary.coordinate;
    const along = primary.axis === 'x' ? 'y' : 'x';
    const source = primary.b.source_box;
    if (Math.abs(original[`${along}1`] - source[`${along}1`]) <= tolerance) desired[along] = primary.b[`${along}1`];
    else if (Math.abs(original[`${along}2`] - source[`${along}2`]) <= tolerance) desired[along] = primary.b[`${along}2`] - (along === 'x' ? width : depth);
    else desired[along] += primary.b[`${along}1`] - source[`${along}1`];
  }
  const xs = [desired.x, original.x1, ...placed.flatMap(b => [b.x2 + gap, b.x1 - width - gap])];
  const ys = [desired.y, original.y1, ...placed.flatMap(b => [b.y2 + gap, b.y1 - depth - gap])];
  let best = null, score = Infinity;
  for (const x of xs) for (const y of ys) {
    const box = { x1: x, x2: x + width, y1: y, y2: y + depth };
    if (placed.some(b => intersects(box, b, gap))) continue;
    const distance = (x - desired.x) ** 2 + (y - desired.y) ** 2;
    if (distance < score) { best = box; score = distance; }
  }
  return best;
}

/** A manually marked boundary is authoritative. It does not need any detected
 * wall, axis alignment, opening host, or globally compatible scan constraints. */
export function buildMarkedRoomLayout(input, constraints = []) {
  const layout = structuredClone(input), notes = [], transforms = [];
  const thickness = Number(layout.dimension_defaults?.wall_thickness_m) || .15;
  const manual = layout.rooms.filter(room => room.boundary_source === 'manual');
  if (!manual.length) throw new Error('Mark a room first.');
  const generated = [], placed = [], exclusions = [];
  for (const room of manual) {
    const points = validateBoundary(roomCutoutOutline(room.points, room)), source = structuredClone(points), box = bounds(points);
    let sx = room.declared_width_m > 0 ? room.declared_width_m / (box.x2 - box.x1) : 1;
    let sy = room.declared_depth_m > 0 ? room.declared_depth_m / (box.y2 - box.y1) : 1;
    if (room.declared_area_m2 > 0) {
      const factor = room.declared_area_m2 / (polygonArea(points) * sx * sy);
      if (room.declared_width_m > 0 && room.declared_depth_m > 0) {
        if (Math.abs(factor - 1) > 1e-6) {
          notes.push(`${room.name}: width and depth take priority over the entered area.`);
          room.requested_area_m2 = room.declared_area_m2;
          delete room.declared_area_m2;
        }
      } else if (room.declared_width_m > 0) sy *= factor;
      else if (room.declared_depth_m > 0) sx *= factor;
      else { sx *= Math.sqrt(factor); sy *= Math.sqrt(factor); }
    }
    const target = place(box, (box.x2 - box.x1) * sx, (box.y2 - box.y1) * sy, placed, thickness, layout.image_transform?.meters_per_pixel);
    placed.push({ ...target, source_box: box });
    const map = p => ({ x: target.x1 + (p.x - box.x1) * sx, y: target.y1 + (p.y - box.y1) * sy });
    room.points = points.map(map);
    if (room.polygon) room.polygon = structuredClone(room.points);
    room.dimension_mode = 'marked-boundary';
    room.source_points = source;
    if (Math.hypot(target.x1 - box.x1, target.y1 - box.y1) > EPS) notes.push(`${room.name}: placement adjusted to keep the entered room sizes separate.`);
    const clearance = thickness + Math.min(.08, (layout.image_transform?.meters_per_pixel || 0) * 6);
    const originalRegion = offsetPolygon(source, clearance), outputRegion = offsetPolygon(room.points, thickness);
    exclusions.push(originalRegion, outputRegion);
    transforms.push({ room_id: room.id, source, originalRegion, map, sx, sy, target, box });
    const centreline = offsetPolygon(room.points, thickness / 2);
    const coverage = boundaryCoverage(source, input.walls || [],
      [...(input.objects || []), ...(input.doors || []).map(o => ({class:'door', ...o})),
        ...(input.windows || []).map(o => ({class:'window', ...o}))], input.image_transform?.meters_per_pixel);
    const hasBoundaryEvidence = coverage.filter(edge => edge.evidenced).length >= 2;
    centreline.forEach((start, i) => {
      const end = centreline[(i + 1) % centreline.length];
      const a = source[i], b = source[(i + 1) % source.length];
      const innerCutoutEdge = room.cutout && !(
        (Math.abs(a.x - b.x) < EPS && (Math.abs(a.x - box.x1) < EPS || Math.abs(a.x - box.x2) < EPS)) ||
        (Math.abs(a.y - b.y) < EPS && (Math.abs(a.y - box.y1) < EPS || Math.abs(a.y - box.y2) < EPS)));
      const preserveRuns = coverage[i].evidenced || (hasBoundaryEvidence && !innerCutoutEdge);
      const spans = preserveRuns ? coverage[i].runs : [[0, 1]];
      // Map gap endpoints from the floor edge, not the longer mitred wall, so
      // resizing preserves their relative positions and exact scaled width.
      const floorA = room.points[i], floorB = room.points[(i + 1) % room.points.length];
      const wallDelta = sub(end, start), wallLength = Math.hypot(wallDelta.x, wallDelta.y);
      const from = t => {
        if (t === 0) return start;
        if (t === 1) return end;
        const p = mix(floorA, floorB, t);
        const projection = ((p.x - start.x) * wallDelta.x + (p.y - start.y) * wallDelta.y) / (wallLength * wallLength);
        return mix(start, end, projection);
      };
      for (const [j, span] of spans.entries()) generated.push({ id: `marked-${room.id}-${i}-${j}`, room_id: room.id,
        source: 'marked-room', start: from(span[0]), end: from(span[1]), thickness,
        height: room.height || layout.dimension_defaults?.wall_height_m || 3 });
      if (spans.reduce((sum, [lo, hi]) => sum + hi - lo, 0) < 1 - EPS) {
        notes.push(`${room.name}: kept the existing open passage on edge ${i + 1}.`);
      }
    });
  }

  // Manual boundaries replace overlapping auto room labels; other scanned
  // rooms and walls remain available outside the edited regions.
  layout.rooms = layout.rooms.filter(room => manual.includes(room) || !transforms.some(t =>
    polygonsOverlap(room.points, t.source) || polygonsOverlap(room.points, manual.find(r => r.id === t.room_id).points)));
  layout.walls = [...(layout.walls || []).flatMap(wall => outsideSegments(wall, exclusions)), ...generated];
  // Deduplicate complete shared walls. Partial shared runs are split at their
  // endpoints so different room depths produce a stepped boundary.
  const unique = [];
  for (const wall of layout.walls) {
    let fragments = [wall];
    for (const existing of unique) {
      const d = sub(existing.end, existing.start), length = Math.hypot(d.x, d.y);
      fragments = fragments.flatMap(part => {
        if (Math.abs(existing.height - part.height) > EPS || Math.abs(existing.thickness - part.thickness) > EPS ||
            Math.abs(cross(d, sub(part.start, existing.start))) / length > EPS ||
            Math.abs(cross(d, sub(part.end, existing.start))) / length > EPS) return [part];
        const pd = sub(part.end, part.start), n = pd.x ** 2 + pd.y ** 2;
        const project = p => ((p.x - part.start.x) * pd.x + (p.y - part.start.y) * pd.y) / n;
        const a = Math.max(0, Math.min(project(existing.start), project(existing.end)));
        const b = Math.min(1, Math.max(project(existing.start), project(existing.end)));
        if (a >= b - EPS) return [part];
        return [[0, a], [b, 1]].filter(([lo, hi]) => hi - lo > EPS).map(([lo, hi], i) => ({ ...part,
          id: `${part.id}-split-${i}`, start: mix(part.start, part.end, lo), end: mix(part.start, part.end, hi) }));
      });
    }
    unique.push(...fragments);
  }
  layout.walls = unique;
  for (const key of ['objects', 'doors', 'windows']) if (layout[key]) layout[key] = layout[key].map(object => {
    const b = object.bbox, position = b ? { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 } : object.position;
    if (!position) return object;
    const transform = transforms.find(t => inside(position, t.source)) || transforms.find(t => inside(position, t.originalRegion));
    if (!transform) return object;
    const result = { ...object, ...(object.position ? { position: transform.map(object.position) } : {}) };
    if (b) {
      const a = transform.map({ x: b.x1, y: b.y1 }), z = transform.map({ x: b.x2, y: b.y2 });
      result.bbox = { x1: a.x, y1: a.y, x2: z.x, y2: z.y };
      if (/door|window/i.test(object.class || object.type || (key === 'objects' ? '' : key))) {
        const centre = { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 };
        const hosts = layout.walls.flatMap(wall => {
          const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y;
          const axis = Math.abs(dy) < EPS ? 'x' : Math.abs(dx) < EPS ? 'y' : null;
          if (!axis) return [];
          const normal = axis === 'x' ? 'y' : 'x';
          if (centre[axis] < Math.min(wall.start[axis], wall.end[axis]) - EPS || centre[axis] > Math.max(wall.start[axis], wall.end[axis]) + EPS) return [];
          const distance = Math.abs(centre[normal] - wall.start[normal]);
          if (distance > Math.max(.15, wall.thickness * 1.5)) return [];
          return [{ wall, normal, distance }];
        }).sort((a, b) => a.distance - b.distance);
        const host = hosts[0];
        if (host) {
          // Keep the same width, but centre the opening on its regenerated
          // wall. The mesh and wall cut then use the same normal coordinate.
          const shift = host.wall.start[host.normal] - centre[host.normal];
          result.bbox[`${host.normal}1`] += shift;
          result.bbox[`${host.normal}2`] += shift;
        }
      }
    }
    return result;
  });
  // An old footprint must not conceal or truncate resized floors.
  delete layout.footprint;
  if (manual.some(room => room.cutout)) layout.suppress_bounding_floor = true;
  const accepted = manual.flatMap(room => [...roomSizeConstraints(room).map(c => ({ ...c, measurement_basis: 'room-bounds',
    axis: c.id.startsWith('width-') ? 'x' : 'y' })), ...(room.declared_area_m2 > 0 ? [{
    id: `area-${room.id}`, type: 'area', room_id: room.id, target_m2: room.declared_area_m2,
  }] : [])]);
  const acceptedIds = new Set(accepted.map(c => c.id));
  layout.superseded_dimension_constraints = constraints.filter(c => !acceptedIds.has(c.id));
  if (layout.superseded_dimension_constraints.length) notes.push('Marked room dimensions take priority; other scan and length references were not enforced.');
  layout.dimension_constraints = accepted;
  const measurements = accepted.map(c => {
    const actual = c.type === 'area' ? polygonArea(manual.find(r => r.id === c.room_id).points) : Math.hypot(c.end.x - c.start.x, c.end.y - c.start.y);
    const target = c.type === 'area' ? c.target_m2 : c.target_m;
    return { id: c.id, type: c.type, target, actual, error: actual - target, unit: c.type === 'area' ? 'm2' : 'm' };
  });
  const report = { status: 'satisfied', mode: 'marked-boundary', constraints: measurements, notes,
    cutouts: manual.filter(room => room.cutout).map(room => ({ room_id: room.id, name: room.name,
      overall_area_m2: room.declared_width_m * room.declared_depth_m,
      removed_area_m2: room.cutout.width_m * room.cutout.depth_m, area_m2: polygonArea(room.points) })),
    max_error_m: Math.max(0, ...measurements.filter(c => c.unit === 'm').map(c => Math.abs(c.error))),
    max_error_m2: Math.max(0, ...measurements.filter(c => c.unit === 'm2').map(c => Math.abs(c.error))) };
  layout.dimension_constraint_report = report;
  layout.geometry_transform = { type: 'per-room', rooms: transforms.map(t => ({ room_id: t.room_id,
    scale_x: t.sx, scale_y: t.sy, source_origin: { x: t.box.x1, y: t.box.y1 }, target_origin: { x: t.target.x1, y: t.target.y1 } })) };
  return { layout, report };
}
