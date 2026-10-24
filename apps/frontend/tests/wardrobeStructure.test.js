import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWardrobe, WARDROBE_CATALOG, LOFT_CATALOG } from '../src/generators/wardrobe.js';
import { createObject } from '../src/generators/object.js';
import { wardrobeConfigFromRoot, normalizeWardrobeConfig, resizeWardrobeWidth, resizeWardrobeSection, wardrobeWallPlacement } from '../src/generators/wardrobeConfig.js';
import { applyWardrobeStructure } from '../src/design/wardrobeEditing.js';
import { wardrobeSurfaceMeshes, wardrobeSurfaceFromHit, updateWardrobeFinishes } from '../src/generators/wardrobeFinishes.js';
import { queueObjectAnimations, advanceObjectAnimations } from '../src/generators/objectAnimations.js';
import { parseLayout } from '../src/loaders/jsonLoader.js';
import { persistLayout } from '../src/state/projectPersistence.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const mesh=(root,id)=>wardrobeSurfaceMeshes(root,id)[0];
const fixture=()=>{
  const record={id:'wardrobe-test',class:'wardrobe-3-loft',source:'catalog',bbox:{x1:1,y1:1,x2:2.8,y2:1.6},rotationY:.4,elevation:.15,
    wardrobeFinishes:{'door-1':{laminateId:'gl-175-arn'},'drawer-1':{laminateId:'gl-5649-arn'}}};
  return {record,root:createObject(record)};
};

test('all existing wardrobes and standalone lofts can be edited with finite geometry and unique finish targets',()=>{
  for(const item of [...WARDROBE_CATALOG,...LOFT_CATALOG]){
    const original=createWardrobe(item.id,item.w,item.d),config=normalizeWardrobeConfig(wardrobeConfigFromRoot(original));
    const root=createWardrobe(item.id,item.w,item.d,{wardrobeConfig:config});
    assert.equal(root.userData.isWardrobe,true,item.id);
    const bounds=new THREE.Box3().setFromObject(root);close(bounds.min.y,0);close(bounds.max.y,root.userData.nominalHeight);
    const ids=root.userData.wardrobeSurfaces.map(s=>s.id);assert.equal(new Set(ids).size,ids.length,item.id);
    root.traverse(n=>{if(n.isMesh){
      assert.ok(n.geometry.attributes.position.array.every(Number.isFinite));
      assert.ok(n.userData.panelSize?.every(v=>v>0)||n.name==='hanging-rail');
      if(/handle|mirror|rail/.test(n.name))assert.equal(n.userData.wardrobeSurface,undefined);
    }});
  }
});

test('removing drawers extends only that section door; reintroducing drawers restores their finishes',()=>{
  const {root,record}=fixture(),config=wardrobeConfigFromRoot(root);
  const oldHeight=mesh(root,'door-1').userData.panelSize[1],neighbourHeight=mesh(root,'door-2').userData.panelSize[1];
  config.sections[0].front='door';applyWardrobeStructure(root,record,config);
  assert.equal(mesh(root,'drawer-1'),undefined);assert.equal(mesh(root,'drawer-2'),undefined);
  assert.ok(mesh(root,'door-1').userData.panelSize[1]>oldHeight+.45);
  close(mesh(root,'door-2').userData.panelSize[1],neighbourHeight);
  assert.equal(mesh(root,'door-1').material[4].userData.laminateId,'gl-175-arn');
  config.sections[0].front='mixed';applyWardrobeStructure(root,record,config);
  assert.equal(mesh(root,'drawer-1').material[4].userData.laminateId,'gl-5649-arn');
  updateWardrobeFinishes(root,{'door-1':{laminateId:'gl-5649-arn'}});
  assert.equal(mesh(root,'door-1').material[4].userData.laminateId,'gl-5649-arn','rebuild remains connected to laminate editing');
});

test('a door can become a complete stack of independent working drawers',()=>{
  const {root,record}=fixture(),config=wardrobeConfigFromRoot(root);config.sections[0].front='drawers';config.sections[0].drawerCount=5;
  applyWardrobeStructure(root,record,config);
  assert.equal(mesh(root,'door-1'),undefined);assert.ok(mesh(root,'door-2'));
  const nodes=[];root.traverse(n=>{if(n.userData.wardrobeSectionId==='1'&&n.userData.wardrobePart==='drawers')nodes.push(n);});
  assert.equal(nodes.length,5);
  const queue=[];queueObjectAnimations(nodes[0],queue);advanceObjectAnimations(queue,1);
  assert.ok(nodes[0].position.z>.3);assert.equal(nodes[1].position.z,0);
  for(const n of nodes)assert.ok(n.getObjectByName('drawer-bottom'));
});

