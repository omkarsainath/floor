import { CEILING_TYPES, getCeilingType, isProfileCeiling, normalizeCeilingSettings } from './ceilingTypes.js';
import { normalizeCeilingLights } from './ceilingLights.js';
import { normalizeWallPanelRegions } from './wallPanelRegions.js';

// Material looks from the user's supplied report. These are local procedural
// previews, not product specifications or proof of installation performance.
export const ROOM_TYPES = Object.freeze([
  Object.freeze({ id: 'living', label: 'Living room / Hall' }),
  Object.freeze({ id: 'bedroom', label: 'Bedroom' }),
  Object.freeze({ id: 'kitchen', label: 'Kitchen' }),
  Object.freeze({ id: 'bathroom', label: 'Bathroom' }),
]);

export const CATEGORIES = Object.freeze([
  Object.freeze({ id: 'ceiling', label: 'Ceiling' }),
  Object.freeze({ id: 'floor', label: 'Flooring' }),
  Object.freeze({ id: 'wallPanel', label: 'Wall paneling' }),
  Object.freeze({ id: 'tvPanel', label: 'TV wall paneling' }),
]);

const sections = {
  living: 'Living Room / Hall',
  bedroom: 'Master & Individual Bedrooms',
  kitchen: 'Kitchen',
  bathroom: 'Bathrooms',
};

function style(roomType, category, slug, label, material, pattern, color, accentColor, recipe = {}) {
  return Object.freeze({
    id: `${roomType}-${category}-${slug}`,
    roomType, category, label, material, pattern, color, accentColor,
    roughness: 0.65, metalness: 0, ...recipe,
    source: Object.freeze({ report: 'pasted-text.txt', section: sections[roomType], entry: label }),
  });
}

