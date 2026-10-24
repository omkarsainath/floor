import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createWardrobe, WARDROBE_CATALOG, LOFT_CATALOG } from '../src/generators/wardrobe.js';
import { updateWardrobeFinishes, wardrobeSurfaceMeshes, wardrobeSurfaceFromHit } from '../src/generators/wardrobeFinishes.js';
import { GREENLAM_CATALOG, GREENLAM_FINISHES, normalizeLaminateChoice, laminateSheetNote } from '../src/materials/greenlam.js';
import { parseLayout } from '../src/loaders/jsonLoader.js';
import { persistLayout } from '../src/state/projectPersistence.js';
import { createObject } from '../src/generators/object.js';
import { queueObjectAnimations, advanceObjectAnimations } from '../src/generators/objectAnimations.js';

const choice=(laminateId='gl-5106-brl',rotation=0,scale=1)=>({laminateId,rotation,scale});
const panel=(root,id)=>wardrobeSurfaceMeshes(root,id)[0];
const face=mesh=>mesh.material[mesh.userData.wardrobeSurface.face];

test('all wardrobe and loft models expose unique finish targets, excluding hardware and mirrors',()=>{
  for(const item of [...WARDROBE_CATALOG,...LOFT_CATALOG]){
    const root=createWardrobe(item.id,item.w,item.d),parts=root.userData.wardrobeSurfaces;
    assert.equal(new Set(parts.map(p=>p.id)).size,parts.length,item.id);
    for(const id of ['side-left','side-right','top','back'])assert.ok(panel(root,id),`${item.id}: ${id}`);
    assert.equal(parts.filter(p=>p.group==='Main doors').length,LOFT_CATALOG.includes(item)?0:item.doorCount||(item.id.includes('sliding')?2:item.id.includes('loft')?3:5));
    root.traverse(n=>{if(/handle|hinge|rail|track|dressing-mirror/.test(n.name))assert.equal(n.userData.wardrobeSurface,undefined);});
    for(const p of parts)assert.ok(p.width>0&&p.height>0&&GREENLAM_CATALOG.some(s=>s.id===p.defaultFinish));
  }
});

test('changing an open door updates both faces in place and preserves neighbours, pose and hardware',()=>{
  const root=createWardrobe('wardrobe-3-loft',1.8,.6),other=createWardrobe('wardrobe-3-loft',1.8,.6);
  const target=panel(root,'door-2'),neighbour=panel(root,'door-1'),side=panel(root,'side-left');
  const previous={face:face(target),back:target.material[5],neighbour:face(neighbour),side:face(side),other:face(panel(other,'door-2')),handle:target.parent.getObjectByName('door-handle').material};
  let disposed=0;previous.face.addEventListener('dispose',()=>disposed++);
  const queue=[];queueObjectAnimations(target.parent,queue);advanceObjectAnimations(queue,1);
  const angle=target.parent.rotation.y;
  updateWardrobeFinishes(root,{'door-2':choice('gl-5673-cny',90,1.4)});
  assert.equal(face(target).userData.laminateId,'gl-5673-cny');assert.equal(disposed,0);
  assert.equal(face(target),previous.face,'live edits retain the material and its GPU program');
  assert.equal(target.material[5],face(target),'open door reverse face updates immediately too');
  assert.equal(face(neighbour),previous.neighbour);assert.equal(face(side),previous.side);
  assert.equal(face(panel(other,'door-2')),previous.other);assert.equal(target.parent.getObjectByName('door-handle').material,previous.handle);
  assert.equal(target.parent.rotation.y,angle);
  assert.equal(wardrobeSurfaceFromHit(target.parent.getObjectByName('door-handle'),root),'door-2');
  assert.equal(wardrobeSurfaceFromHit(root.getObjectByName('hanging-rail'),root),null);
  updateWardrobeFinishes(root,{});assert.equal(face(target).userData.laminateId,target.userData.wardrobeSurface.defaultFinish);
  face(target).dispose();assert.equal(disposed,1);
});

test('left and right sides coat only their outside face, with matching edge bands',()=>{
  const root=createWardrobe('wardrobe-loft',2.4,.6);
  updateWardrobeFinishes(root,{'side-left':choice('gl-9854-afx'),'side-right':choice('gl-5675-sgl')});
  const left=panel(root,'side-left'),right=panel(root,'side-right');
  assert.equal(left.material[1].userData.laminateId,'gl-9854-afx');assert.equal(right.material[0].userData.laminateId,'gl-5675-sgl');
  assert.notEqual(left.material[0],left.material[1]);assert.notEqual(right.material[0],right.material[1]);
  assert.equal(left.material[2].name,'Matching edge band');
  assert.ok(face(left).roughness>face(right).roughness);assert.equal(face(right).metalness,0);
  assert.equal(root.getObjectByName('dressing-mirror').material.userData.laminateId,undefined);
});

