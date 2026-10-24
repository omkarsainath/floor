import { attachFinishThumbnail } from './finishThumbnail.js';
import { registerCustomWallStyle } from '../design/customWallStyles.js';
import { ROOM_TYPES, CATEGORIES, optionsFor, getFinishStyle, inferRoomType, normalizeRoomDesign } from '../design/roomDesignCatalog.js';
import { isProfileCeiling, normalizeCeilingSettings } from '../design/ceilingTypes.js';
import { getCeilingHeights } from '../design/ceilingProfiles.js';
import { CEILING_LIGHT_TYPES, ceilingLightDimensions, ceilingLightBeam, isDirectionalCeilingLight } from '../design/ceilingLights.js';
import { isDesignableRoom } from '../design/roomSurfaces.js';
import { polygonArea, SQFT_PER_SQM } from '../measurements/modelMeasurements.js';

export function setupRoomDesignPanel({ getLayout, getWallChoices, onApply, onReset, onOpen = () => {},
  onUpdateLight = null,
  onPlaceLight = () => ({ ok: false, message: 'Light placement is unavailable.' }),
  onPickWall = () => ({ ok: false, message: 'Wall selection is unavailable.' }),
  onMarkWallArea = () => ({ ok: false, message: 'Wall area marking is unavailable.' }),
  onCancelInteraction = () => {} }) {
  let roomId = null, draft = {}, message = '', failed = false;
  let selectedLightId = '', lightSettings = {}, fullWallPending = false;
  let uploading = false, uploadDepthCm = 10, preserveUploadAppearance = true;
  const toggle = document.createElement('button'); toggle.id = 'room-finishes-toggle'; toggle.textContent = 'Room Finishes';
  toggle.setAttribute('aria-controls', 'room-finishes-panel'); toggle.setAttribute('aria-expanded', 'false');
  toggle.style.cssText = 'position:fixed;bottom:180px;left:16px;z-index:45;padding:12px 16px;border:1px solid #a5b4fc;border-radius:10px;background:#3730a3;color:#fff;font:600 13px system-ui;cursor:pointer';
  const panel = document.createElement('section'); panel.id = 'room-finishes-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Room finishes');
  panel.style.cssText = 'position:fixed;bottom:232px;left:16px;z-index:45;width:min(365px,calc(100vw - 32px));max-height:calc(100vh - 305px);overflow:auto;box-sizing:border-box;padding:16px;background:#fffffff5;color:#172033;border-radius:12px;box-shadow:0 5px 25px #0004;font:13px/1.45 system-ui';
  const rooms = () => (getLayout().rooms || []).filter(isDesignableRoom);
  const selectedRoom = () => rooms().find(room => room.id === roomId);
  const roomPositionBounds = () => {
    const room = selectedRoom(), points = room?.points || room?.polygon || [];
    return { minX: Math.min(...points.map(p => p.x)), minZ: Math.min(...points.map(p => p.y)),
      maxX: Math.max(...points.map(p => p.x)), maxZ: Math.max(...points.map(p => p.y)) };
  };
  const text = (tag, value, parent = panel) => { const el = document.createElement(tag); el.textContent = value; parent.append(el); return el; };
  const select = (id, title, items, value, change) => {
    const label = text('label', title); label.style.cssText = 'display:block;font-weight:600;margin-top:12px'; label.htmlFor = id;
    const input = document.createElement('select'); input.id = id;
    input.style.cssText = 'display:block;width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#172033;font:13px system-ui;margin-top:4px';
    const appendOption = (item, parent) => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; parent.append(option); };
    items.forEach(item => {
      if (item.options) {
        const group = document.createElement('optgroup'); group.label = item.label;
        item.options.forEach(option => appendOption(option, group)); input.append(group);
      } else appendOption(item, input);
    });
    input.value = value || ''; input.onchange = () => change(input.value); panel.append(input); return input;
  };
  const button = (label, handler) => {
    const el = document.createElement('button'); el.textContent = label; el.onclick = handler;
    el.style.cssText = 'padding:9px 12px;margin:12px 6px 0 0;border-radius:7px;border:1px solid #a5b4fc;background:#eef2ff;color:#312e81;font-weight:600;cursor:pointer'; return el;
  };
  const actionButton = (id, label, handler) => {
    const el = button(label, handler); el.id = id; panel.append(el); return el;
  };
  function loadLightSettings() {
    const light = (draft.ceilingLights || []).find(item => item.id === selectedLightId);
    if (!light) selectedLightId = '';
    const dimensions = ceilingLightDimensions(light || { type: 'downlight' });
    const beam = ceilingLightBeam(light || { type: 'downlight' }), bounds = roomPositionBounds();
    lightSettings = {
      positionXCm: String(((light?.x ?? bounds.minX) - bounds.minX) * 100),
      positionZCm: String(((light?.z ?? bounds.minZ) - bounds.minZ) * 100),
      beamWidthCm: String(beam.beamWidthM * 100), beamHeightCm: String(beam.beamHeightM * 100),
      aimTiltDegrees: String(beam.aimTiltDegrees), aimDirectionDegrees: String(beam.aimDirectionDegrees),
      widthCm: String(dimensions.widthM * 100), depthCm: String(dimensions.depthM * 100),
      type: light?.type || 'downlight', lumens: String(light?.lumens ?? 600),
      temperatureK: String(light?.temperatureK ?? 2700),
      dropCm: String((light && ['pendant', 'chandelier'].includes(light.type) ? light.dropM ?? 0.45 : 0.45) * 100),
      rotationDegrees: String(Math.round((light?.rotation || 0) * 180 / Math.PI * 1000) / 1000),
      enabled: light?.enabled !== false,
    };
  }
  function validInputs() {
    const invalid = panel.querySelector('input:invalid');
    if (invalid) { invalid.reportValidity(); return false; }
    return true;
  }
  function setMessage(value, isFailure = false) {
    message = value || ''; failed = isFailure; render();
  }
  function applyDraft(next, validateInputs = true) {
    if (validateInputs && !validInputs()) return false;
    let result;
    try { result = onApply(roomId, next); }
    catch (error) { result = { ok: false, message: error.message || 'Could not save this room.' }; }
    message = result?.message || (result?.ok ? 'Room saved.' : 'Could not save this room.'); failed = !result?.ok;
    if (result?.ok) {
      draft = normalizeRoomDesign(selectedRoom()?.design || next);
      fullWallPending = false;
      if (selectedLightId && !(draft.ceilingLights || []).some(light => light.id === selectedLightId)) {
        selectedLightId = ''; loadLightSettings();
      }
    }
    render(); return !!result?.ok;
  }
  function beginInteraction(callback) {
    if (!validInputs()) return;
    let result;
    try { result = callback(); }
    catch (error) { result = { ok: false, message: error.message || 'Could not start this action.' }; }
    if (result?.ok) hide();
    else setMessage(result?.message || 'Could not start this action.', true);
  }
  function lightNumber(id, title, key, min, max, step = 'any') {
    const label = text('label', `${title} `); label.htmlFor = id;
    label.style.cssText = 'display:block;margin-top:8px;font-weight:600';
    const input = document.createElement('input'); input.id = id; input.type = 'number'; input.required = true;
    input.min = String(min); input.max = String(max); input.step = step; input.value = lightSettings[key];
    input.style.cssText = 'width:90px;padding:6px;box-sizing:border-box';
    input.oninput = () => { lightSettings[key] = input.value; updateLightLive(); }; label.append(input); return input;
  }
  function readLightSettings(silent = false) {
    if (!silent && !validInputs()) return null;
    const hanging = ['pendant', 'chandelier'].includes(lightSettings.type);
    const number = (id, min, max) => {
      const input = panel.querySelector(`#${id}`), value = input?.valueAsNumber;
      if (!Number.isFinite(value) || value < min || value > max) return null;
      return value;
    };
    const lumens = number('finish-light-lumens', 50, 5000);
    const temperatureK = number('finish-light-temperature', 2200, 6500);
    const rotationDegrees = number('finish-light-rotation', -360, 360);
    const dropCm = hanging ? number('finish-light-drop', 10, 150) : 0;
    const widthCm = number('finish-light-width', 3, 500), depthCm = number('finish-light-depth', 3, 500);
    const bounds = roomPositionBounds();
    const positionX = selectedLightId ? number('finish-light-position-x', 0, (bounds.maxX - bounds.minX) * 100) : 0;
    const positionZ = selectedLightId ? number('finish-light-position-z', 0, (bounds.maxZ - bounds.minZ) * 100) : 0;
    const directional = isDirectionalCeilingLight(lightSettings.type);
    const beamWidthCm = directional ? number('finish-light-beam-width', 10, 800) : 0;
    const beamHeightCm = directional ? number('finish-light-beam-height', 10, 800) : 0;
    const tilt = directional ? number('finish-light-aim-tilt', 0, 85) : 0;
    const direction = directional ? number('finish-light-aim-direction', -360, 360) : 0;
    if (!CEILING_LIGHT_TYPES.some(type => type.id === lightSettings.type) || [lumens, temperatureK, rotationDegrees, dropCm, widthCm, depthCm, positionX, positionZ, beamWidthCm, beamHeightCm, tilt, direction].includes(null)) {
      if (!silent) setMessage('Enter valid light settings before continuing.', true);
      return null;
    }
    return { type: lightSettings.type, lumens, temperatureK, dropM: dropCm / 100, widthM: widthCm / 100, depthM: depthCm / 100,
      ...(selectedLightId ? { x: bounds.minX + positionX / 100, z: bounds.minZ + positionZ / 100 } : {}),
      ...(directional ? { beamWidthM: beamWidthCm / 100, beamHeightM: beamHeightCm / 100, aimTiltDegrees: tilt, aimDirectionDegrees: direction } : {}),
      rotation: rotationDegrees * Math.PI / 180, enabled: lightSettings.enabled };
  }
  function updateLightLive() {
    if (!selectedLightId) return;
    const status = panel.querySelector('#finish-light-live-status'), settings = readLightSettings(true);
    let result;
    if (!settings) result = { ok: false, message: 'Enter a valid value. The last saved light is kept while you type.' };
    else {
      try {
        const savedDesign = selectedRoom()?.design || draft;
        result = onUpdateLight ? onUpdateLight(roomId, selectedLightId, settings) : onApply(roomId, {
          ...savedDesign, ceilingLights: (savedDesign.ceilingLights || []).map(light => light.id === selectedLightId ? { ...light, ...settings } : light),
        });
      } catch (error) { result = { ok: false, message: error.message || 'Could not update this light.' }; }
      if (result?.ok) {
        // Keep unrelated finish edits as drafts. Do not replace the focused
        // input while typing or rebuild the other fixtures in this room.
        draft = { ...draft, ceilingLights: normalizeRoomDesign(selectedRoom()?.design || draft).ceilingLights };
        const light = draft.ceilingLights.find(item => item.id === selectedLightId);
        const index = draft.ceilingLights.indexOf(light), label = `${index + 1}. ${CEILING_LIGHT_TYPES.find(type => type.id === light.type)?.label || light.type}`;
        const option = [...panel.querySelector('#finish-light-selection').options].find(item => item.value === selectedLightId);
        if (option) option.textContent = label + (light.enabled === false ? ' (off)' : '');
        const edit = [...panel.querySelectorAll('[data-edit-light-id]')].find(item => item.dataset.editLightId === selectedLightId);
        if (edit) edit.previousElementSibling.textContent = label;
      }
    }
    if (status) {
      status.textContent = result?.message || 'Could not save this light.';
      status.style.color = result?.ok ? '#166534' : '#b91c1c';
    }
  }
  function renderLights() {
    const heading = text('h3', 'Ceiling lights'); heading.style.cssText = 'font-size:14px;margin:18px 0 0';
    const lights = draft.ceilingLights || [];
    if (lights.length) {
      text('small', 'Click a light in the room, or choose its Edit button below.').style.cssText = 'display:block;color:#64748b;margin-top:6px';
      const list = text('div', ''); list.id = 'finish-light-list';
      for (const [index, light] of lights.entries()) {
        const row = text('div', '', list); row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:6px';
        text('span', `${index + 1}. ${CEILING_LIGHT_TYPES.find(type => type.id === light.type)?.label || light.type}`, row).style.flex = '1';
        const edit = button('Edit', () => selectLight(light.id));
        edit.dataset.editLightId = light.id; edit.setAttribute('aria-label', `Edit light ${index + 1}`);
        edit.setAttribute('aria-pressed', String(selectedLightId === light.id));
        edit.style.margin = '0'; row.append(edit);
      }
    }
    select('finish-light-selection', 'Light to edit', [{ id: '', label: 'New light' }, ...lights.map((light, index) => ({
      id: light.id, label: `${index + 1}. ${CEILING_LIGHT_TYPES.find(type => type.id === light.type)?.label || light.type}${light.enabled === false ? ' (off)' : ''}`,
    }))], selectedLightId, value => { selectedLightId = value; loadLightSettings(); render(); });
    const remove = actionButton('finish-remove-light', 'Delete selected light', () => {
      if (!selectedLightId) return;
      // Invalid unsaved size/brightness fields must not prevent deletion.
      applyDraft({ ...draft, ceilingLights: (draft.ceilingLights || []).filter(light => light.id !== selectedLightId) }, false);
    });
    remove.disabled = !selectedLightId;
    remove.style.opacity = selectedLightId ? '1' : '.5';
    if (!selectedLightId) text('small', 'Choose an existing light above to resize or delete it.').style.cssText = 'display:block;color:#64748b;margin-top:4px';
    select('finish-light-type', 'Light type', CEILING_LIGHT_TYPES, lightSettings.type,
      value => {
        lightSettings.type = value;
        const size = ceilingLightDimensions({ type: value, dropM: Number(lightSettings.dropCm) / 100 });
        lightSettings.widthCm = String(size.widthM * 100); lightSettings.depthCm = String(size.depthM * 100);
        const beam = ceilingLightBeam({ type: value });
        lightSettings.beamWidthCm = String(beam.beamWidthM * 100); lightSettings.beamHeightCm = String(beam.beamHeightM * 100);
        render(); updateLightLive();
      });
    lightNumber('finish-light-width', 'Width (cm)', 'widthCm', 3, 500);
    lightNumber('finish-light-depth', 'Depth (cm)', 'depthCm', 3, 500);
    text('small', 'Width is left to right; depth is front to back, before rotation. These dimensions change only this fixture.').style.cssText = 'display:block;color:#64748b;margin-top:4px';
    if (selectedLightId) {
      text('h4', 'Light position');
      const bounds = roomPositionBounds();
      lightNumber('finish-light-position-x', 'Across room (cm)', 'positionXCm', 0, (bounds.maxX - bounds.minX) * 100);
      lightNumber('finish-light-position-z', 'Front / back (cm)', 'positionZCm', 0, (bounds.maxZ - bounds.minZ) * 100);
      text('small', 'Distances from the room outline’s left and top edges in the floor plan. Change these to move the fixture and its light together.').style.cssText = 'display:block;color:#64748b;margin-top:4px';
    }
    if (isDirectionalCeilingLight(lightSettings.type)) {
      text('h4', 'Light spread and direction');
      lightNumber('finish-light-beam-width', 'Beam width (cm at 1 m)', 'beamWidthCm', 10, 800);
      lightNumber('finish-light-beam-height', 'Beam height (cm at 1 m)', 'beamHeightCm', 10, 800);
      lightNumber('finish-light-aim-tilt', 'Aim tilt (degrees)', 'aimTiltDegrees', 0, 85);
      lightNumber('finish-light-aim-direction', 'Aim direction (degrees)', 'aimDirectionDegrees', -360, 360);
      text('small', '0° tilt points down; increase tilt to aim toward a wall. Direction turns the beam around the fixture. Beam width and height are measured 1 m along its aim; the patch on a wall also depends on distance and angle. Fixture rotation also turns the beam.').style.cssText = 'display:block;color:#64748b;margin-top:4px';
    } else {
      text('small', 'For adjustable wall-directed beams, choose Recessed downlight or Surface spotlight.').style.cssText = 'display:block;color:#64748b;margin-top:4px';
    }
    lightNumber('finish-light-lumens', 'Brightness (lumens)', 'lumens', 50, 5000);
    lightNumber('finish-light-temperature', 'Colour temperature (K)', 'temperatureK', 2200, 6500);
    if (['pendant', 'chandelier'].includes(lightSettings.type)) {
      lightNumber('finish-light-drop', 'Total hanging depth (cm)', 'dropCm', 10, 150);
      text('small', 'Measured from the ceiling to the lowest part of the light.').style.cssText = 'display:block;color:#64748b;margin-top:4px';
    }
    lightNumber('finish-light-rotation', 'Rotation (degrees)', 'rotationDegrees', -360, 360);
    const enabledLabel = text('label', ''); enabledLabel.style.cssText = 'display:block;margin-top:10px';
    const enabled = document.createElement('input'); enabled.id = 'finish-light-enabled'; enabled.type = 'checkbox'; enabled.checked = lightSettings.enabled;
    enabled.onchange = () => { lightSettings.enabled = enabled.checked; updateLightLive(); };
    enabledLabel.append(enabled, document.createTextNode(' Light on'));
    if (selectedLightId) {
      const status = text('p', 'Changes update the light immediately and save automatically.');
      status.id = 'finish-light-live-status'; status.setAttribute('role', 'status');
      status.style.cssText = 'color:#166534;margin-top:8px';
    }
    text('small', 'Place lights inside this room in the 3D view. Starting placement saves your current room finishes; clicking the ceiling saves the light. Up to 16 lights per room.').style.cssText = 'display:block;color:#64748b;margin-top:8px';
    actionButton('finish-place-light', 'Place light in 3D', () => {
      const settings = readLightSettings(); if (!settings) return;
      beginInteraction(() => onPlaceLight(roomId, draft, settings, null));
    });
    if (selectedLightId) {
      actionButton('finish-move-light', 'Move light in 3D', () => {
        const settings = readLightSettings(); if (!settings) return;
        beginInteraction(() => onPlaceLight(roomId, draft, settings, selectedLightId));
      });
    }
  }
  function renderImageReliefUpload() {
    text('h3', 'Create relief from your image').style.cssText = 'font-size:14px;margin:16px 0 6px';
    text('small', 'Upload a front-facing image cropped to the artwork. AI estimates raised depth locally. Photo colours and lighting can be preserved, but exact hidden geometry and light sources cannot be recovered.').style.cssText = 'display:block;color:#64748b';
    const label=text('label', 'Relief depth (cm) ');label.style.display='block';
    const depth=document.createElement('input');depth.id='finish-upload-depth';depth.type='number';depth.min='1';depth.max='25';depth.step='1';depth.value=String(uploadDepthCm);depth.style.width='70px';
    depth.oninput=()=>{uploadDepthCm=depth.valueAsNumber;};label.append(depth);
    const appearanceLabel=text('label','');appearanceLabel.style.display='block';
    const appearance=document.createElement('input');appearance.type='checkbox';appearance.checked=preserveUploadAppearance;appearance.id='finish-upload-preserve';
    appearance.onchange=()=>{preserveUploadAppearance=appearance.checked;};
    appearanceLabel.append(appearance,document.createTextNode(' Preserve photo colours and lighting'));
    text('small', 'Uncheck to shade the relief with room lights. Lights OFF cannot remove lighting already photographed in your upload.').style.cssText='display:block;color:#64748b';
    const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.id='finish-upload-image';file.disabled=uploading;file.style.cssText='display:block;max-width:100%;margin-top:10px';panel.append(file);
    if(uploading)text('p','Estimating depth… this can take a minute on the first image.').setAttribute('role','status');
    file.onchange=async()=>{
      const image=file.files?.[0];if(!image)return;
      if(image.size>8*1024*1024){setMessage('Choose an image under 8 MB.',true);return;}
      if(!Number.isFinite(uploadDepthCm)||uploadDepthCm<1||uploadDepthCm>25){setMessage('Enter a relief depth from 1 to 25 cm.',true);return;}
      const targetRoomId=roomId,reliefM=uploadDepthCm/100,preserveAppearance=preserveUploadAppearance;
      uploading=true;message='';render();
      const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),180000);
      try{
        const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(image);});
        const response=await fetch('/api/wall-relief',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:data}),signal:abort.signal});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not estimate image depth.');
        const style=registerCustomWallStyle({id:`custom-wall-${crypto.randomUUID()}`,label:image.name.replace(/\.[^.]+$/,'').slice(0,60),image:result.image,depth:result.depth,aspect:result.aspect,reliefM,preserveAppearance});
        if(!style)throw new Error('The generated relief could not be loaded. Try a smaller image.');
        if(roomId===targetRoomId){draft={...draft,wallPanel:style.id};message='Relief ready. Choose wall in 3D or Mark specific area in 3D to preview and save it.';failed=false;}
      }catch(error){message=error.name==='AbortError'?'Depth estimation timed out. Try again after the model finishes loading.':error.message||'Could not reach the depth backend on port 5050.';failed=true;}
      finally{clearTimeout(timeout);uploading=false;render();}
    };
  }
  function renderWallAreas() {
    const regions = draft.wallPanelRegions || [];
    if (draft.wallPanel) {
      actionButton('finish-mark-wall-area', 'Mark specific area in 3D', () => {
        beginInteraction(() => onMarkWallArea(roomId, draft, draft.wallPanel));
      });
      text('small', 'Click two opposite corners on the same inside wall, then confirm the marked area. Door and window openings stay clear.').style.cssText = 'display:block;color:#64748b;margin-top:6px';
    }
    if (!regions.length) return;
    text('strong', 'Marked wall areas').style.cssText = 'display:block;margin-top:12px';
    const list = document.createElement('ul'); list.id = 'finish-wall-regions'; list.style.cssText = 'padding-left:18px'; panel.append(list);
    regions.forEach((region, index) => {
      const entry = document.createElement('li'); entry.dataset.regionId = region.id; list.append(entry);
      const width = Math.max(0, region.endM - region.startM), height = Math.max(0, region.topM - region.bottomM);
      const wallName = getWallChoices(roomId).find(wall => wall.id === region.wallId)?.label || region.wallId;
      text('span', `${index + 1}. ${wallName}: ${width.toFixed(2)} × ${height.toFixed(2)} m`, entry);
      const remove = button('Remove area', () => {
        const remaining = regions.filter(item => item.id !== region.id);
        const next = { ...draft, wallPanelRegions: remaining };
        if (!remaining.length) { delete next.wallPanelRegions; delete next.wallPanel; }
        applyDraft(next);
      }); remove.dataset.removeRegionId = region.id; entry.append(remove);
    });
    if (draft.wallPanel) actionButton('finish-full-wall', 'Use full wall instead', () => {
      beginInteraction(() => onPickWall(roomId, draft));
    });
  }
  function loadRoom() {
    const room = selectedRoom();
    draft = room ? normalizeRoomDesign(room.design || { roomType: inferRoomType(room) }) : {};
    selectedLightId = ''; fullWallPending = false; loadLightSettings();
    message = ''; failed = false;
  }
  function render() {
    const scroll = panel.scrollTop; panel.replaceChildren();
    text('strong', 'Design one room at a time').style.fontSize = '16px';
    text('p', '12 architectural ceilings, 54 reference false ceilings, and 40 finish concepts. Combine a ceiling, floor and accent wall, then save the room.');
    const available = rooms();
    if (!available.length) { text('p', 'No usable room outlines yet. Run the scan or Trace Room along the inside wall faces in the tracer, then reopen the 3D viewer. Detection boxes cannot define these finishes.'); return; }
    select('finish-room', 'Room', available.map(room => ({ id: room.id, label: room.name || room.id })), roomId, value => { onCancelInteraction(); roomId = value; loadRoom(); render(); });
    const room = selectedRoom(); if (!room) return;
    const area = polygonArea(room.points || room.polygon);
    text('p', `Plan outline: ${area.toFixed(2)} m² (${(area * SQFT_PER_SQM).toFixed(2)} sq ft). These finishes keep the outline and wall lengths unchanged.`).style.color = '#475569';
    select('finish-room-type', 'Style collection', [{ id: '', label: 'Choose room type' }, ...ROOM_TYPES], draft.roomType, value => {
      draft = normalizeRoomDesign({ ...draft, roomType: value });
      selectedLightId = ''; fullWallPending = false; loadLightSettings();
      message = 'Choose finishes from this collection before applying.'; render();
    });
    if (draft.roomType) {
      CATEGORIES.forEach(category => {
        const styles = optionsFor(draft.roomType, category.id);
        if (!styles.length) { text('p', `${category.label}: no options specified for this room type in the report.`); return; }
        const choices = category.id === 'ceiling'
          ? [{ label: 'Ceiling types', options: styles.filter(style => isProfileCeiling(style) && style.ceilingType !== 'reference') },
            { label: 'Reference false ceilings (01–54)', options: styles.filter(style => style.ceilingType === 'reference') },
            { label: 'Material concepts', options: styles.filter(style => !isProfileCeiling(style)) }]
          : styles;
        const choose = value => {
          draft = { ...draft, [category.id]: value || null };
          if (category.id === 'wallPanel' && !value) { delete draft.wallPanelRegions; fullWallPending = false; }
          message = 'Unsaved changes. Choose Apply to preview and save.'; render();
        };
        const picker = select(`finish-${category.id}`, category.label, [{ id: '', label: 'Default / no added finish' }, ...choices], draft[category.id], choose);
        picker.hidden = true; picker.style.display = 'none';
        const gallery = document.createElement('div');
        gallery.setAttribute('role','group');gallery.setAttribute('aria-label',category.label);
        gallery.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;max-height:260px;overflow:auto;margin-top:6px';
        const clear=button('No finish',()=>choose(''));clear.style.margin='0';gallery.append(clear);
        for(const option of styles){
          const card=document.createElement('button');card.type='button';card.title=option.label;
          card.setAttribute('aria-label',option.label);card.setAttribute('aria-pressed',String(draft[category.id]===option.id));
          card.style.cssText=`padding:3px;background:#f4f0ea;cursor:pointer;border-radius:6px;border:2px solid ${draft[category.id]===option.id?'#6366f1':'#ddd'}`;
          const img=document.createElement('img');img.alt=option.label;img.loading='lazy';img.style.cssText='width:100%;height:95px;object-fit:contain';
          card.append(img);card.onclick=()=>choose(option.id);gallery.append(card);attachFinishThumbnail(img,option);
          if(option.stoneId){const caption=document.createElement('span');caption.textContent=option.label;caption.style.cssText='display:block;font:11px system-ui;color:#172033';card.append(caption);}
        }
        panel.append(gallery);
        const style = getFinishStyle(draft[category.id]);
        if (style) text('small', style.material).style.cssText = 'display:block;color:#64748b;margin-top:4px';
      });
      if ((draft.wallPanel && (!(draft.wallPanelRegions || []).length || fullWallPending)) || draft.tvPanel || getFinishStyle(draft.ceiling)?.pattern === 'cascade') {
        actionButton('finish-pick-wall', 'Choose wall in 3D', () => {
          beginInteraction(() => onPickWall(roomId, draft));
        });
        text('small', 'Click a wall in the 3D Model to apply the design to its full face. For a wallpaper-sized patch, use Mark specific area in 3D below.').style.cssText = 'display:block;color:#64748b;margin-top:6px';
        const choices = getWallChoices(roomId);
        select('finish-accent-wall', 'Wall by number (optional)', [{ id: '', label: 'Choose the wall' }, ...choices], draft.accentWallId,
          value => { delete draft.accentWallSide; draft.accentWallId = value; message = 'Unsaved changes.'; render(); });
        if (!choices.length) text('p', 'No wall face matches this room boundary. Correct the outline in the tracer before adding wall panels.');
        text('small', 'W1, W2… match the wall labels in Measurements. Openings stay clear. TV styles are decorative backdrops, not dimensioned TV products.').style.color = '#64748b';
      }
      renderWallAreas();
      renderImageReliefUpload();
      if (draft.ceiling) {
        const ceilingStyle = getFinishStyle(draft.ceiling);
        const profile = isProfileCeiling(ceilingStyle), raised = profile && ceilingStyle.raised;
        const settings = normalizeCeilingSettings(draft);
        const label = text('label', raised ? 'Peak below room height (cm) ' : 'Ceiling drop (cm) '); label.style.cssText = 'display:block;margin-top:12px;font-weight:600'; label.htmlFor = 'finish-ceiling-drop';
        const drop = document.createElement('input'); drop.id = 'finish-ceiling-drop'; drop.type = 'number'; drop.min = '5'; drop.max = '45'; drop.step = '1';
        drop.value = String(Math.round((draft.ceilingDropM ?? 0.15) * 100)); drop.style.cssText = 'width:60px;padding:6px'; label.append(drop);
        drop.onchange = () => {
          if (!Number.isFinite(drop.valueAsNumber) || drop.valueAsNumber < 5 || drop.valueAsNumber > 45) { drop.setCustomValidity('Enter a drop between 5 and 45 cm.'); drop.reportValidity(); return; }
          drop.setCustomValidity(''); draft.ceilingDropM = drop.valueAsNumber / 100; message = 'Unsaved changes.'; render();
        };
        if (raised) {
          const riseLabel = text('label', 'Rise / slope (cm) '); riseLabel.style.cssText = 'display:block;margin-top:12px;font-weight:600'; riseLabel.htmlFor = 'finish-ceiling-rise';
          const rise = document.createElement('input'); rise.id = 'finish-ceiling-rise'; rise.type = 'number'; rise.min = '10'; rise.max = '200'; rise.step = '1';
          rise.value = String(Math.round(settings.ceilingRiseM * 100)); rise.style.cssText = 'width:60px;padding:6px'; riseLabel.append(rise);
          rise.onchange = () => {
            if (!Number.isFinite(rise.valueAsNumber) || rise.valueAsNumber < 10 || rise.valueAsNumber > 200) { rise.setCustomValidity('Enter a rise between 10 and 200 cm.'); rise.reportValidity(); return; }
            rise.setCustomValidity(''); draft.ceilingRiseM = rise.valueAsNumber / 100; message = 'Unsaved changes.'; render();
          };
        }
        if (profile && ['cathedral', 'vaulted', 'barrel-vault', 'shed', 'wooden-panel'].includes(ceilingStyle.ceilingType)) {
          select('finish-ceiling-axis', 'Slope / panel direction', [{ id: 'x', label: 'Across plan X' }, { id: 'z', label: 'Across plan Y' }], settings.ceilingAxis,
            value => { draft.ceilingAxis = value; message = 'Unsaved changes.'; render(); });
        }
        const height = Number.isFinite(room.height) && room.height > 0 ? room.height : 3;
        const heights = getCeilingHeights({ roomHeight: height, style: ceilingStyle, selection: settings });
        const lowest = heights.minHeightM;
        const levels = text('small', profile
          ? raised ? `Configured profile: peak ${heights.maxHeightM.toFixed(2)} m; edge ${lowest.toFixed(2)} m above the floor. An irregular room can clip away part of the profile.`
            : `Lowest finish: ${lowest.toFixed(2)} m above the floor.${heights.maxHeightM > lowest ? ` Recessed field: ${heights.maxHeightM.toFixed(2)} m.` : ''}`
          : `Lowered finish: ${lowest.toFixed(2)} m above the floor. Recessed fields may sit higher.`);
        levels.id = 'finish-ceiling-heights'; levels.style.cssText = `display:block;margin-top:8px;color:${lowest <= 0.1 ? '#b91c1c' : '#475569'}`;
        text('small', `Model room height stays ${height.toFixed(2)} m. The ceiling sits within this height and reduces headroom. Walk checks its clearance; Toggle Ceiling shows it.`).style.cssText = 'display:block;margin-top:4px;color:#64748b';
      }
      renderLights();
      const palette = text('label', 'Accent colour '); palette.style.cssText = 'display:block;margin-top:12px;font-weight:600'; palette.htmlFor = 'finish-color';
      const color = document.createElement('input'); color.id = 'finish-color'; color.type = 'color'; color.value = draft.color || '#a98a67';
      color.onchange = () => { draft.color = color.value; message = 'Unsaved accent colour.'; render(); }; palette.append(color);
      panel.append(button('Use style colours', () => { delete draft.color; message = 'Unsaved palette reset.'; render(); }));
      panel.append(button('Apply to this room', () => {
        applyDraft(draft);
      }));
    }
    panel.append(button('Reset this room', () => {
      onCancelInteraction();
      const result = onReset(roomId); loadRoom(); message = result.message; failed = !result.ok; render();
    }));
    if (message) { const status = text('p', message); status.id = 'finish-status'; status.setAttribute('role', 'status'); status.style.color = failed ? '#b91c1c' : '#166534'; }
    text('p', 'Free local previews. Material and installation prices are not estimated. Waterproofing, fire and slip performance depend on the actual product and installation.').style.cssText = 'font-size:11px;color:#64748b;margin-bottom:0';
    panel.scrollTop = scroll;
  }
  function refresh() {
    const available = rooms();
    if (!available.some(room => room.id === roomId)) roomId = available[0]?.id || null;
    loadRoom(); render();
  }
  function show(nextRoomId, statusMessage) {
    if (nextRoomId !== undefined && nextRoomId !== null && nextRoomId !== roomId) onCancelInteraction();
    if (nextRoomId !== undefined && nextRoomId !== null) roomId = nextRoomId;
    onOpen(); refresh();
    panel.hidden = false; toggle.setAttribute('aria-expanded', 'true');
    if (statusMessage !== undefined) setMessage(statusMessage);
  }
  function hide() {
    panel.hidden = true; toggle.setAttribute('aria-expanded', 'false');
  }
  function selectLight(lightId) {
    if (!(draft.ceilingLights || []).some(light => light.id === lightId)) return false;
    selectedLightId = lightId; loadLightSettings(); render();
    const field = panel.querySelector('#finish-light-width');
    field?.focus({ preventScroll: true });
    panel.querySelector('#finish-light-selection')?.scrollIntoView({ block: 'start' });
    return true;
  }
  function editLight(nextRoomId, lightId) {
    show(nextRoomId);
    return selectLight(lightId);
  }
  toggle.onclick = () => {
    const opening = panel.hidden;
    onCancelInteraction();
    if (opening) show(); else hide();
  };
  document.body.append(toggle, panel);
  return { refresh, show, hide, editLight, setMessage, destroy() { onCancelInteraction(); toggle.remove(); panel.remove(); } };
}
