import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createObject } from '../src/generators/object.js';
import { createWall } from '../src/generators/wall.js';
import { parseLayout } from '../src/loaders/jsonLoader.js';
import { persistLayout } from '../src/state/projectPersistence.js';
import { ACCESSORIES, compatibility, cornerPose } from '../src/kitchen/catalog.js';
import { createAccessoryModel, setAccessoryPose, disposeAssembly } from '../src/kitchen/models.js';
import { cabinetList, kitchenState, applyKitchenState, accessoryModel, accessoryOperationFromHit, newAccessory, motionProblem, operateAccessory, tickKitchen, setKitchenCutaway } from '../src/kitchen/system.js';
const record=(extra={})=>({id:'kitchen',class:'kitchen-base-cabinet',source:'catalog',bbox:{x1:-.95,x2:.95,y1:-.32,y2:.32},objectHeightM:1,...extra});
const install=(root,product,id='bay-1',extra={})=>{
  const c=cabinetList(root).find(c=>c.id===id),state=kitchenState(root);
  state.cabinets[id]={profile:{confirmed:true,plumbingConfirmed:true,type:product.category==='corner'?'corner':product.category==='pantry'?'tall':product.category==='waste'?'sink':'base'},accessory:newAccessory(product.id),...extra};
  return applyKitchenState(root,state,{strict:true});
};

test('registration preserves every original kitchen mesh, countertop and transform',()=>{
  for(const cls of ['kitchen-base-cabinet','kitchen-island','kitchen-slab','stove','sink']){
    const root=createObject(record({class:cls,rotationY:Math.PI/2,elevation:.2}));
    const originals=root.children.filter(n=>n.name!=='Kitchen accessory installation'),before=originals.map(n=>({n,visible:n.visible,matrix:n.matrix.clone(),material:n.material}));
    const state=kitchenState(root);setKitchenCutaway(root,true);setKitchenCutaway(root,false);applyKitchenState(root,state);
    for(const b of before){assert.ok(root.children.includes(b.n));assert.equal(b.n.visible,b.visible);assert.equal(b.n.material,b.material);assert.deepEqual(b.n.matrix.elements,b.matrix.elements);}
    assert.equal(root.rotation.y,Math.PI/2);assert.ok(Math.abs(root.position.y-.2)<1e-7);
  }
});

test('every fixed-size configuration installs, has construction detail, and restores original fronts',()=>{
  for(const p of ACCESSORIES){
    const root=createObject(record({objectHeightM:p.category==='pantry'?2.4:1}));
    const before=root.children.filter(n=>n.userData.isFurnitureDoor),state=install(root,p),model=accessoryModel(root,'bay-1');
    assert.ok(model,p.id);assert.equal(before[0].visible,false);assert.equal(before[1].visible,true);
    const names=[];model.traverse(n=>names.push(n.name));assert.ok(names.includes('laminate-front'));assert.ok(names.includes('rounded-wire-frame')||p.category==='waste'||p.category==='cutlery');
    assert.deepEqual(state.cabinets['bay-1'].accessory.scale,[1,1,1]);
    assert.equal(motionProblem(root,'bay-1',1),null,p.id);
    operateAccessory(root,'bay-1',.5);for(let i=0;i<12;i++)tickKitchen(root,.1);
    const moving=model.userData.kitchenModel.moving[0];assert.ok(moving.position.z>0);
    applyKitchenState(root,{cabinets:{}});assert.equal(before[0].visible,true);assert.equal(before[1].visible,true);assert.equal(accessoryModel(root,'bay-1'),undefined);
  }
});

