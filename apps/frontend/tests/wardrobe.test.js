import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWardrobe, WARDROBE_TYPES, WARDROBE_CATALOG } from '../src/generators/wardrobe.js';
import { createObject } from '../src/generators/object.js';
import { queueObjectAnimations, advanceObjectAnimations } from '../src/generators/objectAnimations.js';
import { CATEGORIES } from '../src/ui/catalogPanel.js';
import { parseLayout } from '../src/loaders/jsonLoader.js';

const nodes=(root,part)=>{
  const result=[];root.traverse(n=>{if(n.userData.wardrobePart===part)result.push(n);});return result;
};
const value=node=>{
  const prop=node.userData._animProp;
  return prop==='px'?node.position.x:prop==='pz'?node.position.z:node.rotation.y;
};
const finish=queue=>{for(let i=0;i<20;i++)advanceObjectAnimations(queue);assert.equal(queue.length,0);};

for(const type of WARDROBE_TYPES) {
  test(`${type}: hollow geometry, independent fronts and reversible drawers`,()=>{
    const item=WARDROBE_CATALOG.find(item=>item.id===type);
    const root=createWardrobe(type,item.w,item.d), queue=[];
    assert.equal(root.userData.isWardrobe,true);
    const bounds=new THREE.Box3().setFromObject(root);
    assert.ok(Math.abs(bounds.min.y)<1e-6);
    assert.ok(Math.abs(bounds.max.y-(type.includes('loft')?2.7:2.2))<1e-6);
    root.traverse(n=>{if(n.isMesh){
      assert.ok(n.geometry.attributes.position.array.every(Number.isFinite));
      for (const key of ['width','height','depth','radiusTop','radiusBottom']) {
        if (key in n.geometry.parameters) assert.ok(n.geometry.parameters[key]>0,`${n.name}: ${key}`);
      }
    }});
    const doors=nodes(root,'doors'), drawers=nodes(root,'drawers'), loft=nodes(root,'loft');
    assert.equal(doors.length,item.doorCount || (type.includes('sliding')?2:type.includes('loft')?3:5));
    assert.ok(drawers.length>=2);
    if(item.doorCount) assert.equal(drawers.length,item.doorCount*2);
    assert.equal(loft.length,type.includes('loft')?(item.doorCount||4):0);
    assert.ok(root.getObjectByName('hanging-rail'));
    assert.ok(root.getObjectByName('shelf'));
    for(const drawer of drawers) for(const name of ['drawer-front','drawer-handle','drawer-bottom','drawer-back','drawer-side']) {
      assert.ok(drawer.getObjectByName(name),name);
    }
    // The same scheduler used by the viewer supports a clicked leaf alone.
    queueObjectAnimations(doors[0],queue);finish(queue);
    assert.equal(value(doors[0]),doors[0].userData._openState);
    if(doors[1]) assert.equal(value(doors[1]),doors[1].userData._closedState);
    else {queueObjectAnimations(doors[0],queue);finish(queue);}
    queueObjectAnimations(root,queue,'drawers');finish(queue);
    assert.ok(drawers.every(n=>value(n)>.3));
    assert.ok(loft.every(n=>!n.userData._animOpen),'drawer control does not open loft');
    queueObjectAnimations(root,queue,'drawers');finish(queue);
    assert.ok(drawers.every(n=>value(n)===0));
    queueObjectAnimations(root,queue,'doors');finish(queue);
    assert.ok(doors.every(n=>n.userData._animOpen),'mixed fronts open together');
    if(type.includes('sliding')) {
      for(let i=1;i<doors.length;i++) {
        assert.ok(Math.abs(doors[0].position.x-doors[i].position.x)<1e-9,'open panels overlap, not exchange closed positions');
        const rear=new THREE.Box3().setFromObject(doors[i-1]), front=new THREE.Box3().setFromObject(doors[i]);
        assert.ok(rear.max.z<front.min.z,'rear handle clears front sliding leaf');
      }
    }
    queueObjectAnimations(root,queue,'doors');finish(queue);
    assert.ok(doors.every(n=>Math.abs(value(n)-n.userData._closedState)<1e-9));
    if(loft.length){queueObjectAnimations(root,queue,'loft');finish(queue);assert.ok(loft.every(n=>Math.abs(value(n))>1));}
    if(type.includes('sliding')) {
      assert.ok(doors.every(n=>n.userData._animProp==='px'));
      assert.ok(Math.abs(doors[0].position.z-doors[1].position.z)>.022,'separate sliding tracks');
    } else {
      // Open the first leaf: a ray now reaches the inside back, not a solid box.
      const front=doors[0].getObjectByName('door-front');
      const point=front.getWorldPosition(new THREE.Vector3());
      const ray=new THREE.Raycaster(new THREE.Vector3(point.x,1.15,2),new THREE.Vector3(0,0,-1));
      root.updateMatrixWorld(true);
      assert.equal(ray.intersectObject(root,true)[0].object.name,'door-front');
      queueObjectAnimations(doors[0],queue);finish(queue);root.updateMatrixWorld(true);
      assert.equal(ray.intersectObject(root,true)[0].object.name,'back');
    }
  });
}

