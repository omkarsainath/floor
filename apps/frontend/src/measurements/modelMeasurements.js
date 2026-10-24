// Geometry is already in metres by the time it reaches the viewer. Keep display
// measurements and rendered wall pieces derived from the same coordinates.
export const SQFT_PER_SQM = 1 / (0.3048 * 0.3048);

const finitePoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;

export function wallLength(wall) {
  return finitePoint(wall?.start) && finitePoint(wall?.end)
    ? Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) : 0;
}

export function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3 || !points.every(finitePoint)) return null;
  const area = Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
  return area > 0 ? area : null;
}

export function formatLength(meters) {
  const totalInches = Math.round(meters / 0.0254);
  return `${meters.toFixed(2)} m (${Math.floor(totalInches / 12)}′ ${totalInches % 12}″)`;
}

export function summarizeMeasurements(layout) {
  const status = layout.calibration?.status || 'unscaled';
  const summary = {
    status,
    source: layout.calibration?.source || layout.scale_source || 'unknown',
    walls: (layout.walls || []).map((wall, index) => ({
      id: wall.id || `wall-${index}`, length_m: wallLength(wall),
      midpoint: { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 },
      height: positive(wall.height, 3),
    })),
    rooms: (layout.rooms || []).flatMap((room, index) => {
      // Detection rectangles are not verified room boundaries.
      if (['detection_bbox', 'detector_bbox', 'bbox_estimate'].includes(room.boundary_source) || room.area_source === 'bbox') return [];
      const points = room.points || room.polygon;
      const area = polygonArea(points);
      if (area === null) return [];
      const declared = positive(room.declared_area_m2 ?? room.measurements?.declared_area_m2, null);
      return [{
        id: room.id || `room-${index}`, name: room.name || room.type || `Room ${index + 1}`,
        area_m2: area, area_sqft: area * SQFT_PER_SQM, declared_area_m2: declared,
        difference_percent: declared ? (area - declared) / declared * 100 : null,
        boundary_source: room.boundary_source || 'provided_polygon',
        midpoint: { x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
          y: points.reduce((sum, p) => sum + p.y, 0) / points.length },
      }];
    }),
  };
  // A saved solver report is only a record of a previous solve. Recompute from
  // the same metre coordinates supplied to the renderer, including on import.
  const roomById = new Map(summary.rooms.map(room => [room.id, room]));
  const wallById = new Map((layout.walls || []).map(wall => [wall.id, wall]));
  const anchorCoordinate = anchor => {
    const wall = wallById.get(anchor?.wall_id);
    if (!wall || !['x', 'y'].includes(anchor.axis)) return null;
    if (anchor.kind === 'endpoint' && ['start', 'end'].includes(anchor.endpoint)) return wall[anchor.endpoint]?.[anchor.axis] ?? null;
    if (anchor.kind === 'face' && [-1, 0, 1].includes(anchor.side)) return wall.start?.[anchor.axis] + anchor.side * Number(wall.thickness) / 2;
    return null;
  };
  summary.constraints = (layout.dimension_constraints || []).map((constraint, index) => {
    const area = constraint.type === 'area';
    const room = area ? roomById.get(constraint.room_id) : null;
    const target = area ? constraint.target_m2 : constraint.target_m;
    const pointsValid = finitePoint(constraint.start) && finitePoint(constraint.end);
    const bound = constraint.start_anchor || constraint.end_anchor;
    const a = anchorCoordinate(constraint.start_anchor), b = anchorCoordinate(constraint.end_anchor);
    const measuredRoom = constraint.measurement_basis === 'room-bounds'
      ? (layout.rooms || []).find(r => r.id === constraint.room_id) : null;
    const roomCoordinates = (measuredRoom?.points || measuredRoom?.polygon || []).map(p => p[constraint.axis]);
    const actual = area ? room?.area_m2
      : constraint.measurement_basis === 'room-bounds' ? (roomCoordinates.length ? Math.max(...roomCoordinates) - Math.min(...roomCoordinates) : null)
      : constraint.type === 'length' && bound ? (Number.isFinite(a) && Number.isFinite(b) ? Math.abs(b - a) : null)
      : constraint.type === 'length' && pointsValid ? wallLength(constraint) : null;
    const valid = Number.isFinite(target) && target > 0 && Number.isFinite(actual);
    const error = valid ? actual - target : null;
    return {
      id: constraint.id || `dimension-${index}`,
      type: constraint.type,
      label: constraint.label || constraint.text || (area ? room?.name : null) || `Span ${index + 1}`,
      target, actual: Number.isFinite(actual) ? actual : null,
      error, unit: area ? 'm2' : 'm',
      status: !valid ? 'unresolved' : Math.abs(error) <= 1e-6 ? 'satisfied' : 'mismatch',
      midpoint: area ? room?.midpoint : pointsValid ? {
        x: (constraint.start.x + constraint.end.x) / 2,
        y: (constraint.start.y + constraint.end.y) / 2,
      } : null,
    };
  });
  summary.constraint_status = !summary.constraints.length ? 'none'
    : summary.constraints.every(constraint => constraint.status === 'satisfied') ? 'satisfied' : 'mismatch';
  return summary;
}

