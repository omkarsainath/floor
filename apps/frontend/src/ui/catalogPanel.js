import * as THREE from 'three';
import { createObject } from '../generators/object.js';

const CATEGORIES = [
  {
    id: 'seating', label: 'Seating', icon: '🛋️',
    items: [
      { id: 'sofa',         label: 'Sofa',         icon: '🛋️', w: 2.2, d: 0.95 },
      { id: 'chair',        label: 'Chair',         icon: '🪑', w: 0.65, d: 0.65 },
      { id: 'accent chair', label: 'Accent Chair',  icon: '🪑', w: 0.75, d: 0.75 },
    ],
  },
  {
    id: 'tables', label: 'Tables', icon: '🪵',
    items: [
      { id: 'dining table', label: 'Dining Table',  icon: '🍽️', w: 1.8, d: 0.9 },
      { id: 'coffee table', label: 'Coffee Table',  icon: '☕',  w: 1.2, d: 0.6 },
      { id: 'study table',  label: 'Study Table',   icon: '📐',  w: 1.4, d: 0.7 },
      { id: 'side table',   label: 'Side Table',    icon: '🕯️', w: 0.5, d: 0.5 },
    ],
  },
  {
    id: 'bedroom', label: 'Bedroom', icon: '🛏️',
    items: [
      { id: 'bed',          label: 'Bed',           icon: '🛏️', w: 1.8, d: 2.0 },
      { id: 'wardrobe',     label: 'Wardrobe',      icon: '🚪',  w: 1.8, d: 0.6 },
    ],
  },
  {
    id: 'kitchen', label: 'Kitchen', icon: '🍳',
    items: [
      { id: 'fridge',         label: 'Fridge',     icon: '🧊',  w: 0.7,  d: 0.65 },
      { id: 'stove',          label: 'Stove',      icon: '🍳',  w: 0.8,  d: 0.6  },
      { id: 'kitchen-slab',   label: 'Counter',    icon: '🔲',  w: 1.8,  d: 0.6  },
      { id: 'sink',           label: 'Sink',       icon: '💧',  w: 0.6,  d: 0.5  },
      { id: 'washing machine',label: 'Washer',     icon: '🌀',  w: 0.6,  d: 0.6  },
    ],
  },
  {
    id: 'bathroom', label: 'Bath', icon: '🚿',
    items: [
      { id: 'commode', label: 'Toilet', icon: '🚽', w: 0.5, d: 0.7 },
    ],
  },
  {
    id: 'storage', label: 'Storage', icon: '📦',
    items: [
      { id: 'tv',            label: 'TV',            icon: '📺',  w: 1.4, d: 0.12 },
      { id: 'book cabinet',  label: 'Bookshelf',     icon: '📚',  w: 1.0, d: 0.35 },
      { id: 'crockery unit', label: 'Crockery Unit', icon: '🥣',  w: 1.2, d: 0.45 },
      { id: 'foyer cabinet', label: 'Cabinet',       icon: '🗄️', w: 1.0, d: 0.35 },
    ],
  },
];

