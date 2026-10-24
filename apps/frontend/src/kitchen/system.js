import * as THREE from 'three';
import { OBB } from 'three/examples/jsm/math/OBB.js';
import { createLaminateMaterial, normalizeLaminateChoice } from '../materials/greenlam.js';
import { PRODUCT_BY_ID, compatibility, productOrigin, clampOpen } from './catalog.js';
import { box, createAccessoryModel, setAccessoryPose, disposeAssembly } from './models.js';
import {validateSectionSizes} from './sectionGeometry.js';
import {createInsetSink,sinkDimensions,counterOpening} from './sink.js';
import {STONE_BY_ID,stoneMaterial,mapCounterStone} from '../materials/stone.js';

const registry=new WeakMap();
const clone=v=>structuredClone(v);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export const isKitchen=root=>registry.has(root);
export function registerKitchen(root,{body,fronts=[],attachments=[],counter,kind='base',width,depth,bayBounds,sectionSizes,rebuild}) {
  // Registration uses known generator objects, never guesses meshes by colour.
  const bounds=body.geometry.boundingBox|| (body.geometry.computeBoundingBox(),body.geometry.boundingBox);
  const min=bounds.min.clone().add(body.position),max=bounds.max.clone().add(body.position);
  if(counter){counter.geometry.computeBoundingBox();max.y=Math.min(max.y,counter.geometry.boundingBox.min.y+counter.position.y);}
  const original=new Map();root.traverse(n=>{if(n.isMesh)original.set(n,n.material);});
  const entries=fronts.map((node,i)=>{
    const mesh=node.isMesh?node:node.children.find(n=>n.isMesh);mesh.geometry.computeBoundingBox();
    const size=mesh.geometry.boundingBox.getSize(new THREE.Vector3());
    const x=node.position.x+(node===mesh?0:mesh.position.x),y=node.position.y+(node===mesh?0:mesh.position.y);
    return {id:`bay-${i+1}`,node,mesh,x,y,z:node.position.z,w:size.x,h:size.y};
  });
  if(!entries.length)entries.push({id:'bay-1',node:null,mesh:null,x:0,y:(min.y+max.y)/2,z:max.z+.01,w:width-.006,h:max.y-min.y-.006});
  registry.set(root,{body,fronts:entries,attachments,min,max,kind,original,bayBounds,sectionSizes,rebuild,state:{version:1,cabinets:{}},assembly:null,models:new Map(),cutaway:false,anim:new Map(),finishMaterials:[],errors:[]});
  root.userData.isKitchenCabinet=true;
}
export function kitchenState(root){return clone(registry.get(root)?.state||{version:1,cabinets:{}});}
export function kitchenErrors(root){return registry.get(root)?.errors||[];}
export function cabinetList(root) {
  const r=registry.get(root);if(!r)return [];
  const {x:sx,y:sy,z:sz}=root.scale;
  return r.fronts.map((f,i)=>{
    const state=r.state.cabinets[f.id]||{},profile=state.profile||{};
    const t=finite(profile.boardThickness)?Math.max(.006,Math.min(.04,profile.boardThickness)):.018;
    const bounds=r.bayBounds?.[i]||{min:r.min,max:r.max};
    const left=r.bayBounds?bounds.min.x:i===0?r.min.x:(r.fronts[i-1].x+f.x)/2,right=r.bayBounds?bounds.max.x:i===r.fronts.length-1?r.max.x:(f.x+r.fronts[i+1].x)/2;
    const width=(right-left)*sx-t*2,height=(bounds.max.y-bounds.min.y)*sy-t*2,depth=(bounds.max.z-bounds.min.z)*sz-t*2;
    const c={id:f.id,parentCabinetId:`${root.userData.layoutId}:${f.id}`,resizable:!!r.rebuild,x:(left+right)*sx/2,y:bounds.min.y*sy+t,z:(bounds.min.z+bounds.max.z)*sz/2,
      width,height,depth,opening:f.w*sx,frontWidth:f.w*sx,frontHeight:f.h*sy,frontY:f.y*sy,frontZ:f.z*sz,
      boardThickness:t,type:r.kind==='sink'?'sink':height>1.5?'tall':r.kind==='hob-adjacent'?'hob-adjacent':width<.3?'narrow':'base',confirmed:false,plumbingConfirmed:false,obstructions:[],hand:'left',source:'Model envelope; 18 mm boards and door divisions assumed',...profile};
    // Manual measurements may reduce the usable envelope, never enlarge it.
    for(const [key,limit] of Object.entries({width,height,depth,opening:f.w*sx}))if(!finite(c[key])||c[key]<=0||c[key]>limit+1e-6){c[key]=limit;c.confirmed=false;}
    c.boardThickness=t;c.accessory=state.accessory;c.finish=state.finish;c.envelope={width,height,depth,opening:f.w*sx,boardThickness:.04};
    // Editable slabs have explicit panel geometry. Use it for virtual fitting
    // without claiming that the user has measured a physical kitchen.
    c.modelledInterior=!!r.bayBounds;
    if(c.modelledInterior&&c.type==='sink'){
      const size=sinkDimensions(width,depth),bowlDepth=Math.min(size.depth,height*.4);
      c.obstructions=[...c.obstructions,{label:'modelled sink bowl',x:0,y:height-bowlDepth/2,z:0,w:size.w,h:bowlDepth,d:size.d}];
    }
    return c;
  });
}
export function cabinetFromHit(root,hit) {
  const r=registry.get(root);let n=hit;
  while(n&&n!==root){if(n.userData.kitchenBay)return n.userData.kitchenBay;const f=r?.fronts.find(f=>f.node===n);if(f)return f.id;n=n.parent;}
  return null;
}
export function accessoryOperationFromHit(root,hit) {
  const id=cabinetFromHit(root,hit),a=registry.get(root)?.state.cabinets[id]?.accessory;
  if(!a)return null;
  let tier=null;
  if(PRODUCT_BY_ID.get(a.productModelId)?.category==='wicker'){
    for(let n=hit;n&&n!==root;n=n.parent)if(Number.isInteger(n.userData.kitchenTier)){tier=n.userData.kitchenTier;break;}
    // A fixed rail or carcass is not a command to operate every drawer.
    if(tier===null||tier<0||tier>=a.tierStates.length)return null;
  }
  return {id,tier,value:(tier===null?a.openingState:a.tierStates[tier])>.5?0:1};
}
function validProfile(p={}) {
  const next={};
  for(const k of ['width','height','depth','opening','boardThickness'])if(finite(p[k])&&p[k]>0)next[k]=p[k];
  if(next.boardThickness!=null&&(next.boardThickness<.006||next.boardThickness>.04))throw new Error('Board thickness must be between 6 and 40 mm.');
  if(['base','narrow','corner','sink','drawer','tall','appliance','hob-adjacent'].includes(p.type))next.type=p.type;
  next.confirmed=p.confirmed===true;next.plumbingConfirmed=p.plumbingConfirmed===true;next.hand=p.hand==='right'?'right':'left';
  if(p.obstructions!=null&&!Array.isArray(p.obstructions))throw new Error('Obstructions must be an array of measured boxes.');
  next.obstructions=(p.obstructions||[]).map(o=>{
    if(!['x','y','z','w','h','d'].every(k=>finite(o[k]))||!['w','h','d'].every(k=>o[k]>0))throw new Error('Each obstruction needs numeric x, y, z, w, h, d in metres, with positive dimensions.');
    return {x:o.x,y:o.y,z:o.z,w:o.w,h:o.h,d:o.d,label:String(o.label||'Obstruction').slice(0,80)};
  });
  return next;
}
export function normalizeKitchenState(root,input) {
  const r=registry.get(root),next={version:1,cabinets:{}};
  if(r.sectionSizes)next.sectionSizes=validateSectionSizes(input?.sectionSizes||r.sectionSizes);
  for(const f of r.fronts){
    const c=input?.cabinets?.[f.id];if(!c)continue;
    const record={profile:validProfile(c.profile),finish:normalizeLaminateChoice(c.finish)};
    if(STONE_BY_ID.has(c.counterStone))record.counterStone=c.counterStone;
    const a=c.accessory,p=PRODUCT_BY_ID.get(a?.productModelId);
    if(a&&p)record.accessory={id:typeof a.id==='string'?a.id:THREE.MathUtils.generateUUID(),parentCabinetId:`${root.userData.layoutId}:${f.id}`,category:p.category,productModelId:p.id,
      dimensions:{width:p.w,height:p.h,depth:p.d},position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],installationConfiguration:{tiers:p.tiers,conceptual:true},
      openingDirection:record.profile.hand,openingState:clampOpen(a.openingState),tierStates:Array.from({length:p.tiers},(_,i)=>clampOpen(a.tierStates?.[i]??a.openingState)),
      laminateMode:a.laminateMode==='OVERRIDE'&&normalizeLaminateChoice(a.laminate)?'OVERRIDE':'INHERIT',laminate:normalizeLaminateChoice(a.laminate),
      selectedLaminateId:normalizeLaminateChoice(a.laminate)?.laminateId||null,hardwareMaterial:p.hardwareMaterial,mounting:{type:p.mounting,clearance:p.clearance,manufacturerVerified:false}};
    next.cabinets[f.id]=record;
  }
  return next;
}
function finishMaterial(r,f,choice,w,h) {
  const material=choice?createLaminateMaterial(choice,w,h):(r.original.get(f.mesh)||r.body.material).clone();
  r.finishMaterials.push(material);return material;
}
export function applyKitchenState(root,input,{strict=false}={}) {
  const r=registry.get(root);if(!r)return;
  const next=normalizeKitchenState(root,input);
  if(r.rebuild&&JSON.stringify(next.sectionSizes)!==JSON.stringify(r.sectionSizes)){
    // Construct and validate off-scene so a failed live edit leaves the current
    // cabinet and animation untouched. Keep the selectable root identity.
    const candidate=new THREE.Group();candidate.position.copy(root.position);candidate.rotation.copy(root.rotation);candidate.scale.copy(root.scale);candidate.userData={...root.userData};
    const total=sizes=>sizes.reduce((sum,s)=>sum+s.width,0),deep=sizes=>Math.max(...sizes.map(s=>s.depth));
    candidate.position.add(new THREE.Vector3((total(next.sectionSizes)-total(r.sectionSizes))*root.scale.x/2,0,(deep(next.sectionSizes)-deep(r.sectionSizes))*root.scale.z/2).applyQuaternion(root.quaternion));
    try{registerKitchen(candidate,r.rebuild(candidate,next.sectionSizes));registry.get(candidate).cutaway=r.cutaway;applyKitchenState(candidate,next,{strict});}
    catch(error){disposeAssembly(candidate);throw error;}
    const discarded=new THREE.Group();for(const child of [...root.children])discarded.add(child);disposeAssembly(discarded);
    for(const child of [...candidate.children])root.add(child);
    registry.set(root,registry.get(candidate));registry.delete(candidate);root.position.copy(candidate.position);root.userData.kitchen=clone(candidate.userData.kitchen);root.updateMatrixWorld(true);
    return kitchenState(root);
  }
  const before=r.state;r.state=next;
  if(strict){const bad=cabinetList(root).filter(c=>c.accessory).map(c=>compatibility(c,PRODUCT_BY_ID.get(c.accessory.productModelId))).find(result=>!result.ok);if(bad){r.state=before;throw new Error(bad.reasons.join(' '));}}
  r.anim.clear();r.errors=[];
  if(r.assembly)disposeAssembly(r.assembly);
  for(const [mesh,material] of r.original){mesh.material=material;if(mesh.name==='cabinet-countertop')mesh.visible=true;}
  r.finishMaterials.forEach(m=>{if(m.userData.stoneId)m.map?.dispose();m.dispose();});r.finishMaterials=[];
  for(const mesh of r.original.keys())if(mesh.name==='cabinet-countertop'){
    const stoneId=next.cabinets[mesh.userData.kitchenBay]?.counterStone;
    if(stoneId){mesh.material=stoneMaterial(stoneId);r.finishMaterials.push(mesh.material);mapCounterStone(mesh,root.scale);}
  }
  r.body.visible=true;for(const f of r.fronts)if(f.node)f.node.visible=true;
  r.models.clear();
  const assembly=new THREE.Group();assembly.name='Kitchen accessory installation';assembly.scale.set(1/root.scale.x,1/root.scale.y,1/root.scale.z);root.add(assembly);r.assembly=assembly;
  const cabinets=cabinetList(root),active=cabinets.some(c=>(c.accessory&&compatibility(c,PRODUCT_BY_ID.get(c.accessory.productModelId)).ok)||(r.bayBounds&&c.type==='sink'));
  for(const attachment of r.attachments)attachment.visible=!active;
  if(active||r.cutaway||cabinets.some(c=>c.finish)){
    r.body.visible=false;
    if(r.bayBounds){
      for(const [i,c] of cabinets.entries()){
        const min=r.bayBounds[i].min.clone().multiply(root.scale),max=r.bayBounds[i].max.clone().multiply(root.scale),t=c.boardThickness,w=max.x-min.x,h=max.y-min.y,d=max.z-min.z,cx=(min.x+max.x)/2,cy=(min.y+max.y)/2,cz=(min.z+max.z)/2;
        const material=r.body.material.clone();
        for(const x of [min.x+t/2,max.x-t/2])box(assembly,t,h,d,x,cy,cz,c.finish?createLaminateMaterial(c.finish,d,h):material,'carcass-side').visible=!r.cutaway;
        box(assembly,w,h,t,cx,cy,min.z+t/2,material,'carcass-back').visible=!r.cutaway;
        for(const y of c.type==='sink'?[min.y+t/2]:[min.y+t/2,max.y-t/2])box(assembly,w,t,d,cx,y,cz,material,'carcass-horizontal');
      }
    }else{
    const t=Math.max(...cabinets.map(c=>c.boardThickness)),min=r.min.clone().multiply(root.scale),max=r.max.clone().multiply(root.scale),w=max.x-min.x,h=max.y-min.y,d=max.z-min.z;
    const material=r.body.material.clone(),cx=(min.x+max.x)/2,cy=(min.y+max.y)/2,cz=(min.z+max.z)/2;
    const shell=new THREE.Group();shell.name='Reversible cabinet interior';assembly.add(shell);
    for(const [i,x] of [min.x+t/2,max.x-t/2].entries()){
      const choice=cabinets[i===0?0:cabinets.length-1].finish;
      box(shell,t,h,d,x,cy,cz,choice?createLaminateMaterial(choice,d,h):material,'carcass-side').visible=!r.cutaway;
    }
    box(shell,w,h,t,cx,cy,min.z+t/2,material,'carcass-back').visible=!r.cutaway;
    for(const y of [min.y+t/2,max.y-t/2])box(shell,w,t,d,cx,y,cz,material,'carcass-horizontal');
    for(let i=1;i<cabinets.length;i++)box(shell,t,h,d,(r.fronts[i-1].x+r.fronts[i].x)*root.scale.x/2,cy,cz,material,'cabinet-partition');
    }
  }
  for(const c of cabinets){
    const f=r.fronts.find(f=>f.id===c.id),state=next.cabinets[c.id]||{},choice=state.finish;
    if(c.type==='sink'&&r.bayBounds){
      const counter=[...r.original.keys()].find(m=>m.name==='cabinet-countertop'&&m.userData.kitchenBay===c.id);
      if(counter){
        counter.visible=false;
        const dimensions=counter.geometry.parameters,size=sinkDimensions(c.envelope.width,c.envelope.depth);
        const position=counter.position.clone().multiply(root.scale),top=position.y+dimensions.height*root.scale.y/2;
        const cut=new THREE.Mesh(counterOpening(dimensions.width*root.scale.x,dimensions.depth*root.scale.z,dimensions.height*root.scale.y,size.w,size.d,c.x-position.x,c.z-position.z),counter.material.clone());
        cut.name='cabinet-countertop';cut.position.copy(position);cut.castShadow=cut.receiveShadow=true;assembly.add(cut);
        if(state.counterStone)mapCounterStone(cut,new THREE.Vector3(1,1,1));
        const sink=createInsetSink(size.w,size.d,Math.min(size.depth,c.envelope.height*.4));
        sink.position.set(c.x,top+.001,c.z);sink.userData.kitchenBay=c.id;assembly.add(sink);
      }
    }
    if(choice&&f.mesh)f.mesh.material=finishMaterial(r,f,choice,c.frontWidth,c.frontHeight);
    if(!c.accessory){
      if(!f.node&&choice){const m=finishMaterial(r,f,choice,c.frontWidth,c.frontHeight);r.finishMaterials.pop();box(assembly,c.frontWidth,c.frontHeight,.02,c.x,c.frontY,c.frontZ,m,'laminate-front');}
      continue;
    }
    const p=PRODUCT_BY_ID.get(c.accessory.productModelId),fit=compatibility(c,p);
    if(!fit.ok){r.errors.push(`${c.id}: ${fit.reasons.join(' ')}`);continue;}
    if(f.node)f.node.visible=false;
    const origin=productOrigin(c,p),frontHeight=p.category==='cutlery'?Math.min(.16,c.frontHeight):c.frontHeight;
    const material=finishMaterial(r,f,c.accessory.laminateMode==='OVERRIDE'?c.accessory.laminate:choice,c.frontWidth,frontHeight);
    // Owned by this assembly's disposal; do not dispose it a second time below.
    r.finishMaterials.pop();
    const model=createAccessoryModel(p,{frontMaterial:material,frontWidth:c.frontWidth,frontHeight,frontZ:c.frontZ-c.z-origin.z,hand:c.hand});
    model.position.set(c.x+origin.x,c.y+origin.y,c.z+origin.z);model.userData.kitchenBay=c.id;
    // Align moving fronts to the exact existing front's vertical bounds.
    const frontBottom=p.category==='cutlery'?c.frontY+c.frontHeight/2-frontHeight:c.frontY-c.frontHeight/2;
    const offset=frontBottom-model.position.y+.012;
    for(const carrier of model.userData.kitchenModel.moving)for(const child of carrier.children)if(child.name==='laminate-front'||/handle/.test(child.name))child.position.y+=offset;
    if(p.category==='cutlery'){
      const fixedH=c.frontHeight-frontHeight-.003;
      box(assembly,c.frontWidth,fixedH,.02,c.x,c.frontY-c.frontHeight/2+fixedH/2,c.frontZ,material,'retained-lower-front');
    }
    if(p.category==='corner'){
      const side=c.hand==='right'?-1:1,bw=c.frontWidth-.44-.006;
      if(bw>0)box(assembly,bw,c.frontHeight,.02,c.x-side*(c.frontWidth-bw)/2,c.frontY,c.frontZ,material,'blind-corner-front');
    }
    assembly.add(model);r.models.set(c.id,model);
    c.accessory.position=model.position.toArray();
    const stored=next.cabinets[c.id].accessory;stored.position=model.position.toArray();
    if(p.category==='wicker')stored.tierStates.forEach((t,i)=>setAccessoryPose(model,t,i));else setAccessoryPose(model,stored.openingState);
  }
  root.userData.kitchen=clone(next);root.updateMatrixWorld(true);return kitchenState(root);
}
export function restoreKitchen(root,record) {
  if(!isKitchen(root))return;
  const r=registry.get(root),input=r.sectionSizes?{...record?.kitchen,sectionSizes:r.sectionSizes}:record?.kitchen;
  try{applyKitchenState(root,input);}catch(error){applyKitchenState(root,{});registry.get(root).errors.push(`Saved kitchen settings could not be loaded: ${error.message} Original cabinet retained.`);}
}
export function resizeKitchenSection(root,id,field,value) {
  const r=registry.get(root),c=cabinetList(root).find(c=>c.id===id),i=r?.fronts.findIndex(f=>f.id===id);
  if(!r?.rebuild||!c||i<0)throw new Error('This cabinet supports clearance measurements only. Use the slab with pull-outs to resize individual sections.');
  if(!Number.isFinite(value)||value<=0)throw new Error('Enter a positive measurement.');
  const next=kitchenState(root),s=next.sectionSizes[i],t=c.boardThickness;
  if(field==='width')s.width=(value+2*t)/root.scale.x;
  else if(field==='height')s.height=(value+2*t)/root.scale.y+.15;
  else if(field==='depth')s.depth=(value+2*t)/root.scale.z;
  else if(field==='opening')s.width=(value+.006*root.scale.x)/root.scale.x;
  else if(field==='boardThickness'){if(value<.006||value>.04)throw new Error('Board thickness must be between 6 and 40 mm.');}
  else throw new Error('Unknown section dimension.');
  // Never create a physically impossible bay smaller than the installed
  // hardware itself. Clearance shortfalls are allowed and are surfaced as a
  // fit warning after the cabinet has been resized.
  const accessory=next.cabinets[id]?.accessory,product=PRODUCT_BY_ID.get(accessory?.productModelId);
  if(product){
    const proposed=cabinetList(root)[i];
    const limits={width:product.w,height:product.h,depth:product.d};
    const changed=field==='width'?s.width*root.scale.x-t*2:field==='height'?((s.height-.15)*root.scale.y)-t*2:field==='depth'?s.depth*root.scale.z-t*2:proposed[field];
    if(field in limits&&changed<limits[field])throw new Error(`Needs at least ${Math.round(limits[field]*1000)} mm internal ${field}.`);
  }
  const physical={width:s.width*root.scale.x-t*2,height:(s.height-.15)*root.scale.y-t*2,depth:s.depth*root.scale.z-t*2};
  if(['width','height','depth'].includes(field)&&physical[field]<=.4)throw new Error(`Needs more internal ${field} for a usable cabinet section.`);
  next.cabinets[id]||={};const profile=next.cabinets[id].profile||={};
  for(const k of ['width','height','depth','opening'])delete profile[k];
  if(field==='boardThickness')profile.boardThickness=value;
  // A resize is a cabinet edit. Accessories are revalidated and reported
  // separately so an accessory that no longer fits cannot prevent the slab
  // itself from changing size.
  return applyKitchenState(root,next,{strict:false});
}
export function addKitchenSection(root) {
  const r=registry.get(root);
  if(!r?.rebuild)throw new Error('Only editable cabinets can add sections.');
  const next=kitchenState(root),last=next.sectionSizes.at(-1)||{width:.6,height:.9,depth:.6};
  if(next.sectionSizes.length>=12)throw new Error('A cabinet can have at most twelve sections.');
  next.sectionSizes.push({...last});
  return applyKitchenState(root,next,{strict:false});
}
export function deleteKitchenSection(root,id) {
  const r=registry.get(root),i=r?.fronts.findIndex(f=>f.id===id);
  if(!r?.rebuild||i<0)throw new Error('Only editable slab sections can be deleted.');
  if(r.sectionSizes.length<=1)throw new Error('A slab must keep at least one section.');
  const old=kitchenState(root),next={version:1,sectionSizes:old.sectionSizes.filter((_,n)=>n!==i),cabinets:{}};
  old.sectionSizes.forEach((_,n)=>{if(n!==i){const target=n>i?n-1:n;const state=old.cabinets[`bay-${n+1}`];if(state)next.cabinets[`bay-${target+1}`]=state;}});
  return applyKitchenState(root,next,{strict:false});
}
export function syncKitchenRecord(root,record) {
  const r=registry.get(root);record.kitchen=kitchenState(root);
  if(!r?.sectionSizes)return;
  const width=r.sectionSizes.reduce((n,s)=>n+s.width,0)*root.scale.x,depth=Math.max(...r.sectionSizes.map(s=>s.depth))*root.scale.z,height=Math.max(...r.sectionSizes.map(s=>s.height))*root.scale.y;
  record.bbox={x1:root.position.x-width/2,x2:root.position.x+width/2,y1:root.position.z-depth/2,y2:root.position.z+depth/2};
  record.objectHeightM=height;record.rotationY=root.rotation.y;record.elevation=root.position.y;
}
export function accessoryModel(root,id){return registry.get(root)?.models.get(id);}
export function setKitchenCutaway(root,value){const r=registry.get(root);if(!r)return;r.cutaway=!!value;applyKitchenState(root,r.state);}
export function kitchenCutaway(root){return registry.get(root)?.cutaway||false;}
export function newAccessory(productId) {const p=PRODUCT_BY_ID.get(productId);if(!p)throw new Error('Unknown accessory.');return {id:THREE.MathUtils.generateUUID(),productModelId:p.id,openingState:0,laminateMode:'INHERIT'};}

