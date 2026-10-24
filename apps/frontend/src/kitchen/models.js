import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cornerPose, clampOpen } from './catalog.js';

// Each assembly owns its resources; repeated wires are merged by material.
export function disposeAssembly(root) {
  const geometries=new Set(),materials=new Set();
  root.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])if(m&&!m.userData.kitchenBorrowed)materials.add(m);});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();
}
export function box(parent,w,h,d,x,y,z,material,name='') {
  const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,1,Math.min(.0015,w/4,h/4,d/4)),material);
  mesh.position.set(x,y,z);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function cylinder(parent,r,h,x,y,z,material,name='') {
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,20),material);mesh.position.set(x,y,z);mesh.name=name;mesh.castShadow=true;parent.add(mesh);return mesh;
}
function rods(parent,segments,material,r=.002) {
  const up=new THREE.Vector3(0,1,0),gs=[];
  for(const [a,b] of segments){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);if(delta.length()<1e-6)continue;
    const g=new THREE.CylinderGeometry(r,r,delta.length(),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up,delta.clone().normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray());gs.push(g);}
  if(!gs.length)return;
  const mesh=new THREE.Mesh(mergeGeometries(gs),material);gs.forEach(g=>g.dispose());mesh.name='rounded-wire-frame';mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function basket(parent,w,d,y,metal,base,{wicker=false}={}) {
  const h=wicker?.14:.075,seg=[];
  box(parent,w-.008,.006,d-.008,0,y,0,base,'basket-base');
  for(const level of [y+.014,y+h]){
    seg.push([[-w/2,level,-d/2],[w/2,level,-d/2]],[[w/2,level,-d/2],[w/2,level,d/2]],[[w/2,level,d/2],[-w/2,level,d/2]],[[-w/2,level,d/2],[-w/2,level,-d/2]]);
  }
  if(wicker){
    // Actual interlaced strands, alternating the crossing offset on each row.
    const step=.012;
    for(let row=0;row<10;row++)for(const side of [-1,1]){
      const yy=y+.015+row*.012;
      for(let x=-w/2;x<w/2-.003;x+=step){const j=Math.round((x+w/2)/step),z=side*(d/2+((j+row)%2?.0015:-.0015));seg.push([[x,yy,z],[Math.min(x+step,w/2),yy,side*(d/2+((j+row+1)%2?.0015:-.0015))]]);}
      for(let z=-d/2;z<d/2-.003;z+=step){const j=Math.round((z+d/2)/step),x=side*(w/2+((j+row)%2?.0015:-.0015));seg.push([[x,yy,z],[side*(w/2+((j+row+1)%2?.0015:-.0015)),yy,Math.min(z+step,d/2)]]);}
    }
    for(let x=-w/2;x<=w/2+.001;x+=step)for(const side of [-1,1])seg.push([[x,y,side*d/2],[x,y+h,side*d/2]]);
    for(let z=-d/2;z<=d/2+.001;z+=step)for(const side of [-1,1])seg.push([[side*w/2,y,z],[side*w/2,y+h,z]]);
  }else{
    for(let x=-w/2;x<=w/2+.001;x+=.028){seg.push([[x,y+.005,-d/2],[x,y+.005,d/2]]);for(const side of [-1,1])seg.push([[x,y+.014,side*d/2],[x,y+h,side*d/2]]);}
    for(let z=-d/2;z<=d/2+.001;z+=.035)for(const side of [-1,1])seg.push([[side*w/2,y+.014,z],[side*w/2,y+h,z]]);
  }
  rods(parent,seg,metal,wicker?.0018:.0017);
}
function bottle(parent,x,y,z,small,m) {
  const r=small?.022:.028,h=small?.075:.15;
  const profile=[[0,0],[r*.82,0],[r,.008],[r,h*.72],[r*.75,h*.82],[r*.43,h*.88],[r*.43,h],[0,h]].map(p=>new THREE.Vector2(...p));
  const mesh=new THREE.Mesh(new THREE.LatheGeometry(profile,20),small?m.jar:m.glass);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.name='bottle';parent.add(mesh);
  cylinder(parent,r*.45,.014,x,y+h+.007,z,m.cap,'bottle-cap');
  cylinder(parent,r*1.006,h*.3,x,y+h*.40,z,m.label,'paper-label');
}
function pot(parent,x,y,z,m) {
  const shape=[new THREE.Vector2(.001,0),new THREE.Vector2(.075,0),new THREE.Vector2(.082,.012),new THREE.Vector2(.083,.09),new THREE.Vector2(.078,.09),new THREE.Vector2(.076,.008),new THREE.Vector2(.001,.008)];
  const mesh=new THREE.Mesh(new THREE.LatheGeometry(shape,24),m.metal);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);
  for(const s of [-1,1])rods(parent,[[[x+s*.079,y+.07,z-.025],[x+s*.106,y+.07,z-.025]],[[x+s*.106,y+.07,z-.025],[x+s*.106,y+.07,z+.025]],[[x+s*.106,y+.07,z+.025],[x+s*.079,y+.07,z+.025]]],m.cap,.005);
}
function bin(parent,w,d,y,m,x=0) {
  const h=.29,t=.006;
  box(parent,w,.008,d,x,y+.004,0,m.bin,'bin-bottom');
  for(const s of [-1,1]){box(parent,t,h,d,x+s*(w-t)/2,y+h/2,0,m.bin,'bin-wall');box(parent,w,h,t,x,y+h/2,s*(d-t)/2,m.bin,'bin-wall');}
  rods(parent,[[[x-w/2,y+h,-d/2],[x+w/2,y+h,-d/2]],[[x+w/2,y+h,-d/2],[x+w/2,y+h,d/2]],[[x+w/2,y+h,d/2],[x-w/2,y+h,d/2]],[[x-w/2,y+h,d/2],[x-w/2,y+h,-d/2]]],m.cap,.006);
}
function cutlery(parent,w,d,y,m) {
  box(parent,w,.008,d,0,y,0,m.wood,'removable-tray');
  for(let i=0;i<=5;i++)box(parent,.006,.037,d,-w/2+i*w/5,y+.022,0,m.wood,'cutlery-divider');
  for(const z of [-d/2,d/2])box(parent,w,.037,.006,0,y+.022,z,m.wood);
  for(let i=0;i<5;i++)for(let j=0;j<3;j++){
    const x=-w/2+w/10+i*w/5+(j-1)*.014,z=-.05+j*.012;
    box(parent,.006,.004,.105,x,y+.012,z,m.metal,'utensil-handle');
    if(i<2){const bowl=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),m.metal);bowl.scale.set(.012,.003,.022);bowl.position.set(x,y+.014,z+.071);parent.add(bowl);}
    else if(i<4){box(parent,.014,.003,.018,x,y+.014,z+.06,m.metal);for(let t=0;t<4;t++)box(parent,.0018,.003,.025,x+(t-1.5)*.004,y+.014,z+.08,m.metal,'fork-tine');}
    else box(parent,.012,.003,.07,x+.003,y+.014,z+.085,m.metal,'knife-blade');
  }
}