test('wardrobe catalog choices survive layout reload with placement and rotation',()=>{
  const items=CATEGORIES.find(c=>c.id==='wardrobes').items;
  assert.deepEqual(items.map(i=>i.id),WARDROBE_TYPES);
  for(const item of items){
    const data={id:'stored',class:item.id,source:'catalog',rotationY:.7,elevation:.1,
      bbox:{x1:1,y1:2,x2:1+item.w,y2:2+item.d}};
    const layout=parseLayout(JSON.parse(JSON.stringify({units:'m',walls:[],rooms:[],objects:[data]})));
    const root=createObject(layout.objects[0]);
    assert.equal(root.userData.wardrobeVariant,item.id);
    assert.equal(root.rotation.y,.7);assert.equal(root.position.y,.1);
    assert.equal(root.userData.layoutId,'stored');
    assert.equal(root.userData._isWinDoor,undefined,'wardrobes are not architectural openings');
  }
});

test('rapid toggles reverse from the current pose and retain only one animation per part',()=>{
  const root=createWardrobe('wardrobe',2.6,.6), queue=[], leaf=nodes(root,'doors')[0];
  queueObjectAnimations(leaf,queue);advanceObjectAnimations(queue,.3);
  const halfway=value(leaf);
  queueObjectAnimations(leaf,queue);
  assert.equal(queue.length,1);assert.equal(queue[0].from,halfway);
  finish(queue);assert.equal(value(leaf),0);
});

test('all three sliding leaves move independently, including the stacking-side leaf',()=>{
  const root=createWardrobe('wardrobe-sliding-3',2.1,.65),queue=[];
  for(const leaf of nodes(root,'doors')) {
    const closed=leaf.position.x;
    queueObjectAnimations(leaf,queue);finish(queue);
    assert.ok(Math.abs(leaf.position.x-closed)>.4);
    queueObjectAnimations(leaf,queue);finish(queue);
    assert.ok(Math.abs(leaf.position.x-closed)<1e-9);
  }
});

test('counted wardrobes keep closed doors clear of pulled-out drawers',()=>{
  for(const item of WARDROBE_CATALOG.filter(item=>item.doorCount)) {
    const root=createWardrobe(item.id,item.w,item.d),queue=[];
    queueObjectAnimations(root,queue,'drawers');finish(queue);
    const fronts=nodes(root,'doors').map(n=>new THREE.Box3().setFromObject(n));
    for(const drawer of nodes(root,'drawers')) {
      const tray=new THREE.Box3().setFromObject(drawer);
      assert.ok(fronts.every(front=>tray.max.y<front.min.y),item.id);
    }
  }
  assert.equal(createWardrobe('wardrobe-sliding-1',.6,.6),null,'no in-place single-panel sliding cabinet');
});

test('existing sliding and casement windows still use their original animation metadata',()=>{
  for(const type of ['sliding-window','casement-window']) {
    const root=createObject({class:type,bbox:{x1:0,y1:0,x2:1.2,y2:.15}}), queue=[];
    assert.equal(queueObjectAnimations(root,queue),true);finish(queue);
    root.traverse(n=>{if(n.userData._animType) assert.equal(n.userData._animOpen,true);});
    queueObjectAnimations(root,queue);finish(queue);
    root.traverse(n=>{if(n.userData._animType) assert.equal(n.userData._animOpen,false);});
  }
});
