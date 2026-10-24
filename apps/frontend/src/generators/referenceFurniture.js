import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { fabricMaterial } from './surfaceMaterials.js';
import { REFERENCE_BY_ID } from './referenceFurnitureCatalog.js';
import { createDetailedFurniture } from './detailedFurniture.js';

const textureCache = new Map();
function pattern(kind) {
  if (textureCache.has(kind)) return textureCache.get(kind);
  const n = 128, data = new Uint8Array(n*n*4);
  for (let y=0;y<n;y++) for(let x=0;x<n;x++) {
    const noise = Math.sin(x*12.9898+y*78.233)*43758.5453 % 1;
    const wave = Math.sin(x*.09+y*.15+2*Math.sin(y*.055)+Math.sin(x*.038));
    const v = kind==='wood' ? .9+.045*Math.sin(y*1.8+2*Math.sin(x*.035))**2+.035*Math.sin(y*.19+Math.sin(x*.035))**2
      : kind==='sparkle' ? .93+.07*Math.abs(noise)
      : kind==='stone' ? .82+.15*Math.abs(noise) : .63+.34*Math.min(1,Math.abs(wave)*9);
    const i=(y*n+x)*4;
    data[i]=data[i+1]=data[i+2]=Math.round(v*255); data[i+3]=255;
  }
  const t=new THREE.DataTexture(data,n,n);t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;
  t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;
  textureCache.set(kind,t);return t;
}
function finish(color, type='matte') {
  const shiny=/gloss|sparkle/.test(type), timber=type.includes('wood');
  return new THREE.MeshPhysicalMaterial({color, metalness:0,
    roughness:shiny ? .17 : type==='suede' ? .83 : .64, clearcoat:shiny ? .95 : .05,
    clearcoatRoughness:.13, map:timber ? pattern('wood') : /marble|stone|sparkle/.test(type) ? pattern(type.split('-')[0]) : null,
    // "Suede" in the dining article is a laminate finish, not cloth upholstery.
  });
}
function mesh(parent, geo, mat, x=0,y=0,z=0, name='') {
  const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.name=name;
  m.castShadow=m.receiveShadow=true;parent.add(m);return m;
}
function box(parent,w,h,d,x,y,z,mat,name='',radius=.006) {
  return mesh(parent,new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/4,h/4,d/4)),mat,x,y,z,name);
}
function rod(parent,a,b,r,mat,name='frame') {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b), delta=end.clone().sub(start);
  const m=mesh(parent,new THREE.CylinderGeometry(r,r,delta.length(),8),mat,...start.clone().add(end).multiplyScalar(.5).toArray(),name);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;
}
function ring(parent,rx,rz,y,r,mat) {
  const m=mesh(parent,new THREE.TorusGeometry(1,r,8,48),mat,0,y,0,'ring');
  m.rotation.x=Math.PI/2;m.scale.set(rx,rz,1);return m;
}
function top(parent,w,d,y,mat,shape='rect',thickness=.035,name='top') {
  if(shape==='rect')return box(parent,w,thickness,d,0,y-thickness/2,0,mat,name,.012);
  const count={round:64,oval:64,hex:6,octagon:8,pebble:64,boat:64}[shape] || 64;
  const s=new THREE.Shape();
  for(let i=0;i<=count;i++){
    const a=i/count*Math.PI*2;
    const r=shape==='pebble'?1+.14*Math.cos(3*a):shape==='boat'?1+.06*Math.cos(2*a):1;
    const x=Math.cos(a)*w*.5*r,z=Math.sin(a)*d*.5*r;
    if(i===0)s.moveTo(x,z);else s.lineTo(x,z);
  }
  const geo=new THREE.ExtrudeGeometry(s,{depth:thickness,bevelEnabled:false,steps:1,curveSegments:32});
  geo.rotateX(-Math.PI/2);
  return mesh(parent,geo,mat,0,y-thickness,0,name);
}
function legs(parent,w,d,height,mat,style='splayed',count=4,radial=false) {
  if(style==='ring'){
    ring(parent,w*.44,d*.44,.024,.022,mat);ring(parent,w*.44,d*.44,height-.025,.022,mat);
  }
  for(let i=0;i<count;i++){
    const a=(i/count)*Math.PI*2+Math.PI/4;
    const x=count===4&&!radial&&style!=='ring'?Math.sign(Math.cos(a))*w*.4:Math.cos(a)*w*.38;
    const z=count===4&&!radial&&style!=='ring'?Math.sign(Math.sin(a))*d*.4:Math.sin(a)*d*.38;
    const s=style==='splayed'? .85 : 1;
    rod(parent,[x,.015,z],[x*s,height,z*s],style==='metal'||style==='ring'?.012:.024,mat,'leg');
  }
}
function animated(parent,part,prop,open,name) {
  const g=new THREE.Group();g.name=name;parent.add(g);
  g.userData={_animType:'furniture',_animProp:prop,_closedState:0,_openState:open,_animOpen:false,furniturePart:part};
  return g;
}
function drawer(parent,x,y,z,w,h,d,frontMat,wood,metal) {
  const g=animated(parent,'drawers','pz',d*.72,'drawer');
  const t=.012;
  box(g,w,h,t,x,y,z,frontMat,'drawer-front');
  box(g,w-.016,t,d,x,y-h/2+t,z-d/2,wood,'drawer-bottom');
  box(g,w-.024,h*.7,t,x,y-.015,z-d,wood,'drawer-back');
  for(const side of [-1,1])box(g,t,h*.7,d, x+side*(w/2-.018),y-.015,z-d/2,wood,'drawer-side');
  box(g,w*.37,.012,.021,x,y+h*.13,z+.018,metal,'handle');
  return g;
}
function cabinet(parent,x,y,z,w,h,d,frontMat,wood,metal,drawers=0,doors=0,open=false) {
  const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);g.name='cabinet';
  const t=.02;
  box(g,w,t,d,0,t/2,0,wood,'cabinet-floor');box(g,w,t,d,0,h-t/2,0,wood,'cabinet-top');
  for(const s of [-1,1])box(g,t,h,d,s*(w-t)/2,h/2,0,wood,'cabinet-side');
  box(g,w,h,t,0,h/2,-(d-t)/2,wood,'cabinet-back');
  if(drawers){
    const dh=(h-.045)/drawers;
    for(let i=0;i<drawers;i++)drawer(g,0,.025+(i+.5)*dh,d/2,w-.047,dh-.007,d-.05,frontMat,wood,metal);
  }else{
    box(g,w-.04,t,d-.04,0,h*.5,0,wood,'shelf');
    if(!open)for(let i=0;i<doors;i++){
      const dw=(w-.04)/doors, left=-w/2+.02+i*dw, hingeRight=i%2===1;
      const leaf=animated(g,'doors','ry',hingeRight?Math.PI*.52:-Math.PI*.52,'cabinet-front');
      leaf.position.set(left+(hingeRight?dw:0),0,d/2);
      const cx=(hingeRight?-1:1)*dw/2;
      box(leaf,dw-.006,h-.04,.018,cx,h/2,0,frontMat,'cabinet-leaf');
      box(leaf,.012,h*.27,.025,cx+(hingeRight?-1:1)*dw*.32,h*.6,.02,metal,'handle');
    }
  }
  return g;
}
const palette={black:'#242525',white:'#ecebe3',cream:'#ded2b9',blue:'#259bd0',marble:'#4c4943',glass:'#dde9e4',contrast:'#ecebe3'};
function center(root,s){
  const w=s.primaryW,d=s.primaryD,h=s.h,white=finish('#ecebe3','gloss');
  const timber=finish(s.dark?'#573b29':'#9e7449','wood');
  const metal=finish('#303434');metal.metalness=.65;metal.roughness=.3;
  const chrome=finish('#b0b6b7','gloss');chrome.metalness=.85;
  const glass=new THREE.MeshPhysicalMaterial({color:'#d8ece7',roughness:.08,transparent:true,opacity:.32,side:THREE.DoubleSide,depthWrite:false});
  const material=s.color==='glass'?glass:s.color?finish(palette[s.color],s.color==='marble'?'marble-gloss':'gloss'):timber;
  const topMat=s.whiteTop?white:material;
  const addInset=(parent,tw,td,y)=>{
    // A real inset pane: four rails with an empty centre beneath, not glass over opaque wood.
    const rim=Math.min(tw,td)*.11;
    for(const sign of [-1,1]){
      box(parent,tw,.035,rim,0,y-.0175,sign*(td-rim)/2,timber);
      box(parent,rim,.035,td-rim*2,sign*(tw-rim)/2,y-.0175,0,timber);
    }
    box(parent,tw-rim*2,.009,td-rim*2,0,y-.007,0,s.inset==='black'?finish('#151b1a','gloss'):glass,'inset-pane');
  };
  function table(parent,tw,td,height,mat,shape=s.shape||'rect'){
    if(s.inset==='glass' && shape==='round'){
      const outer=mesh(parent,new THREE.RingGeometry(.36,.5,64),timber,0,height-.01,0,'inset-rim');
      outer.rotation.x=-Math.PI/2;outer.scale.set(tw,td,1);outer.material.side=THREE.DoubleSide;
      top(parent,tw*.72,td*.72,height-.006,glass,'round',.009,'inset-pane');
    }else if(s.inset)addInset(parent,tw,td,height);
    else top(parent,tw,td,height,mat,shape);
    legs(parent,tw,td,height-.035,s.frame==='metal'||s.frame==='ring'?metal:timber,s.frame||'splayed',shape==='pebble'||s.frame==='tripod'?3:4,shape!=='rect');
    if(s.rim && /round|oval/.test(shape))ring(parent,tw*.49,td*.49,height+.01,.013,timber);
  }
  if(s.family==='nest'){
    for(let i=0;i<(s.count||2);i++){
      const g=new THREE.Group();g.name=`nested-table-${i+1}`;root.add(g);
      const factor=i===0?1:i===1?.65:.49;
      g.position.set(i===0?-w*.18:w*(i===1?.5:.32),0,i===2?-d*.42:i===1?d*.26:0);
      const mat=s.color==='contrast'?(i%2?white:timber):i===1&&s.color==='marble'?finish('#323436','marble-gloss'):topMat;
      table(g,w*factor,d*factor,h-i*.055,mat);
      if(s.drawers)cabinet(g,0,.14,0,w*factor*.75,.16,d*factor*.8,white,timber,metal,1);
    }
  }else if(s.family==='facet'){
    const geo=new THREE.CylinderGeometry(.52,.34,h-.04,4,1,false);geo.rotateY(Math.PI/4);geo.scale(w,1,d);
    mesh(root,geo,topMat,0,(h-.04)/2+.02,0,'faceted-body');
    top(root,w*.74,d*.74,h, s.inset?finish('#121717','gloss'):topMat);
  }else if(s.family==='stepped'){
    const tier=(h-.012)/7;
    for(let i=0;i<7;i++){const f=.3+i*.065;box(root,w*f,tier,d*f,0,(i+.5)*tier,0,timber,'stepped-plinth');}
    top(root,w,d,h,glass,'rect',.012);
  }else if(s.family==='cage'){
    const round=s.shape==='round'||s.shape==='octagon';
    if(round){
      ring(root,w*.42,d*.42,.018,.018,metal);ring(root,w*.49,d*.49,h-.035,.018,metal);
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6,b=a+Math.PI/6;
        rod(root,[Math.cos(a)*w*.42,.02,Math.sin(a)*d*.42],[Math.cos(b)*w*.49,h-.035,Math.sin(b)*d*.49],.009,metal);
      }
    }else{
      legs(root,w,d,h-.035,metal,'metal');
      for(const sign of [-1,1]){
        rod(root,[-w*.4,.025,sign*d*.4],[w*.4,.025,sign*d*.4],.013,metal);
        rod(root,[sign*w*.4,.025,-d*.4],[sign*w*.4,.025,d*.4],.013,metal);
      }
      if(s.slats)for(let i=0;i<14;i++)rod(root,[-w*.4+i*w*.8/13,.03,-d*.4],[-w*.4+i*w*.8/13,.03,d*.4],.005,metal);
    }
    top(root,w,d,h,topMat,s.shape);
  }else if(s.family==='cross'){
    top(root,w,d,h,topMat);
    for(const sign of [-1,1])for(const z of [-d*.27,d*.27]){
      const a=new THREE.Vector3(sign*w*.32,.035,z), b=new THREE.Vector3(-sign*w*.28,h-.058,z),delta=b.clone().sub(a);
      const beam=box(root,.065,delta.length(),.075,...a.clone().add(b).multiplyScalar(.5).toArray(),timber,'cross-base');
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
    }
  }else if(s.family==='clover'){
    const g=new THREE.Group();root.add(g);
    for(let i=0;i<3;i++){
      const a=i*Math.PI*2/3, lobe=new THREE.Group();lobe.position.set(Math.cos(a)*w*.23,0,Math.sin(a)*d*.23);g.add(lobe);
      if(s.inset&&i===0){
        const rim=mesh(lobe,new THREE.RingGeometry(.20,.33,64),timber,0,h-.01,0,'inset-rim');
        rim.rotation.x=-Math.PI/2;rim.scale.set(w,d,1);rim.material.side=THREE.DoubleSide;
        top(lobe,w*.4,d*.4,h-.007,glass,'round',.009,'inset-pane');
      }else top(lobe,w*.66,d*.66,h,timber,'round');
    }
    legs(root,w,d,h-.035,timber,'splayed',3,true);
  }else if(s.family==='waterfall'){
    top(root,w,d,h,white);
    box(root,.04,h-.035,d,w/2-.02,(h-.035)/2,0,white);
    for(const z of [-d*.4,d*.4])box(root,.04,h-.035,.04,-w*.4,(h-.035)/2,z,timber);
    box(root,.04,.04,d*.85,-w*.4,.02,0,timber);
  }else if(s.family==='fluted'){
    top(root,w,d,h,white);
    const n=16;
    for(const z of [-d/2+.025,d/2-.025])for(let i=0;i<n;i++)box(root,w/n*.73,h-.035,.038,-w/2+(i+.5)*w/n,(h-.035)/2,z,timber,'flute');
    for(const x of [-w/2+.025,w/2-.025])for(let i=0;i<n;i++)box(root,.038,h-.035,d/n*.73,x,(h-.035)/2,-d/2+(i+.5)*d/n,timber,'flute');
  }else if(s.family==='trays'){
    legs(root,w,d,h-.05,s.frame?chrome:timber,s.frame||'splayed');
    top(root,w,d,h-.045,timber);
    const count=s.low?2:s.frame?2:4;
    for(let i=0;i<count;i++){
      const g=animated(root,'trays',i<2?'px':'pz',(i%2?-1:1)*(i<2?w:d)*.23,'serving-tray');
      const tw=w/(count===4?2:count)-.016,td=count===4?d/2-.014:d-.02;
      const x=count===4?(i%2?1:-1)*w/4:-w/2+(i+.5)*w/count, z=count===4?(i<2?-1:1)*d/4:0;
      box(g,tw,.012,td,x,h-.025,z,s.low?timber:white,'tray-bottom');
      for(const sign of [-1,1]){
        box(g,tw,.027,.012,x,h-.013,z+sign*(td/2-.006),timber);
        box(g,.012,.027,td,x+sign*(tw/2-.006),h-.013,z,timber);
      }
    }
  }else if(s.family==='shelf'){
    const base=s.raised?.14:.025;
    if(s.raised)legs(root,w,d,base,timber);
    box(root,w,.03,d,0,base+.015,0,s.color?material:timber,'lower-shelf');
    for(const sign of [-1,1])box(root,.034,h-base-.035,d,sign*(w/2-.017),(h+base-.035)/2,0,s.color?material:timber,'side-panel');
    if(s.inset)addInset(root,w,d,h);else top(root,w,d,h,topMat);
  }else if(s.family==='box'||s.family==='storage'){
    const base=s.family==='storage'?(s.slim?.26:.14):.045, ch=h-base-.035;
    if(s.family==='storage'){
      if(s.casters){
        for(const x of [-w*.4,w*.4])for(const z of [-d*.38,d*.38]){
          const wheel=mesh(root,new THREE.CylinderGeometry(.038,.038,.028,14),metal,x,.038,z,'caster');wheel.rotation.z=Math.PI/2;
          rod(root,[x,.045,z],[x,base,z],.012,chrome);
        }
      }else legs(root,w,d,base,timber);
    }else box(root,w*.9,base,d*.86,0,base/2,0,timber,'plinth');
    // A storage carcass has no solid filler behind its moving drawers.
    const bodyMat=s.color?material:timber;
    if(s.drawers){
      const count=s.drawers;
      for(let i=0;i<count;i++){
        const cw=(w-.01*(count-1))/count, x=-w/2+cw/2+i*(cw+.01);
        cabinet(root,x,base,0,cw,ch,d,s.color==='white'?timber:white,bodyMat,metal,1);
      }
    }else{
      cabinet(root,0,base,0,w,ch,d,bodyMat,bodyMat,metal,0,0,true);
      box(root,w-.03,ch-.03,.02,0,base+ch/2,d/2-.01,bodyMat,'fixed-front',s.rounded?.03:.006);
    }
    if(s.slider){
      const panels=s.split?2:1;
      for(let i=0;i<panels;i++){
        const g=animated(root,'tops','px',(i===0?-1:1)*w*.42,'sliding-top');
        const tw=w/panels-.006;box(g,tw,.035,d,-w/2+tw/2+i*w/panels,h-.0175,0,s.color==='black'||s.color==='white'?timber:topMat,'sliding-surface');
      }
    }else if(s.inset)addInset(root,w,d,h);else top(root,w,d,h,topMat);
    if(s.carved)for(let i=0;i<8;i++){
      const relief=box(root,w*.055,ch*.44,.009,-w*.39+i*w*.11,base+ch*.48,d/2+.008,timber,'geometric-inlay');relief.rotation.z=.6;
    }
    if(s.slats)for(let i=0;i<3;i++)box(root,w*.43,.013,.017,w*.26,base+ch*(.25+i*.24),d/2+.007,timber,'front-slat');
  }else{
    table(root,w,d,h,topMat);
    if(s.slider){
      const g=animated(root,'tops','px',w*.35,'sliding-wrap');
      box(g,w*.32,.028,d+.008,0,h+.014,0,white);
      for(const sign of [-1,1])box(g,w*.32,h*.8,.022,0,h*.6,sign*(d/2+.008),white);
    }
  }
  if(s.wrap){
    const mat=s.color==='black'?timber:timber;
    box(root,w*.19,.018,d,0,h+.009,0,mat,'wood-wrap-top');
    for(const sign of [-1,1])box(root,w*.19,h-.02,.018,0,h/2,sign*d/2,mat,'wood-wrap-side');
  }
  if(s.stripe)box(root,w*.18,.004,d*(s.shape==='pebble'?.65:1),0,h+.002,0,s.color==='black'?white:timber,'contrast-inlay');
  for(let i=0;i<(s.stools||0);i++){
    const a=i*Math.PI*2/s.stools, g=new THREE.Group();root.add(g);g.name='serving-stool';
    g.position.set(Math.cos(a)*w*.3,0,Math.sin(a)*d*.3);
    top(g,w*.3,d*.3,h*.65,s.stools===4?finish('#c5aa52'):white,'round');legs(g,w*.29,d*.29,h*.65-.035,timber,'splayed',3);
  }
}

