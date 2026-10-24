import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { SOFA_FACTORY_CATALOG, createSofaFactoryFurniture } from '../src/generators/sofaFactory.js';
import { createObject } from '../src/generators/object.js';
import { CATEGORIES } from '../src/ui/catalogPanel.js';

test('all 145 PDF products have distinct source photos and a catalogue category',()=>{
  assert.equal(SOFA_FACTORY_CATALOG.length,145);
  assert.equal(new Set(SOFA_FACTORY_CATALOG.map(p=>p.id)).size,145);
  for(const p of SOFA_FACTORY_CATALOG){
    assert.ok(existsSync(new URL(`../public${p.image}`,import.meta.url)),p.id);
    assert.ok(CATEGORIES.some(c=>c.items.some(i=>i.id===p.id)),p.id);
    assert.ok(p.w>0&&p.d>0&&p.h>0,p.id);
  }
});
test('every PDF product builds finite floor-aligned geometry at its placement footprint',()=>{
  for(const p of SOFA_FACTORY_CATALOG){
    const model=createSofaFactoryFurniture(p.id,p.w,p.d);
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(bounds.min.y)<1e-6,p.id);
    assert.ok(Math.abs(size.x-p.w)<1e-5,p.id+' width');
    assert.ok(Math.abs(size.z-p.d)<1e-5,p.id+' depth');
    model.traverse(n=>{if(n.geometry){assert.ok([...n.geometry.attributes.position.array].every(Number.isFinite));n.geometry.dispose();}n.material?.dispose();});
  }
});
test('product identity survives saved object reconstruction',()=>{
  const p=SOFA_FACTORY_CATALOG.find(p=>p.setSeats?.length===3);
  const saved=JSON.parse(JSON.stringify({class:p.id,source:'catalog',bbox:{x1:2,y1:3,x2:2+p.w,y2:3+p.d}}));
  const object=createObject(saved);
  assert.equal(object.userData.sofaFactoryProduct,p.id);
  assert.ok(object.children.length>=3);
});

test('Spider sofa follows its photographed bench seat and two matching cushions',()=>{
  const p=SOFA_FACTORY_CATALOG.find(p=>p.id==='sf-sofa-beds-p40-04');
  const model=createSofaFactoryFurniture(p.id,p.w,p.d),parts=[];
  model.traverse(n=>parts.push(n));
  assert.equal(parts.filter(n=>n.name==='seat-cushion').length,1);
  assert.equal(parts.filter(n=>n.name==='back-cushion').length,1);
  const pillows=parts.filter(n=>n.name==='scatter-cushion');
  assert.equal(pillows.length,2);
  assert.ok(pillows.every(n=>n.material.color.getHex()!==0xe5dfd4));
  assert.ok(parts.some(n=>n.name==='back-shell'));
  assert.equal(parts.filter(n=>n.name==='arm-side-panel').length,2);
  assert.ok(parts.some(n=>n.name==='upholstery-piping'));
});

test('Wooden Cum Bed preserves floral backs, bench and enclosed frame',()=>{
  const p=SOFA_FACTORY_CATALOG.find(p=>p.id==='sf-sofa-beds-p39-03');
  const model=createSofaFactoryFurniture(p.id,p.w,p.d),parts=[];
  model.traverse(n=>parts.push(n));
  assert.equal(parts.filter(n=>n.name==='seat-cushion').length,1);
  const backs=parts.filter(n=>n.name==='back-cushion');
  assert.equal(backs.length,3);
  assert.ok(backs.every(n=>n.material.map?.isDataTexture));
  assert.ok(backs.every(n=>n.material.map.image.width>32));
  assert.equal(parts.filter(n=>n.name==='arm-spindle').length,0);
  assert.equal(parts.filter(n=>n.name==='wood-side-panel').length,2);
  assert.equal(parts.filter(n=>n.name==='wood-front-recess').length,3);
  assert.ok(model.userData.isSofaBed);
});

test('wooden set variants retain curved rails and all four Box Pattern components',()=>{
  for(const id of ['sf-wooden-sofas-p43-01','sf-wooden-sofas-p43-03']){
    const p=SOFA_FACTORY_CATALOG.find(p=>p.id===id),parts=[];
    createSofaFactoryFurniture(id,p.w,p.d).traverse(n=>parts.push(n));
    assert.equal(parts.filter(n=>n.name==='curved-timber-side').length,6);
    assert.equal(parts.filter(n=>n.name==='arm-spindle').length,0);
  }
  const p=SOFA_FACTORY_CATALOG.find(p=>p.id==='sf-wooden-sofas-p44-04');
  const model=createSofaFactoryFurniture(p.id,p.w,p.d);
  assert.equal(model.children.length,4);
  assert.notDeepEqual(model.children[1].position.toArray(),model.children[3].position.toArray());
});
