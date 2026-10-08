import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_TYPES, CATEGORIES, FINISH_STYLES, optionsFor, getFinishStyle, inferRoomType, normalizeRoomDesign } from '../src/design/roomDesignCatalog.js';
import { CEILING_TYPES } from '../src/design/ceilingTypes.js';

test('the supplied report contributes exactly 40 distinct, correctly grouped finish choices', () => {
  assert.equal(FINISH_STYLES.length, 40);
  assert.equal(new Set(FINISH_STYLES.map(style => style.id)).size, 40);
  const counts = { living: [3, 3, 3, 3], bedroom: [3, 3, 3, 3], kitchen: [3, 3, 2, 2], bathroom: [2, 2, 2, 0] };
  for (const { id } of ROOM_TYPES) {
    assert.deepEqual(CATEGORIES.map(category => optionsFor(id, category.id).filter(style => style.roomType === id).length), counts[id]);
  }
  assert.deepEqual(optionsFor('laundry', 'floor'), []);
  assert.deepEqual(optionsFor('living', '__proto__'), []);
  assert.equal(getFinishStyle('constructor'), null);
});

test('all 12 architectural ceiling types are available in every room collection alongside its material concepts', () => {
  for (const { id } of ROOM_TYPES) {
    const options = optionsFor(id, 'ceiling');
    assert.deepEqual(options.filter(style => style.roomType === 'all'), CEILING_TYPES);
    assert.equal(new Set(options.map(style => style.id)).size, options.length);
    assert.ok(options.some(style => style.roomType === id));
    assert.equal(optionsFor(id, 'floor').some(style => style.roomType === 'all'), false);
    assert.deepEqual(normalizeRoomDesign({ roomType: id, ceiling: 'ceiling-cathedral', ceilingRiseM: 0.9, ceilingAxis: 'z' }), {
      roomType: id, ceiling: 'ceiling-cathedral', ceilingDropM: 0.15, ceilingRiseM: 0.9, ceilingAxis: 'z',
    });
  }
  CEILING_TYPES.forEach(style => assert.equal(getFinishStyle(style.id), style));
  assert.deepEqual(normalizeRoomDesign({ roomType: 'living', floor: 'ceiling-flat' }), { roomType: 'living' });
  assert.deepEqual(normalizeRoomDesign({ roomType: 'living', ceiling: 'ceiling-flat', ceilingRiseM: Infinity, ceilingAxis: 'bad' }), {
    roomType: 'living', ceiling: 'ceiling-flat', ceilingDropM: 0.15, ceilingRiseM: 0.6, ceilingAxis: 'x',
  });
});

test('every finish has a bounded procedural recipe and provenance from the pasted report', () => {
  for (const style of FINISH_STYLES) {
    assert.equal(getFinishStyle(style.id), style);
    assert.match(style.color, /^#[0-9a-f]{6}$/i);
    assert.match(style.accentColor, /^#[0-9a-f]{6}$/i);
    assert.ok(style.roughness >= 0 && style.roughness <= 1);
    assert.ok(style.metalness >= 0 && style.metalness <= 1);
    assert.ok(style.pattern && style.material && style.label);
    for (const key of ['tileWidthM', 'tileDepthM', 'spacingM', 'depthM', 'dropM']) {
      if (key in style) assert.ok(Number.isFinite(style[key]) && style[key] > 0);
    }
    assert.equal(style.source.report, 'pasted-text.txt');
    assert.ok(style.source.section && style.source.entry);
    assert.equal(/waterproof|water-tight|termite-proof|prevents? slipping|anti-slip|zero water|fireproof/i.test(`${style.label} ${style.material}`), false);
  }
  const gv = getFinishStyle('living-floor-polished-gv');
  assert.equal(gv.tileWidthM, 0.8);
  assert.equal(gv.tileDepthM, 1.6);
  assert.equal(getFinishStyle('bathroom-ceiling-aluminum-grid').tileWidthM, 0.6096);
});

test('room names suggest types without inventing a type for unknown or ambiguous rooms', () => {
  for (const label of ['Living Room', 'HALL', 'drawing_room', 'Lounge']) assert.equal(inferRoomType(label), 'living');
  for (const label of ['Master Bedroom', 'Individual Bedrooms', 'bed_room_2', 'Master suite']) assert.equal(inferRoomType({ name: label }), 'bedroom');
  for (const label of ['Bathroom', 'ENSUITE BATH', 'Wash room', 'WC', 'Toilet']) assert.equal(inferRoomType({ class: label }), 'bathroom');
  assert.equal(inferRoomType({ name: 'Kitchen Verandah' }), 'kitchen');
  assert.equal(inferRoomType({ room_type: 'master-bedroom' }), 'bedroom');
  assert.equal(inferRoomType({ name: 'Bedroom', design: { roomType: 'living' } }), 'living');
  for (const value of [null, {}, [], 'room-1', 'Laundry', 'Hallway', 'Kitchen / Bathroom']) assert.equal(inferRoomType(value), null);
});

test('normalization strips unsupported styles, wrong categories, and cross-room selections', () => {
  const value = {
    roomType: 'living', floor: 'living-floor-polished-gv', ceiling: 'bedroom-ceiling-floating-tray',
    wallPanel: 'living-floor-marble-grid', tvPanel: 'javascript:bad', accentWallId: ' w-3 ',
    ceilingDropM: 0.18, color: '#AABBCC', arbitrary: 'ignored', area_m2: 999,
  };
  assert.deepEqual(normalizeRoomDesign(value), {
    roomType: 'living', floor: 'living-floor-polished-gv', accentWallId: 'w-3', ceilingDropM: 0.18, color: '#aabbcc',
  });
  assert.equal(value.accentWallId, ' w-3 ');
  assert.deepEqual(normalizeRoomDesign(value, 'Bathroom'), { roomType: 'bathroom', accentWallId: 'w-3', ceilingDropM: 0.18, color: '#aabbcc' });
  assert.deepEqual(normalizeRoomDesign({ roomType: 'bathroom', tvPanel: 'kitchen-tvPanel-gloss-shield' }), { roomType: 'bathroom' });
});

test('normalization rejects malformed persisted data and constrains ceiling preview drops', () => {
  for (const value of [null, undefined, [], 4, 'living', { roomType: 'unknown' }]) assert.deepEqual(normalizeRoomDesign(value), {});
  for (const ceilingDropM of [NaN, Infinity, -Infinity, '0.2']) {
    assert.deepEqual(normalizeRoomDesign({ roomType: 'living', ceilingDropM }), { roomType: 'living' });
  }
  assert.equal(normalizeRoomDesign({ roomType: 'living', ceilingDropM: 20 }).ceilingDropM, 0.45);
  assert.equal(normalizeRoomDesign({ roomType: 'living', ceilingDropM: -2 }).ceilingDropM, 0.05);
  for (const color of ['red', '#123', 'url(bad)', '<script>']) assert.equal(normalizeRoomDesign({ roomType: 'living', color }).color, undefined);
  assert.equal(normalizeRoomDesign({ roomType: 'living', accentWallId: 0 }).accentWallId, 0);
  assert.equal(normalizeRoomDesign({ roomType: 'living', accentWallId: Infinity }).accentWallId, undefined);
  assert.equal(normalizeRoomDesign({ roomType: 'living', accentWallId: ' ' }).accentWallId, undefined);
  assert.equal(normalizeRoomDesign({ roomType: 'living', accentWallId: 'w'.repeat(129) }).accentWallId, undefined);
});
