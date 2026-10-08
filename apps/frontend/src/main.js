import * as THREE from 'three';
import { persistLayout } from './state/projectPersistence.js';
import { buildWallSegments } from './measurements/modelMeasurements.js';
import { setupMeasurementPanel } from './ui/measurementPanel.js';
import { setupRoomDesignPanel } from './ui/roomDesignPanel.js';
import { createRoomDesignInteraction } from './ui/roomDesignInteraction.js';
import { isDesignableRoom } from './design/roomSurfaces.js';
import { createRoomDesignController } from './design/roomDesignController.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createBasicScene } from './scene/scene.js';
import { loadLayout, parseLayout } from './loaders/jsonLoader.js';
import { createFloor } from './generators/floor.js';
import { createWall } from './generators/wall.js';
import { createCeiling } from './generators/ceiling.js';
import { buildCeilingCoverage } from './generators/ceilingCoverage.js';
import { createObject, getWindowSillAndTop } from './generators/object.js';
import { WALLPAPER_FINISHES, createWallpaperMaterial } from './materials/wallpaper.js';
import { buildCustomMurals, disposeCustomMurals, normalizeCustomMurals, normalizeCustomPaintAreas } from './materials/customMurals.js';
import { applyCeilingVisibility, setupViewerControls } from './controls/controls.js';
import { createAIChatPanel } from './ai/chatPanel.js';
import { createCatalogPanel, CATEGORIES } from './ui/catalogPanel.js';
import { enterRenderMode, exitRenderMode, getComposer, onRenderResize } from './ui/renderMode.js';

const container = document.getElementById('app') || document.body;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const { scene, camera, controls } = createBasicScene(renderer.domElement, OrbitControls);
let viewerControls = null;
let roomDesignController = null;
let roomDesignPanel = null;
let roomDesignInteraction = null;
let renderedWallSegments = [];
const baseRoomFloors = new Map();

// ── 3D Model / 3D Render toggle ────────────────────────────
(function buildRenderToggle() {
  let isRender = false;

  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'position:fixed;top:14px;left:50%;transform:translateX(-50%)',
    'background:rgba(16,16,24,0.82);border:1px solid rgba(255,255,255,0.14)',
    'border-radius:22px;padding:3px;display:flex;gap:2px;z-index:40',
    'backdrop-filter:blur(10px);box-shadow:0 2px 14px rgba(0,0,0,0.35)',
    'user-select:none',
  ].join(';');

  const makeTab = (label, icon, active) => {
    const b = document.createElement('button');
    b.innerHTML = `${icon} ${label}`;
    b.style.cssText = [
      'padding:7px 20px;border-radius:18px;border:none;cursor:pointer',
      'font-size:13px;font-weight:600;letter-spacing:0.01em',
      'font-family:Inter,system-ui,sans-serif;transition:all 0.22s ease',
      active
        ? 'background:#6366f1;color:#fff;box-shadow:0 2px 8px rgba(99,102,241,0.45)'
        : 'background:transparent;color:#9ca3af',
    ].join(';');
    return b;
  };

  const modelTab = makeTab('3D Model', '🧱', true);
  const renderTab = makeTab('3D Render', '✨', false);

  const setActive = (which) => {
    if (which === 'render') {
      renderTab.style.background = '#6366f1';
      renderTab.style.color = '#fff';
      renderTab.style.boxShadow = '0 2px 8px rgba(99,102,241,0.45)';
      modelTab.style.background = 'transparent';
      modelTab.style.color = '#9ca3af';
      modelTab.style.boxShadow = 'none';
    } else {
      modelTab.style.background = '#6366f1';
      modelTab.style.color = '#fff';
      modelTab.style.boxShadow = '0 2px 8px rgba(99,102,241,0.45)';
      renderTab.style.background = 'transparent';
      renderTab.style.color = '#9ca3af';
      renderTab.style.boxShadow = 'none';
    }
  };

  modelTab.addEventListener('click', () => {
    if (!isRender) return;
    isRender = false;
    exitRenderMode(scene, renderer);
    setActive('model');
  });

  renderTab.addEventListener('click', () => {
    if (isRender) return;
    try {
      enterRenderMode(scene, renderer, camera);
      isRender = true;
      setActive('render');
    } catch (error) {
      console.error('Render mode failed:', error);
      renderTab.title = 'Render effects unavailable. The 3D model remains usable.';
    }
  });

  wrap.append(modelTab, renderTab);
  document.body.appendChild(wrap);
})();

// Raycaster for door clicking and object selection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const clickableDoors = [];

// ── Wall selection ─────────────────────────────────────────
const selectableWalls = [];    // wall meshes that can be clicked to repaint

// ── Object selection & rotation ────────────────────────────
const selectableMeshes = [];   // non-door scene objects that can be picked
let selectedObject = null;
let selectionHelper = null;

function selectObject(obj) {
  deselectObject();
  selectedObject = obj;
  selectionHelper = new THREE.BoxHelper(obj, 0xff8c00);
  selectionHelper.userData.isHelper = true;
  scene.add(selectionHelper);
  _showObjectPanel(obj);
}

function deselectObject() {
  if (selectionHelper) {
    scene.remove(selectionHelper);
    selectionHelper.geometry.dispose();
    selectionHelper.material.dispose();
    selectionHelper = null;
  }
  document.getElementById('obj-ctrl-panel')?.remove();
  document.getElementById('replace-panel')?.remove();
  selectedObject = null;
}

function deleteSelected() {
  if (!selectedObject) return;
  const removedOpening = /door|window|glass/.test(selectedObject.userData.objectType || '');
  const id = selectedObject.userData.layoutId;
  // Remove from scene
  scene.remove(selectedObject);
  selectedObject.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material?.dispose();
    }
  });
  // Remove from selectableMeshes and clickableDoors
  const idx = selectableMeshes.indexOf(selectedObject);
  if (idx !== -1) selectableMeshes.splice(idx, 1);
  const di = clickableDoors.indexOf(selectedObject);
  if (di !== -1) clickableDoors.splice(di, 1);
  // Remove from layoutRef
  if (id && layoutRef.current?.objects) {
    const li = layoutRef.current.objects.findIndex(o => o.id === id);
    if (li !== -1) layoutRef.current.objects.splice(li, 1);
  }
  persistLayout(layoutRef.current);
  deselectObject();
  if (removedOpening) rebuildWalls(layoutRef.current);
}

// Door animations on furniture: { mesh, targetAngle, speed }
const furnitureDoorAnims = [];

// ── Window / door open-close animation ─────────────────────
const _winAnimNodes = []; // {node, prop, from, to, t}

function tickWinAnims() {
  for (let i = _winAnimNodes.length - 1; i >= 0; i--) {
    const a = _winAnimNodes[i];
    a.t = Math.min(a.t + 0.055, 1.0); // ~18 frames to complete
    const e = 1 - Math.pow(1 - a.t, 3); // easeOutCubic
    const v = a.from + (a.to - a.from) * e;
    if      (a.prop === 'px') a.node.position.x   = v;
    else if (a.prop === 'pz') a.node.position.z   = v;
    else if (a.prop === 'ry') a.node.rotation.y   = v;
    else if (a.prop === 'rx') a.node.rotation.x   = v;
    if (a.t >= 1.0) _winAnimNodes.splice(i, 1);
  }
}

function toggleWinDoorAnim(mesh) {
  // Collect all tagged animation nodes inside this mesh group
  const nodes = [];
  mesh.traverse(c => { if (c.userData._animType) nodes.push(c); });

  // Catalog-placed swing door (hinge with isDoor) — use existing toggleDoor
  if (!nodes.length) {
    if (mesh.userData.isDoor) { toggleDoor(mesh); return true; }
    // Try children (hinge may be a parent of the clickable group)
    let h = null;
    mesh.traverse(c => { if (c.userData.isDoor && !h) h = c; });
    if (h) { toggleDoor(h); return true; }
    return false;
  }

  const isOpen = nodes[0].userData._animOpen;
  nodes.forEach(node => {
    node.userData._animOpen = !isOpen;
    const target = isOpen ? node.userData._closedState : node.userData._openState;

    // Current value
    const prop = node.userData._animProp;
    const current = prop === 'px' ? node.position.x
                  : prop === 'pz' ? node.position.z
                  : prop === 'ry' ? node.rotation.y
                  : node.rotation.x;

    // Cancel existing anim for this node
    const ei = _winAnimNodes.findIndex(a => a.node === node);
    if (ei !== -1) _winAnimNodes.splice(ei, 1);
    _winAnimNodes.push({ node, prop, from: current, to: target, t: 0 });
  });
  return true;
}

function tickFurnitureDoors() {
  if (!furnitureDoorAnims.length) return;
  for (let i = furnitureDoorAnims.length - 1; i >= 0; i--) {
    const a = furnitureDoorAnims[i];
    const diff = a.targetAngle - a.mesh.rotation.y;
    if (Math.abs(diff) < 0.002) {
      a.mesh.rotation.y = a.targetAngle;
      furnitureDoorAnims.splice(i, 1);
    } else {
      a.mesh.rotation.y += diff * 0.18;  // slightly faster, more responsive
    }
  }
  if (selectionHelper) selectionHelper.update();
}

function toggleFurnitureDoors(obj) {
  const doors = [];
  obj.traverse((child) => {
    if (child.userData.isFurnitureDoor) doors.push(child);  // Groups, not meshes
  });
  if (!doors.length) return false;
  const isOpen = doors[0].userData.doorOpen;
  doors.forEach((door) => {
    door.userData.doorOpen = !isOpen;
    const swing = door.userData.doorSwing ?? Math.PI / 2;
    const target = door.userData.doorOpen ? swing : 0;
    // remove existing anim for this door
    const ei = furnitureDoorAnims.findIndex(a => a.mesh === door);
    if (ei !== -1) furnitureDoorAnims.splice(ei, 1);
    furnitureDoorAnims.push({ mesh: door, targetAngle: target });
  });
  return true;
}

function rotateSelected(deltaY) {
  if (!selectedObject) return;
  selectedObject.rotation.y += deltaY;
  if (selectionHelper) selectionHelper.update();
  // Persist rotation into layoutRef so the chat panel sees up-to-date state
  const id = selectedObject.userData.layoutId;
  if (id && layoutRef.current) {
    const o = (layoutRef.current.objects || []).find(x => x.id === id);
    if (o) {
      o.rotationY = selectedObject.rotation.y;
      persistLayout(layoutRef.current);
    }
  }
}

