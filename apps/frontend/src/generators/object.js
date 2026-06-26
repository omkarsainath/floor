import * as THREE from 'three';

// Toggle object labels; disabled for a clean rendered look.
const SHOW_LABELS = false;

const CLASS_PROPS = {
  door: { color: 0x8b5a2b, opacity: 1.0, height: 2.4 },
  window: { color: 0x9bcef0, opacity: 0.4, height: 1.4 },
  'glass-window': { color: 0x9bcef0, opacity: 0.35, height: 1.4 },
  'glass-wall': { color: 0x9bcef0, opacity: 0.35, height: 2.8 },
  'glass-grill': { color: 0x9bcef0, opacity: 0.45, height: 1.2 },
  'bay-window': { color: 0x9bcef0, opacity: 0.4, height: 1.4 },
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
  sink: { color: 0xd0d0d0, opacity: 1.0, height: 0.85 },
  'washing machine': { color: 0xf0f0f0, opacity: 1.0, height: 0.85 },
  commode: { color: 0xfaf8f5, opacity: 1.0, height: 0.4 },
  'crockery unit': { color: 0x6b4226, opacity: 1.0, height: 1.8 },
  'foyer cabinet': { color: 0x5c4033, opacity: 1.0, height: 1.0 },
  'book cabinet': { color: 0x4a3728, opacity: 1.0, height: 1.8 },
  'breakfast counter': { color: 0x8b8378, opacity: 1.0, height: 0.9 },
  stairs: { color: 0xc8c0b4, opacity: 1.0, height: 0.3 },
  'spiral-stairs': { color: 0xb0a898, opacity: 1.0, height: 0.3 },
  lift: { color: 0x7f8c8d, opacity: 1.0, height: 2.6 },
  wash: { color: 0xd0d0d0, opacity: 1.0, height: 0.85 },
  default: { color: 0xc8b89a, opacity: 1.0, height: 1.0 }
};

const clampPos = (v, fb) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
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

