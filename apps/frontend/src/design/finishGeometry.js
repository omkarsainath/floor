import { addWallIllumination } from './wallIllumination.js';
import { customMuralAssets } from './customWallStyles.js';
import { muralBounds, muralGeometry, createMuralMaterial, HORSE_MURAL } from './wallMural.js';
import { createReliefGeometry, reliefDepth } from './wallReliefs.js';
import * as THREE from 'three';
import {stoneMaterial} from '../materials/stone.js';
import { isProfileCeiling } from './ceilingTypes.js';
import { buildCeilingProfile } from './ceilingProfiles.js';
import { normalizeWallPanelRegions, clipWallSurfacesToRegion } from './wallPanelRegions.js';

const EPS = 1e-7;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const colorValue = (value, fallback) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function roomPolygon(room) {
  const source = room?.points || room?.polygon;
  if (!Array.isArray(source)) return [];
  const points = source.map(p => ({ x: p?.x, y: p?.y }));
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return [];
  if (points.length > 3 && Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) < EPS) points.pop();
  return points.length >= 3 ? points : [];
}

// Intersect each triangulated room face with a convex design region. This keeps
// ceilings inside concave room outlines without filling the outline's bounds.
function clipConvex(subject, clip) {
  const signedArea = clip.reduce((sum, p, i) => sum + p.x * clip[(i + 1) % clip.length].y - clip[(i + 1) % clip.length].x * p.y, 0);
  const direction = signedArea >= 0 ? 1 : -1;
  let result = subject;
  for (let i = 0; i < clip.length && result.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], input = result;
    result = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length];
      const dp = direction * cross(a, b, p), dq = direction * cross(a, b, q);
      if (dp >= -EPS) result.push(p);
      if ((dp >= -EPS) !== (dq >= -EPS)) {
        const t = dp / (dp - dq);
        result.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
  return result;
}

