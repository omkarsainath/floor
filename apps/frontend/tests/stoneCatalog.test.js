import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {STONES} from '../src/materials/stone.js';
import {optionsFor,normalizeRoomDesign} from '../src/design/roomDesignCatalog.js';
import {createObject} from '../src/generators/object.js';
import {kitchenState,applyKitchenState,syncKitchenRecord} from '../src/kitchen/system.js';
test('catalogue stones have named local images and persist as flooring in every room type',()=>{
  assert.equal(STONES.length,110);assert.equal(new Set(STONES.map(s=>s.id)).size,110);
  for(const s of STONES){assert.ok(existsSync(new URL('../public'+s.image,import.meta.url)));assert.ok(s.name);}
  for(const roomType of ['living','bedroom','kitchen','bathroom']){
    for(const s of STONES){const id=`floor-${s.id}`;assert.ok(optionsFor(roomType,'floor').some(f=>f.id===id));assert.equal(normalizeRoomDesign({roomType,floor:id}).floor,id);}
  }
});
test('section stone persists across sink conversion, reload and reverting to original countertop',()=>{
  const record={id:'stone-test',class:'kitchen-pullout-slab',bbox:{x1:-.9,x2:.9,y1:-.3,y2:.3}},root=createObject(record),s=kitchenState(root);
  s.cabinets['bay-2'].counterStone='lavina-black-galaxy';delete s.cabinets['bay-2'].accessory;s.cabinets['bay-2'].profile.type='sink';applyKitchenState(root,s);
  const tops=[];root.traverseVisible(n=>{if(n.name==='cabinet-countertop')tops.push(n);});
  assert.equal(tops.filter(m=>m.material.userData.stoneId==='lavina-black-galaxy').length,1);
  syncKitchenRecord(root,record);const loaded=createObject(record);assert.equal(kitchenState(loaded).cabinets['bay-2'].counterStone,'lavina-black-galaxy');
  const next=kitchenState(loaded);delete next.cabinets['bay-2'].counterStone;applyKitchenState(loaded,next);
  loaded.traverseVisible(n=>{if(n.name==='cabinet-countertop')assert.equal(n.material.userData.stoneId,undefined);});
});
