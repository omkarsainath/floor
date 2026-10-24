import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { resolveOpeningGeometry, buildWallSegments } from '../src/measurements/modelMeasurements.js';
import { createObject, getWindowSillAndTop } from '../src/generators/object.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const wall=(id,a,b)=>({id,start:{x:a,y:0},end:{x:b,y:0},height:3,thickness:.15});
function visibleBounds(object){
  const result=new THREE.Box3();object.updateMatrixWorld(true);
  object.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(materials.every(m=>m.transparent&&m.opacity===0))return;
    mesh.geometry.computeBoundingBox();result.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  });return result;
}

test('door frame fits the same widened jamb span as the wall cut for both orientations and all swings',()=>{
  for(const vertical of [false,true])for(const swingDir of ['left-inside','right-inside','left-outside','right-outside']){
    const walls=[wall('left',0,2),wall('right',3.07,5)];
    const input={id:'door',class:'door',swingDir,bbox:{x1:2.04,y1:-.1,x2:2.94,y2:.1},...getWindowSillAndTop('door')};
    if(vertical){walls.forEach(w=>{for(const p of [w.start,w.end])[p.x,p.y]=[p.y,p.x];});
      const b=input.bbox;input.bbox={x1:b.y1,y1:b.x1,x2:b.y2,y2:b.x2};}
    const before=structuredClone(input);
    const [opening]=resolveOpeningGeometry(walls,[input]);
    assert.deepEqual(input,before);
    const mesh=createObject({...opening,walls}),box=visibleBounds(mesh);
    close(vertical?box.min.z:box.min.x,2);close(vertical?box.max.z:box.max.x,3.07);
    const header=buildWallSegments(walls,[opening]).filter(w=>w.isDetectedGap);
    assert.equal(header.length,1);
    close(vertical?header[0].start.y:header[0].start.x,2);
    close(vertical?header[0].end.y:header[0].end.x,3.07);
    assert.deepEqual(resolveOpeningGeometry(walls,[opening])[0].bbox,opening.bbox);
  }
});

test('door beside a perpendicular corner fits the complete supported opening',()=>{
  const walls=[{...wall('return',0,1),start:{x:2,y:-2},end:{x:2,y:2}},wall('right',3.07,5)];
  const opening={class:'door',bbox:{x1:2.04,y1:-.075,x2:2.94,y2:.075},...getWindowSillAndTop('door')};
  const [fitted]=resolveOpeningGeometry(walls,[opening]);
  close(fitted.bbox.x1,2);close(fitted.bbox.x2,3.07);
  const box=visibleBounds(createObject({...fitted,walls}));close(box.min.x,2);close(box.max.x,3.07);
});

test('open passages, unsupported detections and a shared side-light are never swallowed by a widened door',()=>{
  const walls=[wall('left',0,2),wall('right',4,6)];
  const door={class:'door',bbox:{x1:2,y1:-.1,x2:3.6,y2:.1}};
  const window={class:'window',bbox:{x1:3.6,y1:-.1,x2:4,y2:.1}};
  assert.deepEqual(resolveOpeningGeometry(walls,[door,window]),[door,window]);
  assert.deepEqual(resolveOpeningGeometry(walls,[]),[]);
  assert.deepEqual(resolveOpeningGeometry(walls,[{...door,bbox:{x1:2.5,y1:-.1,x2:3,y2:.1}}]),[{...door,bbox:{x1:2.5,y1:-.1,x2:3,y2:.1}}]);
});
