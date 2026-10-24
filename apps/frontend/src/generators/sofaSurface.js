import * as THREE from 'three';

const textures = new Map();
// One tile spans 12 cm, regardless of cushion dimensions. Mipmaps keep the
// sub-millimetre threads from turning into stripes when viewed across a room.
export function sofaSurfaceTexture(kind = 'weave') {
  if (textures.has(kind)) return textures.get(kind);
  const size = 256, data = new Uint8Array(size * size * 4);
  let seed = 7321;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const noise = seed / 4294967296 - .5;
    const yarn = Math.sin(x * Math.PI / 2) * Math.cos(y * Math.PI / 2);
    const grain = Math.sin(y * .48 + 1.5 * Math.sin(x * .025)) * .045;
    const fleck = Math.sin(x * .27 + Math.sin(y * .19)) * Math.sin(y * .31 + Math.sin(x * .21));
    const value = kind === 'wood' ? .86 + grain + noise * .04
      : kind === 'cloth' ? .94 + noise * .035 + fleck * .009 + yarn * .012
      : kind === 'damask' ? .84 + .1 * Math.cos((x + y) * Math.PI / 64) * Math.cos((x - y) * Math.PI / 64) + noise * .025
      : kind === 'roughness' ? .9 + yarn * .035 + noise * .05
      : .55 + yarn * .15 + noise * .16;
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.round(value * 255);
    data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = `Sofa ${kind} · physical scale`;
  if (['wood', 'cloth', 'damask'].includes(kind)) texture.colorSpace = THREE.SRGBColorSpace;
  texture.channel = 1;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  textures.set(kind, texture);
  return texture;
}

export function sofaSurfaceUVs(geometry) {
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    uv[i * 2] = (nx > ny && nx > nz ? p.getZ(i) : p.getX(i)) / .12;
    uv[i * 2 + 1] = (ny > nx && ny > nz ? p.getZ(i) : p.getY(i)) / .12;
  }
  geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

export function sofaPatchworkTexture(kind='bowtie', background='#263436', accent='#cec5ad') {
  const key=`${kind}:${background}:${accent}`;
  if(textures.has(key))return textures.get(key);
  const a=new THREE.Color(background),b=new THREE.Color(accent),size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/(size-1),v=y/(size-1),edge=.44*(1-Math.abs(2*v-1));
    const light=kind==='bowtie'?(u<edge||u>1-edge):((u<.5)!==(v<.5));
    const color=(light?b:a).clone().convertLinearToSRGB(),i=(y*size+x)*4;
    data[i]=Math.round(color.r*255);data[i+1]=Math.round(color.g*255);data[i+2]=Math.round(color.b*255);data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);texture.colorSpace=THREE.SRGBColorSpace;
  texture.name=`Catalogue ${kind} upholstery`;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=8;texture.needsUpdate=true;textures.set(key,texture);return texture;
}

