import * as THREE from 'three';

// Deterministic, original textures: no image downloads, API calls or asset fees.
// Textures are shared for the application lifetime; materials belong to objects.
const textures = new Map();
function surfaceTexture(kind) {
  if (textures.has(kind)) return textures.get(kind);
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 12345;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      const noise = seed / 4294967296;
      const grain = kind === 'wood'
        ? 0.78 + 0.12 * Math.sin(y * 0.32 + Math.sin(x * 0.025) * 2) + noise * 0.07
        : 0.78 + ((x % 4 < 2) !== (y % 4 < 2) ? 0.12 : 0) + noise * 0.07;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(grain * 255);
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(kind === 'wood' ? 1 : 3, kind === 'wood' ? 1 : 3);
  texture.needsUpdate = true;
  textures.set(kind, texture);
  return texture;
}

export function fabricMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.91, metalness: 0,
    bumpMap: surfaceTexture('fabric'), bumpScale: 0.008,
    sheen: 0.35, sheenRoughness: 0.9, sheenColor: new THREE.Color(color),
    envMapIntensity: 0.55,
  });
}

export function woodMaterial(color = 0x79543a) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.48, metalness: 0,
    bumpMap: surfaceTexture('wood'), bumpScale: 0.006,
    envMapIntensity: 0.55,
  });
}
