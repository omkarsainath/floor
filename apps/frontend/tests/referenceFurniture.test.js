import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {REFERENCE_FURNITURE, DINING_CATALOG, CENTER_A_CATALOG, CENTER_D_CATALOG, DESK_CATALOG, OFFICE_CHAIR_CATALOG} from '../src/generators/referenceFurnitureCatalog.js';
import {createReferenceFurniture} from '../src/generators/referenceFurniture.js';
import {createObject} from '../src/generators/object.js';
import {queueObjectAnimations, advanceObjectAnimations} from '../src/generators/objectAnimations.js';
import {parseLayout} from '../src/loaders/jsonLoader.js';
import {CATEGORIES} from '../src/ui/catalogPanel.js';

test('all requested reference codes are registered without architectural-opening aliases',()=>{
  assert.deepEqual([DINING_CATALOG.length,CENTER_D_CATALOG.length,CENTER_A_CATALOG.length,DESK_CATALOG.length,OFFICE_CHAIR_CATALOG.length],[25,21,68,14,4]);
  assert.equal(new Set(REFERENCE_FURNITURE.map(s=>s.id)).size,132);
  for(const spec of REFERENCE_FURNITURE){
    assert.ok(!/door|window|glass/.test(spec.id),'IDs cannot trigger architectural opening handling');
    assert.equal(CATEGORIES.flatMap(c=>c.items).filter(i=>i.id===spec.id).length,1);
  }
});
const value=n=>n.userData._animProp==='px'?n.position.x:n.userData._animProp==='pz'?n.position.z:n.rotation.y;
for(const spec of REFERENCE_FURNITURE){
  test(`${spec.id}: finite geometry, fitted footprint, round-trip and independent motion`,()=>{
    const data={id:'saved-item',class:spec.id,source:'catalog',rotationY:.31,elevation:.12,bbox:{x1:1,y1:2,x2:1+spec.w,y2:2+spec.d}};
    const stored=parseLayout(JSON.parse(JSON.stringify({units:'m',walls:[],rooms:[],objects:[data]})));
    const placed=createObject(stored.objects[0]);
    assert.equal(placed.userData.referenceId,spec.id);
    assert.equal(placed.userData.layoutId,'saved-item');assert.equal(placed.rotation.y,.31);assert.equal(placed.position.y,.12);
    assert.equal(placed.userData._isWinDoor,undefined);
    const root=createReferenceFurniture(spec.id,spec.w,spec.d);
    const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x-spec.w)<1e-6,`width ${size.x}`);
    assert.ok(Math.abs(size.z-spec.d)<1e-6,`depth ${size.z}`);
    assert.ok(Math.abs(bounds.min.y)<1e-6);assert.ok(size.y>.2&&size.y<1.6);
    let meshes=0;const moving=[];
    root.traverse(n=>{
      if(n.isMesh){meshes++;assert.ok(n.geometry.attributes.position.array.every(Number.isFinite));}
      if(n.userData.furniturePart)moving.push(n);
    });
    assert.ok(meshes>=2,'includes a constructed body/base and surface');
    for(const node of moving){
      const queue=[],original=value(node),scale=root.scale.clone();
      assert.equal(original,node.userData._closedState,'animation begins at the fitted closed pose');
      queueObjectAnimations(node,queue);advanceObjectAnimations(queue,1);
      assert.ok(Math.abs(value(node)-node.userData._openState)<1e-8);
      assert.ok(moving.filter(n=>n!==node).every(n=>!n.userData._animOpen));
      queueObjectAnimations(node,queue);advanceObjectAnimations(queue,1);
      assert.ok(Math.abs(value(node)-original)<1e-8);assert.deepEqual(root.scale,scale);
    }
  });
}
test('dining sets have the intended seating capacity including the six-seat bench set',()=>{
  for(const spec of DINING_CATALOG){
    const root=createReferenceFurniture(spec.id,spec.w,spec.d);let seats=0;
    root.traverse(n=>{if(n.name==='dining-chair')seats++;if(n.name==='dining-bench')seats+=2;});
    assert.equal(seats,spec.seats,spec.label);
  }
});
test('storage opens a hollow drawer, while selecting drawers leaves hinged fronts untouched',()=>{
  const root=createReferenceFurniture('desk-md-181',1.65,1.5),queue=[];const drawers=[],doors=[];
  root.traverse(n=>{if(n.userData.furniturePart==='drawers')drawers.push(n);if(n.userData.furniturePart==='doors')doors.push(n);});
  assert.ok(drawers.length>=3&&doors.length>=2);
  for(const drawer of drawers)for(const part of ['drawer-front','drawer-bottom','drawer-side','drawer-back'])assert.ok(drawer.getObjectByName(part));
  queueObjectAnimations(root,queue,'drawers');advanceObjectAnimations(queue,1);
  assert.ok(drawers.every(n=>n.userData._animOpen));assert.ok(doors.every(n=>!n.userData._animOpen));
});
test('unrecognized classes remain on the existing generator; invalid dimensions are rejected',()=>{
  assert.equal(createReferenceFurniture('bed',1,2),null);
  for(const v of [0,-1,NaN,Infinity])assert.throws(()=>createReferenceFurniture('center-d-01',v,1),RangeError);
});