// ── Replace selected object with another catalog item ───────
function replaceSelected(newTypeId, newLabel, newW, newD) {
  if (!selectedObject) return;

  // Capture what we need before deleting
  const pos   = selectedObject.position.clone();
  const rotY  = selectedObject.rotation.y;
  const oldId = selectedObject.userData.layoutId;
  const oldWallHoriz = selectedObject.userData._wallHoriz;
  const oldSnapX = selectedObject.userData._snapX;
  const oldSnapZ = selectedObject.userData._snapZ;
  const oldClass = (selectedObject.userData.objectType || '').toLowerCase();
  const oldWasOpening = oldClass.includes('window') || oldClass.includes('door') || oldClass.includes('glass');

  // Tear down old object (dispose geometry/materials, remove from selectableMeshes + layoutRef)
  scene.remove(selectedObject);
  selectedObject.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose();
      (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => m?.dispose());
    }
  });
  const si = selectableMeshes.indexOf(selectedObject);
  if (si !== -1) selectableMeshes.splice(si, 1);
  if (oldId && layoutRef.current?.objects) {
    const li = layoutRef.current.objects.findIndex(o => o.id === oldId);
    if (li !== -1) layoutRef.current.objects.splice(li, 1);
  }
  deselectObject(); // clears panel + helper

  // Build new object centred on the same floor position
  const hw = newW / 2, hd = newD / 2;
  const newId = oldId || `cat-${crypto.randomUUID()}`;
  const newClass = (newTypeId || '').toLowerCase();
  const newIsOpening = newClass.includes('window') || newClass.includes('door') || newClass.includes('glass');
  const isOpeningReplacement = oldWasOpening || newIsOpening;
  const anchorX = Number.isFinite(oldSnapX) ? oldSnapX : pos.x;
  const anchorZ = Number.isFinite(oldSnapZ) ? oldSnapZ : pos.z;
  const replacementHoriz = oldWasOpening && oldWallHoriz !== undefined
    ? oldWallHoriz
    : true;
  // Opening bboxes are expressed across the wall depth and along its length.
  // Reusing the old wall orientation prevents a replacement from being rebuilt
  // at the cursor's default horizontal orientation.
  const bbox = isOpeningReplacement && !replacementHoriz
    ? { x1: anchorX - hd, y1: anchorZ - hw, x2: anchorX + hd, y2: anchorZ + hw }
    : { x1: anchorX - hw, y1: anchorZ - hd, x2: anchorX + hw, y2: anchorZ + hd };
  const elevation = pos.y || 0;
  const objData = {
    id: newId, class: newTypeId, source: 'catalog',
    bbox,
    elevation,
    layoutCenter: { x: 0, y: 0 },
    walls: layoutRef.current?.walls || [],
  };

  const newMesh = createObject(objData);
  if (!newMesh) return;

  // Opening objects must retain the wall snap. Furniture keeps the exact old
  // position and rotation as before (including surface elevation).
  if (!newMesh.userData._isWinDoor) {
    newMesh.position.set(pos.x, pos.y, pos.z);
    newMesh.rotation.y = rotY;
  }
  newMesh.userData.isSelectable  = true;
  newMesh.userData.objectType    = newTypeId;
  newMesh.userData.layoutId      = newId;
  scene.add(newMesh);
  selectableMeshes.push(newMesh);

  if (layoutRef.current) {
    layoutRef.current.objects = layoutRef.current.objects || [];
    if (newMesh.userData._isWinDoor) {
      const horiz = newMesh.userData._wallHoriz !== false;
      const sx = newMesh.userData._snapX ?? anchorX;
      const sz = newMesh.userData._snapZ ?? anchorZ;
      objData.bbox = horiz
        ? { x1: sx - hw, y1: sz - hd, x2: sx + hw, y2: sz + hd }
        : { x1: sx - hd, y1: sz - hw, x2: sx + hd, y2: sz + hw };
    }
    layoutRef.current.objects.push({ id: newId, class: newTypeId, bbox: objData.bbox, source: 'catalog', rotationY: newMesh.rotation.y, ...(elevation > 0.01 && { elevation }) });
    persistLayout(layoutRef.current);
    // Re-carve walls if the new/old object is a window or door type
    const needsCarve = (c) => c.includes('window') || c.includes('door') || c.includes('glass');
    if (needsCarve(newTypeId.toLowerCase()) || oldWasOpening) {
      rebuildWalls(layoutRef.current);
    }
  }

  document.getElementById('replace-panel')?.remove();
  selectObject(newMesh); // highlight + show control panel for new object
}

function _showReplacePanel() {
  document.getElementById('replace-panel')?.remove();
  if (!selectedObject) return;

  const panel = document.createElement('div');
  panel.id = 'replace-panel';
  panel.style.cssText = [
    'position:fixed;bottom:160px;left:50%;transform:translateX(-50%)',
    'background:rgba(12,12,20,0.96);border:1px solid rgba(99,102,241,0.45)',
    'border-radius:16px;padding:14px 16px;z-index:35',
    'font-family:Inter,system-ui,sans-serif;color:#e5e7eb',
    'backdrop-filter:blur(14px);box-shadow:0 6px 32px rgba(0,0,0,0.55)',
    'width:min(520px,90vw)',
  ].join(';');

  // ── Header ─────────────────────────────────────────────────
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px';
  const title = document.createElement('span');
  title.style.cssText = 'font-size:13px;font-weight:700;color:#a5b4fc';
  title.textContent = '🔄 Replace with…';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:none;border:none;color:#6b7280;cursor:pointer;font-size:15px;padding:2px 6px';
  closeBtn.onclick = () => panel.remove();
  hdr.append(title, closeBtn);

  // ── Category tab bar ───────────────────────────────────────
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px';

  // ── Item grid ──────────────────────────────────────────────
  const grid = document.createElement('div');
  grid.style.cssText = [
    'display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px',
    'max-height:220px;overflow-y:auto',
    'scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent',
  ].join(';');

  let activeCat = CATEGORIES[0].id;

  const renderGrid = (catId) => {
    grid.innerHTML = '';
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat) return;
    cat.items.forEach(item => {
      const card = document.createElement('button');
      card.style.cssText = [
        'display:flex;flex-direction:column;align-items:center;gap:4px',
        'padding:8px 4px;border-radius:10px;cursor:pointer',
        'border:1.5px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04)',
        'color:#e5e7eb;transition:all 0.12s',
      ].join(';');
      card.onmouseenter = () => {
        card.style.background = 'rgba(99,102,241,0.22)';
        card.style.borderColor = 'rgba(99,102,241,0.7)';
      };
      card.onmouseleave = () => {
        card.style.background = 'rgba(255,255,255,0.04)';
        card.style.borderColor = 'rgba(255,255,255,0.08)';
      };

      const iconEl = document.createElement('span');
      iconEl.style.cssText = 'font-size:22px;line-height:1';
      iconEl.textContent = item.icon;

      const nameEl = document.createElement('span');
      nameEl.style.cssText = 'font-size:9.5px;color:#d1d5db;text-align:center;line-height:1.3';
      nameEl.textContent = item.label;

      card.append(iconEl, nameEl);
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        replaceSelected(item.id, item.label, item.w, item.d);
      });
      grid.appendChild(card);
    });
  };

  const renderTabs = (activeCatId) => {
    tabBar.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const tab = document.createElement('button');
      const isActive = cat.id === activeCatId;
      tab.style.cssText = [
        'padding:4px 9px;border-radius:6px;cursor:pointer;font-size:11px;white-space:nowrap',
        'border:1px solid;transition:all 0.12s',
        isActive
          ? 'border-color:rgba(99,102,241,0.7);background:rgba(99,102,241,0.25);color:#a5b4fc'
          : 'border-color:rgba(255,255,255,0.08);background:transparent;color:#9ca3af',
      ].join(';');
      tab.textContent = `${cat.icon} ${cat.label}`;
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        activeCat = cat.id;
        renderTabs(activeCat);
        renderGrid(activeCat);
      });
      tabBar.appendChild(tab);
    });
  };

  renderTabs(activeCat);
  renderGrid(activeCat);
  panel.append(hdr, tabBar, grid);
  document.body.appendChild(panel);
}

