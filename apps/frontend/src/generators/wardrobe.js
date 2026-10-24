import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { initializeWardrobeFinishes } from './wardrobeFinishes.js';
import { createLaminateMaterial } from '../materials/greenlam.js';
import { createConfiguredWardrobe } from './configuredWardrobe.js';
import { coverWardrobeFronts } from './wardrobeFronts.js';

// Stable class IDs are saved with the layout; keep the original reference
// models as well as the compact, explicitly counted variants.
export const WARDROBE_CATALOG = [
  { id: 'wardrobe', label: 'Hinged · No Loft', icon: '🚪', w: 2.60, d: .60 },
  { id: 'wardrobe-loft', label: 'Hinged · Loft + Mirror', icon: '🪞', w: 2.40, d: .60 },
  { id: 'wardrobe-sliding', label: 'Sliding · No Loft', icon: '↔️', w: 2.40, d: .65 },
  { id: 'wardrobe-sliding-loft', label: 'Sliding · With Loft', icon: '↔️', w: 2.40, d: .65 },
  ...[1,2,3].flatMap(count => [false,true].map(loft => ({
    id: `wardrobe-${count}${loft ? '-loft' : ''}`,
    label: `${['Single','Double','Triple'][count-1]} Hinged · ${loft ? 'Loft' : 'No Loft'}`,
    icon: '🚪', w: count*.6, d: .6, doorCount: count,
  }))),
  ...[2,3].flatMap(count => [false,true].map(loft => ({
    id: `wardrobe-sliding-${count}${loft ? '-loft' : ''}`,
    label: `${count}-Panel Sliding · ${loft ? 'Loft' : 'No Loft'}`,
    icon: '↔️', w: count*.7, d: .65, doorCount: count,
  }))),
];
export const WARDROBE_TYPES = WARDROBE_CATALOG.map(item=>item.id);
export const LOFT_CATALOG = ['teal-oak','charcoal-walnut'].flatMap(finish => [1,2,3].map(count => ({
  id: `loft-${finish}-${count}`, label: `${count}-Door Loft · ${finish==='teal-oak'?'Teal & Oak':'Charcoal & Walnut'}`,
  icon:'🗄️', w:count*.6, d:.6, doorCount:count, finish, elevation:2.2, wallAttached:true,
})));

