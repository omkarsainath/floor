// Reference-inspired procedural models, not manufacturer CAD or production drawings.
// Dimensions are metres. PDF plan sizes are used where legible; heights, nesting
// arrangements, chair sizes and all desk sizes are estimates. No remote assets.
export const DINING_SOURCE = 'https://ogaanlam.com/blog/25-latest-dining-table-design-ideas-for-modern-indian-homes/';
const diningRows = [
  ['Pastel Green Suede', '#85977a', 'suede', 'legs', 6, '#a0ad8c'],
  ['Navy Blue Suede', '#253e65', 'suede', 'legs', 6, '#344965'],
  ['Dark Maroon High Gloss', '#591e2a', 'gloss', 'legs', 6, '#674039'],
  ['Purple Suede', '#675398', 'suede', 'legs', 4, '#5a4842'],
  ['Beige High Gloss', '#cabca4', 'gloss', 'twin', 6, '#bbae97'],
  ['Chocolate Walnut High Gloss', '#59412e', 'wood-gloss', 'twin', 6, '#74665a'],
  ['Dusty Teal High Gloss', '#557d7e', 'gloss', 'slab', 6, '#e4dbc6'],
  ['Dark Green Wall Mounted', '#254b3b', 'gloss', 'wall', 4, '#755039'],
  ['Jet Black Acrylic High Gloss', '#242524', 'marble-gloss', 'twin', 6, '#c9c0b0'],
  ['Beige Suede', '#b9af97', 'stone', 'twin', 6, '#d6cdc0'],
  ['Teak Brown Suede', '#b38a59', 'wood', 'splayed', 6, '#d9cdb5'],
  ['Navy Blue Suede Mica + Bench', '#233944', 'suede', 'metal', 6, '#25343c'],
  ['Fluorescent Pink Suede', '#d35466', 'suede', 'legs', 6, '#c99c65'],
  ['Charcoal Grey Acrylic High Gloss', '#525557', 'marble-gloss', 'metal', 8, '#9c9183'],
  ['Bright Coral Pink High Gloss', '#dc6470', 'gloss', 'legs', 6, '#343330'],
  ['Terracotta Orange High Gloss', '#b65733', 'gloss', 'slab', 4, '#a95b40'],
  ['Deep Teal Matte', '#448888', 'matte', 'legs', 6, '#bcbeb7'],
  ['Pearl White Silky Matte', '#e9e6dc', 'wood-matte', 'twin', 6, '#ece8de'],
  ['Pure White Acrylic Sparkle', '#faf7ed', 'sparkle', 'legs', 6, '#eeebe3'],
  ['Dark Concrete Grey Matte', '#696961', 'stone', 'twin', 6, '#ab9378'],
  ['Lemon Yellow High Gloss', '#e1c23b', 'gloss', 'legs', 6, '#d1b47b'],
  ['Dark Oak Brown Suede', '#72503a', 'wood', 'legs', 4, '#a89880'],
  ['Charcoal Grey Matte', '#45494b', 'matte', 'metal', 6, '#b9b8ae'],
  ['Smoky Ash Matte', '#8b8070', 'wood-matte', 'metal', 6, '#c5c0ad'],
  ['Classic Black Acrylic High Gloss', '#202221', 'gloss', 'legs', 6, '#ece6d7'],
];
export const DINING_CATALOG = diningRows.map(([name, color, finish, base, seats, upholstery], i) => {
  const tw = seats === 4 ? 1.25 : seats === 8 ? 2.35 : 1.85, td = seats === 4 ? .8 : .94;
  return { id: `dining-ref-${String(i + 1).padStart(2, '0')}`, label: `${i + 1}. ${name}`,
    icon: '🍽️', kind: 'dining', color, finish, base, seats, upholstery, tw, td,
    w: tw + 1.04, d: td + (base === 'wall' ? .5 : 1), h: .76,
    wallAttached: base === 'wall', bench: i === 11, source: DINING_SOURCE,
    note: `${seats} seats included. Estimated dimensions; reference-inspired, not exact CAD.` };
});