// Return the signed projection of an opening on a wall. Signed distances are
// essential: a wide box can straddle the wall even if none of its corners do.
export function openingSpanOnWall(wall, bbox) {
  const length = wallLength(wall);
  if (!length || !bbox || !['x1', 'y1', 'x2', 'y2'].every(key => Number.isFinite(bbox[key]))) return null;
  const ux = (wall.end.x - wall.start.x) / length;
  const uy = (wall.end.y - wall.start.y) / length;
  const projections = [[bbox.x1, bbox.y1], [bbox.x1, bbox.y2], [bbox.x2, bbox.y1], [bbox.x2, bbox.y2]]
    .map(([x, y]) => ({ along: (x - wall.start.x) * ux + (y - wall.start.y) * uy,
      across: -(x - wall.start.x) * uy + (y - wall.start.y) * ux }));
  const minAcross = Math.min(...projections.map(p => p.across));
  const maxAcross = Math.max(...projections.map(p => p.across));
  const halfThickness = positive(wall.thickness, 0.15) / 2;
  if (minAcross > halfThickness + 0.02 || maxAcross < -halfThickness - 0.02) return null;
  const start = Math.max(0, Math.min(...projections.map(p => p.along)));
  const end = Math.min(length, Math.max(...projections.map(p => p.along)));
  if (end <= start + 1e-6) return null;
  return { start, end, length, ux, uy, distance: Math.abs((minAcross + maxAcross) / 2) };
}

const matchesOpeningDirection = (span, box) => {
  const width = Math.abs(box.x2 - box.x1), depth = Math.abs(box.y2 - box.y1);
  return !(width > depth * 2 && Math.abs(span.ux) < 0.5)
    && !(depth > width * 2 && Math.abs(span.uy) < 0.5);
};

