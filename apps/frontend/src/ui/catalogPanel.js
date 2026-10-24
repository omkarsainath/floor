import { SOFA_FACTORY_CATALOG, createSofaFactoryFurniture } from '../generators/sofaFactory.js';
import { openSofaPhotoPanel } from './sofaPhotoPanel.js';
import { createProductThumbnail } from './productThumbnail.js';
import * as THREE from 'three';
import { persistLayout } from '../state/projectPersistence.js';
import { createObject } from '../generators/object.js';
import { PULLOUT_SLAB_ITEM, EDITABLE_CABINET_ITEM } from '../kitchen/presets.js';
import { isKitchen, kitchenState } from '../kitchen/system.js';
import { WARDROBE_CATALOG, LOFT_CATALOG } from '../generators/wardrobe.js';
import { isCabinetItem, cabinetPlacementBoxes, snapCabinetPlacement } from '../generators/cabinetPlacement.js';
import { POOJA_CATALOG } from '../generators/pooja.js';
import { TV_UNIT_CATALOG } from '../generators/tvUnits.js';
import { DESIGNER_DOOR_CATALOG } from '../generators/designerDoors.js';
import { DINING_CATALOG, CENTER_D_CATALOG, CENTER_A_CATALOG, DESK_CATALOG, OFFICE_CHAIR_CATALOG } from '../generators/referenceFurnitureCatalog.js';

import { CATEGORIES } from './furnitureCatalog.js';
export { CATEGORIES } from './furnitureCatalog.js';

export function snapWallAttachedPlacement(pt, item, walls = [], maxDistance = 2.5) {
  let best = null;
  for (const wall of walls) {
    if (!wall?.start || !wall?.end) continue;
    const dx = wall.end.x - wall.start.x, dz = wall.end.y - wall.start.y;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
    const tx = dx / length, tz = dz / length;
    const along = Math.max(0, Math.min(length, (pt.x - wall.start.x) * tx + (pt.z - wall.start.y) * tz));
    const px = wall.start.x + tx * along, pz = wall.start.y + tz * along;
    const vx = pt.x - px, vz = pt.z - pz, distance = Math.hypot(vx, vz);
    if (best && distance >= best.distance) continue;
    let nx = -tz, nz = tx;
    if (nx * vx + nz * vz < 0) { nx = -nx; nz = -nz; }
    const clearance = item.d / 2 + Math.max(0.02, Number(wall.thickness) || 0.15) / 2;
    let rotation = -Math.atan2(tz, tx);
    if (nx * Math.sin(rotation) + nz * Math.cos(rotation) < 0) rotation += Math.PI;
    best = { x: px + nx * clearance, z: pz + nz * clearance, rotation, distance, wallId: wall.id };
  }
  return best && best.distance <= maxDistance ? best : null;
}