test('section width and loft dimensions resize independently, with aligned rear faces',()=>{
  const {root,record}=fixture();let config=wardrobeConfigFromRoot(root);
  config=resizeWardrobeSection(config,'2',.9);
  close(config.width,2.1);close(config.sections[0].width,.6);close(config.sections[2].width,.6);
  config.loft={...config.loft,width:2.8,height:.75,depth:.8,alignment:'left'};
  applyWardrobeStructure(root,record,config);
  const body=root.getObjectByName('wardrobe-module'),loft=root.getObjectByName('loft-module');
  close(body.getObjectByName('top').userData.panelSize[0],2.1);
  close(loft.getObjectByName('loft-top').userData.panelSize[0],2.8);
  close(loft.position.y,config.height);
  close(loft.position.z-config.loft.depth/2,-config.depth/2);
  close(loft.position.x-config.loft.width/2,-config.width/2);
  const wider=resizeWardrobeWidth(config,4.2);close(wider.sections[1].width,1.8);close(wider.loft.width,2.8);
});

test('fit and measured mirrors stay on the selected moving door and out of laminate targets',()=>{
  const {root,record}=fixture(),config=wardrobeConfigFromRoot(root);
  config.sections[0].mirror={mode:'fit'};config.sections[1].mirror={mode:'custom',width:.3,height:1};
  applyWardrobeStructure(root,record,config);
  const door=mesh(root,'door-1'),mirror=door.parent.getObjectByName('door-mirror');
  assert.ok(mirror);assert.equal(wardrobeSurfaceFromHit(mirror,root),'door-1');
  close(mirror.userData.panelSize[0],door.userData.panelSize[0]-.04);
  const custom=mesh(root,'door-2').parent.getObjectByName('door-mirror');
  close(custom.userData.panelSize[0],.3);close(custom.userData.panelSize[1],1);
  assert.equal(mesh(root,'door-3').parent.getObjectByName('door-mirror'),undefined);
  assert.equal(mirror.userData.wardrobeSurface,undefined);
  assert.equal(mirror.isReflector,true);
  let targetDisposals=0;mirror.getRenderTarget().addEventListener('dispose',()=>targetDisposals++);
  const queue=[];queueObjectAnimations(door.parent,queue);advanceObjectAnimations(queue,1);
  const before=door.parent.rotation.y;
  config.height=2.5;applyWardrobeStructure(root,record,config,{animations:queue});
  assert.equal(targetDisposals,1,'rebuilding releases the mirror reflection buffer');
  close(mesh(root,'door-1').parent.rotation.y,before);
  const larger=mesh(root,'door-1').parent.getObjectByName('door-mirror');assert.ok(larger.userData.panelSize[1]>mirror.userData.panelSize[1]);
});

test('invalid dimensions or oversized mirrors leave both the scene and saved record intact',()=>{
  const {root,record}=fixture(),before=JSON.stringify(record),door=mesh(root,'door-1');
  for(const change of [c=>c.depth=0,c=>c.sections[0].mirror={mode:'custom',width:2,height:1},c=>c.sections[0].drawerCount=12]){
    const config=wardrobeConfigFromRoot(root);change(config);
    assert.throws(()=>applyWardrobeStructure(root,record,config));
    assert.equal(JSON.stringify(record),before);assert.equal(mesh(root,'door-1'),door);
  }
});