function _showObjectPanel(obj) {
  const existing = document.getElementById('obj-ctrl-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'obj-ctrl-panel';
  panel.style.cssText = [
    'position:fixed;bottom:90px;left:50%;transform:translateX(-50%)',
    'background:rgba(16,16,24,0.88);border:1px solid rgba(255,255,255,0.12)',
    'border-radius:12px;padding:10px 14px;display:flex;gap:8px;align-items:center',
    'font-family:Inter,system-ui,sans-serif;color:#e5e7eb;z-index:30',
    'backdrop-filter:blur(8px);box-shadow:0 4px 20px rgba(0,0,0,0.4)',
  ].join(';');

  const label = document.createElement('span');
  label.style.cssText = 'font-size:11px;color:#9ca3af;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  label.textContent = obj.userData.objectType || 'object';

  const mkBtn = (text, title, onClick) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.title = title;
    b.style.cssText = [
      'padding:5px 11px;border-radius:8px;border:1px solid rgba(255,255,255,0.15)',
      'background:rgba(255,255,255,0.08);color:#f8fafc;cursor:pointer',
      'font-size:14px;line-height:1;transition:background 0.15s',
    ].join(';');
    b.onmouseenter = () => (b.style.background = 'rgba(255,255,255,0.2)');
    b.onmouseleave = () => (b.style.background = 'rgba(255,255,255,0.08)');
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  };

  const hint = document.createElement('span');
  hint.style.cssText = 'font-size:10px;color:#6b7280;margin-left:2px';
  hint.textContent = '[ ] R';

  // Door toggle button — furniture doors (wardrobes etc.)
  const hasFurnitureDoors = (() => {
    let found = false;
    obj.traverse(c => { if (c.userData.isFurnitureDoor) found = true; });
    return found;
  })();
  const doorBtn = hasFurnitureDoors ? mkBtn('🚪', 'Open / Close Doors (O)', () => toggleFurnitureDoors(obj)) : null;

  // Window / catalog-door open-close button
  const hasWinAnim = (() => {
    if (obj.userData._isWinDoor) return true;
    let found = false;
    obj.traverse(c => { if (c.userData._animType || c.userData.isDoor) found = true; });
    return found;
  })();
  const winBtn = hasWinAnim ? mkBtn('🪟', 'Open / Close (O)', () => toggleWinDoorAnim(obj)) : null;
  if (winBtn) {
    winBtn.style.cssText += ';color:#67e8f9;border-color:rgba(103,232,249,0.35)';
    winBtn.onmouseenter = () => (winBtn.style.background = 'rgba(103,232,249,0.15)');
    winBtn.onmouseleave = () => (winBtn.style.background = 'rgba(255,255,255,0.08)');
    winBtn.style.fontSize = '13px';
  }

  const divider = document.createElement('span');
  divider.style.cssText = 'width:1px;height:20px;background:rgba(255,255,255,0.15);margin:0 2px';

  const replaceBtn = mkBtn('🔄', 'Replace with another item', () => {
    const rp = document.getElementById('replace-panel');
    if (rp) { rp.remove(); return; }   // toggle off if already open
    _showReplacePanel();
  });
  replaceBtn.style.cssText += ';color:#a5b4fc;border-color:rgba(99,102,241,0.4)';
  replaceBtn.onmouseenter = () => (replaceBtn.style.background = 'rgba(99,102,241,0.25)');
  replaceBtn.onmouseleave = () => (replaceBtn.style.background = 'rgba(255,255,255,0.08)');
  // Add text label for clarity
  replaceBtn.textContent = '🔄 Replace';
  replaceBtn.style.fontSize = '12px';

  const deleteBtn = mkBtn('🗑', 'Delete object (Del)', deleteSelected);
  deleteBtn.style.cssText += ';color:#f87171';
  deleteBtn.onmouseenter = () => (deleteBtn.style.background = 'rgba(239,68,68,0.25)');
  deleteBtn.onmouseleave = () => (deleteBtn.style.background = 'rgba(255,255,255,0.08)');

  const close = mkBtn('✕', 'Deselect (Esc)', deselectObject);
  close.style.padding = '5px 8px';

  // Move buttons (nudge 0.1 m per click)
  const STEP = 0.1;
  const moveLeft  = mkBtn('←', 'Move left (ArrowLeft)',  () => _nudgeSelected(-STEP, 0));
  const moveRight = mkBtn('→', 'Move right (ArrowRight)', () => _nudgeSelected( STEP, 0));
  const moveFwd   = mkBtn('↑', 'Move forward (ArrowUp)',  () => _nudgeSelected(0, -STEP));
  const moveBack  = mkBtn('↓', 'Move back (ArrowDown)',   () => _nudgeSelected(0,  STEP));
  [moveLeft, moveRight, moveFwd, moveBack].forEach(b => {
    b.style.cssText += ';color:#86efac;border-color:rgba(74,222,128,0.3)';
    b.onmouseenter = () => (b.style.background = 'rgba(74,222,128,0.15)');
    b.onmouseleave = () => (b.style.background = 'rgba(255,255,255,0.08)');
  });

  // Scale buttons (stretch/shrink one edge by 0.1 m per click)
  // ⇐/⇒ = expand left/right edge outward  ⊖/⊕ hint on tooltips
  const scLeft  = mkBtn('⇐', 'Expand left edge',   () => _resizeEdge('nx',  STEP));
  const scRight = mkBtn('⇒', 'Expand right edge',  () => _resizeEdge('px',  STEP));
  const scFwd   = mkBtn('⇑', 'Expand back edge',   () => _resizeEdge('nz',  STEP));
  const scBack  = mkBtn('⇓', 'Expand front edge',  () => _resizeEdge('pz',  STEP));
  const scShrL  = mkBtn('↠', 'Shrink from left',   () => _resizeEdge('nx', -STEP));
  const scShrR  = mkBtn('↞', 'Shrink from right',  () => _resizeEdge('px', -STEP));
  [scLeft, scRight, scFwd, scBack, scShrL, scShrR].forEach(b => {
    b.style.cssText += ';color:#67e8f9;border-color:rgba(103,232,249,0.35)';
    b.onmouseenter = () => (b.style.background = 'rgba(103,232,249,0.15)');
    b.onmouseleave = () => (b.style.background = 'rgba(255,255,255,0.08)');
  });

  const divMov   = document.createElement('div');
  divMov.style.cssText = 'width:1px;background:rgba(255,255,255,0.12);margin:2px 2px;align-self:stretch';
  const divScale = document.createElement('div');
  divScale.style.cssText = divMov.style.cssText;

  const btns = [
    label,
    mkBtn('↺', 'Rotate CCW 45° ([)', () => rotateSelected(-Math.PI / 4)),
    mkBtn('↻', 'Rotate CW 45° (])', () => rotateSelected(Math.PI / 4)),
    mkBtn('↺90', 'Rotate CCW 90°', () => rotateSelected(-Math.PI / 2)),
    mkBtn('↻90', 'Rotate CW 90°', () => rotateSelected(Math.PI / 2)),
    hint,
    divMov,
    moveFwd, moveLeft, moveBack, moveRight,
    divScale,
    scLeft, scRight, scFwd, scBack, scShrL, scShrR,
  ];
  if (doorBtn) btns.push(doorBtn);
  if (winBtn)  btns.push(winBtn);
  btns.push(divider, replaceBtn, deleteBtn, close);
  panel.append(...btns);
  document.body.appendChild(panel);
}

// ── Wall colour picker ──────────────────────────────────────
// ── Wall multi-select paint system ─────────────────────────

let wallPaintMode  = false;      // toggle with the 🎨 button
let _wallPaintFace = 'inside';   // 'inside' | 'outside' — active tab in the panel
const pickedWalls  = [];         // currently marked wall meshes
const wallHelpers  = [];         // BoxHelper per picked wall
let pendingMuralImage = null;
let muralMarkMode = null;
let muralGroup = null;

const WALL_PALETTE = [
  { label: 'White',       hex: '#f5f4f0' },
  { label: 'Off-white',   hex: '#f2ede4' },
  { label: 'Warm Cream',  hex: '#f0e8d8' },
  { label: 'Beige',       hex: '#e8dcc8' },
  { label: 'Light Grey',  hex: '#d8d8d4' },
  { label: 'Warm Grey',   hex: '#c8c0b4' },
  { label: 'Taupe',       hex: '#c4b4a4' },
  { label: 'Sage Green',  hex: '#b8c8b0' },
  { label: 'Dusty Blue',  hex: '#b0c4d4' },
  { label: 'Lavender',    hex: '#d0c8e0' },
  { label: 'Soft Yellow', hex: '#f0e8b8' },
  { label: 'Terracotta',  hex: '#d4907a' },
  { label: 'Olive',       hex: '#a8b498' },
  { label: 'Slate Blue',  hex: '#8ca8c0' },
  { label: 'Blush Pink',  hex: '#e8c8c0' },
  { label: 'Charcoal',    hex: '#606060' },
];

// Clone a wall mesh's material so painting it won't affect other walls
function _ensureOwnMaterial(mesh) {
  const clone = (mat) => {
    if (!mat || mat.userData._ownedByMesh) return mat;
    const c = mat.clone();
    c.userData._ownedByMesh = true;
    return c;
  };
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map(clone);
  } else {
    mesh.material = clone(mesh.material);
  }
}

function _setMeshColor(mesh, color) {
  _ensureOwnMaterial(mesh);
  const apply = (mat) => {
    if (mat?.isMeshStandardMaterial) { mat.color.set(color); mat.needsUpdate = true; }
  };
  (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(apply);
  // also recolour baseboard children
  mesh.traverse((child) => {
    if (child !== mesh && child.isMesh) {
      _ensureOwnMaterial(child);
      (Array.isArray(child.material) ? child.material : [child.material]).forEach(apply);
    }
  });
}

// Apply a colour to one face (faceKey: 'inside' | 'outside') of the picked walls.
// Each wall mesh has a 6-element material array (BoxGeometry face groups). The two
// broad faces (+Z=4, -Z=5) are tagged insideFaceIdx / outsideFaceIdx in rebuildWalls.
function _applyFaceColor(faceKey, hex) {
  const color = new THREE.Color(hex);
  const targets = pickedWalls.length ? pickedWalls : selectableWalls;
  const parentIds = new Set(targets.map(mesh => mesh.userData.parentWallId));
  // All segments of the same original wall (including lintels/parapets) share
  // its finish, which survives opening replacement and project reloads.
  (layoutRef.current.walls || []).forEach(wall => {
    if (parentIds.has(wall.id)) {
      wall.faceColors = { ...wall.faceColors, [faceKey]: hex };
      if (wall.faceFinishes) {
        delete wall.faceFinishes[faceKey];
        if (!Object.keys(wall.faceFinishes).length) delete wall.faceFinishes;
      }
    }
  });
  selectableWalls.filter(mesh => parentIds.has(mesh.userData.parentWallId)).forEach((m) => {
    const mats = Array.isArray(m.material) ? m.material : null;
    if (!mats) {
      // Legacy single-material wall — paint it all
      _setMeshColor(m, color);
      return;
    }
    const idx = faceKey === 'inside' ? m.userData.insideFaceIdx : m.userData.outsideFaceIdx;
    if (idx !== undefined && mats[idx]) {
      mats[idx].map?.dispose();
      mats[idx].map = null;
      delete mats[idx].userData.wallpaperId;
      mats[idx].color.set(color);
      mats[idx].needsUpdate = true;
    }
  });
  persistLayout(layoutRef.current);
}

function _replaceWallFaceMaterial(mesh, faceKey, wallpaperId) {
  const mats = Array.isArray(mesh.material) ? mesh.material : null;
  const idx = faceKey === 'inside' ? mesh.userData.insideFaceIdx : mesh.userData.outsideFaceIdx;
  if (!mats || idx === undefined || !mats[idx]) return;
  const size = new THREE.Vector3();
  new THREE.Box3().setFromObject(mesh).getSize(size);
  const length = Math.max(size.x, size.z);
  const replacement = createWallpaperMaterial(wallpaperId, length, size.y);
  if (!replacement) return;
  const previous = mats[idx];
  mats[idx] = replacement;
  if (previous.userData?._ownedByMesh) {
    previous.map?.dispose();
    previous.dispose();
  }
}

function _applyFaceWallpaper(faceKey, wallpaperId) {
  const targets = pickedWalls.length ? pickedWalls : selectableWalls;
  const parentIds = new Set(targets.map(mesh => mesh.userData.parentWallId));
  (layoutRef.current.walls || []).forEach(wall => {
    if (!parentIds.has(wall.id)) return;
    wall.faceFinishes = { ...wall.faceFinishes, [faceKey]: { type: 'wallpaper', id: wallpaperId } };
  });
  selectableWalls.filter(mesh => parentIds.has(mesh.userData.parentWallId))
    .forEach(mesh => _replaceWallFaceMaterial(mesh, faceKey, wallpaperId));
  persistLayout(layoutRef.current);
}

function _selectedWallRecord() {
  const ids = [...new Set(pickedWalls.map(mesh => String(mesh.userData.parentWallId)))];
  return ids.length === 1 ? (layoutRef.current.walls || []).find(wall => String(wall.id) === ids[0]) : null;
}

function _readCustomMural(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) { reject(new Error('Choose a PNG, JPEG or WebP image.')); return; }
    if (file.size > 15 * 1024 * 1024) { reject(new Error('Choose an image smaller than 15 MB.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('The selected file is not a readable image.'));
      image.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.84);
        if (imageData.length > 2_000_000) { reject(new Error('The compressed image is still too large. Choose a smaller image.')); return; }
        resolve({ imageData, name: file.name || 'Custom mural', width: canvas.width, height: canvas.height });
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function _beginMuralMarking(count) {
  const wall = _selectedWallRecord();
  if (!wall) { count.textContent = '⚠ Select segments from exactly one wall.'; count.style.color = '#f87171'; return; }
  if (!pendingMuralImage) { count.textContent = '⚠ Upload a custom image first.'; count.style.color = '#f87171'; return; }
  const existing = normalizeCustomMurals(wall.customMurals, Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y), wall.height || 3);
  if (existing.length >= 24) { count.textContent = '⚠ This wall already has 24 custom image areas.'; count.style.color = '#f87171'; return; }
  muralMarkMode = { wall, face: _wallPaintFace, image: pendingMuralImage, kind: 'image', first: null };
  renderer.domElement.style.cursor = 'crosshair';
  count.textContent = `Click the first corner on the ${_wallPaintFace} face of this wall.`;
  count.style.color = '#67e8f9';
}

function _beginPaintMarking(count, color) {
  const wall = _selectedWallRecord();
  if (!wall) { count.textContent = '⚠ Select segments from exactly one wall.'; count.style.color = '#f87171'; return; }
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  if (normalizeCustomPaintAreas(wall.customPaintAreas, length, wall.height || 3).length >= 24) {
    count.textContent = '⚠ This wall already has 24 painted areas.'; count.style.color = '#f87171'; return;
  }
  muralMarkMode = { wall, face: _wallPaintFace, color, kind: 'paint', first: null };
  renderer.domElement.style.cursor = 'crosshair';
  count.textContent = `Click the first corner of the paint area on the ${_wallPaintFace} face.`;
  count.style.color = '#67e8f9';
}

function _cancelMuralMarking() {
  muralMarkMode = null;
  if (wallPaintMode) renderer.domElement.style.cursor = 'crosshair';
  _refreshWallPanel();
}

function _muralWallHit() {
  if (!muralMarkMode) return null;
  for (const hit of raycaster.intersectObjects(selectableWalls, false)) {
    const wallMesh = hit.object;
    if (String(wallMesh.userData.parentWallId) !== String(muralMarkMode.wall.id)) continue;
    const expected = wallMesh.userData[`${muralMarkMode.face}FaceIdx`];
    if (hit.face?.materialIndex !== expected) continue;
    return hit;
  }
  return null;
}

function _commitMuralCorner(hit, count) {
  if (!hit) { count.textContent = `Click the exposed ${muralMarkMode.face} face of the selected wall.`; count.style.color = '#f87171'; return; }
  if (!muralMarkMode.first) {
    muralMarkMode.first = hit.point.clone();
    count.textContent = 'First corner selected. Click the opposite corner on the same wall face.';
    return;
  }
  const wall = muralMarkMode.wall, dx = wall.end.x - wall.start.x, dz = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dz), tx = dx / length, tz = dz / length;
  const along = point => (point.x - wall.start.x) * tx + (point.z - wall.start.y) * tz;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, Math.round(value * 1000) / 1000));
  const startM = clamp(Math.min(along(muralMarkMode.first), along(hit.point)), 0, length);
  const endM = clamp(Math.max(along(muralMarkMode.first), along(hit.point)), 0, length);
  const bottomM = clamp(Math.min(muralMarkMode.first.y, hit.point.y), 0, wall.height || 3);
  const topM = clamp(Math.max(muralMarkMode.first.y, hit.point.y), 0, wall.height || 3);
  const isPaint = muralMarkMode.kind === 'paint';
  const candidate = isPaint
    ? normalizeCustomPaintAreas([{ id: `paint-${crypto.randomUUID()}`, face: muralMarkMode.face,
      startM, endM, bottomM, topM, color: muralMarkMode.color }], length, wall.height || 3)[0]
    : normalizeCustomMurals([{ id: `mural-${crypto.randomUUID()}`, face: muralMarkMode.face,
      startM, endM, bottomM, topM, imageData: muralMarkMode.image.imageData, name: muralMarkMode.image.name }], length, wall.height || 3)[0];
  if (!candidate) { muralMarkMode.first = null; count.textContent = 'Area must be at least 5 cm wide and high. Choose the first corner again.'; count.style.color = '#f87171'; return; }
  const field = isPaint ? 'customPaintAreas' : 'customMurals';
  const normalize = isPaint ? normalizeCustomPaintAreas : normalizeCustomMurals;
  const previous = wall[field];
  wall[field] = [...normalize(previous, length, wall.height || 3), candidate];
  if (!persistLayout(layoutRef.current)) {
    if (previous === undefined) delete wall[field]; else wall[field] = previous;
    count.textContent = 'Could not save the image. Browser storage may be full.'; count.style.color = '#f87171'; return;
  }
  rebuildCustomMuralLayer(layoutRef.current);
  muralMarkMode = null;
  count.textContent = `✓ ${isPaint ? 'Paint' : 'Custom image'} applied to a ${(endM - startM).toFixed(2)} × ${(topM - bottomM).toFixed(2)} m area.`;
  count.style.color = '#34d399';
}

