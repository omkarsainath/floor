import * as THREE from 'three';

// ── Procedural texture generators ───────────────────────

function generateWoodTexture(w = 512, h = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Base warm wood
  ctx.fillStyle = '#c8956c';
  ctx.fillRect(0, 0, w, h);
  // Planks
  const plankH = h / 6;
  for (let i = 0; i < 7; i++) {
    const y = i * plankH;
    const shade = 0.85 + Math.random() * 0.3;
    const r = Math.floor(200 * shade), g = Math.floor(149 * shade), b = Math.floor(108 * shade);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y + 1, w, plankH - 2);
    // Wood grain lines
    ctx.strokeStyle = `rgba(90,55,30,${0.08 + Math.random() * 0.06})`;
    ctx.lineWidth = 1;
    for (let l = 0; l < 8; l++) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.random() * plankH);
      for (let x = 0; x < w; x += 20) {
        ctx.lineTo(x, y + Math.random() * plankH);
      }
      ctx.stroke();
    }
    // Plank gap
    ctx.fillStyle = 'rgba(60,35,15,0.4)';
    ctx.fillRect(0, y, w, 1.5);
  }
  return canvas;
}

function generateTileTexture(w = 512, h = 512, tileColor = '#ddd8d0', groutColor = '#b8b0a4') {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = groutColor;
  ctx.fillRect(0, 0, w, h);
  const tileSize = w / 4;
  const gap = 3;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const shade = 0.95 + Math.random() * 0.1;
      const base = parseInt(tileColor.slice(1), 16);
      const br = Math.floor(((base >> 16) & 0xff) * shade);
      const bg = Math.floor(((base >> 8) & 0xff) * shade);
      const bb = Math.floor((base & 0xff) * shade);
      ctx.fillStyle = `rgb(${br},${bg},${bb})`;
      ctx.fillRect(c * tileSize + gap, r * tileSize + gap, tileSize - gap * 2, tileSize - gap * 2);
    }
  }
  return canvas;
}

function generateMarbleTexture(w = 512, h = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  // White base
  ctx.fillStyle = '#f0ece5';
  ctx.fillRect(0, 0, w, h);
  // Marble veins
  ctx.strokeStyle = 'rgba(160,150,140,0.15)';
  ctx.lineWidth = 2;
  for (let v = 0; v < 12; v++) {
    ctx.beginPath();
    let x = Math.random() * w, y = Math.random() * h;
    ctx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (Math.random() - 0.5) * 120;
      y += (Math.random() - 0.5) * 120;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Subtle gray veins
  ctx.strokeStyle = 'rgba(120,115,110,0.1)';
  ctx.lineWidth = 4;
  for (let v = 0; v < 5; v++) {
    ctx.beginPath();
    let x = Math.random() * w, y = Math.random() * h;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 160;
      y += (Math.random() - 0.5) * 160;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return canvas;
}

function generateCarpetTexture(w = 256, h = 256, baseColor = '#8fa87e') {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, w, h);
  // Subtle fiber noise
  const imgData = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 15;
    imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + noise));
    imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + noise));
    imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// ── Texture cache ───────────────────────────────────────
const _texCache = {};
function getCachedTexture(key, generator) {
  if (!_texCache[key]) {
    const canvas = generator();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    _texCache[key] = tex;
  }
  return _texCache[key];
}

// ── Room type → floor style mapping ─────────────────────
function getFloorStyle(roomType) {
  const t = (roomType || '').toLowerCase();
  if (t.includes('kitchen'))    return { type: 'tile', color: '#ddd8d0' };
  if (t.includes('bath'))       return { type: 'marble' };
  if (t.includes('bedroom'))    return { type: 'wood' };
  if (t.includes('living'))     return { type: 'wood' };
  if (t.includes('dining'))     return { type: 'wood' };
  if (t.includes('entrance') || t.includes('foyer') || t.includes('hallway'))
    return { type: 'tile', color: '#c8c0b4' };
  if (t.includes('balcony') || t.includes('terrace'))
    return { type: 'tile', color: '#b8c4b0' };
  return { type: 'wood' };
}

// ── Public API ──────────────────────────────────────────

export function createFloor(points, { roomType = '', color, opacity = 1.0 } = {}) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error('Floor requires at least 3 points');
  }
  const shape = new THREE.Shape();
  const [first, ...rest] = points;
  shape.moveTo(first.x, first.y);
  rest.forEach((p) => shape.lineTo(p.x, p.y));
  shape.lineTo(first.x, first.y);

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);

  // Determine floor material based on room type
  const style = getFloorStyle(roomType);
  let material;

  if (style.type === 'wood') {
    const tex = getCachedTexture('wood', generateWoodTexture);
    material = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.65, metalness: 0.0,
      side: THREE.DoubleSide, opacity, transparent: opacity < 1,
    });
  } else if (style.type === 'marble') {
    const tex = getCachedTexture('marble', generateMarbleTexture);
    material = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.25, metalness: 0.05,
      side: THREE.DoubleSide, opacity, transparent: opacity < 1,
    });
  } else if (style.type === 'tile') {
    const key = 'tile_' + (style.color || '#ddd8d0');
    const tex = getCachedTexture(key, () => generateTileTexture(512, 512, style.color));
    material = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.6, metalness: 0.05,
      side: THREE.DoubleSide, opacity, transparent: opacity < 1,
    });
  } else if (style.type === 'carpet') {
    const tex = getCachedTexture('carpet', () => generateCarpetTexture(256, 256, style.color));
    material = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.95, metalness: 0.0,
      side: THREE.DoubleSide, opacity, transparent: opacity < 1,
    });
  } else {
    material = new THREE.MeshStandardMaterial({
      color: color || 0xc8956c, roughness: 0.7, metalness: 0.0,
      side: THREE.DoubleSide, opacity, transparent: opacity < 1,
    });
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.position.y = 0.005;
  return mesh;
}