// family: the geometric construction, not a colour-only substitution.
// Options: shape, drawers, count (nesting), stools, frame, shelf, inset, slider.
const C = (family, width, depth, options = {}) => ({ family, width, depth, ...options });
const dSeries = [
  C('facet',36,36,{color:'black'}), C('nest',18,18,{shape:'hex',count:3}),
  C('legs',36,36,{shape:'round',color:'black'}), C('stepped',48,24,{color:'glass'}),
  C('cage',36,36,{shape:'round'}), C('nest',36,36,{shape:'round',count:3,color:'black',frame:'ring'}),
  C('nest',30,30,{shape:'round',count:3,rim:true}), C('box',48,24,{color:'white',drawers:1,slider:true}),
  C('box',48,24,{color:'white',drawers:2,wrap:true}), C('nest',30,30,{shape:'hex',count:2}),
  C('nest',36,36,{shape:'pebble',count:2}), C('legs',48,24,{shape:'oval',color:'black',rim:true}),
  C('cage',36,36,{shape:'octagon',color:'glass'}), C('nest',30,30,{shape:'round',count:2,color:'contrast'}),
  C('box',36,36,{color:'black',stripe:true}), C('shelf',48,24,{color:'white',wrap:true}),
  C('nest',30,30,{shape:'round',count:2,color:'black',frame:'ring'}),
  C('box',36,36,{color:'white',drawers:1,stripe:true}), C('legs',36,36,{shape:'round',color:'white',rim:true}),
  C('shelf',36,36,{color:'white'}), C('facet',36,36,{color:'black',inset:'black'}),
];
const aSeries = [
  C('box',48,24,{color:'white',slider:true}), C('legs',42,21,{color:'white',shape:'boat'}),
  C('storage',48,24,{drawers:1}), C('nest',30,30,{color:'white',shape:'round',count:2}),
  C('storage',48,24,{drawers:1,slim:true}), C('storage',42,21,{color:'white',drawers:1,inset:'glass'}),
  C('nest',36,36,{shape:'hex',count:3,color:'contrast'}), C('facet',36,36,{color:'white'}),
  C('waterfall',42,21,{color:'white'}), C('shelf',36,24,{color:'white',wrap:true}),
  C('legs',36,36,{shape:'pebble'}), C('nest',36,36,{count:2}),
  C('shelf',36,24,{color:'white',raised:true}), C('legs',36,36,{shape:'pebble',frame:'metal'}),
  C('trays',30,30), C('storage',48,24,{drawers:2}),
  C('storage',48,24,{color:'white',drawers:1,casters:true}), C('nest',48,24,{count:2,color:'white',drawers:1}),
  C('nest',48,24,{shape:'oval',count:2}), C('box',36,36,{color:'white',drawers:4}),
  C('legs',48,24,{color:'marble'}), C('storage',48,24,{color:'black',drawers:2}),
  C('box',48,24,{color:'white',inset:'black',drawers:2}), C('nest',36,36,{count:2,color:'marble'}),
  C('legs',48,24), C('box',48,24,{color:'white',drawers:1,wrap:true}),
  C('nest',30,30,{shape:'round',count:2}), C('legs',36,36,{shape:'pebble',color:'white',stripe:true}),
  C('clover',42,42,{inset:'glass'}), C('clover',42,42,{stools:3}),
  C('storage',48,24,{drawers:2}), C('legs',42,42,{shape:'round',inset:'glass',stools:4}),
  C('facet',36,36,{color:'white',stripe:true}), C('box',36,36,{color:'white',slider:true}),
  C('box',36,36,{color:'white',carved:true}), C('nest',30,30,{shape:'round',count:2,rim:true}),
  C('box',36,36,{color:'black',drawers:1}), C('nest',36,36,{count:2,frame:'metal'}),
  C('trays',48,24,{low:true}), C('box',48,24,{color:'white',drawers:1,rounded:true}),
  C('storage',48,24,{color:'white',drawers:2}), C('storage',48,24,{drawers:1,slats:true}),
  C('cross',48,24,{color:'white'}), C('legs',48,24,{shape:'oval',color:'white',stools:2}),
  C('fluted',36,36,{color:'white'}), C('shelf',48,24,{raised:true,dark:true}),
  C('nest',18,18,{shape:'hex',count:3,color:'contrast',frame:'metal'}),
  C('box',48,24,{color:'white',drawers:1,stripe:true}), C('box',48,24,{drawers:2,whiteTop:true}),
  C('shelf',30,30,{stripe:true}), C('storage',36,24,{drawers:1}),
  C('box',48,24,{color:'black',drawers:1,slider:true}), C('trays',48,30,{frame:'metal'}),
  C('shelf',36,24,{inset:'glass',raised:true}), C('legs',36,24,{dark:true}),
  C('cage',30,30,{slats:true}), C('box',48,24,{color:'white',drawers:1,stripe:true}),
  C('cross',30,30,{color:'glass'}), C('legs',36,36,{color:'cream',chunky:true}),
  C('legs',48,24,{slider:true}), C('legs',48,24,{color:'blue',shape:'boat'}),
  C('box',36,36,{color:'black',wrap:true}), C('legs',30,30,{color:'white',shape:'round',frame:'tripod'}),
  C('box',36,36,{whiteTop:true,low:true}), C('box',48,24,{color:'black',drawers:1,slider:true}),
  C('shelf',48,24,{color:'white',inset:'black',rounded:true}),
  C('box',48,24,{color:'white',drawers:2}), C('box',36,36,{slider:true,split:true}),
];
function centerCatalog(rows, series, pageOffset) {
  return rows.map((spec, i) => {
    const code = `${series}-${String(i + 1).padStart(2, '0')}`;
    const primaryW = spec.width * .0254, primaryD = spec.depth * .0254;
    return { ...spec, id: `center-${code.toLowerCase()}`, label: `${code} · ${spec.family}`,
      code, kind:'center', icon:'☕', w: +((spec.count ? 1.42 : 1) * primaryW).toFixed(3),
      d: +((spec.count ? 1.15 : 1) * primaryD).toFixed(3), h:spec.low ? .32 : .43,
      primaryW, primaryD, page: pageOffset + i, source:'Coluxure-Center-Table-Catalogue.pdf',
      note:'Reference-inspired. Height/details estimated; nesting size is the complete arranged footprint.' };
  });
}
export const CENTER_D_CATALOG = centerCatalog(dSeries, 'D', 2);
export const CENTER_A_CATALOG = centerCatalog(aSeries, 'A', 23);

