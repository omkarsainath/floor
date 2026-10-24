import { projectStorage } from '../auth/storage.js';
import * as THREE from 'three';
import { createWalkCamera } from './walkCamera.js';
import { checkWalkPosition, resolveWalkMovement } from './walkCollision.js';

const PREFERENCES_KEY = 'viewerWalkPreferences';
const editable = target => target?.closest?.('input, textarea, select, [contenteditable="true"]');
const insidePolygon = (point, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.z) !== (b.y > point.z) && point.x < (b.x - a.x) * (point.z - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

export function applyCeilingVisibility(root, visible) {
  if (!root?.traverse) return 0;
  let changed = 0;
  root.traverse(node => {
    if (node.userData?.type !== 'ceiling') return;
    // A fixture can tag attachment meshes as ceiling geometry for placement,
    // but hiding the architectural slab must not hide the light fixture.
    for (let parent = node; parent; parent = parent.parent) {
      if (parent.userData?.isCeilingLight) return;
    }
    node.visible = Boolean(visible);
    changed++;
  });
  return changed;
}

/** Metre-based first-person viewing, with OrbitControls used only in Orbit. */
export function setupViewerControls({ camera, controls, domElement = controls?.domElement,
  ceilingMesh = null, getObstacles = () => [], getLayout = () => ({}), onModeChange = () => {}, onCeilingVisibilityChange = () => {}, onLightsChange = () => {}, onLightCircuitChange = () => {},
  initialCameraPosition = { x: 12, y: 16, z: 12 }, initialTarget = { x: 0, y: 1, z: 0 },
}) {
  if (!camera || !controls) return;
  const walker = createWalkCamera(camera);
  let bodyWidthM = 0.46, walkMode = false, ceilingVisible = false, lightsEnabled = true;
  let ceilingLightsEnabled = true, wallLightsEnabled = true;
  let lastWalkPosition = null, message = '', looking = null;
  let orbitPosition = new THREE.Vector3().copy(initialCameraPosition);
  let orbitTarget = new THREE.Vector3().copy(initialTarget);
  const pressed = new Set();
  if (ceilingMesh) ceilingMesh.visible = false;
  try {
    const saved = JSON.parse(projectStorage.getItem(PREFERENCES_KEY) || 'null');
    if (saved) {
      ceilingVisible = saved.ceilingVisible === true;
      lightsEnabled = saved.lightsEnabled !== false;
      ceilingLightsEnabled = saved.ceilingLightsEnabled !== false;
      wallLightsEnabled = saved.wallLightsEnabled !== false;
      walker.setPersonHeight(saved.personHeightM);
      walker.setEyeHeight(saved.eyeHeightM ?? null);
      if (Number.isFinite(saved.bodyWidthM) && saved.bodyWidthM >= 0.2 && saved.bodyWidthM <= 1) bodyWidthM = saved.bodyWidthM;
    }
  } catch { /* Private browsing and invalid old preferences keep safe defaults. */ }
  const save = () => {
    const state = walker.getState();
    try { projectStorage.setItem(PREFERENCES_KEY, JSON.stringify({ personHeightM: state.personHeightM,
      eyeHeightM: state.eyeHeightSource === 'measured' ? state.eyeHeightM : null, bodyWidthM, ceilingVisible, lightsEnabled, ceilingLightsEnabled, wallLightsEnabled })); } catch { /* Optional preferences. */ }
  };
  const collisionOptions = position => ({ position, obstacles: [...getObstacles(), ...(ceilingMesh ? [ceilingMesh] : [])],
    bodyHeight: walker.getState().personHeightM, bodyRadius: bodyWidthM / 2, floorY: 0, includeCeilings: true });
  const blockingMessage = reason => reason === 'headroom' ? 'Not enough standing clearance here.'
    : reason === 'wall' ? 'Wall ahead.' : 'Object ahead. Click a door to open it.';

  const panel = document.createElement('div');
  panel.id = 'viewer-controls';
  panel.style.cssText = 'position:fixed;top:12px;left:12px;z-index:41;padding:8px 10px;border-radius:10px;background:#101018d9;color:#f8fafc;font:12px/1.45 system-ui;max-width:calc(100vw - 44px)';
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;gap:7px;align-items:center;flex-wrap:wrap';
  const button = (text, click) => {
    const el = document.createElement('button'); el.textContent = text; el.onclick = click;
    el.style.cssText = 'padding:6px 9px;border-radius:7px;border:1px solid #ffffff30;background:#ffffff12;color:inherit;cursor:pointer';
    return el;
  };
  const input = (id, min, max) => {
    const el = document.createElement('input'); el.id = id; el.type = 'number'; el.min = String(min); el.max = String(max); el.step = '0.1';
    el.style.cssText = 'width:58px;padding:4px;border:1px solid #ffffff40;border-radius:5px;background:#ffffff12;color:inherit';
    return el;
  };
  const field = (text, el, parent) => { const label = document.createElement('label'); label.append(text, el); parent.append(label); };
  const orbitBtn = button('Orbit', () => setOrbitMode());
  const walkBtn = button('Walk', () => setWalkMode());
  const heightInput = input('person-height-cm', 50, 250);
  let ceilingBtn;
  function setCeilingsVisible(visible) {
    ceilingVisible = Boolean(visible); if (ceilingMesh) ceilingMesh.visible = ceilingVisible;
    onCeilingVisibilityChange(ceilingVisible);
    save();
    if (ceilingBtn) {
      ceilingBtn.textContent = `Ceiling: ${ceilingVisible ? 'ON' : 'OFF'}`;
      ceilingBtn.setAttribute('aria-pressed', String(ceilingVisible));
      ceilingBtn.style.background = ceilingVisible ? '#6366f1' : '#ffffff12';
    }
  }
  ceilingBtn = button('Ceiling: OFF', () => {
    setCeilingsVisible(!ceilingVisible);
  });
  ceilingBtn.setAttribute('aria-pressed', 'false');
  toolbar.append(orbitBtn, walkBtn, button('Reset View', () => resetView()), ceilingBtn);
  const lightsBtn = button('', () => { lightsEnabled = !lightsEnabled; refreshLights(); save(); });
  lightsBtn.id = 'room-lights-toggle';
  function refreshLights() {
    lightsBtn.textContent = `All lights: ${lightsEnabled ? 'ON' : 'OFF'}`;
    lightsBtn.setAttribute('aria-pressed',String(lightsEnabled));
    onLightsChange(lightsEnabled);
  }
  toolbar.append(lightsBtn); refreshLights();
  for (const [circuit, label] of [['ceiling', 'Ceiling lights'], ['wall', 'Wall lights']]) {
    const refreshCircuit = () => {
      const on = circuit === 'ceiling' ? ceilingLightsEnabled : wallLightsEnabled;
      toggle.textContent = `${label}: ${on ? 'ON' : 'OFF'}`;
      toggle.setAttribute('aria-pressed', String(on));
      onLightCircuitChange(circuit, on);
    };
    const toggle = button('', () => {
      if (circuit === 'ceiling') ceilingLightsEnabled = !ceilingLightsEnabled;
      else wallLightsEnabled = !wallLightsEnabled;
      // Activating a circuit also releases the master override.
      if ((circuit === 'ceiling' ? ceilingLightsEnabled : wallLightsEnabled) && !lightsEnabled) {
        lightsEnabled = true; refreshLights();
      }
      refreshCircuit(); save();
    });
    toggle.id = `${circuit}-lights-toggle`;
    toolbar.append(toggle); refreshCircuit();
  }
  setCeilingsVisible(ceilingVisible);
  field('Body (cm) ', heightInput, toolbar);
  const settings = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = 'Walk settings'; summary.style.cursor = 'pointer'; settings.append(summary);
  const settingsBody = document.createElement('div');
  settingsBody.style.cssText = 'position:absolute;left:0;top:100%;width:min(405px,85vw);padding:12px;background:#20202bf5;border-radius:8px;box-sizing:border-box;display:grid;gap:8px';
  const eyeInput = input('eye-height-cm', 10, 249); eyeInput.placeholder = 'Auto';
  const widthInput = input('body-width-cm', 20, 100);
  field('Measured floor-to-eye height (cm; blank = estimate) ', eyeInput, settingsBody);
  field('Body clearance width (cm) ', widthInput, settingsBody);
  const explanation = document.createElement('div');
  explanation.textContent = 'Automatic eye level = 93% of body height (estimate). Enter your measured eye height for your viewpoint. Width is a circular clearance estimate; it does not simulate shoulders, bending or stairs. Heights of walls, openings and objects need real measurements too.';
  settingsBody.append(explanation); settings.append(settingsBody); toolbar.append(settings);
  const status = document.createElement('div'); status.id = 'walk-status'; status.setAttribute('role', 'status');
  status.style.cssText = 'max-width:480px;margin-top:5px';
  const help = document.createElement('div');
  help.textContent = 'Walk: arrows or WASD move · Q/E turn · T/B look up/down · right-drag to look · click doors to open';
  help.style.cssText = 'max-width:480px;color:#cbd5e1;margin-top:3px';
  panel.append(toolbar, status, help); document.body.append(panel);

  function refresh() {
    const state = walker.getState();
    heightInput.value = String(Number((state.personHeightM * 100).toFixed(1)));
    eyeInput.value = state.eyeHeightSource === 'measured' ? String(Number((state.eyeHeightM * 100).toFixed(1))) : '';
    widthInput.value = String(Number((bodyWidthM * 100).toFixed(1)));
    help.hidden = !walkMode; status.hidden = !walkMode && !message;
    const calibrated = ['confirmed', 'automatic'].includes(getLayout().calibration?.status);
    status.textContent = `${walkMode ? `Body ${(state.personHeightM * 100).toFixed(0)} cm · Eyes ${(state.eyeHeightM * 100).toFixed(1)} cm (${state.eyeHeightSource}) · Width ${(bodyWidthM * 100).toFixed(0)} cm. ` : ''}${message}${walkMode && !calibrated ? ' Building scale is unverified; check Measurements.' : ''}`;
    orbitBtn.setAttribute('aria-pressed', String(!walkMode)); walkBtn.setAttribute('aria-pressed', String(walkMode));
    orbitBtn.style.background = walkMode ? '#ffffff12' : '#6366f1'; walkBtn.style.background = walkMode ? '#6366f1' : '#ffffff12';
  }
  const setMessage = text => { if (message !== text) { message = text; refresh(); } };
  function validateStanding() {
    if (!walkMode) return;
    const hit = checkWalkPosition(collisionOptions(camera.position));
    setMessage(hit.blocked ? `${blockingMessage(hit.reason)} Choose Reset View for a clear starting point.` : '');
  }
  function setPersonHeight(value) {
    const accepted = walker.setPersonHeight(value);
    if (!accepted) message = 'Body height must be between 50 and 250 cm.';
    else { message = ''; validateStanding(); save(); }
    refresh(); return accepted;
  }
  function setEyeHeight(value) {
    const accepted = walker.setEyeHeight(value);
    message = accepted ? '' : 'Eye height must be above 10 cm and below body height.';
    if (accepted) save(); refresh(); return accepted;
  }
  function setBodyWidth(value) {
    if (!Number.isFinite(value) || value < 0.2 || value > 1) { setMessage('Body width must be between 20 and 100 cm.'); refresh(); return false; }
    bodyWidthM = value; message = ''; validateStanding(); save(); refresh(); return true;
  }
  heightInput.onchange = () => setPersonHeight(Number(heightInput.value) / 100);
  eyeInput.onchange = () => setEyeHeight(eyeInput.value.trim() === '' ? null : Number(eyeInput.value) / 100);
  widthInput.onchange = () => setBodyWidth(Number(widthInput.value) / 100);

  function findStart() {
    const layout = getLayout();
    const polygons = (layout.rooms || []).map(room => room.points || room.polygon).filter(p => p?.length >= 3);
    if (!polygons.length && layout.footprint?.points?.length >= 3) polygons.push(layout.footprint.points);
    const wallPoints = (layout.walls || []).flatMap(w => [w.start, w.end]);
    if (!polygons.length && wallPoints.length) {
      const xs = wallPoints.map(p => p.x), ys = wallPoints.map(p => p.y);
      polygons.push([{ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.min(...ys) },
        { x: Math.max(...xs), y: Math.max(...ys) }, { x: Math.min(...xs), y: Math.max(...ys) }]);
    }
    const candidates = [];
    for (const polygon of polygons) {
      const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...ys), maxZ = Math.max(...ys);
      candidates.push({ x: xs.reduce((a, b) => a + b, 0) / xs.length, z: ys.reduce((a, b) => a + b, 0) / ys.length });
      for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) candidates.push({ x: minX + (maxX - minX) * i / 8, z: minZ + (maxZ - minZ) * j / 8 });
    }
    candidates.sort((a, b) => Math.hypot(a.x - initialTarget.x, a.z - initialTarget.z) - Math.hypot(b.x - initialTarget.x, b.z - initialTarget.z));
    if (lastWalkPosition) candidates.unshift(lastWalkPosition);
    if (!polygons.length) candidates.push({ x: initialTarget.x, z: initialTarget.z });
    return candidates.find(p => (!polygons.length || polygons.some(polygon => insidePolygon(p, polygon))) && !checkWalkPosition(collisionOptions(p)).blocked);
  }
  function setWalkMode() {
    if (walkMode) return true;
    const start = findStart();
    if (!start) { setMessage('No clear standing position found for this body size. Check the geometry and height settings.'); return false; }
    orbitPosition.copy(camera.position); orbitTarget.copy(controls.target);
    onModeChange('walk'); walkMode = true; pressed.clear(); controls.enabled = false;
    walker.attach(); walker.setPosition(start); walker.resetLook(); walker.syncTarget(controls.target);
    message = ''; refresh(); return true;
  }
  function setOrbitMode() {
    if (!walkMode) return;
    if (walkMode) lastWalkPosition = { x: camera.position.x, z: camera.position.z };
    walker.detach(); walkMode = false; pressed.clear(); looking = null;
    controls.enabled = true;
    camera.position.copy(orbitPosition); controls.target.copy(orbitTarget); controls.update();
    onModeChange('orbit'); message = ''; refresh();
  }
  function resetView() {
    if (walkMode) {
      lastWalkPosition = null;
      const start = findStart();
      if (!start) { setMessage('No clear standing position found. Check height settings or return to Orbit.'); return; }
      walker.setPosition(start); walker.resetLook(); walker.syncTarget(controls.target); pressed.clear(); message = ''; refresh();
    } else {
      orbitPosition.copy(initialCameraPosition); orbitTarget.copy(initialTarget);
      camera.position.copy(orbitPosition); controls.target.copy(orbitTarget); controls.update();
    }
  }
  const movementKeys = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 's', 'a', 'd', 'q', 'e', 't', 'b']);
  const keydown = event => {
    if (!walkMode || editable(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase(); if (!movementKeys.has(key)) return;
    event.preventDefault(); pressed.add(key);
  };
  const keyup = event => pressed.delete(event.key.toLowerCase());
  const clearKeys = () => { pressed.clear(); looking = null; };
  const pointerdown = event => {
    if (!walkMode || event.button !== 2) return;
    looking = { id: event.pointerId, x: event.clientX, y: event.clientY };
    domElement.setPointerCapture?.(event.pointerId); event.preventDefault();
  };
  const pointermove = event => {
    if (!walkMode || !looking || event.pointerId !== looking.id) return;
    walker.look((looking.x - event.clientX) * 0.003, (looking.y - event.clientY) * 0.003);
    looking.x = event.clientX; looking.y = event.clientY; walker.syncTarget(controls.target);
  };
  const pointerup = () => { looking = null; };
  const contextmenu = event => { if (walkMode) event.preventDefault(); };
  function update(deltaSeconds) {
    if (!walkMode || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || !pressed.size) return;
    if (editable(document.activeElement)) { pressed.clear(); return; }
    const dt = Math.min(deltaSeconds, 0.05);
    const key = (...names) => names.some(name => pressed.has(name)) ? 1 : 0;
    walker.look((key('q') - key('e')) * dt * 1.4, (key('t') - key('b')) * dt);
    const forward = camera.getWorldDirection(new THREE.Vector3()); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const delta = forward.multiplyScalar(key('arrowup', 'w') - key('arrowdown', 's'))
      .addScaledVector(right, key('arrowright', 'd') - key('arrowleft', 'a'));
    if (delta.lengthSq()) {
      delta.normalize().multiplyScalar(dt * 1.25);
      const result = resolveWalkMovement({ ...collisionOptions(camera.position), delta });
      walker.moveTo(result.position); lastWalkPosition = result.position;
      setMessage(result.blocked ? blockingMessage(result.reason) : '');
    }
    walker.syncTarget(controls.target);
  }
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', clearKeys);
  domElement?.addEventListener('pointerdown', pointerdown); domElement?.addEventListener('pointermove', pointermove);
  domElement?.addEventListener('pointerup', pointerup); domElement?.addEventListener('pointercancel', pointerup);
  domElement?.addEventListener('contextmenu', contextmenu);
  refresh(); resetView();
  return { setOrbitMode, setWalkMode, resetView, setPersonHeight, setEyeHeight, setBodyWidth, update,
    setCeilingsVisible, getCeilingsVisible: () => ceilingVisible,
    isWalkMode: () => walkMode, getWalkState: () => ({ ...walker.getState(), bodyWidthM, message }),
    destroy() {
      walker.detach(); controls.enabled = true; panel.remove();
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', clearKeys);
      domElement?.removeEventListener('pointerdown', pointerdown); domElement?.removeEventListener('pointermove', pointermove);
      domElement?.removeEventListener('pointerup', pointerup); domElement?.removeEventListener('pointercancel', pointerup);
      domElement?.removeEventListener('contextmenu', contextmenu);
    } };
}