test('handles can be removed independently, restored and saved without changing mirrors or door operation',()=>{
  for(const opening of ['hinged','sliding']){
    const {root,record}=fixture(),config=wardrobeConfigFromRoot(root);
    config.opening=opening;config.sections[0].mirror={mode:'fit'};
    config.sections[0].doorHandle=false;config.sections[0].drawerHandles=false;config.loft.handles=false;
    applyWardrobeStructure(root,record,config);
    const leaf=mesh(root,'door-1').parent;
    assert.equal(leaf.getObjectByName('door-handle'),undefined);
    assert.ok(leaf.getObjectByName('door-mirror'));
    assert.ok(mesh(root,'door-2').parent.getObjectByName('door-handle'));
    assert.equal(mesh(root,'drawer-1').parent.getObjectByName('drawer-handle'),undefined);
    assert.ok(mesh(root,'drawer-3').parent.getObjectByName('drawer-handle'));
    assert.equal(mesh(root,'loft-1').parent.getObjectByName('door-handle'),undefined);
    const queue=[];queueObjectAnimations(leaf,queue);advanceObjectAnimations(queue,1);
    assert.equal(leaf.userData._animOpen,true);
    close(opening==='hinged'?leaf.rotation.y:leaf.position.x,leaf.userData._openState);
    let saved;persistLayout({units:'m',rooms:[],walls:[],objects:[record]},{setItem:(key,value)=>{if(key==='preciseFloorplan')saved=value;}});
    const restored=createObject(parseLayout(JSON.parse(saved)).objects[0]);
    assert.equal(mesh(restored,'door-1').parent.getObjectByName('door-handle'),undefined);
    assert.equal(mesh(restored,'drawer-1').parent.getObjectByName('drawer-handle'),undefined);
    assert.equal(mesh(restored,'loft-1').parent.getObjectByName('door-handle'),undefined);
    config.sections[0].doorHandle=true;config.sections[0].drawerHandles=true;config.loft.handles=true;
    applyWardrobeStructure(root,record,config);
    assert.ok(mesh(root,'door-1').parent.getObjectByName('door-handle'));
    assert.ok(mesh(root,'drawer-1').parent.getObjectByName('drawer-handle'));
    assert.ok(mesh(root,'loft-1').parent.getObjectByName('door-handle'));
  }
  const original=createWardrobe('loft-teal-oak-1',.6,.6),config=wardrobeConfigFromRoot(original);
  delete config.sections[0].doorHandle;
  assert.ok(createWardrobe('loft-teal-oak-1',.6,.6,{wardrobeConfig:config}).getObjectByName('door-handle'),'old layouts keep handles');
  config.sections[0].doorHandle=false;
  assert.equal(createWardrobe('loft-teal-oak-1',.6,.6,{wardrobeConfig:config}).getObjectByName('door-handle'),undefined);
});

test('wall attachment holds the rear at the chosen wall face after depth changes on either side',()=>{
  const {root,record}=fixture();
  for(const [start,end] of [[{x:0,y:0},{x:6,y:0}],[{x:0,y:0},{x:0,y:6}],[{x:0,y:0},{x:6,y:6}]]){
    const wall={id:'chosen',start,end,thickness:.2};
    for(const side of [-1,1])for(const depth of [.45,.8]){
      const config=wardrobeConfigFromRoot(root);config.depth=depth;config.attachment={wallId:'chosen',side};
      applyWardrobeStructure(root,record,config,{walls:[wall]});
      const back=new THREE.Vector3(0,0,-depth/2).applyMatrix4(root.matrixWorld);
      const dx=end.x-start.x,dz=end.y-start.y,length=Math.hypot(dx,dz);
      close(((-dz*(back.x-start.x)+dx*(back.z-start.y))/length)*side,.1);
      close(record.rotationY,root.rotation.y);
    }
  }
  const config=wardrobeConfigFromRoot(root);assert.throws(()=>wardrobeWallPlacement(config,root.position,[]),/unavailable/);
});

test('structure, mirror sizes, dimensions, elevation, finishes and attachment survive persistence and reconstruction',()=>{
  const {root,record}=fixture(),config=wardrobeConfigFromRoot(root);
  config.sections[1].mirror={mode:'custom',width:.3,height:1};config.sections[2].front='drawers';config.sections[2].drawerCount=4;
  config.depth=.7;config.loft.width=2.4;config.attachment={wallId:'wall',side:1};
  const walls=[{id:'wall',start:{x:0,y:0},end:{x:6,y:0},thickness:.2}];
  applyWardrobeStructure(root,record,config,{walls,elevation:.3});
  let saved;persistLayout({units:'m',rooms:[],walls,objects:[record]},{setItem:(key,value)=>{if(key==='preciseFloorplan')saved=value;}});
  const restoredRecord=parseLayout(JSON.parse(saved)).objects[0],restored=createObject(restoredRecord);
  assert.deepEqual(restored.userData.wardrobeConfig,root.userData.wardrobeConfig);
  assert.equal(restored.position.y,.3);close(restored.position.z,root.position.z);
  assert.equal(mesh(restored,'door-1').material[4].userData.laminateId,'gl-175-arn');
  assert.equal(mesh(restored,'door-2').parent.getObjectByName('door-mirror').userData.panelSize[0],.3);
  assert.equal(mesh(restored,'door-3'),undefined);
});

