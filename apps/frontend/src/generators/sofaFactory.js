import { addSofaBedMechanism } from './sofaBed.js';
import { createSofaMaterials, addUpholsteredSeat } from './sofaUpholstery.js';
import { sofaDesign } from './sofaDesigns.js';
import { createTwinWoodCorner19 } from './twinWoodCorner19.js';
import { sofaSetLayout } from './sofaSetLayout.js';
import { addSharedSofaCorner } from './sofaSharedCorner.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import products from './sofaFactoryCatalog.json' with { type: 'json' };
export const SOFA_FACTORY_CATALOG = products.map(p=>p.setSeats?{...p,w:sofaSetLayout(p).width,d:sofaSetLayout(p).depth}:p);
const byId = new Map(SOFA_FACTORY_CATALOG.map(p => [p.id, p]));

// Dimensioned, reference-based furniture. Product photographs remain separate
// from these editable approximations; upholstery swatches come from the photos.
export function createSofaFactoryFurniture(id, width, depth) {
  const s = byId.get(id); if (!s) return null;
  if(id==='sf-sofas-p18-19')return createTwinWoodCorner19(width,depth);
  return createSofaProduct(s,width,depth);
}

export function createSofaProduct(s,width=s.w,depth=s.d,profile=sofaDesign(s.id)) {
  const id=s.id,root = new THREE.Group(), name = s.label.toLowerCase(), design = profile;
  const fabric = new THREE.MeshStandardMaterial({color:s.color,roughness:.92});
  const wood = new THREE.MeshStandardMaterial({color:0x62432f,roughness:.65});
  const metal = new THREE.MeshStandardMaterial({color:0xb99b62,metalness:.75,roughness:.3});
  const pale = new THREE.MeshStandardMaterial({color:0xe5dfd4,roughness:.7});
  const box = (parent,w,h,d,x,y,z,mat=fabric,r=.035) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/4,h/4,d/4)),mat);
    mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const leg = (parent,x,z,h=.16) => box(parent,.055,h,.055,x,h/2,z,wood,.008);
  const basicSeat = (parent,w,d,h,count=1,wooden=false,recliner=false) => {
    const frame=wooden?wood:fabric, cushionH=.15, seatY=Math.min(.48,h*.52);
    box(parent,w,.16,d,0,seatY-.17,0,frame);
    for(const x of [-w*.4,w*.4])for(const z of [-d*.36,d*.36])leg(parent,x,z,Math.max(.08,seatY-.25));
    const arm=.12, sw=(w-arm*2)/count;
    for(let i=0;i<count;i++){
      const x=-w/2+arm+sw*(i+.5);
      box(parent,sw-.025,cushionH,d*.76,x,seatY-.025,d*.06);
      const back=box(parent,sw-.025,h-seatY,d*.16,x,(h+seatY)/2,-d*.36);
      back.rotation.x=-.07;
      if(recliner) box(parent,sw*.8,.17,.22,x,seatY-.13,d*.47);
      if(/chester|button|tuft|diamond|camel|royal|vintage/.test(name)){
        for(let row=0;row<2;row++)for(let col=0;col<3;col++)box(parent,.025,.025,.015,x+(col-1)*sw*.24,seatY+.13+row*.14,-d*.265,wood,.01);
      }
      if(count>1&&!recliner){const pillow=box(parent,sw*.38,.28,.13,x,seatY+.19,-d*.13,pale,.055);pillow.rotation.z=(i%2?1:-1)*.12;}
    }
    for(const x of [-1,1]){
      box(parent,arm,.22,d*.93,x*(w-arm)/2,seatY+.1,0,frame);
      if(wooden)for(let i=0;i<4;i++)box(parent,.035,.25,.035,x*(w-arm)/2,seatY-.04,-d*.3+i*d*.2,wood,.005);
    }
  };
  const sofaCategory=['sofas','economic-sofas','sofa-beds','recliners','wooden-sofas'].includes(s.category);
  const upholstery=sofaCategory?createSofaMaterials(s,design):null;
  const seat=(parent,w,d,h,count=1,wooden=false,recliner=false,options={})=>sofaCategory
    ? addUpholsteredSeat(parent,w,d,h,count,upholstery,options)
    : basicSeat(parent,w,d,h,count,wooden,recliner);
  const cat=s.category;
  if(cat.includes('dining') || cat.includes('center')){
    const dining=cat.includes('dining'),glass=cat.includes('glass');
    const topMat=glass?new THREE.MeshPhysicalMaterial({color:0xc3dedb,transparent:true,opacity:.5,roughness:.12,metalness:.05}):pale;
    const tw=s.productWidth || s.w,td=s.productDepth || s.d,th=s.h;
    const round = /double/.test(name) && !dining;
    const top=(w,d,x,y,z)=>{
      if(!round)return box(root,w,.055,d,x,y,z,topMat,.018);
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.055,48),topMat);mesh.scale.set(w,1,d);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    };
    top(tw,td,0,th-.0275,0);
    if(/nest|double/.test(name)){
      top(tw*.65,td*.65,tw*.35,th*.72,td*.35);
      for(const x of [-1,1])for(const z of [-1,1])box(root,.035,th*.7,.035,tw*.35+x*tw*.25,th*.35,td*.35+z*td*.25,metal,.004);
    }
    if(/shelf|121|122|123|124|125|126|127|square/.test(name)&&!dining){
      box(root,tw*.95,th*.6,td*.88,0,th*.38,0,wood);
      box(root,tw*.86,th*.22,.018,0,th*.45,td*.45,pale);
    }else for(const x of [-1,1])for(const z of [-1,1])box(root,.065,th-.055,.065,x*tw*.4,(th-.055)/2,z*td*.4,glass?wood:metal,.01);
    if(dining){
      const count=/4\s*\+/.test(name)?4:6;
      for(let i=0;i<count;i++){
        const chair=new THREE.Group();seat(chair,.46,.5,.9,1,true);
        if(i<count-2){const side=i%2?1:-1;chair.position.set((Math.floor(i/2)-(count-4)/4)*tw*.5,0,side*(td/2+.34));if(side>0)chair.rotation.y=Math.PI;}
        else {const side=i===count-2?-1:1;chair.position.set(side*(tw/2+.34),0,0);chair.rotation.y=side*Math.PI/2;}
        root.add(chair);
      }
    }
  } else if(cat==='pouffes'){
    box(root,s.w,s.h*.75,s.d,0,s.h*.625,0);
    for(const x of [-s.w*.35,s.w*.35])for(const z of [-s.d*.35,s.d*.35])leg(root,x,z,s.h*.25);
    if(/back|chair/.test(name))box(root,s.w,s.h*.4,.1,0,s.h,-s.d*.4);
  } else if(cat.includes('chairs')){
    seat(root,s.w,s.d,s.h,1,cat==='relaxing-chairs');
    if(cat==='relaxing-chairs')for(const x of [-s.w*.42,s.w*.42])box(root,.06,.05,s.d*1.1,x,.035,0,wood);
  } else if(design?.layout==='chaise'){
    const sd=s.seatingDepth,cw=Math.min(1.02,s.w*.35),mw=s.w-cw;
    const main=new THREE.Group();main.name='chaise-main';
    seat(main,mw,sd,s.h,design.mainSeats,false,false,{openLeft:true,backCount:design.mainBacks||design.mainSeats});
    main.position.set(cw/2,0,-(s.d-sd)/2);root.add(main);
    const chaise=new THREE.Group();chaise.name='chaise-extension';
    seat(chaise,cw,s.d,s.h,1,false,false,{openLeft:!!design.sideShelf,openRight:true,backCount:design.wingBacks||1,pillowCount:Math.min(1,design.pillows),shortArmDepth:sd});
    chaise.position.x=-(s.w-cw)/2;root.add(chaise);
    if(design.chaiseSide==='right')for(const child of root.children){child.position.x*=-1;child.scale.x*=-1;}
  } else if(design?.layout==='corner'||(!design&&s.corner)){
    const sd=s.seatingDepth,count=design?.mainSeats||2;
    const main=new THREE.Group();main.name='corner-main';
    seat(main,s.w-sd,sd,s.h,count,false,false,{openLeft:true,backCount:design?.mainBacks||count});
    main.position.set(sd/2,0,-(s.d-sd)/2);root.add(main);
    const wing=new THREE.Group(),length=s.d-sd;wing.name='corner-return';
    seat(wing,length,sd,s.h,design?.wingSeats||2,false,false,{openRight:true,backCount:design?.wingBacks||design?.wingSeats||2,pillowCount:0});
    wing.rotation.y=Math.PI/2;wing.position.set(-(s.w-sd)/2,0,sd/2);root.add(wing);
    addSharedSofaCorner(root,sd,s.h,upholstery,-(s.w-sd)/2,-(s.d-sd)/2);
    if(design?.cornerSide==='right')for(const child of root.children){child.position.x*=-1;child.scale.x*=-1;}
  } else if(design?.layout==='set'||s.setSeats?.length){
    const arrangement=sofaSetLayout(s);
    for(const part of arrangement.parts){
      const {width:cw,depth:cd,height:ch,index:i}=part;
      const component=new THREE.Group();component.name=part.diwan?'separate-diwan':`set-component-${i}`;
      const componentProfile={...design,...(part.diwan?{back:'none',seat:'bench',pillows:2}:{})};
      const panels=i===0?design.mainSeats:i===1?design.wingSeats:(s.setSeats?.[i]||1);
      addUpholsteredSeat(component,cw,cd,ch,panels,{...upholstery,profile:componentProfile},
        {backCount:i===0?design.mainBacks:i===1?design.wingBacks:1,pillowCount:Math.min(design.pillows||0,panels+1)});
      // Fit each piece separately, including cushion loft and feet. Grouping
      // must not change the manufacturer's three-seat/chair dimensions.
      component.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(component),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      for(const child of component.children){child.position.x-=center.x;child.position.z-=center.z;child.position.y-=bounds.min.y;}
      component.scale.set(cw/size.x,ch/size.y,cd/size.z);
      component.userData.catalogueDimensions={width:cw,depth:cd,height:ch,inferred:!!part.diwan};
      component.position.set(part.x,0,part.z);component.rotation.y=part.yaw;root.add(component);
    }
  } else {
    seat(root,s.w,s.d,s.h,design?.mainSeats||Math.max(1,Math.round(s.w/.72)),cat==='wooden-sofas',cat==='recliners',{backCount:design?.mainBacks});
  }
  // Normalize footprint to the chosen placement dimensions, keeping floor contact.
  root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  for(const child of root.children){child.position.x-=center.x;child.position.z-=center.z;child.position.y-=bounds.min.y;}
  root.scale.set(width/size.x,sofaCategory?s.h/size.y:1,depth/size.z);
  root.userData={sofaFactoryProduct:id,sourcePage:s.page,referenceApproximation:true,referenceAudit:s.referenceAudit,dimensions:{width,depth,height:s.h},sofaDesign:design?{id,layout:design.layout,observed:design.observed}:undefined};
  if(s.category==='sofa-beds'||/cum bed/i.test(s.label)) {
    addSofaBedMechanism(root,size.x,size.z,size.y,upholstery.fabric);
  }
  return root;
}