function diningChair(parent,x,z,yaw,upholstery,legMat,arm=false){
  const g=new THREE.Group();g.name='dining-chair';g.position.set(x,0,z);g.rotation.y=yaw;parent.add(g);
  legs(g,.44,.46,.42,legMat,'metal');
  box(g,.46,.075,.45,0,.445,0,upholstery,'seat',.035);
  const back=box(g,.47,.40,.07,0,.68,-.205,upholstery,'backrest',.03);back.rotation.x=-.1;
  if(arm)for(const sign of [-1,1])box(g,.036,.14,.3,sign*.23,.58,-.04,upholstery,'armrest',.015);
}
function dining(root,s){
  const topMat=finish(s.color,s.finish), dark=finish('#303132'), timber=finish('#a18563','wood');
  const metal=finish(s.base==='metal'&&s.bench?'#bba46e':'#777a79');metal.metalness=.8;metal.roughness=.28;
  top(root,s.tw,s.td,s.h,topMat,'rect',s.base==='metal'?.028:.047);
  if(s.base==='twin'||s.base==='slab'){
    for(const sign of [-1,1])box(root,s.base==='twin'?.22:.055,s.h-.05,s.td*.64,sign*s.tw*.26,(s.h-.05)/2,0,topMat,'pedestal');
  }else if(s.base==='wall'){
    // Back edge sits flush to the snapped wall. Visible brackets support the cantilever.
    for(const x of [-s.tw*.3,s.tw*.3]){
      rod(root,[x,.42,-s.td/2+.01],[x,s.h-.05,s.td*.12],.018,dark,'wall-bracket');
      box(root,.05,.32,.022,x,s.h-.2,-s.td/2,dark,'wall-plate');
    }
  }else if(s.base==='legs'){
    for(const x of [-s.tw*.44,s.tw*.44])for(const z of [-s.td*.39,s.td*.39])box(root,.065,s.h-.04,.065,x,(s.h-.04)/2,z,topMat,'leg');
  }else legs(root,s.tw,s.td,s.h-.035,s.base==='metal'?metal:timber,s.base);
  const upholstery=fabricMaterial(s.upholstery), chairsLegs=s.base==='metal'?metal:dark;
  const sideCount=s.seats===8?3:s.seats===4?1:2;
  for(const side of [-1,1]){
    if(s.base==='wall'&&side===-1)continue;
    if(s.bench&&side===1){
      const g=new THREE.Group();g.name='dining-bench';root.add(g);g.position.z=s.td/2+.29;
      box(g,s.tw*.8,.085,.4,0,.44,0,upholstery,'bench-seat',.035);legs(g,s.tw*.8,.38,.4,chairsLegs,'metal');
    }else for(let i=0;i<sideCount;i++){
      const x=s.base==='wall' ? -s.tw*.24 : (i-(sideCount-1)/2)*s.tw/(sideCount+.5);
      diningChair(root,x,side*(s.td/2+.28),side===1?Math.PI:0,upholstery,chairsLegs,[1,2,7,9,15,25].includes(Number(s.id.slice(-2))));
    }
  }
  for(const side of [-1,1])diningChair(root,side*(s.tw/2+.28),0,side===1?-Math.PI/2:Math.PI/2,upholstery,chairsLegs);
  if(s.base==='wall')diningChair(root,s.tw*.29,s.td/2+.28,Math.PI,upholstery,chairsLegs);
}

