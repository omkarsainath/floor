import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DESIGNER_DOOR_CATALOG,createDesignerDoor} from '../src/generators/designerDoors.js';
import {createObject,getWindowSillAndTop} from '../src/generators/object.js';
import {queueObjectAnimations,advanceObjectAnimations} from '../src/generators/objectAnimations.js';
import {CATEGORIES} from '../src/ui/catalogPanel.js';
import {parseLayout} from '../src/loaders/jsonLoader.js';

for(const spec of DESIGNER_DOOR_CATALOG)test(`${spec.id}: leaf geometry, fixed frame and reversible swing`,()=>{
 const root=createDesignerDoor(spec.id,spec.w,spec.h),bounds=new THREE.Box3().setFromObject(root),queue=[];
 assert.ok(Math.abs(bounds.min.y)<1e-6);assert.ok(Math.abs(bounds.max.y-spec.h)<1e-6);
 assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).x-spec.w)<1e-6);
 const frame=root.getObjectByName('fixed-header'),frameBefore=frame.matrixWorld.clone(),hinges=[];
 root.traverse(n=>{if(n.isMesh)assert.ok(n.geometry.attributes.position.array.every(Number.isFinite));if(n.userData._animType)hinges.push(n);});
 assert.equal(hinges.length,spec.pattern===16&&spec.family==='premium'?2:1);
 queueObjectAnimations(root,queue);advanceObjectAnimations(queue,1);root.updateMatrixWorld(true);
 assert.deepEqual(frame.matrixWorld.elements,frameBefore.elements);
 for(const hinge of hinges)assert.equal(hinge.rotation.y,hinge.userData._openState);
 queueObjectAnimations(root,queue);advanceObjectAnimations(queue,1);
 for(const hinge of hinges)assert.equal(hinge.rotation.y,0);
});

test('all catalog doors reload as full-height openings, including double entrance',()=>{
 assert.equal(CATEGORIES.find(c=>c.id==='designer-doors').items.length,36);
 for(const spec of DESIGNER_DOOR_CATALOG){
  const data={id:'saved-door',class:spec.id,source:'catalog',bbox:{x1:1,y1:-.08,x2:1+spec.w,y2:.08}};
  const layout=parseLayout(JSON.parse(JSON.stringify({units:'m',walls:[],rooms:[],objects:[data]})));
  const root=createObject(layout.objects[0]);
  assert.equal(root.userData.doorVariant,spec.id);assert.equal(root.userData._isWinDoor,true);
  assert.equal(root.userData.layoutId,'saved-door');assert.equal(root.userData.nominalHeight,2.4);
  assert.deepEqual(getWindowSillAndTop(spec.id),{sillBase:0,winTop:2.4});
 }
});

test('wall orientation, custom opening dimensions and hinge settings stay consistent',()=>{
 for(const vertical of [false,true])for(const swingDir of ['left-inside','left-outside','right-inside','right-outside']){
  const walls=[{start:{x:0,y:0},end:vertical?{x:0,y:5}:{x:5,y:0}}];
  const bbox=vertical?{x1:-.08,y1:1,x2:.08,y2:2.2}:{x1:1,y1:-.08,x2:2.2,y2:.08};
  const root=createObject({class:'door-groove-03',bbox,walls,swingDir,height_m:2.1,sill_height_m:.05});
  assert.equal(root.rotation.y,vertical?-Math.PI/2:0);assert.equal(root.position.y,.05);
  assert.equal(root.userData.nominalHeight,2.1);
  const hinge=root.getObjectByName('door-hinge');
  assert.equal(Math.sign(hinge.position.x),swingDir.startsWith('right')?1:-1);
  const queue=[];queueObjectAnimations(root,queue);advanceObjectAnimations(queue,1);
  assert.equal(Math.sign(hinge.rotation.y),(swingDir.startsWith('right')?-1:1)*(swingDir.endsWith('outside')?-1:1));
 }
 assert.equal(createDesignerDoor('door',1,2.4),null);
 for(const bad of [0,-1,NaN,Infinity])assert.throws(()=>createDesignerDoor('door-groove-01',bad),RangeError);
});