// Local +Z is the front. Each moving assembly owns its panel, handle and tray;
// the carcass is hollow so opening a front actually exposes storage.
export function createWardrobe(type, width, depth, options = {}) {
  const standalone = LOFT_CATALOG.find(item=>item.id===type);
  if (!standalone && !WARDROBE_TYPES.includes(type)) return null;
  if(options.wardrobeConfig)return createConfiguredWardrobe(type,options.wardrobeConfig,options);
  const count = (standalone || WARDROBE_CATALOG.find(item=>item.id===type)).doorCount;
  const loft = standalone ? standalone.finish==='teal-oak' : type.includes('loft'), sliding = type.includes('sliding');
  const w = Math.max(.45, width), d = Math.max(.28, depth);
  const h = standalone ? .6 : loft ? 2.7 : 2.2, base = .08, mainTop = loft ? 2.12 : h;
  const t = Math.min(.022, w/35, d/18), gap = .004;
  const root = new THREE.Group();
  root.userData.isWardrobe = true;
  root.userData.wardrobeVariant = type;
  if(options.wardrobeAttachment)root.userData.wardrobeAttachment={...options.wardrobeAttachment};
  root.userData.nominalHeight = h;
  if (count) root.userData.doorCount = count;
  const material = (color, roughness=.6, metalness=0) => new THREE.MeshStandardMaterial({color,roughness,metalness});
  // Catalogue grain on the interior and shelf edges as well as the fronts.
  // The material factory supplies a sampled-colour fallback in Node/offline.
  const wood=createLaminateMaterial({laminateId:loft?'gl-5106-brl':'gl-608-brl'},w,h);
  const front=material(loft?0x233f4d:0x34383b,.48);
  const inner=material(0xd2b994,.72), metal=material(0x27282a,.3,.65);
  const mirror=material(0xb5c6cb,.08,.88);
  const box=(name,sx,sy,sz,x,y,z,mat=wood,parent=root)=>{
    const mesh=new THREE.Mesh(new RoundedBoxGeometry(sx,sy,sz,1,Math.min(.0012,sx/8,sy/8,sz/8)),mat);
    mesh.name=name; mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true;
    mesh.userData.panelSize=[sx,sy,sz];
    mesh.userData.defaultLaminate=mat===wood?(loft?'gl-5106-brl':'gl-608-brl'):(loft?'gl-467-sat':'gl-401-sat');
    parent.add(mesh); return mesh;
  };
  const moving=(name,part,prop,closed,open,x,y,z)=>{
    const node=new THREE.Group(); node.name=name; node.position.set(x,y,z);
    node.userData={_animType:'wardrobe',_animProp:prop,_closedState:closed,_openState:open,_animOpen:false,
      wardrobePart:part};
    root.add(node); return node;
  };
  const door=(name,left,right,bottom,top,mat=front,side=1,part='doors')=>{
    const dw=right-left-gap, dh=top-bottom-gap;
    const pivot=moving(name,part,'ry',0,-side*Math.PI/2,side===1?left:right,(bottom+top)/2,d/2+t/2);
    box('door-front',dw,dh,t,side*dw/2,0,0,mat,pivot);
    box('door-handle',.016,Math.min(.65,dh*.4),.032,side*(dw-Math.min(.05,dw*.15)),0,.028,metal,pivot);
    // Pull stand-offs and concealed-hinge plates become visible when opened.
    for(const y of [-1,1]) {
      box('handle-mount',.022,.018,.018,side*(dw-Math.min(.05,dw*.15)),y*Math.min(.27,dh*.16),.015,metal,pivot);
      box('hinge-plate',.035,.065,.006,side*.024,y*(dh/2-Math.min(.13,dh*.22)),-t/2-.004,metal,pivot);
      box('hinge-arm',.054,.022,.012,side*.012,y*(dh/2-Math.min(.13,dh*.22)),-t/2-.013,metal,pivot);
    }
    return pivot;
  };
  if (standalone) {
    root.userData.isStandaloneLoft = true;
    box('loft-back',w-2*t,h-2*t,t,0,h/2,-d/2+t/2);
    box('loft-top',w,t,d,0,h-t/2,0);
    box('loft-bottom',w,t,d,0,t/2,0);
    for(const x of [-w/2+t/2,w/2-t/2])box('loft-side',t,h-2*t,d,x,h/2,0);
    const left=-w/2+t,bay=(w-2*t)/count;
    for(let i=0;i<count;i++) {
      if(i)box('loft-divider',t,h-2*t,d-2*t,left+i*bay,h/2,0,inner);
      door(`loft-leaf-${i+1}`,left+i*bay,left+(i+1)*bay,t,h-t,i===count-1&&count>1?wood:front,i%2?-1:1,'loft');
    }
    mirror.dispose();
    if(count===1)inner.dispose();
    coverWardrobeFronts(root,{width:w,height:h,bottom:0});
    return initializeWardrobeFinishes(root,options);
  }
  const shelf=(left,right,y)=>box('shelf',right-left,t,d-2*t,(left+right)/2,y,0,inner);
  const partition=(x,top=mainTop)=>box('divider',t,top-base,d-2*t,x,(top+base)/2,0,inner);
  const drawers=(left,right,count,top)=>{
    const dh=(top-base)/count, dw=right-left-2*gap, trayDepth=d*.72;
    shelf(left,right,top);
    for(let i=0;i<count;i++) {
      const y=base+dh*(i+.5);
      const drawer=moving(`drawer-${i+1}`,'drawers','pz',0,d*.65,0,0,0);
      box('drawer-front',dw,dh-gap,t,(left+right)/2,y,d/2+t/2,loft?front:wood,drawer);
      box('drawer-handle',dw*.5,.016,.034,(left+right)/2,y,d/2+.044,metal,drawer);
      const bottom=y-dh/2+t*1.5, trayH=dh*.64;
      box('drawer-bottom',dw-2*t,t,trayDepth,(left+right)/2,bottom,d/2-trayDepth/2,inner,drawer);
      for(const x of [left+t,right-t]) box('drawer-side',t,trayH,trayDepth,x,bottom+trayH/2,d/2-trayDepth/2,inner,drawer);
      box('drawer-back',dw-2*t,trayH,t,(left+right)/2,bottom+trayH/2,d/2-trayDepth,inner,drawer);
    }
  };
  const storage=(left,right,bottom=base)=>{
    shelf(left,right,mainTop-.25);
    const rail=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,right-left-2*t,12),metal);
    rail.name='hanging-rail'; rail.rotation.z=Math.PI/2;
    rail.position.set((left+right)/2,mainTop-.38,0);root.add(rail);
    shelf(left,right,bottom+.27);
  };
  box('plinth',w-.028,base,d-.035,0,base/2,-.0175,front);
  box('back',w-2*t,h-base-2*t,t,0,(h+base)/2,-d/2+t/2,wood);
  for(const x of [-w/2+t/2,w/2-t/2]) box('side',t,h-base-2*t,d,x,(h+base)/2,0);
  shelf(-w/2,w/2,base+t/2);
  box('top',w,t,d,0,h-t/2,0);
  const left=-w/2+t,right=w/2-t;
  if(count) {
    // Count refers to main doors, not loft fronts or drawers. Keep drawers
    // beneath the door zone so they can open even with every door closed.
    const bay=(right-left)/count, drawerTop=.57, doorBottom=drawerTop+.025;
    for(let i=0;i<count;i++) {
      const a=left+i*bay, b=a+bay;
      if(i) partition(a);
      drawers(a+t,b-t,2,drawerTop);
      storage(a+t,b-t,doorBottom);
      if(!sliding) door(`main-leaf-${i+1}`,a,b,doorBottom,mainTop,
        count===3&&i===2?wood:front,i===count-1&&count>1?-1:1);
    }
    if(sliding) {
      const panelW=(right-left)/count+.012;
      const step=(right-left-panelW)/(count-1);
      for(let i=0;i<count;i++) {
        const x=left+panelW/2+i*step;
        // Two leaves overlap centrally; three stack at the right on three
        // distinct tracks, exposing two thirds of the storage frontage.
        const openX=count===2?(left+right)/2:right-panelW/2;
        const node=moving(`sliding-leaf-${i+1}`,'doors','px',x,openX,x,
          (mainTop+doorBottom)/2,d/2+.02+i*.06);
        // The stacking-side leaf can still be slid left when clicked alone.
        if(count===3&&i===count-1) node.userData._individualOpenState=left+panelW/2;
        box('sliding-front',panelW,mainTop-doorBottom-gap,t,0,0,0,i%2?wood:front,node);
        box('sliding-handle',.018,.55,.024,-panelW/2+.04,0,.024,metal,node);
      }
      const trackDepth=.06*count;
      for(const y of [doorBottom+.01,mainTop-.015]) box('sliding-track',right-left,.018,trackDepth,
        (left+right)/2,y,d/2+.02+(count-1)*.03,metal);
    }
  } else if(sliding) {
    // Drawers are in an exposed side bay, so they never pass through a closed
    // sliding panel. The two leaves run on different depth tracks.
    const split=left+(right-left)*.72;
    partition(split); storage(left,split);
    const bay=split-left, panelW=bay/2+.012;
    for(let i=0;i<2;i++) {
      const x=left+panelW/2+i*(bay-panelW);
      // Leaves overlap in the centre when opened together; swapping their
      // end positions would leave the whole cabinet visually closed.
      const node=moving(`sliding-leaf-${i+1}`,'doors','px',x,left+bay/2,x,(mainTop+base)/2,d/2+.02+i*.06);
      box('sliding-front',panelW,mainTop-base-.025,t,0,0,0,i?wood:front,node);
      box('sliding-handle',.018,.55,.024,(i?1:-1)*(panelW/2-.04),0,.024,metal,node);
    }
    for(const y of [base+.014,mainTop-.015]) box('sliding-track',bay,.018,.12,(left+split)/2,y,d/2+.05,metal);
    drawers(split+t,right,3,.78);
    shelf(split+t,right,1.2); shelf(split+t,right,1.65);
  } else if(loft) {
    // Reference 2: three tall leaves beside an open dressing/mirror bay.
    const bay=(right-left)/4, split=left+3*bay;
    partition(left+2*bay); partition(split);
    storage(left,left+2*bay);storage(left+2*bay,split);
    for(let i=0;i<3;i++) door(`main-leaf-${i+1}`,left+i*bay,left+(i+1)*bay,base,mainTop,i===2?wood:front,i===1?-1:1);
    drawers(split+t,right,2,.8);
    box('dressing-counter',right-split,.035,d,(right+split)/2,.83,0);
    box('mirror-frame',bay*.85,1.04,.025,(right+split)/2,1.43,-d/2+.035,wood);
    box('dressing-mirror',bay*.75,.94,.01,(right+split)/2,1.43,-d/2+.052,mirror);
  } else {
    // Reference 1: charcoal door pairs with a wood centre and three drawers.
    const bay=(right-left)/5, midL=left+2*bay, midR=left+3*bay;
    partition(midL);partition(midR);
    storage(left,midL);storage(midR,right);shelf(midL,midR,1.45);
    for(const i of [0,1,3,4]) door(`main-leaf-${i+1}`,left+i*bay,left+(i+1)*bay,base,mainTop,front,i===1||i===4?-1:1);
    drawers(midL+t,midR-t,3,.82);
    door('centre-leaf',midL,midR,.84,mainTop,wood);
  }
  if(loft) {
    box('loft-floor',w,t,d,0,mainTop,0);
    const loftCount=count||4, bay=(right-left)/loftCount;
    for(let i=0;i<loftCount;i++) {
      if(i) box('loft-divider',t,h-mainTop,d-2*t,left+i*bay,(h+mainTop)/2,0,inner);
      const side=count?(i===count-1&&count>1?-1:1):(i%2?-1:1);
      door(`loft-leaf-${i+1}`,left+i*bay,left+(i+1)*bay,mainTop+t,h-t,i<2?front:wood,side,'loft');
    }
  }
  coverWardrobeFronts(root,{width:w,height:h,splitHeight:loft?mainTop:null});
  return initializeWardrobeFinishes(root,options);
}