function rebuildCustomMuralLayer(layout) {
  if (muralGroup) { disposeCustomMurals(muralGroup); muralGroup = null; }
  const walls = layout.walls || [];
  const center = walls.reduce((sum, wall) => ({ x: sum.x + wall.start.x + wall.end.x, y: sum.y + wall.start.y + wall.end.y }), { x: 0, y: 0 });
  center.x /= Math.max(1, walls.length * 2); center.y /= Math.max(1, walls.length * 2);
  muralGroup = buildCustomMurals({ walls, segments: renderedWallSegments, center });
  scene.add(muralGroup);
}

// Add or remove a wall from the picked set; update its highlight helper
function _toggleWallPick(mesh) {
  const idx = pickedWalls.indexOf(mesh);
  if (idx === -1) {
    // Add to selection
    pickedWalls.push(mesh);
    const h = new THREE.BoxHelper(mesh, 0x00e5ff);
    h.userData.isHelper = true;
    scene.add(h);
    wallHelpers.push(h);
  } else {
    // Remove from selection
    pickedWalls.splice(idx, 1);
    const h = wallHelpers.splice(idx, 1)[0];
    scene.remove(h);
  }
  _refreshWallPanel();
}

function _clearWallPicks() {
  muralMarkMode = null;
  pickedWalls.length = 0;
  wallHelpers.forEach((h) => scene.remove(h));
  wallHelpers.length = 0;
  _refreshWallPanel();
}

function _refreshWallPanel() {
  const panel = document.getElementById('wall-color-panel');
  if (!panel) return;
  const countEl = panel.querySelector('#wall-pick-count');
  if (countEl) countEl.textContent = pickedWalls.length
    ? `${pickedWalls.length} wall${pickedWalls.length > 1 ? 's' : ''} selected`
    : 'No walls selected — click walls to mark them';
}

function exitWallPaintMode() {
  muralMarkMode = null;
  wallPaintMode = false;
  _clearWallPicks();
  document.getElementById('wall-color-panel')?.remove();
  document.getElementById('wall-paint-btn')?.classList.remove('active');
  // Restore normal cursor
  renderer.domElement.style.cursor = '';
}

function enterWallPaintMode() {
  roomDesignInteraction?.cancel(false);
  if (viewerControls?.isWalkMode()) viewerControls.setOrbitMode();
  deselectObject();
  wallPaintMode = true;
  document.getElementById('wall-paint-btn')?.classList.add('active');
  renderer.domElement.style.cursor = 'crosshair';
  _buildWallPanel();
}

