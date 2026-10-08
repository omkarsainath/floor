// Wall selections are stored in the original wall's metre coordinate system,
// not screen pixels or the shorter segments created around doors/windows.
const EPS = 1e-7;
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const identifier = value => (typeof value === 'string' && value.trim() && value.trim().length <= 128)
  ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : null;

export function normalizeWallPanelRegions(value) {
  if (!Array.isArray(value)) return [];
  const result = [], seen = new Set();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const id = identifier(candidate.id), wallId = identifier(candidate.wallId), styleId = identifier(candidate.styleId);
    const { startM, endM, bottomM, topM } = candidate;
    if (!id || !wallId || !styleId || seen.has(id)) continue;
    if (![startM, endM, bottomM, topM].every(Number.isFinite)
      || startM < 0 || bottomM < 0 || endM - startM < 0.001 - EPS || topM - bottomM < 0.001 - EPS) continue;
    result.push({ id, wallId, startM, endM, bottomM, topM, styleId });
    seen.add(id);
    if (result.length === 32) break;
  }
  return result;
}

export function wallRegionFrame(wall) {
  if (!finitePoint(wall?.start) || !finitePoint(wall?.end)) return null;
  const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dy);
  if (length < EPS) return null;
  return { origin: { x: wall.start.x, y: wall.start.y }, tangent: { x: dx / length, y: dy / length }, length };
}

export function projectWallRegionPoint(wall, point) {
  const frame = wallRegionFrame(wall);
  if (!frame || !point || ![point.x, point.y, point.z].every(Number.isFinite)) return null;
  return {
    alongM: (point.x - frame.origin.x) * frame.tangent.x + (point.z - frame.origin.y) * frame.tangent.y,
    heightM: point.y,
  };
}

export function createWallPanelRegion(wall, a, b, { id, styleId } = {}) {
  const frame = wallRegionFrame(wall), first = projectWallRegionPoint(wall, a), last = projectWallRegionPoint(wall, b);
  if (!frame || !first || !last) return null;
  const floor = Number.isFinite(wall.yOffset) ? Math.max(0, wall.yOffset) : 0;
  const height = Number.isFinite(wall.height) ? wall.height : 3;
  if (height <= 0) return null;
  const snap = (number, low, high) => Math.max(low, Math.min(high, Math.round(number * 1000) / 1000));
  return normalizeWallPanelRegions([{
    id, wallId: wall.id, styleId,
    startM: snap(Math.min(first.alongM, last.alongM), 0, frame.length),
    endM: snap(Math.max(first.alongM, last.alongM), 0, frame.length),
    bottomM: snap(Math.min(first.heightM, last.heightM), floor, floor + height),
    topM: snap(Math.max(first.heightM, last.heightM), floor, floor + height),
  }])[0] || null;
}

/** Clip only real room-facing wall pieces; the missing opening pieces stay missing. */
export function clipWallSurfacesToRegion(surfaces, wall, value) {
  const region = normalizeWallPanelRegions([value])[0], frame = wallRegionFrame(wall);
  if (!region || !frame || String(wall.id) !== region.wallId || !Array.isArray(surfaces)) return [];
  const project = p => (p.x - frame.origin.x) * frame.tangent.x + (p.y - frame.origin.y) * frame.tangent.y;
  const offset = p => (p.x - frame.origin.x) * -frame.tangent.y + (p.y - frame.origin.y) * frame.tangent.x;
  const halfThickness = Number.isFinite(wall.thickness) && wall.thickness > 0 ? wall.thickness / 2 : 0.075;
  const wallFloor = Number.isFinite(wall.yOffset) ? Math.max(0, wall.yOffset) : 0;
  const wallTop = wallFloor + (Number.isFinite(wall.height) ? wall.height : 3);
  const result = [];
  for (const surface of surfaces) {
    if (String(surface?.parentWallId ?? surface?.wallId ?? surface?.id) !== region.wallId
      || !finitePoint(surface?.start) || !finitePoint(surface?.end)) continue;
    const a = project(surface.start), b = project(surface.end), da = offset(surface.start), db = offset(surface.end);
    // A matching ID alone is insufficient: reject a nonparallel or unrelated face.
    if (Math.abs(a - b) < EPS || Math.abs(da - db) > 1e-5 || Math.abs(da) > halfThickness + 0.015) continue;
    const lo = Math.max(0, region.startM, Math.min(a, b)), hi = Math.min(frame.length, region.endM, Math.max(a, b));
    const surfaceFloor = Number.isFinite(surface.yOffset) ? surface.yOffset : 0;
    const surfaceHeight = Number.isFinite(surface.height) ? surface.height : 3;
    const bottom = Math.max(wallFloor, region.bottomM, surfaceFloor);
    const top = Math.min(wallTop, region.topM, surfaceFloor + surfaceHeight);
    if (hi - lo < EPS || top - bottom < EPS) continue;
    const at = along => {
      const t = (along - a) / (b - a);
      return { x: surface.start.x + (surface.end.x - surface.start.x) * t,
        y: surface.start.y + (surface.end.y - surface.start.y) * t };
    };
    result.push({ ...surface, start: at(a < b ? lo : hi), end: at(a < b ? hi : lo),
      yOffset: bottom, height: top - bottom, wallPanelRegionId: region.id });
  }
  return result;
}