// A plan often stops each wall at a door jamb. Those gaps still have masonry
// above the opening. Derive temporary spans for rendering, without joining the
// measured walls or filling unsupported gaps in the saved floor plan.
export function openingGapWalls(walls, openings) {
  const result = [], seen = new Set();
  for (let i = 0; i < walls.length; i++) {
    const first = walls[i], length = wallLength(first);
    if (length < 1e-6) continue;
    const ux = (first.end.x - first.start.x) / length, uy = (first.end.y - first.start.y) / length;
    const along = p => (p.x - first.start.x) * ux + (p.y - first.start.y) * uy;
    const across = p => -(p.x - first.start.x) * uy + (p.y - first.start.y) * ux;
    const sameLine = wall => wallLength(wall) > 1e-6
      && Math.max(Math.abs(across(wall.start)), Math.abs(across(wall.end))) <= Math.max(.015, Math.min(positive(first.thickness,.15),positive(wall.thickness,.15))*.45)
      && Math.abs(((wall.end.x - wall.start.x) * ux + (wall.end.y - wall.start.y) * uy) / wallLength(wall)) > 0.999;
    for (let j = i + 1; j < walls.length; j++) {
      const second = walls[j];
      if (!sameLine(second)) continue;
      // A different level or wall section cannot establish the same header.
      if (Math.abs(positive(first.height, 3) - positive(second.height, 3)) > 0.01
        || Math.abs(positive(first.thickness, 0.15) - positive(second.thickness, 0.15)) > Math.max(.015, Math.min(positive(first.thickness,.15),positive(second.thickness,.15))*.5)
        || Math.abs((Number(first.yOffset) || 0) - (Number(second.yOffset) || 0)) > 0.01) continue;
      const lo = Math.min(along(second.start), along(second.end));
      const hi = Math.max(along(second.start), along(second.end));
      const start = lo > length ? length : hi < 0 ? hi : null;
      const end = lo > length ? lo : hi < 0 ? 0 : null;
      if (start === null || end - start < 1e-6) continue;
      // Only neighbouring wall ends count, never a pair across a third wall.
      if (walls.some((wall, index) => index !== i && index !== j && sameLine(wall)
        && Math.min(end, Math.max(along(wall.start), along(wall.end)))
          - Math.max(start, Math.min(along(wall.start), along(wall.end))) > 1e-6)) continue;
      const gap = { ...first,
        start: { x: first.start.x + ux * start, y: first.start.y + uy * start },
        end: { x: first.start.x + ux * end, y: first.start.y + uy * end },
        parentWallId: first.id || `wall-${i}`, isDetectedGap: true,
      };
      // At a corner jamb, the detected box can end at the frame/inside face
      // while the wall stops at the joining centreline. Allow that wall-sized
      // discrepancy only when the opening covers most of the actual gap.
      const tolerance = Math.max(0.03, Math.min(0.2, positive(first.thickness, 0.15) * 1.5));
      const supportingOpenings = openings.filter(opening => {
        const span = openingSpanOnWall(gap, opening.bbox);
        if (!span || !matchesOpeningDirection(span, opening.bbox)) return false;
        const { x1, y1, x2, y2 } = opening.bbox;
        const positions = [{ x: x1, y: y1 }, { x: x1, y: y2 }, { x: x2, y: y1 }, { x: x2, y: y2 }].map(along);
        return Math.min(...positions) >= start-tolerance && Math.max(...positions) <= end+tolerance;
      });
      if (!supportingOpenings.length) continue;
      // A glazed door and its side-light often share one continuous gap.
      // Union their spans, but never bridge an unsupported interval between
      // unrelated opening symbols.
      const spans=supportingOpenings.map(o=>openingSpanOnWall(gap,o.bbox)).sort((a,b)=>a.start-b.start);
      let reach=0, supported=0, continuous=true;
      for(const span of spans) {
        if(span.start-reach>tolerance) {continuous=false;break;}
        supported+=Math.max(0,span.end-Math.max(reach,span.start));
        reach=Math.max(reach,span.end);
      }
      if(!continuous || end-start-reach>tolerance || supported/(end-start)<.8) continue;
      const key = [gap.start, gap.end].map(p => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ ...gap, supportingOpenings });
    }
  }
  return result;
}

