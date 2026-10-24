import { registerKitchen, restoreKitchen } from '../kitchen/system.js';
import { PULLOUT_SLAB_ID, EDITABLE_CABINET_ID, pulloutSlabState } from '../kitchen/presets.js';
import {buildSectionGeometry,fitSectionSizes} from '../kitchen/sectionGeometry.js';
import { restoreSofaBed } from './sofaBed.js';
import { createSofaFactoryFurniture } from './sofaFactory.js';
import { createPhotoSofa, PHOTO_SOFA_CLASS } from './photoSofa.js';
import { setObjectHeight } from '../design/objectHeight.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createDetailedFurniture } from './detailedFurniture.js';
import { furniturePlacement } from './furniturePlacement.js';
import { createWardrobe } from './wardrobe.js';
import { createReferenceFurniture } from './referenceFurniture.js';
import { createPoojaUnit } from './pooja.js';
import { createTvUnit } from './tvUnits.js';
import { designerDoorSpec, placeDesignerDoor } from './designerDoors.js';

// Toggle object labels; disabled for a clean rendered look.
const SHOW_LABELS = false;

const CLASS_PROPS = {
  door: { color: 0x8b5a2b, opacity: 1.0, height: 2.4 },
  window:              { color: 0x9bcef0, opacity: 0.4,  height: 1.1 },
  'glass-window':      { color: 0x9bcef0, opacity: 0.35, height: 1.1 },
  'glass-wall':        { color: 0x9bcef0, opacity: 0.35, height: 2.8 },
  'glass-grill':       { color: 0x9bcef0, opacity: 0.45, height: 1.2 },
  'bay-window':        { color: 0x9bcef0, opacity: 0.4,  height: 1.1 },
  // Named window variants
  'sliding-window':    { color: 0x9bcef0, opacity: 0.25, height: 1.1 },
  'sliding-glass-door':{ color: 0x9bcef0, opacity: 0.22, height: 2.1 },
  'upvc-slide-door':   { color: 0xe8f4f8, opacity: 0.22, height: 2.1 },
  'casement-window':   { color: 0x9bcef0, opacity: 0.25, height: 1.1 },
  'french-window':     { color: 0x9bcef0, opacity: 0.22, height: 2.1 },
  'french-door':       { color: 0x9bcef0, opacity: 0.22, height: 2.1 },
  'fixed-window':      { color: 0x9bcef0, opacity: 0.20, height: 1.2 },
  'louvered-window':   { color: 0x9bcef0, opacity: 0.30, height: 1.0 },
  'arched-window':     { color: 0x9bcef0, opacity: 0.25, height: 1.5 },
  // Furniture — realistic warm tones
  bed: { color: 0xe8ddd0, opacity: 1.0, height: 0.5 },
  sofa: { color: 0xc9b9a8, opacity: 1.0, height: 0.7 },
  chair: { color: 0x8b7355, opacity: 1.0, height: 0.8 },
  'accent chair': { color: 0xd4a574, opacity: 1.0, height: 0.8 },
  table: { color: 0x8b6914, opacity: 1.0, height: 0.75 },
  'dining table': { color: 0x6b4226, opacity: 1.0, height: 0.75 },
  'coffee table': { color: 0x8b6914, opacity: 1.0, height: 0.45 },
  'study table': { color: 0x5c4033, opacity: 1.0, height: 0.75 },
  'side table': { color: 0x8b7355, opacity: 1.0, height: 0.55 },
  tv: { color: 0x1a1a1a, opacity: 1.0, height: 0.05 },
  wardrobe: { color: 0x5c4033, opacity: 1.0, height: 2.0 },
  fridge: { color: 0xe8e8e8, opacity: 1.0, height: 1.8 },
  stove: { color: 0x2d2d2d, opacity: 1.0, height: 0.9 },
  'kitchen-slab': { color: 0x8b8378, opacity: 1.0, height: 0.9 },
  [PULLOUT_SLAB_ID]: { color: 0x4e7fa8, opacity: 1.0, height: 0.9 },
  sink: { color: 0xd0d0d0, opacity: 1.0, height: 0.85 },
  'washing machine': { color: 0xf0f0f0, opacity: 1.0, height: 0.85 },
  commode: { color: 0xfaf8f5, opacity: 1.0, height: 0.4 },
  'crockery unit': { color: 0x6b4226, opacity: 1.0, height: 1.8 },
  'foyer cabinet': { color: 0x5c4033, opacity: 1.0, height: 1.0 },
  'book cabinet': { color: 0x4a3728, opacity: 1.0, height: 1.8 },
  'breakfast counter': { color: 0x8b8378, opacity: 1.0, height: 0.9 },
  stairs: { color: 0xc8c0b4, opacity: 1.0, height: 3.0 },
  'spiral-stairs': { color: 0xb0a898, opacity: 1.0, height: 3.0 },
  lift: { color: 0x7f8c8d, opacity: 1.0, height: 2.6 },
  wash: { color: 0xd0d0d0, opacity: 1.0, height: 0.85 },
  // Bed variants
  'single-bed':   { color: 0xe8ddd0, opacity: 1.0, height: 0.5 },
  'double-bed':   { color: 0xd4c4b8, opacity: 1.0, height: 0.5 },
  'queen-bed':    { color: 0xcfbfaf, opacity: 1.0, height: 0.5 },
  'king-bed':     { color: 0xc9b9a8, opacity: 1.0, height: 0.5 },
  'bunk-bed':     { color: 0xe0d4c8, opacity: 1.0, height: 0.5 },
  // Chair variants
  'office-chair': { color: 0x2a2a2a, opacity: 1.0, height: 0.95 },
  'bar-stool':    { color: 0x5c4033, opacity: 1.0, height: 0.75 },
  'armchair':     { color: 0xb8a898, opacity: 1.0, height: 0.85 },
  'lounge-chair': { color: 0x8b7355, opacity: 1.0, height: 0.85 },
  'dining-chair': { color: 0x6b5040, opacity: 1.0, height: 0.8 },
  // Sofa variants
  'sofa-2':       { color: 0xc9b9a8, opacity: 1.0, height: 0.7 },
  'sofa-3':       { color: 0xb8a898, opacity: 1.0, height: 0.7 },
  'l-sofa':       { color: 0xb0a090, opacity: 1.0, height: 0.7 },
  'loveseat':     { color: 0xd4c4b0, opacity: 1.0, height: 0.7 },
  // Table variants
  'round-table':  { color: 0x6b4226, opacity: 1.0, height: 0.75 },
  'console-table':{ color: 0x4a3728, opacity: 1.0, height: 0.85 },
  // Storage/extra
  'tv-unit':      { color: 0x2a2420, opacity: 1.0, height: 0.55 },
  'shoe-rack':    { color: 0x5c4033, opacity: 1.0, height: 1.2 },
  'bean-bag':     { color: 0xe07060, opacity: 1.0, height: 0.6 },
  'bathtub':      { color: 0xfaf8f5, opacity: 1.0, height: 0.55 },
  // Loft
  'loft-bed':     { color: 0xe0d4c8, opacity: 1.0, height: 0.5 },
  // Modular kitchen
  'kitchen-base-cabinet':  { color: 0x5b8dba, opacity: 1.0, height: 0.9 },
  'kitchen-upper-cabinet': { color: 0x5b8dba, opacity: 1.0, height: 0.65 },
  'overhead-cabinet':      { color: 0xf2f2f2, opacity: 1.0, height: 0.5 },
  'kitchen-chimney':       { color: 0x1a1a1a, opacity: 1.0, height: 0.9 },
  'kitchen-island':        { color: 0x5b8dba, opacity: 1.0, height: 0.9 },
  'oven':                  { color: 0x1a1a1a, opacity: 1.0, height: 0.90 },
  'mixer':                 { color: 0xd0d0d0, opacity: 1.0, height: 0.45 },
  'loft-wall-cabinet':     { color: 0x6b4226, opacity: 1.0, height: 1.0 },
  // Bedroom / living
  'dresser':      { color: 0x5c3a1e, opacity: 1.0, height: 1.2 },
  // Wall-mounted items (geometry positioned at wall height)
  'wall-tv':      { color: 0x0a0a0a, opacity: 1.0, height: 1.0 },
  'wall-shelf':   { color: 0x6b5040, opacity: 1.0, height: 1.5 },
  'wall-mirror':  { color: 0xc8c8c8, opacity: 1.0, height: 1.6 },
  'wall-lamp':    { color: 0xf0c860, opacity: 1.0, height: 1.8 },
  'wall-art':     { color: 0x8b4513, opacity: 1.0, height: 1.5 },
  // Pooja unit
  'pooja-unit':   { color: 0x5a2d0c, opacity: 1.0, height: 2.1 },
  default: { color: 0xc8b89a, opacity: 1.0, height: 1.0 }
};

// Find the wall closest to a door bbox and return wall + projection point
function findNearestWall(bbox, walls) {
  if (!walls || !walls.length) return { wall: null, projX: 0, projY: 0 };
  const cx = (bbox.x1 + bbox.x2) / 2;
  const cy = (bbox.y1 + bbox.y2) / 2;
  let best = null;
  let bestDist = Infinity;
  let bestProjX = cx, bestProjY = cy;
  walls.forEach((w) => {
    if (!w.start || !w.end) return;
    const ax = w.start.x, ay = w.start.y, bx = w.end.x, by = w.end.y;
    const abx = bx - ax, aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((cx - ax) * abx + (cy - ay) * aby) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + t * abx;
    const projY = ay + t * aby;
    const d = Math.hypot(cx - projX, cy - projY);
    if (d < bestDist) {
      bestDist = d;
      best = w;
      bestProjX = projX;
      bestProjY = projY;
    }
  });
  return { wall: best, projX: bestProjX, projY: bestProjY };
}

// Returns sillBase (floor height) and winTop (top of opening) for any window/door class.
// Used by wall-carving code in main.js to position parapet + lintel correctly.
export function getWindowSillAndTop(cls, dimensions = {}) {
  const c = (cls || '').toLowerCase();
  const isDoor = c === 'sliding-glass-door' || c === 'french-door' || c.includes('door');
  const suppliedSill = Number(dimensions.sill_height_m);
  const sillBase = dimensions.sill_height_m != null && Number.isFinite(suppliedSill) && suppliedSill >= 0
    ? suppliedSill : isDoor ? 0.0 : 0.9;
  const props = CLASS_PROPS[c] || (designerDoorSpec(c) ? CLASS_PROPS.door : CLASS_PROPS.window);
  const suppliedHeight = Number(dimensions.height_m);
  const openingH = Number.isFinite(suppliedHeight) && suppliedHeight > 0 ? suppliedHeight : props?.height ?? 1.1;
  return { sillBase, winTop: sillBase + openingH };
}

export function createObject(obj) {
  const group = createObjectGeometry(obj);
  if (group && Number.isFinite(obj?.objectHeightM) && ![PULLOUT_SLAB_ID,EDITABLE_CABINET_ID].includes(String(obj?.class).trim().toLowerCase())) setObjectHeight(group, obj.objectHeightM);
  restoreSofaBed(group, obj?.sofaBedExpanded);
  restoreKitchen(group, String(obj?.class).trim().toLowerCase()===PULLOUT_SLAB_ID && obj.kitchen==null
    ? {...obj,kitchen:pulloutSlabState()} : obj);
  return group;
}

