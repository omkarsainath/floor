import test from 'node:test';
import assert from 'node:assert/strict';
import { CEILING_TYPES, getCeilingType, isProfileCeiling, normalizeCeilingSettings } from '../src/design/ceilingTypes.js';

test('the ceiling reference supplies 12 stable, distinct architectural types with the displayed names', () => {
  assert.deepEqual(CEILING_TYPES.map(type => type.id), [
    'ceiling-flat', 'ceiling-coffered', 'ceiling-tray', 'ceiling-false-drop',
    'ceiling-cathedral', 'ceiling-vaulted', 'ceiling-suspended', 'ceiling-dome',
    'ceiling-barrel-vault', 'ceiling-shed', 'ceiling-groin-vault', 'ceiling-wooden-panel',
  ]);
  assert.deepEqual(CEILING_TYPES.map(type => type.label), [
    'Flat Ceiling', 'Coffered Ceiling', 'Tray Ceiling', 'False Ceiling (Drop Ceiling)',
    'Cathedral Ceiling', 'Vaulted Ceiling', 'Suspended Ceiling', 'Dome Ceiling',
    'Barrel Vault Ceiling', 'Shed Ceiling', 'Groin Vault Ceiling', 'Wooden Panel Ceiling',
  ]);
  assert.equal(new Set(CEILING_TYPES.map(type => type.id)).size, 12);
  for (const type of CEILING_TYPES) {
    assert.equal(getCeilingType(type.id), type);
    assert.equal(type.category, 'ceiling');
    assert.equal(type.roomType, 'all');
    assert.equal(type.pattern, 'profile');
    assert.equal(type.source.entry, type.label);
    assert.ok(type.material.length > 10);
    assert.match(type.color, /^#[0-9a-f]{6}$/i);
    assert.match(type.accentColor, /^#[0-9a-f]{6}$/i);
    assert.ok(type.roughness >= 0 && type.roughness <= 1);
    assert.ok(type.metalness >= 0 && type.metalness <= 1);
  }
});

test('profile recognition and raised-shape flags distinguish architectural profiles from room finish recipes', () => {
  assert.deepEqual(CEILING_TYPES.filter(type => type.raised).map(type => type.ceilingType), [
    'cathedral', 'vaulted', 'dome', 'barrel-vault', 'shed', 'groin-vault',
  ]);
  assert.ok(CEILING_TYPES.every(isProfileCeiling));
  for (const value of [null, undefined, {}, 'ceiling-flat', { category: 'ceiling', pattern: 'tray' },
    { category: 'floor', pattern: 'profile', ceilingType: 'flat' },
    { category: 'ceiling', pattern: 'profile', ceilingType: 'unknown' }]) {
    assert.equal(isProfileCeiling(value), false);
  }
  assert.equal(getCeilingType('constructor'), null);
  assert.equal(getCeilingType('__proto__'), null);
  assert.equal(getCeilingType('missing'), null);
});

test('ceiling settings default to bounded metre values and accept both room axes', () => {
  const defaults = { ceilingDropM: 0.15, ceilingRiseM: 0.6, ceilingAxis: 'x' };
  for (const value of [null, undefined, {}, [], 1, 'x']) assert.deepEqual(normalizeCeilingSettings(value), defaults);
  assert.deepEqual(normalizeCeilingSettings({ ceilingDropM: 0.22, ceilingRiseM: 1.25, ceilingAxis: 'z' }), {
    ceilingDropM: 0.22, ceilingRiseM: 1.25, ceilingAxis: 'z',
  });
  assert.deepEqual(normalizeCeilingSettings({ ceilingDropM: -20, ceilingRiseM: -30, ceilingAxis: 'y' }), {
    ceilingDropM: 0.05, ceilingRiseM: 0.1, ceilingAxis: 'x',
  });
  assert.deepEqual(normalizeCeilingSettings({ ceilingDropM: 10, ceilingRiseM: 50 }), {
    ceilingDropM: 0.45, ceilingRiseM: 2, ceilingAxis: 'x',
  });
});

test('ceiling settings reject nonfinite, coercible, and unknown data without modifying source measurements', () => {
  for (const invalid of [NaN, Infinity, -Infinity, '0.25', null, true, {}]) {
    assert.deepEqual(normalizeCeilingSettings({ ceilingDropM: invalid, ceilingRiseM: invalid }), {
      ceilingDropM: 0.15, ceilingRiseM: 0.6, ceilingAxis: 'x',
    });
  }
  const original = { ceilingDropM: 0.25, ceilingRiseM: 0.8, ceilingAxis: 'z', height: 3, area_m2: 4.4, unknown: true };
  const snapshot = structuredClone(original);
  assert.deepEqual(normalizeCeilingSettings(original), { ceilingDropM: 0.25, ceilingRiseM: 0.8, ceilingAxis: 'z' });
  assert.deepEqual(original, snapshot);
});