function _buildWallPanel() {
  document.getElementById('wall-color-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'wall-color-panel';
  panel.style.cssText = [
    'position:fixed;bottom:16px;left:50%;transform:translateX(-50%)',
    'background:rgba(14,14,22,0.94);border:1px solid rgba(99,102,241,0.4)',
    'border-radius:16px;padding:14px 18px;z-index:35',
    'font-family:Inter,system-ui,sans-serif;color:#e5e7eb',
    'backdrop-filter:blur(12px);box-shadow:0 4px 28px rgba(0,0,0,0.55)',
    'min-width:400px;max-width:540px;max-height:calc(100vh - 32px);overflow:auto',
  ].join(';');

  // ── Header ──────────────────────────────────────────────
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px';

  const title = document.createElement('span');
  title.style.cssText = 'font-size:13px;font-weight:700;color:#a5b4fc;display:flex;align-items:center;gap:6px';
  title.innerHTML = '🎨 <span>Wall Paint</span>';

  const count = document.createElement('span');
  count.id = 'wall-pick-count';
  count.style.cssText = 'font-size:11px;color:#6b7280;flex:1;text-align:center';
  count.textContent = 'No walls selected — click walls to mark them';

  const doneBtn = document.createElement('button');
  doneBtn.textContent = '✕ Done';
  doneBtn.style.cssText = [
    'padding:4px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15)',
    'background:rgba(255,255,255,0.08);color:#9ca3af;cursor:pointer;font-size:12px',
  ].join(';');
  doneBtn.onclick = exitWallPaintMode;
  hdr.append(title, count, doneBtn);

  // ── Instruction ─────────────────────────────────────────
  const tip = document.createElement('div');
  tip.style.cssText = 'font-size:10px;color:#4b5563;margin-bottom:10px;padding:6px 8px;background:rgba(99,102,241,0.08);border-radius:6px';
  tip.textContent = '👆 Click any wall to mark it  ·  Click again to unmark  ·  Then pick a face and colour below';

  // ── Face tabs: Inside / Outside ─────────────────────────
  const tabRow = document.createElement('div');
  tabRow.style.cssText = 'display:flex;gap:6px;margin-bottom:10px';

  const _tabStyle = (active) => [
    'padding:5px 16px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600',
    `border:1px solid ${active ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.12)'}`,
    `background:${active ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)'}`,
    `color:${active ? '#a5b4fc' : '#6b7280'}`,
  ].join(';');

  const insideTab  = document.createElement('button');
  insideTab.textContent  = '🏠 Inside face';
  const outsideTab = document.createElement('button');
  outsideTab.textContent = '🏗 Outside face';

  const _refreshTabs = () => {
    insideTab.style.cssText  = _tabStyle(_wallPaintFace === 'inside');
    outsideTab.style.cssText = _tabStyle(_wallPaintFace === 'outside');
  };
  _refreshTabs();

  insideTab.addEventListener('click',  (e) => { e.stopPropagation(); _wallPaintFace = 'inside';  _refreshTabs(); });
  outsideTab.addEventListener('click', (e) => { e.stopPropagation(); _wallPaintFace = 'outside'; _refreshTabs(); });
  tabRow.append(insideTab, outsideTab);

  // ── Colour swatches ─────────────────────────────────────
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin-bottom:10px';

  let customPicker; // declared here so swatch handler can reference it

  WALL_PALETTE.forEach(({ label, hex }) => {
    const sw = document.createElement('button');
    sw.title = label;
    sw.style.cssText = [
      `background:${hex};width:34px;height:34px;border-radius:7px`,
      'border:2px solid transparent;cursor:pointer;transition:all 0.12s',
      'box-shadow:0 1px 3px rgba(0,0,0,0.3)',
    ].join(';');
    sw.onmouseenter = () => { sw.style.transform = 'scale(1.18)'; sw.style.borderColor = '#fff'; };
    sw.onmouseleave = () => { sw.style.transform = 'scale(1)';    sw.style.borderColor = 'transparent'; };
    sw.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!pickedWalls.length) {
        count.textContent = '⚠ Mark at least one wall first!';
        count.style.color = '#f87171';
        setTimeout(() => { count.style.color = '#6b7280'; _refreshWallPanel(); }, 1800);
        return;
      }
      _applyFaceColor(_wallPaintFace, hex);
      if (customPicker) customPicker.value = hex;
      const face = _wallPaintFace === 'inside' ? 'inside' : 'outside';
      count.textContent = `✓ ${face} face painted on ${pickedWalls.length} wall${pickedWalls.length > 1 ? 's' : ''}`;
      count.style.color = '#34d399';
      setTimeout(() => { count.style.color = '#6b7280'; _refreshWallPanel(); }, 1800);
    });
    grid.appendChild(sw);
  });

  const wallpaperTitle = document.createElement('div');
  wallpaperTitle.style.cssText = 'font-size:11px;font-weight:700;color:#c4b5fd;margin:4px 0 7px';
  wallpaperTitle.textContent = '✦ Premium wallpapers';

  const wallpaperGrid = document.createElement('div');
  wallpaperGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px';
  WALLPAPER_FINISHES.forEach(finish => {
    const swatch = document.createElement('button');
    swatch.title = finish.label;
    swatch.style.cssText = [
      `background:linear-gradient(135deg,${finish.colors.join(',')});height:38px;border-radius:8px`,
      'border:1px solid rgba(255,255,255,0.18);cursor:pointer;color:#fff;font-size:9px;font-weight:700',
      'text-shadow:0 1px 3px #000;padding:3px;transition:transform .12s',
    ].join(';');
    swatch.textContent = `${finish.icon} ${finish.label}`;
    swatch.onmouseenter = () => { swatch.style.transform = 'scale(1.04)'; };
    swatch.onmouseleave = () => { swatch.style.transform = 'scale(1)'; };
    swatch.onclick = (event) => {
      event.stopPropagation();
      if (!pickedWalls.length) {
        count.textContent = '⚠ Mark at least one wall first!';
        count.style.color = '#f87171';
        setTimeout(() => { count.style.color = '#6b7280'; _refreshWallPanel(); }, 1800);
        return;
      }
      _applyFaceWallpaper(_wallPaintFace, finish.id);
      count.textContent = `✓ ${finish.label} applied to ${pickedWalls.length} wall${pickedWalls.length > 1 ? 's' : ''}`;
      count.style.color = '#34d399';
      setTimeout(() => { count.style.color = '#6b7280'; _refreshWallPanel(); }, 1800);
    };
    wallpaperGrid.appendChild(swatch);
  });

  const customTitle = document.createElement('div');
  customTitle.style.cssText = 'font-size:11px;font-weight:700;color:#67e8f9;margin:4px 0 7px';
  customTitle.textContent = '🖼 Custom image mural';
  const customRow = document.createElement('div');
  customRow.style.cssText = 'display:flex;align-items:center;gap:7px;margin-bottom:10px;flex-wrap:wrap';
  const upload = document.createElement('input'); upload.type = 'file'; upload.accept = 'image/png,image/jpeg,image/webp'; upload.hidden = true;
  const uploadBtn = document.createElement('button'); uploadBtn.textContent = pendingMuralImage ? `✓ ${pendingMuralImage.name}` : 'Upload image';
  uploadBtn.style.cssText = 'padding:6px 10px;border-radius:7px;border:1px solid #0891b2;background:#083344;color:#a5f3fc;cursor:pointer;font-size:11px';
  uploadBtn.onclick = event => { event.stopPropagation(); upload.click(); };
  upload.onchange = async event => {
    event.stopPropagation();
    try {
      pendingMuralImage = await _readCustomMural(upload.files?.[0]);
      count.textContent = `Image ready (${pendingMuralImage.width} × ${pendingMuralImage.height}). Select one wall and mark its area.`;
      count.style.color = '#34d399'; uploadBtn.textContent = `✓ ${pendingMuralImage.name}`;
      preview.src = pendingMuralImage.imageData; preview.style.display = 'block';
    } catch (error) { count.textContent = error.message; count.style.color = '#f87171'; }
    upload.value = '';
  };
  const preview = document.createElement('img');
  preview.alt = 'Custom mural preview'; preview.src = pendingMuralImage?.imageData || '';
  preview.style.cssText = `width:54px;height:34px;object-fit:cover;border-radius:5px;border:1px solid #ffffff33;${pendingMuralImage ? '' : 'display:none'}`;
  const markBtn = document.createElement('button'); markBtn.textContent = muralMarkMode ? 'Cancel marking' : 'Mark area in 3D';
  markBtn.style.cssText = 'padding:6px 10px;border-radius:7px;border:1px solid #22d3ee;background:#0e7490;color:#fff;cursor:pointer;font-size:11px;font-weight:700';
  markBtn.onclick = event => { event.stopPropagation(); if (muralMarkMode) _cancelMuralMarking(); else _beginMuralMarking(count); };
  const removeMural = document.createElement('button'); removeMural.textContent = 'Remove last';
  removeMural.style.cssText = 'padding:6px 9px;border-radius:7px;border:1px solid #ef444466;background:#7f1d1d55;color:#fca5a5;cursor:pointer;font-size:11px';
  removeMural.onclick = event => {
    event.stopPropagation(); const wall = _selectedWallRecord();
    if (!wall) { count.textContent = '⚠ Select exactly one wall first.'; count.style.color = '#f87171'; return; }
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    const murals = normalizeCustomMurals(wall.customMurals, length, wall.height || 3);
    let index = murals.length - 1;
    while (index >= 0 && murals[index].face !== _wallPaintFace) index--;
    if (index < 0) { count.textContent = `No custom image exists on this wall's ${_wallPaintFace} face.`; count.style.color = '#f87171'; return; }
    const previous = wall.customMurals;
    murals.splice(index, 1); wall.customMurals = murals;
    if (!murals.length) delete wall.customMurals;
    if (!persistLayout(layoutRef.current)) {
      wall.customMurals = previous; count.textContent = 'Could not save this change. Browser storage may be full.'; count.style.color = '#f87171'; return;
    }
    rebuildCustomMuralLayer(layoutRef.current);
    count.textContent = '✓ Custom image area removed.'; count.style.color = '#34d399';
  };
  customRow.append(upload, uploadBtn, preview, markBtn, removeMural);

  // ── Bottom row: custom picker + actions ─────────────────
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px';

  const customLabel = document.createElement('label');
  customLabel.style.cssText = 'font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:6px;cursor:pointer';
  customLabel.textContent = 'Custom:';
  customPicker = document.createElement('input');
  customPicker.type = 'color';
  customPicker.value = '#f5f4f0';
  customPicker.style.cssText = 'width:38px;height:30px;border:none;border-radius:6px;cursor:pointer;padding:2px;background:none';
  customPicker.addEventListener('input', e => e.stopPropagation());
  customLabel.appendChild(customPicker);

  const paintFaceBtn = document.createElement('button');
  paintFaceBtn.textContent = 'Paint full face';
  paintFaceBtn.style.cssText = 'padding:5px 10px;border-radius:8px;border:1px solid #60a5fa;background:#1e3a5f;color:#dbeafe;cursor:pointer;font-size:11px';
  paintFaceBtn.onclick = event => {
    event.stopPropagation();
    if (!pickedWalls.length) { count.textContent = '⚠ Mark at least one wall first!'; count.style.color = '#f87171'; return; }
    _applyFaceColor(_wallPaintFace, customPicker.value);
    count.textContent = `✓ ${_wallPaintFace} face painted on ${pickedWalls.length} wall${pickedWalls.length > 1 ? 's' : ''}`;
    count.style.color = '#34d399';
  };

  const markPaintBtn = document.createElement('button');
  markPaintBtn.textContent = 'Mark paint area';
  markPaintBtn.title = 'Choose two opposite corners to paint only part of one wall';
  markPaintBtn.style.cssText = 'padding:5px 10px;border-radius:8px;border:1px solid #34d399;background:#064e3b;color:#d1fae5;cursor:pointer;font-size:11px;font-weight:700';
  markPaintBtn.onclick = event => {
    event.stopPropagation();
    if (muralMarkMode) _cancelMuralMarking();
    else _beginPaintMarking(count, customPicker.value);
  };

  const removePaintBtn = document.createElement('button');
  removePaintBtn.textContent = 'Remove last area';
  removePaintBtn.style.cssText = 'padding:5px 9px;border-radius:8px;border:1px solid #ef444466;background:#7f1d1d55;color:#fca5a5;cursor:pointer;font-size:11px';
  removePaintBtn.onclick = event => {
    event.stopPropagation();
    const wall = _selectedWallRecord();
    if (!wall) { count.textContent = '⚠ Select exactly one wall first.'; count.style.color = '#f87171'; return; }
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    const areas = normalizeCustomPaintAreas(wall.customPaintAreas, length, wall.height || 3);
    let index = areas.length - 1;
    while (index >= 0 && areas[index].face !== _wallPaintFace) index--;
    if (index < 0) { count.textContent = `No painted area exists on this wall's ${_wallPaintFace} face.`; count.style.color = '#f87171'; return; }
    const previous = wall.customPaintAreas;
    areas.splice(index, 1); wall.customPaintAreas = areas;
    if (!areas.length) delete wall.customPaintAreas;
    if (!persistLayout(layoutRef.current)) {
      wall.customPaintAreas = previous; count.textContent = 'Could not save this change.'; count.style.color = '#f87171'; return;
    }
    rebuildCustomMuralLayer(layoutRef.current);
    count.textContent = '✓ Painted area removed.'; count.style.color = '#34d399';
  };

  const clearBtn = document.createElement('button');
  clearBtn.textContent = '✕ Clear marks';
  clearBtn.style.cssText = [
    'padding:5px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.3)',
    'background:rgba(239,68,68,0.1);color:#f87171;cursor:pointer;font-size:11px;margin-left:auto',
  ].join(';');
  clearBtn.onclick = (e) => { e.stopPropagation(); _clearWallPicks(); };

  const allBtn = document.createElement('button');
  allBtn.textContent = 'Select all';
  allBtn.style.cssText = [
    'padding:5px 12px;border-radius:8px;border:1px solid rgba(99,102,241,0.3)',
    'background:rgba(99,102,241,0.12);color:#a5b4fc;cursor:pointer;font-size:11px',
  ].join(';');
  allBtn.onclick = (e) => {
    e.stopPropagation();
    _clearWallPicks();
    selectableWalls.forEach((m) => _toggleWallPick(m));
  };

  row.append(customLabel, paintFaceBtn, markPaintBtn, removePaintBtn, allBtn, clearBtn);
  panel.append(hdr, tip, tabRow, grid, wallpaperTitle, wallpaperGrid, customTitle, customRow, row);
  document.body.appendChild(panel);
}