export const FINISH_STYLES = Object.freeze([
  style('living', 'ceiling', 'layered-tray', 'Layered multi-tier gypsum',
    'Gypsum tray with a dropped perimeter and a warm cove accent.',
    'tray', '#f0eee8', '#ffe0aa', { dropM: 0.18, depthM: 0.03 }),
  style('living', 'ceiling', 'wood-slat-fusion', 'Gypsum and wood slat fusion',
    'White gypsum with contrasting wood-look slats.',
    'woodSlats', '#f3f0e9', '#936845', { spacingM: 0.14, depthM: 0.035, dropM: 0.12 }),
  style('living', 'ceiling', 'coffered-pop', 'Coffered POP grid',
    'Plaster-look beams arranged around recessed square fields.',
    'coffered', '#eeeae3', '#d1c8b9', { spacingM: 0.9, depthM: 0.1, dropM: 0.16 }),
  style('living', 'floor', 'polished-gv', 'Polished GV tiles',
    'Marble-look glazed vitrified tiles in an 800 × 1600 mm layout.',
    'marbleTiles', '#e9e4da', '#aaa79f', { roughness: 0.22, tileWidthM: 0.8, tileDepthM: 1.6 }),
  style('living', 'floor', 'marble-grid', 'Natural marble grid',
    'White marble-look squares with visible joints and fine veining.',
    'marbleGrid', '#eae9e4', '#b7b6af', { roughness: 0.28, tileWidthM: 0.8, tileDepthM: 0.8 }),
  style('living', 'floor', 'spc-wood', 'SPC wooden planks',
    'Wood-look composite planks with a staggered joint pattern.',
    'woodPlanks', '#b58a61', '#805839', { roughness: 0.52, tileWidthM: 0.2, tileDepthM: 1.2 }),
  style('living', 'wallPanel', 'charcoal-louvers', 'Charcoal louvers',
    'Closely spaced vertical charcoal slats.',
    'slats', '#464544', '#252625', { spacingM: 0.065, depthM: 0.022 }),
  style('living', 'wallPanel', 'veneer', 'Veneer panels',
    'Warm wood-look sheets with restrained panel seams.',
    'veneer', '#a27850', '#745039', { spacingM: 0.6, depthM: 0.018 }),
  style('living', 'wallPanel', 'fabric-blocks', 'Upholstered fabric blocks',
    'Soft-looking fabric rectangles with recessed seams.',
    'upholstery', '#b2a596', '#8d8174', { roughness: 0.96, spacingM: 0.55, depthM: 0.045 }),
  style('living', 'tvPanel', 'louver-marble', 'Louver and UV marble sheet',
    'Charcoal slats paired with a light marble-look media backdrop.',
    'mediaMarble', '#e2ded5', '#343536', { roughness: 0.28, spacingM: 0.075, depthM: 0.03 }),
  style('living', 'tvPanel', 'fluted-frame', 'Suspended fluted wood frame',
    'Fluted wood-look media panel with a floating console accent.',
    'mediaFluted', '#a1764f', '#543e2c', { spacingM: 0.07, depthM: 0.035 }),
  style('living', 'tvPanel', 'backlit-veneer', 'Backlit veneer panels',
    'Wood-look fascia, narrow reflective accents and warm edge accents.',
    'mediaVeneer', '#956a47', '#ffe0b0', { roughness: 0.46, depthM: 0.03 }),

  style('bedroom', 'ceiling', 'floating-tray', 'Floating perimeter tray',
    'A dropped gypsum-look panel with a warm perimeter accent.',
    'tray', '#eeeae2', '#ffe1ad', { dropM: 0.14, depthM: 0.03 }),
  style('bedroom', 'ceiling', 'flush-border', 'Single-flush accent border',
    'A flat pale ceiling with contrasting perimeter trim.',
    'flushBorder', '#f0eee7', '#746353', { dropM: 0.06, depthM: 0.018 }),
  style('bedroom', 'ceiling', 'headboard-cascade', 'Headboard cascade',
    'An accent ceiling band intended to coordinate with the headboard wall.',
    'cascade', '#e4ddd2', '#9d816a', { dropM: 0.16, depthM: 0.025 }),
  style('bedroom', 'floor', 'engineered-wood', 'Engineered wood',
    'Blonde oak-look planks with staggered joints.',
    'woodPlanks', '#c6a37e', '#9a7551', { roughness: 0.65, tileWidthM: 0.18, tileDepthM: 1.2 }),
  style('bedroom', 'floor', 'herringbone', 'Herringbone planks',
    'Wood-look laminate strips arranged in a repeating herringbone pattern.',
    'herringbone', '#b19270', '#816347', { roughness: 0.58, tileWidthM: 0.12, tileDepthM: 0.6 }),
  style('bedroom', 'floor', 'matte-porcelain', 'Matte porcelain tiles',
    'Large sand-colored tiles with a matte appearance.',
    'stoneTiles', '#c6bdad', '#a49a89', { roughness: 0.9, tileWidthM: 0.6, tileDepthM: 0.6 }),
  style('bedroom', 'wallPanel', 'wainscoting', 'Classic wainscoting',
    'Mid-height board-and-batten frames with a muted painted finish.',
    'wainscot', '#8b9991', '#67756e', { spacingM: 0.65, depthM: 0.022 }),
  style('bedroom', 'wallPanel', 'cushioned-headboard', 'Full-height cushioned headboard',
    'Suede-look modular rectangles for a headboard accent wall.',
    'upholstery', '#b3a59a', '#897a70', { roughness: 0.94, spacingM: 0.6, depthM: 0.055 }),
  style('bedroom', 'wallPanel', 'mdf-grid', 'MDF geometric grids',
    'Painted geometric panel divisions in a muted pastel palette.',
    'geometricGrid', '#9eaba7', '#718581', { spacingM: 0.65, depthM: 0.022 }),
  style('bedroom', 'tvPanel', 'board-batten', 'Half-wall board and batten',
    'A mid-height framed media backdrop with painted trim.',
    'mediaWainscot', '#a6ada7', '#777f79', { spacingM: 0.55, depthM: 0.02 }),
  style('bedroom', 'tvPanel', 'wardrobe-extension', 'Integrated wardrobe extension',
    'Flat laminate-look media panels that can coordinate with wardrobe finishes.',
    'mediaLaminate', '#b4a08b', '#807160', { roughness: 0.55, depthM: 0.022 }),
  style('bedroom', 'tvPanel', 'recessed-gypsum', 'Recessed gypsum POP box',
    'A gypsum-look surround framing a recessed media field.',
    'mediaRecessed', '#e5dfd5', '#aa9d8e', { depthM: 0.075 }),

  style('kitchen', 'ceiling', 'pvc-panels', 'Interlocking PVC panels',
    'Pale tongue-and-groove-look ceiling panels.',
    'ceilingPlanks', '#eceae1', '#c4c1b6', { spacingM: 0.25, depthM: 0.015, dropM: 0.08 }),
  style('kitchen', 'ceiling', 'mr-gypsum', 'MR gypsum finish',
    'A flat painted gypsum-look ceiling; board grade is a construction choice.',
    'flushBorder', '#eceee6', '#cbd0c4', { dropM: 0.06, depthM: 0.015 }),
  style('kitchen', 'ceiling', 'linear-drop', 'Task-focused linear drop',
    'A central dropped channel with task-light accents.',
    'linearDrop', '#ebe9e1', '#ddd1b8', { dropM: 0.14, depthM: 0.035 }),
  style('kitchen', 'floor', 'satin-vitrified', 'Satin vitrified tiles',
    'Muted porcelain-look tiles with a satin surface appearance.',
    'stoneTiles', '#b9b5a8', '#969184', { roughness: 0.82, tileWidthM: 0.6, tileDepthM: 0.6 }),
  style('kitchen', 'floor', 'spc-planks', 'Kitchen SPC planks',
    'Composite wood-look planks in a staggered layout.',
    'woodPlanks', '#b5a086', '#88735c', { roughness: 0.58, tileWidthM: 0.2, tileDepthM: 1.2 }),
  style('kitchen', 'floor', 'kota-stone', 'Polished Kota stone',
    'Gray-green natural-stone-look slabs with visible joints.',
    'stoneTiles', '#8d998d', '#68766b', { roughness: 0.42, tileWidthM: 0.6, tileDepthM: 0.9 }),
  style('kitchen', 'wallPanel', 'backlit-acrylic', 'Backlit acrylic sheets',
    'Glossy pale panels with warm edge accents.',
    'acrylic', '#deddd2', '#f5dfb6', { roughness: 0.2, depthM: 0.015 }),
  style('kitchen', 'wallPanel', 'spc-slabs', 'SPC wall slabs',
    'Large composite stone-look sheets with restrained seams.',
    'stoneSlabs', '#bfbcb2', '#928f85', { roughness: 0.55, spacingM: 1.2, depthM: 0.018 }),
  style('kitchen', 'tvPanel', 'gloss-shield', 'High-gloss shield',
    'A flat glossy acrylic-look media panel.',
    'acrylic', '#c6c5bb', '#85877f', { roughness: 0.18, depthM: 0.02 }),
  style('kitchen', 'tvPanel', 'wpc-fluted', 'WPC fluted block',
    'A composite wood-look fluted media backdrop.',
    'mediaFluted', '#ad8964', '#795b3f', { spacingM: 0.075, depthM: 0.025 }),

  style('bathroom', 'ceiling', 'aluminum-grid', 'Modular aluminum grid',
    'Metal-look ceiling tiles in a 2 × 2 ft modular grid.',
    'ceilingTiles', '#d9dcda', '#a6aba8', { roughness: 0.43, metalness: 0.5, spacingM: 0.6096, tileWidthM: 0.6096, tileDepthM: 0.6096, dropM: 0.12, depthM: 0.02 }),
  style('bathroom', 'ceiling', 'pvc-planks', 'Seamless PVC planks',
    'Light tongue-and-groove-look ceiling strips.',
    'ceilingPlanks', '#e5e5df', '#bfc1b9', { spacingM: 0.25, dropM: 0.08, depthM: 0.015 }),
  style('bathroom', 'floor', 'textured-ceramic', 'Textured matte ceramic',
    'Small matte ceramic-look tiles with visible grout joints.',
    'stoneTiles', '#aaa79e', '#7b7970', { roughness: 0.96, tileWidthM: 0.3, tileDepthM: 0.3 }),
  style('bathroom', 'floor', 'microcement', 'Microcement',
    'A continuous concrete-look finish with subtle tonal variation.',
    'microcement', '#a7aaa5', '#858b84', { roughness: 0.91 }),
  style('bathroom', 'wallPanel', 'pvc-groove', 'PVC tongue-and-groove',
    'Pale vertical planks with narrow panel seams.',
    'slats', '#dddcd2', '#b6b7a9', { spacingM: 0.2, depthM: 0.014 }),
  style('bathroom', 'wallPanel', 'wpc-fluting', 'WPC fluting',
    'Composite wood-look vertical slats for a vanity accent.',
    'slats', '#aa8f70', '#776047', { spacingM: 0.07, depthM: 0.022 }),
]);