// Index projected triangles once instead of raycasting every seam sample
// against the entire cushion. This keeps catalogue placement responsive.
export function sofaFrontSampler(geometry) {
  const p = geometry.attributes.position, index = geometry.index, cells = new Map(), cellSize = .035;
  const key = (x, y) => `${x},${y}`;
  for (let i = 0; i < index.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, index.getX(i));
    const b = new THREE.Vector3().fromBufferAttribute(p, index.getX(i + 1));
    const c = new THREE.Vector3().fromBufferAttribute(p, index.getX(i + 2));
    if (Math.max(a.z, b.z, c.z) <= 0) continue;
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(denominator) < 1e-12) continue;
    const triangle = { a, b, c, denominator };
    for (let x = Math.floor(Math.min(a.x,b.x,c.x)/cellSize); x <= Math.floor(Math.max(a.x,b.x,c.x)/cellSize); x++) {
      for (let y = Math.floor(Math.min(a.y,b.y,c.y)/cellSize); y <= Math.floor(Math.max(a.y,b.y,c.y)/cellSize); y++) {
        const id = key(x,y);
        if (!cells.has(id)) cells.set(id, []);
        cells.get(id).push(triangle);
      }
    }
  }
  return (x,y) => {
    let front = -Infinity;
    for (const {a,b,c,denominator} of cells.get(key(Math.floor(x/cellSize),Math.floor(y/cellSize))) || []) {
      const u = ((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/denominator;
      const v = ((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/denominator, w = 1-u-v;
      if (u >= -1e-7 && v >= -1e-7 && w >= -1e-7) front = Math.max(front,u*a.z+v*b.z+w*c.z);
    }
    return Number.isFinite(front) ? front : null;
  };
}

// RoundedBoxGeometry subdivides its bevels but leaves its broad faces flat.
// Upholstery needs a continuous grid across those faces for loft and gathers.
export function sofaCushionGeometry(sx, sy, sz, { seat = false, scatter = false, tufts = 0, tuftRows = 1, channels = 0, diamond = false, radius = .05, outline = true } = {}) {
  const r = Math.min(radius, sx * .22, sy * .42, sz * .42);
  const segments = length => Math.max(12, Math.min(64, Math.ceil(length / .025)));
  const geometry = new THREE.BoxGeometry(sx, sy, sz, segments(sx), segments(sy), segments(sz));
  sofaSurfaceUVs(geometry);
  const p = geometry.attributes.position;
  const half = new THREE.Vector3(sx / 2, sy / 2, sz / 2);
  const core = half.clone().subScalar(r), lower = core.clone().negate(), point = new THREE.Vector3(), nearest = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    point.fromBufferAttribute(p, i);
    nearest.copy(point).clamp(lower, core);
    point.sub(nearest).normalize().multiplyScalar(r).add(nearest);
    const u = point.x / half.x, v = (seat ? point.z / half.z : point.y / half.y);
    const envelope = Math.pow(Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v), .7);
    const normalPos = seat ? point.y : point.z, normalHalf = seat ? half.y : half.z;
    const face = THREE.MathUtils.smoothstep(Math.abs(normalPos) / normalHalf, .45, .95);
    const loft = (scatter ? Math.min(sz*.23,.035) : seat ? Math.min(sy*.14,.024) : Math.min(sz*.13,.032)) * envelope;
    // Short, low-amplitude wrinkles emerge from the sewn edges, not painted
    // ribs across the whole model. Displacement changes highlights naturally.
    const edge = Math.exp(-(((Math.abs(u) - .84) / .12) ** 2));
    let displacement = loft + .0025 * Math.sin(v * 32 + u * 5) * edge * envelope;
    if (!seat && tufts && normalPos > 0) {
      for (let row = 0; row < tuftRows; row++) for (let col = 0; col < tufts; col++) {
        const dx = point.x - (-sx / 2 + sx * (col + .5) / tufts), dy = point.y - (-sy / 2 + sy * (row + .5) / tuftRows);
        const distance = dx * dx + dy * dy;
        displacement -= .043 * Math.exp(-distance / .0025);
        displacement += .002 * Math.cos(Math.atan2(dy, dx) * 7) * Math.exp(-distance / .009) * envelope;
      }
    }
    if (channels && normalPos > 0) displacement -= .003 * Math.pow(.5 + .5 * Math.cos((u + 1) * Math.PI * channels), 10) * envelope;
    if (diamond && normalPos > 0) {
      const a = (u + 1) * 2.5, b = (v + 1);
      const distance = t => Math.abs(t - Math.round(t));
      const line = Math.min(distance(a + b), distance(a - b));
      displacement -= Math.min(sz*.15,.016) * Math.exp(-((line / .07) ** 2)) * envelope;
    }
    if (seat) point.y += (normalPos>0?displacement:0) * face;
    else point.z += Math.sign(normalPos) * displacement * face;
    // Bow the sewn silhouette as well as the front face. Keep compressed lower
    // edges and shared-seat boundaries stable, while softening loose cushions.
    if(!seat&&outline){point.x*=1-.035*v*v;point.y*=1-.04*u*u;}
    p.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  // Smooth duplicate edge vertices without merging the six face UV islands.
  const normals = geometry.attributes.normal, groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 1e6)).join(',');
    if (!groups.has(key)) groups.set(key, { indices: [], normal: new THREE.Vector3() });
    const group = groups.get(key);
    group.indices.push(i); group.normal.add(point.fromBufferAttribute(normals, i));
  }
  for (const { indices, normal } of groups.values()) {
    normal.normalize();
    for (const i of indices) normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
