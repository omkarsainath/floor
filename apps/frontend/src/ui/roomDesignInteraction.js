import * as THREE from 'three';
import { buildCeilingLight, disposeCeilingLight, normalizeCeilingLights } from '../design/ceilingLights.js';
import { ceilingAttachment, ceilingSurfaceMeshes, orientCeilingLight } from '../design/ceilingLightPlacement.js';
import { createWallPanelRegion } from '../design/wallPanelRegions.js';
import { createCeiling } from '../generators/ceiling.js';

const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

// A wall's outer face, narrow end caps and its neighbour's face are not the
// selected room's paneling surface. Use actual carved room-facing pieces.
export function matchRoomWallHit(hit, surfaces) {
  if (!hit?.face || !hit.object) return null;
  let wallId;
  for (let node = hit.object; node; node = node.parent) {
    if (node.userData.parentWallId !== undefined) { wallId = node.userData.parentWallId; break; }
  }
  if (wallId === undefined) return null;
  const normal = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
  return surfaces.find(s => {
    if (String(s.parentWallId) !== String(wallId)) return false;
    if (normal.x * s.normal.x + normal.z * s.normal.y < 0.7) return false;
    const dx = s.end.x - s.start.x, dz = s.end.y - s.start.y, length = Math.hypot(dx, dz);
    const along = ((hit.point.x - s.start.x) * dx + (hit.point.z - s.start.y) * dz) / length;
    const offset = (hit.point.x - s.start.x) * s.normal.x + (hit.point.z - s.start.y) * s.normal.y;
    return along >= -0.005 && along <= length + 0.005 && offset >= -0.015 && offset <= 0.25
      && hit.point.y >= s.yOffset - 0.005 && hit.point.y <= s.yOffset + s.height + 0.005;
  }) || null;
}

