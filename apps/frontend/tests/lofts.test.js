import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {LOFT_CATALOG,createWardrobe} from '../src/generators/wardrobe.js';
import {createObject} from '../src/generators/object.js';
import {parseLayout} from '../src/loaders/jsonLoader.js';
for(const spec of LOFT_CATALOG)test(`${spec.id} is a separate hollow cabinet with working loft leaves`,()=>{
 const group=createWardrobe(spec.id,spec.w,spec.d);
 const bounds=new THREE.Box3().setFromObject(group);
 assert.ok(Math.abs(bounds.min.y)<1e-6);assert.ok(Math.abs(bounds.max.y-.6)<1e-6);
 const leaves=[];group.traverse(n=>{if(n.userData.wardrobePart==='loft')leaves.push(n);});
 assert.equal(leaves.length,spec.doorCount);
 for(const leaf of leaves)assert.notEqual(leaf.userData._openState,leaf.userData._closedState);
 assert.equal(group.getObjectByName('hanging-rail'),undefined);
});
test('loft elevation, height and independent identity survive reload',()=>{
 const spec=LOFT_CATALOG[1];
 const objects=[{id:'loft',class:spec.id,source:'catalog',bbox:{x1:0,y1:0,x2:1.2,y2:.6},elevation:2.1,objectHeightM:.7}];
 const layout=parseLayout(JSON.parse(JSON.stringify({units:'m',walls:[],rooms:[],objects})));
 const obj=createObject(layout.objects[0]);const bounds=new THREE.Box3().setFromObject(obj);
 assert.ok(Math.abs(bounds.min.y-2.1)<1e-5);assert.ok(Math.abs(bounds.max.y-2.8)<1e-5);
 assert.equal(obj.userData.layoutId,'loft');
});
