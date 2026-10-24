import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createObject} from '../src/generators/object.js';
import {CATEGORIES} from '../src/ui/catalogPanel.js';
import {PULLOUT_SLAB_ID,PULLOUT_SLAB_ITEM} from '../src/kitchen/presets.js';
import {cabinetList,kitchenState,applyKitchenState,resizeKitchenSection,syncKitchenRecord,kitchenStructureProblem,accessoryModel,motionProblem,operateAccessory,tickKitchen,newAccessory} from '../src/kitchen/system.js';
import {persistLayout} from '../src/state/projectPersistence.js';
import {parseLayout} from '../src/loaders/jsonLoader.js';

const record=()=>({id:'ready-kitchen',class:PULLOUT_SLAB_ID,source:'catalog',bbox:{x1:-.9,x2:.9,y1:-.3,y2:.3},rotationY:.37});

test('catalog slab has three preinstalled independent pull-out sections that clear the cabinet',()=>{
  assert.ok(CATEGORIES.find(c=>c.id==='kitchen').items.includes(PULLOUT_SLAB_ITEM));
  const root=createObject(record()),bays=cabinetList(root);
  assert.equal(bays.length,3);
  assert.deepEqual(bays.map(c=>c.accessory.productModelId),['concept-bottle-2','concept-cutlery','concept-wicker-3']);
  for(const c of bays){
    assert.ok(c.confirmed);assert.ok(accessoryModel(root,c.id));
    assert.equal(motionProblem(root,c.id,0),null);
    assert.equal(motionProblem(root,c.id,1),null);
    operateAccessory(root,c.id,1);for(let i=0;i<10;i++)tickKitchen(root,.1);
  }
  for(const c of bays)assert.equal(motionProblem(root,c.id,0),null,'neighbouring open pull-outs remain clear');
});

test('preset sections can be replaced, removed and refinished without changing their neighbours',()=>{
  const root=createObject(record()),original=kitchenState(root);
  const state=kitchenState(root);
  state.cabinets['bay-1'].accessory=newAccessory('concept-spice');
  delete state.cabinets['bay-2'].accessory;
  state.cabinets['bay-3'].accessory.laminateMode='OVERRIDE';
  state.cabinets['bay-3'].accessory.laminate={laminateId:'gl-175-arn'};
  applyKitchenState(root,state,{strict:true});
  assert.equal(accessoryModel(root,'bay-1').userData.kitchenModel.product.id,'concept-spice');
  assert.equal(accessoryModel(root,'bay-2'),undefined);
  assert.equal(root.children.filter(n=>n.userData.isFurnitureDoor)[1].visible,true);
  assert.equal(accessoryModel(root,'bay-3').getObjectByName('laminate-front').material.userData.laminateId,'gl-175-arn');
  assert.equal(kitchenState(root).cabinets['bay-3'].accessory.id,original.cabinets['bay-3'].accessory.id);
  assert.equal(motionProblem(root,'bay-1',1),null);
});

test('saving and reloading preserves edited sections and never reinstalls removed accessories',()=>{
  const input=record(),root=createObject(input),state=kitchenState(root);
  delete state.cabinets['bay-2'].accessory;
  state.cabinets['bay-1'].accessory=newAccessory('concept-spice');
  applyKitchenState(root,state,{strict:true});input.kitchen=kitchenState(root);
  const storage=new Map();assert.equal(persistLayout({units:'m',walls:[],rooms:[],objects:[input]},{setItem:(k,v)=>storage.set(k,v)}),true);
  const loaded=createObject(parseLayout(JSON.parse(storage.get('preciseFloorplan'))).objects[0]);
  assert.deepEqual(kitchenState(loaded),input.kitchen);
  assert.equal(accessoryModel(loaded,'bay-2'),undefined);
  const empty=createObject({...record(),kitchen:{version:1,cabinets:{}}});
  for(const c of cabinetList(empty))assert.equal(c.accessory,undefined);
});

