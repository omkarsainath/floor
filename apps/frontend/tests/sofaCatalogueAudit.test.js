import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { OBB } from 'three/examples/jsm/math/OBB.js';
import { SOFA_FACTORY_CATALOG, createSofaFactoryFurniture } from '../src/generators/sofaFactory.js';
import { sofaDesign } from '../src/generators/sofaDesigns.js';
const sofaProducts=SOFA_FACTORY_CATALOG.filter(p=>sofaDesign(p.id));
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<.00005,`${label}: ${a} != ${b}`);

test('all catalogue sofas keep measured envelopes, finite normals, floor contact and separate corner seats',()=>{
  for(const p of sofaProducts){
    const design=sofaDesign(p.id),root=createSofaFactoryFurniture(p.id,p.w,p.d),box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3());
    assert.equal(p.referenceAudit.reviewed,true,p.id);close(size.x,p.w,p.id+' width');close(size.z,p.d,p.id+' depth');close(size.y,p.h,p.id+' height');close(box.min.y,0,p.id+' floor');
    if(['corner','chaise'].includes(design.layout))close(p.seatingDepth,p.referenceAudit.seatingDepthInches*.0254,p.id+' seating depth');
    const pads=[];
    root.traverse(n=>{
      if(n.isMesh){
        const a=n.geometry.attributes.normal;
        for(let i=0;i<a.count;i+=Math.max(1,Math.floor(a.count/80))){const length=Math.hypot(a.getX(i),a.getY(i),a.getZ(i));assert.ok(Number.isFinite(length)&&Math.abs(length-1)<.001,p.id+' normals');}
        if(n.name==='seat-cushion'||n.name==='shared-corner-seat'){
          n.geometry.computeBoundingBox();const local=n.geometry.boundingBox.clone();local.expandByScalar(-.003);pads.push(new OBB().fromBox3(local).applyMatrix4(n.matrixWorld));
        }
      }
    });
    if(design.layout==='corner'&&p.id!=='sf-sofas-p18-19'){
      assert.equal(root.children.filter(c=>c.name==='shared-corner').length,1,p.id);
      for(const run of ['corner-main','corner-return'])assert.ok(root.getObjectByName(run).getObjectByName('back-shell'),p.id+' '+run);
      for(let i=0;i<pads.length;i++)for(let j=i+1;j<pads.length;j++)assert.equal(pads[i].intersectsOBB(pads[j],1e-7),false,p.id+' overlapping seat cushions');
    }
    if(p.setSeats)for(const piece of root.children){
      const q=piece.userData.catalogueDimensions;assert.ok(q,p.id+' component measurement');
      const b=new T.Box3().setFromObject(piece),s=b.getSize(new T.Vector3());
      close(s.x,piece.rotation.y?q.depth:q.width,p.id+' component width');close(s.z,piece.rotation.y?q.width:q.depth,p.id+' component depth');close(s.y,q.height,p.id+' component height');
    }
    root.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});
  }
});