test('unknown dimensions, undersized cavities, appliance bays and unmeasured plumbing are rejected',()=>{
  const root=createObject(record()),c=cabinetList(root)[0],p=ACCESSORIES[0];
  assert.equal(compatibility(c,p).ok,false);
  assert.equal(compatibility({...c,confirmed:true,width:.1},p).ok,false);
  assert.equal(compatibility({...c,confirmed:true,type:'appliance'},p).ok,false);
  assert.equal(compatibility({...c,confirmed:true,type:'sink'},p).ok,false);
  assert.equal(compatibility({...c,confirmed:true,type:'base'},ACCESSORIES.find(p=>p.category==='corner')).ok,false);
  assert.equal(compatibility({...c,confirmed:true,obstructions:[{x:0,y:.3,z:0,w:.2,h:.5,d:.6}]},p).ok,false);
  assert.throws(()=>applyKitchenState(root,{cabinets:{'bay-1':{profile:{confirmed:true,width:5},accessory:newAccessory(p.id)}}},{strict:true}),/Confirm/);
  assert.equal(accessoryModel(root,'bay-1'),undefined);
});

test('whole-kitchen finish changes propagate only to inherited fronts and never metal',()=>{
  const root=createObject(record());install(root,ACCESSORIES[0]);install(root,ACCESSORIES[0],'bay-2');
  let state=kitchenState(root);state.cabinets['bay-2'].accessory.laminateMode='OVERRIDE';state.cabinets['bay-2'].accessory.laminate={laminateId:'gl-5106-brl'};
  for(const c of Object.values(state.cabinets))c.finish={laminateId:'gl-175-arn'};applyKitchenState(root,state);
  assert.equal(accessoryModel(root,'bay-1').getObjectByName('laminate-front').material.userData.laminateId,'gl-175-arn');
  assert.equal(accessoryModel(root,'bay-2').getObjectByName('laminate-front').material.userData.laminateId,'gl-5106-brl');
  const model=accessoryModel(root,'bay-1');assert.equal(model.getObjectByName('fixed-runner').material.userData.laminateId,undefined);
  state=kitchenState(root);state.cabinets['bay-1'].finish={laminateId:'gl-5675-sgl'};applyKitchenState(root,state);
  assert.equal(accessoryModel(root,'bay-1').getObjectByName('laminate-front').material.userData.laminateId,'gl-5675-sgl');
  state=kitchenState(root);state.cabinets['bay-2'].accessory.laminateMode='INHERIT';applyKitchenState(root,state);
  assert.equal(accessoryModel(root,'bay-2').getObjectByName('laminate-front').material.userData.laminateId,'gl-175-arn');
});

test('collision checks respect rotated parent coordinates and reject a blocked swept path',()=>{
  const root=createObject(record({rotationY:Math.PI/2}));install(root,ACCESSORIES[0]);
  const blocker=new THREE.Mesh(new THREE.BoxGeometry(.08,1,1),new THREE.MeshBasicMaterial());blocker.position.set(.65,.5,.45);blocker.userData.objectType='oven';blocker.updateMatrixWorld();
  assert.match(motionProblem(root,'bay-1',1,{obstacles:[blocker]}),/oven/);
  assert.throws(()=>operateAccessory(root,'bay-1',1,{obstacles:[blocker]}),/oven/);
  assert.equal(kitchenState(root).cabinets['bay-1'].accessory.openingState,0);
  blocker.position.x=4;blocker.updateMatrixWorld();assert.equal(motionProblem(root,'bay-1',1,{obstacles:[blocker]}),null);
});

test('slab fronts clear a flush side wall without an artificial collision margin',()=>{
  const root=createObject(record({class:'kitchen-slab',bbox:{x1:-.9,x2:.9,y1:-.3,y2:.3}}));install(root,ACCESSORIES[0]);
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.15,3,2),new THREE.MeshBasicMaterial());wall.position.set(-.975,1.5,0);
  assert.equal(motionProblem(root,'bay-1',1,{obstacles:[wall]}),null);
  wall.position.x+=.01;
  assert.match(motionProblem(root,'bay-1',0,{obstacles:[wall]}),/blocked/);
});

