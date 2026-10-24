import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createPoojaUnit } from './pooja.js';

// Dimensions are modeling defaults in metres, not the room sizes on the reference cards.
export const TV_UNIT_CATALOG = [
  ['green-library','Green · Bookshelf & Slats',3.0,2.4],
  ['oak-marble','Oak · Marble & Sconces',3.0,2.5],
  ['botanical','Green · Botanical & Rounded Panel',2.8,2.4],
  ['blue-towers','Blue · Twin Towers & Backlit Panel',3.2,2.5],
  ['grey-fluted','Grey · Fluted Wall & Tall Cabinet',2.8,2.4],
  ['green-backlit','Green · Backlit Panel & Library',2.8,2.4],
  ['lilac-oak','Lilac · Fluted Drawers & Oak',2.8,2.4],
  ['classic-floral','Ivory · Floral & Brass',2.8,2.4],
  ['grey-display','Grey · Gold-framed Glass Display',2.8,2.4],
  ['wood-mustard','Wood · Mustard Drawers & Library',3.0,2.4],
  ['brown-arch','Walnut · Rounded Backboard',2.6,2.4],
  ['beige-pillars','Beige · Charcoal Fluted Pillars',2.8,2.5],
  ['terracotta','Blue · Terracotta Arch',2.8,2.5],
  ['champagne-pooja','Champagne · TV & Pooja',3.6,2.5],
  ['white-display','White · Glass Display & Open Shelves',3.0,2.4],
  ['scandi-walnut','White & Walnut · Illuminated Shelves',2.8,2.4],
].map(([style,label,w,h])=>({id:`tv-unit-${style}`,style,label,w,h,d:.48,icon:'📺',wallAttached:true,
  note:'Reference-inspired proportions and decorative details; dimensions are approximate.'}));

function surface(color, kind) {
  const pixels = new Uint8Array(128*256*4);
  for(let y=0;y<256;y++)for(let x=0;x<128;x++){
    const wave=kind==='marble'
      ? Math.pow(Math.abs(Math.sin(x*.045+y*.019+.5*Math.sin(y*.05)+.25*Math.sin(x*.08+y*.13)+.15*Math.sin(y*.3))),140)
      : .5+.3*Math.sin(x*.6+Math.sin(y*.023))+.15*Math.sin(x*1.9+y*.007);
    const v=kind==='marble'?247-48*wave:218+28*wave, i=(y*128+x)*4;
    pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;
  }
  const map=new THREE.DataTexture(pixels,128,256);map.colorSpace=THREE.SRGBColorSpace;
  map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
  return new THREE.MeshStandardMaterial({color,map,roughness:kind==='marble'?.32:.55});
}

