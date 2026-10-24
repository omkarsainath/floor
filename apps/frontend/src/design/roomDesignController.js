import { normalizeRoomDesign, getFinishStyle, inferRoomType } from './roomDesignCatalog.js';
import { buildRoomFinish, disposeRoomFinish } from './finishGeometry.js';
import { isDesignableRoom, roomWallSurfaces, selectedWallSurfaces } from './roomSurfaces.js';
import { persistLayout } from '../state/projectPersistence.js';
import { isProfileCeiling } from './ceilingTypes.js';
import { getCeilingHeights } from './ceilingProfiles.js';
import * as THREE from 'three';
import { buildCeilingLight, normalizeCeilingLights, disposeCeilingLight } from './ceilingLights.js';
import { validateCeilingLight, orientCeilingLight } from './ceilingLightPlacement.js';
import { clipWallSurfacesToRegion, normalizeWallPanelRegions, wallRegionFrame } from './wallPanelRegions.js';

export function createRoomDesignController({ scene, getLayout, getWallSegments, getBaseFloor = () => null, save = persistLayout }) {
  const groups = new Map();
  let ceilingsVisible = false;
  const roomFor = id => (getLayout().rooms || []).find(room => room.id === id);
  const directSurfaces = (wallId, side) => selectedWallSurfaces((getLayout().walls || []).find(w=>String(w.id)===String(wallId)),getWallSegments(),side);
  const surfacesFor = (room, selection = room?.design) => {
    const surfaces = roomWallSurfaces(room, getWallSegments());
    if (![1,-1].includes(selection?.accentWallSide)) return surfaces;
    return [...surfaces.filter(s=>String(s.parentWallId)!==String(selection.accentWallId)),
      ...directSurfaces(selection.accentWallId, selection.accentWallSide)];
  };
  function getWallChoices(roomId, selection) {
    const room = roomFor(roomId); if (!room) return [];
    const surfaces = surfacesFor(room, selection), ids = [...new Set(surfaces.map(s => s.parentWallId))];
    return ids.map(id => {
      const index = (getLayout().walls || []).findIndex(wall => wall.id === id);
      const area = surfaces.filter(s => s.parentWallId === id).reduce((sum, s) => sum + Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y) * s.height, 0);
      return { id, label: `${index >= 0 ? `W${index + 1}` : id} · ${area.toFixed(2)} m² wall face`, area };
    });
  }
  function setCeilingsVisible(visible) {
    ceilingsVisible = Boolean(visible);
    groups.forEach(group => group.traverse(node => {
      if (node.userData.type !== 'ceiling') return;
      // Fixtures stay visible and lit in the overhead cutaway, independently
      // of the ceiling slab. Their own on/off switch controls illumination.
      for (let parent = node; parent; parent = parent.parent) if (parent.userData.isCeilingLight) return;
      node.visible = ceilingsVisible;
    }));
  }
  function remove(roomId) {
    const old = groups.get(roomId);
    if (old) { scene.remove(old); disposeRoomFinish(old); groups.delete(roomId); }
    const floor = getBaseFloor(roomId); if (floor) floor.visible = true;
  }
  function install(roomId, group, selection) {
    remove(roomId);
    if (group) { scene.add(group); groups.set(roomId, group); }
    const floor = getBaseFloor(roomId); if (floor) floor.visible = !selection?.floor;
    setCeilingsVisible(ceilingsVisible);
  }
  function build(room, selection) {
    for (const region of selection.wallPanelRegions || []) {
      const validation = validateRegion(room.id, region, selection.wallPanelRegions);
      if (!validation.ok) throw new Error(validation.message);
    }
    const group = buildRoomFinish({ room, walls: getLayout().walls, wallSurfaces: surfacesFor(room, selection), selection, styleLookup: getFinishStyle });
    try {
      for (const placement of selection.ceilingLights || []) {
        const attachment = validateCeilingLight(room, group, placement, selection.ceilingLights);
        if (!attachment.ok) throw new Error(attachment.message);
        const light = orientCeilingLight(buildCeilingLight({ placement, ceilingY: attachment.ceilingY, roomId: room.id }), placement, attachment);
        group.add(light);
        if (new THREE.Box3().setFromObject(light).min.y <= 0.1) throw new Error('The light would reach the floor. Reduce its hanging length.');
      }
      return group;
    } catch (error) { disposeRoomFinish(group); throw error; }
  }
  function previewLight(roomId, value) {
    const room = roomFor(roomId), placement = normalizeCeilingLights([value])[0];
    if (!room || !placement) return { ok: false, message: 'Choose a valid light and a position in this room.' };
    return validateCeilingLight(room, groups.get(roomId), placement, room.design?.ceilingLights || []);
  }
  function updateLight(roomId, lightId, settings) {
    const room = roomFor(roomId), group = groups.get(roomId);
    const existing = room?.design?.ceilingLights?.find(light => light.id === lightId);
    if (!existing || !group) return { ok: false, message: 'This light is no longer available.' };
    const placement = normalizeCeilingLights([{ ...existing, ...settings, id: existing.id }])[0];
    if (!placement) return { ok: false, message: 'Enter valid light settings.' };
    const lights = room.design.ceilingLights.map(light => light.id === lightId ? placement : light);
    const attachment = validateCeilingLight(room, group, placement, lights);
    if (!attachment.ok) return attachment;
    let replacement;
    try {
      replacement = orientCeilingLight(buildCeilingLight({ placement, ceilingY: attachment.ceilingY, roomId }), placement, attachment);
      if (new THREE.Box3().setFromObject(replacement).min.y <= .1) throw new Error('The light would reach the floor. Reduce its hanging length.');
    } catch (error) {
      disposeCeilingLight(replacement);
      return { ok: false, message: error.message };
    }
    const previous = room.design;
    room.design = { ...previous, ceilingLights: lights };
    let saved = false;
    try { saved = save(getLayout()); } catch { /* Restore the last saved fixture below. */ }
    if (!saved) {
      room.design = previous; disposeCeilingLight(replacement);
      return { ok: false, message: 'Local save failed. The previous light was kept.' };
    }
    const old = group.children.find(node => node.userData.ceilingLightId === lightId);
    group.add(replacement); disposeCeilingLight(old);
    return { ok: true, message: 'Light updated and saved.' };
  }
  function validateRegion(roomId, value, regions = roomFor(roomId)?.design?.wallPanelRegions || []) {
    const room = roomFor(roomId), region = normalizeWallPanelRegions([value])[0];
    const wall = (getLayout().walls || []).find(w => String(w.id) === region?.wallId);
    if (!room || !region || !wall || getFinishStyle(region.styleId)?.category !== 'wallPanel') return { ok: false, message: 'Choose a valid panel style and a wall in this room.' };
    const frame = wallRegionFrame(wall), surfaces = surfacesFor(room).filter(s => String(s.parentWallId) === region.wallId);
    if (!surfaces.length) return { ok: false, message: 'This wall does not have an inside face in the selected room.' };
    const lengths = surfaces.flatMap(s => [s.start, s.end]).map(p => (p.x - frame.origin.x) * frame.tangent.x + (p.y - frame.origin.y) * frame.tangent.y);
    if (region.startM < Math.min(...lengths) - 0.002 || region.endM > Math.max(...lengths) + 0.002
      || region.topM > (room.height || 3) + 0.002) return { ok: false, message: 'Keep the marked area within this room’s wall face.' };
    if (regions.some(other => other.id !== region.id && String(other.wallId) === region.wallId
      && Math.min(region.endM, other.endM) - Math.max(region.startM, other.startM) > 0.001
      && Math.min(region.topM, other.topM) - Math.max(region.bottomM, other.bottomM) > 0.001)) {
      return { ok: false, message: 'This area overlaps an existing panel region. Remove that region or mark a separate area.' };
    }
    const clipped = clipWallSurfacesToRegion(surfaces, wall, region);
    const areaM2 = clipped.reduce((sum, s) => sum + Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y) * s.height, 0);
    if (areaM2 < 0.0001) return { ok: false, message: 'The marked area contains no wall surface. Door and window openings cannot be paneled.' };
    return { ok: true, region, wall, surfaces: clipped, areaM2 };
  }
  function rebuild() {
    const rooms = (getLayout().rooms || []).filter(isDesignableRoom);
    [...groups.keys()].filter(id => !rooms.some(room => room.id === id)).forEach(remove);
    for (const room of rooms) {
      if (!room.design) { remove(room.id); continue; }
      const selection = normalizeRoomDesign(room.design, room.design.roomType || inferRoomType(room));
      try { install(room.id, build(room, selection), selection); }
      catch (error) { remove(room.id); console.warn('Room finish could not be restored:', room.id, error); }
    }
  }
  function apply(roomId, value) {
    const room = roomFor(roomId);
    if (!room || !isDesignableRoom(room)) return { ok: false, message: 'A valid inside-room outline is needed. Correct it in the tracer first.' };
    const selection = normalizeRoomDesign(value, value?.roomType || inferRoomType(room));
    if (!selection.roomType) return { ok: false, message: 'Choose the room type before applying finishes.' };
    for (const [field, label] of [['wallPanelRegions', 'marked wall areas'], ['ceilingLights', 'ceiling lights']]) {
      if (Array.isArray(value?.[field]) && value[field].length !== (selection[field]?.length || 0)) {
        return { ok: false, message: `Some ${label} are invalid or exceed the supported count. Correct or remove them before saving.` };
      }
    }
    if (selection.ceiling && selection.ceilingDropM === undefined) selection.ceilingDropM = 0.15;
    if (((selection.wallPanel && !selection.wallPanelRegions?.length) || selection.tvPanel || getFinishStyle(selection.ceiling)?.pattern === 'cascade')
      && !getWallChoices(roomId, selection).some(w => String(w.id) === String(selection.accentWallId))) {
      return { ok: false, message: 'Choose a wall that touches this room. Unmatched walls need boundary correction in the tracer.' };
    }
    const height = room.height || 3;
    for (const region of selection.wallPanelRegions || []) {
      const validation = validateRegion(roomId, region, selection.wallPanelRegions);
      if (!validation.ok) return validation;
    }
    if (selection.ceiling && selection.ceilingDropM >= height - 0.1) return { ok: false, message: 'The ceiling drop must leave positive room height.' };
    const ceilingStyle = getFinishStyle(selection.ceiling);
    if (isProfileCeiling(ceilingStyle) && getCeilingHeights({ roomHeight: height, style: ceilingStyle, selection }).minHeightM <= 0.1) {
      return { ok: false, message: 'Reduce the ceiling drop or rise to leave positive room height. The measured wall height will stay unchanged.' };
    }
    let group;
    try { group = build(room, selection); } catch (error) { return { ok: false, message: `Could not create the preview: ${error.message}` }; }
    const previous = room.design;
    room.design = selection;
    if (!save(getLayout())) {
      if (previous === undefined) delete room.design; else room.design = previous;
      disposeRoomFinish(group);
      return { ok: false, message: 'Local save failed. The previous room design was kept; free browser storage and try again.' };
    }
    install(roomId, group, selection);
    return { ok: true, message: `Saved for ${room.name || room.id}. Plan dimensions are unchanged.${selection.ceiling ? ' Use Walk and Toggle Ceiling to inspect the ceiling from below.' : ''}` };
  }
  function reset(roomId) {
    const room = roomFor(roomId); if (!room) return { ok: false, message: 'Room no longer exists.' };
    const previous = room.design; delete room.design;
    if (!save(getLayout())) {
      if (previous !== undefined) room.design = previous;
      return { ok: false, message: 'Local save failed. The previous room design was kept.' };
    }
    remove(roomId); return { ok: true, message: 'Room finishes reset and saved. Furniture and plan dimensions were kept.' };
  }
  return { apply, reset, rebuild, updateLight, getWallChoices, getDirectWallSurfaces: directSurfaces, setCeilingsVisible, previewLight, validateRegion,
    getRoom: roomFor, getWallSurfaces: id => { const room = roomFor(id); return room ? surfacesFor(room) : []; },
    getGroups: () => [...groups.values()], getGroup: id => groups.get(id),
    destroy() { [...groups.keys()].forEach(remove); } };
}