test('rotated slabs clear their own carcass when closed and throughout opening',()=>{
  for(const rotationY of [.01,.35,1.12,-.6]){
    const root=createObject(record({class:'kitchen-slab',rotationY,elevation:.15}));
    root.scale.set(1.1,.95,1.05);root.position.x=3;root.position.z=-2;
    install(root,ACCESSORIES[0]);
    const model=accessoryModel(root,'bay-1'),pose=model.userData.kitchenModel.moving[0].position.clone();
    assert.equal(motionProblem(root,'bay-1',0),null,`closed ${rotationY}`);
    assert.equal(motionProblem(root,'bay-1',1),null,`open ${rotationY}`);
    assert.deepEqual(model.userData.kitchenModel.moving[0].position,pose,'checks preserve pose');
    operateAccessory(root,'bay-1',1);for(let i=0;i<10;i++)tickKitchen(root,.1);
    assert.equal(motionProblem(root,'bay-1',0),null,`closing ${rotationY}`);
  }
});

test('all accessory variants clear rotated cabinet panels and adjacent doors',()=>{
  for(const p of ACCESSORIES){
    const root=createObject(record({rotationY:.37,objectHeightM:p.category==='pantry'?2.4:1}));install(root,p);
    assert.equal(motionProblem(root,'bay-1',0),null,`${p.id} closed`);
    assert.equal(motionProblem(root,'bay-1',1),null,`${p.id} opening`);
  }
});

test('real carcass intersections remain blocked, including in cutaway view',()=>{
  for(const cutaway of [false,true]){
    const root=createObject(record({class:'kitchen-slab',rotationY:.37}));install(root,ACCESSORIES[0]);
    setKitchenCutaway(root,cutaway);
    const model=accessoryModel(root,'bay-1'),side=root.getObjectByName('carcass-side');
    side.position.x=model.position.x;
    assert.match(motionProblem(root,'bay-1',0),/carcass-side/);
    assert.throws(()=>operateAccessory(root,'bay-1',1),/carcass-side/);
    assert.equal(kitchenState(root).cabinets['bay-1'].accessory.openingState,0);
  }
});

test('wall skirting is checked at floor level and hidden obstacle meshes are ignored',()=>{
  const root=createObject(record());install(root,ACCESSORIES[0]);
  const wall=createWall({start:{x:-1.025,y:-1},end:{x:-1.025,y:1},height:3});
  assert.equal(motionProblem(root,'bay-1',1,{obstacles:[wall]}),null,'front clears low skirting');
  const slab=createObject(record({class:'kitchen-slab'}));install(slab,ACCESSORIES[0]);
  assert.match(motionProblem(slab,'bay-1',0,{obstacles:[wall]}),/wall skirting/);
  const hidden=new THREE.Mesh(new THREE.BoxGeometry(4,4,4),new THREE.MeshBasicMaterial()),group=new THREE.Group();group.add(hidden);hidden.visible=false;
  assert.equal(motionProblem(root,'bay-1',1,{obstacles:[group]}),null);
  hidden.visible=true;assert.match(motionProblem(root,'bay-1',0,{obstacles:[group]}),/blocked/);
});

test('nearby door click targets do not block hardware, but physical and mirrored doors do',()=>{
  for(const swingDir of ['left-inside','right-inside']){
    const root=createObject(record({class:'kitchen-slab',bbox:{x1:-.9,x2:.9,y1:-.3,y2:.3}}));install(root,ACCESSORIES[0]);
    const door=createObject({class:'door',swingDir,bbox:{x1:.97,x2:1.03,y1:-.3,y2:.7}});
    let proxy;door.traverse(n=>{if(n.userData.isInteractionProxy)proxy=n;});
    assert.ok(proxy);assert.equal(proxy.visible,true,'click target remains active');
    assert.equal(motionProblem(root,'bay-1',0,{obstacles:[door]}),null,swingDir);
    assert.equal(motionProblem(root,'bay-1',1,{obstacles:[door]}),null,swingDir);
    // The tagged mesh remains ray-pickable despite being excluded from clearance.
    door.updateWorldMatrix(true,true);
    const ray=new THREE.Raycaster(new THREE.Vector3(2,.5,.1),new THREE.Vector3(-1,0,0));
    assert.ok(ray.intersectObject(proxy).length);
    // Move the actual leaf across the cabinet front, beyond mere click padding.
    door.position.x-=.12;
    assert.match(motionProblem(root,'bay-1',0,{obstacles:[door]}),/door panel/);
    assert.throws(()=>operateAccessory(root,'bay-1',1,{obstacles:[door]}),/door panel/);
    assert.equal(kitchenState(root).cabinets['bay-1'].accessory.openingState,0);
  }
});