test('per-part finishes round trip through actual local persistence, layout parsing and object construction',()=>{
  const finishes={'door-1':choice('gl-5674-sgl',90,1.5),'door-2':choice('gl-175-arn'),'loft-2':choice('gl-90107-uni-hdg'),'side-left':choice('gl-5352-sy1'),'drawer-4':choice('gl-364-sat')};
  const data={units:'m',walls:[],rooms:[],objects:[{id:'custom',class:'wardrobe-3-loft',source:'catalog',rotationY:.6,elevation:.15,objectHeightM:2.85,bbox:{x1:1,y1:2,x2:2.8,y2:2.6},wardrobeFinishes:finishes}]};
  const storage=new Map();assert.equal(persistLayout(data,{setItem:(k,v)=>storage.set(k,v)}),true);
  const restored=parseLayout(JSON.parse(storage.get('preciseFloorplan'))).objects[0],root=createObject(restored);
  assert.deepEqual(root.userData.wardrobeFinishes,finishes);assert.equal(root.rotation.y,.6);assert.ok(Math.abs(root.position.y-.15)<1e-8);
  for(const [id,value] of Object.entries(finishes))assert.equal(face(panel(root,id)).userData.laminateId,value.laminateId);
});

test('unknown catalogue IDs and stale surfaces are discarded; scales cannot poison materials',()=>{
  const root=createWardrobe('wardrobe-sliding-2',1.4,.65,{wardrobeFinishes:{'door-1':{laminateId:'missing'},'side-left':choice('gl-5106-brl',999,Infinity),'door-99':choice()}});
  assert.deepEqual(root.userData.wardrobeFinishes,{'side-left':choice()});
  assert.equal(normalizeLaminateChoice(null),null);assert.equal(normalizeLaminateChoice({laminateId:'fake'}),null);
  assert.equal(normalizeLaminateChoice(choice('gl-5106-brl',0,-7)).scale,.5);
  assert.equal(normalizeLaminateChoice(choice('gl-5106-brl',0,20)).scale,2);
  const data=updateWardrobeFinishes(root,{'door-1':choice()});data['door-1'].scale=99;
  assert.equal(root.userData.wardrobeFinishes['door-1'].scale,1);
});

test('a disconnected editor cannot silently save a finish that never reached the mesh',async()=>{
  const root=createWardrobe('wardrobe-3-loft',1.8,.6,{wardrobeFinishes:{'door-1':choice('gl-175-arn')}});
  // Mirrors the duplicate module instance formerly caused by main.js?v=2.
  const disconnected=await import('../src/generators/wardrobeFinishes.js?disconnected-editor');
  assert.throws(()=>disconnected.updateWardrobeFinishes(root,{'door-1':choice('gl-5649-arn')}),/Reload the viewer/);
  assert.equal(root.userData.wardrobeFinishes['door-1'].laminateId,'gl-175-arn');
  assert.equal(face(panel(root,'door-1')).userData.laminateId,'gl-175-arn');
});

test('catalogue assets exist, codes stay unique per finish and references point at the supplied PDF',()=>{
  assert.ok(GREENLAM_CATALOG.length>=130);assert.equal(new Set(GREENLAM_CATALOG.map(s=>s.id)).size,GREENLAM_CATALOG.length);
  for(const s of GREENLAM_CATALOG){assert.ok(existsSync(`apps/frontend/public${s.image}`),s.id);assert.ok(GREENLAM_FINISHES[s.finish]);assert.ok(s.sampleAspect>0);assert.ok(s.pdfPage>=10&&s.pdfPage<=38);}
  assert.ok(existsSync('apps/frontend/public/catalog/greenlam/source.pdf'));
  assert.equal(laminateSheetNote(choice('gl-5106-brl'),.6,2.1),'');
  assert.ok(laminateSheetNote(choice('gl-5106-brl'),.6,2.7));
  assert.equal(laminateSheetNote(choice('gl-5101-vrb'),.6,2.7),'');
  assert.ok(laminateSheetNote(choice('gl-5106-brl',90),.6,2.1));
});

