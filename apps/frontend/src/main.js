import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createBasicScene } from './scene/scene.js';
import { loadLayout } from './loaders/jsonLoader.js';
import { createFloor } from './generators/floor.js';
import { createWall } from './generators/wall.js';
import { createCeiling } from './generators/ceiling.js';
import { createObject } from './generators/object.js';
import { setupViewerControls } from './controls/controls.js';
import { createAIChatPanel } from './ai/chatPanel.js';

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

// Raycaster for door clicking
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const clickableDoors = [];

const isAxisAligned = (dx, dy, tol = 0.15) => {
  const len = Math.hypot(dx, dy);
  if (len === 0) return false;
  return Math.abs(dx) / len >= 1 - tol || Math.abs(dy) / len >= 1 - tol;
};

// Extend wall endpoints to reach nearby perpendicular walls (T-junctions)
// and add baseline extension for corner overlaps
const extendWalls = (walls, baseExt = 0.12) => {
  // For each wall endpoint, check if there's a perpendicular wall nearby
  // and extend to reach its center line
  return walls.map((w) => {
    if (!w.start || !w.end) return w;
    const dx = w.end.x - w.start.x;
    const dy = w.end.y - w.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return w;
    const ux = dx / len;
    const uy = dy / len;
    const horiz = Math.abs(dx) >= Math.abs(dy);

    // Find how much to extend each end
    let extStart = baseExt;
    let extEnd = baseExt;

    walls.forEach((other) => {
      if (other === w || !other.start || !other.end) return;
      const odx = other.end.x - other.start.x;
      const ody = other.end.y - other.start.y;
      const oHoriz = Math.abs(odx) >= Math.abs(ody);
      if (oHoriz === horiz) return; // skip parallel walls

      // Check if wall's start endpoint is near this perpendicular wall
      const checkEndpoint = (pt, isStart) => {
        // Project point onto the perpendicular wall segment
        const ax = other.start.x, ay = other.start.y;
        const bx = other.end.x, by = other.end.y;
        const abx = bx - ax, aby = by - ay;
        const len2 = abx * abx + aby * aby;
        if (len2 < 0.001) return;
        let t = ((pt.x - ax) * abx + (pt.y - ay) * aby) / len2;
        t = Math.max(0, Math.min(1, t));
        const projX = ax + t * abx;
        const projY = ay + t * aby;
        const dist = Math.hypot(pt.x - projX, pt.y - projY);
        // If endpoint is close to perpendicular wall, extend to reach it
        if (dist < 0.5 && dist > 0.01) {
          const needed = dist + 0.05; // extend past center for overlap
          if (isStart) extStart = Math.max(extStart, needed);
          else extEnd = Math.max(extEnd, needed);
        }
      };

      checkEndpoint(w.start, true);
      checkEndpoint(w.end, false);
    });

    return {
      ...w,
      start: { x: w.start.x - ux * extStart, y: w.start.y - uy * extStart },
      end: { x: w.end.x + ux * extEnd, y: w.end.y + uy * extEnd },
    };
  });
};

const mergeIntervals = (intervals) => {
  if (!intervals.length) return [];
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const [start, end] = sorted[i];
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
};

const carveWalls = (walls = [], doorBoxes = []) => {
  if (!doorBoxes.length) return walls;
  const carved = [];
  walls.forEach((wall) => {
    const { start, end } = wall;
    if (!start || !end) return;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (!isAxisAligned(dx, dy)) {
      carved.push(wall);
      return;
    }
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const x1 = start.x;
    const x2 = end.x;
    const y1 = start.y;
    const y2 = end.y;
    const spanStart = horizontal ? Math.min(x1, x2) : Math.min(y1, y2);
    const spanEnd = horizontal ? Math.max(x1, x2) : Math.max(y1, y2);
    const coord = horizontal ? (y1 + y2) / 2 : (x1 + x2) / 2;
    const wallThick = wall.thickness || 0.15;
    const halfThick = wallThick / 2;
    const inset = 0.05; // shrink gap edges to preserve walls between adjacent doors
    const gaps = [];
    doorBoxes.forEach((bbox) => {
      if (!bbox) return;
      const bx1 = Math.min(bbox.x1, bbox.x2);
      const bx2 = Math.max(bbox.x1, bbox.x2);
      const by1 = Math.min(bbox.y1, bbox.y2);
      const by2 = Math.max(bbox.y1, bbox.y2);
      if (horizontal) {
        // Door must straddle the wall: bbox extends on BOTH sides of wall center
        if (by1 > coord + halfThick || by2 < coord - halfThick) return;
        if (by1 > coord - halfThick || by2 < coord + halfThick) {
          // bbox doesn't clearly straddle — skip unless very close
          const above = coord - by1;
          const below = by2 - coord;
          if (above < 0.05 || below < 0.05) return;
        }
        const gapStart = Math.max(spanStart, bx1 + inset);
        const gapEnd = Math.min(spanEnd, bx2 - inset);
        if (gapEnd > gapStart) gaps.push([gapStart, gapEnd]);
      } else {
        // Door must straddle the wall: bbox extends on BOTH sides of wall center
        if (bx1 > coord + halfThick || bx2 < coord - halfThick) return;
        if (bx1 > coord - halfThick || bx2 < coord + halfThick) {
          const left = coord - bx1;
          const right = bx2 - coord;
          if (left < 0.05 || right < 0.05) return;
        }
        const gapStart = Math.max(spanStart, by1 + inset);
        const gapEnd = Math.min(spanEnd, by2 - inset);
        if (gapEnd > gapStart) gaps.push([gapStart, gapEnd]);
      }
    });
    if (!gaps.length) {
      carved.push(wall);
      return;
    }
    const merged = mergeIntervals(gaps);
    let cursor = spanStart;
    merged.forEach(([gapStart, gapEnd]) => {
      if (gapStart > cursor) {
        const segStart = cursor;
        const segEnd = gapStart;
        carved.push({
          ...wall,
          start: horizontal
            ? { x: segStart, y: start.y }
            : { x: start.x, y: segStart },
          end: horizontal
            ? { x: segEnd, y: end.y }
            : { x: end.x, y: segEnd },
        });
      }
      cursor = Math.max(cursor, gapEnd);
    });
    if (cursor < spanEnd) {
      carved.push({
        ...wall,
        start: horizontal
          ? { x: cursor, y: start.y }
          : { x: start.x, y: cursor },
        end: horizontal
          ? { x: spanEnd, y: end.y }
          : { x: end.x, y: spanEnd },
      });
    }
  });
  return carved;
};