function createObjectGeometry(obj) {
  const { bbox = {}, class: cls = 'default', layoutCenter = null, walls = [],
          swingDir = 'auto' } = obj || {};
  const lowerCls = String(cls).trim().toLowerCase();
  const props = CLASS_PROPS[lowerCls] || CLASS_PROPS.default;
  const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = bbox;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  if (designerDoorSpec(lowerCls)) {
    return placeDesignerDoor({ ...obj, class: lowerCls }, getWindowSillAndTop(lowerCls, obj));
  }

  if (lowerCls.includes('door') && !['upvc-slide-door', 'sliding-glass-door', 'french-door'].includes(lowerCls)) {
    const thickness = 0.06;

    // Find nearest wall to determine orientation and snap position
    const { wall: nearWall, projX: wallProjX, projY: wallProjY } = findNearestWall(bbox, walls);

    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;

    // Determine wall direction — use nearest wall, fallback to bbox shape
    let wallHoriz = horizontal;
    if (nearWall) {
      const wdx = nearWall.end.x - nearWall.start.x;
      const wdy = nearWall.end.y - nearWall.start.y;
      wallHoriz = Math.abs(wdx) >= Math.abs(wdy);
    }

    // Per-door dimensions based on wall direction (not bbox aspect ratio)
    const bboxW = Math.abs(dx);
    const bboxH = Math.abs(dy);
    // Door width = bbox extent along the wall direction
    const doorWidth = wallHoriz ? Math.max(bboxW, 0.5) : Math.max(bboxH, 0.5);
    // A top-down drawing does not encode door height in its box depth.
    // Use the same supplied height/default as the wall opening.
    const { sillBase: doorSill, winTop: doorTop } = getWindowSillAndTop(lowerCls, obj);
    const DOOR_HEIGHT = doorTop - doorSill;

    const panelMat = new THREE.MeshStandardMaterial({
      color: props.color, opacity: 1.0, transparent: false,
      roughness: 0.45, metalness: 0.02,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x5c3a21, roughness: 0.5, metalness: 0.02,
    });
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0xc0b090, roughness: 0.2, metalness: 0.6,
    });

    // Door panel: origin at hinge edge (x=0), extends along +x
    const doorGroup = new THREE.Group();
    const frameT = 0.04;
    const panelW = Math.max(doorWidth - frameT * 2, 0.05);
    const panelH = Math.max(DOOR_HEIGHT - frameT * 2, 0.05);

    // Main inset panel
    const panelGeom = new THREE.BoxGeometry(panelW, panelH, thickness);
    const panelMesh = new THREE.Mesh(panelGeom, panelMat);
    panelMesh.userData.kitchenObstacleLabel = 'door panel';
    panelMesh.position.set(doorWidth / 2, DOOR_HEIGHT / 2, 0);
    panelMesh.castShadow = true;
    panelMesh.receiveShadow = true;
    doorGroup.add(panelMesh);

    // Frame
    const frameD = thickness + 0.01;
    const addFrame = (sx, sy, sz, px, py, pz) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      const m = new THREE.Mesh(g, frameMat);
      m.userData.kitchenObstacleLabel = 'door frame';
      m.position.set(px, py, pz);
      m.castShadow = true; m.receiveShadow = true;
      doorGroup.add(m);
    };
    addFrame(doorWidth, frameT, frameD, doorWidth / 2, DOOR_HEIGHT - frameT / 2, 0);
    addFrame(doorWidth, frameT, frameD, doorWidth / 2, frameT / 2, 0);
    addFrame(frameT, DOOR_HEIGHT, frameD, frameT / 2, DOOR_HEIGHT / 2, 0);
    addFrame(frameT, DOOR_HEIGHT, frameD, doorWidth - frameT / 2, DOOR_HEIGHT / 2, 0);

    // Handle
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.22, 0.06),
      handleMat
    );
    handle.position.set(doorWidth - 0.12, DOOR_HEIGHT / 2, thickness / 2 + 0.03);
    handle.userData.kitchenObstacleLabel = 'door handle';
    handle.castShadow = true;
    doorGroup.add(handle);

    // Click collider
    const clickGeom = new THREE.BoxGeometry(doorWidth + 0.3, DOOR_HEIGHT, 0.3);
    const clickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 });
    const clickMesh = new THREE.Mesh(clickGeom, clickMat);
    // Ray picking only: this oversized target is not physical door geometry.
    clickMesh.userData.isInteractionProxy = true;
    clickMesh.position.set(doorWidth / 2, DOOR_HEIGHT / 2, 0);
    doorGroup.add(clickMesh);

    // Hinge pivot
    const hinge = new THREE.Object3D();
    hinge.userData.isDoor = true;
    hinge.userData.open = false;
    hinge.userData.closedAngle = 0;

    // Determine hinge side and swing direction per door
    // "right"/"left" = hinge on right or left edge of the opening
    // "inside"/"outside" = swing toward center or away from center
    let hingeSide = 'left'; // default: hinge at min edge
    let swingSign = 1;

    if (swingDir === 'right-inside') {
      hingeSide = 'right';
      swingSign = -1;
    } else if (swingDir === 'right-outside') {
      hingeSide = 'right';
      swingSign = 1;
    } else if (swingDir === 'left-inside') {
      hingeSide = 'left';
      swingSign = 1;
    } else if (swingDir === 'left-outside') {
      hingeSide = 'left';
      swingSign = -1;
    } else {
      // 'auto': hinge at min edge, swing away from layout center
      if (layoutCenter && Number.isFinite(layoutCenter.x) && Number.isFinite(layoutCenter.y)) {
        if (wallHoriz) {
          swingSign = (layoutCenter.y > cy) ? -1 : 1;
        } else {
          swingSign = (layoutCenter.x > cx) ? 1 : -1;
        }
      }
    }

    // Snap door to nearest wall position
    // wallProjX/wallProjY = closest point on wall to door center
    if (wallHoriz) {
      // Wall runs along X: hinge X from bbox edge, Z snapped to wall
      const hingeX = hingeSide === 'right' ? Math.max(x1, x2) : Math.min(x1, x2);
      const snapZ = nearWall ? wallProjY : cy;
      hinge.position.set(hingeX, doorSill, snapZ);
      if (hingeSide === 'right') {
        doorGroup.scale.x = -1;
      }
      hinge.userData.openAngle = swingSign * Math.PI / 2;
    } else {
      // Wall runs along Z: rotate panel from +X to +Z direction
      doorGroup.rotation.y = -Math.PI / 2;
      const hingeZ = hingeSide === 'right' ? Math.max(y1, y2) : Math.min(y1, y2);
      const snapX = nearWall ? wallProjX : cx;
      hinge.position.set(snapX, doorSill, hingeZ);
      if (hingeSide === 'right') {
        doorGroup.scale.x = -1;
      }
      hinge.userData.openAngle = swingSign * Math.PI / 2;
    }

    hinge.add(doorGroup);

    // Export wall-snap info for callers to build a correct straddling bbox
    hinge.userData._wallHoriz = wallHoriz;
    hinge.userData._snapX     = wallHoriz ? (x1 + x2) / 2 : (nearWall ? wallProjX : (x1 + x2) / 2);
    hinge.userData._snapZ     = wallHoriz ? (nearWall ? wallProjY : (y1 + y2) / 2) : (y1 + y2) / 2;
    hinge.userData._isWinDoor = true;
    hinge.userData._placementX = hinge.position.x;
    hinge.userData._placementZ = hinge.position.z;

    return hinge;
  }

  // ── Window / glass-door openings ─────────────────────────
  const _isWindowType = lowerCls.includes('window') || lowerCls.includes('glass')
    || lowerCls === 'sliding-glass-door' || lowerCls === 'french-door'
    || lowerCls === 'upvc-slide-door';

  if (_isWindowType) {
    const { wall: nearWall, projX: wallProjX, projY: wallProjY } = findNearestWall(bbox, walls);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const w  = Math.max(Math.abs(dx), 0.2);
    const d  = Math.max(Math.abs(dy), 0.08);
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const wallHoriz  = nearWall
      ? Math.abs(nearWall.end.x - nearWall.start.x) >= Math.abs(nearWall.end.y - nearWall.start.y)
      : horizontal;

    const winW  = wallHoriz ? w : d;
    const winD  = wallHoriz ? d : w;
    const fD    = Math.max(winD, 0.07);   // frame depth
    const jW    = 0.048;                  // jamb width
    const sillH = 0.048;
    const headH = 0.048;
    const { sillBase, winTop } = getWindowSillAndTop(lowerCls, obj);
    const pH = winTop - sillBase;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xe4edf5, roughness: 0.28, metalness: 0.15 });
    const alMat    = new THREE.MeshStandardMaterial({ color: 0xc8d4dc, roughness: 0.20, metalness: 0.55 });
    // Physically-based glass: transmission + reflectivity visible from both sides
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xd0e8f8,
      roughness: 0.04,
      metalness: 0.0,
      // Keep a readable blue pane in the wall. Very high transmission made the
      // window look like a pale rectangle from one side of the room.
      transmission: 0.68,
      thickness: 0.006,          // IOR depth in metres
      ior: 1.52,                 // standard glass IOR
      reflectivity: 0.9,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const glassTintMat = new THREE.MeshPhysicalMaterial({
      color: 0x8ab4cc,
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.58,
      thickness: 0.006,
      ior: 1.52,
      reflectivity: 0.95,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x909090, roughness: 0.18, metalness: 0.75 });

    const winGroup = new THREE.Group();
    const wb = (sx, sy, sz, px, py, pz, m) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true; mesh.receiveShadow = true;
      winGroup.add(mesh);
    };
    // shared outer frame (sill / head / jambs)
    const outerFrame = () => {
      wb(winW, sillH, fD, 0, sillH / 2, 0, frameMat);
      wb(winW, headH, fD, 0, pH - headH / 2, 0, frameMat);
      wb(jW, pH, fD, -winW / 2 + jW / 2, pH / 2, 0, frameMat);
      wb(jW, pH, fD,  winW / 2 - jW / 2, pH / 2, 0, frameMat);
    };
    const innerW = winW - jW * 2;
    const innerH = pH - sillH - headH;
    const midY   = sillH + innerH / 2;

    // ── SLIDING WINDOW ──────────────────────────────────────
    if (lowerCls === 'sliding-window') {
      outerFrame();
      wb(innerW, 0.022, fD * 1.1, 0, sillH + 0.011, 0, alMat);
      wb(innerW, 0.022, fD * 1.1, 0, pH - headH - 0.011, 0, alMat);
      // Fixed back pane (right half)
      wb(innerW * 0.52, innerH - 0.06, 0.012, innerW * 0.12, midY, fD * 0.18, glassMat);
      wb(0.028, innerH - 0.06, fD * 0.35, -innerW * 0.5 + 0.014, midY, fD * 0.18, alMat);
      wb(0.028, innerH - 0.06, fD * 0.35,  innerW * 0.5 - 0.014, midY, fD * 0.18, alMat);
      wb(innerW * 0.52, 0.022, fD * 0.35, innerW * 0.12, sillH + 0.022, fD * 0.18, alMat);
      wb(innerW * 0.52, 0.022, fD * 0.35, innerW * 0.12, pH - headH - 0.022, fD * 0.18, alMat);
      // Sliding front pane (animatable group, starts closed = at rest left position)
      const slidePanel = new THREE.Group();
      const addSlide = (sx, sy, sz, px, py, pz, m) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
        mesh.position.set(px, py, pz); mesh.castShadow = true;
        slidePanel.add(mesh);
      };
      addSlide(innerW * 0.52, innerH - 0.06, 0.012, -innerW * 0.12, midY, -fD * 0.18, glassMat);
      addSlide(0.028, innerH - 0.06, fD * 0.35, -innerW * 0.5 + 0.014, midY, -fD * 0.18, alMat);
      addSlide(0.028, innerH - 0.06, fD * 0.35,  innerW * 0.5 - 0.014, midY, -fD * 0.18, alMat);
      addSlide(innerW * 0.52, 0.022, fD * 0.35, -innerW * 0.12, sillH + 0.022, -fD * 0.18, alMat);
      addSlide(innerW * 0.52, 0.022, fD * 0.35, -innerW * 0.12, pH - headH - 0.022, -fD * 0.18, alMat);
      addSlide(0.014, 0.11, 0.032, innerW * 0.14, midY, -fD * 0.38, handleMat);
      slidePanel.userData._animType = 'slide';
      slidePanel.userData._animProp = 'px';
      slidePanel.userData._animOpen = false;
      slidePanel.userData._closedState = 0;
      slidePanel.userData._openState   = innerW * 0.50;
      winGroup.add(slidePanel);

    // ── SLIDING GLASS DOOR ──────────────────────────────────
    } else if (lowerCls === 'sliding-glass-door') {
      outerFrame();
      wb(innerW, 0.030, fD * 1.15, 0, sillH + 0.015, 0, alMat);
      wb(innerW, 0.030, fD * 1.15, 0, pH - headH - 0.015, 0, alMat);
      // Fixed panel (back, right half) — tinted
      wb(innerW * 0.515, innerH - 0.06, 0.014, innerW * 0.125, midY, fD * 0.16, glassTintMat);
      wb(0.040, innerH - 0.06, fD * 0.36, -innerW * 0.505 + 0.020, midY, fD * 0.16, alMat);
      wb(0.040, innerH - 0.06, fD * 0.36,  innerW * 0.505 - 0.020, midY, fD * 0.16, alMat);
      wb(innerW * 0.515, 0.030, fD * 0.36, innerW * 0.125, sillH + 0.030, fD * 0.16, alMat);
      wb(innerW * 0.515, 0.030, fD * 0.36, innerW * 0.125, pH - headH - 0.030, fD * 0.16, alMat);
      wb(0.016, 0.22, 0.016, innerW * 0.08, pH * 0.46, fD * 0.22, handleMat);
      wb(0.038, 0.016, 0.016, innerW * 0.08, pH * 0.46 + 0.11, fD * 0.22, handleMat);
      wb(0.038, 0.016, 0.016, innerW * 0.08, pH * 0.46 - 0.11, fD * 0.22, handleMat);
      // Sliding front panel (animatable group)
      const sgdPanel = new THREE.Group();
      const addSgd = (sx, sy, sz, px, py, pz, m) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
        mesh.position.set(px, py, pz); mesh.castShadow = true;
        sgdPanel.add(mesh);
      };
      addSgd(innerW * 0.515, innerH - 0.06, 0.014, -innerW * 0.125, midY, -fD * 0.16, glassTintMat);
      addSgd(0.040, innerH - 0.06, fD * 0.36, -innerW * 0.505 + 0.020, midY, -fD * 0.16, alMat);
      addSgd(0.040, innerH - 0.06, fD * 0.36,  innerW * 0.505 - 0.020, midY, -fD * 0.16, alMat);
      addSgd(innerW * 0.515, 0.030, fD * 0.36, -innerW * 0.125, sillH + 0.030, -fD * 0.16, alMat);
      addSgd(innerW * 0.515, 0.030, fD * 0.36, -innerW * 0.125, pH - headH - 0.030, -fD * 0.16, alMat);
      addSgd(0.016, 0.22, 0.016, -innerW * 0.08, pH * 0.46, -fD * 0.35, handleMat);
      addSgd(0.038, 0.016, 0.016, -innerW * 0.08, pH * 0.46 + 0.11, -fD * 0.35, handleMat);
      addSgd(0.038, 0.016, 0.016, -innerW * 0.08, pH * 0.46 - 0.11, -fD * 0.35, handleMat);
      sgdPanel.userData._animType = 'slide';
      sgdPanel.userData._animProp = 'px';
      sgdPanel.userData._animOpen = false;
      sgdPanel.userData._closedState = 0;
      sgdPanel.userData._openState   = innerW * 0.50;
      winGroup.add(sgdPanel);
      wb(winW, 0.012, fD, 0, 0.006, 0, alMat);

    // ── UPVC SLIDE DOOR ──────────────────────────────────────
    // Center-opening: two panels split from the middle and slide outward.
    } else if (lowerCls === 'upvc-slide-door') {
      const upvcMat = new THREE.MeshStandardMaterial({ color: 0xf3f3f0, roughness: 0.50, metalness: 0.0 });
      const gasketMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95, metalness: 0.0 });
      const stainMat  = new THREE.MeshStandardMaterial({ color: 0xbcbcbc, roughness: 0.18, metalness: 0.75 });
      // Very clear glass — high transmission so you can see through
      const upvcGlass = new THREE.MeshPhysicalMaterial({
        color: 0xe8f4fa,
        roughness: 0.02, metalness: 0.0,
        transmission: 0.70,
        thickness: 0.028,
        ior: 1.52,
        reflectivity: 0.6,
        transparent: true, opacity: 0.42,
        depthWrite: false, side: THREE.DoubleSide,
      });

      const fp = 0.058; // UPVC frame profile width (58 mm — standard UPVC)
      const sp = 0.040; // sash profile width (40 mm inner sash)

      // Helper — add fixed geometry to winGroup
      const addF = (sx, sy, sz, px, py, pz, m = upvcMat) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
        mesh.position.set(px, py, pz); mesh.castShadow = true; mesh.receiveShadow = true;
        winGroup.add(mesh);
      };

      // ── Fixed outer frame ────────────────────────────────
      addF(winW, fp, fD * 1.05, 0, fp / 2,       0);  // sill
      addF(winW, fp, fD * 1.05, 0, pH - fp / 2,  0);  // head
      addF(fp, pH, fD * 1.05, -winW / 2 + fp / 2, pH / 2, 0);  // left jamb
      addF(fp, pH, fD * 1.05,  winW / 2 - fp / 2, pH / 2, 0);  // right jamb

      // Dual-track channel (front + back track grooves, visible as dark strip)
      addF(innerW, 0.010, fD * 0.35, 0, fp + 0.008,      fD * 0.20, gasketMat);
      addF(innerW, 0.010, fD * 0.35, 0, pH - fp - 0.008, fD * 0.20, gasketMat);
      addF(innerW, 0.010, fD * 0.35, 0, fp + 0.008,     -fD * 0.20, gasketMat);
      addF(innerW, 0.010, fD * 0.35, 0, pH - fp - 0.008,-fD * 0.20, gasketMat);

      // Stainless floor threshold bar
      addF(winW, 0.014, fD * 0.55, 0, 0.007, 0, stainMat);

      // ── Two animatable sliding panels ────────────────────
      const panW    = innerW / 2;          // each panel is half the opening
      const panH    = pH - fp * 2;         // full height inside frame
      const midY    = pH / 2;
      const slideDist = panW * 0.88;       // how far each panel travels when open

      [-1, 1].forEach((side) => {          // side=-1 → left panel, side=+1 → right panel
        const panel = new THREE.Group();
        const panCx = side * panW / 2;     // closed center X of this panel

        const addP = (sx, sy, sz, px, py, pz, m = upvcMat) => {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
          mesh.position.set(px, py, pz); mesh.castShadow = true; panel.add(mesh);
        };

        // Track depth offset: left panel in rear track, right panel in front track
        const tz = side === -1 ? fD * 0.18 : -fD * 0.18;

        // Sash frame — top, bottom, outer edge, inner (meeting) edge
        addP(panW, sp, fD * 0.82, panCx, fp + sp / 2,       tz);   // bottom rail
        addP(panW, sp, fD * 0.82, panCx, pH - fp - sp / 2,  tz);   // top rail
        addP(sp, panH, fD * 0.82, panCx - side * (panW / 2 - sp / 2), midY, tz); // outer stile
        addP(sp, panH, fD * 0.82, panCx + side * (panW / 2 - sp / 2), midY, tz); // meeting stile

        // Clear glass pane (fills opening inside sash)
        const gW = panW - sp * 2;
        const gH = panH - sp * 2;
        addP(gW, gH, 0.028, panCx, midY, tz, upvcGlass);

        // Slim horizontal mid-bar (divides glass into upper/lower for look)
        addP(gW, 0.025, fD * 0.68, panCx, midY, tz);

        // Handle: D-pull on meeting (center) edge of each panel
        const hx = panCx + side * (panW / 2 - sp - 0.025);
        addP(0.016, 0.180, 0.016, hx, midY,        tz - 0.030, stainMat);
        addP(0.032, 0.016, 0.016, hx, midY + 0.09, tz - 0.030, stainMat);
        addP(0.032, 0.016, 0.016, hx, midY - 0.09, tz - 0.030, stainMat);
        // Lock cylinder dot
        addP(0.020, 0.020, 0.012, hx - side * 0.010, midY, tz - 0.038, upvcMat);

        // Slide animation: left panel slides left (−), right slides right (+)
        panel.userData._animType    = 'slide';
        panel.userData._animProp    = 'px';
        panel.userData._animOpen    = false;
        panel.userData._closedState = 0;
        panel.userData._openState   = side * slideDist;  // negative = left, positive = right
        winGroup.add(panel);
      });

    // ── CASEMENT WINDOW ─────────────────────────────────────
    } else if (lowerCls === 'casement-window') {
      outerFrame();
      const panels = winW > 0.85 ? 2 : 1;
      const panW = innerW / panels;
      for (let p = 0; p < panels; p++) {
        const hingeX = -innerW / 2 + panW * p;  // hinge at left of each panel
        const panCx  = hingeX + panW / 2;
        // Sash frame
        wb(panW - 0.012, 0.030, fD * 0.9, panCx, sillH + 0.015, 0, alMat);
        wb(panW - 0.012, 0.030, fD * 0.9, panCx, pH - headH - 0.015, 0, alMat);
        wb(0.030, innerH, fD * 0.9, hingeX + 0.015, midY, 0, alMat);
        wb(0.030, innerH, fD * 0.9, hingeX + panW - 0.015, midY, 0, alMat);
        // Glass — show slightly open (rotate sash group)
        const sashGroup = new THREE.Group();
        const sb = (sx, sy, sz, px, py, pz, m) => {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
          mesh.position.set(px, py, pz);
          mesh.castShadow = true;
          sashGroup.add(mesh);
        };
        sb(panW - 0.065, innerH - 0.010, 0.012, panW / 2 - 0.02, midY, 0, glassMat);
        // Horizontal mid-rail
        sb(panW - 0.065, 0.028, fD * 0.85, panW / 2 - 0.02, midY, 0, alMat);
        // Handle (lever on right side of sash)
        sb(0.012, 0.095, 0.028, panW - 0.045, midY, -fD * 0.55, handleMat);
        // Hinge hardware (3 small plates)
        [0.22, 0.50, 0.78].forEach(t => {
          sb(0.020, 0.045, 0.032, 0.010, sillH + innerH * t, -fD * 0.45, handleMat);
        });
        sashGroup.position.set(hingeX, 0, fD * 0.22);
        sashGroup.rotation.y = 0; // start closed
        // Tag for open animation: left panel swings left (−), right panel swings right (+)
        const swingSign = (p % 2 === 0 ? -1 : 1);
        sashGroup.userData._animType   = 'swing';
        sashGroup.userData._animProp   = 'ry';
        sashGroup.userData._animOpen   = false;
        sashGroup.userData._closedState = 0;
        sashGroup.userData._openState  = swingSign * (Math.PI / 2);
        winGroup.add(sashGroup);
      }
      // Centre mullion for dual casement
      if (panels === 2) wb(0.038, innerH, fD, 0, midY, 0, frameMat);

    // ── FRENCH WINDOW / FRENCH DOOR ─────────────────────────
    } else if (lowerCls === 'french-window' || lowerCls === 'french-door') {
      outerFrame();
      const halfW = innerW / 2;
      [-1, 1].forEach((side, si) => {
        const panCx = side * halfW / 2;
        const hingeEdgeX = side * halfW * 0.99; // outer hinge edge in local space
        // Fixed frame rails (attached to outer jamb)
        wb(halfW - 0.01, 0.030, fD * 0.9, panCx, sillH + 0.015, 0, alMat);
        wb(halfW - 0.01, 0.030, fD * 0.9, panCx, pH - headH - 0.015, 0, alMat);
        wb(0.030, innerH, fD * 0.9, panCx - halfW / 2 + 0.015, midY, 0, alMat); // outer jamb
        // Build this panel as an animatable group pivoting at its outer hinge edge
        const frPanel = new THREE.Group();
        frPanel.position.set(hingeEdgeX, 0, 0); // pivot at outer edge
        const addFr = (sx, sy, sz, px, py, pz, m) => {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
          mesh.position.set(px - hingeEdgeX, py, pz);
          mesh.castShadow = true; frPanel.add(mesh);
        };
        // Vertical outer rail
        wb(0.030, innerH, fD * 0.9, panCx - halfW / 2 + 0.015, midY, 0, alMat);
        // Glass panes (2 cols × 3 rows)
        const gCols = 2, gRows = 3;
        const gW = (halfW - 0.085) / gCols;
        const gH = (innerH - 0.085) / gRows;
        for (let gc = 0; gc < gCols; gc++) {
          for (let gr = 0; gr < gRows; gr++) {
            const gx = panCx - halfW / 2 + 0.055 + gW * (gc + 0.5);
            const gy = sillH + 0.040 + gH * (gr + 0.5);
            addFr(gW - 0.022, gH - 0.022, 0.010, gx, gy, 0, glassMat);
            if (gc < gCols - 1) addFr(0.022, gH - 0.022, fD * 0.85, panCx - halfW / 2 + 0.055 + gW * (gc + 1), gy, 0, alMat);
            if (gr < gRows - 1) addFr(gW - 0.022, 0.022, fD * 0.85, gx, sillH + 0.040 + gH * (gr + 1), 0, alMat);
          }
        }
        addFr(0.012, 0.10, 0.028, panCx + side * (halfW / 2 - 0.06), midY, -fD * 0.50, handleMat);
        addFr(0.030, 0.012, 0.028, panCx + side * (halfW / 2 - 0.06), midY + 0.05, -fD * 0.50, handleMat);
        // Swing outward when opened (left panel CCW, right panel CW)
        frPanel.userData._animType    = 'swing';
        frPanel.userData._animProp    = 'ry';
        frPanel.userData._animOpen    = false;
        frPanel.userData._closedState = 0;
        frPanel.userData._openState   = side * (-Math.PI * 0.72); // ~130° open
        winGroup.add(frPanel);
      });
      // Centre astragal (where panels meet)
      wb(0.040, innerH, fD, 0, midY, 0, frameMat);

    // ── FIXED / PICTURE WINDOW ───────────────────────────────
    } else if (lowerCls === 'fixed-window') {
      // Thin frame, no moving parts, single unbroken glass pane
      wb(winW, sillH * 0.8, fD, 0, sillH * 0.4, 0, frameMat);
      wb(winW, sillH * 0.8, fD, 0, pH - sillH * 0.4, 0, frameMat);
      wb(jW * 0.75, pH, fD, -winW / 2 + jW * 0.375, pH / 2, 0, frameMat);
      wb(jW * 0.75, pH, fD,  winW / 2 - jW * 0.375, pH / 2, 0, frameMat);
      // Single large glass pane — slightly reflective tint
      wb(innerW + jW * 0.5, innerH, 0.010, 0, midY, 0, glassTintMat);
      // Decorative sight-line (very thin centre cross for large windows)
      if (winW > 1.0) wb(0.018, innerH, fD * 0.6, 0, midY, 0, frameMat);
      if (pH > 1.0)   wb(innerW, 0.018, fD * 0.6, 0, midY, 0, frameMat);

    // ── LOUVERED WINDOW ──────────────────────────────────────
    } else if (lowerCls === 'louvered-window') {
      outerFrame();
      const slats = 7;
      const slotH = innerH / (slats + 1);
      for (let s = 0; s < slats; s++) {
        const sy = sillH + slotH * (s + 0.8);
        const slat = new THREE.Mesh(
          new THREE.BoxGeometry(innerW - 0.02, 0.022, fD * 0.75),
          glassMat
        );
        slat.rotation.x = 0; // closed = flat/horizontal
        slat.position.set(0, sy, 0);
        slat.castShadow = true;
        // Tag: open = tilted 55° to let air through
        slat.userData._animType    = 'louvre';
        slat.userData._animProp    = 'rx';
        slat.userData._animOpen    = false;
        slat.userData._closedState = 0;
        slat.userData._openState   = Math.PI * 0.30; // ~55°
        winGroup.add(slat);
        // Thin end frame on each slat
        wb(0.015, 0.022, fD * 0.75, -innerW / 2 + 0.01, sy, 0, alMat);
        wb(0.015, 0.022, fD * 0.75,  innerW / 2 - 0.01, sy, 0, alMat);
      }
      // Tilt control rod (thin vertical bar on right side)
      wb(0.010, innerH * 0.65, 0.010, winW / 2 - jW - 0.02, midY, -fD * 0.25, handleMat);
      // Pivot pin connector from rod to slats
      for (let s = 0; s < slats; s++) {
        wb(0.020, 0.010, 0.010, winW / 2 - jW - 0.022, sillH + slotH * (s + 0.8), -fD * 0.25, handleMat);
      }

    // ── ARCHED WINDOW ────────────────────────────────────────
    } else if (lowerCls === 'arched-window') {
      const archR = winW / 2;
      const rectH = Math.max(pH - archR, pH * 0.45); // rectangular section height
      // Outer frame — rectangular part
      wb(winW, sillH, fD, 0, sillH / 2, 0, frameMat);
      wb(jW, rectH, fD, -winW / 2 + jW / 2, rectH / 2, 0, frameMat);
      wb(jW, rectH, fD,  winW / 2 - jW / 2, rectH / 2, 0, frameMat);
      // Rectangular glass pane
      wb(innerW, rectH - sillH, 0.012, 0, sillH + (rectH - sillH) / 2, 0, glassMat);
      // Horizontal mid-mullion on rect section
      wb(innerW, 0.028, fD * 0.9, 0, rectH * 0.5, 0, frameMat);
      // Vertical mullion in rect section
      wb(0.028, rectH - sillH, fD * 0.9, 0, sillH + (rectH - sillH) / 2, 0, frameMat);
      // Arch section (semicircle approximated with segments)
      const archSegs = 10;
      for (let i = 0; i < archSegs; i++) {
        const a0 = (i / archSegs) * Math.PI;
        const a1 = ((i + 1) / archSegs) * Math.PI;
        const ax = (Math.cos(a0) + Math.cos(a1)) / 2 * (archR - jW / 2);
        const ay = rectH + (Math.sin(a0) + Math.sin(a1)) / 2 * archR;
        const aw = archR * Math.PI / archSegs;
        const angle = -(a0 + a1) / 2 + Math.PI / 2;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(aw * 1.05, jW, fD), frameMat);
        seg.position.set(ax, ay, 0);
        seg.rotation.z = angle;
        seg.castShadow = true;
        winGroup.add(seg);
      }
      // Arch glass (fan segments)
      for (let i = 0; i < archSegs; i++) {
        const a0 = (i / archSegs) * Math.PI;
        const a1 = ((i + 1) / archSegs) * Math.PI;
        const ax = (Math.cos(a0) + Math.cos(a1)) / 2 * (archR * 0.5);
        const ay = rectH + (Math.sin(a0) + Math.sin(a1)) / 2 * archR * 0.5;
        const aw = archR * Math.PI / archSegs * 0.80;
        const angle = -(a0 + a1) / 2 + Math.PI / 2;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(aw, archR * 0.45, 0.010), glassMat);
        seg.position.set(ax, ay, 0);
        seg.rotation.z = angle;
        winGroup.add(seg);
      }
      // Fan mullions radiating from keystone
      const fanCount = 5;
      for (let i = 0; i <= fanCount; i++) {
        const a = (i / fanCount) * Math.PI;
        const mx = Math.cos(a) * archR * 0.48;
        const my = rectH + Math.sin(a) * archR * 0.48;
        const fanAngle = -a + Math.PI / 2;
        const fanMul = new THREE.Mesh(new THREE.BoxGeometry(0.022, archR * 0.92, fD * 0.85), frameMat);
        fanMul.position.set(mx / 2, rectH + my / 2 - rectH / 2, 0);
        fanMul.rotation.z = fanAngle;
        winGroup.add(fanMul);
      }
      // Keystone at arch crown
      wb(0.055, 0.055, fD, 0, rectH + archR, 0, frameMat);

    // ── GENERIC FALLBACK ─────────────────────────────────────
    } else {
      outerFrame();
      wb(Math.max(innerW, 0.05), Math.max(innerH, 0.05), 0.012, 0, midY, 0, glassMat);
      if (winW > 0.8) {
        const count = winW > 1.4 ? 2 : 1;
        for (let i = 1; i <= count; i++) {
          const x = (-innerW / 2) + (i / (count + 1)) * innerW;
          wb(0.028, innerH, fD, x, midY, 0, frameMat);
        }
      }
      if (pH > 0.8) wb(Math.max(innerW, 0.05), 0.028, fD, 0, midY, 0, frameMat);
    }

    // Position against nearest wall
    if (wallHoriz) {
      winGroup.position.set(cx, sillBase, nearWall ? wallProjY : cy);
    } else {
      winGroup.rotation.y = -Math.PI / 2;
      winGroup.position.set(nearWall ? wallProjX : cx, sillBase, cy);
    }

    // Export wall-snap info for callers to build a correct straddling bbox
    winGroup.userData._wallHoriz = wallHoriz;
    winGroup.userData._snapX     = winGroup.position.x;
    winGroup.userData._snapZ     = winGroup.position.z;
    winGroup.userData._isWinDoor = true;
    winGroup.userData._placementX = winGroup.position.x;
    winGroup.userData._placementZ = winGroup.position.z;

    return winGroup;
  }

  // Non-door objects: realistic furniture
  const placement = furniturePlacement({ ...obj, class: lowerCls, walls });
  const fw = placement.width;
  const fd = placement.depth;
  const h = props.height ?? 1.0;
  const color = props.color ?? 0xffcc00;
  const opacity = props.opacity ?? 1.0;

  const detailed = (lowerCls===PHOTO_SOFA_CLASS?createPhotoSofa(obj.photoSofaSpec,fw,fd):null) || createSofaFactoryFurniture(lowerCls, fw, fd) || createTvUnit(lowerCls, fw, fd) || createPoojaUnit(lowerCls, fw, fd) || createReferenceFurniture(lowerCls, fw, fd, obj) || createWardrobe(lowerCls, fw, fd, obj) || createDetailedFurniture(lowerCls, fw, fd);
  const group = detailed || new THREE.Group();

  const mat = (c, rough, metal) => new THREE.MeshStandardMaterial({
    color: c ?? color, roughness: rough ?? 0.6, metalness: metal ?? 0.0,
    opacity, transparent: opacity < 1.0,
  });
  const addBox = (sx, sy, sz, px, py, pz, material) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Mesh(g, material);
    m.position.set(px, py, pz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Creates a hinged door panel that can be toggled open/closed.
  // The pivot is at the hinge edge; the panel extends along +x (hingeDir=1) or -x (hingeDir=-1).
  // swing = angle in radians when open (default Math.PI/2 = 90°)
  const addDoorPanel = (sx, sy, sz, pivotX, pivotY, pivotZ, material, hingeDir = 1, swing = Math.PI / 2) => {
    const pivot = new THREE.Group();
    pivot.position.set(pivotX, pivotY, pivotZ);
    pivot.userData.isFurnitureDoor = true;
    pivot.userData.doorOpen = false;
    // Positive Y rotation: +X → −Z (into cabinet). Negate so door opens outward (+Z = front).
    pivot.userData.doorSwing = -hingeDir * swing;
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Mesh(g, material);
    m.position.set(hingeDir * sx / 2, 0, 0);  // panel offset from hinge
    m.castShadow = true;
    pivot.add(m);
    group.add(pivot);
    return pivot;
  };

  // ── BED VARIANTS ──────────────────────────────────────────
  if (detailed) {
    // Detailed builders own their geometry and per-object materials.
  } else if (lowerCls === 'single-bed' || lowerCls === 'double-bed' ||
      lowerCls === 'queen-bed'  || lowerCls === 'king-bed') {
    const frameH = 0.28, mattH = 0.18, headH = 0.7;
    const accentColors = {
      'single-bed': 0x607d8b, 'double-bed': 0x8d6e63,
      'queen-bed': 0x7986cb, 'king-bed': 0x546e7a,
    };
    const headColors = {
      'single-bed': 0x2d1f14, 'double-bed': 0x3e2723,
      'queen-bed': 0x263238, 'king-bed': 0x1a237e,
    };
    const frameMat2 = mat(0x3e2723, 0.7, 0.0);
    const sheetMat2 = mat(0xfaf8f5, 0.9, 0.0);
    const pillowMat2 = mat(0xf0c8a8, 0.85, 0.0);
    const headMat2 = mat(headColors[lowerCls] || 0x2d1f14, 0.55, 0.05);
    const blanketMat2 = mat(accentColors[lowerCls] || 0x607d8b, 0.85, 0.0);
    addBox(fw, frameH, fd, 0, frameH / 2, 0, frameMat2);
    addBox(fw - 0.04, mattH, fd - 0.04, 0, frameH + mattH / 2, 0, sheetMat2);
    addBox(fw - 0.06, 0.07, fd * 0.32, 0, frameH + mattH + 0.035, fd / 2 - fd * 0.16, blanketMat2);
    addBox(fw, headH, 0.1, 0, headH / 2, -fd / 2 + 0.05, headMat2);
    addBox(fw, 0.35, 0.08, 0, 0.175, fd / 2 - 0.04, headMat2);
    if (lowerCls === 'single-bed') {
      addBox(fw * 0.55, 0.1, 0.3, 0, frameH + mattH + 0.05, -fd / 2 + 0.22, pillowMat2);
    } else {
      const pw = fw / 2 - 0.14;
      addBox(pw, 0.1, 0.3, -fw / 4, frameH + mattH + 0.05, -fd / 2 + 0.22, pillowMat2);
      addBox(pw, 0.1, 0.3,  fw / 4, frameH + mattH + 0.05, -fd / 2 + 0.22, pillowMat2);
    }
    if (lowerCls === 'king-bed') {
      const goldMat = mat(0xc8a84b, 0.3, 0.4);
      addBox(fw * 0.7, 0.04, 0.04, 0, headH * 0.6, -fd / 2 + 0.06, goldMat);
    }
  } else if (lowerCls === 'bunk-bed') {
    const bFrameH = 0.28, bMattH = 0.16, bRailH = 0.35;
    const bFrameMat = mat(0x4e342e, 0.65, 0.05);
    const bSheetBot = mat(0xd0e8f0, 0.9, 0.0);
    const bSheetTop = mat(0xf0d0d0, 0.9, 0.0);
    const bLadderMat = mat(0x3e2723, 0.6, 0.05);
    const bPostH = bFrameH * 2 + bMattH * 2 + bRailH + 0.2;
    const bpx = fw / 2 - 0.04, bpz = fd / 2 - 0.04;
    [[-bpx,-bpz],[bpx,-bpz],[-bpx,bpz],[bpx,bpz]].forEach(([x,z]) => {
      addBox(0.06, bPostH, 0.06, x, bPostH / 2, z, bFrameMat);
    });
    addBox(fw, bFrameH, fd, 0, bFrameH / 2, 0, bFrameMat);
    addBox(fw - 0.06, bMattH, fd - 0.06, 0, bFrameH + bMattH / 2, 0, bSheetBot);
    const bUpBase = bFrameH + bMattH + 0.42;
    addBox(fw, bFrameH, fd, 0, bUpBase + bFrameH / 2, 0, bFrameMat);
    addBox(fw - 0.06, bMattH, fd - 0.06, 0, bUpBase + bFrameH + bMattH / 2, 0, bSheetTop);
    addBox(fw, 0.02, 0.04, 0, bUpBase + bFrameH + bMattH + bRailH / 2, fd / 2 - 0.02, bFrameMat);
    addBox(fw, 0.02, 0.04, 0, bUpBase + bFrameH + bMattH + bRailH / 2, -fd / 2 + 0.02, bFrameMat);
    const blx = fw / 2 + 0.02;
    addBox(0.04, bPostH, 0.04, blx + 0.06, bPostH / 2, fd / 2 - 0.04, bLadderMat);
    addBox(0.04, bPostH, 0.04, blx + 0.18, bPostH / 2, fd / 2 - 0.04, bLadderMat);
    for (let r = 0; r < 4; r++) {
      addBox(0.16, 0.03, 0.04, blx + 0.12, 0.25 + r * 0.32, fd / 2 - 0.04, bLadderMat);
    }

  // ── CHAIR VARIANTS ────────────────────────────────────────
  } else if (lowerCls === 'office-chair') {
    const ocSeatH = 0.48, ocCushionT = 0.08, ocBackH = 0.52, ocArmH = 0.26;
    const ocBodyMat = mat(0x1a1a1a, 0.45, 0.2);
    const ocCushMat = mat(0x212121, 0.6, 0.05);
    const ocChromeMat = mat(0xd0d0d0, 0.15, 0.8);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const spokeLen = Math.min(fw, fd) * 0.45;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(spokeLen, 0.03, 0.04), ocChromeMat);
      spoke.position.set(Math.cos(angle) * spokeLen / 2, 0.03, Math.sin(angle) * spokeLen / 2);
      spoke.rotation.y = -angle;
      spoke.castShadow = true;
      group.add(spoke);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10), ocBodyMat);
      wheel.position.set(Math.cos(angle) * spokeLen, 0.04, Math.sin(angle) * spokeLen);
      group.add(wheel);
    }
    addBox(0.06, ocSeatH - 0.08, 0.06, 0, 0.08 + (ocSeatH - 0.08) / 2, 0, ocChromeMat);
    addBox(fw * 0.85, ocCushionT, fd * 0.85, 0, ocSeatH + ocCushionT / 2, 0, ocCushMat);
    addBox(fw * 0.72, ocBackH, 0.08, 0, ocSeatH + ocCushionT + ocBackH / 2, -fd * 0.38, ocCushMat);
    addBox(fw * 0.5, 0.12, 0.04, 0, ocSeatH + ocCushionT + 0.12, -fd * 0.38 - 0.05, ocBodyMat);
    addBox(0.06, ocArmH, fd * 0.55, -fw * 0.4, ocSeatH + ocArmH / 2, 0, ocBodyMat);
    addBox(0.06, ocArmH, fd * 0.55,  fw * 0.4, ocSeatH + ocArmH / 2, 0, ocBodyMat);
    addBox(fw * 0.14, 0.04, fd * 0.35, -fw * 0.4, ocSeatH + ocArmH, 0, ocCushMat);
    addBox(fw * 0.14, 0.04, fd * 0.35,  fw * 0.4, ocSeatH + ocArmH, 0, ocCushMat);

  } else if (lowerCls === 'bar-stool') {
    const bsLegH = 0.72, bsSeatY = 0.72 + 0.06, bsFootH = 0.38;
    const bsWoodMat = mat(0x5c4033, 0.55, 0.0);
    const bsSeatMat = mat(0xc9b9a8, 0.75, 0.0);
    const bslx = fw / 2 - 0.04, bslz = fd / 2 - 0.04;
    [[-bslx,-bslz],[bslx,-bslz],[-bslx,bslz],[bslx,bslz]].forEach(([x,z]) => {
      addBox(0.04, bsLegH, 0.04, x, bsLegH / 2, z, bsWoodMat);
    });
    addBox(fw - 0.08, 0.03, 0.03, 0, bsFootH, -fd / 2 + 0.04, bsWoodMat);
    addBox(fw - 0.08, 0.03, 0.03, 0, bsFootH,  fd / 2 - 0.04, bsWoodMat);
    addBox(0.03, 0.03, fd - 0.08, -fw / 2 + 0.04, bsFootH, 0, bsWoodMat);
    addBox(0.03, 0.03, fd - 0.08,  fw / 2 - 0.04, bsFootH, 0, bsWoodMat);
    const bsSeat = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.min(fw,fd)*0.42, Math.min(fw,fd)*0.42, 0.08, 20),
      bsSeatMat
    );
    bsSeat.position.set(0, bsSeatY, 0);
    bsSeat.castShadow = true;
    group.add(bsSeat);
    addBox(fw * 0.55, 0.04, 0.04, 0, bsSeatY + 0.28, -fd / 2 + 0.04, bsWoodMat);

  } else if (lowerCls === 'armchair') {
    const acBaseH = 0.42, acSeatT = 0.1, acBackH = 0.46, acArmH = 0.28, acLegH = 0.16;
    const acFabricMat = mat(0xb8a898, 0.82, 0.0);
    const acInnerMat = mat(0xc8b8a8, 0.88, 0.0);
    const acLegMat = mat(0x4a3010, 0.5, 0.02);
    const aclx = fw / 2 - 0.08, aclz = fd / 2 - 0.08;
    [[-aclx,-aclz],[aclx,-aclz],[-aclx,aclz],[aclx,aclz]].forEach(([x,z]) => {
      addBox(0.07, acLegH, 0.07, x, acLegH / 2, z, acLegMat);
    });
    addBox(fw, acBaseH, fd, 0, acLegH + acBaseH / 2, 0, acInnerMat);
    addBox(fw - 0.08, acSeatT, fd - 0.06, 0, acLegH + acBaseH + acSeatT / 2, 0, acFabricMat);
    addBox(fw, acBackH, 0.18, 0, acLegH + acBaseH + acBackH / 2, -fd / 2 + 0.09, acFabricMat);
    addBox(0.18, acArmH, fd, -fw / 2 + 0.09, acLegH + acBaseH + acArmH / 2, 0, acFabricMat);
    addBox(0.18, acArmH, fd,  fw / 2 - 0.09, acLegH + acBaseH + acArmH / 2, 0, acFabricMat);

  } else if (lowerCls === 'lounge-chair') {
    const lcLegH = 0.12, lcSeatT = 0.12;
    const lcLegMat = mat(0xc0a878, 0.3, 0.4);
    const lcFabricMat = mat(0x8b7355, 0.78, 0.0);
    const lcCushionMat = mat(0x9b8365, 0.82, 0.0);
    const lclx = fw / 2 - 0.06, lclz = fd / 2 - 0.1;
    [[-lclx,-lclz],[lclx,-lclz],[-lclx,lclz],[lclx,lclz]].forEach(([x,z]) => {
      addBox(0.04, lcLegH, 0.04, x, lcLegH / 2, z, lcLegMat);
    });
    addBox(fw, lcSeatT, fd, 0, lcLegH + lcSeatT / 2, 0, lcCushionMat);
    const lcBackH = 0.55, lcBackAngle = Math.PI / 8;
    const lcBackGroup = new THREE.Group();
    const lcBackMesh = new THREE.Mesh(new THREE.BoxGeometry(fw, lcBackH, 0.12), lcFabricMat.clone());
    lcBackMesh.position.set(0, lcBackH / 2, 0);
    lcBackMesh.castShadow = true;
    lcBackGroup.add(lcBackMesh);
    lcBackGroup.rotation.x = -lcBackAngle;
    lcBackGroup.position.set(0, lcLegH + lcSeatT, -fd / 2 + 0.06 + Math.sin(lcBackAngle) * lcBackH / 2);
    group.add(lcBackGroup);
    addBox(0.1, 0.18, fd, -fw / 2 + 0.05, lcLegH + lcSeatT + 0.09, 0, lcFabricMat);
    addBox(0.1, 0.18, fd,  fw / 2 - 0.05, lcLegH + lcSeatT + 0.09, 0, lcFabricMat);

  } else if (lowerCls === 'dining-chair') {
    const dcLegH = 0.45, dcSeatT = 0.05, dcBackH = 0.48;
    const dcWoodMat = mat(0x4e342e, 0.5, 0.02);
    const dcSeatMat = mat(0xd4a574, 0.8, 0.0);
    const dclx = fw / 2 - 0.04, dclz = fd / 2 - 0.04;
    [[-dclx,-dclz],[dclx,-dclz],[-dclx,dclz],[dclx,dclz]].forEach(([x,z]) => {
      addBox(0.04, dcLegH, 0.04, x, dcLegH / 2, z, dcWoodMat);
    });
    addBox(fw - 0.04, dcSeatT, fd - 0.04, 0, dcLegH + dcSeatT / 2, 0, dcSeatMat);
    addBox(fw - 0.06, 0.06, 0.04, 0, dcLegH + dcSeatT + dcBackH - 0.03, -fd / 2 + 0.02, dcWoodMat);
    for (let s = -1; s <= 1; s++) {
      addBox(0.025, dcBackH - 0.06, 0.025, s * (fw / 2 - 0.1), dcLegH + dcSeatT + (dcBackH - 0.06) / 2, -fd / 2 + 0.02, dcWoodMat);
    }

  // ── SOFA VARIANTS ─────────────────────────────────────────
  } else if (lowerCls === 'sofa-2' || lowerCls === 'sofa-3') {
    const svSeats = lowerCls === 'sofa-2' ? 2 : 3;
    const svBaseH = 0.38, svBackH = 0.34, svArmH = 0.24;
    const svCushionW = (fw - 0.28) / svSeats;
    const svFabricMat = mat(lowerCls === 'sofa-2' ? 0xc9b9a8 : 0xb8a898, 0.85, 0.0);
    const svCushMat   = mat(lowerCls === 'sofa-2' ? 0xd4c4b0 : 0xc8b8a4, 0.88, 0.0);
    const svLegMat    = mat(0x3e2723, 0.5, 0.02);
    const svlx = fw / 2 - 0.06, svlz = fd / 2 - 0.06;
    [[-svlx,-svlz],[svlx,-svlz],[-svlx,svlz],[svlx,svlz]].forEach(([x,z]) => {
      addBox(0.05, 0.12, 0.05, x, 0.06, z, svLegMat);
    });
    addBox(fw, svBaseH, fd, 0, 0.12 + svBaseH / 2, 0, svFabricMat);
    addBox(fw, svBackH, 0.15, 0, 0.12 + svBaseH + svBackH / 2, -fd / 2 + 0.075, svFabricMat);
    addBox(0.14, svArmH, fd, -fw / 2 + 0.07, 0.12 + svBaseH + svArmH / 2, 0, svFabricMat);
    addBox(0.14, svArmH, fd,  fw / 2 - 0.07, 0.12 + svBaseH + svArmH / 2, 0, svFabricMat);
    for (let s = 0; s < svSeats; s++) {
      const cx2 = -fw / 2 + 0.14 + svCushionW / 2 + s * svCushionW;
      addBox(svCushionW - 0.03, 0.12, fd - 0.16, cx2, 0.12 + svBaseH + 0.06, 0.04, svCushMat);
    }

  } else if (lowerCls === 'loveseat') {
    const lsBaseH = 0.36, lsBackH = 0.3, lsArmH = 0.22;
    const lsFabricMat = mat(0xd4c4b0, 0.85, 0.0);
    const lsLegMat    = mat(0x3e2723, 0.5, 0.02);
    const lslx = fw / 2 - 0.05, lslz = fd / 2 - 0.05;
    [[-lslx,-lslz],[lslx,-lslz],[-lslx,lslz],[lslx,lslz]].forEach(([x,z]) => {
      addBox(0.05, 0.1, 0.05, x, 0.05, z, lsLegMat);
    });
    addBox(fw, lsBaseH, fd, 0, 0.1 + lsBaseH / 2, 0, lsFabricMat);
    addBox(fw, lsBackH, 0.12, 0, 0.1 + lsBaseH + lsBackH / 2, -fd / 2 + 0.06, lsFabricMat);
    addBox(0.12, lsArmH, fd, -fw / 2 + 0.06, 0.1 + lsBaseH + lsArmH / 2, 0, lsFabricMat);
    addBox(0.12, lsArmH, fd,  fw / 2 - 0.06, 0.1 + lsBaseH + lsArmH / 2, 0, lsFabricMat);
    addBox(fw * 0.38, 0.15, 0.08, -fw * 0.15, 0.1 + lsBaseH + lsBackH * 0.6, -fd / 2 + 0.05, mat(0xc8b0a0, 0.85, 0.0));
    addBox(fw * 0.38, 0.15, 0.08,  fw * 0.15, 0.1 + lsBaseH + lsBackH * 0.6, -fd / 2 + 0.05, mat(0xc8b0a0, 0.85, 0.0));

  } else if (lowerCls === 'l-sofa') {
    const lsfBaseH = 0.40, lsfBackH = 0.35, lsfArmH = 0.26;
    const lsfFabricMat = mat(0xb0a090, 0.85, 0.0);
    const lsfLegMat    = mat(0x3e2723, 0.5, 0.02);
    addBox(fw, lsfBaseH, fd * 0.55, 0, lsfBaseH / 2, fd * 0.225, lsfFabricMat);
    addBox(fw, lsfBackH, 0.12, 0, lsfBaseH + lsfBackH / 2, fd * 0.5 - 0.06, lsfFabricMat);
    addBox(fw * 0.45, lsfBaseH, fd * 0.45, -fw * 0.275, lsfBaseH / 2, -fd * 0.225, lsfFabricMat);
    addBox(0.12, lsfBackH, fd * 0.45, -fw * 0.48 + 0.06, lsfBaseH + lsfBackH / 2, -fd * 0.225, lsfFabricMat);
    addBox(fw * 0.45, lsfBaseH, fd * 0.55, -fw * 0.275, lsfBaseH / 2, fd * 0.225, lsfFabricMat);
    addBox(0.12, lsfArmH, fd * 0.55, fw / 2 - 0.06, lsfBaseH + lsfArmH / 2, fd * 0.225, lsfFabricMat);
    for (let s = 0; s < 3; s++) {
      addBox(fw / 3 - 0.04, 0.1, fd * 0.45, -fw / 3 + s * fw / 3, lsfBaseH + 0.05, fd * 0.225 + 0.04, mat(0xc0b0a0, 0.88, 0.0));
    }
    [[-fw/2+0.06,-fd/2+0.04],[fw/2-0.06,-fd/2+0.04],[fw/2-0.06,fd/2-0.04],[-fw/2+0.06,fd/2-0.04]].forEach(([x,z]) => {
      addBox(0.06, 0.1, 0.06, x, 0.05, z, lsfLegMat);
    });

  // ── TABLE VARIANTS ────────────────────────────────────────
  } else if (lowerCls === 'round-table') {
    const rtTopH = 0.06, rtLegH = h - 0.06;
    const rtTopR = Math.min(fw, fd) / 2;
    const rtWoodMat = mat(0x6b4226, 0.5, 0.0);
    const rtLegMat  = mat(0x5c3a18, 0.55, 0.02);
    const rtTop = new THREE.Mesh(new THREE.CylinderGeometry(rtTopR, rtTopR, rtTopH, 32), rtWoodMat);
    rtTop.position.set(0, rtLegH + rtTopH / 2, 0);
    rtTop.castShadow = true; rtTop.receiveShadow = true;
    group.add(rtTop);
    const rtPed = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, rtLegH * 0.7, 16), rtLegMat);
    rtPed.position.set(0, rtLegH * 0.35, 0);
    rtPed.castShadow = true;
    group.add(rtPed);
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const rtBl = new THREE.Mesh(new THREE.BoxGeometry(0.06, rtLegH * 0.3, 0.04), rtLegMat);
      rtBl.position.set(Math.cos(angle) * rtTopR * 0.5, rtLegH * 0.15, Math.sin(angle) * rtTopR * 0.5);
      rtBl.rotation.y = -angle;
      rtBl.rotation.z = Math.PI / 10;
      rtBl.castShadow = true;
      group.add(rtBl);
    }

  } else if (lowerCls === 'console-table') {
    const ctTopH = 0.04, ctLegH = h - 0.04;
    const ctWoodMat = mat(0x4a3728, 0.5, 0.0);
    const ctMetalMat = mat(0x808080, 0.2, 0.7);
    addBox(fw, ctTopH, fd, 0, ctLegH + ctTopH / 2, 0, ctWoodMat);
    const ctlx = fw / 2 - 0.04, ctlz = fd / 2 - 0.04;
    [[-ctlx,-ctlz],[ctlx,-ctlz],[-ctlx,ctlz],[ctlx,ctlz]].forEach(([x,z]) => {
      addBox(0.025, ctLegH, 0.025, x, ctLegH / 2, z, ctMetalMat);
    });
    addBox(fw - 0.1, 0.025, fd - 0.04, 0, ctLegH * 0.35, 0, ctWoodMat);

  // ── STORAGE VARIANTS ──────────────────────────────────────
  } else if (lowerCls === 'tv-unit') {
    const tvuBodyMat = mat(0x1e1a18, 0.5, 0.05);
    const tvuDoorMat = mat(0x2a2420, 0.45, 0.05);
    const tvuLegMat  = mat(0xb8860b, 0.25, 0.6);
    const tvuHandleMat = mat(0xc0c0c0, 0.15, 0.8);
    const tvulx = fw / 2 - 0.05, tvulz = fd / 2 - 0.04;
    [[-tvulx,-tvulz],[tvulx,-tvulz],[-tvulx,tvulz],[tvulx,tvulz]].forEach(([x,z]) => {
      addBox(0.04, 0.12, 0.04, x, 0.06, z, tvuLegMat);
    });
    addBox(fw, h, fd, 0, 0.12 + h / 2, 0, tvuBodyMat);
    for (let d2 = 0; d2 < 3; d2++) {
      const dx2 = -fw / 2 + fw / 6 + (d2 * fw / 3);
      addBox(fw / 3 - 0.03, h - 0.06, 0.02, dx2, 0.12 + h / 2, fd / 2 + 0.01, tvuDoorMat);
      addBox(0.02, 0.08, 0.03, dx2, 0.12 + h * 0.5, fd / 2 + 0.03, tvuHandleMat);
    }
    addBox(fw * 0.3, 0.03, 0.04, 0, 0.12 + h + 0.015, -fd / 2 + 0.02, mat(0x0a0a0a, 0.4, 0.1));

  } else if (lowerCls === 'shoe-rack') {
    const srShelfMat = mat(0x6b5040, 0.55, 0.0);
    const srFrameMat = mat(0x4a3728, 0.6, 0.0);
    const srShelves = 4;
    const srShelfH = (h - 0.04) / srShelves;
    addBox(0.02, h, fd, -fw / 2 + 0.01, h / 2, 0, srFrameMat);
    addBox(0.02, h, fd,  fw / 2 - 0.01, h / 2, 0, srFrameMat);
    for (let s = 0; s < srShelves; s++) {
      addBox(fw - 0.04, 0.02, fd, 0, 0.02 + s * srShelfH + 0.01, 0, srShelfMat);
      addBox(fw - 0.04, 0.06, 0.02, 0, 0.02 + s * srShelfH + 0.04, fd / 2 - 0.01, srFrameMat);
    }

  } else if (lowerCls === 'bean-bag') {
    const bbBagMat = mat(0xe07060, 0.9, 0.0);
    const bbBaseMat = mat(0xc05040, 0.85, 0.0);
    const bbSphere = new THREE.Mesh(new THREE.SphereGeometry(Math.min(fw, fd) * 0.44, 20, 16), bbBagMat);
    bbSphere.scale.y = 0.75;
    bbSphere.position.set(0, Math.min(fw, fd) * 0.33, 0);
    bbSphere.castShadow = true; bbSphere.receiveShadow = true;
    group.add(bbSphere);
    addBox(Math.min(fw, fd) * 0.05, Math.min(fw, fd) * 0.55, 0.02, 0, Math.min(fw, fd) * 0.28, Math.min(fw, fd) * 0.42, bbBaseMat);

  } else if (lowerCls === 'bathtub') {
    const btRimMat = mat(0xfaf8f5, 0.25, 0.2);
    const btInnerMat = mat(0xf0ede8, 0.2, 0.15);
    const btChromeMat = mat(0xe0e0e0, 0.1, 0.85);
    const btWallT = 0.06, btRimH = 0.08;
    const btInnerD = fd - btWallT * 2;
    const btInnerW = fw - btWallT * 2;
    const btTubH = h;
    addBox(fw, btTubH, fd, 0, btTubH / 2, 0, btRimMat);
    addBox(btInnerW, btTubH - btRimH - 0.04, btInnerD, 0, btRimH + (btTubH - btRimH - 0.04) / 2, 0, btInnerMat);
    addBox(fw, btRimH, fd, 0, btTubH - btRimH / 2, 0, btRimMat);
    addBox(0.04, 0.15, 0.04, fw * 0.25, btTubH + 0.08, -fd / 2 + 0.03, btChromeMat);
    addBox(0.04, 0.15, 0.04, -fw * 0.25, btTubH + 0.08, -fd / 2 + 0.03, btChromeMat);
    const btSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 10), btChromeMat);
    btSpout.rotation.x = -Math.PI / 4;
    btSpout.position.set(0, btTubH + 0.14, -fd / 2 + 0.06);
    btSpout.castShadow = true;
    group.add(btSpout);
    const btDrain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 12), btChromeMat);
    btDrain.position.set(0, btRimH + 0.005, btInnerD * 0.3);
    group.add(btDrain);

  // ── LOFT BED ──────────────────────────────────────────────
  } else if (lowerCls === 'loft-bed') {
    const lbPostH = 1.85, lbFrameH = 0.18, lbMattH = 0.14, lbRailH = 0.3;
    const lbFrameMat = mat(0x4e342e, 0.65, 0.05);
    const lbMattMat  = mat(0xd0e8f0, 0.9, 0.0);
    const lbDeskMat  = mat(0x6b5040, 0.55, 0.0);
    const lbLadderMat = mat(0x3e2723, 0.6, 0.05);
    const lbMetalMat = mat(0xd0d0d0, 0.2, 0.7);
    // 4 tall corner posts
    const lbpx = fw / 2 - 0.05, lbpz = fd / 2 - 0.05;
    [[-lbpx,-lbpz],[lbpx,-lbpz],[-lbpx,lbpz],[lbpx,lbpz]].forEach(([x,z]) => {
      addBox(0.07, lbPostH, 0.07, x, lbPostH / 2, z, lbFrameMat);
    });
    // Elevated bed platform
    const lbPlatY = lbPostH - lbFrameH - lbMattH;
    addBox(fw, lbFrameH, fd, 0, lbPlatY + lbFrameH / 2, 0, lbFrameMat);
    addBox(fw - 0.06, lbMattH, fd - 0.06, 0, lbPlatY + lbFrameH + lbMattH / 2, 0, lbMattMat);
    // Safety rails on 3 sides of upper bunk
    addBox(fw, 0.02, 0.04, 0, lbPlatY + lbFrameH + lbMattH + lbRailH / 2, fd / 2 - 0.02, lbFrameMat);
    addBox(fw, 0.02, 0.04, 0, lbPlatY + lbFrameH + lbMattH + lbRailH / 2, -fd / 2 + 0.02, lbFrameMat);
    addBox(0.04, 0.02, fd, -fw / 2 + 0.02, lbPlatY + lbFrameH + lbMattH + lbRailH / 2, 0, lbFrameMat);
    // Pillow
    addBox(fw * 0.5, 0.09, 0.28, 0, lbPlatY + lbFrameH + lbMattH + 0.05, -fd / 2 + 0.22, mat(0xf0c8a8, 0.85, 0.0));
    // Ladder (right side, front-to-back)
    const lblx = fw / 2 + 0.01;
    addBox(0.04, lbPostH, 0.04, lblx + 0.06, lbPostH / 2, fd / 2 - 0.04, lbLadderMat);
    addBox(0.04, lbPostH, 0.04, lblx + 0.18, lbPostH / 2, fd / 2 - 0.04, lbLadderMat);
    for (let r = 0; r < 5; r++) {
      addBox(0.16, 0.025, 0.04, lblx + 0.12, 0.22 + r * 0.34, fd / 2 - 0.04, lbLadderMat);
    }
    // Desk surface under the loft (at ~0.75m height)
    addBox(fw - 0.1, 0.03, fd * 0.6, 0, 0.75, -fd * 0.2, lbDeskMat);
    // Desk legs
    const dlx = fw / 2 - 0.1, dlz = fd * 0.1;
    [[-dlx,-dlz],[dlx,-dlz]].forEach(([x,z]) => {
      addBox(0.04, 0.75, 0.04, x, 0.375, z, lbFrameMat);
    });
    // Small monitor hint on desk
    addBox(fw * 0.4, 0.22, 0.025, 0, 0.75 + 0.11, -fd * 0.44, mat(0x1a1a1a, 0.2, 0.1));

  // ── MODULAR KITCHEN ───────────────────────────────────────
  } else if (lowerCls === PULLOUT_SLAB_ID) {
    const count=Math.max(1,Math.min(12,Math.round(obj.kitchenSectionCount||obj.kitchen?.sectionSizes?.length||3)));
    const saved=obj.kitchen?.sectionSizes;
    const sizes=saved||Array.from({length:count},()=>({width:fw/count,height:obj.objectHeightM||h,depth:fd}));
    registerKitchen(group,buildSectionGeometry(group,fitSectionSizes(fw,obj.objectHeightM||h,fd,sizes)));
  } else if (lowerCls === EDITABLE_CABINET_ID) {
    const saved=obj.kitchen?.sectionSizes?.[0];
    registerKitchen(group,buildSectionGeometry(group,[saved||{width:fw,height:obj.objectHeightM||h,depth:fd}]));
  } else if (lowerCls === 'kitchen-base-cabinet') {
    // Blue/coloured lower cabinet with granite countertop + panel doors
    const kbcBodyMat   = mat(0x5b8dba, 0.55, 0.05);   // blue body
    const kbcCounterMat= mat(0x4a4a4a, 0.25, 0.15);   // dark granite top
    const kbcDoorMat   = mat(0x4e7fa8, 0.5, 0.05);    // slightly darker door
    const kbcHandleMat = mat(0xe0e0e0, 0.15, 0.8);
    const kbcTrimMat   = mat(0x1a1a1a, 0.4, 0.1);     // black trim edging
    const kbcBaseH = h - 0.05;
    // Toe-kick recess at bottom
    addBox(fw, 0.1, fd - 0.06, 0, 0.05, 0.03, mat(0x1a1a1a, 0.5, 0.0));
    // Cabinet body
    const kitchenBody = addBox(fw, kbcBaseH - 0.1, fd, 0, 0.1 + (kbcBaseH - 0.1) / 2, 0, kbcBodyMat);
    // Granite countertop (overhangs 2cm on front)
    const kitchenCounter = addBox(fw + 0.02, 0.05, fd + 0.02, 0, kbcBaseH - 0.025, 0.01, kbcCounterMat);
    // Black trim edge on counter front
    addBox(fw + 0.02, 0.05, 0.02, 0, kbcBaseH - 0.025, fd / 2 + 0.02, kbcTrimMat);
    // Panel doors — hinged, openable
    const kbcDH = kbcBaseH - 0.1 - 0.06;
    const kbcDW = fw / 2 - 0.03;
    const kbcLd = addDoorPanel(kbcDW, kbcDH, 0.02, -fw / 2 + 0.03, 0.13 + kbcDH / 2, fd / 2 + 0.01, kbcDoorMat, 1);
    const kbcRd = addDoorPanel(kbcDW, kbcDH, 0.02,  fw / 2 - 0.03, 0.13 + kbcDH / 2, fd / 2 + 0.01, kbcDoorMat, -1);
    // Handles on door panels
    const kbcHL = new THREE.Mesh(new THREE.BoxGeometry(kbcDW * 0.55, 0.025, 0.03), kbcHandleMat);
    kbcHL.position.set(kbcDW * 0.65, kbcDH * 0.35, 0.03); kbcLd.add(kbcHL);
    const kbcHR = new THREE.Mesh(new THREE.BoxGeometry(kbcDW * 0.55, 0.025, 0.03), kbcHandleMat);
    kbcHR.position.set(-kbcDW * 0.65, kbcDH * 0.35, 0.03); kbcRd.add(kbcHR);
    registerKitchen(group,{body:kitchenBody,counter:kitchenCounter,fronts:[kbcLd,kbcRd],width:fw,depth:fd});

  } else if (lowerCls === 'kitchen-upper-cabinet') {
    // Wall-mounted upper cabinet at 1.65m–2.3m height (matching photo)
    const kucMountY = 1.65;
    const kucH = h;
    const kucBodyMat  = mat(0x5b8dba, 0.5, 0.05);
    const kucDoorMat  = mat(0x4e7fa8, 0.45, 0.05);
    const kucGlassMat = new THREE.MeshStandardMaterial({
      color: 0x88ccee, roughness: 0.05, metalness: 0.1,
      transparent: true, opacity: 0.22, depthWrite: false,
    });
    const kucHandleMat = mat(0xe0e0e0, 0.15, 0.8);
    const kucTrimMat   = mat(0x1a1a1a, 0.35, 0.1);
    // Back wall plate
    addBox(fw, kucH, 0.02, 0, kucMountY + kucH / 2, -fd / 2 + 0.01, mat(0xd0d0d0, 0.5, 0.0));
    // Cabinet body
    addBox(fw, kucH, fd, 0, kucMountY + kucH / 2, 0, kucBodyMat);
    // Black trim top/bottom edges
    addBox(fw, 0.02, fd, 0, kucMountY + 0.01, 0, kucTrimMat);
    addBox(fw, 0.02, fd, 0, kucMountY + kucH - 0.01, 0, kucTrimMat);
    // Two hinged doors with glass centre panels
    const kucDH = kucH - 0.04;
    const kucDW = fw / 2 - 0.025;
    const kucLeft = addDoorPanel(kucDW, kucDH, 0.018, -fw / 2 + 0.025, kucMountY + kucH / 2, fd / 2 + 0.009, kucDoorMat, 1);
    const kucRight = addDoorPanel(kucDW, kucDH, 0.018, fw / 2 - 0.025, kucMountY + kucH / 2, fd / 2 + 0.009, kucDoorMat, -1);
    // Glass inserts in upper portion of doors
    const kucGlassH = kucDH * 0.45;
    const kucGlass1 = new THREE.Mesh(new THREE.BoxGeometry(fw / 2 - 0.1, kucGlassH, 0.006), kucGlassMat);
    kucGlass1.position.set(kucDW / 2, kucH * 0.2, 0.013); kucLeft.add(kucGlass1);
    const kucGlass2 = new THREE.Mesh(new THREE.BoxGeometry(fw / 2 - 0.1, kucGlassH, 0.006), kucGlassMat);
    kucGlass2.position.set(-kucDW / 2, kucH * 0.2, 0.013); kucRight.add(kucGlass2);
    // Slim handles
    const kucHandleL = new THREE.Mesh(new THREE.BoxGeometry(fw * 0.25, 0.02, 0.03), kucHandleMat);
    kucHandleL.position.set(kucDW * 0.66, -kucH * 0.32, 0.028); kucLeft.add(kucHandleL);
    const kucHandleR = new THREE.Mesh(new THREE.BoxGeometry(fw * 0.25, 0.02, 0.03), kucHandleMat);
    kucHandleR.position.set(-kucDW * 0.66, -kucH * 0.32, 0.028); kucRight.add(kucHandleR);

  } else if (lowerCls === 'overhead-cabinet') {
    // Tall loft/overhead cabinet near ceiling (white, minimal)
    const ohMountY = 2.35;
    const ohH = h;
    const ohBodyMat   = mat(0xf5f5f5, 0.45, 0.0);
    const ohDoorMat   = mat(0xededed, 0.4, 0.0);
    const ohHandleMat = mat(0xb0b0b0, 0.2, 0.7);
    addBox(fw, ohH, 0.02, 0, ohMountY + ohH / 2, -fd / 2 + 0.01, mat(0xd0d0d0, 0.5, 0.0));
    addBox(fw, ohH, fd, 0, ohMountY + ohH / 2, 0, ohBodyMat);
    const ohDH = ohH - 0.04;
    const ohDW = fw / 2 - 0.025;
    const ohLeft = addDoorPanel(ohDW, ohDH, 0.018, -fw / 2 + 0.025, ohMountY + ohH / 2, fd / 2 + 0.009, ohDoorMat, 1);
    const ohRight = addDoorPanel(ohDW, ohDH, 0.018, fw / 2 - 0.025, ohMountY + ohH / 2, fd / 2 + 0.009, ohDoorMat, -1);
    const ohHandleL = new THREE.Mesh(new THREE.BoxGeometry(fw * 0.25, 0.018, 0.028), ohHandleMat);
    ohHandleL.position.set(ohDW * 0.66, -ohH * 0.15, 0.025); ohLeft.add(ohHandleL);
    const ohHandleR = new THREE.Mesh(new THREE.BoxGeometry(fw * 0.25, 0.018, 0.028), ohHandleMat);
    ohHandleR.position.set(-ohDW * 0.66, -ohH * 0.15, 0.025); ohRight.add(ohHandleR);

  } else if (lowerCls === 'loft-wall-cabinet') {
    // Two-tone combined loft+lower wall cabinet (as per reference photo):
    // TOP: large dark walnut section near ceiling — 6 flush push-to-open doors, no handles
    // BOTTOM: white/gloss lower section — 4 doors with slim chrome bar handles
    // Thin white divider strip between the two sections

    // ── Dimensions ─────────────────────────────────────────
    const loftH   = 0.72;   // top loft section height (walnut)
    const lowerH  = 0.52;   // bottom cabinet section height (white)
    const divH    = 0.04;   // white divider strip between sections
    const totalH  = loftH + divH + lowerH;
    const loftY   = 2.85 - loftH;          // top section sits just below 2.85m ceiling
    const divY    = loftY - divH;
    const lowerY  = divY - lowerH;
    const cabD    = Math.max(fd, 0.55);    // cabinet depth

    // ── Materials ───────────────────────────────────────────
    const walnutMat  = mat(0x5c3a1e, 0.5, 0.02);    // dark walnut body
    const walnutDoor = mat(0x6b4226, 0.42, 0.03);   // walnut door fronts (slightly lighter)
    const walnutVein = mat(0x3e2510, 0.55, 0.01);   // wood grain accent lines
    const whiteMat   = mat(0xf8f8f8, 0.12, 0.05);   // white gloss body
    const whiteDoor  = mat(0xffffff, 0.08, 0.06);   // white gloss door fronts
    const divMat     = mat(0xf0f0f0, 0.2, 0.1);     // white divider strip
    const chromeMat  = mat(0xd8d8d8, 0.1, 0.85);    // chrome handles
    const edgeMat    = mat(0x1a1a1a, 0.35, 0.1);    // black edge banding

    // Wall anchor (full height)
    addBox(fw + 0.02, totalH + 0.02, 0.012, 0, lowerY + totalH / 2, -cabD / 2 + 0.006, mat(0xcccccc, 0.5, 0.0));

    // ── TOP LOFT SECTION (dark walnut, 6 doors) ─────────────
    addBox(fw, loftH, cabD, 0, loftY + loftH / 2, 0, walnutMat);
    // Black edge banding top/bottom/sides
    addBox(fw, 0.015, cabD, 0, loftY + loftH - 0.007, 0, edgeMat);
    addBox(fw, 0.015, cabD, 0, loftY + 0.007, 0, edgeMat);
    addBox(0.015, loftH, cabD, -fw / 2 + 0.007, loftY + loftH / 2, 0, edgeMat);
    addBox(0.015, loftH, cabD,  fw / 2 - 0.007, loftY + loftH / 2, 0, edgeMat);

    // 6 equal flush doors (push-to-open, hinged at left/right edges alternating)
    const loftDoorW = (fw - 0.015 * 7) / 6;
    for (let d3 = 0; d3 < 6; d3++) {
      const hingeDir3 = d3 % 2 === 0 ? 1 : -1;  // alternate hinge sides
      const hingeX3 = d3 % 2 === 0
        ? -fw / 2 + 0.015 + d3 * (loftDoorW + 0.015)           // left-hinged
        : -fw / 2 + 0.015 + (d3 + 1) * (loftDoorW + 0.015);   // right-hinged
      const loftDP = addDoorPanel(loftDoorW, loftH - 0.03, 0.018, hingeX3, loftY + loftH / 2, cabD / 2 + 0.009, walnutDoor, hingeDir3, Math.PI / 2);
      // Wood grain lines on the door panel child
      const loftDPMesh = loftDP.children[0];
      const vl1 = new THREE.Mesh(new THREE.BoxGeometry(0.003, loftH * 0.7, 0.002), walnutVein);
      vl1.position.set(hingeDir3 * loftDoorW * (-0.25), 0, 0.01); loftDP.add(vl1);
      const vl2 = new THREE.Mesh(new THREE.BoxGeometry(0.003, loftH * 0.7, 0.002), walnutVein);
      vl2.position.set(hingeDir3 * loftDoorW * 0.25, 0, 0.01); loftDP.add(vl2);
      // Vertical dividers between doors
      if (d3 < 5) {
        addBox(0.015, loftH, cabD, -fw / 2 + 0.015 + (d3 + 1) * (loftDoorW + 0.015) - 0.0075, loftY + loftH / 2, 0, edgeMat);
      }
    }

    // ── WHITE DIVIDER STRIP ─────────────────────────────────
    addBox(fw, divH, cabD, 0, divY + divH / 2, 0, divMat);

    // ── BOTTOM LOWER SECTION (white gloss, 4 hinged doors) ──
    addBox(fw, lowerH, cabD, 0, lowerY + lowerH / 2, 0, whiteMat);
    addBox(fw, 0.012, cabD, 0, lowerY + lowerH - 0.006, 0, edgeMat);
    addBox(fw, 0.012, cabD, 0, lowerY + 0.006, 0, edgeMat);
    addBox(0.012, lowerH, cabD, -fw / 2 + 0.006, lowerY + lowerH / 2, 0, edgeMat);
    addBox(0.012, lowerH, cabD,  fw / 2 - 0.006, lowerY + lowerH / 2, 0, edgeMat);

    const lowerDoorW = (fw - 0.012 * 5) / 4;
    for (let d4 = 0; d4 < 4; d4++) {
      const hingeDir4 = d4 % 2 === 0 ? 1 : -1;
      const hingeX4 = d4 % 2 === 0
        ? -fw / 2 + 0.012 + d4 * (lowerDoorW + 0.012)
        : -fw / 2 + 0.012 + (d4 + 1) * (lowerDoorW + 0.012);
      const lowerDP = addDoorPanel(lowerDoorW, lowerH - 0.025, 0.016, hingeX4, lowerY + lowerH / 2, cabD / 2 + 0.008, whiteDoor, hingeDir4, Math.PI / 2);
      // Chrome vertical bar handle on each door
      const barH = new THREE.Mesh(new THREE.BoxGeometry(0.012, lowerH * 0.38, 0.022), chromeMat);
      barH.position.set(hingeDir4 * lowerDoorW * -0.62, 0, 0.022); lowerDP.add(barH);
      if (d4 < 3) {
        addBox(0.012, lowerH, cabD, -fw / 2 + 0.012 + (d4 + 1) * (lowerDoorW + 0.012) - 0.006, lowerY + lowerH / 2, 0, edgeMat);
      }
    }

  } else if (lowerCls === 'kitchen-chimney') {
    // Kitchen chimney / range hood — wall-mounted above the stove.
    // Local Y=0 is the wall-snap base; geometry is offset up to the mount height.
    const kcMountH  = 1.52;  // bottom of hood from floor
    const kcHoodH   = 0.45;  // height of the flared hood body
    const kcDuctH   = 0.55;  // slim duct from hood top to ceiling
    const kcBodyMat   = mat(0x1a1a1a, 0.2, 0.6);
    const kcChromeMat = mat(0xd0d0d0, 0.1, 0.85);
    const kcGlowMat   = new THREE.MeshStandardMaterial({
      color: 0xffe8a0, roughness: 0.9, metalness: 0.0,
      emissive: 0xffe060, emissiveIntensity: 0.5,
    });
    // Slim duct above hood (goes to ceiling)
    addBox(fw * 0.50, kcDuctH, fd * 0.45, 0, kcMountH + kcHoodH + kcDuctH / 2, 0, kcBodyMat);
    // Upper flare of hood
    addBox(fw * 0.72, kcHoodH * 0.55, fd * 0.72, 0, kcMountH + kcHoodH * 0.73, 0, kcBodyMat);
    // Lower wide base of hood
    addBox(fw, kcHoodH * 0.45, fd, 0, kcMountH + kcHoodH * 0.22, 0, kcBodyMat);
    // Chrome intake grille at bottom
    addBox(fw - 0.04, 0.02, fd - 0.04, 0, kcMountH + 0.02, 0, kcChromeMat);
    // LED strip
    addBox(fw - 0.08, 0.015, fd - 0.08, 0, kcMountH + 0.04, 0, kcGlowMat);
    // Chrome trim ring
    addBox(fw + 0.01, 0.025, fd + 0.01, 0, kcMountH + 0.03, 0, kcChromeMat);
    // Control panel strip on front face
    addBox(fw * 0.5, 0.055, 0.02, 0, kcMountH + kcHoodH * 0.68, fd / 2 + 0.01, kcChromeMat);

  } else if (lowerCls === 'kitchen-island') {
    // Standalone kitchen island — countertop on all sides, cabinet body
    const kiBodyMat   = mat(0x5b8dba, 0.55, 0.05);
    const kiCounterMat= mat(0xfafafa, 0.2, 0.1);   // white stone top
    const kiDoorMat   = mat(0x4e7fa8, 0.5, 0.05);
    const kiHandleMat = mat(0xe0e0e0, 0.15, 0.8);
    const kiTrimMat   = mat(0x1a1a1a, 0.4, 0.1);
    const kiH = h - 0.05;
    // Toe-kick recess
    addBox(fw, 0.1, fd - 0.06, 0, 0.05, 0.02, mat(0x1a1a1a, 0.5, 0.0));
    // Body
    const kitchenBody = addBox(fw, kiH - 0.1, fd, 0, 0.1 + (kiH - 0.1) / 2, 0, kiBodyMat);
    // White marble/stone countertop (overhangs on all sides)
    const kitchenCounter = addBox(fw + 0.04, 0.06, fd + 0.04, 0, kiH - 0.02, 0, kiCounterMat);
    addBox(fw + 0.04, 0.06, 0.025, 0, kiH - 0.02, fd / 2 + 0.03, kiTrimMat);
    addBox(fw + 0.04, 0.06, 0.025, 0, kiH - 0.02, -fd / 2 - 0.03, kiTrimMat);
    // Front doors
    const kiDH = kiH - 0.1 - 0.06;
    const kitchenLeft = addBox(fw / 2 - 0.03, kiDH, 0.02, -fw / 4, 0.13 + kiDH / 2, fd / 2 + 0.01, kiDoorMat);
    const kitchenRight = addBox(fw / 2 - 0.03, kiDH, 0.02,  fw / 4, 0.13 + kiDH / 2, fd / 2 + 0.01, kiDoorMat);
    // Back doors (island is accessible from both sides)
    addBox(fw / 2 - 0.03, kiDH, 0.02, -fw / 4, 0.13 + kiDH / 2, -fd / 2 - 0.01, kiDoorMat);
    addBox(fw / 2 - 0.03, kiDH, 0.02,  fw / 4, 0.13 + kiDH / 2, -fd / 2 - 0.01, kiDoorMat);
    // Handles on all sides
    group.updateMatrixWorld(true); kitchenLeft.attach(addBox(fw * 0.28, 0.025, 0.03, -fw / 4, 0.13 + kiDH * 0.85, fd / 2 + 0.03, kiHandleMat));
    group.updateMatrixWorld(true); kitchenRight.attach(addBox(fw * 0.28, 0.025, 0.03,  fw / 4, 0.13 + kiDH * 0.85, fd / 2 + 0.03, kiHandleMat));
    addBox(fw * 0.28, 0.025, 0.03, -fw / 4, 0.13 + kiDH * 0.85, -fd / 2 - 0.03, kiHandleMat);
    addBox(fw * 0.28, 0.025, 0.03,  fw / 4, 0.13 + kiDH * 0.85, -fd / 2 - 0.03, kiHandleMat);

    registerKitchen(group,{body:kitchenBody,counter:kitchenCounter,fronts:[kitchenLeft,kitchenRight],width:fw,depth:fd});

  // ── WALL-MOUNTED ITEMS ────────────────────────────────────
  } else if (lowerCls === 'wall-shelf') {
    const wsMountH = 1.45;  // shelf face height from floor
    const wsWoodMat = mat(0x6b5040, 0.5, 0.0);
    const wsMetalMat = mat(0xb0b0b0, 0.2, 0.7);
    const wsWallMat = mat(0xd8d0c8, 0.6, 0.0);
    // Back wall plate
    addBox(fw, 0.6, 0.04, 0, wsMountH, -fd / 2 + 0.02, wsWallMat);
    // Main shelf board
    addBox(fw, 0.04, fd, 0, wsMountH + 0.02, 0, wsWoodMat);
    // L-bracket supports (2)
    const bkx = fw / 2 - 0.12;
    addBox(0.03, fd, 0.03, -bkx, wsMountH - fd / 2 + 0.015, 0, wsMetalMat);
    addBox(0.03, fd, 0.03,  bkx, wsMountH - fd / 2 + 0.015, 0, wsMetalMat);
    // Optional second shelf above
    if (fw > 0.8) {
      addBox(fw, 0.03, fd * 0.85, 0, wsMountH + 0.42, 0, wsWoodMat);
    }

  } else if (lowerCls === 'wall-mirror') {
    const wmMountH = 1.1;  // bottom of mirror from floor
    const wmH = h * 1.2;   // mirror height
    const wmFrameMat = mat(0x2d1f14, 0.45, 0.05);
    const wmGlassMat = new THREE.MeshStandardMaterial({
      color: 0xd0e8f0, roughness: 0.02, metalness: 0.9,
      transparent: true, opacity: 0.55, depthWrite: false,
      side: THREE.DoubleSide,
    });
    const wmBackMat = mat(0xd8d0c8, 0.6, 0.0);
    const wmFT = 0.06;
    // Back wall plate
    addBox(fw + 0.04, wmH + 0.04, 0.02, 0, wmMountH + wmH / 2, -fd / 2 + 0.01, wmBackMat);
    // Outer frame
    addBox(fw, wmFT, 0.05, 0, wmMountH + wmFT / 2, 0, wmFrameMat);
    addBox(fw, wmFT, 0.05, 0, wmMountH + wmH - wmFT / 2, 0, wmFrameMat);
    addBox(wmFT, wmH, 0.05, -fw / 2 + wmFT / 2, wmMountH + wmH / 2, 0, wmFrameMat);
    addBox(wmFT, wmH, 0.05,  fw / 2 - wmFT / 2, wmMountH + wmH / 2, 0, wmFrameMat);
    // Glass pane
    const wmGlass = new THREE.Mesh(
      new THREE.BoxGeometry(fw - wmFT * 2, wmH - wmFT * 2, 0.008),
      wmGlassMat
    );
    wmGlass.position.set(0, wmMountH + wmH / 2, 0);
    group.add(wmGlass);
    // Decorative corner rosettes
    const wmRosette = mat(0xc8a84b, 0.3, 0.4);
    [[-fw/2 + wmFT/2, wmMountH + wmFT/2],
     [ fw/2 - wmFT/2, wmMountH + wmFT/2],
     [-fw/2 + wmFT/2, wmMountH + wmH - wmFT/2],
     [ fw/2 - wmFT/2, wmMountH + wmH - wmFT/2]].forEach(([x,y]) => {
      addBox(wmFT + 0.02, wmFT + 0.02, 0.06, x, y, 0, wmRosette);
    });

  } else if (lowerCls === 'wall-lamp') {
    const wlMountH = 1.75;  // center of sconce from floor
    const wlBracketMat = mat(0x2a2a2a, 0.35, 0.5);
    const wlShadeMat = mat(0xf8e8c0, 0.7, 0.0);
    const wlGlowMat = new THREE.MeshStandardMaterial({
      color: 0xffe080, roughness: 0.8, metalness: 0.0,
      emissive: 0xffe060, emissiveIntensity: 0.6,
    });
    const wlBackMat = mat(0xd8d0c8, 0.6, 0.0);
    // Back wall plate
    addBox(fw, 0.25, 0.02, 0, wlMountH, -fd / 2 + 0.01, wlBackMat);
    // Arm bracket (from wall outward)
    addBox(0.025, 0.025, fd - 0.04, 0, wlMountH, 0, wlBracketMat);
    // Shade (frustum shape via cylinder)
    const wlShade = new THREE.Mesh(
      new THREE.CylinderGeometry(fw * 0.38, fw * 0.25, 0.22, 16, 1, true),
      wlShadeMat
    );
    wlShade.position.set(0, wlMountH - 0.04, fd / 2 - fd * 0.15);
    group.add(wlShade);
    // Shade top cap
    addBox(fw * 0.76, 0.02, fw * 0.76, 0, wlMountH + 0.07, fd / 2 - fd * 0.15, wlBracketMat);
    // Bulb glow core
    const wlBulb = new THREE.Mesh(new THREE.SphereGeometry(fw * 0.12, 12, 8), wlGlowMat);
    wlBulb.position.set(0, wlMountH - 0.04, fd / 2 - fd * 0.15);
    group.add(wlBulb);

  // ── DRESSER ───────────────────────────────────────────────
  } else if (lowerCls === 'dresser') {
    const drBodyMat   = mat(0x5c3a1e, 0.55, 0.02);   // dark walnut
    const drDrawerMat = mat(0x7a4e2a, 0.50, 0.02);   // slightly lighter front
    const drHandleMat = mat(0xd4af37, 0.20, 0.75);   // brass handle
    const drMirrorMat = new THREE.MeshStandardMaterial({ color: 0xd8e8f0, roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.55 });
    const drMoldingMat = mat(0x3e2310, 0.45, 0.03);  // dark trim

    // Plinth / base
    addBox(fw + 0.02, 0.06, fd + 0.02, 0, 0.03, 0, drMoldingMat);
    // Main body
    addBox(fw, h, fd, 0, 0.06 + h / 2, 0, drBodyMat);
    // Top crown molding
    addBox(fw + 0.03, 0.06, fd + 0.02, 0, 0.06 + h + 0.03, 0, drMoldingMat);

    // Drawer rows (2 cols × 4 rows)
    const drRows = 4, drCols = 2;
    const drGap = 0.025;
    const drH = (h - drGap * (drRows + 1)) / drRows;
    const drW = (fw - drGap * (drCols + 1)) / drCols;
    for (let r = 0; r < drRows; r++) {
      for (let c = 0; c < drCols; c++) {
        const dx = -fw / 2 + drGap + drW / 2 + c * (drW + drGap);
        const dy = 0.06 + drGap + drH / 2 + r * (drH + drGap);
        // Drawer face
        addBox(drW, drH, 0.022, dx, dy, fd / 2 + 0.011, drDrawerMat);
        // Recessed inner panel (slightly inset, darker)
        addBox(drW - 0.04, drH - 0.04, 0.008, dx, dy, fd / 2 + 0.024, drMoldingMat);
        // Brass pull handle — small horizontal bar
        addBox(drW * 0.28, 0.016, 0.018, dx, dy, fd / 2 + 0.032, drHandleMat);
        // Handle posts
        [-drW * 0.10, drW * 0.10].forEach(hx => {
          addBox(0.012, 0.025, 0.022, dx + hx, dy, fd / 2 + 0.033, drHandleMat);
        });
      }
    }
    // Mirror above body (optional — shown for tall variants)
    if (h >= 1.1) {
      const mirH = Math.min(0.55, h * 0.45);
      const mirW = fw * 0.72;
      // Mirror frame
      addBox(mirW + 0.04, mirH + 0.04, 0.025, 0, 0.06 + h + 0.06 + mirH / 2, -fd / 2 + 0.015, drMoldingMat);
      // Mirror glass
      const mirMesh = new THREE.Mesh(new THREE.BoxGeometry(mirW, mirH, 0.008), drMirrorMat);
      mirMesh.position.set(0, 0.06 + h + 0.06 + mirH / 2, -fd / 2 + 0.02);
      mirMesh.castShadow = false;
      group.add(mirMesh);
      // Top arch accent
      for (let i = 0; i < 5; i++) {
        const ax = (i - 2) * (mirW / 5);
        const ay = 0.06 + h + 0.06 + mirH + 0.01 + 0.025;
        addBox(mirW / 6, 0.018, 0.030, ax, ay, -fd / 2 + 0.015, drHandleMat);
      }
    }

  // ── WALL TV ───────────────────────────────────────────────
  } else if (lowerCls === 'wall-tv') {
    const tvMountH = h;           // mounts at CLASS_PROPS height off floor
    const tvScreenMat  = new THREE.MeshStandardMaterial({ color: 0x080c14, roughness: 0.05, metalness: 0.1, envMapIntensity: 0.6 });
    const tvFrameMat   = mat(0x1c1c1c, 0.15, 0.6);
    const tvBracketMat = mat(0x888888, 0.2, 0.7);
    const tvLogoMat    = mat(0xffffff, 0.5, 0.2);

    // Screen panel (ultra-thin)
    const scrW = fw, scrH = fw * 0.565;  // 16:9 ratio
    const scrT = 0.028;
    const tvY = tvMountH + scrH / 2;

    // Back panel / frame (slightly larger than screen)
    addBox(scrW + 0.02, scrH + 0.02, scrT * 0.6, 0, tvY, -fd / 2 + scrT * 0.3, tvFrameMat);
    // Screen
    const scrMesh = new THREE.Mesh(new THREE.BoxGeometry(scrW - 0.025, scrH - 0.025, scrT), tvScreenMat);
    scrMesh.position.set(0, tvY, -fd / 2 + scrT * 0.85);
    scrMesh.castShadow = true;
    group.add(scrMesh);
    // Slim bezel strip (top/bottom/sides) — darker frame lines
    addBox(scrW + 0.01, 0.022, scrT * 1.1, 0, tvY + scrH / 2 + 0.011, -fd / 2 + scrT * 0.85, tvFrameMat);
    addBox(scrW + 0.01, 0.022, scrT * 1.1, 0, tvY - scrH / 2 - 0.011, -fd / 2 + scrT * 0.85, tvFrameMat);
    // Speaker grille (thin strip at very bottom of screen)
    for (let i = 0; i < 18; i++) {
      addBox(0.008, scrH * 0.06, 0.006, -scrW / 2 + 0.03 + i * (scrW - 0.06) / 17, tvY - scrH / 2 + scrH * 0.04, -fd / 2 + scrT * 1.0, mat(0x222222, 0.6, 0.1));
    }
    // Wall-mount bracket (visible arm behind screen)
    addBox(scrW * 0.25, 0.04, fd * 0.7, 0, tvY, -fd / 2 + fd * 0.35, tvBracketMat);
    addBox(scrW * 0.3, scrH * 0.35, 0.015, 0, tvY, -fd / 2 + fd + 0.01, tvBracketMat);
    // Logo dot (bottom-center of bezel)
    addBox(0.04, 0.008, 0.005, 0, tvY - scrH / 2 - 0.011, -fd / 2 + scrT + 0.004, tvLogoMat);
    // Power indicator LED
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x00ff44, emissive: 0x00ff44, emissiveIntensity: 1.0, roughness: 0.5 });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.004), ledMat);
    led.position.set(scrW * 0.45, tvY - scrH / 2 - 0.008, -fd / 2 + scrT + 0.005);
    group.add(led);

  // ── POOJA UNIT (CNC Carving Design) ──────────────────────
  } else if (lowerCls === 'pooja-unit') {
    const puTeak     = mat(0x5a2d0c, 0.50, 0.04);   // dark rosewood body
    const puTeakLt   = mat(0x7a4020, 0.48, 0.04);   // lighter teak for panels
    const puGold     = mat(0xd4af37, 0.18, 0.72);   // brass/gold CNC trim
    const puCarve    = mat(0x3a1a06, 0.55, 0.02);   // deep carved recess
    const puGlow     = new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff8010, emissiveIntensity: 0.9, roughness: 0.9 }); // inner glow
    const puMarble   = mat(0xf5f0ea, 0.20, 0.08);   // white marble shelf
    const puIdolMat  = mat(0xd4af37, 0.15, 0.75);   // idol gold

    // ── Stepped plinth base ──────────────────────────────────
    addBox(fw + 0.06, 0.08, fd + 0.04, 0, 0.04, 0, puTeak);
    addBox(fw + 0.02, 0.06, fd + 0.01, 0, 0.11, 0, puTeakLt);

    // ── Main cabinet body ────────────────────────────────────
    const puBodyH = h * 0.52;
    addBox(fw, puBodyH, fd, 0, 0.14 + puBodyH / 2, 0, puTeak);

    // ── Inner glow back panel (simulates lamp-lit interior) ──
    addBox(fw - 0.08, puBodyH - 0.06, 0.015, 0, 0.14 + puBodyH / 2, -fd / 2 + 0.012, puGlow);

    // ── Marble shelves (2 tiers inside lower cabinet) ────────
    [0.28, 0.28 + puBodyH * 0.42].forEach(sy => {
      addBox(fw - 0.10, 0.025, fd - 0.06, 0, sy, 0, puMarble);
    });

    // ── Gold idols (abstract cylinders + cone tops) ──────────
    const idolPositions = [[-fw * 0.22, 0.30], [0, 0.30], [fw * 0.22, 0.30]];
    idolPositions.forEach(([ix, iy]) => {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, 0.10, 10), puIdolMat);
      base.position.set(ix, iy, 0);
      base.castShadow = true;
      group.add(base);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.055, 10), puIdolMat);
      top.position.set(ix, iy + 0.075, 0);
      top.castShadow = true;
      group.add(top);
    });

    // ── Decorative side pillars ──────────────────────────────
    const puPillarH = h * 0.72;
    [-fw / 2 + 0.035, fw / 2 - 0.035].forEach(px => {
      // Pillar shaft (octagonal → CylinderGeometry with 8 sides)
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, puPillarH, 8), puTeakLt);
      shaft.position.set(px, 0.14 + puPillarH / 2, fd / 2 - 0.025);
      shaft.castShadow = true;
      group.add(shaft);
      // Pillar capital (top ornament)
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.038, 0.06, 8), puGold);
      cap.position.set(px, 0.14 + puPillarH + 0.03, fd / 2 - 0.025);
      cap.castShadow = true;
      group.add(cap);
      // Pillar base
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.055, 0.05, 8), puGold);
      base.position.set(px, 0.16, fd / 2 - 0.025);
      base.castShadow = true;
      group.add(base);
    });

    // ── Upper arch cabinet ───────────────────────────────────
    const puUpperY  = 0.14 + puBodyH + 0.02;
    const puUpperH  = h - puBodyH - 0.14 - 0.10;
    const puUpperW  = fw * 0.80;
    addBox(puUpperW, puUpperH, fd * 0.88, 0, puUpperY + puUpperH / 2, 0, puTeak);
    // Inner glow upper section
    addBox(puUpperW - 0.08, puUpperH - 0.04, 0.012, 0, puUpperY + puUpperH / 2, -fd / 2 + 0.01, puGlow);

    // ── CNC carved front panels ──────────────────────────────
    // Simulate raised-relief CNC carving with a grid of small gold decorative elements
    const cncY0 = 0.16, cncH = puBodyH - 0.08;
    const cncRows = 5, cncCols = 3;
    for (let cr = 0; cr < cncRows; cr++) {
      for (let cc = 0; cc < cncCols; cc++) {
        const cx = -fw * 0.34 + cc * fw * 0.34;
        const cy = cncY0 + 0.05 + cr * (cncH / cncRows);
        // Diamond ornament
        const dmGeo = new THREE.BoxGeometry(0.038, 0.038, 0.018);
        const dm = new THREE.Mesh(dmGeo, puGold);
        dm.rotation.z = Math.PI / 4;
        dm.position.set(cx, cy, fd / 2 + 0.009);
        dm.castShadow = true;
        group.add(dm);
        // Small corner dots around diamond
        [[-0.04, 0], [0.04, 0], [0, -0.04], [0, 0.04]].forEach(([ox, oy]) => {
          const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 6), puGold);
          dot.position.set(cx + ox, cy + oy, fd / 2 + 0.006);
          group.add(dot);
        });
      }
    }

    // Horizontal gold divider strips between panels
    [0.14 + puBodyH * 0.33, 0.14 + puBodyH * 0.66].forEach(sy => {
      addBox(fw - 0.06, 0.018, 0.022, 0, sy, fd / 2 + 0.011, puGold);
    });
    // Gold border frame around whole front
    const gbT = 0.018;
    addBox(fw - 0.04, gbT, 0.022, 0, 0.16, fd / 2 + 0.011, puGold);
    addBox(fw - 0.04, gbT, 0.022, 0, 0.14 + puBodyH - 0.02, fd / 2 + 0.011, puGold);
    addBox(gbT, puBodyH - 0.04, 0.022, -fw / 2 + 0.035, 0.14 + puBodyH / 2, fd / 2 + 0.011, puGold);
    addBox(gbT, puBodyH - 0.04, 0.022,  fw / 2 - 0.035, 0.14 + puBodyH / 2, fd / 2 + 0.011, puGold);

    // ── Arched shikhara / dome top ───────────────────────────
    const shY = puUpperY + puUpperH;
    // Stepped arch: 3 tiers narrowing upward
    [[puUpperW * 0.80, 0.06], [puUpperW * 0.55, 0.06], [puUpperW * 0.30, 0.07]].forEach(([w2, th], i) => {
      addBox(w2, th, fd * 0.6, 0, shY + i * 0.065 + th / 2, 0, i % 2 === 0 ? puTeak : puGold);
    });
    // Finial (kalash) on top
    const kalash = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), puGold);
    kalash.position.set(0, shY + 0.22, 0);
    kalash.scale.y = 1.4;
    group.add(kalash);
    const kalashStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.08, 8), puGold);
    kalashStem.position.set(0, shY + 0.26, 0);
    group.add(kalashStem);

    // ── Diya lamps (small glowing discs at base) ─────────────
    const diyaMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, emissive: 0xff8010, emissiveIntensity: 1.5, roughness: 0.6 });
    [-fw * 0.28, 0, fw * 0.28].forEach(dx => {
      const diya = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.030, 0.018, 10), diyaMat);
      diya.position.set(dx, 0.31, fd / 2 - 0.04);
      group.add(diya);
    });

    // ── Prayer bell (hanging at top center) ──────────────────
    const bellMat = mat(0xd4af37, 0.15, 0.80);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), bellMat);
    bell.scale.y = 1.2;
    bell.position.set(0, puUpperY + puUpperH * 0.2, fd / 2 - 0.04);
    group.add(bell);
    addBox(0.005, 0.06, 0.005, 0, puUpperY + puUpperH * 0.2 + 0.05, fd / 2 - 0.04, bellMat);

  } else if (lowerCls === 'wall-art') {
    const waMountH = 1.15;  // bottom of artwork
    const waArtH = h * 1.1;
    const waFrameMat = mat(0x2d1f14, 0.45, 0.02);
    const waCanvasMat = mat(0xe8c080, 0.9, 0.0);
    const waBackMat = mat(0xd8d0c8, 0.6, 0.0);
    const waFT = 0.05;
    // Back wall plate
    addBox(fw + 0.06, waArtH + 0.06, 0.015, 0, waMountH + waArtH / 2, -fd / 2 + 0.01, waBackMat);
    // Canvas
    const waCanvas = new THREE.Mesh(
      new THREE.BoxGeometry(fw - waFT * 2, waArtH - waFT * 2, 0.012),
      waCanvasMat
    );
    waCanvas.position.set(0, waMountH + waArtH / 2, 0);
    group.add(waCanvas);
    // Painted strokes as colored boxes on canvas
    const waColors = [0xc0504d, 0x4472c4, 0x9bbb59, 0xf79646];
    for (let i = 0; i < 4; i++) {
      addBox(fw * 0.18, waArtH * 0.35, 0.015,
        (i % 2 === 0 ? -1 : 1) * fw * 0.22,
        waMountH + waArtH * (i < 2 ? 0.28 : 0.65),
        0.01, mat(waColors[i], 0.85, 0.0));
    }
    // Frame borders
    addBox(fw, waFT, 0.04, 0, waMountH + waFT / 2, 0, waFrameMat);
    addBox(fw, waFT, 0.04, 0, waMountH + waArtH - waFT / 2, 0, waFrameMat);
    addBox(waFT, waArtH, 0.04, -fw / 2 + waFT / 2, waMountH + waArtH / 2, 0, waFrameMat);
    addBox(waFT, waArtH, 0.04,  fw / 2 - waFT / 2, waMountH + waArtH / 2, 0, waFrameMat);

  } else if (lowerCls.includes('table')) {
    // Table: warm wood top + tapered legs
    const topH = 0.06;
    const legR = 0.04;
    const legH = h - topH;
    const woodMat = mat(0x8b6914, 0.55, 0.0);
    const legMat = mat(0x5c4033, 0.5, 0.02);
    addBox(fw, topH, fd, 0, legH + topH / 2, 0, woodMat);
    const lx = fw / 2 - 0.08, lz = fd / 2 - 0.08;
    [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].forEach(([px, pz]) => {
      addBox(legR, legH, legR, px, legH / 2, pz, legMat);
    });
  } else if (lowerCls === 'bed') {
    // Bed: dark frame, white sheet, colored pillows, headboard
    const frameH = 0.28;
    const mattH = 0.18;
    const headH = 0.65;
    const frameMat = mat(0x3e2723, 0.7, 0.0);
    const sheetMat = mat(0xfaf8f5, 0.9, 0.0);
    const pillowMat = mat(0xf0c8a8, 0.85, 0.0);
    const headMat = mat(0x2d1f14, 0.6, 0.0);
    // Blanket accent
    const blanketMat = mat(0x607d8b, 0.85, 0.0);
    addBox(fw, frameH, fd, 0, frameH / 2, 0, frameMat);
    addBox(fw - 0.04, mattH, fd - 0.04, 0, frameH + mattH / 2, 0, sheetMat);
    // Blanket fold at foot
    addBox(fw - 0.06, 0.06, fd * 0.35, 0, frameH + mattH + 0.03, fd / 2 - fd * 0.18, blanketMat);
    addBox(fw, headH, 0.08, 0, headH / 2, -fd / 2 + 0.04, headMat);
    const pw = fw / 2 - 0.15;
    addBox(pw, 0.1, 0.28, -fw / 4, frameH + mattH + 0.05, -fd / 2 + 0.22, pillowMat);
    addBox(pw, 0.1, 0.28, fw / 4, frameH + mattH + 0.05, -fd / 2 + 0.22, pillowMat);
  } else if (lowerCls === 'sofa') {
    // Sofa: beige/tan fabric, rounded cushions
    const baseH = 0.38;
    const backH = 0.32;
    const armH = 0.22;
    const fabricMat = mat(0xc9b9a8, 0.85, 0.0);
    const cushionMat = mat(0xd4c4b0, 0.9, 0.0);
    const accentMat = mat(0xd4a574, 0.85, 0.0);
    addBox(fw, baseH, fd, 0, baseH / 2, 0, cushionMat);
    addBox(fw, backH, 0.14, 0, baseH + backH / 2, -fd / 2 + 0.07, fabricMat);
    addBox(0.14, armH, fd, -fw / 2 + 0.07, baseH + armH / 2, 0, fabricMat);
    addBox(0.14, armH, fd, fw / 2 - 0.07, baseH + armH / 2, 0, fabricMat);
    // Accent pillows
    addBox(0.3, 0.25, 0.08, -fw / 4, baseH + 0.12, -fd / 2 + 0.2, accentMat);
    addBox(0.3, 0.25, 0.08, fw / 4, baseH + 0.12, -fd / 2 + 0.2, accentMat);
  } else if (lowerCls.includes('chair')) {
    // Chair: wood frame, cushion seat
    const seatH = 0.06;
    const legH = 0.42;
    const backH = 0.45;
    const woodMat = mat(0x5c4033, 0.55, 0.0);
    const seatMat = mat(0xc9b9a8, 0.8, 0.0);
    addBox(fw, seatH, fd, 0, legH + seatH / 2, 0, seatMat);
    addBox(fw, backH, 0.04, 0, legH + seatH + backH / 2, -fd / 2 + 0.02, woodMat);
    const lx = fw / 2 - 0.04, lz = fd / 2 - 0.04;
    [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].forEach(([px, pz]) => {
      addBox(0.035, legH, 0.035, px, legH / 2, pz, woodMat);
    });
  } else if (lowerCls === 'fridge') {
    // Fridge: stainless steel look
    const bodyMat = mat(0xe8e8e8, 0.25, 0.5);
    const freezerMat = mat(0xd8d8d8, 0.25, 0.5);
    const handleMat = mat(0xa0a0a0, 0.15, 0.8);
    const splitH = h * 0.3;
    addBox(fw, h - splitH - 0.02, fd, 0, (h - splitH) / 2, 0, bodyMat);
    addBox(fw, splitH, fd, 0, h - splitH / 2, 0, freezerMat);
    addBox(0.02, h * 0.4, 0.03, fw / 2 - 0.04, h * 0.3, fd / 2 + 0.02, handleMat);
    addBox(0.02, splitH * 0.6, 0.03, fw / 2 - 0.04, h - splitH / 2, fd / 2 + 0.02, handleMat);
  } else if (lowerCls === 'tv') {
    // TV: ultra-thin black screen + slim stand
    const screenMat = mat(0x0a0a0a, 0.15, 0.1);
    const standMat = mat(0x2d2d2d, 0.25, 0.5);
    const screenH = Math.max(fw * 0.56, 0.4);
    addBox(fw, screenH, 0.03, 0, 0.6 + screenH / 2, 0, screenMat);
    addBox(0.25, 0.6, 0.12, 0, 0.3, 0, standMat);
    addBox(fw * 0.3, 0.02, fd, 0, 0.01, 0, standMat);
  } else if (lowerCls === 'stove' || lowerCls === 'kitchen-slab') {
    // Kitchen counter with a fitted glass gas hob.
    const counterMat = mat(0x68625c, 0.3, 0.12);
    const baseMat = mat(0xeee9e1, 0.58, 0.02);
    const kitchenBody = addBox(fw, h - 0.05, fd, 0, (h - 0.05) / 2, 0, baseMat);
    const kitchenCounter = addBox(fw, 0.05, fd, 0, h - 0.025, 0, counterMat);
    registerKitchen(group,{body:kitchenBody,counter:kitchenCounter,width:fw,depth:fd,kind:lowerCls==='stove'?'hob-adjacent':'base'});
    if (lowerCls === 'stove') {
      const glassMat = mat(0x101418, 0.08, 0.42);
      const ironMat = mat(0x242424, 0.3, 0.68);
      const brassMat = mat(0xb58a42, 0.24, 0.7);
      const hobW = Math.max(0.13, fw * 0.82), hobD = Math.max(0.13, fd * 0.72);
      addBox(hobW, 0.018, hobD, 0, h + 0.009, -fd * 0.035, glassMat).userData.fixturePart = 'glass-hob';
      const bx = hobW * 0.27, bz = hobD * 0.25;
      [[-bx, -bz], [bx, -bz], [-bx, bz], [bx, bz]].forEach(([px, pz], index) => {
        const radius = Math.max(0.022, Math.min(hobW, hobD) * (index < 2 ? 0.09 : 0.075));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, Math.max(0.006, radius * 0.13), 8, 24), ironMat);
        ring.rotation.x = Math.PI / 2; ring.position.set(px, h + 0.027, pz - fd * 0.035);
        ring.castShadow = true; ring.userData.fixturePart = 'burner-ring'; group.add(ring);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.58, radius * 0.64, 0.016, 24), brassMat);
        cap.position.set(px, h + 0.027, pz - fd * 0.035); cap.userData.fixturePart = 'burner-cap'; group.add(cap);
        for (const angle of [0, Math.PI / 2]) {
          const support = addBox(radius * 2.65, 0.012, 0.014, px, h + 0.044, pz - fd * 0.035, ironMat);
          support.rotation.y = angle; support.userData.fixturePart = 'pan-support';
        }
      });
      const knobZ = fd * 0.27;
      [-0.27, -0.09, 0.09, 0.27].forEach(factor => {
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.018, 16), ironMat);
        knob.position.set(hobW * factor, h + 0.03, knobZ); knob.userData.fixturePart = 'control-knob'; group.add(knob);
      });
    }
  // ── OVEN (built-in / countertop) ─────────────────────────
  } else if (lowerCls === 'oven') {
    const ovBodyMat   = mat(0x1c1c1c, 0.25, 0.45);  // dark body
    const ovDoorMat   = mat(0x111111, 0.15, 0.55);  // front door
    const ovGlassMat  = new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.72 });
    const ovChromeMat = mat(0xb0b0b0, 0.12, 0.80);  // chrome trim / handle
    const ovKnobMat   = mat(0x888888, 0.30, 0.55);
    const ovGlowMat   = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 0.8, roughness: 0.9 }); // heating element glow

    // Main body
    addBox(fw, h, fd, 0, h / 2, 0, ovBodyMat);

    // Front door panel
    addBox(fw - 0.04, h * 0.72, 0.022, 0, h * 0.36 + 0.04, fd / 2 + 0.011, ovDoorMat);

    // Glass window on door (double-pane look)
    const glW = fw * 0.62, glH = h * 0.42;
    const glMesh = new THREE.Mesh(new THREE.BoxGeometry(glW, glH, 0.012), ovGlassMat);
    glMesh.position.set(0, h * 0.38 + 0.04, fd / 2 + 0.028);
    group.add(glMesh);
    // Glass inner frame border
    addBox(glW + 0.022, 0.014, 0.016, 0, h * 0.38 + 0.04 + glH / 2, fd / 2 + 0.024, ovChromeMat);
    addBox(glW + 0.022, 0.014, 0.016, 0, h * 0.38 + 0.04 - glH / 2, fd / 2 + 0.024, ovChromeMat);
    addBox(0.014, glH, 0.016, -glW / 2, h * 0.38 + 0.04, fd / 2 + 0.024, ovChromeMat);
    addBox(0.014, glH, 0.016,  glW / 2, h * 0.38 + 0.04, fd / 2 + 0.024, ovChromeMat);

    // Pull handle (horizontal chrome bar)
    addBox(fw * 0.55, 0.022, 0.038, 0, h * 0.62, fd / 2 + 0.040, ovChromeMat);
    [-fw * 0.24, fw * 0.24].forEach(hx => {
      addBox(0.018, 0.055, 0.038, hx, h * 0.62, fd / 2 + 0.040, ovChromeMat);
    });

    // Control panel strip at top of door
    addBox(fw - 0.04, h * 0.10, 0.022, 0, h * 0.77, fd / 2 + 0.011, mat(0x2a2a2a, 0.30, 0.35));
    // 4 control knobs
    [-fw * 0.28, -fw * 0.09, fw * 0.09, fw * 0.28].forEach(kx => {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.020, 0.020, 12), ovKnobMat);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(kx, h * 0.77, fd / 2 + 0.026);
      group.add(knob);
      // Knob pointer mark
      addBox(0.005, 0.014, 0.006, kx, h * 0.77 + 0.018, fd / 2 + 0.028, mat(0xffffff, 0.8, 0.0));
    });
    // Digital display (small orange glow rectangle)
    const disp = new THREE.Mesh(new THREE.BoxGeometry(fw * 0.20, h * 0.055, 0.006),
      new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff5500, emissiveIntensity: 1.2, roughness: 0.9 }));
    disp.position.set(fw * 0.25, h * 0.77, fd / 2 + 0.024);
    group.add(disp);

    // Interior heating element hint (visible through glass)
    const el = new THREE.Mesh(new THREE.BoxGeometry(glW * 0.80, 0.008, 0.010), ovGlowMat);
    el.position.set(0, h * 0.14, fd / 2 - 0.04);
    group.add(el);

    // Chrome side vents (horizontal slits)
    for (let v = 0; v < 4; v++) {
      addBox(fw - 0.06, 0.008, 0.010, 0, h * 0.85 + v * 0.025, fd / 2 + 0.011, ovChromeMat);
    }

  // ── MIXER (stand mixer / blender style) ──────────────────
  } else if (lowerCls === 'mixer') {
    const mxBodyMat  = mat(0xd8d8d8, 0.25, 0.40);  // light silver body
    const mxBowlMat  = mat(0xc0c0c0, 0.12, 0.65);  // stainless bowl
    const mxArmMat   = mat(0xe0e0e0, 0.22, 0.35);
    const mxKnobMat  = mat(0x333333, 0.35, 0.20);
    const mxLogo     = mat(0xffffff, 0.60, 0.10);

    const radius = Math.min(fw, fd) * 0.38;

    // Base platform
    addBox(fw, 0.07, fd, 0, 0.035, 0, mxBodyMat);

    // Motor head body (rear-mounted tilting arm style)
    addBox(fw * 0.55, h * 0.50, fd * 0.42, 0, h * 0.25, -fd * 0.12, mxBodyMat);

    // Arm extending forward over bowl
    addBox(fw * 0.10, h * 0.08, fd * 0.60, 0, h * 0.48, 0, mxArmMat);

    // Mixing bowl (cylinder)
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.90, radius * 0.72, h * 0.50, 24),
      mxBowlMat
    );
    bowl.position.set(0, 0.07 + (h * 0.50) / 2, fd * 0.10);
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    group.add(bowl);

    // Bowl rim ring
    const rimGeo = new THREE.TorusGeometry(radius * 0.90, 0.012, 8, 28);
    const rim = new THREE.Mesh(rimGeo, mxBodyMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.07 + h * 0.50, fd * 0.10);
    group.add(rim);

    // Beater attachment (whisk hint — thin vertical cylinder going down into bowl)
    const beater = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, h * 0.30, 8), mxArmMat);
    beater.position.set(0, 0.07 + h * 0.35, fd * 0.10);
    group.add(beater);
    // Beater wire loops (2 crossing ellipses)
    [0, Math.PI / 2].forEach(angle => {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.005, 6, 14), mxArmMat);
      loop.rotation.x = Math.PI / 2;
      loop.rotation.z = angle;
      loop.position.set(0, 0.07 + h * 0.19, fd * 0.10);
      group.add(loop);
    });

    // Speed dial knob (on side of motor head)
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.020, 14), mxKnobMat);
    dial.rotation.z = Math.PI / 2;
    dial.position.set(fw * 0.28, h * 0.28, -fd * 0.12);
    group.add(dial);

    // Tilt-head lock lever
    addBox(0.015, 0.055, 0.015, -fw * 0.28, h * 0.40, -fd * 0.12, mxKnobMat);

    // Logo strip
    addBox(fw * 0.22, 0.012, 0.006, 0, h * 0.22, fd / 2 - fd * 0.42 + 0.006, mxLogo);

  } else if (lowerCls.includes('sink') || lowerCls === 'wash') {
    // Bathroom vanity with a rounded ceramic basin, drain and chrome mixer tap.
    const ceramicMat = mat(0xf8f8f4, 0.16, 0.02);
    const vanityMat = mat(0xd8c7b3, 0.58, 0.02);
    const shadowMat = mat(0x9ba5a8, 0.22, 0.5);
    const chromeMat = mat(0xd6dde0, 0.08, 0.92);
    const cabinetH = Math.max(0.25, h * 0.78);
    const kitchenBody = addBox(fw * 0.9, cabinetH, fd * 0.78, 0, cabinetH / 2, -fd * 0.06, vanityMat); kitchenBody.userData.fixturePart = 'vanity';
    addBox(fw, 0.045, fd * 0.9, 0, cabinetH + 0.0225, 0, ceramicMat).userData.fixturePart = 'countertop';
    const basinW = Math.max(0.11, fw * 0.58), basinD = Math.max(0.1, fd * 0.48);
    const basin = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), ceramicMat);
    basin.scale.set(basinW, Math.max(0.08, h * 0.18), basinD);
    basin.rotation.x = Math.PI; basin.position.set(0, cabinetH + 0.095, fd * 0.035);
    basin.castShadow = true; basin.receiveShadow = true; basin.userData.fixturePart = 'basin'; group.add(basin);
    const bowl = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), shadowMat);
    bowl.scale.set(basinW * 0.72, basinD * 0.72, 1); bowl.rotation.x = -Math.PI / 2;
    bowl.position.set(0, cabinetH + 0.099, fd * 0.035); bowl.userData.fixturePart = 'basin-interior'; group.add(bowl);
    const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 20), chromeMat);
    drain.position.set(0, cabinetH + 0.104, fd * 0.035); drain.userData.fixturePart = 'drain'; group.add(drain);
    const tapR = Math.max(0.009, Math.min(fw, fd) * 0.018);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(tapR, tapR * 1.15, 0.18, 16), chromeMat);
    stem.position.set(0, cabinetH + 0.135, -fd * 0.27); stem.userData.fixturePart = 'faucet'; group.add(stem);
    const spoutCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, cabinetH + 0.22, -fd * 0.27),
      new THREE.Vector3(0, cabinetH + 0.31, -fd * 0.08),
      new THREE.Vector3(0, cabinetH + 0.2, fd * 0.01));
    const spout = new THREE.Mesh(new THREE.TubeGeometry(spoutCurve, 20, tapR, 8, false), chromeMat);
    spout.castShadow = true; spout.userData.fixturePart = 'faucet-spout'; group.add(spout);
    const sinkHandle = addBox(fw * 0.34, 0.018, 0.02, 0, cabinetH * 0.58, fd * 0.34, chromeMat); sinkHandle.userData.fixturePart = 'handle';
    if(lowerCls==='sink')registerKitchen(group,{body:kitchenBody,attachments:[sinkHandle],width:fw*.9,depth:fd*.78,kind:'sink'});
  } else if (lowerCls === 'washing machine') {
    // Washing machine: white body, dark drum porthole
    const bodyMat = mat(0xf5f5f5, 0.3, 0.25);
    const drumMat = mat(0x404040, 0.15, 0.5);
    addBox(fw, h, fd, 0, h / 2, 0, bodyMat);
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.min(fw, fd) * 0.28, Math.min(fw, fd) * 0.28, 0.03, 24),
      drumMat
    );
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0, h * 0.55, fd / 2 + 0.02);
    group.add(drum);
  } else if (lowerCls === 'commode') {
    // Close-coupled floor-mounted commode with a full pedestal and visible cistern.
    // The rear is local -Z, matching other wall-backed furniture.
    const ceramicMat = mat(0xfafaf7, 0.14, 0.02);
    const seatMat = mat(0xf4f4f1, 0.18, 0.025);
    const shadowMat = mat(0xd7d8d5, 0.28, 0.01);
    const bodyW = Math.max(0.15, fw * 0.9), bodyD = Math.max(0.2, fd * 0.94);
    const rimY = Math.max(0.39, h * 1.02);

    // A separate tapered pedestal and ellipsoidal bowl provide curvature in
    // every direction. The previous side-profile extrusion kept a flat front.
    const pedestalH = rimY * 0.76;
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.5, pedestalH, 40, 4), ceramicMat);
    pedestal.scale.set(bodyW * 0.66, 1, bodyD * 0.55);
    pedestal.position.set(0, pedestalH / 2 + 0.006, -bodyD * 0.055);
    pedestal.castShadow = true; pedestal.receiveShadow = true;
    pedestal.userData.fixturePart = 'floor-pedestal-body'; group.add(pedestal);

    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 24), ceramicMat);
    bowl.scale.set(bodyW, rimY * 0.62, bodyD * 0.98);
    bowl.position.set(0, rimY * 0.79, bodyD * 0.055);
    bowl.castShadow = true; bowl.receiveShadow = true;
    bowl.userData.fixturePart = 'toilet-bowl'; group.add(bowl);

    // Close the rear down to the floor like the skirted one-piece reference.
    const skirtW = bodyW * 0.72, skirtH = pedestalH * 0.92, skirtD = bodyD * 0.34;
    const skirt = new THREE.Mesh(new RoundedBoxGeometry(skirtW, skirtH, skirtD, 6, 0.035), ceramicMat);
    skirt.position.set(0, skirtH / 2 + 0.006, -bodyD / 2 + skirtD / 2);
    skirt.castShadow = true; skirt.receiveShadow = true; skirt.userData.fixturePart = 'rear-skirt'; group.add(skirt);

    // Dark seam under the seat makes the separate soft-close assembly readable.
    const seam = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.6, 8, 24), shadowMat);
    seam.rotation.x = Math.PI / 2; seam.scale.set(bodyW * 0.82, bodyD * 0.5, 0.014);
    seam.position.set(0, rimY + 0.002, bodyD * 0.085); seam.userData.fixturePart = 'seat-seam'; group.add(seam);

    const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.62, 10, 32), seatMat);
    seat.rotation.x = Math.PI / 2; seat.scale.set(bodyW * 0.78, bodyD * 0.48, 0.022);
    seat.position.set(0, rimY + 0.018, bodyD * 0.085);
    seat.castShadow = true; seat.userData.fixturePart = 'toilet-seat'; group.add(seat);

    // Slim closed soft-close lid, slightly inset from the seat below it.
    const lid = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.62, 10, 32), ceramicMat);
    lid.rotation.x = Math.PI / 2; lid.scale.set(bodyW * 0.74, bodyD * 0.46, 0.018);
    lid.position.set(0, rimY + 0.041, bodyD * 0.078);
    lid.castShadow = true; lid.userData.fixturePart = 'soft-close-lid'; group.add(lid);
    // Rounded close-coupled cistern rises directly behind the seat.
    const tankW = bodyW * 0.84, tankD = Math.max(0.1, bodyD * 0.29);
    const tankBase = rimY * 0.69, tankTop = Math.max(0.74, h * 1.85), tankH = tankTop - tankBase;
    const tankGeometry = new RoundedBoxGeometry(tankW, tankH, tankD, 5, Math.min(0.045, tankD * 0.18));
    const tank = new THREE.Mesh(tankGeometry, ceramicMat);
    tank.position.set(0, tankBase + tankH / 2, -bodyD / 2 + tankD / 2);
    tank.castShadow = true; tank.receiveShadow = true; tank.userData.fixturePart = 'visible-cistern'; group.add(tank);
    const tankLidGeometry = new RoundedBoxGeometry(tankW * 1.03, 0.035, tankD * 1.04, 4, 0.014);
    const tankLid = new THREE.Mesh(tankLidGeometry, seatMat);
    tankLid.position.set(0, tankTop + 0.012, -bodyD / 2 + tankD / 2);
    tankLid.castShadow = true; tankLid.userData.fixturePart = 'cistern-lid'; group.add(tankLid);
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.011, 20), mat(0xbfc7ca, 0.08, 0.9));
    button.position.set(0, tankTop + 0.036, -bodyD / 2 + tankD / 2);
    button.userData.fixturePart = 'flush-button'; group.add(button);
  } else if (lowerCls.includes('stairs')) {
    // Stairs: light stone steps
    const stepMat = mat(0xc8c0b4, 0.55, 0.05);
    const steps = 12;
    const stepH = h / steps;
    const stepD = fd / steps;
    for (let i = 0; i < steps; i++) {
      addBox(fw, stepH, stepD, 0, stepH * (i + 0.5), -fd / 2 + stepD * (i + 0.5), stepMat);
    }
  } else if (lowerCls === 'lift' || lowerCls.includes('elevator')) {
    const shaftH = Math.max(h, 2.4);
    const wallT = Math.max(Math.min(Math.min(fw, fd) * 0.08, 0.12), 0.05);
    const shaftMat = mat(0x8d99a0, 0.55, 0.05);
    const frameMat = mat(0x626d73, 0.45, 0.08);
    const doorMat = mat(0xaeb7be, 0.35, 0.25);

    addBox(fw, shaftH, wallT, 0, shaftH / 2, -fd / 2 + wallT / 2, shaftMat);
    addBox(fw, shaftH, wallT, 0, shaftH / 2, fd / 2 - wallT / 2, shaftMat);
    addBox(wallT, shaftH, fd - wallT * 2, -fw / 2 + wallT / 2, shaftH / 2, 0, shaftMat);
    addBox(wallT, shaftH, fd - wallT * 2, fw / 2 - wallT / 2, shaftH / 2, 0, shaftMat);

    const doorW = Math.max(fw * 0.5, 0.6);
    const doorH = Math.min(Math.max(shaftH * 0.72, 2.0), shaftH - 0.1);
    const doorY = shaftH * 0.45;
    const zFront = fd / 2 - wallT - 0.015;

    addBox(doorW / 2 - 0.02, doorH, 0.03, -doorW / 4, doorY, zFront, doorMat);
    addBox(doorW / 2 - 0.02, doorH, 0.03, doorW / 4, doorY, zFront, doorMat);
    addBox(doorW + 0.04, 0.06, 0.05, 0, doorY + doorH / 2 + 0.04, zFront, frameMat);
  } else {
    // Default: warm neutral box
    const defaultMat = mat(color, 0.5, 0.02);
    addBox(fw, h, fd, 0, h / 2, 0, defaultMat);
  }

  // Floating text label (disabled for clean rendered look)
  if (SHOW_LABELS) {
    const labelH = getGroupHeight(group);
    const label = cls || 'Object';
    const labelSprite = makeTextSprite(label);
    if (labelSprite) {
      labelSprite.position.set(0, labelH + 0.3, 0);
      group.add(labelSprite);
    }
  }

  group.position.set(placement.x, placement.elevation, placement.z);
  group.rotation.y = placement.yaw;
  group.userData.objectType = lowerCls;
  group.userData.layoutId = obj?.id;
  group.userData.type = 'furniture';

  return group;
}

function getGroupHeight(group) {
  let maxY = 0;
  group.children.forEach((child) => {
    if (child.isMesh && child.geometry) {
      child.geometry.computeBoundingBox();
      const top = child.position.y + (child.geometry.boundingBox?.max.y || 0);
      if (top > maxY) maxY = top;
    }
  });
  return maxY || 1.0;
}

// Create a text sprite for labeling objects
function makeTextSprite(text, tintColor) {
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  const r = 8;
  ctx.beginPath();
  ctx.roundRect(2, 2, size - 4, 60, r);
  ctx.fill();

  // Text
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.0, 0.5, 1);
  return sprite;
}
