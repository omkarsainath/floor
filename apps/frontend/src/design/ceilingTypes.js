import { REFERENCE_CEILING_TYPES } from './referenceCeilings.js';
// Architectural ceiling concepts from the user's reference image. The catalog
// describes a visual profile, not a structural or installation specification.
function ceiling(ceilingType, label, material, { raised = false, color = '#efede7', accentColor = '#c8c1b6', roughness = 0.78, metalness = 0 } = {}) {
  return Object.freeze({
    id: `ceiling-${ceilingType}`,
    category: 'ceiling', roomType: 'all', pattern: 'profile',
    ceilingType, shape: ceilingType, raised,
    label, material, color, accentColor, roughness, metalness,
    source: Object.freeze({ reference: 'User-provided ceiling types image', entry: label }),
  });
}

export const CEILING_TYPES = Object.freeze([
  ceiling('flat', 'Flat Ceiling', 'A continuous level ceiling surface.'),
  ceiling('coffered', 'Coffered Ceiling', 'A regular beam grid around recessed ceiling fields.'),
  ceiling('tray', 'Tray Ceiling', 'A higher central field surrounded by a lowered perimeter.'),
  ceiling('false-drop', 'False Ceiling (Drop Ceiling)', 'A continuous secondary ceiling below the room-height reference.'),
  ceiling('cathedral', 'Cathedral Ceiling', 'Two sloping ceiling planes meeting at a central ridge.', { raised: true }),
  ceiling('vaulted', 'Vaulted Ceiling', 'A curved ceiling profile with a higher central region.', { raised: true }),
  ceiling('suspended', 'Suspended Ceiling', 'A ceiling of modular panels in an exposed support-grid pattern.', { metalness: 0.12 }),
  ceiling('dome', 'Dome Ceiling', 'A rounded ceiling cap that rises toward its center.', { raised: true }),
  ceiling('barrel-vault', 'Barrel Vault Ceiling', 'A continuous arch profile extending along one room axis.', { raised: true }),
  ceiling('shed', 'Shed Ceiling', 'A single ceiling plane sloping from one side to the other.', { raised: true }),
  ceiling('groin-vault', 'Groin Vault Ceiling', 'Intersecting vault profiles meeting along diagonal ridges.', { raised: true }),
  ceiling('wooden-panel', 'Wooden Panel Ceiling', 'A level ceiling with repeating wood-look panels.', { color: '#ae865e', accentColor: '#755238', roughness: 0.61 }),
]);

const byId = new Map([...CEILING_TYPES, ...REFERENCE_CEILING_TYPES].map(type => [type.id, type]));
const shapeNames = new Set([...CEILING_TYPES, ...REFERENCE_CEILING_TYPES].map(type => type.ceilingType));

export function getCeilingType(id) {
  return byId.get(id) || null;
}

export function isProfileCeiling(style) {
  return Boolean(style && style.category === 'ceiling' && style.pattern === 'profile' && shapeNames.has(style.ceilingType));
}

const bounded = (value, low, high, fallback) => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(low, Math.min(high, value)) : fallback;

// Axis x means the height changes across room X; z means across room Z.
// Geometry should keep the highest point at roomHeight - ceilingDropM and the
// lowest profile point at that height minus ceilingRiseM. These settings never
// alter the source room height, footprint, or printed measurement targets.
export function normalizeCeilingSettings(value) {
  const settings = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ceilingDropM: bounded(settings.ceilingDropM, 0.05, 0.45, 0.15),
    ceilingRiseM: bounded(settings.ceilingRiseM, 0.1, 2, 0.6),
    ceilingAxis: settings.ceilingAxis === 'z' ? 'z' : 'x',
  };
}