function onMouseClick(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(clickableDoors, true);

  if (intersects.length > 0) {
    // Find the door hinge (parent of the clicked mesh)
    let target = intersects[0].object;
    while (target && !target.userData.isDoor) {
      target = target.parent;
    }

    if (target && target.userData.isDoor) {
      toggleDoor(target);
    }
  }
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

async function initLayout() {
  try {
    // Check for tracer data in localStorage first
    let layout;
    const storedData = localStorage.getItem('preciseFloorplan');
    
    let layoutSource = 'file';
    if (storedData) {
      // Use traced data from localStorage
      const parsed = JSON.parse(storedData);
      layout = { rooms: parsed.rooms || [], walls: parsed.walls || [], objects: parsed.objects || [] };
      layoutSource = 'tracer';
      console.log('Loaded traced floorplan from localStorage', {
        rooms: layout.rooms.length,
        walls: layout.walls.length,
        objects: layout.objects.length
      });
    } else {
      // Fall back to file
      layout = await loadLayout('/apps/frontend/precise_floorplan.json');
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
    
    // Extend walls to close corner and T-junction gaps
    const extWalls = extendWalls(layout.walls || []);

    const doorBoxes = (layout.objects || [])
      .filter((obj) => obj?.class?.toLowerCase().includes('door'))
      .map((obj) => obj.bbox)
      .filter(Boolean);
    const carvedWalls = carveWalls(extWalls, doorBoxes);

    // Render walls
    carvedWalls.forEach((wall) => {
      const wallMesh = createWall(wall);
      scene.add(wallMesh);
    });
    
    // Room-type classes (spatial areas, not physical objects)
    const roomClasses = new Set([
      'bedroom', 'bathroom', 'kitchen', 'living room', 'dining room',
      'balcony', 'hallway', 'foyer', 'study room', 'utility', 'garage',
      'terrace', 'walkin', 'lobby', 'parking', 'storage', 'duct',
      'sit-out', 'pre-foyer', 'flexroom',
    ]);

    // Add doors, windows, and furniture (skip room labels)
    layout.objects.forEach((obj) => {
      const cls = (obj.class || '').toLowerCase();
      if (roomClasses.has(cls)) return; // skip room-type detections
      const objMesh = createObject({ ...obj, layoutCenter, walls: layout.walls });
      if (objMesh) {
        scene.add(objMesh);
        if (cls.includes('door')) {
          clickableDoors.push(objMesh);
          objMesh.traverse((child) => {
            if (child.isMesh) clickableDoors.push(child);
          });
        }
      }
    });
    
    let ceilingMesh = null;
    
    // If no rooms defined, create floor from wall boundaries
    if (!layout.rooms || layout.rooms.length === 0) {
      if (layout.walls && layout.walls.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        layout.walls.forEach(w => {
          minX = Math.min(minX, w.start.x, w.end.x);
          maxX = Math.max(maxX, w.start.x, w.end.x);
          minY = Math.min(minY, w.start.y, w.end.y);
          maxY = Math.max(maxY, w.start.y, w.end.y);
        });
        const padding = 0.5;
        minX -= padding; maxX += padding;
        minY -= padding; maxY += padding;
        
        const floorPoints = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY }
        ];
        
        const floorMesh = createFloor(floorPoints);
        scene.add(floorMesh);
        
        ceilingMesh = createCeiling([{ points: floorPoints }]);
        if (ceilingMesh) scene.add(ceilingMesh);
      }
    } else {
      layout.rooms.forEach((room) => {
        const floorMesh = createFloor(room.points, { roomType: room.type || room.name || '' });
        scene.add(floorMesh);
      });
      ceilingMesh = createCeiling(layout.rooms);
      if (ceilingMesh) scene.add(ceilingMesh);
    }
    
    setupViewerControls({ camera, controls, ceilingMesh });

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

    // Store layout for AI access and initialize chat panel
    layoutRef.current = layout;
    createAIChatPanel(scene, layoutRef);
  } catch (err) {
    console.error('Failed to load layout:', err);
  }
}

function onWindowResize() {
  const { innerWidth, innerHeight } = window;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

window.addEventListener('resize', onWindowResize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

initLayout();
animate();
