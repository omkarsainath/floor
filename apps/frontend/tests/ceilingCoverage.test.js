import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import fs from 'node:fs';
import { buildCeilingCoverage } from '../src/generators/ceilingCoverage.js';
import { createCeiling } from '../src/generators/ceiling.js';
const wall=(x,y,xx,yy)=>({start:{x,y},end:{x:xx,y:yy},height:3,thickness:.15});
const rect=(x,y,xx,yy)=>[{x,y},{x:xx,y},{x:xx,y:yy},{x,y:yy}];
const hit=(mesh,x,z)=>new THREE.Raycaster(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh,true).length>0;
test('ceiling covers enclosed space even when only one room was detected',()=>{
  const layout={walls:[wall(0,0,6,0),wall(6,0,6,4),wall(6,4,0,4),wall(0,4,0,0)]};
  const rooms=[{id:'known',height:4,points:rect(.1,.1,2,3.9)}];
  const copy=JSON.stringify({layout,rooms});
  const coverage=buildCeilingCoverage(layout,rooms);
  const mesh=createCeiling(coverage);mesh.updateMatrixWorld(true);
  assert.ok(hit(mesh,1,2));assert.ok(hit(mesh,4,2));assert.ok(!hit(mesh,7,2));
  assert.equal(coverage[0].height,4);assert.equal(JSON.stringify({layout,rooms}),copy);
});
test('ceiling preserves concave exterior and explicit courtyard exclusion',()=>{
  const points=[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:3,y:2},{x:3,y:5},{x:0,y:5}];
  const layout={walls:points.map((p,i)=>wall(p.x,p.y,points[(i+1)%6].x,points[(i+1)%6].y))};
  const coverage=buildCeilingCoverage(layout,[{name:'courtyard',points:rect(.5,.5,1.5,1.5)}]);
  const mesh=createCeiling(coverage);mesh.updateMatrixWorld(true);
  assert.ok(hit(mesh,2,3));assert.ok(!hit(mesh,5,4));assert.ok(!hit(mesh,1,1));
});
test('an unsupported large exterior gap is not covered with a guessed roof',()=>{
  const layout={walls:[wall(0,0,6,0),wall(6,0,6,4),wall(6,4,0,4)]};
  assert.deepEqual(buildCeilingCoverage(layout,[]),[]);
});
test('an evidenced window gap closes ceiling coverage but not the rendered opening',()=>{
  const layout={walls:[wall(0,0,2,0),wall(3,0,6,0),wall(6,0,6,4),wall(6,4,0,4),wall(0,4,0,0)]};
  assert.deepEqual(buildCeilingCoverage(layout,[]),[]);
  const coverage=buildCeilingCoverage(layout,[],[{bbox:{x1:2,y1:-.1,x2:3,y2:.1}}]);
  const mesh=createCeiling(coverage);mesh.updateMatrixWorld(true);
  assert.ok(hit(mesh,3,2));
});

test('same-height rooms and partitions form one slab with no wall-top seams',()=>{
  const layout={walls:[wall(0,0,6,0),wall(6,0,6,4),wall(6,4,0,4),wall(0,4,0,0),wall(2,0,2,4)]};
  const rooms=[{name:'Bedroom',height:3,points:rect(.1,.1,1.9,3.9)}];
  const coverage=buildCeilingCoverage(layout,rooms);
  assert.equal(coverage.length,1);
  const mesh=createCeiling(coverage);mesh.updateMatrixWorld(true);
  for(const x of [1.9,1.99,2,2.01,2.1,4]) assert.ok(hit(mesh,x,2),`seam at ${x}`);
});

test('mixed room label does not discard indoor coverage as a balcony',()=>{
  const rooms=[{name:'Living Room / Balcony',points:rect(0,0,6,4)}];
  const layout={walls:[wall(0,0,6,0)]};
  const mesh=createCeiling(buildCeilingCoverage(layout,rooms));mesh.updateMatrixWorld(true);
  assert.ok(hit(mesh,3,2));
});

test('explicit footprint and courtyard hole work even with incomplete scanned walls',()=>{
  const layout={walls:[wall(0,0,6,0)],footprint:{points:rect(0,0,6,4),holes:[rect(2,1,3,2)]}};
  const mesh=createCeiling(buildCeilingCoverage(layout,[]));mesh?.updateMatrixWorld(true);
  assert.ok(mesh && hit(mesh,4,2));assert.ok(!hit(mesh,2.5,1.5));
});

