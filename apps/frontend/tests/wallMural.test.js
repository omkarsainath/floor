import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {muralBounds,muralGeometry,HORSE_MURAL} from '../src/design/wallMural.js';
import {createLightSwitch} from '../src/design/lightSwitch.js';
test('mural preserves composition and clips UVs to carved wall pieces',()=>{
  const b=muralBounds(0,4,0,3);
  assert.ok(Math.abs((b.right-b.left)/(b.top-b.bottom)-HORSE_MURAL.aspect)<1e-9);
  for(const side of [-1,1]){
    const g=muralGeometry({lo:1,hi:2,bottom:1,top:2},b,side,.02);g.computeBoundingBox();
    assert.equal(g.boundingBox.min.x,1);assert.equal(g.boundingBox.max.x,2);
    assert.ok(g.attributes.uv.array[0]>0);assert.ok(g.attributes.uv.array[2]<1);
    g.dispose();
  }
  assert.equal(muralGeometry({lo:5,hi:6,bottom:0,top:3},b,1,.02),null);
});
test('master lights switch swaps mural states and supports newly rebuilt murals',()=>{
  const scene=new THREE.Scene(),control=createLightSwitch();
  const make=()=>{const m=new THREE.MeshBasicMaterial();m.muralLitMap=new THREE.Texture();m.muralUnlitMap=new THREE.Texture();const mesh=new THREE.Mesh(new THREE.PlaneGeometry(),m);mesh.userData.isWallMural=true;scene.add(mesh);return m;};
  const a=make();control.update(scene);assert.equal(a.map,a.muralLitMap);
  control.setEnabled(false);control.update(scene);assert.equal(a.map,a.muralUnlitMap);
  const b=make();control.update(scene);assert.equal(b.map,b.muralUnlitMap);
  control.setEnabled(true);control.update(scene);assert.equal(a.map,a.muralLitMap);assert.equal(b.map,b.muralLitMap);
});

test('depth displaces actual vertices on either face and updates bounds and normals',async()=>{
  const {applyMuralDepth}=await import('../src/design/wallMural.js');
  const pixels={width:2,height:2,data:new Uint8ClampedArray([0,0,0,255,255,255,255,255,0,0,0,255,255,255,255,255])};
  for(const side of [-1,1]){
    const bounds=muralBounds(0,4,0,3),g=muralGeometry({lo:0,hi:4,bottom:0,top:3},bounds,side,.02);
    applyMuralDepth(g,pixels);
    const zs=Array.from(g.attributes.position.array).filter((_,i)=>i%3===2);
    assert.ok(Math.max(...zs)-Math.min(...zs)>.13);
    assert.ok(g.boundingBox&&g.boundingSphere);
    assert.ok(Array.from(g.attributes.normal.array).every(Number.isFinite));g.dispose();
  }
});

test('independent light circuits preserve authored levels and rebuilt fixtures',()=>{
  const scene=new THREE.Scene(),control=createLightSwitch();
  const make=category=>{const g=new THREE.Group();g.userData.category=category;scene.add(g);const l=new THREE.PointLight(0xffffff,3);l.userData.isAuthoredLight=true;g.add(l);return l;};
  const c=make('ceiling'),w=make('wallPanel');
  control.setCircuitEnabled('wall',false);control.update(scene);
  assert.equal(c.intensity,3);assert.equal(w.intensity,0);
  const rebuilt=make('wallPanel');control.update(scene);assert.equal(rebuilt.intensity,0);
  control.setCircuitEnabled('ceiling',false);control.setCircuitEnabled('wall',true);control.update(scene);
  assert.equal(c.intensity,0);assert.equal(w.intensity,3);assert.equal(rebuilt.intensity,3);
  control.setEnabled(false);control.update(scene);assert.equal(w.intensity,0);
  control.setEnabled(true);control.update(scene);assert.equal(c.intensity,0);assert.equal(w.intensity,3);
});
