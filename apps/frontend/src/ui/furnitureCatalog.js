import { SOFA_FACTORY_CATALOG } from '../generators/sofaFactory.js';
import { PULLOUT_SLAB_ITEM, EDITABLE_CABINET_ITEM } from '../kitchen/presets.js';
import { WARDROBE_CATALOG, LOFT_CATALOG } from '../generators/wardrobe.js';
import { POOJA_CATALOG } from '../generators/pooja.js';
import { TV_UNIT_CATALOG } from '../generators/tvUnits.js';
import { DESIGNER_DOOR_CATALOG } from '../generators/designerDoors.js';
import { DINING_CATALOG, CENTER_D_CATALOG, CENTER_A_CATALOG, DESK_CATALOG, OFFICE_CHAIR_CATALOG } from '../generators/referenceFurnitureCatalog.js';

export const CATEGORIES = [
  {
    id: 'designer-doors', label: 'Doors', icon: '🚪',
    items: DESIGNER_DOOR_CATALOG,
  },
  {
    id: 'windows', label: 'Windows', icon: '🪟',
    items: [
      { id: 'sliding-window',     label: 'Sliding Window',    icon: '🪟', w: 1.20, d: 0.15 },
      { id: 'upvc-slide-door',    label: 'UPVC Slide Door',   icon: '🚪', w: 1.80, d: 0.15 },
      { id: 'casement-window',    label: 'Casement Window',   icon: '🪟', w: 0.90, d: 0.15 },
      { id: 'french-window',      label: 'French Window',     icon: '🚪', w: 1.20, d: 0.15 },
      { id: 'french-door',        label: 'French Door',       icon: '🚪', w: 1.20, d: 0.15 },
      { id: 'fixed-window',       label: 'Picture Window',    icon: '🪟', w: 1.50, d: 0.12 },
      { id: 'louvered-window',    label: 'Louvered Window',   icon: '🪟', w: 0.80, d: 0.15 },
      { id: 'arched-window',      label: 'Arched Window',     icon: '🪟', w: 0.90, d: 0.15 },
    ],
  },
  {
    id: 'chairs', label: 'Chairs', icon: '🪑',
    items: [
      { id: 'dining-chair', label: 'Dining Chair',  icon: '🪑', w: 0.50, d: 0.52 },
      { id: 'chair',        label: 'Side Chair',    icon: '🪑', w: 0.55, d: 0.55 },
      { id: 'armchair',     label: 'Armchair',      icon: '🛋️', w: 0.85, d: 0.82 },
      { id: 'accent chair', label: 'Accent Chair',  icon: '💺', w: 0.75, d: 0.75 },
      { id: 'office-chair', label: 'Office Chair',  icon: '🖥️', w: 0.65, d: 0.70 },
      { id: 'bar-stool',    label: 'Bar Stool',     icon: '🍸', w: 0.45, d: 0.45 },
      { id: 'lounge-chair', label: 'Lounge Chair',  icon: '🛋️', w: 0.80, d: 0.95 },
      { id: 'bean-bag',     label: 'Bean Bag',      icon: '🔴', w: 1.00, d: 1.00 },
    ],
  },
  {
    id: 'sofas', label: 'Sofas', icon: '🛋️',
    items: [
      { id: 'sofa',     label: 'Sofa',     icon: '🛋️', w: 2.0, d: 0.90 },
      { id: 'sofa-2',   label: '2-Seater', icon: '🛋️', w: 1.6, d: 0.88 },
      { id: 'sofa-3',   label: '3-Seater', icon: '🛋️', w: 2.4, d: 0.92 },
      { id: 'loveseat', label: 'Loveseat', icon: '❤️', w: 1.3, d: 0.85 },
      { id: 'l-sofa',   label: 'L-Sofa',   icon: '📐', w: 2.6, d: 2.20 },
    ],
  },
  {
    id: 'beds', label: 'Beds', icon: '🛏️',
    items: [
      { id: 'single-bed', label: 'Single Bed', icon: '🛏️', w: 0.92, d: 2.0 },
      { id: 'double-bed', label: 'Double Bed', icon: '🛏️', w: 1.35, d: 2.0 },
      { id: 'queen-bed',  label: 'Queen Bed',  icon: '🛏️', w: 1.60, d: 2.0 },
      { id: 'king-bed',   label: 'King Bed',   icon: '👑', w: 1.85, d: 2.0 },
      { id: 'bunk-bed',   label: 'Bunk Bed',   icon: '🪜', w: 1.00, d: 2.0 },
      { id: 'loft-bed',   label: 'Loft Bed',   icon: '🪜', w: 1.05, d: 2.05 },
    ],
  },
  {
    id: 'wardrobes', label: 'Wardrobes', icon: '🚪',
    items: WARDROBE_CATALOG,
  },
  { id:'lofts', label:'Lofts', icon:'🗄️', items:LOFT_CATALOG },
  {
    id: 'tables', label: 'Tables', icon: '🪵',
    items: [
      { id: 'dining table',  label: 'Dining Table',  icon: '🍽️', w: 1.8, d: 0.90 },
      { id: 'round-table',   label: 'Round Table',   icon: '⭕',  w: 1.2, d: 1.20 },
      { id: 'coffee table',  label: 'Coffee Table',  icon: '☕',  w: 1.2, d: 0.60 },
      { id: 'study table',   label: 'Study Table',   icon: '📐',  w: 1.4, d: 0.70 },
      { id: 'console-table', label: 'Console Table', icon: '🖼️', w: 1.2, d: 0.35 },
      { id: 'side table',    label: 'Side Table',    icon: '🕯️', w: 0.5, d: 0.50 },
    ],
  },
  { id:'dining-designs', label:'Dining Sets', icon:'🍽️', items:DINING_CATALOG },
  { id:'center-d', label:'Centre D', icon:'☕', items:CENTER_D_CATALOG },
  { id:'center-a', label:'Centre A', icon:'☕', items:CENTER_A_CATALOG },
  { id:'office-desks', label:'Office / Study', icon:'🖥️', items:DESK_CATALOG },
  { id:'executive-chairs', label:'Office Chairs', icon:'💺', items:OFFICE_CHAIR_CATALOG },
  {
    id: 'kitchen', label: 'Kitchen', icon: '🍳',
    items: [
      PULLOUT_SLAB_ITEM,
      EDITABLE_CABINET_ITEM,
      { id: 'kitchen-base-cabinet',  label: 'Base Cabinet',  icon: '🔵', w: 1.80, d: 0.60, wallAttached: true },
      { id: 'kitchen-upper-cabinet', label: 'Upper Cabinet', icon: '🔲', w: 1.20, d: 0.35, wallAttached: true },
      { id: 'overhead-cabinet',      label: 'Overhead Cab.', icon: '⬜', w: 1.00, d: 0.35, wallAttached: true },
      { id: 'loft-wall-cabinet',     label: 'Loft Wall Cab.', icon: '🗄️', w: 2.80, d: 0.58, wallAttached: true },
      { id: 'kitchen-chimney',       label: 'Chimney Hood',   icon: '🔲', w: 0.90, d: 0.50 },
      { id: 'kitchen-island',        label: 'Island',        icon: '🏝️', w: 1.20, d: 0.80 },
      { id: 'fridge',                label: 'Fridge',        icon: '🧊', w: 0.70, d: 0.65 },
      { id: 'stove',                 label: 'Stove',         icon: '🍳', w: 0.80, d: 0.60 },
      { id: 'oven',                  label: 'Oven',          icon: '🔆', w: 0.60, d: 0.55 },
      { id: 'mixer',                 label: 'Mixer',         icon: '🥣', w: 0.38, d: 0.32 },
      { id: 'kitchen-slab',          label: 'Counter',       icon: '◾', w: 1.80, d: 0.60 },
      { id: 'sink',                  label: 'Sink',          icon: '💧', w: 0.60, d: 0.50 },
      { id: 'washing machine',       label: 'Washer',        icon: '🌀', w: 0.60, d: 0.60 },
    ],
  },
  {
    id: 'bathroom', label: 'Bath', icon: '🚿',
    items: [
      { id: 'commode', label: 'Toilet',  icon: '🚽', w: 0.50, d: 0.70 },
      { id: 'bathtub', label: 'Bathtub', icon: '🛁', w: 0.80, d: 1.70 },
      { id: 'sink',    label: 'Basin',   icon: '💧', w: 0.55, d: 0.45 },
    ],
  },
  {
    id: 'tv-units', label: 'TV Units', icon: '📺',
    items: TV_UNIT_CATALOG,
  },
  {
    id: 'storage', label: 'Storage', icon: '📦',
    items: [
      { id: 'tv',            label: 'TV',        icon: '📺',  w: 1.40, d: 0.12 },
      { id: 'tv-unit',       label: 'TV Unit',   icon: '🖥️', w: 1.60, d: 0.45 },
      { id: 'dresser',       label: 'Dresser',   icon: '🪞',  w: 1.05, d: 0.50 },
      { id: 'book cabinet',  label: 'Bookshelf', icon: '📚',  w: 1.00, d: 0.35, wallAttached: true },
      { id: 'shoe-rack',     label: 'Shoe Rack', icon: '👟',  w: 0.90, d: 0.35, wallAttached: true },
      { id: 'crockery unit', label: 'Crockery',  icon: '🥣',  w: 1.20, d: 0.45, wallAttached: true },
      { id: 'foyer cabinet', label: 'Cabinet',   icon: '🗄️', w: 1.00, d: 0.35, wallAttached: true },
    ],
  },
  {
    id: 'wall', label: 'Wall', icon: '🖼️',
    items: [
      { id: 'wall-tv',     label: 'Wall TV',     icon: '📺',  w: 1.40, d: 0.12 },
      { id: 'wall-shelf',  label: 'Wall Shelf',  icon: '📏',  w: 0.90, d: 0.25 },
      { id: 'wall-mirror', label: 'Mirror',       icon: '🪞',  w: 0.70, d: 0.08 },
      { id: 'wall-lamp',   label: 'Sconce Lamp',  icon: '💡',  w: 0.30, d: 0.30 },
      { id: 'wall-art',    label: 'Wall Art',     icon: '🖼️', w: 0.80, d: 0.06 },
    ],
  },
  {
    id: 'pooja', label: 'Pooja', icon: '🪔',
    items: [
      { id: 'pooja-unit', label: 'Pooja Unit',  icon: '🪔', w: 1.10, d: 0.45 },
      ...POOJA_CATALOG,
    ],
  },
];

const pdfCategories = [
  ['sofas','Sofas'], ['economic-sofas','Economic sofas'], ['recliners','Recliners'],
  ['sofa-beds','Sofa beds'], ['wooden-sofas','Wooden sofas'], ['dining-glass','Glass dining sets'],
  ['dining-marble','Marble dining sets'], ['antique-chairs','Antique chairs'],
  ['relaxing-chairs','Relaxing chairs'], ['pouffes','Pouffes'], ['center-glass','Glass centre tables'],
  ['center-marble','Marble centre tables'],
];
for (const [id, label] of pdfCategories) {
  const products = SOFA_FACTORY_CATALOG.filter(item => item.category === id);
  const existing = CATEGORIES.find(category => category.id === id);
  if (existing) existing.items.push(...products);
  else CATEGORIES.push({id, label, icon:'', items:products});
}