// ── Paint mode toggle button (fixed, bottom-left above Catalog) ──
(function _buildWallPaintBtn() {
  const btn = document.createElement('button');
  btn.id = 'wall-paint-btn';
  btn.textContent = '🎨 Paint Walls';
  btn.style.cssText = [
    'position:fixed;bottom:130px;left:16px;z-index:26',
    'padding:8px 14px;border-radius:10px;border:1px solid rgba(16,185,129,0.45)',
    'background:rgba(16,185,129,0.18);color:#6ee7b7;cursor:pointer',
    'font-size:13px;font-family:Inter,system-ui,sans-serif;font-weight:500',
    'backdrop-filter:blur(6px);transition:all 0.15s',
  ].join(';');
  btn.onmouseenter = () => { if (!wallPaintMode) btn.style.background = 'rgba(16,185,129,0.30)'; };
  btn.onmouseleave = () => { if (!wallPaintMode) btn.style.background = 'rgba(16,185,129,0.18)'; };
  btn.addEventListener('click', () => {
    if (wallPaintMode) exitWallPaintMode();
    else enterWallPaintMode();
    // Reflect active state
    btn.style.background = wallPaintMode ? 'rgba(16,185,129,0.55)' : 'rgba(16,185,129,0.18)';
    btn.style.color       = wallPaintMode ? '#fff' : '#6ee7b7';
  });
  document.body.appendChild(btn);
})();

// Legacy single-wall references kept as no-ops so old code paths don't crash
function deselectWall() {
  _clearWallPicks();
  document.getElementById('wall-color-panel')?.remove();
}

// ── Drag-to-move selected object along floor plane ──────────
const _floorPlane   = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _dragRaycaster = new THREE.Raycaster();
const _dragMouse2   = new THREE.Vector2();
let   _dragActive   = false;   // confirmed drag in progress
let   _dragPending  = false;   // mousedown on selected obj, not yet confirmed drag
let   _dragOffset   = new THREE.Vector3(); // object-center − floor-hit at drag-start
let   _dragStartXY  = null;    // screen coords at mousedown (to distinguish click from drag)

function _floorHit(clientX, clientY) {
  _dragMouse2.x = (clientX / window.innerWidth) * 2 - 1;
  _dragMouse2.y = -(clientY / window.innerHeight) * 2 + 1;
  _dragRaycaster.setFromCamera(_dragMouse2, camera);
  const pt = new THREE.Vector3();
  return _dragRaycaster.ray.intersectPlane(_floorPlane, pt) ? pt : null;
}

function _persistObjPosition(obj) {
  const id = obj?.userData?.layoutId;
  if (!id || !layoutRef.current?.objects) return;
  const entry = layoutRef.current.objects.find(o => o.id === id);
  if (entry && entry.bbox) {
    const hw = (entry.bbox.x2 - entry.bbox.x1) / 2;
    const hd = (entry.bbox.y2 - entry.bbox.y1) / 2;
    let nx = obj.position.x, nz = obj.position.z;
    if (obj.userData._isWinDoor) {
      // Door meshes pivot at a hinge, not at the centre of the opening.
      // Translate the saved opening by the move delta instead of replacing
      // its centre with the hinge (which shifts the cut by half a door).
      const dx = obj.position.x - (obj.userData._placementX ?? obj.position.x);
      const dz = obj.position.z - (obj.userData._placementZ ?? obj.position.z);
      nx = (entry.bbox.x1 + entry.bbox.x2) / 2 + dx;
      nz = (entry.bbox.y1 + entry.bbox.y2) / 2 + dz;
      obj.userData._snapX = nx;
      obj.userData._snapZ = nz;
      obj.userData._placementX = obj.position.x;
      obj.userData._placementZ = obj.position.z;
    }
    entry.bbox = { x1: nx - hw, y1: nz - hd, x2: nx + hw, y2: nz + hd };
    // Persist surface elevation so on-counter objects reload at the correct height
    if (obj.position.y > 0.01 && !obj.userData._isWinDoor) entry.elevation = obj.position.y;
    else delete entry.elevation;
    persistLayout(layoutRef.current);
    if (obj.userData._isWinDoor) rebuildWalls(layoutRef.current);
  }
}

// Nudge selected object by (dx, dz) metres
function _nudgeSelected(dx, dz) {
  if (!selectedObject) return;
  selectedObject.position.x += dx;
  selectedObject.position.z += dz;
  if (selectionHelper) selectionHelper.update();
  _persistObjPosition(selectedObject);
}

// Resize one edge of the selected object by delta metres (positive = expand)
function _resizeEdge(side, delta) {
  if (!selectedObject) return;
  const box = new THREE.Box3().setFromObject(selectedObject);
  const MIN = 0.1;
  if (side === 'px') {           // expand/shrink right edge
    const fixed = box.min.x;
    const origW = Math.max(MIN, box.max.x - fixed);
    const newW  = Math.max(MIN, origW + delta);
    selectedObject.scale.x *= newW / origW;
    selectedObject.position.x = fixed + newW / 2;
  } else if (side === 'nx') {   // expand/shrink left edge
    const fixed = box.max.x;
    const origW = Math.max(MIN, fixed - box.min.x);
    const newW  = Math.max(MIN, origW + delta);
    selectedObject.scale.x *= newW / origW;
    selectedObject.position.x = fixed - newW / 2;
  } else if (side === 'pz') {   // expand/shrink front edge
    const fixed = box.min.z;
    const origD = Math.max(MIN, box.max.z - fixed);
    const newD  = Math.max(MIN, origD + delta);
    selectedObject.scale.z *= newD / origD;
    selectedObject.position.z = fixed + newD / 2;
  } else if (side === 'nz') {   // expand/shrink back edge
    const fixed = box.max.z;
    const origD = Math.max(MIN, fixed - box.min.z);
    const newD  = Math.max(MIN, origD + delta);
    selectedObject.scale.z *= newD / origD;
    selectedObject.position.z = fixed - newD / 2;
  }
  if (selectionHelper) selectionHelper.update();
  _persistResize(selectedObject);
}

// ── Resize handle system ───────────────────────────────────────
const _resizeHandles = [];
let _resizeActive  = false;
let _resizeSide    = null;   // 'px' | 'nx' | 'pz' | 'nz'
let _resizeOrigBox = null;   // THREE.Box3 at drag-start
let _resizeOrigScale = null; // THREE.Vector3 scale at drag-start
let _resizeOrigPos = null;   // THREE.Vector3 position at drag-start
let _justResized   = false;  // guards the click event that fires after mouseup

const _RH_GEO = new THREE.SphereGeometry(0.09, 8, 6);
const _RH_MAT = new THREE.MeshBasicMaterial({ color: 0x4ade80 });

function _createResizeHandles(obj) {
  _removeResizeHandles();
  const box = new THREE.Box3().setFromObject(obj);
  const cy  = (box.min.y + box.max.y) / 2;
  const cx  = (box.min.x + box.max.x) / 2;
  const cz  = (box.min.z + box.max.z) / 2;
  [
    { side: 'px', x: box.max.x, y: cy, z: cz },
    { side: 'nx', x: box.min.x, y: cy, z: cz },
    { side: 'pz', x: cx,        y: cy, z: box.max.z },
    { side: 'nz', x: cx,        y: cy, z: box.min.z },
  ].forEach(({ side, x, y, z }) => {
    const h = new THREE.Mesh(_RH_GEO, _RH_MAT.clone());
    h.position.set(x, y, z);
    h.userData.isHelper = true;
    h.userData.isResizeHandle = true;
    h.userData.resizeSide = side;
    scene.add(h);
    _resizeHandles.push(h);
  });
}

function _removeResizeHandles() {
  while (_resizeHandles.length) {
    const h = _resizeHandles.pop();
    scene.remove(h);
    h.material?.dispose();
  }
}

function _updateResizeHandles() {
  if (!_resizeHandles.length || !selectedObject) return;
  const box = new THREE.Box3().setFromObject(selectedObject);
  const cy  = (box.min.y + box.max.y) / 2;
  const cx  = (box.min.x + box.max.x) / 2;
  const cz  = (box.min.z + box.max.z) / 2;
  _resizeHandles.forEach(h => {
    switch (h.userData.resizeSide) {
      case 'px': h.position.set(box.max.x, cy, cz); break;
      case 'nx': h.position.set(box.min.x, cy, cz); break;
      case 'pz': h.position.set(cx, cy, box.max.z); break;
      case 'nz': h.position.set(cx, cy, box.min.z); break;
    }
  });
}

function _persistResize(obj) {
  const id = obj?.userData?.layoutId;
  if (!id || !layoutRef.current?.objects) return;
  const entry = layoutRef.current.objects.find(o => o.id === id);
  if (!entry) return;
  const box = new THREE.Box3().setFromObject(obj);
  entry.bbox = { x1: box.min.x, y1: box.min.z, x2: box.max.x, y2: box.max.z };
  if (obj.position.y > 0.01) entry.elevation = obj.position.y;
  persistLayout(layoutRef.current);
}

renderer.domElement.addEventListener('mousedown', (ev) => {
  if (roomDesignInteraction?.isActive()) return;
  if (viewerControls?.isWalkMode()) return;
  if (ev.button !== 0) return;
  if (!selectedObject) return;
  if (catalogRef.isPlacing()) return;
  if (wallPaintMode) return;

  _dragMouse2.x = (ev.clientX / window.innerWidth) * 2 - 1;
  _dragMouse2.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  _dragRaycaster.setFromCamera(_dragMouse2, camera);

  // ── Resize handle check (takes priority over move drag) ──────
  if (_resizeHandles.length) {
    const rHits = _dragRaycaster.intersectObjects(_resizeHandles, false);
    if (rHits.length > 0) {
      _resizeActive    = true;
      _resizeSide      = rHits[0].object.userData.resizeSide;
      _resizeOrigBox   = new THREE.Box3().setFromObject(selectedObject);
      _resizeOrigScale = selectedObject.scale.clone();
      _resizeOrigPos   = selectedObject.position.clone();
      controls.enabled = false;
      ev.stopPropagation();
      return;
    }
  }

  // ── Regular move-drag check ───────────────────────────────────
  const hits = _dragRaycaster.intersectObject(selectedObject, true);
  if (!hits.length) return;

  _dragPending = true;
  _dragActive  = false;
  _dragStartXY = { x: ev.clientX, y: ev.clientY };

  const fp = _floorHit(ev.clientX, ev.clientY);
  if (fp) {
    _dragOffset.set(
      selectedObject.position.x - fp.x,
      0,
      selectedObject.position.z - fp.z,
    );
  } else {
    _dragOffset.set(0, 0, 0);
  }

  controls.enabled = false;
  ev.stopPropagation();
});