export function createTvUnit(id,width,depth){
  const spec=TV_UNIT_CATALOG.find(s=>s.id===id);if(!spec)return null;
  if(!Number.isFinite(width)||!Number.isFinite(depth)||width<=0||depth<=0)throw new RangeError('TV unit footprint must be positive and finite');
  const {w,d,h,style}=spec,root=new THREE.Group();root.name=id;
  const material=(color,roughness=.55,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const oak=surface(0xb68d5f,'wood'),walnut=surface(0x68472f,'wood'),ivory=material(0xeee7d9),stone=surface(0xe4d8c5,'marble');
  const gold=material(0xb59a59,.27,.72),black=material(0x131719,.3),green=material(0x415f53),blue=material(0x354751),grey=material(0x686960);
  const lilac=material(0x92838d),charcoal=material(0x343b3a),mustard=material(0xc59b36),terracotta=material(0xa74a27);
  const glow=new THREE.MeshStandardMaterial({color:0xffe5b1,emissive:0xffce83,emissiveIntensity:1.4});
  const glass=new THREE.MeshStandardMaterial({color:0x82948c,transparent:true,opacity:.2,roughness:.12,metalness:.15,depthWrite:false});
  const add=(p,name,geometry,mat,x,y,z)=>{const m=new THREE.Mesh(geometry,mat);m.name=name;m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;p.add(m);return m;};
  const box=(p,name,sx,sy,sz,x,y,z,mat=ivory)=>add(p,name,new THREE.BoxGeometry(sx,sy,sz),mat,x,y,z);
  const round=(p,name,sx,sy,sz,r,x,y,z,mat)=>add(p,name,new RoundedBoxGeometry(sx,sy,sz,3,r),mat,x,y,z);
  const cylinder=(p,name,rt,rb,height,x,y,z,mat=gold)=>add(p,name,new THREE.CylinderGeometry(rt,rb,height,20),mat,x,y,z);
  const ball=(p,name,r,x,y,z,mat=ivory)=>add(p,name,new THREE.SphereGeometry(r,16,12),mat,x,y,z);
  const backZ=-d/2+.025,front=d/2-.035;
  function motion(name,part,x,y,z,prop,travel){
    const g=new THREE.Group();g.name=name;g.position.set(x,y,z);const closed=prop==='pz'?z:0;
    g.userData={_animType:'furniture',_animProp:prop,_closedState:closed,_openState:closed+travel,_animOpen:false,furniturePart:part};root.add(g);return g;
  }
  function flutes(x,y,pw,ph,mat,z=backZ+.032){
    const n=Math.max(2,Math.floor(pw/.026));
    box(root,'fluted-backing',pw,ph,.012,x,y,z-.009,mat);
    for(let i=0;i<n;i++)box(root,'wall-flute',pw/n*.55,ph,.018,x-pw/2+(i+.5)*pw/n,y,z+.006,mat);
  }
  function panel(x,y,pw,ph,mat=ivory,r=.008,lit=false){
    // Extrude a rounded 2D outline: a thin 3D rounded box would clamp the
    // corner radius to half its thickness and lose the reference silhouette.
    const plate=(name,width,height,thickness,radius,z,material)=>{
      const hw=width/2,hh=height/2,cr=Math.min(radius,hw,hh),shape=new THREE.Shape();
      shape.moveTo(-hw+cr,-hh);shape.lineTo(hw-cr,-hh);shape.quadraticCurveTo(hw,-hh,hw,-hh+cr);
      shape.lineTo(hw,hh-cr);shape.quadraticCurveTo(hw,hh,hw-cr,hh);
      shape.lineTo(-hw+cr,hh);shape.quadraticCurveTo(-hw,hh,-hw,hh-cr);
      shape.lineTo(-hw,-hh+cr);shape.quadraticCurveTo(-hw,-hh,-hw+cr,-hh);shape.closePath();
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:12});
      // ExtrudeGeometry uses world-sized UVs; normalize them for each panel
      // so a large marble panel does not stretch clamped texture edges.
      const uv=geometry.attributes.uv,positions=geometry.attributes.position;
      for(let i=0;i<uv.count;i++)uv.setXY(i,(positions.getX(i)+hw)/width,(positions.getY(i)+hh)/height);
      return add(root,name,geometry,material,x,y,z);
    };
    if(lit)plate('panel-backlight',pw+.028,ph+.028,.012,r+.014,backZ+.004,glow);
    return plate('tv-backboard',pw,ph,.04,r,backZ+.022,mat);
  }
  function plant(x,y,z){
    cylinder(root,'planter',.047,.035,.085,x,y+.042,z,ivory);
    for(let i=0;i<7;i++){
      const a=i*2.4,leaf=ball(root,'plant-leaf',.036,x+Math.cos(a)*.045,y+.12+(i%3)*.022,z+Math.sin(a)*.04,green);
      leaf.scale.set(.45,1.4,.2);leaf.rotation.z=Math.sin(a)*.7;
    }
  }
  function decor(x,y,z,index){
    if(index%3===0){
      for(let i=0;i<4;i++){
        const book=box(root,'display-book',.027,.13+(i%2)*.025,.085,x-.055+i*.032,y+.07,z,[ivory,blue,oak,grey][i]);
        if(i===3)book.rotation.z=-.12;
      }
    }else if(index%3===1){
      cylinder(root,'display-vase',.021,.043,.115,x,y+.057,z,index%2?ivory:gold);
      cylinder(root,'vase-neck',.018,.021,.035,x,y+.125,z,ivory);
    }else plant(x,y,z);
  }
  function tower(x,bottom,tw,th,mat=oak,door=false){
    const td=d*.66,z=backZ+td/2;
    box(root,'tower-back',tw,th,.018,x,bottom+th/2,backZ,mat);
    for(const side of [-1,1])box(root,'tower-side',.022,th,td,x+side*(tw/2-.011),bottom+th/2,z,mat);
    for(let i=0;i<=5;i++){
      const y=bottom+.012+i*(th-.024)/5;
      box(root,'display-shelf',tw-.04,.022,td,x,y,z,mat);
      if(i<5)decor(x,y+.012,z,i);
      if(i>0)box(root,'shelf-light',tw-.065,.006,.012,x,y-.016,z+td*.35,glow);
    }
    if(door){
      const leaf=motion('display-door','doors',x+tw/2,bottom+th/2,z+td/2+.012,'ry',Math.PI*.55);
      box(leaf,'display-glass',tw-.034,th-.04,.008,-tw/2,0,0,glass).castShadow=false;
      for(const side of [-1,1]){
        box(leaf,'door-frame',.014,th,.018,-tw/2+side*(tw/2-.007),0,0,gold);
        box(leaf,'door-frame',tw,.014,.018,-tw/2,side*(th/2-.007),0,gold);
      }
      box(leaf,'door-handle',.009,.13,.018,-tw+.04,0,.019,gold);
    }
  }
  function drawer(x,y,dw,dh,mat,fluted=false){
    const g=motion('console-drawer','drawers',x,y,front,'pz',d*.72),trayD=d-.10;
    box(g,'drawer-front',dw,dh,.024,0,0,0,mat);
    box(g,'drawer-bottom',dw-.03,.016,trayD,0,-dh/2+.016,-trayD/2,oak);
    box(g,'drawer-back',dw-.03,dh-.024,.016,0,0,-trayD,oak);
    for(const side of [-1,1])box(g,'drawer-side',.015,dh-.024,trayD,side*(dw/2-.02),0,-trayD/2,oak);
    if(fluted)for(let dx=-dw/2+.014;dx<dw/2-.01;dx+=.021)box(g,'drawer-flute',.011,dh-.01,.008,dx,0,.016,mat);
    box(g,'drawer-handle',Math.min(.12,dw*.25),.008,.016,0,dh*.19,.026,gold);
  }
  let consoleTop;
  function consoleUnit(x,bottom,cw,ch,mat,options={}){
    const {count=3,open=[],fluted=false,frame=oak}=options;
    consoleTop={x,width:cw,y:bottom+ch};
    const mid=bottom+ch/2,cell=(cw-.044)/count;
    box(root,'console-back',cw,ch,.018,x,mid,backZ+.005,frame);
    for(const side of [-1,1])box(root,'console-side',.022,ch,d-.055,x+side*(cw/2-.011),mid,0,frame);
    for(const side of [-1,1])box(root,'console-slab',cw,.022,d-.055,x,mid+side*(ch/2-.011),0,frame);
    for(let i=0;i<count;i++){
      const cx=x-cw/2+.022+cell*(i+.5);
      if(i)box(root,'console-divider',.016,ch-.04,d-.07,x-cw/2+.022+cell*i,mid,0,frame);
      if(open.includes(i)){
        box(root,'media-receiver',Math.min(.24,cell*.75),.045,.14,cx,bottom+.045,.04,black);
        box(root,'receiver-indicator',.018,.004,.001,cx+.035,bottom+.048,.1106,glow);
      }else drawer(cx,mid,cell-.02,ch-.047,mat,fluted);
    }
    box(root,'console-underlight',cw-.06,.006,.012,x,bottom-.005,-.02,glow);
  }
  function screen(x,y,sw){
    const sh=sw*9/16,z=backZ+.128;
    box(root,'tv-mount',sw*.4,sh*.4,.05,x,y,z-.045,black);
    round(root,'television',sw,sh,.039,.014,x,y,z,black);
    const display=material(0x111819,.17,.12);
    box(root,'tv-screen',sw-.025,sh-.025,.002,x,y,z+.0205,display);
    ball(root,'tv-status-led',.0025,x+sw*.38,y-sh/2+.005,z+.022,glow);
  }
  function botanical(x,pw,floral=false){
    box(root,'pattern-backing',pw,h-.10,.012,x,h/2,backZ+.013,ivory);
    for(let row=0;row<9;row++)for(let col=0;col<3;col++){
      const px=x-pw*.34+col*pw*.34,py=.14+row*(h-.24)/9;
      const stem=box(root,'botanical-stem',.003,.18,.003,px,py,backZ+.022,gold);stem.rotation.z=.3;
      for(const side of [-1,1]){
        const leaf=ball(root,'botanical-leaf',.035,px+side*.028,py+side*.025,backZ+.024,floral?gold:green);
        leaf.scale.set(.5,1,.04);leaf.rotation.z=side*.7;
      }
      if(floral)for(let petal=0;petal<5;petal++){
        const a=petal*Math.PI*2/5;
        const flower=ball(root,'flower-petal',.018,px+Math.cos(a)*.024,py+.085+Math.sin(a)*.024,backZ+.025,mustard);flower.scale.z=.1;
      }
    }
  }
  // Full-height backing establishes a predictable wall-aligned footprint.
  box(root,'wall-backing',w,h,.02,0,h/2,-d/2+.01,ivory);
  let tvX=0,tvY=1.35,tvW=w*.53;
  if(style==='green-library'){
    flutes(w*.34,h/2,w*.25,h,walnut);tower(-w*.39,.10,w*.21,1.95,walnut);
    consoleUnit(w*.105,.43,w*.77,.27,green,{fluted:true,frame:walnut});tvX=w*.10;
  }else if(style==='oak-marble'){
    panel(0,h/2,w*.64,h-.06,stone);
    for(const side of [-1,1]){
      flutes(side*w*.415,h/2,w*.16,h-.04,oak);
      cylinder(root,'sconce-base',.03,.03,.11,side*w*.415,1.65,backZ+.065,gold);
      box(root,'sconce-light',.009,.6,.009,side*w*.415,1.65,backZ+.085,glow);
    }
    consoleUnit(0,.025,w*.92,.30,oak,{frame:oak});consoleUnit(0,.43,w*.68,.23,ivory,{frame:ivory});
  }else if(style==='botanical'){
    botanical(w*.31,w*.36);tower(-w*.405,.35,w*.15,1.70,ivory);
    panel(w*.045,1.40,w*.62,1.12,stone,.15,true);tvX=w*.045;
    consoleUnit(w*.065,.36,w*.69,.32,green,{count:4,open:[0,3],fluted:true,frame:ivory});
  }else if(style==='blue-towers'){
    panel(0,1.23,w*.51,2.26,stone,.24,true);
    panel(0,2.38,w*.51,.18,stone,.075,true);
    for(const side of [-1,1])tower(side*w*.385,.05,w*.21,1.97,oak);
    consoleUnit(0,.04,w*.55,.32,blue,{count:4,frame:blue});tvW=w*.47;tvY=1.19;
  }else if(style==='grey-fluted'){
    flutes(-w*.33,h/2,w*.30,h,ivory);panel(.05,h/2,w*.55,h-.08,ivory);
    tower(w*.375,.42,w*.22,1.56,walnut);consoleUnit(-w*.08,.42,w*.70,.27,grey,{count:2,frame:walnut});tvX=-w*.08;
    const leaf=motion('tall-cabinet-door','doors',w*.485,1.20,front,'ry',Math.PI*.55);
    box(leaf,'cabinet-front',w*.105,1.56,.021,-w*.0525,0,0,grey);box(leaf,'door-handle',.008,.1,.019,-w*.083,-.47,.02,black);
  }else if(style==='green-backlit'){
    panel(0,1.27,w*.92,2.20,ivory,.012,true);tower(-w*.38,.07,w*.19,2.05,oak);
    consoleUnit(w*.10,.06,w*.73,.37,green,{open:[2],frame:oak});tvX=w*.10;
  }else if(style==='lilac-oak'){
    tower(-w*.40,.42,w*.17,1.80,oak);consoleUnit(w*.07,.42,w*.75,.35,lilac,{open:[1],fluted:true});tvX=w*.07;
    flutes(w*.465,h/2,w*.055,h,lilac);
  }else if(style==='classic-floral'){
    for(const side of [-1,1])botanical(side*w*.37,w*.19,true);
    panel(0,1.35,w*.52,1.95,ivory);
    for(const side of [-1,1])box(root,'classic-moulding',.009,1.94,.016,side*w*.265,1.35,backZ+.035,stone);
    consoleUnit(0,.17,w*.87,.47,ivory,{count:4,open:[3],fluted:true,frame:ivory});
  }else if(style==='grey-display'){
    panel(w*.14,h/2,w*.33,h-.06,green);tower(w*.405,.40,w*.17,1.64,grey,true);
    consoleUnit(-w*.09,.40,w*.73,.31,grey,{open:[1],frame:grey});tvX=-w*.09;
  }else if(style==='wood-mustard'){
    flutes(-w*.36,h/2,w*.23,h,grey);panel(-w*.08,1.38,w*.66,1.23,ivory);
    tower(w*.405,.10,w*.17,1.90,walnut);consoleUnit(-w*.07,.10,w*.82,.33,mustard,{count:4,open:[0,2],frame:walnut});tvX=-w*.07;
  }else if(style==='brown-arch'){
    panel(w*.09,1.27,w*.63,1.53,oak,.25,true);tower(-w*.37,.47,w*.19,1.52,walnut);
    consoleUnit(w*.03,.47,w*.82,.31,walnut,{open:[2],frame:oak});tvX=w*.09;
  }else if(style==='beige-pillars'){
    for(const side of [-1,1]){
      flutes(side*w*.36,h/2,w*.13,h,charcoal);
      box(root,'pillar-backlight',.012,h-.04,.008,side*w*.285,h/2,backZ+.008,glow);
    }
    consoleUnit(0,.42,w*.56,.40,ivory,{count:3,open:[0,2],fluted:true,frame:oak});tvW=w*.48;
  }else if(style==='terracotta'){
    panel(w*.28,h/2,w*.43,h-.04,terracotta,.34);
    tower(-w*.39,.27,w*.18,1.96,oak,true);consoleUnit(w*.07,.27,w*.72,.38,blue,{count:2,frame:blue});tvX=w*.04;
    for(let i=0;i<3;i++){
      const x=w*.33+i*.055,y=1.9-i*.19;
      cylinder(root,'pendant-cord',.002,.002,h-y,x,(h+y)/2,backZ+.095,black);
      ball(root,'pendant-globe',.038,x,y,backZ+.095,glow);
    }
  }else if(style==='champagne-pooja'){
    const shrineW=w*.27,shrine=createPoojaUnit('pooja-arched-fluted',shrineW,d*.96);
    shrine.name='integrated-pooja';shrine.position.x=-w/2+shrineW/2+.015;root.add(shrine);
    flutes(-w*.02,h/2,w*.30,h,ivory);panel(w*.325,h/2,w*.34,h-.02,stone);
    consoleUnit(w*.14,.35,w*.69,.27,ivory,{frame:ivory});tvX=w*.14;tvW=w*.46;
  }else if(style==='white-display'){
    tower(-w*.405,.55,w*.17,1.76,ivory);tower(-w*.22,.55,w*.18,1.76,ivory,true);
    panel(w*.19,1.43,w*.59,1.76,ivory);consoleUnit(0,.04,w*.95,.48,ivory,{count:4,open:[2],frame:ivory});tvX=w*.19;tvW=w*.49;
  }else if(style==='scandi-walnut'){
    tower(w*.405,.65,w*.17,1.73,oak);consoleUnit(0,.28,w*.95,.39,ivory,{count:4,open:[1],frame:oak});tvX=-w*.07;
  }
  screen(tvX,tvY,tvW);
  // Accessories stay below the screen and behind the moving fronts.
  if(style!=='champagne-pooja')plant(consoleTop.x-consoleTop.width*.35,consoleTop.y,backZ+.13);
  root.scale.set(width/w,1,depth/d);
  root.userData={isInteractiveFurniture:true,tvUnitVariant:id,nominalHeight:h,dimensionStatus:spec.note};
  return root;
}