test('window supported by a perpendicular corner jamb closes ceiling enclosure',()=>{
  const layout={walls:[wall(0,0,4,0),wall(6,0,6,4),wall(6,4,0,4),wall(0,4,0,0)]};
  const openings=[{class:'window',bbox:{x1:4,y1:-.1,x2:6,y2:.1}}];
  const mesh=createCeiling(buildCeilingCoverage(layout,[],openings));mesh.updateMatrixWorld(true);
  assert.ok(hit(mesh,3,2));
  assert.deepEqual(buildCeilingCoverage(layout,[],[{class:'window',bbox:{x1:4.5,y1:-.1,x2:5.5,y2:.1}}]),[]);
});

for(const fixture of JSON.parse(fs.readFileSync(new URL('./fixtures/ceiling-plans.json',import.meta.url)))) {
  test(`real scan ${fixture.name}: ceiling covers sampled interiors, not exterior setbacks`,()=>{
    const {layout}=fixture;
    const coverage=buildCeilingCoverage(layout,layout.rooms,layout.objects);
    assert.equal(coverage.length,1);
    const mesh=createCeiling(coverage);mesh.updateMatrixWorld(true);
    for(const p of fixture.inside) assert.ok(hit(mesh,p.x,p.y),`missing ceiling at ${JSON.stringify(p)}`);
    for(const p of fixture.outside) assert.ok(!hit(mesh,p.x,p.y),`ceiling outside footprint at ${JSON.stringify(p)}`);
  });
}

for(const vertical of [false,true])test(`door at a corner closes ceiling without a lintel (${vertical?'vertical':'horizontal'})`,()=>{
  const transform=p=>vertical?{x:p.y,y:p.x}:p;
  const layout={walls:[wall(0,0,4,0),wall(5,0,5,4),wall(5,4,0,4),wall(0,4,0,0)].map(w=>({...w,start:transform(w.start),end:transform(w.end)}))};
  const box=vertical?{x1:-.08,y1:4,x2:.08,y2:5}:{x1:4,y1:-.08,x2:5,y2:.08};
  const opening={class:'door-designer-17',height_m:3,bbox:box};
  const before=JSON.stringify(layout);
  assert.deepEqual(buildCeilingCoverage(layout,[],[]),[]);
  const mesh=createCeiling(buildCeilingCoverage(layout,[],[opening]));
  assert.ok(mesh);mesh.updateMatrixWorld(true);
  assert.ok(hit(mesh,2,2));assert.ok(!hit(mesh,6,6));
  assert.equal(JSON.stringify(layout),before,'no invented structural wall or measured room');
});

test('door boundary does not seal unsupported gaps, square swing footprints or outdoor zones',()=>{
  const layout={walls:[wall(0,0,4,0),wall(5,0,5,4),wall(5,4,0,4),wall(0,4,0,0)]};
  for(const bbox of [{x1:4.3,y1:-.08,x2:4.7,y2:.08},{x1:4,y1:0,x2:5,y2:1}]){
    assert.deepEqual(buildCeilingCoverage(layout,[],[{class:'door',bbox}]),[]);
  }
  const rooms=[{name:'courtyard',points:rect(1,1,3,3)}];
  const mesh=createCeiling(buildCeilingCoverage(layout,rooms,[{class:'door',bbox:{x1:4,y1:-.08,x2:5,y2:.08}}]));
  mesh.updateMatrixWorld(true);assert.ok(!hit(mesh,2,2));assert.ok(hit(mesh,.5,2));
});

test('live ceiling refresh retains the visibility/control root when door evidence changes',async()=>{
  const {updateCeiling}=await import('../src/generators/ceiling.js');
  const root=new THREE.Group();root.visible=false;
  const layout={walls:[wall(0,0,4,0),wall(5,0,5,4),wall(5,4,0,4),wall(0,4,0,0)]};
  const opening={class:'door',bbox:{x1:4,y1:-.08,x2:5,y2:.08}};
  assert.equal(updateCeiling(root,buildCeilingCoverage(layout,[],[opening])),root);
  root.updateMatrixWorld(true);assert.ok(hit(root,2,2));assert.equal(root.visible,false);
  let disposed=0;root.children[0].geometry.addEventListener('dispose',()=>disposed++);
  root.visible=true;updateCeiling(root,buildCeilingCoverage(layout,[],[]));
  assert.equal(disposed,1);assert.equal(root.children.length,0);assert.equal(root.visible,true);
  updateCeiling(root,buildCeilingCoverage(layout,[],[opening]));root.updateMatrixWorld(true);
  assert.ok(hit(root,2,2));assert.equal(root.visible,true);
});
