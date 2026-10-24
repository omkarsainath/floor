import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCESSORIES,compatibility} from '../src/kitchen/catalog.js';
import * as THREE from 'three';
import {createObject} from '../src/generators/object.js';
import {kitchenState,applyKitchenState,syncKitchenRecord,resizeKitchenSection,cabinetList,newAccessory,accessoryModel,motionProblem} from '../src/kitchen/system.js';

test('sink opening exposes a recessed bowl and restores the countertop when removed',()=>{
  const record={id:'sink-test',class:'kitchen-pullout-slab',bbox:{x1:-.9,x2:.9,y1:-.3,y2:.3}};
  const root=createObject(record),s=kitchenState(root);
  delete s.cabinets['bay-2'].accessory;s.cabinets['bay-2'].profile.type='sink';applyKitchenState(root,s);
  function check(r){
    r.updateMatrixWorld(true);const sink=r.getObjectByName('Inset kitchen sink');assert.ok(sink);
    const origin=sink.localToWorld(new THREE.Vector3(.06,1,0)),ray=new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0));
    const visible=[];r.traverseVisible(n=>{if(n.isMesh)visible.push(n);});
    const hit=ray.intersectObjects(visible,false)[0];assert.equal(hit.object.name,'sink-bowl-floor');
    const top=sink.getWorldPosition(new THREE.Vector3()).y;assert.ok(hit.point.y<top-.1,'Bowl must be below countertop');
    const tap=new THREE.Box3().setFromObject(sink.getObjectByName('sink-gooseneck'));assert.ok(tap.max.y>top+.3);
  }
  check(root);resizeKitchenSection(root,'bay-2','width',.75);check(root);
  syncKitchenRecord(root,record);check(createObject(record));
  const back=kitchenState(root);back.cabinets['bay-2'].profile.type='base';applyKitchenState(root,back);
  assert.equal(root.getObjectByName('Inset kitchen sink'),undefined);
  assert.ok(root.children.find(n=>n.name==='cabinet-countertop'&&n.userData.kitchenBay==='bay-2').visible);
});

test('unconfirmed modelled sink accepts a fitting bin without marking physical measurements confirmed',()=>{
  const root=createObject({id:'sink-bin',class:'kitchen-pullout-slab',bbox:{x1:-.9,x2:.9,y1:-.3,y2:.3}});
  const s=kitchenState(root),id='bay-2';
  s.cabinets[id].profile={type:'sink',confirmed:false,plumbingConfirmed:false};
  delete s.cabinets[id].accessory;applyKitchenState(root,s);
  const c=cabinetList(root).find(c=>c.id===id);
  assert.equal(c.confirmed,false);assert.ok(c.obstructions.some(o=>o.label==='modelled sink bowl'));
  assert.equal(compatibility({...c,obstructions:[{label:'pipe',x:0,y:.2,z:0,w:c.width,h:.4,d:c.depth}]},ACCESSORIES.find(p=>p.category==='waste')).ok,false);
  const next=kitchenState(root);next.cabinets[id].accessory=newAccessory(ACCESSORIES.find(p=>p.category==='waste').id);
  applyKitchenState(root,next,{strict:true});
  assert.ok(accessoryModel(root,id));assert.equal(motionProblem(root,id,0),null);
  assert.equal(kitchenState(root).cabinets[id].profile.confirmed,false);
});
