import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {validatePhotoSofaSpec,createPhotoSofa} from '../src/generators/photoSofa.js';
import {createObject} from '../src/generators/object.js';
import {persistLayout} from '../src/state/projectPersistence.js';
const spec={version:1,referenceId:'sf-sofas-p13-6',layout:'corner',width:2.8,depth:2.6,height:.85,seatingDepth:.86,mainSeats:3,wingSeats:2,mainBacks:3,wingBacks:2,seatColor:'#82796e',frameColor:'#635b50',side:'left'};
test('photo dimensions and layout are validated before geometry creation',()=>{
 for(const bad of [{width:0},{height:NaN},{depth:Infinity},{layout:'bogus'},{mainSeats:1.2},{seatColor:'red'},{depth:.5},{referenceId:'unknown'}])assert.throws(()=>validatePhotoSofaSpec({...spec,...bad}));
 assert.equal(validatePhotoSofaSpec({...spec,photo:'javascript:bad'}).photo,null);
});
test('photo model has real seated wings and preserves its editable record through save/reload',()=>{
 const data={id:'photo',class:'uploaded-sofa',source:'catalog',photoSofaSpec:spec,bbox:{x1:1,y1:2,x2:3.8,y2:4.6},rotationY:.43};
 const values=new Map();persistLayout({objects:[data]},{setItem:(k,v)=>values.set(k,v)});
 const saved=JSON.parse(values.get('preciseFloorplan')).objects[0],mesh=createObject(saved);
 assert.equal(mesh.userData.photoSofaSpec.mainSeats,3);assert.ok(mesh.getObjectByName('corner-main').getObjectByName('back-cushion'));assert.ok(mesh.getObjectByName('corner-return').getObjectByName('back-cushion'));
 const yaw=mesh.rotation.y;assert.ok(Math.abs(yaw-.43)<1e-6);mesh.rotation.y=0;
 const b=new T.Box3().setFromObject(mesh),size=b.getSize(new T.Vector3());assert.ok(Math.abs(size.x-2.8)<1e-5);assert.ok(Math.abs(size.z-2.6)<1e-5);assert.ok(Math.abs(size.y-.85)<1e-5);
});
test('photo catalogue mode preserves the dedicated No.19 construction and chosen height',()=>{
 const root=createPhotoSofa({...spec,referenceId:'sf-sofas-p18-19',useCatalogueModel:true});
 assert.equal(root.userData.sofaDesign.dedicated,true);assert.ok(root.getObjectByName('seat-x-wing'));assert.ok(root.getObjectByName('seat-z-wing'));
 assert.ok(Math.abs(new T.Box3().setFromObject(root).getSize(new T.Vector3()).y-.85)<1e-5);
});
