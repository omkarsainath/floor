import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { OBB } from 'three/examples/jsm/math/OBB.js';
import {createSofaFactoryFurniture,SOFA_FACTORY_CATALOG} from '../src/generators/sofaFactory.js';
import {createObject} from '../src/generators/object.js';

const id='sf-sofas-p18-19',make=()=>createSofaFactoryFurniture(id,2.794,2.794);
const bounds=n=>new T.Box3().setFromObject(n),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('No. 19 uses its own 110 × 110 × 33 inch envelope and 34 inch wing depth',()=>{
 const root=make(),box=bounds(root),size=box.getSize(new T.Vector3());
 close(size.x,2.794);close(size.z,2.794);close(size.y,.8382);close(box.min.y,0);
 const catalogue=SOFA_FACTORY_CATALOG.find(p=>p.id===id);close(catalogue.seatingDepth,.8636);
 close(root.getObjectByName('base-x-wing').userData.dimensions.depth,.8636);
 close(root.getObjectByName('base-z-wing').userData.dimensions.width,.8636);
});
test('equal seated wings share one corner and have two large backs each plus three corner cushions',()=>{
 const root=make();root.updateMatrixWorld(true);
 const x=root.getObjectByName('seat-x-wing'),z=root.getObjectByName('seat-z-wing');
 assert.deepEqual(x.userData.dimensions,z.userData.dimensions);
 assert.ok(root.getObjectByName('backrest-x-wing'));assert.ok(root.getObjectByName('backrest-z-wing'));
 close(bounds(root.getObjectByName('backrest-x-wing')).min.y,bounds(root.getObjectByName('base-x-wing')).max.y);
 close(bounds(root.getObjectByName('backrest-z-wing')).min.y,bounds(root.getObjectByName('base-z-wing')).max.y);
 assert.equal(root.children.filter(c=>c.name==='shared-corner-seat').length,1);
 assert.equal(root.children.filter(c=>c.name.startsWith('back-cushion-')).length,4);
 assert.equal(root.children.filter(c=>c.name.startsWith('corner-cushion-')).length,3);
 // Compare adjacent pads on the same surface. A back cushion resting on a
 // lofted seat can share its AABB without intersecting the actual foam surface.
 for(const names of [/^(back-cushion-|corner-cushion-)/,/^(seat-|shared-corner-seat)/]){
  const parts=root.children.filter(c=>names.test(c.name));
  for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++){
   const a=parts[i].isMesh?parts[i]:parts[i].children[0],b=parts[j].isMesh?parts[j]:parts[j].children[0];
   const oa=new OBB().fromBox3(a.geometry.boundingBox).applyMatrix4(a.matrixWorld),ob=new OBB().fromBox3(b.geometry.boundingBox).applyMatrix4(b.matrixWorld);
   assert.equal(oa.intersectsOBB(ob),false,parts[i].name+' intersects '+parts[j].name);
  }
 }
 const a=bounds(root.getObjectByName('corner-base')),b=bounds(root.getObjectByName('base-x-wing')),c=bounds(root.getObjectByName('base-z-wing'));
 close(a.max.x,b.min.x);close(a.max.z,c.min.z);
});
test('separate material surfaces retain physical UVs, finite unit normals and source resolution',()=>{
 const root=make(),materials=new Set(),phases=new Set();let patterns=0;
 root.traverse(n=>{if(!n.isMesh)return;materials.add(n.material.name);
  const p=n.geometry.attributes.position,normal=n.geometry.attributes.normal;
  assert.ok([...p.array].every(Number.isFinite),n.name);
  for(const slot of ['map','roughnessMap','bumpMap'])if(n.material[slot]?.channel===1)assert.ok(n.geometry.attributes.uv1,n.name+' needs physical UVs');
  for(let i=0;i<normal.count;i++)close(new T.Vector3().fromBufferAttribute(normal,i).length(),1);
  if(n.name==='patterned-insert'){
   patterns++;phases.add(n.parent.userData.textilePhase.join(','));assert.deepEqual(n.material.userData.sourceResolution,[64,33]);
   const uv=n.geometry.attributes.uv;
   close((p.getX(1)-p.getX(0))/.8,uv.getX(1)-uv.getX(0));
  }
 });
 assert.equal(phases.size,9); // Each cushion/arm gets a distinct cut from one physical-scale textile.
 assert.equal(patterns,23); // Four large crossed inserts, three plain corner inserts, two divided arms.
 for(const label of ['taupe woven upholstery','dark patterned fabric','light wood','dark vertical trim','short dark feet'])assert.ok([...materials].some(m=>m.includes(label)),label);
});
test('catalogue placement, arbitrary yaw and non-default footprint still use the dedicated meshes',()=>{
 const obj=createObject({id:'placed-19',class:id,source:'catalog',bbox:{x1:2,y1:3,x2:4.794,y2:5.794},rotationY:.713});
 assert.equal(obj.userData.layoutId,'placed-19');assert.equal(obj.rotation.y,.713);
 assert.equal(obj.userData.sofaDesign.dedicated,true);
 const resized=createSofaFactoryFurniture(id,3,2.6),size=bounds(resized).getSize(new T.Vector3());close(size.x,3);close(size.z,2.6);close(size.y,.8382);
 assert.equal(createSofaFactoryFurniture('sf-sofas-p18-20',2.794,2.794).userData.sofaDesign.dedicated,undefined);
 assert.equal(createSofaFactoryFurniture('sf-sofas-p25-38',2.794,2.794).userData.sofaDesign.dedicated,undefined);
});
