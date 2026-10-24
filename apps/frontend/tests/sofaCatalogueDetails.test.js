import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SOFA_DESIGNS } from '../src/generators/sofaDesigns.js';
import { SOFA_FACTORY_CATALOG, createSofaFactoryFurniture } from '../src/generators/sofaFactory.js';
import { createSofaMaterials } from '../src/generators/sofaUpholstery.js';

const make=id=>{const p=SOFA_FACTORY_CATALOG.find(p=>p.id===id);return createSofaFactoryFurniture(id,p.w,p.d);};
const parts=(root,name)=>{const matches=[];root.traverse(n=>{if(n.name===name)matches.push(n);});return matches;};
const bounds=node=>new THREE.Box3().setFromObject(node);

test('all 75 sofa products have an individually reviewed construction record',()=>{
 const sofas=SOFA_FACTORY_CATALOG.filter(p=>['sofas','economic-sofas','recliners','sofa-beds','wooden-sofas'].includes(p.category));
 assert.equal(sofas.length,75);assert.equal(Object.keys(SOFA_DESIGNS).length,75);
 for(const p of sofas){const d=SOFA_DESIGNS[p.id];assert.ok(d?.observed.length>30,p.id);assert.ok(d.mainSeats>=1,p.id);
  for(const key of ['seatColor','frameColor','backColor','trimColor','woodColor'])if(d[key])assert.match(d[key],/^#[0-9a-f]{6}$/i,p.id+' '+key);
 }
});
test('photographed L-Cum Bed has a joined left chaise, four heads and its own floral print',()=>{
 const root=make('sf-sofa-beds-p39-01');root.updateMatrixWorld(true);
 assert.equal(parts(root,'seat-cushion').length,2);
 assert.equal(parts(root,'back-cushion').length,4);
 assert.equal(parts(root,'adjustable-headrest').length,4);
 assert.equal(parts(root,'arm-shelf-interior').length,1);
 assert.equal(parts(root,'timber-arm-tray').length,1);
 const main=parts(root,'chaise-main')[0],chaise=parts(root,'chaise-extension')[0];
 const a=bounds(parts(main,'upholstered-base')[0]),b=bounds(parts(chaise,'upholstered-base')[0]);
 assert.ok(Math.abs(a.min.x-b.max.x)<1e-5,'chaise and main base must meet');
 assert.ok(b.max.z>a.max.z+.3,'chaise extends beyond the main seat');
 const backs=parts(root,'back-cushion');
 assert.ok(backs.every(n=>n.material.userData.sourceProduct==='sf-sofa-beds-p39-01'));
 const wooden=createSofaMaterials(SOFA_FACTORY_CATALOG.find(p=>p.id==='sf-sofa-beds-p39-03'));
 assert.notEqual(backs[0].material.map,wooden.backFabric.map,'never borrow the wooden sofa print');
});
test('left and right chaise products keep their photographed orientation',()=>{
 for(const [id,right] of [['sf-economic-sofas-p27-03',false],['sf-economic-sofas-p29-09',true],['sf-economic-sofas-p32-16',true]]){
  const root=make(id);root.updateMatrixWorld(true);
  const main=bounds(parts(parts(root,'chaise-main')[0],'upholstered-base')[0]);
  const wing=bounds(parts(parts(root,'chaise-extension')[0],'upholstered-base')[0]);
  assert.ok(Math.abs(right?main.max.x-wing.min.x:main.min.x-wing.max.x)<1e-5,id);
 }
});
test('corner bases join without an internal arm or reserved arm-width gap',()=>{
 for(const id of ['sf-sofas-p11-1','sf-sofa-beds-p39-02','sf-economic-sofas-p33-20']){
  const root=make(id);root.updateMatrixWorld(true);
  const main=bounds(parts(parts(root,'corner-main')[0],'upholstered-base')[0]);
  const wing=bounds(parts(parts(root,'corner-return')[0],'upholstered-base')[0]);
  assert.ok(Math.abs(main.max.z-wing.min.z)<1e-5,id);
  assert.equal(parts(root,'sofa-arm').length,2,id+' only two outside arms');
 }
});
test('Viva is a measured 3+2 set and the economy 3+2+diwan includes its third component',()=>{
 const p=SOFA_FACTORY_CATALOG.find(p=>p.id==='sf-sofas-p25-37');
 assert.equal(p.corner,false);assert.deepEqual(p.dimensionRows,[[82,35,37],[60,35,37]]);
 assert.equal(make(p.id).children.length,2);
 assert.equal(parts(make('sf-economic-sofas-p26-02'),'separate-diwan').length,1);
 const daybed=make('sf-economic-sofas-p35-23');assert.equal(parts(daybed,'back-shell').length,0);assert.equal(parts(daybed,'back-cushion').length,0);
});
test('open timber frames leave space below the seat; enclosed sleepers retain front panels',()=>{
 const open=make('sf-wooden-sofas-p43-02'),closed=make('sf-sofa-beds-p39-03');
 assert.ok(parts(open,'upholstered-base').every(n=>n.userData.dimensions.height<.1));
 assert.ok(parts(closed,'upholstered-base').every(n=>n.userData.dimensions.height>.15));
 assert.ok(parts(open,'arm-spindle').length>0);
});