export function createAccessoryModel(p,{frontMaterial,frontWidth=p.w+.04,frontHeight=p.h+.02,frontZ=p.d/2+.028,hand='left'}={}) {
  const root=new THREE.Group();root.name=p.name;const moving=[],slides=[],fronts=[],links=[];
  const standard=(color,roughness,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const m={metal:standard('#b9c3c6',.29,.92),track:standard('#89979c',.36,.84),cap:standard('#303438',.5),label:standard('#e9ddbd',.8),wood:standard('#c6a477',.69),wicker:standard('#b98b52',.87),bin:standard('#5c6567',.42),jar:standard('#c69345',.42),glass:new THREE.MeshPhysicalMaterial({color:'#87943c',metalness:0,roughness:.13,transmission:.65,thickness:.003,ior:1.5})};
  const frontMat=frontMaterial||standard('#4e7fa8',.5,.05);
  const front=(carrier,w,h,y,x=0)=>{
    const mesh=box(carrier,w,h,.02,x,y,frontZ,frontMat,'laminate-front');mesh.userData.kitchenFront=true;fronts.push(mesh);
    // Same horizontal bar style as the existing kitchen cabinet.
    box(carrier,w*.55,.025,.03,x,y+h*.35,frontZ+.027,m.metal,'accessory-handle').userData.kitchenHandle=true;
    for(const s of [-1,1])box(carrier,.012,.025,.025,x+s*w*.22,y+h*.35,frontZ+.014,m.metal,'handle-mount');
  };
  const runners=(carrier,w,y)=>{
    for(const s of [-1,1]){
      const x=s*(w/2+.007);
      box(root,.012,.032,p.d,x,y,0,m.track,'fixed-runner');
      const middle=box(root,.009,.022,p.d,x+s*.009,y+.003,0,m.metal,'telescopic-middle');slides.push(middle);
      box(carrier,.007,.016,p.d,x+s*.016,y+.004,0,m.metal,'moving-runner');
      for(const z of [-p.d*.36,p.d*.36]){box(root,.028,.035,.025,x,y-.02,z,m.track,'mounting-bracket');const screw=cylinder(root,.004,.003,x,y+.018,z,m.metal,'mounting-screw');screw.rotation.z=Math.PI/2;}
      box(root,.014,.018,.085,x,y-.02,-p.d*.32,m.cap,'soft-close-damper');
    }
  };
  if(p.category==='corner'){
    const side=hand==='right'?-1:1;
    const a=new THREE.Group(),b=new THREE.Group();root.add(a,b);a.position.x=side*.21;b.position.x=-side*.21;moving.push(a,b);
    for(const carrier of [a,b])for(let i=0;i<2;i++){basket(carrier,.35,.43,.07+i*.29,m.metal,m.track);pot(carrier,0,.077+i*.29,0,m);}
    for(const carrier of [a,b])for(const x of [-.16,.16])box(carrier,.014,.50,.018,x,.28,-.21,m.metal,'vertical-frame');
    box(root,.018,.52,.018,side*.40,.28,-.22,m.track,'fixed-pivot-post');
    front(a,Math.min(frontWidth,.44),frontHeight,frontHeight/2-.012,side*(frontWidth/2-.22-.21));
    for(const y of [.035,.51]){
      const arm=box(root,.018,.018,1,0,y,0,m.track,'telescopic-support');
      const cross=box(root,1,.014,.014,0,y,0,m.metal,'sliding-support-arm');links.push({arm,cross,y});
      cylinder(root,.018,.012,side*.40,y,-.22,m.metal,'pivot-joint');
      cylinder(a,.014,.012,side*.16,y,-.21,m.metal,'carrier-pivot-joint');
    }
    box(root,.78,.025,.032,0,.025,-.22,m.track,'corner-guide');
  }else if(p.category==='wicker'){
    for(let i=0;i<p.tiers;i++){
      const carrier=new THREE.Group();carrier.userData.kitchenTier=i;root.add(carrier);moving.push(carrier);
      const y=.045+i*(p.h-.19)/(p.tiers-1);basket(carrier,p.w-.05,p.d-.04,y,m.wicker,m.wood,{wicker:true});runners(carrier,p.w-.036,y-.02);
      const fh=frontHeight/p.tiers;front(carrier,frontWidth,fh-.003,fh*(i+.5)-.012);
    }
  }else{
    const carrier=new THREE.Group();root.add(carrier);moving.push(carrier);runners(carrier,p.w-.036,.035);
    if(p.category==='cutlery')cutlery(carrier,p.w-.04,p.d-.025,.035,m);
    else if(p.category==='waste'){
      const count=p.w>.4?2:1;box(carrier,p.w-.02,.012,p.d-.015,0,.042,0,m.metal,'bin-cradle');
      for(let i=0;i<count;i++)bin(carrier,(p.w-.05)/count-.008,p.d-.05,.05,m,(i-(count-1)/2)*(p.w-.05)/count);
    }else{
      for(let i=0;i<p.tiers;i++){
        const y=.05+i*(p.h-(p.category==='bottle'?.23:.18))/(p.tiers-1);basket(carrier,p.w-.04,p.d-.035,y,m.metal,m.track);
        for(let j=0;j<3;j++)bottle(carrier,0,y+.008,-p.d*.28+j*p.d*.27,p.category!=='bottle',m);
      }
      for(const x of [-p.w/2+.024,p.w/2-.024])box(carrier,.012,p.h-.04,.018,x,p.h/2,-p.d/2+.026,m.metal,'vertical-support');
    }
    front(carrier,frontWidth,frontHeight,frontHeight/2-.012);
    for(const s of [-1,1])box(carrier,.025,p.category==='cutlery'?.04:.08,.03,s*Math.min(p.w*.3,frontWidth*.3),p.category==='cutlery'?.045:.09,frontZ-.025,m.track,'front-attachment');
  }
  root.userData.kitchenModel={moving,slides,fronts,links,product:p,hand};setAccessoryPose(root,0);return root;
}
export function setAccessoryPose(root,value,tier=null) {
  const {moving,slides,links,product:p,hand}=root.userData.kitchenModel,t=clampOpen(value);
  root.userData.openProgress=t;
  if(p.category==='corner'){
    const pose=cornerPose(t,hand),s=hand==='right'?-1:1;
    moving[0].position.set(s*.21+pose.frontX,0,pose.frontZ);moving[0].rotation.y=pose.angle;
    moving[1].position.set(-s*.21+pose.rearX,0,pose.rearZ);
    for(const {arm,cross,y} of links){
      const anchor=new THREE.Vector3(s*.40,y,-.22),end=new THREE.Vector3(s*.16,y,-.21).applyEuler(moving[0].rotation).add(moving[0].position);
      arm.position.set(anchor.x,y,(anchor.z+end.z)/2);arm.scale.z=Math.max(.006,Math.abs(end.z-anchor.z));
      cross.position.set((anchor.x+end.x)/2,y,end.z);cross.scale.x=Math.max(.006,Math.abs(end.x-anchor.x));
    }
  }else moving.forEach((node,i)=>{if(tier===null||tier===i){node.position.z=p.travel*t;for(let j=i*2;j<i*2+2;j++)if(slides[j])slides[j].position.z=p.travel*t*.5;}});
}