function obstacleBox(o){return new THREE.Box3(new THREE.Vector3(o.x-o.w/2,o.y-o.h/2,o.z-o.d/2),new THREE.Vector3(o.x+o.w/2,o.y+o.h/2,o.z+o.d/2));}
function meshOBB(mesh,inset=0) {
  const geometry=mesh.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();
  const bounds=geometry.boundingBox,center=bounds.getCenter(new THREE.Vector3());
  const result=new OBB(new THREE.Vector3(),bounds.getSize(new THREE.Vector3()).multiplyScalar(.5));
  result.applyMatrix4(mesh.matrixWorld);
  // Three r160's OBB.applyMatrix4 transforms axes and adds translation, but
  // does not rotate/scale an off-centre geometry's local bounding-box centre.
  result.center.copy(center.applyMatrix4(mesh.matrixWorld));
  // Mirrored door leaves have a negative determinant; extents stay positive.
  result.halfSize.set(Math.abs(result.halfSize.x),Math.abs(result.halfSize.y),Math.abs(result.halfSize.z));
  result.halfSize.addScalar(-inset).max(new THREE.Vector3());
  return result;
}
function externalParts(objects,root) {
  const parts=[],seen=new Set();
  for(const object of objects){
    if(object===root||object.userData?.isHelper||!object.visible)continue;
    object.updateWorldMatrix(true,true);
    object.traverseVisible(node=>{
      if(!node.isMesh||!node.geometry||node.userData.isHelper||node.userData.isInteractionProxy||seen.has(node))return;
      seen.add(node);
      const label=node.userData.kitchenObstacleLabel||object.userData.objectType||((object.userData.isWall||object.userData.type==='wall')?'wall':'nearby object');
      parts.push({obb:meshOBB(node),label});
    });
  }
  return parts;
}
export function kitchenStructureProblem(root,{obstacles=[]}={}) {
  root.updateWorldMatrix(true,true);const external=externalParts(obstacles,root);let reason=null;
  root.traverse(n=>{if(reason||!n.isMesh||!(/^carcass-|^cabinet-(countertop|plinth)$/.test(n.name)||(n.name==='cabinet-body'&&n.visible)))return;
    const bounds=meshOBB(n,.0005);for(const o of external)if(bounds.intersectsOBB(o.obb)){reason=`The resized section overlaps ${o.label}. Choose a smaller size or move the slab.`;break;}
  });return reason;
}
// Conservative sampled swept bounds. This rejects uncertain paths rather than
// promising a precise CAD collision solution. Checks both opening and closing.
export function motionProblem(root,id,to,{obstacles=[],tier=null}={}) {
  const r=registry.get(root),model=r?.models.get(id),c=cabinetList(root).find(c=>c.id===id);if(!model||!c?.accessory)return 'Install a compatible accessory first.';
  const data=model.userData.kitchenModel,p=data.product,original=data.moving.map(n=>({position:n.position.clone(),rotation:n.rotation.clone()})),slidePositions=data.slides.map(n=>n.position.clone());
  const originalProgress=model.userData.openProgress;
  const current=p.category==='corner'?[originalProgress]:data.moving.filter((n,i)=>tier===null||i===tier).map(n=>n.position.z/p.travel);
  const from=Math.min(...current),maxFrom=Math.max(...current),start=Math.min(from,to),end=Math.max(maxFrom,to);
  root.updateWorldMatrix(true,true);
  const external=externalParts(obstacles,root);
  // Other installed mechanisms can move beyond their parent's closed footprint.
  for(const [otherId,other] of r.models)if(otherId!==id)for(const n of other.userData.kitchenModel.moving)external.push(...externalParts([n],root).map(o=>({...o,label:'another open accessory'})));
  const internal=(c.obstructions||[]).map(o=>{const b=obstacleBox(o);b.translate(new THREE.Vector3(c.x,c.y,c.z));b.applyMatrix4(r.assembly.matrixWorld);return {box:b,label:o.label||'internal obstruction'};});
  const structural=[];
  // Keep bounds aligned with each panel, even for slightly rotated tracer
  // objects. World-axis boxes overlap across a clear door-to-carcass seam.
  // Cutaway hides panels visually; they must still block real intersections.
  root.traverse(n=>{if(n.isMesh&&/^(basin|basin-interior|drain|glass-hob)$/.test(n.userData.fixturePart||''))structural.push({obb:meshOBB(n),label:n.userData.fixturePart});});
  r.assembly.traverse(n=>{if(n.isMesh&&/^(carcass-|cabinet-partition|retained-lower-front|blind-corner-front)/.test(n.name))structural.push({obb:meshOBB(n,.0002),label:n.name});});
  for(const f of r.fronts)if(f.id!==id&&f.node?.visible)f.node.traverseVisible(n=>{if(n.isMesh)structural.push({obb:meshOBB(n),label:'adjacent cabinet door'});});
  let reason=null;
  try{
    for(let i=0;i<=40&&!reason;i++){
      setAccessoryPose(model,start+(end-start)*i/40,tier);root.updateMatrixWorld(true);
      for(const [index,moving] of data.moving.entries()){
        if(tier!==null&&p.category==='wicker'&&index!==tier)continue;
        const bounds=new THREE.Box3().setFromObject(moving).expandByScalar(.004);
        // A tall front plus a low bin encloses empty space beneath the sink.
        // Test actual moving meshes, not that combined empty envelope.
        for(const o of internal){
          if(!bounds.intersectsBox(o.box))continue;
          moving.traverse(n=>{if(!reason&&n.isMesh&&meshOBB(n).intersectsOBB(new OBB().fromBox3(o.box)))reason=`Movement blocked by ${o.label}. Move the obstruction or choose another cabinet.`;});
          if(reason)break;
        }
        if(!reason)moving.traverse(n=>{
          if(reason||!n.isMesh)return;
          const obb=meshOBB(n);
          for(const o of external)if(obb.intersectsOBB(o.obb)){reason=`Movement blocked by ${o.label}. Check the opening direction and clearance.`;break;}
        });
        if(!reason)moving.traverse(n=>{if(reason||!n.isMesh)return;const bounds=meshOBB(n,.0002);for(const o of structural)if(bounds.intersectsOBB(o.obb)){reason=`Movement blocked by ${o.label}. Check the opening and corner handedness.`;break;}});
      }
      for(const link of data.links)for(const n of [link.arm,link.cross]){
        const bounds=new THREE.Box3().setFromObject(n).expandByScalar(-.0002);
        for(const o of internal)if(bounds.intersectsBox(o.box)){reason=`Corner support blocked by ${o.label}.`;break;}
        const supportBounds=meshOBB(n,.0002);for(const o of structural)if(supportBounds.intersectsOBB(o.obb)){reason=`Corner support blocked by ${o.label}.`;break;}
        const obb=meshOBB(n);for(const o of external)if(obb.intersectsOBB(o.obb)){reason=`Corner support blocked by ${o.label}.`;break;}
      }
    }
  }finally{if(p.category==='corner')setAccessoryPose(model,originalProgress);data.moving.forEach((n,i)=>{n.position.copy(original[i].position);n.rotation.copy(original[i].rotation);});data.slides.forEach((n,i)=>n.position.copy(slidePositions[i]));root.updateMatrixWorld(true);}
  return reason;
}
export function operateAccessory(root,id,value,{obstacles=[],tier=null,immediate=false}={}) {
  const r=registry.get(root),model=r?.models.get(id);if(!model)throw new Error('No installed accessory in this cabinet.');
  const to=clampOpen(value),reason=motionProblem(root,id,to,{obstacles,tier});if(reason)throw new Error(reason);
  const a=r.state.cabinets[id].accessory,p=model.userData.kitchenModel.product;
  const nodes=model.userData.kitchenModel.moving;
  if(p.category==='corner'){if(immediate){r.anim.delete(id);setAccessoryPose(model,to);}else r.anim.set(id,{id,from:model.userData.openProgress,to,tier:null,elapsed:0});}
  else nodes.forEach((n,i)=>{if(tier===null||tier===i){if(immediate){r.anim.delete(`${id}:${i}`);setAccessoryPose(model,to,i);}else r.anim.set(`${id}:${i}`,{id,from:n.position.z/p.travel,to,tier:i,elapsed:0});}});
  a.openingState=to;if(p.category==='wicker'){a.tierStates=a.tierStates.map((t,i)=>tier===null||i===tier?to:t);a.openingState=Math.max(...a.tierStates);}
  root.userData.kitchen=clone(r.state);return kitchenState(root);
}
export function tickKitchen(root,delta) {
  const r=registry.get(root);if(!r)return;
  // Keep fixed-size hardware fixed if an existing editor resizes its parent.
  if(r.assembly&&['x','y','z'].some(k=>Math.abs(r.assembly.scale[k]*root.scale[k]-1)>1e-6))applyKitchenState(root,r.state);
  for(const [key,a] of r.anim){const model=r.models.get(a.id);if(!model){r.anim.delete(key);continue;}a.elapsed+=Math.min(delta,.1);const t=Math.min(1,a.elapsed/.85),ease=t*t*(3-2*t);
    setAccessoryPose(model,a.from+(a.to-a.from)*ease,a.tier);
    if(t===1)r.anim.delete(key);
  }
}
