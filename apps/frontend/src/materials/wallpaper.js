import * as THREE from 'three';

export const WALLPAPER_FINISHES = Object.freeze([
  { id: 'silk-damask', label: 'Silk Damask', icon: '✦', colors: ['#daccae', '#977746', '#efe5cd'] },
  { id: 'emerald-botanical', label: 'Emerald Botanical', icon: '🌿', colors: ['#15362c', '#497456', '#c2a869'] },
  { id: 'charcoal-geometry', label: 'Charcoal Geometry', icon: '◆', colors: ['#23252a', '#5c564e', '#bf9d5b'] },
  { id: 'ivory-marble', label: 'Ivory Marble', icon: '◈', colors: ['#ece7dc', '#b7b1a9', '#d3b880'] },
  { id: 'midnight-art-deco', label: 'Midnight Art Deco', icon: '♛', colors: ['#0d1930', '#1f324e', '#cca652'] },
  { id: 'champagne-linen', label: 'Champagne Linen', icon: '▦', colors: ['#d8c7a5', '#b59e75', '#f0e4ca'] },
]);

const asRgb = hex => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

export function getWallpaperFinish(id) {
  return WALLPAPER_FINISHES.find(finish => finish.id === id) || null;
}

export function createWallpaperMaterial(id, width = 3, height = 2.8) {
  const finish = getWallpaperFinish(id);
  if (!finish) return null;
  const palette = finish.colors.map(asRgb);
  const size = 96;
  const data = new Uint8Array(size * size * 4);
  const put = (i, color, shade = 0) => {
    for (let channel = 0; channel < 3; channel++) data[i + channel] = Math.max(0, Math.min(255, color[channel] + shade));
    data[i + 3] = 255;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x % 24, v = y % 24;
    let color = palette[0];
    const shade = ((x * 17 + y * 29) % 5) - 2;
    if (id === 'silk-damask') {
      const petal = Math.abs(u - 12) + Math.abs(v - 12);
      if (petal < 7 || Math.abs(petal - 10) < 1.2) color = palette[petal < 7 ? 2 : 1];
    } else if (id === 'emerald-botanical') {
      const leaf = ((u - 7) ** 2) / 40 + ((v - 12) ** 2) / 90 < 1 || ((u - 17) ** 2) / 40 + ((v - 6) ** 2) / 80 < 1;
      if (leaf) color = palette[1];
      if (Math.abs(u - (v * 0.45 + 5)) < 1) color = palette[2];
    } else if (id === 'charcoal-geometry') {
      if ((x + y) % 24 < 2 || Math.abs((x - y) % 24) < 2) color = palette[1];
      if ((x + y) % 48 === 0) color = palette[2];
    } else if (id === 'ivory-marble') {
      const vein = Math.abs(Math.sin((x + Math.sin(y / 8) * 9) / 7));
      if (vein < 0.12) color = palette[1]; else if (vein < 0.18) color = palette[2];
    } else if (id === 'midnight-art-deco') {
      const arch = Math.abs(Math.hypot(u - 12, v - 12) - 9) < 1.2;
      if (arch || u === 12) color = palette[2]; else if ((u + v) % 13 < 2) color = palette[1];
    } else if (id === 'champagne-linen') {
      if (x % 4 === 0 || y % 5 === 0) color = palette[1];
      if (x % 12 === 1 && y % 12 === 1) color = palette[2];
    }
    put((y * size + x) * 4, color, shade);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(1, Number(width) / 0.8), Math.max(1, Number(height) / 0.8));
  texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: 0.78, metalness: 0.02 });
  material.userData._ownedByMesh = true;
  material.userData.wallpaperId = id;
  return material;
}