test('corner uses distinct extraction, swing and rear-slide stages, mirrored by hand',()=>{
  assert.ok(Math.abs(cornerPose(.2).angle)<1e-10);assert.equal(cornerPose(.2).rearX,0);
  assert.notEqual(cornerPose(.6).angle,0);assert.equal(cornerPose(.6).rearX,0);
  assert.notEqual(cornerPose(1).rearX,0);assert.equal(cornerPose(1,'left').frontX,-cornerPose(1,'right').frontX);
  const p=ACCESSORIES.find(p=>p.category==='corner'),model=createAccessoryModel(p);
  setAccessoryPose(model,1);assert.notEqual(model.userData.kitchenModel.moving[0].position.z,model.userData.kitchenModel.moving[1].position.z);disposeAssembly(model);
});

test('wicker drawers operate independently and all data survives project parsing / reloading',()=>{
  const input=record(),root=createObject(input),p=ACCESSORIES.find(p=>p.category==='wicker');install(root,p);
  operateAccessory(root,'bay-1',1,{tier:1});for(let i=0;i<10;i++)tickKitchen(root,.1);
  const [a,b]=accessoryModel(root,'bay-1').userData.kitchenModel.moving;assert.equal(a.position.z,0);assert.equal(b.position.z,p.travel);
  input.kitchen=kitchenState(root);const storage=new Map();assert.equal(persistLayout({units:'m',walls:[],rooms:[],objects:[input]},{setItem:(k,v)=>storage.set(k,v)}),true);
  const loaded=createObject(parseLayout(JSON.parse(storage.get('preciseFloorplan'))).objects[0]);
  assert.deepEqual(kitchenState(loaded),input.kitchen);const [la,lb]=accessoryModel(loaded,'bay-1').userData.kitchenModel.moving;assert.equal(la.position.z,0);assert.equal(lb.position.z,p.travel);
});

test('wicker front and handle hits toggle only their drawer, including rapid clicks during animation',()=>{
  for(const product of ACCESSORIES.filter(p=>p.category==='wicker')){
    const root=createObject(record());install(root,product);
    const model=accessoryModel(root,'bay-1'),moving=model.userData.kitchenModel.moving;
    const click=node=>{const action=accessoryOperationFromHit(root,node);assert.ok(action);operateAccessory(root,action.id,action.value,{tier:action.tier});};
    const handle=i=>moving[i].getObjectByName('accessory-handle');
    assert.deepEqual(accessoryOperationFromHit(root,handle(0)),{id:'bay-1',tier:0,value:1});
    click(handle(0));tickKitchen(root,.1);
    assert.ok(moving[0].position.z>0);assert.equal(moving[1].position.z,0);
    click(moving[1].getObjectByName('laminate-front'));
    for(let i=0;i<10;i++)tickKitchen(root,.1);
    assert.equal(moving[0].position.z,product.travel,'first drawer completes while second animates');
    assert.equal(moving[1].position.z,product.travel);
    if(moving[2])assert.equal(moving[2].position.z,0);
    click(handle(0));for(let i=0;i<10;i++)tickKitchen(root,.1);
    assert.equal(moving[0].position.z,0);assert.equal(moving[1].position.z,product.travel);
    assert.equal(accessoryOperationFromHit(root,model.getObjectByName('fixed-runner')),null);
    const state=kitchenState(root),loaded=createObject({...record(),kitchen:state});
    const loadedMoving=accessoryModel(loaded,'bay-1').userData.kitchenModel.moving;
    assert.equal(loadedMoving[0].position.z,0);assert.equal(loadedMoving[1].position.z,product.travel);
    assert.equal(accessoryOperationFromHit(loaded,loadedMoving[0].getObjectByName('accessory-handle')).value,1);
  }
});

