import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createReferenceFurniture,updateDiningChairs,validateDiningChairs,DINING_CHAIR_STYLES} from '../src/generators/referenceFurniture.js';
import {DINING_CATALOG} from '../src/generators/referenceFurnitureCatalog.js';
import {createObject} from '../src/generators/object.js';
import {parseLayout} from '../src/loaders/jsonLoader.js';

for(const spec of DINING_CATALOG)test(`${spec.id}: edit/remove/add chairs without moving or rescaling the table`,()=>{
  const root=createReferenceFurniture(spec.id,spec.w,spec.d);
  root.position.set(4,.2,5);root.rotation.y=.73;root.updateMatrixWorld(true);
  const table=root.children.find(n=>n.name==='top'),matrix=table.matrixWorld.clone(),scale=root.scale.clone();
  const defaults=root.userData.diningChairs;
  const untouched=root.children.find(c=>c.userData.diningChairId===defaults[2].id);
  assert.equal(new Set(defaults.map(s=>s.id)).size,defaults.length);
  const modified=defaults.slice(1).map((c,i)=>i===0?{...c,style:'dining-ref-03',color:'#ac22aa',width:.65,x:c.x+.15,yaw:c.yaw+.1}:c);
  modified.push({...defaults[0],id:'added-chair',style:'armchair',x:3,z:2,width:.8,depth:.8});
  const state=updateDiningChairs(root,modified);root.updateMatrixWorld(true);
  assert.deepEqual(root.scale,scale);assert.deepEqual(table.matrixWorld,matrix);
  assert.equal(root.children.find(c=>c.userData.diningChairId===defaults[2].id),untouched,'unchanged seats keep their geometry and material');
  assert.deepEqual(state,modified);assert.equal(root.children.filter(c=>c.userData.diningChairId).length,modified.length);
  const data={units:'m',walls:[],rooms:[],objects:[{id:'edited',class:spec.id,source:'catalog',rotationY:.73,elevation:.2,
    bbox:{x1:4-spec.w/2,y1:5-spec.d/2,x2:4+spec.w/2,y2:5+spec.d/2},diningChairs:state}]};
  const loaded=createObject(parseLayout(JSON.parse(JSON.stringify(data))).objects[0]);loaded.updateMatrixWorld(true);
  assert.deepEqual(loaded.userData.diningChairs,modified);
  const reloadedTop=loaded.children.find(n=>n.name==='top');
  table.matrixWorld.elements.forEach((v,i)=>assert.ok(Math.abs(v-reloadedTop.matrixWorld.elements[i])<1e-8));
  updateDiningChairs(root,[]);assert.deepEqual(root.userData.diningChairs,[]);
  const empty=createReferenceFurniture(spec.id,spec.w,spec.d,{diningChairs:[]});
  assert.equal(empty.children.filter(c=>c.userData.diningChairId).length,0,'empty arrangement stays empty on reload');
  updateDiningChairs(empty,[defaults[0]]);assert.equal(empty.userData.diningChairs.length,1,'chairs can be added to a table-only set');
});
test('every offered chair style creates finite geometry at the requested size',()=>{
  const root=createReferenceFurniture('dining-ref-01',2.89,1.94),original=root.userData.diningChairs[0];
  for(const style of DINING_CHAIR_STYLES){
    updateDiningChairs(root,[{...original,style:style.id,width:.65,depth:.6,yaw:0,color:'#558899'}]);
    const chair=root.children.find(c=>c.userData.diningChairId);
    const clone=chair.clone();clone.position.set(0,0,0);
    const size=new THREE.Box3().setFromObject(clone).getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x-.65)<1e-6);assert.ok(Math.abs(size.z-.6)<1e-6);
    chair.traverse(n=>{if(n.isMesh)assert.ok(n.geometry.attributes.position.array.every(Number.isFinite));});
  }
});
test('invalid edits are rejected atomically, without removing chairs or disposing table materials',()=>{
  const root=createReferenceFurniture('dining-ref-01',2.89,1.94),state=root.userData.diningChairs,first=state[0];
  const table=root.children.find(n=>n.name==='top');let disposed=false;table.material.addEventListener('dispose',()=>{disposed=true;});
  for(const bad of [null,[first,first],[{...first,x:NaN}],[{...first,style:'window'}],[{...first,width:0}],[{...first,color:'red'}],Array(33).fill(first)]){
    assert.throws(()=>updateDiningChairs(root,bad));assert.equal(root.userData.diningChairs,state);
  }
  updateDiningChairs(root,[]);assert.equal(disposed,false);
  assert.deepEqual(validateDiningChairs([]),[]);
});
