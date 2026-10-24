// Fixed-size procedural studies, in metres. These are NOT manufacturer SKUs.
// IVAS pp.25–30 provide visual references, not engineering dimensions.
export const ACCESSORIES = [
  {id:'concept-bottle-2',category:'bottle',name:'Bottle Pull-Out',variant:'2 tiers',w:.14,h:.52,d:.46,travel:.42,tiers:2,page:28},
  {id:'concept-bottle-3',category:'bottle',name:'Bottle Pull-Out',variant:'3 tiers',w:.18,h:.66,d:.46,travel:.42,tiers:3,page:28},
  {id:'concept-corner',category:'corner',name:'Magic Corner',variant:'4 trays · articulated',w:.84,h:.56,d:.48,travel:.64,tiers:2,page:26,opening:.44},
  {id:'concept-spice',category:'spice',name:'Spice Pull-Out',variant:'3 tiers',w:.14,h:.54,d:.46,travel:.42,tiers:3,page:28},
  {id:'concept-cutlery',category:'cutlery',name:'Cutlery Organizer',variant:'5 compartments',w:.42,h:.10,d:.46,travel:.42,tiers:1,page:27},
  {id:'concept-waste-1',category:'waste',name:'Under-Sink Waste Bin',variant:'Single bin',w:.28,h:.36,d:.42,travel:.38,tiers:1,page:29},
  {id:'concept-waste-2',category:'waste',name:'Under-Sink Waste Bin',variant:'Dual bins',w:.48,h:.36,d:.42,travel:.38,tiers:1,page:29},
  {id:'concept-wicker-2',category:'wicker',name:'Wicker Basket',variant:'2 independent drawers',w:.40,h:.52,d:.45,travel:.40,tiers:2,page:30},
  {id:'concept-wicker-3',category:'wicker',name:'Wicker Basket',variant:'3 independent drawers',w:.40,h:.66,d:.45,travel:.40,tiers:3,page:30},
  {id:'concept-pantry',category:'pantry',name:'Pantry Pull-Out',variant:'5 trays',w:.36,h:1.65,d:.48,travel:.44,tiers:5,page:25},
].map(p=>Object.freeze({...p,verified:false,hardwareMaterial:'brushed-stainless',mounting:'floor-frame',clearance:.008}));
export const PRODUCT_BY_ID = new Map(ACCESSORIES.map(p=>[p.id,p]));
export const mm = n => Math.round(n*1000);
export const clampOpen = n => Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
export function overlaps(a,b,gap=0) {
  return ['x','y','z'].every((k,i)=>Math.abs(a[k]-b[k])<(a[['w','h','d'][i]]+b[['w','h','d'][i]])/2+gap-1e-6);
}
export function productOrigin(c,p) {
  return {x:0,y:p.category==='cutlery'?c.height-p.h-.012:.012,z:c.depth/2-p.d/2-.012};
}
export function compatibility(c,p) {
  const reasons=[];
  if(!p)return {ok:false,reasons:['Choose an accessory.']};
  if(!c||![c.width,c.height,c.depth,c.opening].every(n=>Number.isFinite(n)&&n>0))return {ok:false,reasons:['Cabinet dimensions are unavailable. Enter measured dimensions.']};
  if(!c.confirmed&&!c.modelledInterior)reasons.push('Confirm the internal dimensions, partitions and obstructions before previewing.');
  for(const [key,dim] of [['width','w'],['height','h'],['depth','d']])if(c[key]<p[dim]+p.clearance*2)reasons.push(`Needs ${mm(p[dim]+p.clearance*2)} mm internal ${key}; available ${mm(c[key])} mm.`);
  if(c.opening<(p.opening||p.w)+.008)reasons.push(`Needs a ${mm((p.opening||p.w)+.008)} mm clear door opening.`);
  if(p.category==='corner'&&c.type!=='corner')reasons.push('Requires a measured blind-corner cabinet with a clear connected cavity.');
  if(p.category==='pantry'&&c.type!=='tall')reasons.push('Requires a tall pantry cabinet.');
  if(p.category==='waste'&&c.type!=='sink')reasons.push('Choose a sink cabinet and map its bowl and plumbing.');
  if(c.type==='appliance')reasons.push('This bay contains an appliance.');
  if(c.type==='sink'&&!c.plumbingConfirmed&&!c.modelledInterior)reasons.push('Sink bowl, trap and pipe clearance must be measured and confirmed.');
  const origin=productOrigin(c,p),box={...origin,y:origin.y+p.h/2,w:p.w,h:p.h,d:p.d};
  for(const obstacle of c.obstructions||[])if(overlaps(box,obstacle,.006))reasons.push(`Intersects ${obstacle.label||'an internal obstruction'}.`);
  return {ok:!reasons.length,reasons};
}

// Conceptual door-linked corner: extract, swing the front carrier sideways,
// then translate the rear carrier into the vacant opening. No uniform slide.
export function cornerPose(open,hand='left') {
  const t=clampOpen(open),s=hand==='right'?-1:1;
  const extract=Math.min(t/.38,1),swing=Math.max(0,Math.min((t-.38)/.34,1)),rear=Math.max(0,(t-.72)/.28);
  return {frontZ:.64*extract,frontX:s*.43*swing,angle:-s*Math.PI/2*swing,rearX:s*.42*Math.min(rear/.8,1),rearZ:.10*Math.max(0,(rear-.8)/.2)};
}