export function createObject(obj) {
  const { bbox = {}, class: cls = 'default', layoutCenter = null, walls = [],
          swingDir = 'auto' } = obj || {};
  const lowerCls = cls.toLowerCase();
  const props = CLASS_PROPS[lowerCls] || CLASS_PROPS.default;
  const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = bbox;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  if (lowerCls.includes('door')) {
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
    // Door height: clamped 2.0–3.0
    const crossDim = wallHoriz ? bboxH : bboxW;
    const DOOR_HEIGHT = Math.max(2.0, Math.min(3.0, crossDim > 0.3 ? crossDim * 3.0 : 2.4));

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
    panelMesh.position.set(doorWidth / 2, DOOR_HEIGHT / 2, 0);
    panelMesh.castShadow = true;
    panelMesh.receiveShadow = true;
    doorGroup.add(panelMesh);

    // Frame
    const frameD = thickness + 0.01;
    const addFrame = (sx, sy, sz, px, py, pz) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      const m = new THREE.Mesh(g, frameMat);
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
    handle.castShadow = true;
    doorGroup.add(handle);

    // Click collider
    const clickGeom = new THREE.BoxGeometry(doorWidth + 0.3, DOOR_HEIGHT, 0.3);
    const clickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 });
    const clickMesh = new THREE.Mesh(clickGeom, clickMat);
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
      hinge.position.set(hingeX, 0, snapZ);
      if (hingeSide === 'right') {
        doorGroup.scale.x = -1;
      }
      hinge.userData.openAngle = swingSign * Math.PI / 2;
    } else {
      // Wall runs along Z: rotate panel from +X to +Z direction
      doorGroup.rotation.y = -Math.PI / 2;
      const hingeZ = hingeSide === 'right' ? Math.max(y1, y2) : Math.min(y1, y2);
      const snapX = nearWall ? wallProjX : cx;
      hinge.position.set(snapX, 0, hingeZ);
      if (hingeSide === 'right') {
        doorGroup.scale.x = -1;
      }
      hinge.userData.openAngle = swingSign * Math.PI / 2;
    }

    hinge.add(doorGroup);
    return hinge;
  }

  // Window/glass openings: glass pane + frame + mullions
  if (lowerCls.includes('window') || lowerCls.includes('glass')) {
    const { wall: nearWall, projX: wallProjX, projY: wallProjY } = findNearestWall(bbox, walls);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const w = Math.max(Math.abs(dx), 0.2);
    const d = Math.max(Math.abs(dy), 0.08);
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const wallHoriz = nearWall
      ? Math.abs(nearWall.end.x - nearWall.start.x) >= Math.abs(nearWall.end.y - nearWall.start.y)
      : horizontal;

    const winW = wallHoriz ? w : d;
    const winD = wallHoriz ? d : w;
    const sillH = 0.05;
    const headH = 0.05;
    const jambW = 0.05;
    const frameDepth = Math.max(winD, 0.06);
    const glassDepth = 0.015;
    const winY = props.height / 2;

    const frameColor = 0xf5f2ed;
    const glassColor = 0xbfeeff;
    const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.5, metalness: 0.05 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: glassColor,
      metalness: 0.05,
      roughness: 0.05,
      transmission: 0.75,
      transparent: true,
      opacity: 0.45,
      thickness: 0.04,
      ior: 1.5,
      side: THREE.DoubleSide,
    });

    const winGroup = new THREE.Group();
    const addWinBox = (sx, sy, sz, px, py, pz, material) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      const m = new THREE.Mesh(g, material);
      m.position.set(px, py, pz);
      m.castShadow = true;
      m.receiveShadow = true;
      winGroup.add(m);
    };

    // Sill, head, left/right jambs
    addWinBox(winW, sillH, frameDepth, 0, 0 + sillH / 2, 0, frameMat);
    addWinBox(winW, headH, frameDepth, 0, props.height - headH / 2, 0, frameMat);
    addWinBox(jambW, props.height, frameDepth, -winW / 2 + jambW / 2, winY, 0, frameMat);
    addWinBox(jambW, props.height, frameDepth, winW / 2 - jambW / 2, winY, 0, frameMat);

    // Glass pane
    addWinBox(Math.max(winW - jambW * 2, 0.05), Math.max(props.height - sillH - headH, 0.05), glassDepth, 0, winY, 0, glassMat);

    // Vertical mullions (2 bars for wider windows)
    if (winW > 0.8) {
      const mullionW = 0.03;
      const count = winW > 1.4 ? 2 : 1;
      for (let i = 1; i <= count; i += 1) {
        const x = (-winW / 2 + jambW) + (i / (count + 1)) * (winW - jambW * 2);
        addWinBox(mullionW, Math.max(props.height - sillH - headH, 0.05), frameDepth, x, winY, 0, frameMat);
      }
    }
    // Horizontal mullion
    if (props.height > 0.8) {
      addWinBox(Math.max(winW - jambW * 2, 0.05), 0.03, frameDepth, 0, winY, 0, frameMat);
    }

    // Position and snap to wall
    if (wallHoriz) {
      winGroup.position.set(cx, 0, nearWall ? wallProjY : cy);
    } else {
      winGroup.rotation.y = -Math.PI / 2;
      winGroup.position.set(nearWall ? wallProjX : cx, 0, cy);
    }

    return winGroup;
  }

  // Non-door objects: realistic furniture
  const w = Math.max(clampPos(Math.abs(dx), 0.5), 0.15);  // width (X)
  const d = Math.max(clampPos(Math.abs(dy), 0.15), 0.08);  // depth (Z)
  const fw = horizontal ? w : d;  // furniture width
  const fd = horizontal ? d : w;  // furniture depth
  const h = props.height ?? 1.0;
  const color = props.color ?? 0xffcc00;
  const opacity = props.opacity ?? 1.0;

  const group = new THREE.Group();

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
  };

  if (lowerCls.includes('table')) {
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
  } else if (lowerCls === 'wardrobe') {
    // Wardrobe: dark wood, panel doors, metal handles
    const bodyMat = mat(0x3e2723, 0.6, 0.0);
    const doorMat = mat(0x4e342e, 0.55, 0.0);
    const handleMat = mat(0xc0c0c0, 0.2, 0.8);
    addBox(fw, h, fd, 0, h / 2, 0, bodyMat);
    addBox(fw / 2 - 0.03, h - 0.06, 0.02, -fw / 4, h / 2, fd / 2 + 0.01, doorMat);
    addBox(fw / 2 - 0.03, h - 0.06, 0.02, fw / 4, h / 2, fd / 2 + 0.01, doorMat);
    addBox(0.02, 0.15, 0.03, -0.04, h / 2, fd / 2 + 0.03, handleMat);
    addBox(0.02, 0.15, 0.03, 0.04, h / 2, fd / 2 + 0.03, handleMat);
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
    // Kitchen counter: granite top on white base
    const counterMat = mat(0x6b6560, 0.35, 0.1);
    const baseMat = mat(0xf0ece5, 0.6, 0.0);
    addBox(fw, h - 0.05, fd, 0, (h - 0.05) / 2, 0, baseMat);
    addBox(fw, 0.05, fd, 0, h - 0.025, 0, counterMat);
    if (lowerCls === 'stove') {
      const burnerMat = mat(0x1a1a1a, 0.2, 0.7);
      const bx = fw / 4, bz = fd / 4;
      [[-bx, -bz], [bx, -bz], [-bx, bz], [bx, bz]].forEach(([px, pz]) => {
        const cyl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16),
          burnerMat
        );
        cyl.position.set(px, h + 0.01, pz);
        group.add(cyl);
      });
    }
  } else if (lowerCls.includes('sink') || lowerCls === 'wash') {
    // Sink: white counter + stainless basin
    const counterMat = mat(0xf0ece5, 0.5, 0.05);
    const basinMat = mat(0xc0c0c0, 0.2, 0.5);
    addBox(fw, h, fd, 0, h / 2, 0, counterMat);
    addBox(fw * 0.55, 0.12, fd * 0.45, 0, h + 0.01, 0, basinMat);
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
    // Toilet: ceramic white
    const baseMat = mat(0xfaf8f5, 0.35, 0.15);
    const tankMat = mat(0xf0ece5, 0.35, 0.15);
    addBox(fw, 0.4, fd, 0, 0.2, 0, baseMat);
    addBox(fw * 0.8, 0.5, fd * 0.35, 0, 0.4, -fd / 2 + fd * 0.17, tankMat);
  } else if (lowerCls.includes('stairs')) {
    // Stairs: light stone steps
    const stepMat = mat(0xc8c0b4, 0.55, 0.05);
    const steps = 6;
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

  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  group.position.set(cx, 0, cy);

  // Orientation system:
  // 1) Vertical bboxes need 90° rotation so long axis aligns with Z
  // 2) Directional furniture orients its back (-Z local) toward nearest wall
  const directionalTypes = ['sofa', 'bed', 'chair', 'accent chair', 'wardrobe',
    'fridge', 'tv', 'commode', 'washing machine', 'crockery unit',
    'foyer cabinet', 'book cabinet', 'kitchen-slab', 'stove', 'sink', 'wash',
    'stairs', 'spiral-stairs', 'lift', 'elevator'];
  const isDirectional = directionalTypes.some(t => lowerCls.includes(t));

  let orientHoriz = horizontal;
  let nearestProj = null;
  if (isDirectional && walls && walls.length) {
    const { wall, projX, projY } = findNearestWall(bbox, walls);
    nearestProj = { projX, projY };
    if (wall && wall.start && wall.end) {
      const wdx = wall.end.x - wall.start.x;
      const wdy = wall.end.y - wall.start.y;
      orientHoriz = Math.abs(wdx) >= Math.abs(wdy);
    }
  }

  let rot = orientHoriz ? 0 : Math.PI / 2;

  // For directional furniture, orient back toward nearest wall
  if (isDirectional && nearestProj) {
    const { projX, projY } = nearestProj;
    if (orientHoriz) {
      // Long side along X. Back faces -Z by default.
      // If wall is at +Z side (projY > cy), rotate 180° so back faces +Z
      if (projY > cy) rot += Math.PI;
    } else {
      // After 90° rotation, back faces -X.
      // If wall is at +X side (projX > cx), rotate 180° so back faces +X
      if (projX > cx) rot += Math.PI;
    }
  }

  group.rotation.y = rot;
  console.log(`[object] ${cls} horiz=${horizontal} rot=${(rot * 180 / Math.PI).toFixed(0)}° walls=${walls.length} pos=(${cx.toFixed(1)},${cy.toFixed(1)})`);

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
