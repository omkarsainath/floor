import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createObject } from '../src/generators/object.js';
import { SOFA_FACTORY_CATALOG } from '../src/generators/sofaFactory.js';
import { queueObjectAnimations, advanceObjectAnimations } from '../src/generators/objectAnimations.js';

const object=(id,expanded=false)=>{const p=SOFA_FACTORY_CATALOG.find(p=>p.id===id);return createObject({class:id,source:'catalog',sofaBedExpanded:expanded,bbox:{x1:0,y1:0,x2:p.w,y2:p.d}});};
test('every sofa bed opens, reverses mid-animation, closes, and restores saved state',()=>{
  for(const p of SOFA_FACTORY_CATALOG.filter(p=>p.category==='sofa-beds'||/cum bed/i.test(p.label))){
    const model=object(p.id),q=[];assert.ok(model.userData.isSofaBed,p.id);
    const closed=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    assert.ok(queueObjectAnimations(model,q,'bed'));advanceObjectAnimations(q,.3);
    assert.ok(model.userData.bedProgress>0&&model.userData.bedProgress<1);
    assert.ok(queueObjectAnimations(model,q,'bed'));advanceObjectAnimations(q,1);
    assert.equal(model.userData.bedProgress,0);
    queueObjectAnimations(model,q,'bed');advanceObjectAnimations(q,1);
    const opened=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    assert.ok(opened.z>closed.z+.3,p.id);
    assert.ok(Math.abs(opened.x-closed.x)<1e-5,p.id);
    assert.ok(Math.abs(new THREE.Box3().setFromObject(model).min.y)<1e-6,p.id);
    assert.equal(object(p.id,true).userData.bedProgress,1);
    queueObjectAnimations(model,q,'bed');advanceObjectAnimations(q,1);
    assert.ok(model.children.filter(n=>n.name.startsWith('sofa-bed-extension')).every(n=>!n.visible));
  }
});
test('ordinary sofas have no bed conversion controls',()=>{
 assert.equal(object('sf-sofas-p11-1').userData.isSofaBed,undefined);
});