test('section resizing changes physical fronts and countertop while retaining neighbours and rear-left anchor',()=>{
  const root=createObject(record()),before=cabinetList(root),ids=before.map(c=>c.accessory.id);
  const anchor=(r)=>{r.updateMatrixWorld(true);const sizes=kitchenState(r).sectionSizes;return r.localToWorld(new THREE.Vector3(-sizes.reduce((sum,s)=>sum+s.width,0)/2,0,-Math.max(...sizes.map(s=>s.depth))/2));};
  const fixed=anchor(root);
  resizeKitchenSection(root,'bay-1','width',.742);resizeKitchenSection(root,'bay-1','height',.8);resizeKitchenSection(root,'bay-1','depth',.65);
  const after=cabinetList(root);
  for(const [key,value] of Object.entries({width:.742,height:.8,depth:.65}))assert.ok(Math.abs(after[0][key]-value)<1e-7);
  for(let i=1;i<3;i++)for(const key of ['width','height','depth'])assert.ok(Math.abs(after[i][key]-before[i][key])<1e-7);
  assert.ok(after[0].frontWidth>before[0].frontWidth);assert.ok(after[0].frontHeight>before[0].frontHeight);
  assert.ok(anchor(root).distanceTo(fixed)<1e-7);assert.deepEqual(after.map(c=>c.accessory.id),ids);
  for(const c of after)assert.equal(motionProblem(root,c.id,1),null);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(root).max.y-.986)<1e-6);
});

test('resized geometry and placement survive save/reload and state restoration restores the original size',()=>{
  const input=record(),root=createObject(input),original=kitchenState(root),position=root.position.clone();
  resizeKitchenSection(root,'bay-1','width',.742);resizeKitchenSection(root,'bay-1','height',.8);resizeKitchenSection(root,'bay-1','depth',.65);
  syncKitchenRecord(root,input);const loaded=createObject(input);
  assert.deepEqual(kitchenState(loaded),kitchenState(root));assert.ok(loaded.position.distanceTo(root.position)<1e-7);
  applyKitchenState(root,original,{strict:true});assert.ok(root.position.distanceTo(position)<1e-7);assert.deepEqual(kitchenState(root),original);
});

test('undersized edits leave the current physical cabinet intact',()=>{
  const root=createObject(record()),before=kitchenState(root),model=accessoryModel(root,'bay-1'),position=root.position.clone();
  for(const [key,value] of [['width',.15],['height',.4],['depth',.4]])assert.throws(()=>resizeKitchenSection(root,'bay-1',key,value),/Needs/);
  assert.equal(accessoryModel(root,'bay-1'),model);assert.deepEqual(kitchenState(root),before);assert.deepEqual(root.position,position);
});

test('direct slider updates move only the selected drawer immediately and supersede its animation',()=>{
  const root=createObject(record()),model=accessoryModel(root,'bay-3'),data=model.userData.kitchenModel;
  operateAccessory(root,'bay-3',1,{tier:1});tickKitchen(root,.1);
  operateAccessory(root,'bay-3',.35,{tier:1,immediate:true});
  assert.equal(data.moving[1].position.z,data.product.travel*.35);assert.equal(data.moving[0].position.z,0);
  for(let i=0;i<10;i++)tickKitchen(root,.1);
  assert.equal(data.moving[1].position.z,data.product.travel*.35);
});

test('resized sections detect physical blockers even after every pull-out is removed',()=>{
  const root=createObject({...record(),rotationY:0,kitchen:{version:1,cabinets:{}}});
  const blocker=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1));blocker.position.set(1.1,.5,0);blocker.userData.kitchenObstacleLabel='wall';
  assert.equal(kitchenStructureProblem(root,{obstacles:[blocker]}),null);
  resizeKitchenSection(root,'bay-1','width',1);
  assert.match(kitchenStructureProblem(root,{obstacles:[blocker]}),/overlaps wall/);
});