function desk(root,s){
  const hasReturn=s.family!=='executive'||s.code==='DD-166'||s.code==='DD-167';
  const w=s.w,d=s.d,h=s.h,mainD=hasReturn?.68:d, mainZ=-(d-mainD)/2;
  const timber=finish(s.timber,s.code==='MD-183'?'matte':'wood'),accent=finish(s.accent),metal=finish('#b8bec0');metal.metalness=.72;
  const dark=finish('#323638'),t=.032;
  box(root,w,.036,mainD,0,h-.018,mainZ,timber,'desktop');
  // Modesty is behind the knees; the drawers face the seated user (+Z).
  const modesty= s.detail==='stripes'||s.detail==='inset'?timber:accent;
  box(root,w-.07,.5,.025,0,.35,mainZ-mainD/2+.06,modesty,'modesty-panel');
  if(s.family==='metal'){
    for(const x of [-w/2+.027,w/2-.027])for(const z of [mainZ-mainD/2+.04,mainZ+mainD/2-.04])box(root,.04,h-.036,.04,x,(h-.036)/2,z,metal,'metal-leg');
    for(const x of [-w/2+.027,w/2-.027])box(root,.04,.04,mainD,x,h-.07,mainZ,metal,'metal-rail');
  }else{
    for(const side of [-1,1])box(root,t,h-.036,mainD,side*(w/2-t/2),(h-.036)/2,mainZ,s.family==='executive'?accent:timber,'slab-leg');
  }
  const side=s.returnSide==='left'?-1:1, cw=Math.min(.45,w*.24);
  const pedestalX=-side*(w/2-cw/2-.055);
  cabinet(root,pedestalX,.055,mainZ,cw,.61,mainD-.08,accent,timber,metal,s.code==='DD-177'?4:3);
  if(s.family==='executive' && s.returnSide==='both')cabinet(root,-pedestalX,.055,mainZ,cw,.61,mainD-.08,accent,timber,metal,0,1);
  if(hasReturn){
    const rw=w*.31,rd=d-mainD+.12,rz=mainZ+mainD/2+rd/2-.06;
    const rx=side*(w-rw)/2;
    if(s.family==='slab-l'){
      box(root,rw,.036,rd,rx,h-.018,rz,timber,'return-top');
      box(root,t,h-.036,rd,side*(w-t)/2,(h-.036)/2,rz,timber,'return-side');
      cabinet(root,rx,.04,rz+rd*.18,rw-.04,.6,rd*.6,timber,timber,metal,0,2);
    }else{
      cabinet(root,rx,.055,rz,rw,.58,rd,accent,timber,metal,0,2,s.detail==='open');
      if(s.detail==='open')cabinet(root,rx,.055,rz,rw*.45,.58,rd,finish(s.timber,'wood'),accent,metal,0,1);
    }
  }
  if(['stripes','slats','inset'].includes(s.detail)){
    for(let i=0;i<(s.detail==='slats'?4:3);i++)box(root,w*.72,.016,s.detail==='slats'?.075:.008,0,.16+i*.11,mainZ-mainD/2+.041,s.detail==='slats'?timber:metal,'modesty-trim');
    if(s.detail==='inset')box(root,w*.83,.22,.012,0,.51,mainZ-mainD/2+.035,accent,'inset-front');
  }
  if(s.detail==='quilt'){
    for(const sign of [-1,1]){
      box(root,cw,.55,.04,sign*(w/2-cw/2-.03),.34,mainZ-mainD/2+.02,dark,'padded-front',.014);
      quilt(root,sign*(w/2-cw/2-.03),.34,mainZ-mainD/2-.005,cw,.52,finish('#636563'),-.001);
    }
    // Geometric brass accent substitutes for the small, unmeasurable photo ornament.
    const gold=finish('#ba9552');gold.metalness=.65;
    rod(root,[-w*.19,.35,mainZ-mainD/2+.038],[w*.19,.35,mainZ-mainD/2+.038],.006,gold,'brass-accent');
  }
  // Cable grommet on desk, not a floating computer/accessory from the source photo.
  const grommet=mesh(root,new THREE.CylinderGeometry(.021,.021,.004,20),dark,w*.32,h+.001,mainZ-mainD*.29,'cable-grommet');
  grommet.castShadow=false;
}
function quilt(parent,x,y,z,w,h,mat,depth=.001){
  // Clipped diamond seams; ends stay inside the upholstered panel.
  for(const slope of [-1,1])for(let b=-w-h;b<w+h;b+=.09){
    const points=[];
    for(const px of [-w/2,w/2]){const py=slope*px+b;if(Math.abs(py)<=h/2)points.push([x+px,y+py,z+depth]);}
    for(const py of [-h/2,h/2]){const px=(py-b)/slope;if(Math.abs(px)<w/2)points.push([x+px,y+py,z+depth]);}
    if(points.length===2)rod(parent,points[0],points[1],.002,mat,'diamond-seam');
  }
}
function officeChair(root,s){
  const leather=finish(s.color);leather.roughness=.42;
  const chrome=finish('#b8bec2','gloss');chrome.metalness=.85;
  const black=finish('#222726'),seam=finish('#555758');
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5, x=Math.cos(a)*.29,z=Math.sin(a)*.29;
    rod(root,[0,.17,0],[x,.07,z],.018,chrome,'star-base');
    const wheel=mesh(root,new THREE.CylinderGeometry(.035,.035,.055,12),black,x,.037,z,'caster');wheel.rotation.z=Math.PI/2;
  }
  rod(root,[0,.13,0],[0,.43,0],.028,chrome,'gas-lift');
  const swivel=animated(root,'swivel','ry',Math.PI*.5,'swivel-seat');
  box(swivel,.52,.11,.51,0,.48,0,leather,'seat',.047);
  const back=new THREE.Group();back.position.set(0,.54,-.23);back.rotation.x=-.12;swivel.add(back);
  box(back,.5,.6,.1,0,.28,0,leather,'backrest',.045);
  box(back,.49,.18,.11,0,.58,.005,leather,'headrest',.04);
  if(s.variant==='quilt')quilt(back,0,.27,.054,.44,.48,seam);
  else for(const y of [.13,.34])box(back,.42,.012,.008,0,y,.052,leather,'upholstery-seam',.003);
  for(const sign of [-1,1]){
    rod(swivel,[sign*.28,.48,-.13],[sign*.30,.68,-.10],.012,chrome,'arm-support');
    rod(swivel,[sign*.28,.48,.15],[sign*.30,.68,.15],.012,chrome,'arm-support');
    box(swivel,.065,.045,.35,sign*.30,.70,.02,leather,'arm-pad',.018);
  }
}

