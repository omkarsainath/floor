import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function validateSectionSizes(sizes) {
  if(!Array.isArray(sizes)||sizes.length<1||sizes.length>12)throw new Error('The cabinet needs between one and twelve sections.');
  return sizes.map(s=>Object.fromEntries(['width','height','depth'].map(k=>{
    if(!Number.isFinite(s?.[k])||s[k]<.15||s[k]>5)throw new Error(`Section ${k} must be between 150 and 5000 mm.`);
    return [k,s[k]];
  })));
}

export function fitSectionSizes(width,height,depth,saved) {
  if(!saved)return Array.from({length:3},()=>({width:width/3,height,depth}));
  const sizes=validateSectionSizes(saved),w=sizes.reduce((sum,s)=>sum+s.width,0),h=Math.max(...sizes.map(s=>s.height)),d=Math.max(...sizes.map(s=>s.depth));
  const ratio=(target,current)=>Math.abs(target-current)<1e-8?1:target/current;
  return sizes.map(s=>({width:s.width*ratio(width,w),height:s.height*ratio(height,h),depth:s.depth*ratio(depth,d)}));
}

// Each module has its own bounds; unequal heights/depths form a stepped slab.
export function buildSectionGeometry(root,input) {
  const sectionSizes=validateSectionSizes(input),width=sectionSizes.reduce((sum,s)=>sum+s.width,0),depth=Math.max(...sectionSizes.map(s=>s.depth));
  const mat=(color,roughness=.5,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const bodyMat=mat(0xeee9e1,.58),frontMat=mat(0x4e7fa8,.5,.05),handleMat=mat(0xe0e0e0,.2,.8),counterMat=mat(0x68625c,.3,.12),plinthMat=mat(0x272b2e,.6);
  const add=(parent,w,h,d,x,y,z,material,name)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.name=name;m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
  const fronts=[],bayBounds=[],bodies=[];let left=-width/2;
  sectionSizes.forEach((s,i)=>{
    const base=.10,top=s.height-.05,bodyH=top-base,cx=left+s.width/2,back=-depth/2,front=back+s.depth;
    if(bodyH<=.006)throw new Error('Section height must leave space above the plinth.');
    const geometry=new THREE.BoxGeometry(s.width,bodyH,s.depth);geometry.translate(cx,base+bodyH/2,back+s.depth/2);bodies.push(geometry);
    bayBounds.push({min:new THREE.Vector3(left,base,back),max:new THREE.Vector3(left+s.width,top,front)});
    add(root,s.width,.10,Math.max(.01,s.depth-.08),cx,.05,back+(s.depth-.08)/2,plinthMat,'cabinet-plinth');
    const marginLeft=i===0?.01:0,marginRight=i===sectionSizes.length-1?.01:0;
    const counter=add(root,s.width+marginLeft+marginRight,.05,s.depth+.02,cx+(marginRight-marginLeft)/2,s.height-.025,back+s.depth/2+.01,counterMat,'cabinet-countertop');
    counter.userData.kitchenBay=`bay-${i+1}`;
    const w=s.width-.006,fh=bodyH-.006,pivot=new THREE.Group();pivot.position.set(left+.003,base+bodyH/2,front+.012);
    Object.assign(pivot.userData,{isFurnitureDoor:true,doorOpen:false,doorSwing:-Math.PI/2});root.add(pivot);
    add(pivot,w,fh,.02,w/2,0,0,frontMat,'cabinet-front');add(pivot,w*.55,.025,.03,w/2,fh*.35,.03,handleMat,'cabinet-handle');fronts.push(pivot);
    left+=s.width;
  });
  const body=new THREE.Mesh(mergeGeometries(bodies),bodyMat);body.name='cabinet-body';body.castShadow=body.receiveShadow=true;root.add(body);bodies.forEach(g=>g.dispose());
  return {body,fronts,bayBounds,sectionSizes,width,depth,rebuild:buildSectionGeometry};
}