renderer.domElement.addEventListener('mousemove', (ev) => {
  // ── Resize drag ───────────────────────────────────────────────
  if (_resizeActive && selectedObject) {
    const fp = _floorHit(ev.clientX, ev.clientY);
    if (!fp) return;
    const box = _resizeOrigBox;
    const origScX = _resizeOrigScale.x, origScZ = _resizeOrigScale.z;

    if (_resizeSide === 'px') {
      const fixed = box.min.x;
      const edge  = Math.max(fp.x, fixed + 0.1);
      const newW  = edge - fixed;
      const origW = box.max.x - fixed;
      selectedObject.scale.x = origScX * (newW / origW);
      selectedObject.position.x = fixed + newW / 2;
    } else if (_resizeSide === 'nx') {
      const fixed = box.max.x;
      const edge  = Math.min(fp.x, fixed - 0.1);
      const newW  = fixed - edge;
      const origW = fixed - box.min.x;
      selectedObject.scale.x = origScX * (newW / origW);
      selectedObject.position.x = edge + newW / 2;
    } else if (_resizeSide === 'pz') {
      const fixed = box.min.z;
      const edge  = Math.max(fp.z, fixed + 0.1);
      const newD  = edge - fixed;
      const origD = box.max.z - fixed;
      selectedObject.scale.z = origScZ * (newD / origD);
      selectedObject.position.z = fixed + newD / 2;
    } else if (_resizeSide === 'nz') {
      const fixed = box.max.z;
      const edge  = Math.min(fp.z, fixed - 0.1);
      const newD  = fixed - edge;
      const origD = fixed - box.min.z;
      selectedObject.scale.z = origScZ * (newD / origD);
      selectedObject.position.z = edge + newD / 2;
    }

    if (selectionHelper) selectionHelper.update();
    _updateResizeHandles();
    return;
  }

  // ── Move drag ─────────────────────────────────────────────────
  if (!_dragPending) return;

  if (!_dragActive) {
    const moved = Math.hypot(ev.clientX - _dragStartXY.x, ev.clientY - _dragStartXY.y);
    if (moved < 4) return;
    _dragActive = true;
    renderer.domElement.style.cursor = 'grabbing';
  }

  const fp = _floorHit(ev.clientX, ev.clientY);
  if (!fp || !selectedObject) return;

  selectedObject.position.x = fp.x + _dragOffset.x;
  selectedObject.position.z = fp.z + _dragOffset.z;
  if (selectionHelper) selectionHelper.update();
  _updateResizeHandles();
});

renderer.domElement.addEventListener('mouseup', (ev) => {
  // ── End resize ────────────────────────────────────────────────
  if (_resizeActive) {
    _resizeActive = false;
    _resizeSide   = null;
    _justResized  = true;   // block the immediately-following click event
    controls.enabled = !viewerControls?.isWalkMode();
    renderer.domElement.style.cursor = '';
    if (selectedObject) _persistResize(selectedObject);
    return;
  }

  // ── End move drag ─────────────────────────────────────────────
  if (!_dragPending) return;
  controls.enabled = !viewerControls?.isWalkMode();
  renderer.domElement.style.cursor = '';

  if (_dragActive && selectedObject) {
    _persistObjPosition(selectedObject);
  }

  _dragPending = false;
  _dragActive  = false;
  _dragStartXY = null;
});

// cursor hint: show 'grab' / resize cursor when hovering
renderer.domElement.addEventListener('mousemove', (ev) => {
  if (_dragPending || _dragActive || _resizeActive) return;
  if (!selectedObject || catalogRef.isPlacing() || wallPaintMode) return;
  _dragMouse2.x = (ev.clientX / window.innerWidth) * 2 - 1;
  _dragMouse2.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  _dragRaycaster.setFromCamera(_dragMouse2, camera);
  // Check resize handles first
  if (_resizeHandles.length) {
    const rHits = _dragRaycaster.intersectObjects(_resizeHandles, false);
    if (rHits.length > 0) {
      const side = rHits[0].object.userData.resizeSide;
      renderer.domElement.style.cursor = (side === 'px' || side === 'nx') ? 'ew-resize' : 'ns-resize';
      return;
    }
  }
  const hit = _dragRaycaster.intersectObject(selectedObject, true).length > 0;
  renderer.domElement.style.cursor = hit ? 'grab' : '';
});

window.addEventListener('keydown', (e) => {
  if (viewerControls?.isWalkMode()) return;
  // Ignore when typing in an input
  if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key === 'Escape' && muralMarkMode) { e.preventDefault(); _cancelMuralMarking(); return; }
  if (e.key === 'Escape') { deselectObject(); deselectWall(); return; }
  if (!selectedObject) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
  if (e.key === '[') { e.preventDefault(); rotateSelected(-Math.PI / 4); }
  if (e.key === ']') { e.preventDefault(); rotateSelected(Math.PI / 4); }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotateSelected(Math.PI / 4); }
  if (e.key === 'o' || e.key === 'O') {
    e.preventDefault();
    if (!toggleFurnitureDoors(selectedObject)) toggleWinDoorAnim(selectedObject);
  }
  // Arrow key nudge — 0.1m normal, 0.02m with Shift
  const step = e.shiftKey ? 0.02 : 0.10;
  if (e.key === 'ArrowLeft')  { e.preventDefault(); _nudgeSelected(-step, 0); }
  if (e.key === 'ArrowRight') { e.preventDefault(); _nudgeSelected( step, 0); }
  if (e.key === 'ArrowUp')    { e.preventDefault(); _nudgeSelected(0, -step); }
  if (e.key === 'ArrowDown')  { e.preventDefault(); _nudgeSelected(0,  step); }
});

// Rebuild from original metre coordinates. Opening pieces keep the host wall's
// height, thickness and colour; no visual endpoint extensions change dimensions.
function rebuildWalls(layout) {
  deselectWall();
  const toRemove = scene.children.filter(c => c.userData.isWall || c.userData.isWallFill);
  const disposed = new Set();
  toRemove.forEach(mesh => {
    scene.remove(mesh);
    mesh.traverse(child => {
      [child.geometry, ...(Array.isArray(child.material) ? child.material : [child.material])]
        .filter(Boolean).forEach(resource => {
          if (!disposed.has(resource)) { resource.dispose(); disposed.add(resource); }
        });
    });
  });
  selectableWalls.length = 0;

  const walls = layout.walls || [];
  const center = walls.reduce((result, wall) => ({
    x: result.x + wall.start.x + wall.end.x,
    y: result.y + wall.start.y + wall.end.y,
  }), { x: 0, y: 0 });
  center.x /= Math.max(1, walls.length * 2);
  center.y /= Math.max(1, walls.length * 2);
  const openings = (layout.objects || []).filter(obj => {
    const cls = (obj.class || '').toLowerCase();
    return (cls.includes('door') || cls.includes('window') || cls.includes('glass')) && obj.bbox;
  }).map(obj => ({ ...obj, ...getWindowSillAndTop(obj.class, obj) }));

  renderedWallSegments = buildWallSegments(walls, openings);
  renderedWallSegments.forEach(wall => {
    const mesh = createWall(wall);
    mesh.userData.isWall = true;
    mesh.userData.isWallFill = Boolean(wall.isOpeningFill);
    mesh.userData.parentWallId = wall.parentWallId;
    const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
    const dot = -Math.sin(angle) * (center.x - (wall.start.x + wall.end.x) / 2)
      + Math.cos(angle) * (center.y - (wall.start.y + wall.end.y) / 2);
    mesh.userData.insideFaceIdx = dot > 0 ? 4 : 5;
    mesh.userData.outsideFaceIdx = dot > 0 ? 5 : 4;
    for (const face of ['inside', 'outside']) {
      const color = wall.faceColors?.[face];
      if (color) mesh.material[mesh.userData[face + 'FaceIdx']].color.set(color);
      const finish = wall.faceFinishes?.[face];
      if (finish?.type === 'wallpaper') _replaceWallFaceMaterial(mesh, face, finish.id);
    }
    scene.add(mesh);
    selectableWalls.push(mesh);
  });
  rebuildCustomMuralLayer(layout);
  roomDesignController?.rebuild();
  roomDesignPanel?.refresh();
}

function onMouseClick(event) {
  if (roomDesignInteraction?.isActive()) return;
  // Ignore clicks on UI overlay elements
  if (event.target !== renderer.domElement) return;
  // Catalog placement mode handles its own clicks
  if (catalogRef.isPlacing()) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  if (muralMarkMode) {
    _commitMuralCorner(_muralWallHit(), document.querySelector('#wall-pick-count'));
    return;
  }

  // Eat clicks that are the tail of a resize drag — never let them deselect
  if (_justResized) { _justResized = false; return; }
  if (_resizeHandles.length) {
    const rHits = raycaster.intersectObjects(_resizeHandles, false);
    if (rHits.length > 0) return;
  }

  // Find the nearest wall along this ray so we can skip furniture behind it.
  // Objects further than the wall face are occluded and must not be selected.
  let nearestWallDist = Infinity;
  if (selectableWalls.length) {
    const wHits = raycaster.intersectObjects(selectableWalls, true);
    if (wHits.length > 0) nearestWallDist = wHits[0].distance;
  }

  // 1. Check selectable objects (furniture, windows, AND doors).
  //    Only consider a hit if it is at least as close as the nearest wall
  //    (+ a tiny epsilon for objects sitting flush against the wall surface).
  if (selectableMeshes.length) {
    const hits = raycaster.intersectObjects(selectableMeshes, true);
    if (hits.length > 0 && hits[0].distance < nearestWallDist + 0.05) {
      let target = hits[0].object;
      while (target && target.parent && !target.userData.isSelectable) target = target.parent;
      if (target && target.userData.isSelectable) {
        let hasFurnitureDoors = false;
        target.traverse(child => { if (child.userData.isFurnitureDoor) hasFurnitureDoors = true; });
        const canAnimate = target.userData._isWinDoor || target.userData.isDoor || hasFurnitureDoors;
        if (viewerControls?.isWalkMode()) {
          // Walk clicks used to return after animation without ever selecting
          // the object. Replacement depends on selectedObject, so make the
          // same control panel available from the first-person view. Animated
          // doors/cabinets still open on that same first click.
          if (selectedObject !== target) { deselectWall(); selectObject(target); }
          if (canAnimate) { if (!toggleFurnitureDoors(target)) toggleWinDoorAnim(target); }
          return;
        }
        if (hasFurnitureDoors) {
          // Cabinet fronts should respond on the first click, not require a
          // select-then-click-again sequence. Keep the cabinet selected so its
          // move/replace/delete controls remain available.
          if (selectedObject !== target) { deselectWall(); selectObject(target); }
          toggleFurnitureDoors(target);
        } else if (canAnimate && selectedObject === target) {
          // Second click on already-selected door/window → toggle open/close
          if (!toggleFurnitureDoors(target)) toggleWinDoorAnim(target);
        } else {
          deselectWall();
          selectObject(target);
        }
        return;
      }
    }
  }

  // 3. Check walls — only respond when paint mode is active
  if (wallPaintMode && selectableWalls.length) {
    const hits = raycaster.intersectObjects(selectableWalls, true);
    if (hits.length > 0) {
      let target = hits[0].object;
      while (target && target.parent && !target.userData.isWall) target = target.parent;
      if (target && target.userData.isWall) { _toggleWallPick(target); return; }
    }
  }

  // 4. Click on empty space — deselect everything
  deselectObject();
  if (!wallPaintMode) deselectWall();
}