export function createCatalogPanel({ scene, camera, renderer, layoutRef, selectableMeshes, onWallOpening, onPlacementStart = () => {} }) {
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _ray = new THREE.Raycaster();
  const _mouse = new THREE.Vector2();

  let activeItem = null;
  let ghostMesh = null;
  let ghostAngle = 0;          // current placement rotation in radians
  let panelOpen = false;
  let activeCatId = CATEGORIES[0].id;

  // ── Panel DOM ──────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'catalog-panel';
  panel.style.cssText = [
    'position:fixed;top:0;left:0;height:100vh;width:262px',
    'background:rgba(13,13,20,0.93);border-right:1px solid rgba(255,255,255,0.08)',
    'display:flex;flex-direction:column;z-index:25;backdrop-filter:blur(12px)',
    'font-family:Inter,system-ui,sans-serif;color:#e5e7eb',
    'transform:translateX(-262px);transition:transform 0.22s ease',
    'box-shadow:4px 0 24px rgba(0,0,0,0.4)',
  ].join(';');

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'padding:16px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.07)';
  hdr.innerHTML = `
    <div style="font-size:15px;font-weight:600;color:#f8fafc;display:flex;align-items:center;gap:8px">
      <span>🏠</span> Furniture Catalog
    </div>
    <div style="font-size:11px;color:#6b7280;margin-top:3px">Click item → click floor to place</div>
  `;

  // Category tab bar
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.07)';

  // Item grid
  const grid = document.createElement('div');
  grid.style.cssText = [
    'flex:1;overflow-y:auto;padding:10px',
    'display:grid;grid-template-columns:1fr 1fr;gap:8px',
    'scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent',
  ].join(';');

  // Placement status bar at bottom of panel
  const statusBar = document.createElement('div');
  statusBar.setAttribute('role','status');
  statusBar.style.cssText = [
    'padding:10px 14px;border-top:1px solid rgba(255,255,255,0.07)',
    'font-size:11px;color:#6b7280;min-height:38px;display:flex;align-items:center',
  ].join(';');
  statusBar.textContent = 'Select an item above to place it';

  const search = document.createElement('input');
  search.type = 'search'; search.placeholder = 'Search all: A-53, teal, MD-182…';
  search.setAttribute('aria-label', 'Search furniture catalog');
  search.style.cssText = 'margin:8px 10px;padding:8px;background:#202231;color:#fff;border:1px solid #555;border-radius:6px';
  search.addEventListener('input', renderGrid);
  grid.style.alignContent = 'start';
  const loftControls=document.createElement('fieldset');loftControls.hidden=true;
  loftControls.style.cssText='margin:6px 10px;padding:8px;color:#e2e8f0;border:1px solid #6366f1;font-size:12px';
  loftControls.innerHTML='<legend>Place loft in a gap</legend><label>Width (cm) <input id="loft-place-width" type="number" min="45" max="600" step="1" style="width:65px"></label><br><label>Base above floor (cm) <input id="loft-place-base" type="number" min="0" max="600" step="1" style="width:65px"></label><br><label><input id="loft-wall-snap" type="checkbox"> Snap to wall</label><p>Click the gap at loft height. R rotates. Set the width to fit between your wardrobes.</p>';
  const loftWidth=loftControls.querySelector('#loft-place-width'),loftBase=loftControls.querySelector('#loft-place-base'),loftSnap=loftControls.querySelector('#loft-wall-snap');
  for(const input of [loftWidth,loftBase,loftSnap])input.addEventListener('change',()=>{
    if(!activeItem||!LOFT_CATALOG.some(item=>item.id===activeItem.id))return;
    if(!loftWidth.value||!loftBase.value||!loftWidth.checkValidity()||!loftBase.checkValidity()){loftWidth.reportValidity();loftBase.reportValidity();return;}
    activeItem={...activeItem,w:Number(loftWidth.value)/100,elevation:Number(loftBase.value)/100,wallAttached:loftSnap.checked};
    removeGhost();
  });
  const uploadSofa=document.createElement('button');uploadSofa.id='upload-sofa-photo';uploadSofa.type='button';
  uploadSofa.textContent='Upload sofa photo → 3D';uploadSofa.style.cssText='margin:8px 10px;padding:10px;border:1px solid #818cf8;border-radius:7px;background:#3730a3;color:white;cursor:pointer';
  uploadSofa.onclick=()=>{exitPlacement();openSofaPhotoPanel({onPlace:enterPlacement});};
  const exportSofa=document.createElement('button');exportSofa.id='export-catalogue-sofa';exportSofa.hidden=true;exportSofa.textContent='Download selected sofa GLB';
  exportSofa.style.cssText='margin:0 10px 8px;padding:7px;border-radius:6px;cursor:pointer';
  exportSofa.onclick=async()=>{
    const item=activeItem;if(!item?.referenceAudit)return;exportSofa.disabled=true;
    const model=createSofaFactoryFurniture(item.id,item.w,item.d);
    try{const {exportFurnitureGLB,downloadFurnitureGLB}=await import('./furnitureExport.js');downloadFurnitureGLB(await exportFurnitureGLB(model),item.id+'.glb');statusBar.textContent='Sofa GLB downloaded with embedded textures.';}
    catch(error){statusBar.textContent='Could not export sofa: '+error.message;}
    finally{exportSofa.disabled=false;model?.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});}
  };
  panel.append(hdr, tabBar, search, loftControls, grid, uploadSofa, exportSofa, statusBar);
  document.body.appendChild(panel);

  // ── Toggle button ──────────────────────────────────────────
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'catalog-toggle-btn';
  toggleBtn.innerHTML = '🛋️ Catalog';
  toggleBtn.style.cssText = [
    'position:fixed;bottom:80px;left:16px;z-index:26',
    'padding:8px 14px;border-radius:10px;border:1px solid rgba(99,102,241,0.5)',
    'background:rgba(99,102,241,0.85);color:#fff;cursor:pointer',
    'font-size:13px;font-family:Inter,system-ui,sans-serif;font-weight:500',
    'backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(99,102,241,0.35)',
    'transition:all 0.15s',
  ].join(';');
  toggleBtn.onmouseenter = () => { toggleBtn.style.background = 'rgba(99,102,241,1)'; };
  toggleBtn.onmouseleave = () => { toggleBtn.style.background = 'rgba(99,102,241,0.85)'; };
  toggleBtn.addEventListener('click', () => togglePanel());
  document.body.appendChild(toggleBtn);

  // ── Render helpers ─────────────────────────────────────────
  function renderTabs() {
    tabBar.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const tab = document.createElement('button');
      const active = cat.id === activeCatId;
      tab.style.cssText = [
        'padding:4px 8px;border-radius:6px;cursor:pointer;font-size:11px;white-space:nowrap;border:1px solid',
        active
          ? 'border-color:rgba(99,102,241,0.7);background:rgba(99,102,241,0.22);color:#a5b4fc'
          : 'border-color:rgba(255,255,255,0.08);background:transparent;color:#9ca3af',
      ].join(';');
      tab.textContent = `${cat.icon} ${cat.label}`;
      tab.addEventListener('click', () => {
        activeCatId = cat.id;
        renderTabs();
        renderGrid();
      });
      tabBar.appendChild(tab);
    });
  }

  function renderGrid() {
    exportSofa.hidden=!activeItem?.referenceAudit;
    grid.innerHTML = '';
    const cat = CATEGORIES.find(c => c.id === activeCatId);
    if (!cat) return;
    const query = search.value.trim().toLowerCase();
    const items = query ? CATEGORIES.flatMap(c => c.items).filter(item => `${item.id} ${item.label}`.toLowerCase().includes(query)) : cat.items;
    const seen = new Set();
    items.filter(item => !seen.has(item.id) && seen.add(item.id)).forEach(item => {
      const isActive = activeItem?.id === item.id;
      const card = document.createElement('button');
      card.dataset.itemId = item.id;
      card.title = item.note || item.label;
      card.style.cssText = [
        'display:flex;flex-direction:column;align-items:center;gap:6px',
        'padding:12px 6px;border-radius:10px;cursor:pointer',
        'border:1.5px solid;transition:all 0.15s;',
        isActive
          ? 'border-color:rgba(99,102,241,0.9);background:rgba(99,102,241,0.2);box-shadow:0 0 0 2px rgba(99,102,241,0.35)'
          : 'border-color:rgba(255,255,255,0.08);background:rgba(255,255,255,0.03)',
      ].join(';');

      const iconEl = createProductThumbnail(item);
      card.setAttribute('aria-label', item.label);
      card.title = `${item.label}. ${item.note || '3D model preview'}`;

      const sizeEl = document.createElement('span');
      sizeEl.style.cssText = 'font-size:9px;color:#4b5563';
      sizeEl.textContent = `${Number(item.w.toFixed(2))}×${Number(item.d.toFixed(2))} m${item.kind ? ' · approx.' : ''}`;

      card.append(iconEl, sizeEl);
      if(item.id==='kitchen-pullout-slab'){
        const dims=document.createElement('div');dims.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:4px;width:100%;margin-top:5px';
        const configured=activeItem?.id===item.id?activeItem:null;
        for(const [key,label,value] of [['w','W',(configured?.w??item.w)*1000],['h','H',(configured?.objectHeightM??.9)*1000],['d','D',(configured?.d??item.d)*1000],['sections','Sections',configured?.sectionCount??3]]){
          const input=document.createElement('input');input.type='number';input.value=String(Math.round(value));input.min=key==='sections'?'1':'150';input.max=key==='sections'?'12':'5000';input.step='1';input.title=`Slab ${label}`;input.dataset.slabDimension=key;input.style.cssText='width:100%;box-sizing:border-box;font-size:10px;padding:3px;background:#263145;color:#edf3fc;border:1px solid #485771;border-radius:4px';
          input.oninput=e=>{e.stopPropagation();const n=Number(input.value);if(!Number.isFinite(n)||n<=0)return;activeItem=activeItem?.id===item.id?activeItem:{...item};if(key==='w')activeItem.w=n/1000;if(key==='d')activeItem.d=n/1000;if(key==='h')activeItem.objectHeightM=n/1000;if(key==='sections')activeItem.sectionCount=Math.max(1,Math.min(12,Math.round(n)));if(activeItem.id===item.id){removeGhost();}};
          input.onclick=e=>e.stopPropagation();dims.append(input);
        }
        card.append(dims);
      }
      if(item.showLabel){const caption=document.createElement('span');caption.textContent=item.label;caption.style.cssText='font-size:11px;color:#e7edf6;text-align:center';card.append(caption);}

      card.onmouseenter = () => {
        if (!isActive) card.style.background = 'rgba(255,255,255,0.08)';
      };
      card.onmouseleave = () => {
        if (!isActive) card.style.background = 'rgba(255,255,255,0.03)';
      };
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePlacement(item);
      });
      grid.appendChild(card);
    });
  }

  // ── Panel open/close ───────────────────────────────────────
  function togglePanel() {
    panelOpen = !panelOpen;
    for (const id of ['room-finishes-toggle','wall-paint-btn']) {
      const control=document.getElementById(id);if(control)control.style.visibility=panelOpen?'hidden':'';
    }
    panel.style.transform = panelOpen ? 'translateX(0)' : 'translateX(-262px)';
    toggleBtn.style.left = panelOpen ? '278px' : '16px';
    toggleBtn.innerHTML = panelOpen ? '✕ Close' : '🛋️ Catalog';
  }

  // ── Placement mode ─────────────────────────────────────────
  function togglePlacement(item) {
    if (activeItem?.id === item.id) {
      exitPlacement();
    } else {
      enterPlacement(item);
    }
  }

  function enterPlacement(item) {
    onPlacementStart();
    removeGhost();
    const isLoft=LOFT_CATALOG.some(spec=>spec.id===item.id);
    activeItem = isCabinetItem(item.id) ? {...item,wallAttached:true} : item;
    loftControls.hidden=!isLoft;
    if(isLoft){loftWidth.value=String(Math.round(item.w*100));loftBase.value=String(Math.round(item.elevation*100));loftSnap.checked=true;}
    ghostAngle = 0;
    renderer.domElement.style.cursor = 'crosshair';
    statusBar.innerHTML = `<span style="color:#a5b4fc">✦ ${item.label} selected</span>&nbsp;· Click to place · <span style="color:#6b7280">Esc cancel</span>`;
    renderGrid();

    // Show floating hint outside panel
    removeHint();
    const hint = document.createElement('div');
    hint.id = 'cat-place-hint';
    hint.style.cssText = [
      'position:fixed;bottom:22px;left:50%;transform:translateX(-50%)',
      'background:rgba(99,102,241,0.92);color:#fff;padding:10px 22px',
      'border-radius:20px;font-size:13px;z-index:30;pointer-events:none',
      'font-family:Inter,system-ui,sans-serif;text-align:center;line-height:1.6',
      'box-shadow:0 4px 18px rgba(99,102,241,0.45)',
    ].join(';');
    const _id2 = (item.id || '').toLowerCase();
    const isWD2 = _id2.includes('window') || _id2.includes('door') || _id2.includes('glass') || _id2.includes('chimney');
    const placeTarget = isLoft ? 'near a wall at loft height' : isCabinetItem(item.id) || isWD2 || item.wallAttached ? 'near a wall' : 'floor or surface';
    const alignmentHint=isCabinetItem(item.id)?'Auto-align to walls and cabinets':'<kbd style="background:rgba(255,255,255,0.2);border-radius:4px;padding:1px 6px">R</kbd> rotate';
    hint.innerHTML = `${item.icon}&nbsp; Click ${placeTarget} to place <b>${item.label}</b> &nbsp;·&nbsp; ${alignmentHint} &nbsp;·&nbsp; <kbd style="background:rgba(255,255,255,0.2);border-radius:4px;padding:1px 6px">Esc</kbd> cancel`;
    document.body.appendChild(hint);
  }

  function exitPlacement() {
    activeItem = null;
    loftControls.hidden=true;
    renderer.domElement.style.cursor = '';
    statusBar.textContent = 'Select an item above to place it';
    removeGhost();
    removeHint();
    renderGrid();
  }

  function removeHint() {
    document.getElementById('cat-place-hint')?.remove();
  }

  function removeGhost() {
    if (ghostMesh) {
      scene.remove(ghostMesh);
      const materials = new Set();
      ghostMesh.traverse(n => {
        n.geometry?.dispose();
        for (const m of Array.isArray(n.material) ? n.material : [n.material]) if (m) materials.add(m);
      });
      materials.forEach(m => m.dispose());
      ghostMesh = null;
    }
  }

  // ── Floor raycasting ───────────────────────────────────────
  function floorPoint(clientX, clientY, elevation = 0) {
    _mouse.x = (clientX / window.innerWidth) * 2 - 1;
    _mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    _ray.setFromCamera(_mouse, camera);
    const pt = new THREE.Vector3();
    const plane = elevation ? new THREE.Plane(new THREE.Vector3(0,1,0),-elevation) : floorPlane;
    return _ray.ray.intersectPlane(plane, pt) ? pt : null;
  }

  // Surface-aware placement: snaps to flat horizontal tops of furniture/counters,
  // falls back to Y=0 floor. Returns {x, y, z, onSurface}.
  const _worldNormal = new THREE.Vector3();
  function _placementPoint(clientX, clientY) {
    _mouse.x = (clientX / window.innerWidth) * 2 - 1;
    _mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    _ray.setFromCamera(_mouse, camera);

    const candidates = [];
    scene.traverse(obj => {
      if (!obj.isMesh) return;
      // Exclude the ghost mesh and ALL its descendants (only top-level has isHelper)
      let o = obj;
      while (o) { if (o.userData.isHelper) return; o = o.parent; }
      if (obj.userData.isWall || obj.userData.isWallFill) return;
      if (obj.userData.type === 'floor' || obj.userData.type === 'ceiling') return;
      candidates.push(obj);
    });

    const hits = _ray.intersectObjects(candidates, false);
    for (const hit of hits) {
      if (!hit.face) continue;
      _worldNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (_worldNormal.y > 0.8 && hit.point.y > 0.08) {
        return { x: hit.point.x, y: hit.point.y, z: hit.point.z, onSurface: true };
      }
    }

    const pt = new THREE.Vector3();
    if (_ray.ray.intersectPlane(floorPlane, pt)) {
      return { x: pt.x, y: 0, z: pt.z, onSurface: false };
    }
    return null;
  }

  // ── Wall-snap helper for window/door ghost preview ───────────
  // Returns {x, z, rotation} snapped to the nearest wall, or null if none nearby.
  function _snapGhostToWall(pt) {
    const walls = layoutRef.current?.walls || [];
    if (!walls.length) return null;
    const cx = pt.x, cz = pt.z;
    let bestWall = null, bestDist = Infinity, bestProjX = cx, bestProjZ = cz;
    walls.forEach(w => {
      if (!w.start || !w.end) return;
      const ax = w.start.x, ay = w.start.y, bx = w.end.x, by = w.end.y;
      const abx = bx - ax, aby = by - ay;
      const len2 = abx * abx + aby * aby;
      if (len2 < 0.001) return;
      let t = ((cx - ax) * abx + (cz - ay) * aby) / len2;
      t = Math.max(0, Math.min(1, t));
      const projX = ax + t * abx, projY = ay + t * aby;
      const d = Math.hypot(cx - projX, cz - projY);
      if (d < bestDist) { bestDist = d; bestWall = w; bestProjX = projX; bestProjZ = projY; }
    });
    if (!bestWall || bestDist > 2.5) return null;
    const wdx = bestWall.end.x - bestWall.start.x;
    const wdy = bestWall.end.y - bestWall.start.y;
    const wallHoriz = Math.abs(wdx) >= Math.abs(wdy);
    return {
      x: wallHoriz ? cx : bestProjX,       // along wall: use cursor; perp: snap
      z: wallHoriz ? bestProjZ : cz,       // perp: snap to wall centerline; along: cursor
      rotation: wallHoriz ? 0 : -Math.PI / 2,
    };
  }

  function _snapFurnitureToWall(pt, item) {
    return snapWallAttachedPlacement(pt, item, layoutRef.current?.walls || []);
  }

  function cabinetPosition(event) {
    const pt=floorPoint(event.clientX,event.clientY,activeItem.elevation??0);
    return pt&&snapCabinetPlacement(pt,activeItem,{walls:layoutRef.current?.walls||[],
      neighbours:cabinetPlacementBoxes(selectableMeshes),rotation:ghostAngle});
  }

  // ── Mouse move → ghost preview ─────────────────────────────
  renderer.domElement.addEventListener('mousemove', (e) => {
    if (!activeItem) return;

    const cls = (activeItem.id || '').toLowerCase();
    const isWinDoor = cls.includes('window') || cls.includes('door') || cls.includes('glass') || cls.includes('chimney');

    const isLoft=LOFT_CATALOG.some(item=>item.id===activeItem.id);
    const cabinet=isCabinetItem(activeItem.id);
    const pt = cabinet ? cabinetPosition(e) : isLoft ? floorPoint(e.clientX,e.clientY,activeItem.elevation) : isWinDoor ? floorPoint(e.clientX, e.clientY) : _placementPoint(e.clientX, e.clientY);
    if (!pt) { removeGhost(); return; }

    if (!ghostMesh) {
      const hw = activeItem.w / 2, hd = activeItem.d / 2;
      ghostMesh = createObject({
        id: 'ghost', class: activeItem.id, source: 'catalog',
        ...(activeItem.photoSofaSpec&&{photoSofaSpec:activeItem.photoSofaSpec}),
        bbox: { x1: -hw, y1: -hd, x2: hw, y2: hd },
      });
      if (!ghostMesh) return;
      ghostMesh.userData.isHelper = true;
      ghostMesh.traverse(n => {
        if (!n.isMesh) return;
        n.castShadow = false;
        for (const m of Array.isArray(n.material) ? n.material : [n.material]) {
          if (!m) continue;
          m.transparent = true;
          m.opacity = 0.4;
          m.depthWrite = false;
        }
      });
      scene.add(ghostMesh);
    }

    if(cabinet){
      ghostMesh.position.set(pt.x,pt.y,pt.z);ghostMesh.rotation.y=pt.rotation;
      ghostMesh.userData.cabinetPlacement=pt;
      renderer.domElement.style.cursor=pt.valid?'crosshair':'not-allowed';
      statusBar.textContent=pt.valid?(pt.neighbourId?'Aligned beside cabinet · Click to place':pt.wallId?'Back aligned to wall · Click to place':'Click to place'):pt.reason;
      ghostMesh.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])if(m)m.opacity=pt.valid?.4:.15;});
    } else if (activeItem.wallAttached) {
      const snap = _snapFurnitureToWall(pt, activeItem);
      ghostMesh.position.set(snap?.x ?? pt.x, activeItem.elevation ?? 0, snap?.z ?? pt.z);
      ghostMesh.rotation.y = snap?.rotation ?? ghostAngle;
    } else if (isWinDoor) {
      const snap = _snapGhostToWall(pt);
      if (snap) {
        ghostMesh.position.x = snap.x;
        ghostMesh.position.z = snap.z;
        ghostMesh.rotation.y = snap.rotation;
      } else {
        ghostMesh.position.x = pt.x;
        ghostMesh.position.z = pt.z;
        ghostMesh.rotation.y = ghostAngle;
      }
    } else {
      ghostMesh.position.x = pt.x;
      ghostMesh.position.y = pt.y;   // snap to surface top or floor
      ghostMesh.position.z = pt.z;
      ghostMesh.rotation.y = ghostAngle;
    }
  });

  // ── Click → place object ───────────────────────────────────
  renderer.domElement.addEventListener('click', (e) => {
    if (!activeItem) return;
    e.stopImmediatePropagation(); // prevent selection/door handlers firing

    let pos, snapRotY;
    if(isCabinetItem(activeItem.id)){
      pos=cabinetPosition(e);
      if(!pos)return;
      if(!pos.valid){statusBar.textContent=pos.reason;return;}
      snapRotY=pos.rotation;
    } else if (ghostMesh) {
      // Use ghost's actual snapped position and rotation (wall-snap or surface-snap)
      pos = { x: ghostMesh.position.x, y: ghostMesh.position.y, z: ghostMesh.position.z };
      snapRotY = ghostMesh.rotation.y;
    } else {
      const cls0 = (activeItem.id || '').toLowerCase();
      const isWD = cls0.includes('window') || cls0.includes('door') || cls0.includes('glass') || cls0.includes('chimney');
      const isLoft=LOFT_CATALOG.some(item=>item.id===activeItem.id);
      pos = isLoft ? floorPoint(e.clientX,e.clientY,activeItem.elevation) : isWD ? floorPoint(e.clientX, e.clientY) : _placementPoint(e.clientX, e.clientY);
      const furnitureSnap = activeItem.wallAttached && pos ? _snapFurnitureToWall(pos, activeItem) : null;
      if (furnitureSnap) pos = { x: furnitureSnap.x, y: 0, z: furnitureSnap.z };
      snapRotY = furnitureSnap?.rotation ?? ghostAngle;
    }
    if (!pos) return;

    removeGhost();
    _placeObject(activeItem, pos, snapRotY);
    // Remain in placement mode — user can keep clicking to place more
  });

  function _placeObject(item, pos, snapRotY = ghostAngle) {
    const hw = item.w / 2, hd = item.d / 2;
    const id = `cat-${crypto.randomUUID()}`;

    // For window/door items placed on a vertical wall, swap the bbox dimensions so
    // createObject sees the correct opening width (along wall) vs frame depth (into wall).
    const cls0 = (item.id || '').toLowerCase();
    const isWinDoor0 = cls0.includes('window') || cls0.includes('door') || cls0.includes('glass') || cls0.includes('chimney');
    let bboxHw = hw, bboxHd = hd;
    if (isWinDoor0) {
      const snap0 = _snapGhostToWall(pos);
      if (snap0 && Math.abs(snap0.rotation) > 0.1) { bboxHw = hd; bboxHd = hw; }
    }

    const surfaceY = item.elevation ?? (pos.y || 0);
      const objData = {
      id,
      class: item.id,
      source: 'catalog',
      ...(item.photoSofaSpec&&{photoSofaSpec:item.photoSofaSpec}),
      bbox: { x1: pos.x - bboxHw, y1: pos.z - bboxHd, x2: pos.x + bboxHw, y2: pos.z + bboxHd },
      elevation: surfaceY,
      ...(Number.isFinite(item.objectHeightM)&&{objectHeightM:item.objectHeightM}),
      ...(item.id==='kitchen-pullout-slab'&&item.sectionCount&&{kitchenSectionCount:item.sectionCount}),
      layoutCenter: { x: 0, y: 0 },
      walls: layoutRef.current?.walls || [],
      ...(pos.wallId!=null&&{wardrobeAttachment:{wallId:String(pos.wallId),side:pos.wallSide}}),
    };

    const mesh = createObject(objData);
    if (!mesh) return;

    const isWallType = mesh.userData._isWinDoor === true;

    if (isWallType) {
      // createObject wall-snapped the mesh; rebuild bbox from snap position
      // so carveWalls can find and cut the correct wall segment.
      const wallHoriz = mesh.userData._wallHoriz !== false;
      const cx = mesh.userData._snapX ?? mesh.position.x;
      const cz = mesh.userData._snapZ ?? mesh.position.z;
      objData.bbox = wallHoriz
        ? { x1: cx - hw, y1: cz - hd, x2: cx + hw, y2: cz + hd }
        : { x1: cx - hd, y1: cz - hw, x2: cx + hd, y2: cz + hw };
      // Preserve createObject's wall-aligned rotation — do not override with ghostAngle
    } else {
      mesh.rotation.y = snapRotY;
    }

    mesh.userData.isSelectable = true;
    mesh.userData.objectType = item.id;
    mesh.userData.layoutId = id;
    scene.add(mesh);
    selectableMeshes.push(mesh);

    if (layoutRef.current) {
      layoutRef.current.objects = layoutRef.current.objects || [];
      layoutRef.current.objects.push({
        id, class: item.id, bbox: objData.bbox, source: 'catalog',
        ...(item.photoSofaSpec&&{photoSofaSpec:item.photoSofaSpec}),
        rotationY: mesh.rotation.y,
        ...(isKitchen(mesh)&&{kitchen:kitchenState(mesh)}),
        ...(item.wallAttached && { wallAttached: true }),
        ...(objData.wardrobeAttachment&&{wardrobeAttachment:objData.wardrobeAttachment}),
        ...(surfaceY > 0.01 && { elevation: surfaceY }),
      });
    }

    const saved = layoutRef.current && persistLayout(layoutRef.current);

    // Rebuild walls to carve hole for placed windows/doors
    const cls = (item.id || '').toLowerCase();
    const needsCarve = cls.includes('window') || cls.includes('door') || cls.includes('glass');
    if (needsCarve && typeof onWallOpening === 'function' && layoutRef.current) {
      onWallOpening(layoutRef.current);
    }

    // Flash status
    statusBar.innerHTML = `<span style="color:#34d399">✓ ${item.label} placed</span>&nbsp;· ${saved ? 'Saved locally' : 'Local save unavailable'}`;
    setTimeout(() => {
      if (activeItem?.id === item.id)
        statusBar.innerHTML = `<span style="color:#a5b4fc">✦ ${item.label} selected</span>&nbsp;· Click to place · <span style="color:#6b7280">Esc cancel</span>`;
    }, 1500);
  }

  // ── Keyboard ───────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if (!activeItem) return;
    if (e.target?.matches?.('input, textarea, select') || e.target?.isContentEditable) return;
    if (e.key === 'Escape') { exitPlacement(); return; }

    // A snapped cabinet must keep its back on the detected wall or neighbour.
    if(isCabinetItem(activeItem.id)&&ghostMesh?.userData.cabinetPlacement?.wallId!=null)return;

    // Rotation keys during placement
    const step = e.shiftKey ? Math.PI / 2 : Math.PI / 4;   // Shift → 90°, plain → 45°
    if (e.key === 'r' || e.key === 'R' || e.key === ']') {
      e.preventDefault();
      ghostAngle += step;
      if (ghostMesh) ghostMesh.rotation.y = ghostAngle;
    }
    if (e.key === '[') {
      e.preventDefault();
      ghostAngle -= step;
      if (ghostMesh) ghostMesh.rotation.y = ghostAngle;
    }
  });

  // ── Init ───────────────────────────────────────────────────
  renderTabs();
  renderGrid();

  return {
    isPlacing: () => !!activeItem,
    exitPlacement,
  };
}