export function createCatalogPanel({ scene, camera, renderer, layoutRef, selectableMeshes }) {
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _ray = new THREE.Raycaster();
  const _mouse = new THREE.Vector2();

  let activeItem = null;
  let ghostMesh = null;
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
  statusBar.style.cssText = [
    'padding:10px 14px;border-top:1px solid rgba(255,255,255,0.07)',
    'font-size:11px;color:#6b7280;min-height:38px;display:flex;align-items:center',
  ].join(';');
  statusBar.textContent = 'Select an item above to place it';

  panel.append(hdr, tabBar, grid, statusBar);
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
    grid.innerHTML = '';
    const cat = CATEGORIES.find(c => c.id === activeCatId);
    if (!cat) return;
    cat.items.forEach(item => {
      const isActive = activeItem?.id === item.id;
      const card = document.createElement('button');
      card.dataset.itemId = item.id;
      card.style.cssText = [
        'display:flex;flex-direction:column;align-items:center;gap:6px',
        'padding:12px 6px;border-radius:10px;cursor:pointer',
        'border:1.5px solid;transition:all 0.15s;',
        isActive
          ? 'border-color:rgba(99,102,241,0.9);background:rgba(99,102,241,0.2);box-shadow:0 0 0 2px rgba(99,102,241,0.35)'
          : 'border-color:rgba(255,255,255,0.08);background:rgba(255,255,255,0.03)',
      ].join(';');

      const iconEl = document.createElement('span');
      iconEl.style.cssText = 'font-size:28px;line-height:1;display:block';
      iconEl.textContent = item.icon;

      const nameEl = document.createElement('span');
      nameEl.style.cssText = 'font-size:10.5px;color:#d1d5db;text-align:center;line-height:1.3';
      nameEl.textContent = item.label;

      const sizeEl = document.createElement('span');
      sizeEl.style.cssText = 'font-size:9px;color:#4b5563';
      sizeEl.textContent = `${item.w}×${item.d} m`;

      card.append(iconEl, nameEl, sizeEl);

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
    activeItem = item;
    renderer.domElement.style.cursor = 'crosshair';
    statusBar.innerHTML = `<span style="color:#a5b4fc">✦ ${item.label} selected</span>&nbsp;· Click floor to place · <span style="color:#6b7280">Esc cancel</span>`;
    renderGrid();

    // Show floating hint outside panel
    removeHint();
    const hint = document.createElement('div');
    hint.id = 'cat-place-hint';
    hint.style.cssText = [
      'position:fixed;bottom:22px;left:50%;transform:translateX(-50%)',
      'background:rgba(99,102,241,0.92);color:#fff;padding:8px 20px',
      'border-radius:20px;font-size:13px;z-index:30;pointer-events:none',
      'font-family:Inter,system-ui,sans-serif',
      'box-shadow:0 4px 18px rgba(99,102,241,0.45)',
    ].join(';');
    hint.textContent = `${item.icon}  Click floor to place ${item.label}  ·  Esc to cancel`;
    document.body.appendChild(hint);
  }

  function exitPlacement() {
    activeItem = null;
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
      ghostMesh.traverse(n => { if (n.geometry) n.geometry.dispose(); });
      ghostMesh = null;
    }
  }

  // ── Floor raycasting ───────────────────────────────────────
  function floorPoint(clientX, clientY) {
    _mouse.x = (clientX / window.innerWidth) * 2 - 1;
    _mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    _ray.setFromCamera(_mouse, camera);
    const pt = new THREE.Vector3();
    return _ray.ray.intersectPlane(floorPlane, pt) ? pt : null;
  }

  // ── Mouse move → ghost preview ─────────────────────────────
  renderer.domElement.addEventListener('mousemove', (e) => {
    if (!activeItem) return;
    const pt = floorPoint(e.clientX, e.clientY);
    if (!pt) { removeGhost(); return; }

    removeGhost();
    const hw = activeItem.w / 2, hd = activeItem.d / 2;
    const ghost = createObject({
      id: 'ghost',
      class: activeItem.id,
      bbox: { x1: pt.x - hw, y1: pt.z - hd, x2: pt.x + hw, y2: pt.z + hd },
      layoutCenter: { x: 0, y: 0 },
      walls: layoutRef.current?.walls || [],
    });
    if (ghost) {
      ghost.traverse(n => {
        if (n.isMesh && n.material) {
          const m = n.material.clone();
          m.transparent = true;
          m.opacity = 0.4;
          n.material = m;
        }
      });
      ghostMesh = ghost;
      scene.add(ghostMesh);
    }
  });

  // ── Click → place object ───────────────────────────────────
  renderer.domElement.addEventListener('click', (e) => {
    if (!activeItem) return;
    e.stopImmediatePropagation(); // prevent selection/door handlers firing
    const pt = floorPoint(e.clientX, e.clientY);
    if (!pt) return;

    removeGhost();
    _placeObject(activeItem, pt);
    // Remain in placement mode — user can keep clicking to place more
  });

  function _placeObject(item, pos) {
    const hw = item.w / 2, hd = item.d / 2;
    const id = `cat-${Date.now()}`;
    const objData = {
      id,
      class: item.id,
      bbox: { x1: pos.x - hw, y1: pos.z - hd, x2: pos.x + hw, y2: pos.z + hd },
      layoutCenter: { x: 0, y: 0 },
      walls: layoutRef.current?.walls || [],
    };

    const mesh = createObject(objData);
    if (!mesh) return;

    mesh.userData.isSelectable = true;
    mesh.userData.objectType = item.id;
    mesh.userData.layoutId = id;
    scene.add(mesh);
    selectableMeshes.push(mesh);

    if (layoutRef.current) {
      layoutRef.current.objects = layoutRef.current.objects || [];
      layoutRef.current.objects.push({
        id, class: item.id, bbox: objData.bbox, source: 'catalog',
      });
    }

    // Flash status
    statusBar.innerHTML = `<span style="color:#34d399">✓ ${item.label} placed</span>&nbsp;· Click again to place another`;
    setTimeout(() => {
      if (activeItem?.id === item.id)
        statusBar.innerHTML = `<span style="color:#a5b4fc">✦ ${item.label} selected</span>&nbsp;· Click floor to place · <span style="color:#6b7280">Esc cancel</span>`;
    }, 1500);
  }

  // ── Keyboard ───────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeItem) exitPlacement();
  });

  // ── Init ───────────────────────────────────────────────────
  renderTabs();
  renderGrid();

  return {
    isPlacing: () => !!activeItem,
    exitPlacement,
  };
}