function toggleDoor(hinge) {
  const isOpen = hinge.userData.open;
  const targetAngle = isOpen ? hinge.userData.closedAngle : hinge.userData.openAngle;
  const startAngle = hinge.rotation.y;
  const duration = 500; // ms
  const startTime = performance.now();

  function animateDoor(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic

    hinge.rotation.y = startAngle + (targetAngle - startAngle) * eased;

    if (progress < 1) {
      requestAnimationFrame(animateDoor);
    } else {
      hinge.userData.open = !isOpen;
    }
  }

  requestAnimationFrame(animateDoor);
}

window.addEventListener('click', onMouseClick);

// Ref object so AI chat panel can read current layout
const layoutRef = { current: { walls: [], objects: [], rooms: [] } };

// Catalog panel ref — set after layout loads, used to check placement mode
const catalogRef = { isPlacing: () => false, exitPlacement: () => {} };

let updateMeasurementLabels = () => {};


async function initLayout() {
  try {
    // Check for tracer data in localStorage first
    let layout;
    const storedData = localStorage.getItem('preciseFloorplan');
    
    let layoutSource = 'file';
    if (storedData) {
      // Use traced data from localStorage
      const parsed = JSON.parse(storedData);
      layout = parseLayout(parsed);
      layoutSource = 'tracer';
      console.log('Loaded traced floorplan from localStorage', {
        rooms: layout.rooms.length,
        walls: layout.walls.length,
        objects: layout.objects.length
      });
    } else {
      // Fall back to file
      layout = await loadLayout('/precise_floorplan.json');
    }
    console.log('Layout loaded', {
      rooms: layout.rooms?.length,
      walls: layout.walls?.length,
      objects: layout.objects?.length
    });

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    if (layout.walls && layout.walls.length) {
      layout.walls.forEach((wall) => {
        minX = Math.min(minX, wall.start.x, wall.end.x);
        maxX = Math.max(maxX, wall.start.x, wall.end.x);
        minY = Math.min(minY, wall.start.y, wall.end.y);
        maxY = Math.max(maxY, wall.start.y, wall.end.y);
      });
    } else if (layout.rooms && layout.rooms.length) {
      layout.rooms.forEach((room) => {
        (room.points || []).forEach((pt) => {
          minX = Math.min(minX, pt.x);
          maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y);
          maxY = Math.max(maxY, pt.y);
        });
      });
    }
    const layoutCenter = {
      x: Number.isFinite(minX) ? (minX + maxX) / 2 : 0,
      y: Number.isFinite(minY) ? (minY + maxY) / 2 : 0,
    };
    
    // Initial wall render (uses rebuildWalls so catalog placements can re-use same logic)
    rebuildWalls(layout);
    
    // Room-type classes (spatial areas, not physical objects)
    const roomClasses = new Set([
      'bedroom', 'bathroom', 'kitchen', 'living room', 'dining room',
      'balcony', 'hallway', 'foyer', 'study room', 'utility', 'garage',
      'terrace', 'walkin', 'lobby', 'parking', 'storage', 'duct',
      'sit-out', 'pre-foyer', 'flexroom',
      'pillar', 'column',  // skip structural pillars — not rendered in 3D
    ]);

    // Add doors, windows, and furniture (skip room labels)
    layout.objects.forEach((obj) => {
      const cls = (obj.class || '').toLowerCase();
      if (roomClasses.has(cls)) return; // skip room-type detections
      const objMesh = createObject({ ...obj, layoutCenter, walls: layout.walls });
      if (objMesh) {
        scene.add(objMesh);
        // All objects (including doors) are selectable for move/replace/delete
        objMesh.userData.isSelectable = true;
        objMesh.userData.objectType = cls;
        objMesh.userData.layoutId = obj.id;
        selectableMeshes.push(objMesh);
        if (cls.includes('door')) {
          clickableDoors.push(objMesh); // kept for legacy refs
        }
      }
    });
    
    let ceilingMesh = null;
    
    // A traced room may cover only part of the house. Retain a visual underfloor
    // for the remaining space; never use this bounding rectangle for floor area.
    let floorPoints = layout.footprint?.points;
    if (!floorPoints?.length && layout.walls?.length) {
      floorPoints = [
        { x: minX, y: minY }, { x: maxX, y: minY },
        { x: maxX, y: maxY }, { x: minX, y: maxY },
      ];
    }
    if (floorPoints?.length >= 3) {
      const floorMesh = createFloor(floorPoints);
      floorMesh.position.y = -0.008;
      floorMesh.userData.isFloorUnderlay = !layout.footprint?.points;
      scene.add(floorMesh);
    }
    (layout.rooms || []).forEach(room => {
      const floor = createFloor(room.points, { roomType: room.type || room.name || '' });
      floor.userData.roomId = room.id;
      baseRoomFloors.set(room.id, floor);
      scene.add(floor);
    });
    // Use actual room heights and outlines. A global rectangle would fill
    // courtyards and could cut through a higher room's new vaulted ceiling.
    const measuredRooms = (layout.rooms || []).filter(isDesignableRoom);
    const ceilingOpenings = (layout.objects || []).filter(obj =>
      /door|window|glass/i.test(obj.class || '') && obj.bbox);
    const ceilingRooms = buildCeilingCoverage(layout, measuredRooms, ceilingOpenings);
    ceilingMesh = createCeiling(ceilingRooms);
    if (ceilingMesh) scene.add(ceilingMesh);

    const spanX = Number.isFinite(maxX - minX) ? maxX - minX : 8;
    const spanZ = Number.isFinite(maxY - minY) ? maxY - minY : 8;
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const radius = Math.max(Math.hypot(spanX, spanZ, 3) / 2, 2);
    const distance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.08;
    const target = new THREE.Vector3(layoutCenter.x, 1, layoutCenter.y);
    const viewPosition = new THREE.Vector3(1, 1.35, 1).normalize().multiplyScalar(distance).add(target);
    layoutRef.current = layout;
    viewerControls = setupViewerControls({ camera, controls, domElement: renderer.domElement, ceilingMesh,
      getObstacles: () => [...selectableWalls, ...selectableMeshes, ...(roomDesignController?.getGroups() || [])], getLayout: () => layoutRef.current,
      onCeilingVisibilityChange: visible => {
        // Cover base, profiled and finish ceilings, including nodes restored or
        // rebuilt after the controls were initialized.
        applyCeilingVisibility(scene, visible);
        roomDesignController?.setCeilingsVisible(visible);
      },
      onModeChange: mode => {
        if (mode !== 'walk') return;
        if (selectedObject && _resizeActive) _persistResize(selectedObject);
        else if (selectedObject && _dragActive) _persistObjPosition(selectedObject);
        _resizeActive = false; _resizeSide = null; _dragActive = false; _dragPending = false;
        catalogRef.exitPlacement(); deselectObject(); exitWallPaintMode();
      },
      initialCameraPosition: viewPosition, initialTarget: target });

    // Debug label to show counts (objects retained only for gap carving)
    const info = document.createElement('div');
    info.style.position = 'fixed';
    info.style.top = '12px';
    info.style.right = '12px';
    info.style.padding = '6px 10px';
    info.style.background = 'rgba(255,255,255,0.85)';
    info.style.color = '#333';
    info.style.fontSize = '12px';
    info.style.border = '1px solid rgba(255,255,255,0.1)';
    info.style.borderRadius = '8px';
    info.style.backdropFilter = 'blur(6px)';
    info.textContent = `source: ${layoutSource}, rooms: ${layout.rooms?.length || 0}, walls: ${layout.walls?.length || 0}, objects: ${layout.objects?.length || 0}`;
    document.body.appendChild(info);

    // Store layout for AI access and initialize panels
    layoutRef.current = layout;
    const measurements = setupMeasurementPanel({ getLayout: () => layoutRef.current, camera,
      getObjectMeshes: () => selectableMeshes });
    updateMeasurementLabels = measurements.update;
    createAIChatPanel(scene, layoutRef, selectableMeshes);
    const catalog = createCatalogPanel({ scene, camera, renderer, layoutRef, selectableMeshes, onWallOpening: rebuildWalls,
      onPlacementStart: () => { roomDesignInteraction?.cancel(false); if (viewerControls?.isWalkMode()) viewerControls.setOrbitMode(); } });
    catalogRef.isPlacing = catalog.isPlacing;
    catalogRef.exitPlacement = catalog.exitPlacement;
    roomDesignController = createRoomDesignController({ scene, getLayout: () => layoutRef.current,
      getWallSegments: () => renderedWallSegments, getBaseFloor: id => baseRoomFloors.get(id) });
    roomDesignController.rebuild();
    roomDesignInteraction = createRoomDesignInteraction({ scene, camera, controls, domElement: renderer.domElement,
      controller: roomDesignController, getLayout: () => layoutRef.current,
      getCeilingsVisible: viewerControls.getCeilingsVisible, setCeilingsVisible: viewerControls.setCeilingsVisible,
      onDone: (roomId, result) => roomDesignPanel.show(roomId, result.message) });
    const beginDesign = callback => {
      catalogRef.exitPlacement(); deselectObject(); exitWallPaintMode();
      return callback();
    };
    roomDesignPanel = setupRoomDesignPanel({ getLayout: () => layoutRef.current,
      getWallChoices: roomDesignController.getWallChoices, onApply: roomDesignController.apply, onReset: roomDesignController.reset,
      onPlaceLight: (...args) => beginDesign(() => roomDesignInteraction.beginLight(...args)),
      onMarkWallArea: (...args) => beginDesign(() => roomDesignInteraction.beginWall(...args)),
      onCancelInteraction: () => roomDesignInteraction.cancel(false),
      onOpen: () => { roomDesignInteraction.cancel(false); catalogRef.exitPlacement(); deselectObject(); exitWallPaintMode(); } });
  } catch (err) {
    console.error('Failed to load layout:', err);
  }
}

function onWindowResize() {
  const { innerWidth, innerHeight } = window;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  onRenderResize(innerWidth, innerHeight);
}

window.addEventListener('resize', onWindowResize);

const frameClock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = frameClock.getDelta();
  if (!viewerControls?.isWalkMode()) controls.update();
  viewerControls?.update(delta);
  tickFurnitureDoors();
  tickWinAnims();
  updateMeasurementLabels();
  wallHelpers.forEach((h) => h.update());
  const composer = getComposer();
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

initLayout();
animate();