export const DINING_CHAIR_STYLES = [
  {id:'matching',label:'Matching dining chair'}, {id:'bench',label:'Matching bench'},
  ...[...REFERENCE_BY_ID.values()].filter(s=>s.kind==='dining').map(s=>({id:s.id,label:s.label.replace(/^\d+\. /,'')+' chair'})),
  {id:'dining-chair',label:'Upholstered dining chair'}, {id:'armchair',label:'Armchair'},
  ...[...REFERENCE_BY_ID.values()].filter(s=>s.kind==='office-chair').map(s=>({id:s.id,label:s.label})),
];
const seatStyleIds=new Set(DINING_CHAIR_STYLES.map(s=>s.id));
export function validateDiningChairs(chairs){
  if(!Array.isArray(chairs)||chairs.length>32)throw new Error('Use a list of at most 32 dining seats.');
  const seen=new Set();
  return chairs.map(c=>{
    if(!c||typeof c.id!=='string'||!c.id||seen.has(c.id))throw new Error('Each chair needs a unique ID.');
    seen.add(c.id);
    if(!seatStyleIds.has(c.style))throw new Error('Unknown chair style.');
    for(const key of ['x','z','yaw','width','depth'])if(typeof c[key]!=='number'||!Number.isFinite(c[key]))throw new Error(`Invalid chair ${key}.`);
    if(Math.abs(c.x)>20||Math.abs(c.z)>20||c.width<.25||c.width>3||c.depth<.25||c.depth>2)throw new Error('Chair position or size is outside the supported range.');
    if(c.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(c.color))throw new Error('Invalid chair colour.');
    return {id:c.id,style:c.style,x:c.x,z:c.z,yaw:c.yaw,width:c.width,depth:c.depth,...(c.color?{color:c.color}:{})};
  });
}
function buildDiningChair(c,tableSpec){
  const spec=REFERENCE_BY_ID.get(c.style),g=new THREE.Group();
  if(c.style==='armchair'||c.style==='dining-chair'){
    const model=createDetailedFurniture(c.style,c.width,c.depth);g.add(model);
    if(c.color)model.traverse(n=>{if(n.isMesh&&n.material.sheen>0)n.material.color.set(c.color);});
  }else if(spec?.kind==='office-chair'){
    officeChair(g,{...spec,color:c.color||spec.color});
  }else{
    const style=spec?.kind==='dining'?spec:tableSpec;
    const upholstery=fabricMaterial(c.color||style.upholstery),metal=finish(style.base==='metal'?(style.bench?'#bba46e':'#777a79'):'#303132');
    if(style.base==='metal'){metal.metalness=.8;metal.roughness=.28;}
    if(c.style==='bench'){
      g.name='dining-bench';box(g,c.width,.085,c.depth,0,.44,0,upholstery,'bench-seat',.035);
      legs(g,c.width,c.depth,.4,metal,'metal');
    }else diningChair(g,0,0,0,upholstery,metal,[1,2,7,9,15,25].includes(Number(style.id.slice(-2))));
  }
  const bounds=new THREE.Box3().setFromObject(g),size=bounds.getSize(new THREE.Vector3());
  g.scale.set(c.width/size.x,1,c.depth/size.z);
  g.position.set(c.x,0,c.z);g.rotation.y=c.yaw;g.userData.diningChairId=c.id;
  g.name=c.style==='bench'?'dining-bench':'dining-chair';return g;
}
export function updateDiningChairs(root,chairs){
  const spec=REFERENCE_BY_ID.get(root.userData.referenceId);
  if(spec?.kind!=='dining')throw new Error('Select a dining set first.');
  const state=validateDiningChairs(chairs);
  // Validate/build first, before touching the existing set. Never refit the table.
  const existing=new Map(root.children.filter(c=>c.userData.diningChairId).map(c=>[c.userData.diningChairId,c]));
  const oldState=new Map(validateDiningChairs(root.userData.diningChairs||[]).map(c=>[c.id,c]));
  const next=state.map(c=>existing.has(c.id)&&JSON.stringify(oldState.get(c.id))===JSON.stringify(c)
    ?existing.get(c.id):buildDiningChair(c,spec));
  const previous=[...existing.values()].filter(c=>!next.includes(c));
  previous.forEach(c=>root.remove(c));
  const retained=new Set(),disposed=new Set();
  root.traverse(n=>{if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])retained.add(m);});
  previous.forEach(c=>c.traverse(n=>{
    n.geometry?.dispose();
    for(const m of Array.isArray(n.material)?n.material:[n.material])if(m&&!retained.has(m)&&!disposed.has(m)){m.dispose();disposed.add(m);}
  }));
  next.forEach(c=>{if(c.parent!==root)root.add(c);});root.userData.diningChairs=state;
  root.updateMatrixWorld(true);return state.map(c=>({...c}));
}