const rectangle = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
function flatGeometry(polygons, elevation, tileWidth = 1, tileDepth = 1) {
  const positions = [], uvs = [];
  for (const polygon of polygons) {
    const vectors = polygon.map(p => new THREE.Vector2(p.x, p.y));
    for (const triangle of THREE.ShapeUtils.triangulateShape(vectors, [])) {
      // Reverse XY winding because plan Y maps to world Z.
      for (const index of [...triangle].reverse()) {
        const p = polygon[index];
        positions.push(p.x, elevation, p.y);
        uvs.push(p.x / tileWidth, p.y / tileDepth);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

// Small deterministic CPU-generated maps work in the browser and in tests.
// UVs are metres, so a nominal 800 x 1600 mm tile keeps that size in every room.
function surfaceTexture(style) {
  const size = style.pattern === 'herringbone' ? 256 : 128, data = new Uint8Array(size * size * 4);
  const base = new THREE.Color(colorValue(style.color, '#ded9cf'));
  base.convertLinearToSRGB();
  const grainPatterns = ['woodPlanks', 'herringbone', 'veneer', 'woodSlats', 'mediaVeneer', 'mediaFluted', 'ceilingPlanks'];
  const isWood = grainPatterns.includes(style.pattern);
  const herringRatio = Math.max(2, Math.round(finite(style.tileDepthM, 0.6) / finite(style.tileWidthM, 0.12)));
  const grout = !['microcement', 'veneer', 'upholstery', 'acrylic', 'mediaLaminate'].includes(style.pattern);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const noise = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    let shade = 0.97 + (noise - Math.floor(noise)) * 0.055;
    let joint = grout && (u < 0.006 || v < 0.008);
    if (isWood) shade += 0.035 * Math.sin(u * 160 + Math.sin(v * 18) * 1.5) + 0.025 * Math.sin(u * 680 + v * 10);
    if (style.pattern === 'woodPlanks') joint = mod(u * 2, 1) < 0.012 || mod(v + Math.floor(u * 2) * 0.5, 1) < 0.005;
    if (style.pattern === 'herringbone') {
      // Interlocking rectangular planks, rotated 45 degrees; joint lines
      // distinguish herringbone ends from a simple chevron stripe texture.
      const q = (u + v) * herringRatio, r = (u - v) * herringRatio;
      const ix = Math.floor(q), iy = Math.floor(r), band = mod(ix - iy, herringRatio * 2);
      const horizontal = band < herringRatio;
      const along = horizontal ? mod(q - iy, herringRatio * 2) : mod(r - ix - 1, herringRatio * 2);
      const across = horizontal ? mod(r, 1) : mod(q, 1);
      joint = across < 0.015 || along < 0.015 || along > herringRatio - 0.015;
      shade += (horizontal ? 0.04 : -0.035) + Math.sin(across * 70 + along * 2) * 0.035;
    } else if (style.pattern.includes('marble') || style.pattern === 'stoneSlabs' || style.pattern === 'mediaMarble') {
      const vein = Math.abs(Math.sin(u * 7 + v * 10 + Math.sin(u * 16 + v * 3) * 0.5));
      shade -= Math.pow(1 - vein, 18) * 0.17;
    }
    if (joint) shade *= isWood ? 0.64 : 0.82;
    const index = (y * size + x) * 4;
    data[index] = clamp(base.r * shade * 255, 0, 255);
    data[index + 1] = clamp(base.g * shade * 255, 0, 255);
    data[index + 2] = clamp(base.b * shade * 255, 0, 255);
    data[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function standardMaterial(style, { textured = false, accent = false, emissive = false } = {}) {
  if(style.stoneId)return stoneMaterial(style.stoneId);
  const color = colorValue(accent ? style.accentColor : style.color, accent ? '#927454' : '#e7e3dc');
  return new THREE.MeshStandardMaterial({
    color: textured ? '#ffffff' : color,
    map: textured ? surfaceTexture(style) : null,
    roughness: clamp(finite(style.roughness, 0.65), 0.04, 1),
    metalness: clamp(finite(style.metalness, 0), 0, 1),
    side: THREE.DoubleSide,
    ...(emissive ? { emissive: '#ffe3b1', emissiveIntensity: 0.6 } : {}),
  });
}

function addMesh(parent, geometry, material, tags) {
  if (!geometry.attributes.position?.count) { geometry.dispose(); return null; }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = tags.type !== 'floor';
  mesh.userData = { isRoomFinish: true, roomId: parent.userData.roomId, ...tags };
  parent.add(mesh);
  return mesh;
}

function addFloor(group, polygon, style, holes = []) {
  let width = clamp(finite(style.tileWidthM, style.pattern === 'woodPlanks' ? 0.18 : 0.8), 0.05, 4);
  let depth = clamp(finite(style.tileDepthM, style.pattern === 'woodPlanks' ? 1.2 : 0.8), 0.05, 4);
  if (style.pattern === 'woodPlanks') width *= 2;
  if (style.pattern === 'herringbone') width = depth = Math.SQRT2 * Math.max(2, Math.round(depth / width)) * width;
  const vectors=polygon.map(p=>new THREE.Vector2(p.x,p.y)),rings=holes.map(h=>h.map(p=>new THREE.Vector2(p.x,p.y))),vertices=[...polygon,...holes.flat()];
  const faces=THREE.ShapeUtils.triangulateShape(vectors,rings).map(t=>t.map(i=>vertices[i]));
  addMesh(group, flatGeometry(faces, 0.008, width, depth), standardMaterial(style, { textured: true }),
    { type: 'floor', isRoomFinishFloor: true, walkIgnore: true, category: 'floor', styleId: style.id });
}

function addCeiling(group, polygon, height, style, wallSurfaces = []) {
  const minX = Math.min(...polygon.map(p => p.x)), maxX = Math.max(...polygon.map(p => p.x));
  const minY = Math.min(...polygon.map(p => p.y)), maxY = Math.max(...polygon.map(p => p.y));
  const w = maxX - minX, d = maxY - minY;
  const drop = clamp(finite(style.dropM, 0.15), 0.02, Math.min(0.45, height / 4));
  const base = standardMaterial(style, { textured: ['ceilingPlanks', 'ceilingTiles'].includes(style.pattern) });
  const accent = standardMaterial(style, { accent: true });
  const light = standardMaterial(style, { emissive: true });
  const triangles = THREE.ShapeUtils.triangulateShape(polygon.map(p => new THREE.Vector2(p.x, p.y)), []).map(t => t.map(i => polygon[i]));
  const tags = { type: 'ceiling', category: 'ceiling', styleId: style.id, roomId: group.userData.roomId };
  const patch = (region, y, material = base, thickness = Math.max(0.02, height - y)) => {
    const clipped = region ? triangles.map(t => clipConvex(t, region)).filter(p => p.length >= 3) : [polygon];
    if (!clipped.length) return;
    const geometry = flatGeometry(clipped, y, finite(style.tileWidthM, 0.61), finite(style.tileDepthM, 0.61));
    const pos = [...geometry.attributes.position.array], uv = [...geometry.attributes.uv.array];
    for (const p of clipped) {
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        pos.push(a.x, y, a.y, b.x, y, b.y, b.x, y + thickness, b.y,
          a.x, y, a.y, b.x, y + thickness, b.y, a.x, y + thickness, a.y);
        uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    // The collider accepts several separately clipped polygons for patches,
    // and one concave outline for the full foundation. Coordinates are world
    // X/Z; this group deliberately has an identity transform.
    addMesh(group, geometry, material, { ...tags, finishedHeightM: y,
      ...(region ? { walkFootprints: clipped.map(p => p.map(v => ({ x: v.x, z: v.y }))) }
        : { walkFootprint: polygon.map(v => ({ x: v.x, z: v.y })) }) });
  };
  // A room-shaped foundation is always retained. The slab underside is the
  // physical finish height, not an invisible change to the traced wall height.
  const flatDrop = ['ceilingPlanks', 'ceilingTiles'].includes(style.pattern) ? drop : 0.035;
  patch(null, height - flatDrop);
  if (style.pattern === 'tray' && style.roomType === 'bedroom') {
    const inset = Math.min(0.3, w / 5, d / 5);
    patch(rectangle(minX + inset, minY + inset + 0.03, maxX - inset, maxY - inset - 0.03), height - drop);
    patch(rectangle(minX + inset, minY + inset, maxX - inset, minY + inset + 0.025), height - drop, light, 0.005);
    patch(rectangle(minX + inset, maxY - inset - 0.025, maxX - inset, maxY - inset), height - drop, light, 0.005);
  } else if (['tray', 'flushBorder'].includes(style.pattern)) {
    const band = Math.min(0.4, w / 5, d / 5);
    const polygonArea = polygon.reduce((sum, p, i) => sum + p.x * polygon[(i + 1) % polygon.length].y - polygon[(i + 1) % polygon.length].x * p.y, 0);
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < EPS) continue;
      const sign = polygonArea > 0 ? 1 : -1, nx = -(b.y - a.y) / length * sign, ny = (b.x - a.x) / length * sign;
      const region = (from, to) => [
        { x: a.x + nx * from, y: a.y + ny * from }, { x: b.x + nx * from, y: b.y + ny * from },
        { x: b.x + nx * to, y: b.y + ny * to }, { x: a.x + nx * to, y: a.y + ny * to },
      ];
      patch(region(0, style.pattern === 'tray' ? band * 0.85 : band), height - drop, style.pattern === 'flushBorder' ? accent : base);
      if (style.pattern === 'tray') patch(region(band * 0.87, band * 0.97), height - drop, light, 0.005);
    }
  } else if (style.pattern === 'woodSlats') {
    const step = Math.max(finite(style.spacingM, 0.15), w / 40);
    for (let x = minX + w * 0.2; x < maxX - w * 0.2; x += step) patch(rectangle(x, minY, Math.min(x + step * 0.55, maxX), maxY), height - drop, accent);
  } else if (['coffered', 'ceilingTiles'].includes(style.pattern)) {
    const spacing = style.pattern === 'coffered' ? Math.max(finite(style.spacingM, 0.9), Math.max(w, d) / 16) : Math.max(finite(style.spacingM, 0.6096), Math.max(w, d) / 24);
    const beam = style.pattern === 'coffered' ? 0.11 : 0.015;
    for (let x = minX; x < maxX; x += spacing) patch(rectangle(x, minY, x + beam, maxY), height - drop, accent);
    for (let y = minY; y < maxY; y += spacing) patch(rectangle(minX, y, maxX, y + beam), height - drop, accent);
  } else if (style.pattern === 'cascade' && wallSurfaces.length) {
    const first = wallSurfaces[0], ax = first.end.x - first.start.x, ay = first.end.y - first.start.y, length = Math.hypot(ax, ay);
    const tx = ax / length, ty = ay / length, n = first.normal || { x: -ty, y: tx };
    const project = p => (p.x - first.start.x) * tx + (p.y - first.start.y) * ty;
    const endpoints = wallSurfaces.flatMap(s => [project(s.start), project(s.end)]);
    const lo = Math.min(...endpoints), hi = Math.max(...endpoints), bandWidth = Math.min(2.2, hi - lo), mid = (lo + hi) / 2;
    const at = (along, depth) => ({ x: first.start.x + tx * along + n.x * depth, y: first.start.y + ty * along + n.y * depth });
    patch([at(mid - bandWidth / 2, 0), at(mid + bandWidth / 2, 0), at(mid + bandWidth / 2, 1.5), at(mid - bandWidth / 2, 1.5)], height - drop);
    addWallFinish(group, wallSurfaces, { ...style, pattern: 'plain', zoneWidthM: bandWidth }, 'ceiling');
  } else if (style.pattern === 'linearDrop') {
    const width = Math.min(style.pattern === 'cascade' ? 1.7 : 0.5, w * 0.65);
    const center = (minX + maxX) / 2;
    patch(rectangle(center - width / 2, minY, center - width / 2 + 0.02, maxY), height - drop);
    patch(rectangle(center - width / 2 + 0.05, minY, center + width / 2, maxY), height - drop);
    patch(rectangle(center - width / 2 + 0.025, minY, center - width / 2 + 0.045, maxY), height - drop, light, 0.005);
  }
  // Unused optional materials must not leak when a pattern has no accent.
  for (const material of [base, accent, light]) {
    if (!group.children.some(mesh => mesh.material === material)) { material.map?.dispose(); material.dispose(); }
  }
}

function addWallFinish(group, surfaces, style, category, { regionId } = {}) {
  if (!surfaces.length) return;
  const origin = surfaces[0].start;
  const dx = surfaces[0].end.x - origin.x, dz = surfaces[0].end.y - origin.y;
  const length = Math.hypot(dx, dz);
  if (length < EPS) return;
  const tx = dx / length, tz = dz / length;
  const normal = surfaces[0].normal || { x: -tz, y: tx };
  const side = normal.x * -tz + normal.y * tx < 0 ? -1 : 1;
  const project = p => (p.x - origin.x) * tx + (p.y - origin.y) * tz;
  const spans = surfaces.map(s => ({ lo: Math.min(project(s.start), project(s.end)), hi: Math.max(project(s.start), project(s.end)),
    bottom: Math.max(0, finite(s.yOffset, 0)), top: finite(s.yOffset, 0) + finite(s.height, 3), wallId: s.parentWallId ?? s.wallId ?? s.id }));
  const low = Math.min(...spans.map(s => s.lo)), high = Math.max(...spans.map(s => s.hi)), fullWidth = high - low;
  const fullHeight = Math.max(...spans.map(s => s.top));
  const media = category === 'tvPanel', zoneWidth = regionId ? fullWidth : Math.min(fullWidth, finite(style.zoneWidthM, media ? Math.min(2.8, fullWidth * 0.82) : fullWidth));
  const zoneLow = (low + high - zoneWidth) / 2, zoneHigh = zoneLow + zoneWidth;
  const isWainscot = ['wainscot', 'mediaWainscot'].includes(style.pattern);
  // A marked area is the authority for its bounds, including floor/top edges.
  // Keep the historic preset heights only for unmarked whole-wall designs.
  const bottom = regionId ? Math.min(...spans.map(s => s.bottom)) : media && !isWainscot ? 0.42 : 0.02;
  const top = regionId ? fullHeight : Math.min(fullHeight - 0.015, isWainscot ? 1.1 : media ? 2.3 : fullHeight);
  if (top <= bottom || zoneWidth < EPS) return;
  const baseDepth = clamp(finite(style.depthM, 0.018), 0.004, 0.08);
  // A TV finish stands slightly forward of any selected wall panel. The screen
  // itself remains an independent, measured furniture object.
  const offset = media ? finite(style.mountOffsetM, 0.07) : 0.002;
  const base = standardMaterial(style, { textured: ['veneer', 'stoneSlabs', 'mediaMarble', 'mediaVeneer'].includes(style.pattern) });
  const accent = standardMaterial(style, { accent: true });
  const light = standardMaterial(style, { emissive: true });
  const panelGroup = new THREE.Group();
  panelGroup.position.set(origin.x, 0, origin.y);
  panelGroup.rotation.y = -Math.atan2(tz, tx);
  panelGroup.userData = { isRoomFinish: true, roomId: group.userData.roomId, category, styleId: style.id,
    ...(regionId ? { wallPanelRegionId: regionId } : {}) };
  group.add(panelGroup);
  const rect = (left, right, lower, upper, depth = baseDepth, material = base, extra = 0) => {
    for (const s of spans) {
      const a = Math.max(s.lo, left), b = Math.min(s.hi, right), y0 = Math.max(s.bottom, lower), y1 = Math.min(s.top, upper);
      if (b - a < EPS || y1 - y0 < EPS) continue;
      const geometry = new THREE.BoxGeometry(b - a, y1 - y0, depth);
      const mesh = addMesh(panelGroup, geometry, material, { type: 'wallFinish', category, styleId: style.id,
        parentWallId: s.wallId, isWall: true, finishDepthM: offset + extra + depth,
        ...(regionId ? { wallPanelRegionId: regionId } : {}) });
      mesh.position.set((a + b) / 2, (y0 + y1) / 2, side * (offset + extra + depth / 2));
    }
  };
  rect(zoneLow, zoneHigh, bottom, top);
  const stripPattern = ['slats', 'mediaFluted', 'mediaMarble'].includes(style.pattern);
  if (style.pattern === 'referenceMural') {
    const assets = style.image ? customMuralAssets(style) : HORSE_MURAL;
    const bounds = muralBounds(zoneLow, zoneHigh, bottom, top, assets.aspect);
    const material = createMuralMaterial(assets);
    for (const span of spans) {
      const geometry = muralGeometry(span, bounds, side, offset + baseDepth + .002, assets);
      if (geometry) addMesh(panelGroup, geometry, material, { type: 'wallFinish', category, styleId: style.id,
        parentWallId: span.wallId, isWall: true, isWallMural: true,
        finishDepthM: offset + baseDepth + .002 + assets.reliefM, ...(regionId ? { wallPanelRegionId: regionId } : {}) });
    }
    addWallIllumination(panelGroup, spans, bounds, side, offset + baseDepth + assets.reliefM);
    if (!panelGroup.children.some(mesh => mesh.material === material)) {
      material.muralLitMap.dispose(); material.muralUnlitMap.dispose(); material.dispose();
    }
  } else if (style.pattern === 'sculptedRelief') {
    const material = base.clone();
    material.color.set('#ffffff');
    material.vertexColors = true;
    for (const span of spans) {
      const geometry = createReliefGeometry({ motif: style.motif, span, left: zoneLow, right: zoneHigh,
        bottom, top, side, depth: offset + baseDepth + 0.001, color: style.color, accentColor: style.accentColor });
      if (geometry) addMesh(panelGroup, geometry, material, { type: 'wallFinish', category, styleId: style.id,
        parentWallId: span.wallId, isWall: true, finishDepthM: offset + baseDepth + 0.001 + reliefDepth(style.motif, zoneWidth, top - bottom),
        ...(regionId ? { wallPanelRegionId: regionId } : {}) });
    }
    if (!panelGroup.children.some(mesh => mesh.material === material)) material.dispose();
  } else if (stripPattern) {
    const slatEnd = style.pattern === 'mediaMarble' ? zoneLow + zoneWidth * 0.34 : zoneHigh;
    const spacing = Math.max(finite(style.spacingM, 0.065), zoneWidth / 60);
    for (let x = zoneLow; x < slatEnd; x += spacing) rect(x, Math.min(x + spacing * 0.55, slatEnd), bottom, top, 0.028, accent, baseDepth);
  } else if (['upholstery', 'geometricGrid', 'wainscot', 'mediaWainscot', 'mediaLaminate'].includes(style.pattern)) {
    const width = style.pattern === 'upholstery' ? 0.55 : 0.72;
    const count = Math.max(1, Math.min(24, Math.round(zoneWidth / width))), step = zoneWidth / count;
    if (style.pattern === 'upholstery') {
      const rows = Math.max(1, Math.min(8, Math.ceil((top - bottom) / 0.65))), h = (top - bottom) / rows;
      for (let col = 0; col < count; col++) for (let row = 0; row < rows; row++) {
        rect(zoneLow + col * step + 0.012, zoneLow + (col + 1) * step - 0.012, bottom + row * h + 0.012, bottom + (row + 1) * h - 0.012, 0.055, accent, baseDepth);
      }
    } else {
      for (let col = 0; col <= count; col++) rect(Math.max(zoneLow, zoneLow + col * step - 0.012), Math.min(zoneHigh, zoneLow + col * step + 0.012), bottom, top, 0.018, accent, baseDepth);
      const rows = style.pattern === 'geometricGrid' ? Math.max(1, Math.round((top - bottom) / 0.6)) : 1;
      for (let row = 0; row <= rows; row++) {
        const y = bottom + (top - bottom) * row / rows;
        rect(zoneLow, zoneHigh, Math.max(bottom, y - 0.016), Math.min(top, y + 0.016), 0.02, accent, baseDepth);
      }
    }
  } else if (['mediaVeneer', 'mediaRecessed'].includes(style.pattern)) {
    const width = style.pattern === 'mediaRecessed' ? 0.12 : 0.04;
    rect(zoneLow, zoneLow + width, bottom, top, 0.06, accent, baseDepth);
    rect(zoneHigh - width, zoneHigh, bottom, top, 0.06, accent, baseDepth);
    rect(zoneLow, zoneHigh, top - 0.035, top, 0.005, light, baseDepth + 0.003);
    if (style.pattern === 'mediaRecessed') rect(zoneLow, zoneHigh, bottom, bottom + 0.08, 0.06, accent, baseDepth);
  }
  for (const material of [base, accent, light]) {
    if (!panelGroup.children.some(mesh => mesh.material === material)) { material.map?.dispose(); material.dispose(); }
  }
}

/**
 * Build a disposable preview from metre-based, inside-face room geometry.
 * wallSurfaces MUST already be carved around doors/windows and clipped to the
 * room's wall faces. No bounding-box inference or image scale change occurs.
 * styleLookup accepts getFinishStyle(id), or a dictionary keyed by style id.
 */
export function buildRoomFinish({ room, walls = [], wallSurfaces, wallSegments, selection = {}, styleLookup } = {}) {
  const group = new THREE.Group();
  group.name = `Room finishes: ${room?.name || room?.id || 'room'}`;
  group.userData = { isRoomFinish: true, roomId: room?.id, previewOnly: true };
  const polygon = roomPolygon(room);
  if (polygon.length < 3 || room?.boundary_source === 'detection_bbox') return group;
  const resolve = category => {
    const id = typeof selection[category] === 'string' ? selection[category] : selection[category]?.id;
    if (!id) return null;
    const style = typeof styleLookup === 'function' ? styleLookup(id) : styleLookup?.[id];
    if (!style || (style.category && style.category !== category)) return null;
    return { ...style, pattern: style.pattern || 'plain', accentColor: colorValue(selection.color, style.accentColor),
      ...(category === 'ceiling' ? { dropM: finite(selection.ceilingDropM, 0.15) } : {}) };
  };
  const allSurfaces = (wallSurfaces || wallSegments || []).filter(s =>
    s?.start && s?.end && [s.start.x, s.start.y, s.end.x, s.end.y].every(Number.isFinite)
    && Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y) > EPS && finite(s.height, 3) > 0);
  const surfaces = allSurfaces.filter(s => selection.accentWallId == null
    || String(s.parentWallId ?? s.wallId ?? s.id) === String(selection.accentWallId));
  const firstId = surfaces[0]?.parentWallId ?? surfaces[0]?.wallId ?? surfaces[0]?.id;
  const accentSurfaces = surfaces.filter(s => (s.parentWallId ?? s.wallId ?? s.id) === firstId);
  const floor = resolve('floor'), ceiling = resolve('ceiling');
  if (floor) addFloor(group, polygon, floor, room.floorHoles || []);
  if (isProfileCeiling(ceiling)) {
    group.add(buildCeilingProfile({ room, style: ceiling, selection }));
  } else if (ceiling) {
    const ceilingGroup = new THREE.Group();
    ceilingGroup.userData = { isRoomFinish: true, type: 'ceiling', roomId: room?.id, category: 'ceiling', styleId: ceiling.id };
    group.add(ceilingGroup);
    addCeiling(ceilingGroup, polygon, clamp(finite(room.height, 3), 0.3, 30), ceiling, accentSurfaces);
  }
  const hasMarkedRegions = Array.isArray(selection.wallPanelRegions) && selection.wallPanelRegions.length > 0;
  for (const region of normalizeWallPanelRegions(selection.wallPanelRegions)) {
    const wall = walls.find(candidate => String(candidate.id) === region.wallId);
    const style = typeof styleLookup === 'function' ? styleLookup(region.styleId) : styleLookup?.[region.styleId];
    if (!wall || style?.category !== 'wallPanel') continue;
    const clipped = clipWallSurfacesToRegion(allSurfaces, wall, region);
    addWallFinish(group, clipped, { ...style, accentColor: colorValue(selection.color, style.accentColor) }, 'wallPanel', { regionId: region.id });
  }
  // Without an explicit accent choice use one real wall, never all walls or a
  // guessed central plane that could cross an opening.
  for (const category of ['wallPanel', 'tvPanel']) {
    if (category === 'wallPanel' && hasMarkedRegions) continue;
    const style = resolve(category);
    if (style && category === 'tvPanel') {
      let front = 0;
      group.traverse(node => { if (node.userData.category === 'wallPanel' && String(node.userData.parentWallId) === String(firstId)) front = Math.max(front, node.userData.finishDepthM || 0); });
      style.mountOffsetM = Math.max(0.07, front + 0.005);
    }
    if (style) addWallFinish(group, accentSurfaces, style, category);
  }
  return group;
}

/** Dispose only this preview's resources; no catalog or source mesh is shared. */
export function disposeRoomFinish(group) {
  if (!group?.userData?.isRoomFinish) return;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(child => {
    if (child.isLight) { if (child.map?.isTexture) textures.add(child.map); child.dispose?.(); }
    if (child.geometry) geometries.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : child.material ? [child.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
  group.removeFromParent();
  group.clear();
}
