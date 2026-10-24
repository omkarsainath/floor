import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {setObjectHeight} from '../src/design/objectHeight.js';
import {createLightSwitch} from '../src/design/lightSwitch.js';
import {createObject} from '../src/generators/object.js';
import {parseLayout} from '../src/loaders/jsonLoader.js';

test('height resizing keeps object bottom and footprint fixed',()=>{
 const group=new THREE.Group();const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,1,3));mesh.position.y=.5;group.add(mesh);group.position.y=.8;
 const before=new THREE.Box3().setFromObject(group);
 assert.equal(setObjectHeight(group,2.4),true);
 const after=new THREE.Box3().setFromObject(group);
 assert.ok(Math.abs(after.min.y-before.min.y)<1e-6);assert.ok(Math.abs(after.max.y-after.min.y-2.4)<1e-6);
 assert.equal(before.min.x,after.min.x);assert.equal(before.max.z,after.max.z);
 assert.equal(setObjectHeight(group,NaN),false);assert.equal(setObjectHeight(group,-1),false);
});

test('saved furniture height survives JSON reload and generator rebuild',()=>{
 const object={id:'tv',class:'tv-unit-oak-marble',bbox:{x1:0,y1:0,x2:2.4,y2:.5},objectHeightM:2.7};
 const layout=parseLayout(JSON.parse(JSON.stringify({units:'m',rooms:[],walls:[],objects:[object]})));
 const mesh=createObject(layout.objects[0]); const bounds=new THREE.Box3().setFromObject(mesh);
 assert.ok(Math.abs(bounds.max.y-bounds.min.y-2.7)<1e-5);
});

test('master switch restores individual settings and handles rebuilt lights without changing daylight',()=>{
 const scene=new THREE.Scene(),group=new THREE.Group();group.userData.isCeilingLight=true;scene.add(group);
 const on=new THREE.PointLight('white',20),off=new THREE.PointLight('white',0),sun=new THREE.DirectionalLight('white',2);
 on.userData.isAuthoredLight=off.userData.isAuthoredLight=true;group.add(on,off);scene.add(sun);
 const material=new THREE.MeshStandardMaterial({emissive:'white',emissiveIntensity:3});group.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
 const control=createLightSwitch();control.setEnabled(false);control.update(scene);control.update(scene);
 assert.equal(on.intensity,0);assert.equal(material.emissiveIntensity,0);assert.equal(sun.intensity,2);
 const added=new THREE.PointLight('white',12);added.userData.isAuthoredLight=true;group.add(added);control.update(scene);assert.equal(added.intensity,0);
 control.setEnabled(true);control.update(scene);assert.equal(on.intensity,20);assert.equal(off.intensity,0);assert.equal(added.intensity,12);assert.equal(material.emissiveIntensity,3);
});