const byId = new Map(FINISH_STYLES.map(finish => [finish.id, finish]));
const roomIds = new Set(ROOM_TYPES.map(room => room.id));
const categoryIds = new Set(CATEGORIES.map(category => category.id));

export function optionsFor(roomType, category) {
  if (!roomIds.has(roomType) || !categoryIds.has(category)) return [];
  const concepts = FINISH_STYLES.filter(finish => finish.roomType === roomType && finish.category === category);
  return category === 'ceiling' ? [...CEILING_TYPES, ...concepts] : concepts;
}

export function getFinishStyle(id) {
  return byId.get(id) || getCeilingType(id);
}

function typeFromLabel(value) {
  if (typeof value !== 'string') return null;
  const label = value.trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (roomIds.has(label)) return label;
  const matches = [];
  if (/\b(living(?:\s*rooms?)?|lounges?|drawing(?:\s*rooms?)?|hall)\b/.test(label)) matches.push('living');
  if (/\b(bed\s*rooms?|master\s*suite)\b/.test(label)) matches.push('bedroom');
  if (/\bkitchens?\b/.test(label)) matches.push('kitchen');
  if (/\b(bath\s*rooms?|bath|ensuite|en\s*suite|toilets?|wash\s*rooms?|wc)\b/.test(label)) matches.push('bathroom');
  return matches.length === 1 ? matches[0] : null;
}