export function createRoomDesignInteraction({ scene, camera, controls, domElement, controller, getLayout,
  getCeilingsVisible = () => false, setCeilingsVisible = () => {}, onDone = () => {} }) {
  let mode = null, ghost = null, guide = null, marker = null, pressed = null, suppressClickUntil = 0;
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const bar = document.createElement('section'); bar.id = 'design-3d-toolbar'; bar.hidden = true;
  bar.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:70;width:min(640px,calc(100vw - 32px));box-sizing:border-box;padding:14px 18px;border-radius:12px;background:#171d2df5;color:#fff;box-shadow:0 4px 24px #0005;font:14px/1.45 system-ui';
  const status = document.createElement('div'); status.id = 'design-3d-status'; status.setAttribute('role', 'status'); bar.append(status);
  const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:10px;margin-top:10px'; bar.append(actions);
  const button = (id, label, callback) => {
    const b = document.createElement('button'); b.id = id; b.textContent = label; b.onclick = callback;
    b.style.cssText = 'padding:8px 12px;border:1px solid #a5b4fc;border-radius:7px;color:#fff;background:#4338ca;cursor:pointer'; actions.append(b); return b;
  };
  const confirm = button('design-area-confirm', 'Apply marked area', () => commitWall());
  button('design-3d-cancel', 'Cancel (Esc)', () => cancel());
  document.body.append(bar);
  const say = (message, invalid = false) => { status.textContent = message; status.style.color = invalid ? '#fda4af' : '#e2e8f0'; };
  function disposeHelper(group) {
    if (!group) return;
    const materials = new Set(), geometries = new Set();
    group.traverse(n => { if (n.geometry && !n.userData.sharedGeometry) geometries.add(n.geometry);
      (Array.isArray(n.material) ? n.material : n.material ? [n.material] : []).forEach(m => materials.add(m)); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); group.removeFromParent();
  }
  function cleanGhost() { if (ghost) { disposeCeilingLight(ghost); ghost = null; } }
  function finish(result, notify = true) {
    const previous = mode;
    if (!previous) return;
    if (pressed) controls.enabled = pressed.enabled;
    mode = null; pressed = null; bar.hidden = true; domElement.style.cursor = '';
    cleanGhost(); disposeHelper(guide); guide = null; disposeHelper(marker); marker = null;
    if (previous.kind === 'light') setCeilingsVisible(previous.ceilingsVisible);
    suppressClickUntil = performance.now() + 250;
    if (notify) onDone(previous.roomId, result);
  }
  function cancel(notify = true) { finish({ ok: false, cancelled: true, message: '3D placement cancelled. No placement was changed.' }, notify); }
  function begin(kind, roomId, draft) {
    cancel(false);
    if (!controller.getRoom(roomId)) return { ok: false, message: 'Choose a room first.' };
    mode = { kind, roomId, draft: structuredClone(draft), id: uid(kind), ready: false, candidate: null };
    bar.hidden = false; confirm.hidden = kind !== 'wall'; confirm.disabled = true;
    domElement.style.cursor = 'crosshair'; return { ok: true };
  }
  function beginLight(roomId, draft, settings, lightId = null) {
    if (!lightId && (draft.ceilingLights || []).length >= 16) return { ok: false, message: 'This room already has 16 lights. Move or remove one before adding another.' };
    if (lightId && !(draft.ceilingLights || []).some(light => light.id === lightId)) return { ok: false, message: 'The selected light no longer exists.' };
    const normalized = normalizeCeilingLights([{ ...settings, id: lightId || uid('light'), x: 0, z: 0 }])[0];
    if (!normalized) return { ok: false, message: 'Choose a valid light type.' };
    // The selected ceiling and finishes must be in the scene before attaching
    // a fixture to them. This action saves the visible room settings first.
    const saved = controller.apply(roomId, draft); if (!saved.ok) return saved;
    const result = begin('light', roomId, controller.getRoom(roomId).design); if (!result.ok) return result;
    mode.settings = normalized; mode.lightId = lightId;
    mode.ceilingsVisible = getCeilingsVisible(); setCeilingsVisible(false);
    const room = controller.getRoom(roomId), group = controller.getGroup(roomId);
    const meshes = ceilingSurfaceMeshes(group);
    guide = new THREE.Group(); guide.userData = { isHelper: true, walkIgnore: true };
    const material = new THREE.MeshBasicMaterial({ color: 0x67cde9, side: THREE.DoubleSide, transparent: true, opacity: 0.18, depthWrite: false });
    if (meshes.length) {
      group.updateWorldMatrix(true, true);
      for (const original of meshes) {
        const mesh = new THREE.Mesh(original.geometry, material); mesh.applyMatrix4(original.matrixWorld);
        mesh.userData.sharedGeometry = true; guide.add(mesh);
      }
    } else {
      const base = createCeiling([room]);
      base?.traverse(n => { if (n.isMesh) { const old = n.material; n.material = material; old.dispose(); } });
      if (base) guide.add(base);
    }
    scene.add(guide);
    say('Click the blue ceiling surface to place the light. Orbit or use Walk to choose your view. Esc cancels.');
    return { ok: true };
  }
  function beginWall(roomId, draft, styleId) {
    if (!styleId) return { ok: false, message: 'Choose a wall panel style first.' };
    if ((draft.wallPanelRegions || []).length >= 32) return { ok: false, message: 'This room already has 32 marked areas. Remove one before marking another.' };
    const result = begin('wall', roomId, draft); if (!result.ok) return result;
    mode.styleId = styleId;
    say('Click the first corner on an inside wall of this room, then its opposite corner. Right-drag or use Walk to look around.');
    return { ok: true };
  }
  function updateRay(event) {
    const bounds = domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    camera.updateMatrixWorld(true); scene.updateMatrixWorld(true); ray.setFromCamera(pointer, camera);
  }
  function wallHit() {
    const meshes = [];
    scene.traverseVisible(node => {
      if (!node.isMesh) return;
      for (let p = node; p; p = p.parent) if (p.userData.isHelper || p.userData.walkIgnore) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if (!materials.some(m => m?.visible !== false && !(m?.transparent && m.opacity < 0.01))) return;
      meshes.push(node);
    });
    // Only the frontmost visible surface may be picked, never through furniture,
    // glazing, or the back of the building to a convenient wall behind it.
    const hit = ray.intersectObjects(meshes, false)[0];
    const surface = matchRoomWallHit(hit, controller.getWallSurfaces(mode.roomId));
    if (!surface) return null;
    const wall = (getLayout().walls || []).find(w => String(w.id) === String(surface.parentWallId));
    return wall ? { point: hit.point, surface, wall } : null;
  }
  function updateLight() {
    const hit = ray.intersectObject(guide, true)[0];
    cleanGhost(); mode.candidate = null;
    if (!hit) { say('Point at the blue ceiling surface of this room.', true); return; }
    const placement = { ...mode.settings, x: Math.round(hit.point.x * 1000) / 1000, z: Math.round(hit.point.z * 1000) / 1000 };
    const validation = controller.previewLight(mode.roomId, placement);
    const attachment = ceilingAttachment(controller.getRoom(mode.roomId), controller.getGroup(mode.roomId), placement);
    if (attachment) {
      ghost = orientCeilingLight(buildCeilingLight({ placement, ceilingY: attachment.ceilingY, roomId: mode.roomId }), placement, attachment);
      ghost.userData.isHelper = true; ghost.userData.walkIgnore = true;
      ghost.traverse(n => {
        if (n.isLight) n.visible = false;
        if (n.material) { n.material.transparent = true; n.material.opacity = 0.7; n.material.depthWrite = false; if (!validation.ok) n.material.color.set('#ef4444'); }
      }); scene.add(ghost);
    }
    if (!validation.ok) { say(validation.message, true); return; }
    mode.candidate = placement;
    say(`Click to ${mode.lightId ? 'move' : 'place'} this light · mount ${validation.ceilingY.toFixed(2)} m above the floor. Esc cancels.`);
  }
  function drawRegion(surfaces) {
    disposeHelper(marker); marker = new THREE.Group(); marker.userData = { isHelper: true, walkIgnore: true };
    const material = new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, transparent: true, opacity: 0.4, depthWrite: false });
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0891b2 });
    for (const s of surfaces) {
      const n = s.normal, offset = 0.09;
      const a = new THREE.Vector3(s.start.x + n.x * offset, s.yOffset, s.start.y + n.y * offset);
      const b = new THREE.Vector3(s.end.x + n.x * offset, s.yOffset, s.end.y + n.y * offset);
      const c = b.clone().add(new THREE.Vector3(0, s.height, 0)), d = a.clone().add(new THREE.Vector3(0, s.height, 0));
      const geometry = new THREE.BufferGeometry().setFromPoints([a, b, c, a, c, d]);
      marker.add(new THREE.Mesh(geometry, material));
      marker.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([a, b, c, d]), lineMaterial));
    }
    scene.add(marker);
  }
  function updateWall(hit) {
    if (!mode.first || mode.ready) return;
    confirm.disabled = true; mode.candidate = null;
    if (!hit || String(hit.wall.id) !== String(mode.first.wall.id)) {
      disposeHelper(marker); marker = null;
      say('Choose the opposite corner on the same inside wall face.', true); return;
    }
    const region = createWallPanelRegion(hit.wall, mode.first.point, hit.point, { id: mode.id, styleId: mode.styleId });
    if (!region) { say('Move to the opposite corner to give the area width and height.', true); return; }
    const validation = controller.validateRegion(mode.roomId, region, mode.draft.wallPanelRegions || []);
    if (!validation.ok) { disposeHelper(marker); marker = null; say(validation.message, true); return; }
    drawRegion(validation.surfaces); mode.candidate = region;
    say(`${(region.endM - region.startM).toFixed(2)} × ${(region.topM - region.bottomM).toFixed(2)} m · ${validation.areaM2.toFixed(2)} m² of wall. Openings excluded. Click to finish marking.`);
  }
  function commitWall() {
    if (mode?.kind !== 'wall' || !mode.ready || !mode.candidate) return;
    const draft = { ...mode.draft, wallPanelRegions: [...(mode.draft.wallPanelRegions || []), mode.candidate] };
    const result = controller.apply(mode.roomId, draft);
    if (result.ok) finish({ ...result, message: 'Marked wall area saved. Door and window openings stay clear.' });
    else say(result.message, true);
  }
  function pointerMove(event) {
    if (!mode || (pressed && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 5)) return;
    if (event.buttons && event.buttons !== 1) return;
    updateRay(event);
    if (mode.kind === 'light') updateLight(); else updateWall(wallHit());
  }
  function pointerDown(event) {
    if (!mode || event.button !== 0) return;
    event.stopImmediatePropagation(); event.preventDefault();
    pressed = { x: event.clientX, y: event.clientY, enabled: controls.enabled };
    controls.enabled = false;
  }
  function pointerUp(event) {
    if (!mode || event.button !== 0 || !pressed) return;
    event.stopImmediatePropagation(); event.preventDefault();
    const start = pressed; pressed = null; controls.enabled = start.enabled;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    updateRay(event);
    if (mode.kind === 'light') {
      updateLight(); if (!mode.candidate) return;
      const lights = [...(mode.draft.ceilingLights || []).filter(l => l.id !== mode.candidate.id), mode.candidate];
      const result = controller.apply(mode.roomId, { ...mode.draft, ceilingLights: lights });
      if (result.ok) finish({ ...result, message: `Ceiling light ${mode.lightId ? 'moved' : 'placed'} and saved.` });
      else say(result.message, true);
    } else {
      const hit = wallHit();
      if (!mode.first) {
        if (!hit) { say('Click an exposed inside wall in the selected room. Use Walk to reach its inside face.', true); return; }
        mode.first = hit; say('First corner selected. Click the opposite corner on this wall.');
      } else if (!mode.ready) {
        updateWall(hit);
        if (mode.candidate) { mode.ready = true; confirm.disabled = false; say(`${status.textContent.replace('Click to finish marking.', '')} Choose Apply marked area to save.`); }
      }
    }
  }
  const suppressClick = event => {
    if (event.target === domElement && (mode || performance.now() < suppressClickUntil)) { event.stopImmediatePropagation(); event.preventDefault(); }
  };
  const keydown = event => {
    if (!mode || /INPUT|SELECT|TEXTAREA/.test(event.target?.tagName)) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cancel(); }
    else if (event.key === 'Enter' && mode.kind === 'wall') { event.preventDefault(); commitWall(); }
  };
  const pointerCancel = () => { if (pressed) { controls.enabled = pressed.enabled; pressed = null; } };
  domElement.addEventListener('pointerdown', pointerDown, true);
  domElement.addEventListener('pointermove', pointerMove);
  domElement.addEventListener('pointerup', pointerUp, true);
  domElement.addEventListener('pointercancel', pointerCancel);
  window.addEventListener('click', suppressClick, true); window.addEventListener('keydown', keydown, true);
  window.addEventListener('pointerup', pointerCancel);
  return { beginLight, beginWall, cancel, isActive: () => Boolean(mode),
    destroy() {
      cancel(false); bar.remove();
      domElement.removeEventListener('pointerdown', pointerDown, true); domElement.removeEventListener('pointermove', pointerMove);
      domElement.removeEventListener('pointerup', pointerUp, true); domElement.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('click', suppressClick, true); window.removeEventListener('keydown', keydown, true); window.removeEventListener('pointerup', pointerCancel);
    } };
}