test('bottle tiers still move together as one linked pull-out',()=>{
  const root=createObject(record());install(root,ACCESSORIES[0]);
  assert.deepEqual(accessoryOperationFromHit(root,accessoryModel(root,'bay-1').getObjectByName('accessory-handle')),{id:'bay-1',tier:null,value:1});
});

test('resizing cannot scale manufactured hardware, and invalid installed data falls back visibly',()=>{
  const root=createObject(record());install(root,ACCESSORIES[0]);root.scale.x*=.95;tickKitchen(root,.01);
  const model=accessoryModel(root,'bay-1');assert.ok(model);model.updateWorldMatrix(true,true);const scale=model.getWorldScale(new THREE.Vector3());assert.ok(Math.abs(scale.x-1)<1e-8);
  root.scale.x*=.1;tickKitchen(root,.01);assert.equal(accessoryModel(root,'bay-1'),undefined);
});

test('both corner handings clear panels and reverse without jumping midway',()=>{
  const p=ACCESSORIES.find(p=>p.category==='corner');
  for(const hand of ['left','right']){
    const root=createObject(record());install(root,p,'bay-1',{profile:{confirmed:true,type:'corner',hand},accessory:newAccessory(p.id)});
    assert.equal(motionProblem(root,'bay-1',1),null,hand);
    operateAccessory(root,'bay-1',1);tickKitchen(root,.1);tickKitchen(root,.1);
    const model=accessoryModel(root,'bay-1'),progress=model.userData.openProgress;assert.ok(progress>0&&progress<.5);
    operateAccessory(root,'bay-1',0);tickKitchen(root,.01);assert.ok(model.userData.openProgress<=progress);assert.ok(progress-model.userData.openProgress<.02);
  }
});

test('bad imported obstruction data retains the original cabinet instead of breaking the scene',()=>{
  const root=createObject(record({kitchen:{cabinets:{'bay-1':{profile:{confirmed:true,obstructions:[{w:-1}]},accessory:newAccessory(ACCESSORIES[0].id)}}}}));
  assert.equal(accessoryModel(root,'bay-1'),undefined);assert.ok(root.children.find(n=>n.userData.isFurnitureDoor).visible);
});

test('actual sink keeps its bowl, uses entered pipe exclusions and restores the original handle',()=>{
  const root=createObject(record({class:'sink',bbox:{x1:-.4,x2:.4,y1:-.35,y2:.35}}));
  let bowl,handle;root.traverse(n=>{if(n.userData.fixturePart==='basin')bowl=n;if(n.userData.fixturePart==='handle')handle=n;});
  const p=ACCESSORIES.find(p=>p.category==='waste'),before=bowl.matrix.clone();
  install(root,p);assert.equal(handle.visible,false);assert.equal(bowl.visible,true);assert.deepEqual(bowl.matrix.elements,before.elements);assert.equal(motionProblem(root,'bay-1',1),null);
  const state=kitchenState(root);state.cabinets['bay-1'].profile.obstructions=[{label:'Drain trap',x:0,y:.2,z:0,w:.2,h:.4,d:.3}];
  assert.throws(()=>applyKitchenState(root,state,{strict:true}),/Drain trap/);
  applyKitchenState(root,{cabinets:{}});assert.equal(handle.visible,true);
});