// Some openings end at a return/corner, not at a second collinear fragment.
// These spans exist only in the renderer: do not alter measured wall geometry
// or reuse this fallback to infer room/ceiling boundaries.
function cornerOpeningGapWalls(walls, openings, existingGaps) {
  const result = [];
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  for (const opening of openings) {
    const box = opening.bbox;
    if (!box || !['x1', 'y1', 'x2', 'y2'].every(k => Number.isFinite(box[k]))) continue;
    const dx = box.x2 - box.x1, dy = box.y2 - box.y1;
    const depth = Math.min(dx, dy), span = Math.max(dx, dy);
    // A square swing footprint does not establish the wall orientation.
    if (depth <= 0 || span < depth * 2.5) continue;
    const u = dx > dy ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const start = dx > dy ? { x: box.x1, y: (box.y1 + box.y2) / 2 }
      : { x: (box.x1 + box.x2) / 2, y: box.y1 };
    const end = { x: start.x + u.x * span, y: start.y + u.y * span };
    const dot = p => p.x * u.x + p.y * u.y;
    const subtract = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
    const supports = (p, side) => walls.flatMap((wall, index) => {
      const length = wallLength(wall), thickness = positive(wall.thickness, .15);
      if (length < thickness || depth < thickness * .4 || depth > thickness * 2.5) return [];
      const v = { x: (wall.end.x - wall.start.x) / length, y: (wall.end.y - wall.start.y) / length };
      const tolerance = Math.max(.03, Math.min(.2, thickness * 1.5));
      let q, perpendicular = false;
      if (Math.abs(cross(u, v)) < .045) {
        q = [wall.start, wall.end].sort((a, b) => Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
        const other = q === wall.start ? wall.end : wall.start;
        // The support must point away from, not into, the opening.
        if (side * dot(subtract(other, q)) <= 0) return [];
        if (Math.abs(cross(subtract(q, p), u)) > thickness * .45) return [];
      } else if (Math.abs(cross(u, v)) > .9) {
        const offset = subtract(wall.start, p), det = cross(u, v);
        const along = cross(offset, v) / det, onWall = cross(offset, u) / det;
        if (onWall < -thickness * .75 || onWall > length + thickness * .75) return [];
        q = { x: p.x + u.x * along, y: p.y + u.y * along };
        perpendicular = true;
      } else return [];
      const distance = Math.hypot(q.x-p.x, q.y-p.y);
      return distance <= tolerance ? [{ wall, index, q, perpendicular, distance, thickness }] : [];
    });
    const choices = [];
    for (const left of supports(start, -1)) for (const right of supports(end, 1)) {
      if (left.index === right.index || !(left.perpendicular || right.perpendicular)) continue;
      if (Math.abs(positive(left.wall.height, 3) - positive(right.wall.height, 3)) > .01
        || Math.abs((Number(left.wall.yOffset) || 0) - (Number(right.wall.yOffset) || 0)) > .01) continue;
      // Prefer the aligned host for thickness, paint and face orientation.
      const host = !left.perpendicular ? left : right;
      const gap = { ...host.wall, start: { ...left.q }, end: { ...right.q },
        parentWallId: host.wall.id || `wall-${host.index}`, isDetectedGap: true,
        isCornerOpeningGap: true, supportingOpenings: [opening] };
      // Project the corner intersection onto the aligned host's centreline.
      if (!left.perpendicular || !right.perpendicular) {
        const p = host.q;
        for (const k of ['start', 'end']) {
          const t = dot(subtract(gap[k], p));
          gap[k] = { x: p.x + u.x*t, y: p.y + u.y*t };
        }
      }
      const length = wallLength(gap), cut = openingSpanOnWall(gap, box);
      if (!cut || (cut.end-cut.start)/length < .8) continue;
      // No duplicate header over an existing wall or another supported gap.
      const occupied = [...walls, ...existingGaps, ...result].some(w => {
        const l = wallLength(w);
        if (!l || Math.abs(cross(u, { x:(w.end.x-w.start.x)/l, y:(w.end.y-w.start.y)/l })) > .045) return false;
        if (Math.abs(cross(subtract(w.start, gap.start), u)) > Math.min(positive(w.thickness,.15),host.thickness)*.45) return false;
        const positions = [w.start, w.end].map(p => dot(subtract(p, gap.start)));
        return Math.min(length, Math.max(...positions))-Math.max(0, Math.min(...positions)) > .01;
      });
      if (occupied) continue;
      if (!host.perpendicular && dot(subtract(host.wall.end,host.wall.start)) < 0) [gap.start,gap.end] = [gap.end,gap.start];
      choices.push({ gap, distance: left.distance + right.distance });
    }
    choices.sort((a,b) => a.distance-b.distance);
    if (choices.length) result.push(choices[0].gap);
  }
  return result;
}

// Split in both horizontal and vertical directions so overlapping openings do
// not add opaque fill over each other. Original wall endpoints stay unchanged.
// openings: [{ bbox, sillBase, winTop, id }], with heights in metres.
export function resolveOpeningGeometry(walls = [], openings = []) {
  const gaps = openingGapWalls(walls, openings);
  const supported = [...gaps, ...cornerOpeningGapWalls(walls, openings, gaps)];
  return openings.map(opening => {
    // A shared door/side-light gap must retain its separate opening widths.
    const candidates = supported.filter(gap => gap.supportingOpenings?.length === 1 && gap.supportingOpenings[0] === opening);
    if (!candidates.length) return opening;
    const gap = candidates.sort((a, b) => openingSpanOnWall(a, opening.bbox).distance - openingSpanOnWall(b, opening.bbox).distance)[0];
    const dx = gap.end.x - gap.start.x, dy = gap.end.y - gap.start.y;
    // Axis-aligned boxes cannot express a rotated door footprint exactly.
    if (Math.abs(dx) > 1e-6 && Math.abs(dy) > 1e-6) return opening;
    const axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y', normal = axis === 'x' ? 'y' : 'x';
    const box = { ...opening.bbox };
    const half = Math.max(positive(gap.thickness, .15), Math.abs(box[`${normal}2`] - box[`${normal}1`])) / 2;
    box[`${axis}1`] = Math.min(gap.start[axis], gap.end[axis]);
    box[`${axis}2`] = Math.max(gap.start[axis], gap.end[axis]);
    box[`${normal}1`] = gap.start[normal] - half;
    box[`${normal}2`] = gap.start[normal] + half;
    return { ...opening, bbox: box };
  });
}

function assignWallOpenings(walls, openings) {
  openings = resolveOpeningGeometry(walls, openings);
  const gaps = openingGapWalls(walls, openings);
  const renderWalls = [...walls, ...gaps, ...cornerOpeningGapWalls(walls, openings, gaps)];
  const assignments = renderWalls.map(() => []);
  openings.forEach(opening => {
    const candidates = renderWalls.flatMap((wall, index) => {
      const span = openingSpanOnWall(wall, opening.bbox);
      if (!span) return [];
      // A narrow door/window bbox encodes its wall orientation. Do not cut a
      // perpendicular wall merely because the box touches a corner.
      if (!matchesOpeningDirection(span, opening.bbox)) return [];
      return [{ wall, index, span }];
    }).sort((a, b) => a.span.distance - b.span.distance);
    const host = candidates[0];
    if (!host) return;
    candidates.forEach(candidate => {
      const { wall, span, index } = candidate;
      // Permit adjoining fragments on the same centreline, not a nearby
      // parallel wall or a perpendicular wall meeting this window.
      const parallel = Math.abs(span.ux * host.span.ux + span.uy * host.span.uy) > 0.999;
      const lineDistance = Math.abs(-(wall.start.x - host.wall.start.x) * host.span.uy
        + (wall.start.y - host.wall.start.y) * host.span.ux);
      if (!parallel || lineDistance > Math.max(.015,Math.min(positive(wall.thickness,.15),positive(host.wall.thickness,.15))*.45)) return;
      const height = positive(wall.height, 3);
      const bottom = Math.max(0, Math.min(height, Number(opening.sillBase) || 0));
      const top = Math.max(bottom, Math.min(height, Number(opening.winTop) || height));
      const jambTolerance = Math.max(.03,Math.min(.2,positive(wall.thickness,.15)*1.5));
      if (top > bottom) assignments[index].push({ ...span, bottom, top,
        // Detection can stop a few pixels short of the box. The validated
        // facing jambs set the gap extent; don't add floor-to-ceiling slivers.
        ...(wall.supportingOpenings?.includes(opening) ? {
          start: span.start<=jambTolerance ? 0 : span.start,
          end: span.length-span.end<=jambTolerance ? span.length : span.end, supportsGap: true } : {}) });
    });
  });
  return { renderWalls, assignments };
}

// Plan-view wall spans at openings, using the same host selection as the 3D
// wall cutter. These are projections, not additional floor-to-ceiling walls.
export function openingWallSpans(walls = [], openings = []) {
  const { renderWalls, assignments } = assignWallOpenings(walls,
    openings.map(opening => ({ ...opening, sillBase: 0, winTop: Infinity })));
  return renderWalls.flatMap(({ supportingOpenings, ...wall }, index) => {
    const cuts = assignments[index];
    if (wall.isDetectedGap && !cuts.some(cut => cut.supportsGap)) return [];
    const intervals = [];
    for (const cut of [...cuts].sort((a, b) => a.start - b.start)) {
      const last = intervals.at(-1);
      if (last && cut.start <= last.end + 1e-6) last.end = Math.max(last.end, cut.end);
      else intervals.push({ start: cut.start, end: cut.end });
    }
    const length = wallLength(wall);
    const point = distance => ({
      x: wall.start.x + (wall.end.x - wall.start.x) * distance / length,
      y: wall.start.y + (wall.end.y - wall.start.y) * distance / length,
    });
    return intervals.map(span => ({ ...wall, start: point(span.start), end: point(span.end) }));
  });
}

export function buildWallSegments(walls = [], openings = []) {
  const { renderWalls, assignments } = assignWallOpenings(walls, openings);
  return renderWalls.flatMap(({ supportingOpenings, ...wall }, index) => {
    const length = wallLength(wall);
    if (length <= 1e-6) return [];
    const cuts = assignments[index];
    const height = positive(wall.height, 3);
    const wallId = wall.parentWallId || wall.id || `wall-${index}`;
    if (wall.isDetectedGap && !cuts.some(cut => cut.supportsGap)) return [];
    if (wall.isDetectedGap) {
      let reach=0;
      for(const cut of cuts.filter(c=>c.supportsGap).sort((a,b)=>a.start-b.start)) {
        if(cut.start>reach+1e-6) return [];
        reach=Math.max(reach,cut.end);
      }
      if(reach<length-1e-6) return [];
    }
    // If another, closer wall owns the opening, this candidate is not masonry.
    if (!cuts.length) return wall.isDetectedGap ? [] : [{ ...wall, parentWallId: wallId }];
    const ux = (wall.end.x - wall.start.x) / length, uy = (wall.end.y - wall.start.y) / length;
    const boundaries = [...new Set([0, length, ...cuts.flatMap(cut => [cut.start, cut.end])])].sort((a, b) => a - b);
    const segments = [];
    for (let i = 1; i < boundaries.length; i++) {
      const start = boundaries[i - 1], end = boundaries[i];
      if (end - start < 1e-6) continue;
      const activeCuts = cuts.filter(cut => cut.start < end - 1e-6 && cut.end > start + 1e-6)
        .sort((a, b) => a.bottom - b.bottom);
      let cursor = 0;
      const add = (bottom, top) => {
        if (top - bottom < 1e-6) return;
        segments.push({ ...wall, parentWallId: wallId,
          start: { x: wall.start.x + ux * start, y: wall.start.y + uy * start },
          end: { x: wall.start.x + ux * end, y: wall.start.y + uy * end },
          height: top - bottom, yOffset: (Number(wall.yOffset) || 0) + bottom,
          isOpeningFill: activeCuts.length > 0 });
      };
      activeCuts.forEach(cut => { add(cursor, cut.bottom); cursor = Math.max(cursor, cut.top); });
      add(cursor, height);
    }
    return segments;
  });
}
