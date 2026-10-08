import { ROOM_TYPES, CATEGORIES, optionsFor, getFinishStyle, inferRoomType, normalizeRoomDesign } from '../design/roomDesignCatalog.js';
import { isProfileCeiling, normalizeCeilingSettings } from '../design/ceilingTypes.js';
import { getCeilingHeights } from '../design/ceilingProfiles.js';
import { CEILING_LIGHT_TYPES } from '../design/ceilingLights.js';
import { isDesignableRoom } from '../design/roomSurfaces.js';
import { polygonArea, SQFT_PER_SQM } from '../measurements/modelMeasurements.js';

export function setupRoomDesignPanel({ getLayout, getWallChoices, onApply, onReset, onOpen = () => {},
  onPlaceLight = () => ({ ok: false, message: 'Light placement is unavailable.' }),
  onMarkWallArea = () => ({ ok: false, message: 'Wall area marking is unavailable.' }),
  onCancelInteraction = () => {} }) {
  let roomId = null, draft = {}, message = '', failed = false;
  let selectedLightId = '', lightSettings = {}, fullWallPending = false;
  const toggle = document.createElement('button'); toggle.id = 'room-finishes-toggle'; toggle.textContent = 'Room Finishes';
  toggle.setAttribute('aria-controls', 'room-finishes-panel'); toggle.setAttribute('aria-expanded', 'false');
  toggle.style.cssText = 'position:fixed;bottom:180px;left:16px;z-index:45;padding:12px 16px;border:1px solid #a5b4fc;border-radius:10px;background:#3730a3;color:#fff;font:600 13px system-ui;cursor:pointer';
  const panel = document.createElement('section'); panel.id = 'room-finishes-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Room finishes');
  panel.style.cssText = 'position:fixed;bottom:232px;left:16px;z-index:45;width:min(365px,calc(100vw - 32px));max-height:calc(100vh - 305px);overflow:auto;box-sizing:border-box;padding:16px;background:#fffffff5;color:#172033;border-radius:12px;box-shadow:0 5px 25px #0004;font:13px/1.45 system-ui';
  const rooms = () => (getLayout().rooms || []).filter(isDesignableRoom);
  const selectedRoom = () => rooms().find(room => room.id === roomId);
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
    lightSettings = {
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
  function applyDraft(next) {
    if (!validInputs()) return false;
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
    input.oninput = () => { lightSettings[key] = input.value; }; label.append(input); return input;
  }
  function readLightSettings() {
    if (!validInputs()) return null;
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
    if (!CEILING_LIGHT_TYPES.some(type => type.id === lightSettings.type) || [lumens, temperatureK, rotationDegrees, dropCm].includes(null)) {
      setMessage('Enter valid light settings before continuing.', true); return null;
    }
    return { type: lightSettings.type, lumens, temperatureK, dropM: dropCm / 100,
      rotation: rotationDegrees * Math.PI / 180, enabled: lightSettings.enabled };
  }
  function renderLights() {
    const heading = text('h3', 'Ceiling lights'); heading.style.cssText = 'font-size:14px;margin:18px 0 0';
    const lights = draft.ceilingLights || [];
    select('finish-light-selection', 'Light to edit', [{ id: '', label: 'New light' }, ...lights.map((light, index) => ({
      id: light.id, label: `${index + 1}. ${CEILING_LIGHT_TYPES.find(type => type.id === light.type)?.label || light.type}${light.enabled === false ? ' (off)' : ''}`,
    }))], selectedLightId, value => { selectedLightId = value; loadLightSettings(); render(); });
    select('finish-light-type', 'Light type', CEILING_LIGHT_TYPES, lightSettings.type,
      value => { lightSettings.type = value; render(); });
    lightNumber('finish-light-lumens', 'Brightness (lumens)', 'lumens', 50, 5000);
    lightNumber('finish-light-temperature', 'Colour temperature (K)', 'temperatureK', 2200, 6500);
    if (['pendant', 'chandelier'].includes(lightSettings.type)) {
      lightNumber('finish-light-drop', 'Total hanging depth (cm)', 'dropCm', 10, 150);
      text('small', 'Measured from the ceiling to the lowest part of the light.').style.cssText = 'display:block;color:#64748b;margin-top:4px';
    }
    lightNumber('finish-light-rotation', 'Rotation (degrees)', 'rotationDegrees', -360, 360);
    const enabledLabel = text('label', ''); enabledLabel.style.cssText = 'display:block;margin-top:10px';
    const enabled = document.createElement('input'); enabled.id = 'finish-light-enabled'; enabled.type = 'checkbox'; enabled.checked = lightSettings.enabled;
    enabled.onchange = () => { lightSettings.enabled = enabled.checked; };
    enabledLabel.append(enabled, document.createTextNode(' Light on'));
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
      actionButton('finish-update-light', 'Update light', () => {
        const settings = readLightSettings(); if (!settings) return;
        applyDraft({ ...draft, ceilingLights: lights.map(light => light.id === selectedLightId ? { ...light, ...settings } : light) });
      });
      actionButton('finish-remove-light', 'Remove light', () => {
        applyDraft({ ...draft, ceilingLights: lights.filter(light => light.id !== selectedLightId) });
      });
    }
  }
  function renderWallAreas() {
    const regions = draft.wallPanelRegions || [];
    if (draft.wallPanel) {
      actionButton('finish-mark-wall-area', 'Mark area in 3D', () => {
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
      if (!validInputs()) return;
      if (!draft.accentWallId) {
        fullWallPending = true;
        setMessage('Choose an accent wall, then select Use full wall instead to replace the marked areas.'); return;
      }
      const next = { ...draft }; delete next.wallPanelRegions; applyDraft(next);
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
    text('p', '12 ceiling types plus 40 finish concepts from your references. Combine a ceiling, floor and accent wall, then save the room.');
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
          ? [{ label: 'Ceiling types', options: styles.filter(isProfileCeiling) }, { label: 'Material concepts', options: styles.filter(style => !isProfileCeiling(style)) }]
          : styles;
        select(`finish-${category.id}`, category.label, [{ id: '', label: 'Default / no added finish' }, ...choices], draft[category.id], value => {
          draft = { ...draft, [category.id]: value || null };
          if (category.id === 'wallPanel' && !value) { delete draft.wallPanelRegions; fullWallPending = false; }
          message = 'Unsaved changes. Choose Apply to preview and save.'; render();
        });
        const style = getFinishStyle(draft[category.id]);
        if (style) text('small', style.material).style.cssText = 'display:block;color:#64748b;margin-top:4px';
      });
      if ((draft.wallPanel && (!(draft.wallPanelRegions || []).length || fullWallPending)) || draft.tvPanel || getFinishStyle(draft.ceiling)?.pattern === 'cascade') {
        const choices = getWallChoices(roomId);
        select('finish-accent-wall', 'Accent wall (panels, TV or headboard cascade)', [{ id: '', label: 'Choose the wall' }, ...choices], draft.accentWallId,
          value => { draft.accentWallId = value; message = 'Unsaved changes.'; render(); });
        if (!choices.length) text('p', 'No wall face matches this room boundary. Correct the outline in the tracer before adding wall panels.');
        text('small', 'W1, W2… match the wall labels in Measurements. Openings stay clear. TV styles are decorative backdrops, not dimensioned TV products.').style.color = '#64748b';
      }
      renderWallAreas();
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
  toggle.onclick = () => {
    const opening = panel.hidden;
    onCancelInteraction();
    if (opening) show(); else hide();
  };
  document.body.append(toggle, panel);
  return { refresh, show, hide, setMessage, destroy() { onCancelInteraction(); toggle.remove(); panel.remove(); } };
}