// Room classification is a suggestion. Unnamed or ambiguous regions stay
// unclassified so the user can choose their intended room type explicitly.
export function inferRoomType(room) {
  if (typeof room === 'string') return typeFromLabel(room);
  if (!room || typeof room !== 'object' || Array.isArray(room)) return null;
  if (roomIds.has(room.design?.roomType)) return room.design.roomType;
  for (const value of [room.roomType, room.room_type, room.type, room.class, room.name, room.label]) {
    const inferred = typeFromLabel(value);
    if (inferred) return inferred;
  }
  return null;
}

// Persist only known compatible selections. Geometry and measurement targets
// are deliberately absent from this visual-design object.
export function normalizeRoomDesign(value, roomType) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const type = typeFromLabel(roomType) || typeFromLabel(value.roomType);
  if (!type) return {};
  const normalized = { roomType: type };
  for (const { id: category } of CATEGORIES) {
    const finish = getFinishStyle(value[category]);
    if (finish && (finish.roomType === type || finish.roomType === 'all') && finish.category === category) normalized[category] = finish.id;
  }
  if (typeof value.accentWallId === 'string' && value.accentWallId.trim() && value.accentWallId.length <= 128) {
    normalized.accentWallId = value.accentWallId.trim();
  } else if (typeof value.accentWallId === 'number' && Number.isFinite(value.accentWallId)) {
    normalized.accentWallId = value.accentWallId;
  }
  if (typeof value.ceilingDropM === 'number' && Number.isFinite(value.ceilingDropM)) {
    normalized.ceilingDropM = Math.max(0.05, Math.min(0.45, value.ceilingDropM));
  }
  if (isProfileCeiling(getFinishStyle(normalized.ceiling))) Object.assign(normalized, normalizeCeilingSettings(value));
  if (Array.isArray(value.ceilingLights)) normalized.ceilingLights = normalizeCeilingLights(value.ceilingLights);
  if (Array.isArray(value.wallPanelRegions)) normalized.wallPanelRegions = normalizeWallPanelRegions(value.wallPanelRegions)
    .filter(region => getFinishStyle(region.styleId)?.category === 'wallPanel');
  // An invalid marked region must never silently become a whole-wall finish.
  if (value.wallPanelRegions?.length && !normalized.wallPanelRegions?.length) delete normalized.wallPanel;
  if (typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color)) normalized.color = value.color.toLowerCase();
  return normalized;
}