export function createReferenceFurniture(id,width,depth,options={}){
  const spec=REFERENCE_BY_ID.get(id);if(!spec)return null;
  if(!Number.isFinite(width)||!Number.isFinite(depth)||width<=0||depth<=0)throw new RangeError('Furniture footprint must be positive and finite');
  const root=new THREE.Group();
  if(spec.kind==='dining')dining(root,spec);
  else if(spec.kind==='center')center(root,spec);
  else if(spec.kind==='desk')desk(root,spec);
  else officeChair(root,spec);
  // Fit the CLOSED assembly (including seating/returns) once. Opening motion must
  // never rescale the model or change its persisted placement footprint.
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),centerPoint=bounds.getCenter(new THREE.Vector3());
  for(const child of root.children){
    child.position.x-=centerPoint.x;child.position.z-=centerPoint.z;child.position.y-=bounds.min.y;
    const delta=child.userData._animProp==='px' ? centerPoint.x : child.userData._animProp==='pz' ? centerPoint.z : 0;
    if(delta){child.userData._closedState-=delta;child.userData._openState-=delta;}
  }
  root.scale.set(width/size.x,1,depth/size.z);
  let interactive=false;root.traverse(n=>{if(n.userData.furniturePart)interactive=true;});
  root.userData={referenceFurniture:true,referenceId:id,referenceCode:spec.code||spec.label,
    referenceSource:spec.source,referencePage:spec.page,referenceNote:spec.note,
    dimensionStatus:'reference-inspired; heights and details estimated',isInteractiveFurniture:interactive,
    nominalFootprint:{width:spec.w,depth:spec.d},kind:spec.kind};
  if(spec.kind==='dining'){
    root.userData.diningBaseSize={width:size.x,depth:size.z};
    const seats=root.children.filter(n=>n.name==='dining-chair'||n.name==='dining-bench');
    root.userData.diningChairs=seats.map((n,i)=>{
      const id=`seat-${i+1}`;n.userData.diningChairId=id;
      // Measure in the seat's own axes, not the rotated group/world bounding box.
      const clone=n.clone();clone.position.set(0,0,0);clone.rotation.set(0,0,0);
      const size=new THREE.Box3().setFromObject(clone).getSize(new THREE.Vector3());
      return {id,style:n.name==='dining-bench'?'bench':'matching',x:n.position.x,z:n.position.z,yaw:n.rotation.y,width:size.x,depth:size.z};
    });
    if(options.diningChairs!==undefined)updateDiningChairs(root,options.diningChairs);
  }
  return root;
}