const deskRows = [
  ['DD-166','executive', '#99734a', '#34383a', 'left', 'plain'],
  ['DD-167','executive', '#715443', '#303436', 'right', 'stripes'],
  ['DD-172','executive', '#816345', '#343638', 'both', 'quilt'],
  ['DD-173','executive', '#815b3f', '#e9e5db', 'both', 'stripes'],
  ['DD-174','executive', '#866042', '#e6e0d1', 'left', 'slats'],
  ['DD-175','executive', '#916848', '#deddd1', 'right', 'stripes'],
  ['DD-176','executive', '#8b603f', '#deded2', 'both', 'inset'],
  ['DD-177','return', '#65513e', '#b9ad90', 'right', 'plain'],
  ['MD-178','return', '#b79466', '#343638', 'left', 'open'],
  ['MD-179','return', '#574436', '#c6b08b', 'right', 'plain'],
  ['MD-180','slab-l', '#b9874e', '#b9874e', 'left', 'plain'],
  ['MD-181','metal', '#ae8c62', '#e1e2dc', 'left', 'plain'],
  ['MD-182','metal', '#ae8c62', '#e1e2dc', 'right', 'plain'],
  ['MD-183','metal', '#e2e5e3', '#e2e5e3', 'left', 'plain'],
];
export const DESK_CATALOG = deskRows.map(([code, family, timber, accent, returnSide, detail]) => ({
  id:`desk-${code.toLowerCase()}`, label:code, kind:'desk', icon:'🖥️', code, family, timber, accent,
  returnSide, detail, w:code.startsWith('DD') ? 2 : 1.65,
  d:family === 'executive' && code!=='DD-166' && code!=='DD-167' ? .9 : 1.5, h:.76,
  source:'User-supplied A to Z Office Furniture images',
  note:'Reference-inspired desk only; choose a chair separately. All dimensions estimated.',
}));
export const OFFICE_CHAIR_CATALOG = [
  ['black','Black Padded High-back', '#252625'], ['quilt','Black Diamond High-back', '#282a2b'],
  ['tan','Tan Headrest Executive', '#b47752'], ['ivory','Ivory Executive', '#dad5c5'],
].map(([variant,label,color]) => ({ id:`chair-executive-${variant}`, label, variant, color,
  kind:'office-chair', icon:'💺', w:.7, d:.72, h:1.22,
  source:'Chairs visible in user-supplied desk images', note:'Approximate dimensions and upholstery detailing.' }));
export const REFERENCE_FURNITURE = [...DINING_CATALOG, ...CENTER_D_CATALOG, ...CENTER_A_CATALOG, ...DESK_CATALOG, ...OFFICE_CHAIR_CATALOG];
export const REFERENCE_BY_ID = new Map(REFERENCE_FURNITURE.map(item => [item.id, item]));
