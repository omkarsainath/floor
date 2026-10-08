import test from 'node:test';
import assert from 'node:assert/strict';
import { WALLPAPER_FINISHES, createWallpaperMaterial, getWallpaperFinish } from '../src/materials/wallpaper.js';
import { parseLayout } from '../src/loaders/jsonLoader.js';

test('premium wallpaper finishes create distinct repeatable wall materials', () => {
  assert.equal(WALLPAPER_FINISHES.length, 6);
  assert.equal(new Set(WALLPAPER_FINISHES.map(finish => finish.id)).size, 6);
  for (const finish of WALLPAPER_FINISHES) {
    assert.equal(getWallpaperFinish(finish.id), finish);
    const material = createWallpaperMaterial(finish.id, 4, 2.8);
    assert.equal(material.userData.wallpaperId, finish.id);
    assert.ok(material.map?.isDataTexture);
    assert.equal(material.map.repeat.x, 5);
    assert.ok(Math.abs(material.map.repeat.y - 3.5) < 1e-9);
    material.map.dispose();
    material.dispose();
  }
  assert.equal(createWallpaperMaterial('unknown'), null);
});

test('wall face wallpapers survive layout parsing with independent inside and outside finishes', () => {
  const layout = parseLayout({ units: 'm', walls: [{ id: 'wall-1', start: { x: 0, y: 0 }, end: { x: 4, y: 0 },
    faceColors: { outside: '#ffffff' },
    faceFinishes: { inside: { type: 'wallpaper', id: 'silk-damask' } } }] });
  assert.deepEqual(layout.walls[0].faceFinishes, { inside: { type: 'wallpaper', id: 'silk-damask' } });
  assert.equal(layout.walls[0].faceColors.outside, '#ffffff');
});