test('rapid edits cannot be overwritten by older image loads, and disposed materials stay disposed',async()=>{
  const THREE=await import('three');
  const {createLaminateMaterial,updateLaminateMaterial}=await import('../src/materials/greenlam.js');
  const originalDocument=globalThis.document,originalLoad=THREE.ImageLoader.prototype.load;
  const loads=new Map();
  globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>({fillRect(){}})})};
  THREE.ImageLoader.prototype.load=function(url,onLoad){loads.set(url,onLoad);return {};};
  const image={complete:true,naturalWidth:100,naturalHeight:100,width:100,height:100};
  const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
  let material;
  try{
    material=createLaminateMaterial(choice('gl-175-arn'),.6,2);
    const texture=material.map;
    let initialDisposed=0;texture.addEventListener('dispose',()=>initialDisposed++);
    updateLaminateMaterial(material,choice('gl-5649-arn'),.6,2);
    loads.get('/catalog/greenlam/gl-5649-arn.webp')(image);await flush();
    assert.notEqual(material.map,texture,'a larger image needs new GPU storage');assert.equal(material.map.image,image);
    assert.equal(initialDisposed,1,'old GPU storage is released');
    assert.equal(material.map.repeat.x,.6/1.22,'UV settings survive reallocation');
    loads.get('/catalog/greenlam/gl-175-arn.webp')({...image});await flush();
    assert.equal(material.userData.laminateId,'gl-5649-arn');assert.equal(material.map.image,image);
    updateLaminateMaterial(material,choice('gl-5675-sgl'),.6,2);
    const fallback=material.map.image;assert.notEqual(fallback,image,'uncached choice updates its colour before loading');
    let disposed=0;material.map.addEventListener('dispose',()=>disposed++);material.dispose();
    loads.get('/catalog/greenlam/gl-5675-sgl.webp')({...image});await flush();
    assert.equal(disposed,1);assert.equal(material.map.image,fallback,'late image cannot resurrect disposed texture');
  }finally{
    THREE.ImageLoader.prototype.load=originalLoad;
    if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;
  }
});

test('visible thumbnails use intrinsic pixels and different sized swatches replace only texture storage',async()=>{
  const {cacheLaminateImage,createLaminateMaterial,updateLaminateMaterial}=await import('../src/materials/greenlam.js');
  const originalDocument=globalThis.document;
  globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>({fillRect(){},drawImage(){}})})};
  let material;
  try{
    const thumbnail={complete:true,naturalWidth:432,naturalHeight:430,width:90,height:70};
    cacheLaminateImage('gl-5641-arn',thumbnail);
    material=createLaminateMaterial(choice('gl-5641-arn'),.6,2);
    assert.equal(material.map.image.width,432);assert.equal(material.map.image.height,430);
    assert.notEqual(material.map.image,thumbnail,'CSS must not control texture allocation');
    const first=material.map,version=material.version;
    cacheLaminateImage('gl-5648-arn',{...thumbnail,naturalHeight:946});
    updateLaminateMaterial(material,choice('gl-5648-arn',90,1.4),.6,2);
    assert.notEqual(material.map,first);assert.equal(material.map.image.height,946);
    assert.equal(material.version,version,'the shader stays compiled');
    const second=material.map;
    cacheLaminateImage('gl-5643-arn',{...thumbnail,naturalHeight:946});
    updateLaminateMaterial(material,choice('gl-5643-arn'),.6,2);
    assert.equal(material.map,second,'equal sized images reuse texture storage');
  }finally{
    material?.dispose();
    if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;
  }
});

test('uploaded laminate survives JSON reload without a catalogue registration',async()=>{
 const {GREENLAM_BY_ID}=await import('../src/materials/greenlam.js');
 const custom={laminateId:'custom-test-upload',rotation:90,scale:1.3,custom:{name:'My oak',image:'data:image/png;base64,iVBORw0KGgo=',sampleAspect:2}};
 const finishes={'door-1':custom};
 const saved=JSON.parse(JSON.stringify({units:'m',walls:[],rooms:[],objects:[{id:'upload',class:'wardrobe-3-loft',source:'catalog',bbox:{x1:0,y1:0,x2:1.8,y2:.6},wardrobeFinishes:finishes}]}));
 GREENLAM_BY_ID.delete(custom.laminateId);
 const root=createObject(parseLayout(saved).objects[0]);
 assert.deepEqual(root.userData.wardrobeFinishes,finishes);
 assert.equal(face(panel(root,'door-1')).userData.custom.image,custom.custom.image);
 assert.equal(normalizeLaminateChoice({...custom,custom:{...custom.custom,image:'https://example.com/file'}}),null);
 assert.equal(normalizeLaminateChoice({...custom,custom:{...custom.custom,image:'data:image/svg+xml;base64,AAAA'}}),null);
});
