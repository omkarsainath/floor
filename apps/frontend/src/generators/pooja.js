import * as THREE from 'three';

// Reference-inspired proportions; photographs do not establish exact dimensions.
export const POOJA_CATALOG = [
  {id:'pooja-teak-screen',label:'Teak · Decorative Screens',w:1.1,d:.55,h:2.1,style:'screen'},
  {id:'pooja-cream-bells',label:'Cream · Bell-front Niche',w:1.15,d:.48,h:2.25,style:'bells'},
  {id:'pooja-pullout-stool',label:'Oak · Pull-out Stool',w:.95,d:.55,h:2.2,style:'stool'},
  {id:'pooja-slat-niche',label:'Open · Slatted Wood Niche',w:1.3,d:.5,h:2.3,style:'slats'},
  {id:'pooja-asymmetric',label:'Open · Shelves & Jaali',w:1.4,d:.5,h:2.3,style:'asymmetric'},
  {id:'pooja-arched-fluted',label:'Ivory · Arch & Fluted Drawers',w:.95,d:.48,h:2.2,style:'arch'},
].map(s=>({...s,icon:'🪔',wallAttached:true,note:'Reference-inspired model; dimensions and decorative details are approximate.'}));

function woodMaterial(color){
  const pixels=new Uint8Array(128*512*4);
  for(let y=0;y<512;y++)for(let x=0;x<128;x++){
    const value=222+10*Math.sin(x*.55+Math.sin(y*.012)) + 5*Math.sin(x*1.7+y*.004);
    const i=(y*128+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;
  }
  const map=new THREE.DataTexture(pixels,128,512);map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
  return new THREE.MeshStandardMaterial({color,map,roughness:.48});
}

export function createPoojaUnit(id,width,depth){
  const spec=POOJA_CATALOG.find(s=>s.id===id);if(!spec)return null;
  if(!Number.isFinite(width)||!Number.isFinite(depth)||width<=0||depth<=0)throw new RangeError('Pooja footprint must be positive and finite');
  const root=new THREE.Group(),{w,d,h,style}=spec;
  root.name=id;
  const cream=new THREE.MeshStandardMaterial({color:0xe6dfcd,roughness:.52});
  const white=new THREE.MeshStandardMaterial({color:0xf8f4e9,roughness:.3});
  const wood=woodMaterial(style==='screen'?0x975421:style==='slats'||style==='asymmetric'?0x89603b:0xb38b59);
  const brass=new THREE.MeshStandardMaterial({color:0xc99d48,metalness:.7,roughness:.3});
  const glow=new THREE.MeshStandardMaterial({color:0xffe1a1,emissive:0xffc86f,emissiveIntensity:1.3,roughness:.6});
  const body=style==='arch'||style==='bells'?cream:wood;
  const add=(parent,name,geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.name=name;m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
  const box=(p,name,sx,sy,sz,x,y,z,mat=body)=>add(p,name,new THREE.BoxGeometry(sx,sy,sz),mat,x,y,z);
  const ball=(p,name,r,x,y,z,mat=brass)=>add(p,name,new THREE.SphereGeometry(r,12,8),mat,x,y,z);
  const cylinder=(p,name,rt,rb,height,x,y,z,mat=brass)=>add(p,name,new THREE.CylinderGeometry(rt,rb,height,20),mat,x,y,z);
  const motion=(name,part,prop,x,y,z,travel)=>{
    const g=new THREE.Group();g.name=name;g.position.set(x,y,z);
    const closed=prop==='pz'?z:0;
    g.userData={_animType:'furniture',_animProp:prop,_closedState:closed,_openState:closed+travel,_animOpen:false,furniturePart:part};root.add(g);return g;
  };
  const curve=(p,name,points,r,mat=brass)=>add(p,name,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v))),32,r,6,false),mat,0,0,0);
  function bell(p,x,y,z,drop=.16){
    cylinder(p,'bell-chain',.002,.002,drop,x,y-drop/2,z);
    for(let i=.015;i<drop;i+=.028)ball(p,'chain-bead',.004,x,y-i,z);
    const profile=[[.009,0],[.014,-.008],[.019,-.019],[.024,-.039],[.037,-.05],[.041,-.055],[.034,-.06],[.029,-.049],[.015,-.02]];
    add(p,'brass-bell',new THREE.LatheGeometry(profile.map(([r,h])=>new THREE.Vector2(r,h)),20),brass,x,y-drop,z);
    ball(p,'bell-clapper',.009,x,y-drop-.06,z);
  }
  // Geometry-backed perforations remain visible from either side of an open leaf.
  function jaali(p,pw,ph,x,y,z,mat=white){
    const shape=new THREE.Shape();shape.moveTo(-pw/2,-ph/2);shape.lineTo(pw/2,-ph/2);shape.lineTo(pw/2,ph/2);shape.lineTo(-pw/2,ph/2);shape.closePath();
    const cols=Math.max(1,Math.floor(pw/.085)),rows=Math.max(3,Math.floor(ph/.10));
    const cw=pw/cols,ch=ph/rows;
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      const cx=-pw/2+(i+.5)*cw,cy=-ph/2+(j+.5)*ch,rx=cw*.34,ry=ch*.35;
      // Four pointed petals separated by a small structural cross.
      for(let k=0;k<4;k++){
        const a=k*Math.PI/2, hole=new THREE.Path();
        const pt=(u,v)=>[cx+rx*(u*Math.cos(a)-v*Math.sin(a)),cy+ry*(u*Math.sin(a)+v*Math.cos(a))];
        hole.moveTo(...pt(.12,0));hole.quadraticCurveTo(...pt(.8,-.65),...pt(1,0));
        hole.quadraticCurveTo(...pt(.8,.65),...pt(.12,0));shape.holes.push(hole);
      }
    }
    return add(p,'perforated-jaali',new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:false,curveSegments:4}),mat,x,y,z);
  }
  function lotus(p,x,y,z,r,mat=brass){
    for(let i=-3;i<=3;i++){
      const a=i*.36,s=new THREE.Shape();s.moveTo(0,0);s.quadraticCurveTo(-r*.46,r*.45,0,r);s.quadraticCurveTo(r*.46,r*.45,0,0);
      const petal=add(p,'lotus-petal',new THREE.ExtrudeGeometry(s,{depth:.004,bevelEnabled:false}),mat,x,y,z);petal.rotation.z=a;
    }
  }
  function emblem(p,x,y,z,r){
    const g=new THREE.Group();g.position.set(x,y,z);p.add(g);g.name='om-mandala';
    for(let i=0;i<28;i++){
      const a=i*Math.PI*2/28,petal=ball(g,'mandala-petal',r*.06,Math.cos(a)*r,Math.sin(a)*r,0,glow);petal.scale.set(.7,1.65,.35);petal.rotation.z=a-Math.PI/2;
    }
    // Stylised vector Om, not a font or a remotely loaded image.
    const pts=[[-.58,.3,0],[-.05,.43,0],[.17,.23,0],[-.05,.02,0],[-.4,-.03,0],[-.06,-.05,0],[.22,-.28,0],[.02,-.48,0],[-.51,-.35,0]];
    curve(g,'om-stroke',pts.map(v=>v.map(a=>a*r)),r*.055);
    curve(g,'om-tail',[[.05,-.04,0],[.38,.08,0],[.56,-.04,0],[.65,.19,0]].map(v=>v.map(a=>a*r)),r*.045);
    curve(g,'om-crescent',[[-.06,.62,0],[.15,.5,0],[.36,.65,0]].map(v=>v.map(a=>a*r)),r*.035);ball(g,'om-dot',r*.045,r*.16,r*.78,0);
  }
  function plant(p,x,y,z,size=.12){
    cylinder(p,'ceramic-planter',size*.30,size*.22,size*.48,x,y+size*.24,z,white);
    const green=new THREE.MeshStandardMaterial({color:0x42602a,roughness:.8});
    for(let i=0;i<7;i++){
      const a=i*2.4,leaf=ball(p,'plant-leaf',size*.25,x+Math.cos(a)*size*.25,y+size*(.65+(i%3)*.18),z+Math.sin(a)*size*.25,green);
      leaf.scale.set(.45,1.5,.35);leaf.rotation.z=Math.sin(a)*.65;
    }
  }
  function idol(p,x,y,z){
    const g=new THREE.Group();g.name='ganesha-idol';g.position.set(x,y,z);p.add(g);
    cylinder(g,'idol-pedestal',.075,.085,.02,0,.01,0);
    const ellipsoid=(name,r,x,y,z,sx,sy,sz)=>{const m=ball(g,name,r,x,y,z);m.scale.set(sx,sy,sz);return m;};
    ellipsoid('idol-body',.06,0,.105,0,1,1.25,.8);
    ellipsoid('idol-head',.042,0,.19,.012,1,1.05,.85);
    for(const side of [-1,1]){
      ellipsoid('idol-ear',.035,side*.047,.187,.008,.65,1,.3);
      ellipsoid('idol-knee',.035,side*.046,.045,.027,1.3,.65,1);
      curve(g,'idol-arm',[[side*.045,.135,0],[side*.075,.105,.018],[side*.07,.15,.028]],.012);
      curve(g,'idol-tusk',[[side*.018,.178,.04],[side*.022,.158,.049],[side*.028,.165,.055]],.004,white);
    }
    curve(g,'idol-trunk',[[0,.185,.045],[.004,.15,.066],[.02,.12,.073],[.043,.137,.069]],.012);
    cylinder(g,'idol-crown',.006,.036,.045,0,.242,.008);
    ball(g,'crown-finial',.007,0,.268,.008);
  }
  function drawer(y,dh,dw=w-.09,x=0,fluted=false){
    const g=motion('storage-drawer','drawers','pz',x,y,d/2-.035,d*.7);
    box(g,'drawer-front',dw,dh,.025,0,0,0,cream);
    box(g,'drawer-bottom',dw-.035,.015,d-.10,0,-dh/2+.018,-(d-.10)/2,wood);
    box(g,'drawer-back',dw-.035,dh-.035,.016,0,0,-d+.10,wood);
    for(const s of [-1,1])box(g,'drawer-side',.016,dh-.035,d-.10,s*(dw/2-.025),0,-(d-.10)/2,wood);
    if(fluted)for(let x=-dw/2+.02;x<dw/2-.02;x+=.025)cylinder(g,'fluted-front',.007,.007,dh-.012,x,0,.016,cream);
    ball(g,'drawer-knob',.018,0,dh*.1,.038);
  }
  const baseTop=style==='stool'?.82:style==='asymmetric'?.82:style==='arch'?.8:.65;
  // Hollow full-height carcass: never an opaque box filling the shrine.
  box(root,'plinth',w-.06,.07,d-.04,0,.035,0);
  box(root,'back-panel',w,h,.025,0,h/2,-d/2+.0125);
  box(root,'canopy',w,.045,d,0,h-.0225,0);
  for(const s of [-1,1]){
    if(style==='slats'&&s===1){
      for(let z=-d/2+.035;z<=d/2-.025;z+=.085)box(root,'side-slat',.035,h-.07,.032,w/2-.018,h/2,z,wood);
    }else if(style==='screen'){
      // Frame a real side opening so the illuminated perforations remain visible.
      box(root,'side-base',.025,baseTop,d,s*(w/2-.0125),baseTop/2,0);
      for(const end of [-1,1])box(root,'side-post',.025,h-baseTop,d*.15,s*(w/2-.0125),(h+baseTop)/2,end*d*.425);
      box(root,'side-header',.025,.07,d,s*(w/2-.0125),h-.035,0);
    }else box(root,'side-panel',.025,h-.07,d,s*(w/2-.0125),h/2,0);
  }
  const altarX=style==='asymmetric'?w*.11:0;
  const altarW=style==='asymmetric'?w*.55:w-.045;
  box(root,'altar-counter',altarW,.04,d-.025,altarX,baseTop,0,style==='slats'||style==='asymmetric'?wood:white);
  if(style!=='arch')box(root,'canopy-fascia',w-.052,.10,.045,0,h-.05,d/2-.024);
  box(root,'under-counter-light',altarW-.05,.008,.014,altarX,baseTop-.024,d*.25,glow);
  const nicheBottom=baseTop+.02,nicheTop=h-.06,nicheH=nicheTop-nicheBottom;
  // One short-range light per unit illuminates the niche without shadow-map cost.
  const nicheLight=new THREE.PointLight(0xffd394,.65,nicheH*1.2,2);
  nicheLight.name='niche-light';nicheLight.position.set(altarX,h-.22,0);root.add(nicheLight);
  box(root,'ivory-backdrop',style==='asymmetric'?w*.50:w*.62,nicheH-.1,.012,altarX,nicheBottom+nicheH/2,-d/2+.035,white);
  for(const s of [-1,1])box(root,'warm-light-strip',.013,nicheH-.12,.008,altarX+s*(style==='asymmetric'?w*.26:w*.325),nicheBottom+nicheH/2,-d/2+.045,glow);
  emblem(root,altarX,baseTop+nicheH*.66,-d/2+.06,Math.min(altarW*.25,.25));
  if(style==='arch'||style==='asymmetric')lotus(root,altarX,baseTop+nicheH*.36,-d/2+.06,altarW*.18);
  for(const s of [-1,1]){
    cylinder(root,'downlight',.023,.023,.009,s*w*.32,h-.05,d*.10,glow);
    if(style!=='stool')bell(root,altarX+s*altarW*.29,h-.14,d*.08,style==='slats'?.45:style==='arch'?.28:.20);
    cylinder(root,'diya-base',.04,.055,.025,altarX+s*altarW*.29,baseTop+.035,d*.12);
    cylinder(root,'diya-stem',.008,.017,.10,altarX+s*altarW*.29,baseTop+.095,d*.12);
    const flame=ball(root,'diya-flame',.008,altarX+s*altarW*.29,baseTop+.195,d*.12,glow);flame.scale.set(.6,1.8,.6);
    cylinder(root,'diya-bowl',.044,.014,.035,altarX+s*altarW*.29,baseTop+.16,d*.12);
  }
  for(let i=0;i<(style==='stool'?3:2);i++)box(root,'altar-step',altarW*(.5-i*.09),.045,d*(.54-i*.08),altarX,baseTop+.02+.045*(i+.5),-d*.09,white);
  if(style!=='stool')idol(root,altarX,baseTop+.11,-d*.09);
  if(style==='slats'||style==='asymmetric'){
    for(const side of [-1,1])plant(root,altarX+side*altarW*.4,baseTop+.02,-d*.06);
  }
  if(style==='stool'){
    drawer(.73,.12);drawer(.59,.12);
    const stool=motion('pull-out-stool','stools','pz',0,0,0,d*.95);
    box(stool,'stool-seat',w-.14,.045,d-.10,0,.445,0,wood);
    box(stool,'stool-front-inset',w-.20,.32,.022,0,.24,d/2-.048,white);
    for(const s of [-1,1])box(stool,'stool-side',.03,.42,d-.10,s*(w/2-.085),.235,0,wood);
  }else if(style==='asymmetric'){
    // Staggered storage and an open, knee-height niche.
    drawer(.68,.22,w*.53,altarX);
    drawer(.34,.18,w*.30,-w*.32);
    box(root,'lower-counter',w*.33,.035,d-.025,-w*.32,.455,0,wood);
    box(root,'floating-base-light',w*.28,.009,.018,-w*.32,.237,d*.15,glow);
    box(root,'lower-open-shelf',w*.53,.026,d-.06,altarX,.27,0,white);
    box(root,'storage-divider',.025,.72,d-.035,-w*.17,.42,0);
  }else if(style==='screen'){
    box(root,'storage-floor',w-.055,.022,d-.06,0,.09,0);
    for(const s of [-1,1]){
      const dw=(w-.07)/2,g=motion('lower-cabinet-front','doors','ry',s*(w/2-.03),.35,d/2-.022,s*Math.PI*.52);
      box(g,'cabinet-leaf',dw-.004,.48,.025,-s*dw/2,0,0,wood);ball(g,'cabinet-knob',.014,-s*(dw-.04),0,.025);
    }
  }else if(style==='arch'){
    drawer(.66,.19);drawer(.43,.23,w-.09,0,true);drawer(.18,.23,w-.09,0,true);
  }else if(style==='slats'){
    // Low paired storage with the open offering recess seen in the reference.
    drawer(.23,.28,(w-.11)/2,-(w-.07)/4);drawer(.23,.28,(w-.11)/2,(w-.07)/4);
    box(root,'offering-shelf',w-.06,.022,d-.04,0,.40,0,wood);
    cylinder(root,'offering-plate',.065,.065,.012,-w*.22,.418,d*.12);
  }else {drawer(.43,.26);drawer(.16,.23);}
  if(['screen','bells','stool'].includes(style))for(const s of [-1,1]){
    const dw=(w-.065)/2,dh=nicheH-.02;
    const leaf=motion('shrine-hinged-front','doors','ry',s*(w/2-.028),nicheBottom+dh/2,d/2-.02,s*Math.PI*.56);
    const cx=-s*dw/2;
    for(const sign of [-1,1]){
      box(leaf,'leaf-stile',.03,dh,.028,cx+sign*(dw/2-.015),0,0,style==='stool'?white:wood);
      box(leaf,'leaf-rail',dw,.035,.028,cx,sign*(dh/2-.0175),0,style==='stool'?white:wood);
    }
    if(style==='bells'){
      for(const sign of [-1,1])box(leaf,'front-inset',dw-.07,dh*.27,.016,cx,sign*dh*.32,0,cream);
      for(const sign of [-1,1]){box(leaf,'bell-rail',dw-.06,.02,.025,cx,sign*dh*.12,0,wood);bell(leaf,cx,sign*dh*.12,0,.075);}
    }else if(style==='screen'){
      jaali(leaf,dw-.07,dh*.34,cx,-dh*.26,-.006);
      box(leaf,'decorative-inset',dw-.07,dh*.52,.012,cx,dh*.18,0,white);
      lotus(leaf,cx,dh*.30,.01,dw*.23,brass);
      // Raised elephant motif above the floral cutwork.
      const ear=ball(leaf,'elephant-ear',dw*.16,cx-dw*.06,dh*.12,.016);ear.scale.set(1,1.2,.12);
      curve(leaf,'elephant-trunk',[[cx+dw*.04,dh*.17,.017],[cx+dw*.12,dh*.06,.017],[cx+dw*.02,-dh*.02,.017],[cx-dw*.04,.005,.017]],dw*.032);
    }else jaali(leaf,dw-.07,dh-.1,cx,0,-.006);
    for(const sign of [-1,1])cylinder(leaf,'door-hinge',.007,.007,.045,0,sign*(dh/2-.12),-.004);
    ball(leaf,'front-knob',.016,-s*(dw-.04),-.08,.035);
  }
  if(style==='bells'||style==='asymmetric')for(const s of style==='bells'?[-1,1]:[-1])for(let i=0;i<3;i++){
    const x=s*w*.39,y=baseTop+.3+i*.36;
    box(root,'display-shelf',w*.18,.025,d*.48,x,y,-d*.20);
    box(root,'shelf-light',w*.14,.008,.02,x,y-.017,-d*.04,glow);
    if(style==='asymmetric'&&i!==1)plant(root,x,y+.013,-d*.15);
    else cylinder(root,'offering-vase',.018,.03,.07,x,y+.048,-d*.15,brass);
  }
  if(style==='arch'){
    for(const s of [-1,1])jaali(root,w*.12,nicheH-.08,s*w*.40,nicheBottom+nicheH/2,d*.10,cream);
    const shape=new THREE.Shape();shape.moveTo(-w/2,h-.055);shape.lineTo(w/2,h-.055);shape.lineTo(w/2,h-.31);
    shape.lineTo(w*.30,h-.31);shape.quadraticCurveTo(w*.25,h-.16,w*.12,h-.19);shape.quadraticCurveTo(0,h-.05,-w*.12,h-.19);shape.quadraticCurveTo(-w*.25,h-.16,-w*.30,h-.31);shape.lineTo(-w/2,h-.31);shape.closePath();
    for(let i=0;i<18;i++){
      const hole=new THREE.Path();hole.absellipse(-w*.44+i*w*.88/17,h-.083,.009,.015,0,Math.PI*2,true);shape.holes.push(hole);
    }
    add(root,'scalloped-arch',new THREE.ExtrudeGeometry(shape,{depth:.022,bevelEnabled:false}),cream,0,0,d/2-.026);
  }
  if(style==='asymmetric'){
    box(root,'jaali-backlight',w*.09,h-.12,.008,w*.43,h/2,d/2-.04,glow);
    jaali(root,w*.09,h-.12,w*.43,h/2,d/2-.02,wood);
  }
  if(style==='screen')for(const s of [-1,1]){
    const screen=new THREE.Group();screen.position.set(s*(w/2-.018),baseTop+nicheH/2,0);screen.rotation.y=s*Math.PI/2;root.add(screen);
    jaali(screen,d*.68,nicheH-.12,0,0,0,white);
    // Thin perforated inserts sit within the structural side frames.
  }
  root.scale.set(width/w,1,depth/d);
  root.userData={isInteractiveFurniture:true,poojaVariant:id,nominalHeight:h,dimensionStatus:spec.note};
  return root;
}
