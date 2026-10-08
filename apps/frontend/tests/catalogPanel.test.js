import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES } from '../src/ui/catalogPanel.js';

test('wallpapers are wall paint finishes, not placeable catalog objects', () => {
  const wall = CATEGORIES.find(category => category.id === 'wall');
  const wallpapers = wall.items.filter(item => item.id.startsWith('wallpaper-'));
  assert.equal(wallpapers.length, 0);
});