test('rebuilding retains the selectable root and disposes old resources once without affecting another wardrobe',()=>{
  const {root,record}=fixture(),other=fixture().root;root.userData.isSelectable=true;
  const face=mesh(root,'door-1').material[4],otherFace=mesh(other,'door-1').material[4];let disposed=0;
  face.addEventListener('dispose',()=>disposed++);
  const queue=[];queueObjectAnimations(mesh(root,'door-1').parent,queue);advanceObjectAnimations(queue,.3);
  const config=wardrobeConfigFromRoot(root);config.loft.width=2.2;
  assert.equal(applyWardrobeStructure(root,record,config,{animations:queue}),root);
  assert.equal(root.userData.isSelectable,true);assert.equal(disposed,1);assert.equal(queue.length,0);
  assert.equal(mesh(other,'door-1').material[4],otherFace);
});

test('handle dimensions change geometry and survive reconstruction',()=>{
 const {root,record}=fixture(),config=wardrobeConfigFromRoot(root);
 Object.assign(config.sections[0],{doorHandleLength:.3,doorHandleThickness:.025,doorHandleDepth:.05,drawerHandleLength:.2,drawerHandleThickness:.02,drawerHandleDepth:.04});
 Object.assign(config.loft,{handleLength:.12,handleThickness:.02,handleDepth:.04});
 applyWardrobeStructure(root,record,config);
 const restored=createObject(parseLayout({units:'m',walls:[],rooms:[],objects:[JSON.parse(JSON.stringify(record))]}).objects[0]);
 for(const target of [root,restored]){
  const door=mesh(target,'door-1').parent.getObjectByName('door-handle');
  door.geometry.computeBoundingBox();const size=door.geometry.boundingBox.getSize(new THREE.Vector3());
  close(size.x,.025);close(size.y,.3);close(size.z,.05);
  const drawer=mesh(target,'drawer-1').parent.getObjectByName('drawer-handle');drawer.geometry.computeBoundingBox();close(drawer.geometry.boundingBox.getSize(new THREE.Vector3()).x,.2);
  const loft=mesh(target,'loft-1').parent.getObjectByName('door-handle');loft.geometry.computeBoundingBox();close(loft.geometry.boundingBox.getSize(new THREE.Vector3()).y,.12);
 }
 config.sections[0].doorHandleLength=-1;assert.throws(()=>normalizeWardrobeConfig(config),/Handle length/);
});

test('cabinet caps do not overlap side or back panels after finish edits',()=>{
 for(const configured of [false,true]){
  const {root,record}=fixture();
  if(configured)applyWardrobeStructure(root,record,wardrobeConfigFromRoot(root));
  root.updateMatrixWorld(true);
  const top=mesh(root,'top');
  // Compare in root-local space so a rotated cabinet does not inflate AABBs.
  const local=n=>{n.geometry.computeBoundingBox();const matrix=new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(n.matrixWorld);return n.geometry.boundingBox.clone().applyMatrix4(matrix);};
  for(const id of ['side-left','side-right','back']){
   const a=local(top),b=local(mesh(root,id));
   assert.ok(b.max.y<=a.min.y+1e-6,`${configured?'edited':'original'} ${id} overlaps top`);
  }
 }
});

test('handles move vertically, persist and stay within the front panel',()=>{
 const {root,record}=fixture(),config=wardrobeConfigFromRoot(root);
 Object.assign(config.sections[0],{doorHandleLength:.3,doorHandleOffsetY:.12,drawerHandleOffsetY:-.03});
 config.loft.handleOffsetY=-.04;
 applyWardrobeStructure(root,record,config);
 const restored=createObject(parseLayout({units:'m',walls:[],rooms:[],objects:[JSON.parse(JSON.stringify(record))]}).objects[0]);
 for(const target of [root,restored]){
  close(mesh(target,'door-1').parent.getObjectByName('door-handle').position.y,.12);
  const drawer=mesh(target,'drawer-1');close(drawer.parent.getObjectByName('drawer-handle').position.y-drawer.position.y,-.03);
  close(mesh(target,'loft-1').parent.getObjectByName('door-handle').position.y,-.04);
 }
 for(const offset of [-4,4]){
  config.sections[0].doorHandleOffsetY=offset;applyWardrobeStructure(root,record,config);
  const panel=mesh(root,'door-1'),handle=panel.parent.getObjectByName('door-handle');
  assert.ok(Math.abs(handle.position.y)+handle.userData.panelSize[1]/2<=panel.userData.panelSize[1]/2-.0199);
 }
 config.sections[0].doorHandleOffsetY=0;applyWardrobeStructure(root,record,config);
 close(mesh(root,'door-1').parent.getObjectByName('door-handle').position.y,0);
});
