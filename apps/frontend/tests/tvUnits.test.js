import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TV_UNIT_CATALOG,createTvUnit} from '../src/generators/tvUnits.js';
import {createObject} from '../src/generators/object.js';
import {CATEGORIES} from '../src/ui/catalogPanel.js';
import {parseLayout} from '../src/loaders/jsonLoader.js';
import {queueObjectAnimations,advanceObjectAnimations} from '../src/generators/objectAnimations.js';

for(const spec of TV_UNIT_CATALOG){
  test(`${spec.id}: finite geometry, scaled footprint and independent reversible storage`,()=>{
    const root=createTvUnit(spec.id,spec.w*1.2,spec.d*.9);
    const bounds=new THREE.Box3().setFromObject(root);
    assert.ok(Math.abs(bounds.min.y)<1e-6);
    assert.ok(Math.abs(bounds.max.y-spec.h)<1e-6);
    assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).x-spec.w*1.2)<1e-6);
    assert.ok(root.getObjectByName('tv-screen'));
    const nodes=[];
    root.traverse(n=>{
      if(n.isMesh)assert.ok(n.geometry.attributes.position.array.every(Number.isFinite),n.name);
      if(n.userData._animType)nodes.push(n);
    });
    assert.ok(nodes.some(n=>n.userData.furniturePart==='drawers'));
    for(const node of nodes){
      const queue=[],data=node.userData;
      const value=()=>data._animProp==='ry'?node.rotation.y:node.position.z;
      queueObjectAnimations(node,queue);advanceObjectAnimations(queue,1);
      assert.equal(value(),data._openState);
      assert.ok(nodes.filter(n=>n!==node).every(n=>!n.userData._animOpen));
      if(data._animProp==='ry'){
        root.updateMatrixWorld(true);
        const handle=node.getObjectByName('door-handle');
        if(handle)assert.ok(handle.getWorldPosition(new THREE.Vector3()).z>spec.d*.9/2,'display door opens outward');
      }
      queueObjectAnimations(node,queue);advanceObjectAnimations(queue,1);
      assert.ok(Math.abs(value()-data._closedState)<1e-9);
    }
  });
}

test('all 16 TV designs survive placement, rotation and layout reload',()=>{
  assert.equal(TV_UNIT_CATALOG.length,16);
  assert.deepEqual(CATEGORIES.find(c=>c.id==='tv-units').items,TV_UNIT_CATALOG);
  for(const spec of TV_UNIT_CATALOG){
    const obj={id:'saved-tv',class:spec.id,source:'catalog',rotationY:.7,elevation:.12,
      bbox:{x1:2,y1:3,x2:2+spec.w,y2:3+spec.d}};
    const layout=parseLayout(JSON.parse(JSON.stringify({units:'m',walls:[],rooms:[],objects:[obj]})));
    const root=createObject(layout.objects[0]);
    assert.equal(root.userData.tvUnitVariant,spec.id);
    assert.equal(root.userData.isInteractiveFurniture,true);
    assert.equal(root.rotation.y,.7);assert.equal(root.position.y,.12);
    assert.equal(root.userData.layoutId,'saved-tv');assert.equal(root.userData._isWinDoor,undefined);
  }
});

test('integrated pooja storage remains interactive within the TV unit',()=>{
  const root=createTvUnit('tv-unit-champagne-pooja',3.6,.48),queue=[];
  const shrine=root.getObjectByName('integrated-pooja');assert.ok(shrine.getObjectByName('ganesha-idol'));
  queueObjectAnimations(root,queue,'drawers');advanceObjectAnimations(queue,1);
  shrine.traverse(n=>{if(n.userData.furniturePart==='drawers')assert.equal(n.userData._animOpen,true);});
});

test('legacy TV builders remain available and invalid sizes fail explicitly',()=>{
  for(const id of ['tv','tv-unit','wall-tv','pooja-unit'])assert.equal(createTvUnit(id,2,.5),null);
  for(const value of [0,-1,NaN,Infinity]){
    assert.throws(()=>createTvUnit(TV_UNIT_CATALOG[0].id,value,.5),RangeError);
    assert.throws(()=>createTvUnit(TV_UNIT_CATALOG[0].id,2,value),RangeError);
  }
});
