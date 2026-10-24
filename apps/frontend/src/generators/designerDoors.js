import * as THREE from 'three';

const grooveNames=['Triple top lines','Balanced bands','Three inset panels','Tall offset panel','Border & end bands','Offset crossbars','Staggered lines','Framed centre','Geometric steps','Vertical end grooves','Stacked borders','Vertical planks','Fine perimeter','Diagonal crown','Angled panels','Diagonal waist'];
const premiumNames=['Teak · Metal bands','Walnut · Chevron & Inlay','Oak · Square inlays','Walnut · Curved medallions','Walnut · Raised panels','Dark · Floral inlay','Teak · Double border','Walnut · Horizontal inserts','Teak · Tall dark insert','Walnut · Leaf inlay','Teak · Square accents','Walnut · Sculpted blocks','Oak · Slim side insert','Walnut · Offset squares','Teak · Twin gold strips','Walnut · Long vertical lines','Classic · Double entrance','Dark · Carved wave','Teak · Sweeping inlay','Walnut · Crescent inlay'];
export const DESIGNER_DOOR_CATALOG=[
  ...grooveNames.map((label,i)=>({id:`door-groove-${String(i+1).padStart(2,'0')}`,label:`Groove ${i+1} · ${label}`,family:'groove',pattern:i})),
  ...premiumNames.map((label,i)=>({id:`door-designer-${String(i+1).padStart(2,'0')}`,label,family:'premium',pattern:i})),
].map(s=>({...s,w:s.family==='premium'&&s.pattern===16?1.5:1,d:.16,h:2.4,icon:'🚪',note:'Reference-inspired design; dimensions and carving details are approximate.'}));
export const designerDoorSpec=id=>DESIGNER_DOOR_CATALOG.find(s=>s.id===id);

function timber(color){
  const data=new Uint8Array(64*256*4);
  for(let y=0;y<256;y++)for(let x=0;x<64;x++){
    const value=224+12*Math.sin(x*.7+Math.sin(y*.017)) + 5*Math.sin(x*2.2+y*.004),i=(y*64+x)*4;
    data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
  }
  const map=new THREE.DataTexture(data,64,256);map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
  return new THREE.MeshStandardMaterial({color,map,roughness:.46});
}

// A fixed jamb and independent leaves share the same opening dimensions.
export function createDesignerDoor(id,width,height=2.4,options={}){
  const spec=designerDoorSpec(id);if(!spec)return null;
  if(!Number.isFinite(width)||width<=.16||!Number.isFinite(height)||height<=.3)throw new RangeError('Door dimensions must be finite and large enough for the frame');
  const root=new THREE.Group();root.name=id;
  const dark=spec.family==='premium'&&[1,3,4,5,7,9,11,13,15,17,19].includes(spec.pattern);
  const wood=timber(dark?0x624028:0xa7743d),frame=timber(dark?0x432c20:0x805431);
  const shadow=new THREE.MeshStandardMaterial({color:0x2d2118,roughness:.75});
  const gold=new THREE.MeshStandardMaterial({color:0xbda367,metalness:.75,roughness:.28});
  const silver=new THREE.MeshStandardMaterial({color:0xb6bcbc,metalness:.8,roughness:.24});
  const insert=new THREE.MeshStandardMaterial({color:0x222b2c,roughness:.24,metalness:.25});
  const add=(parent,name,geometry,mat,x,y,z)=>{const m=new THREE.Mesh(geometry,mat);m.name=name;m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
  const box=(p,name,w,h,d,x,y,z,mat)=>add(p,name,new THREE.BoxGeometry(w,h,d),mat,x,y,z);
  const jamb=.045,thickness=.045;
  for(const side of [-1,1])box(root,'fixed-jamb',jamb,height,.14,side*(width/2-jamb/2),height/2,0,frame);
  box(root,'fixed-header',width-2*jamb,jamb,.14,0,height-jamb/2,0,frame);
  const double=spec.family==='premium'&&spec.pattern===16;
  const leafW=(width-2*jamb-(double?.008:.004))/(double?2:1),leafH=height-jamb-.012;
  const right=String(options.swingDir||'').startsWith('right');
  const sign=options.swingSign??(String(options.swingDir||'').endsWith('outside')?-1:1);
  for(let k=0;k<(double?2:1);k++){
    const atRight=double?k===1:right,dir=atRight?-1:1;
    const hinge=new THREE.Group();hinge.name='door-hinge';hinge.position.set(atRight?width/2-jamb-.002:-width/2+jamb+.002,.006,0);
    hinge.userData={_animType:'door',_animProp:'ry',_closedState:0,_openState:sign*dir*Math.PI/2,_animOpen:false};root.add(hinge);
    const leaf=new THREE.Group();leaf.name='door-leaf';leaf.scale.x=dir;hinge.add(leaf);
    box(leaf,'solid-door-leaf',leafW,leafH,thickness,leafW/2,leafH/2,0,wood);
    // Ornament on both faces stays attached to the leaf when opened.
    for(const face of [-1,1]){
      const z=face*(thickness/2+.0015),idx=spec.pattern;
      const line=(x1,y1,x2,y2,mat=shadow,size=.005)=>{
        const dx=(x2-x1)*leafW,dy=(y2-y1)*leafH;
        const m=box(leaf,'door-inlay',size,Math.hypot(dx,dy),.002,(x1+x2)*leafW/2,(y1+y2)*leafH/2,z,mat);m.rotation.z=-Math.atan2(dx,dy);
      };
      const rect=(x,y,w,h,raised=false)=>{
        if(raised)box(leaf,'raised-panel',w*leafW,h*leafH,.016,(x+w/2)*leafW,(y+h/2)*leafH,z+face*.008,frame);
        line(x,y,x+w,y);line(x+w,y,x+w,y+h);line(x+w,y+h,x,y+h);line(x,y+h,x,y);
      };
      const bands=ys=>ys.forEach(y=>line(.06,y,.94,y));
      const wave=(x,amount,mat=gold,r=.009)=>{
        const pts=[];for(let i=0;i<=24;i++){const t=i/24;pts.push(new THREE.Vector3((x+Math.sin(t*Math.PI*2)*amount)*leafW,(.06+t*.88)*leafH,z+face*.003));}
        add(leaf,'curved-inlay',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),64,r,6,false),mat,0,0,0);
      };
      const floral=(x)=>{
        line(x,.09,x,.91,gold,.004);
        for(let row=0;row<13;row++)for(const side of [-1,1]){
          const shape=new THREE.Shape();shape.moveTo(0,0);shape.quadraticCurveTo(.032,.018,.039,.056);shape.quadraticCurveTo(-.003,.04,0,0);
          const petal=add(leaf,'leaf-inlay',new THREE.ExtrudeGeometry(shape,{depth:.002,bevelEnabled:false}),gold,x*leafW,(.11+row*.06)*leafH,z+face*.002);petal.scale.x=side;petal.scale.z=face;
        }
      };
      if(spec.family==='groove'){
        switch(idx){
          case 0:bands([.76,.85,.94]);line(.18,.04,.18,.97);break;
          case 1:bands([.09,.16,.24,.62,.7,.93]);break;
          case 2:for(let i=0;i<3;i++)rect(.14,.1+i*.29,.72,.22);break;
          case 3:rect(.64,.1,.23,.82);break;
          case 4:bands([.08,.14,.9,.95]);line(.17,.04,.17,.97);break;
          case 5:line(.18,.08,.18,.94);line(.04,.85,.94,.85);line(.32,.51,.94,.51);line(.04,.19,.78,.19);break;
          case 6:line(.24,.9,.94,.9);line(.04,.66,.71,.66);line(.24,.55,.94,.55);line(.04,.21,.71,.21);break;
          case 7:rect(.22,.12,.70,.7);bands([.94,.07]);break;
          case 8:line(.4,.15,.4,.91);line(.04,.67,.65,.67);line(.65,.67,.65,.9);line(.65,.9,.94,.9);line(.4,.32,.94,.32);bands([.09]);break;
          case 9:for(const x of [.15,.35,.65,.85]){line(x,.04,x,.21);line(x,.81,x,.97);}bands([.24,.79]);break;
          case 10:rect(.2,.1,.7,.8);bands([.06,.17,.83,.95]);break;
          case 11:for(let i=1;i<7;i++)line(i/7,.02,i/7,.98);break;
          case 12:rect(.13,.07,.79,.87);bands([.10,.14,.89,.92]);break;
          case 13:for(const y of [.7,.77,.84])line(.18,y,.94,y+.12);line(.18,.06,.18,.96);break;
          case 14:for(let i=0;i<4;i++){const y=.08+i*.22;line(.13,y,.87,y+.09);line(.87,y+.09,.87,y+.19);line(.87,y+.19,.13,y+.10);line(.13,y+.10,.13,y);}break;
          case 15:line(.15,.06,.15,.94);line(.05,.48,.94,.58);line(.05,.44,.94,.54);break;
        }
      }else{
        switch(idx){
          case 0:for(let i=0;i<7;i++)line(.25,.15+i*.11,.89,.15+i*.11,silver,.009);break;
          case 1:for(let i=0;i<7;i++){const y=.12+i*.11;line(.08,y,.47,y+.13,gold);line(.47,y+.13,.61,y+.08,gold);}floral(.73);break;
          case 2:for(let i=0;i<14;i++)box(leaf,'square-inlay',leafW*.065,leafW*.065,.003,leafW*.83,leafH*(.1+i*.06),z,insert);break;
          case 3:wave(.70,.13);bands([.13,.26,.39,.52,.65,.78,.91]);for(const y of [.25,.76])add(leaf,'medallion',new THREE.CylinderGeometry(.035,.035,.004,24),gold,leafW*.79,y*leafH,z).rotation.x=Math.PI/2;break;
          case 4:for(let i=0;i<6;i++)rect(.15,.08+i*.145,.7,.11,true);break;
          case 5:wave(.22,.08,silver,.003);wave(.28,.08,silver,.003);floral(.8);break;
          case 6:rect(.1,.04,.80,.92);rect(.15,.07,.22,.86);for(let i=0;i<8;i++)line(.43,.12+i*.1,.88,.12+i*.1,silver,.004);break;
          case 7:for(let i=0;i<7;i++)box(leaf,'dark-horizontal-insert',leafW*.76,leafH*.05,.003,leafW*.5,leafH*(.14+i*.12),z,insert);break;
          case 8:box(leaf,'tall-dark-insert',leafW*.13,leafH*.88,.003,leafW*.8,leafH*.5,z,insert);bands([.12,.22,.32,.42,.52,.62,.72,.82,.92]);break;
          case 9:floral(.58);line(.48,.05,.48,.95,gold);line(.68,.05,.68,.95,gold);break;
          case 10:for(let i=0;i<5;i++)box(leaf,'square-inlay',leafW*.1,leafW*.1,.003,leafW*.77,leafH*(.4+i*.10),z,gold);line(.25,.07,.25,.93,gold);break;
          case 11:for(let j=0;j<6;j++)for(let i=0;i<3;i++)rect(.12+i*.26,.06+j*.15,.21,.12,true);break;
          case 12:box(leaf,'tall-dark-insert',leafW*.1,leafH*.94,.003,leafW*.15,leafH*.5,z,insert);bands([.1,.2,.3,.4,.5,.6,.7,.8,.9]);break;
          case 13:bands([.15,.27,.39,.51,.63,.75,.87]);for(let i=0;i<3;i++)box(leaf,'square-inlay',.045,.045,.003,leafW*.82,leafH*(.78+i*.06),z,gold);break;
          case 14:floral(.43);floral(.57);break;
          case 15:for(const x of [.12,.21,.32,.7])line(x,.04,x,.96,silver,.004);line(.06,.44,.94,.44,silver);break;
          case 16:rect(.12,.08,.76,.3,true);rect(.12,.43,.76,.47,true);for(let i=0;i<3;i++)rect(.2,.49+i*.13,.60,.09);break;
          case 17:wave(.6,.14,gold,.015);wave(.72,.14,silver,.005);floral(.3);break;
          case 18:bands(Array.from({length:20},(_,i)=>.04+i*.047));wave(.6,.15,gold,.023);wave(.67,.15,silver,.008);break;
          case 19:wave(.55,.23,gold,.03);wave(.62,.23,wood,.014);break;
        }
      }
      // Pull handles and lock escutcheons are modeled on both faces.
      const hx=leafW-.085,hy=leafH*.48,handleLength=spec.family==='groove'?.18:.46;
      for(const y of [hy-handleLength/2+.02,hy+handleLength/2-.02])box(leaf,'handle-mount',.022,.025,.035,hx,y,face*.041,spec.family==='groove'?insert:silver);
      box(leaf,'pull-handle',.017,handleLength,.023,hx,hy,face*.061,spec.family==='groove'?insert:silver);
      box(leaf,'lock-plate',.023,.052,.006,hx,hy-handleLength/2-.065,face*.026,silver);
      box(leaf,'key-slot',.003,.015,.001,hx,hy-handleLength/2-.065,face*.030,insert);
    }
  }
  root.userData={doorVariant:id,nominalHeight:height,dimensionStatus:spec.note,_isWinDoor:true};
  return root;
}

export function placeDesignerDoor(obj,opening){
  const spec=designerDoorSpec(obj.class);if(!spec)return null;
  const {x1=0,x2=0,y1=0,y2=0}=obj.bbox||{},cx=(x1+x2)/2,cz=(y1+y2)/2;
  let nearest=null,distance=Infinity;
  for(const wall of obj.walls||[]){
    if(!wall.start||!wall.end)continue;
    const dx=wall.end.x-wall.start.x,dz=wall.end.y-wall.start.y,len=dx*dx+dz*dz;if(!len)continue;
    const t=Math.max(0,Math.min(1,((cx-wall.start.x)*dx+(cz-wall.start.y)*dz)/len));
    const x=wall.start.x+t*dx,z=wall.start.y+t*dz,dist=Math.hypot(x-cx,z-cz);
    if(dist<distance){distance=dist;nearest={x,z,horizontal:Math.abs(dx)>=Math.abs(dz)};}
  }
  const horizontal=nearest?nearest.horizontal:Math.abs(x2-x1)>=Math.abs(y2-y1);
  const width=Math.max(.5,horizontal?Math.abs(x2-x1):Math.abs(y2-y1));
  let sign=String(obj.swingDir||'').endsWith('outside')?-1:1;
  if(!obj.swingDir||obj.swingDir==='auto'){
    if(obj.layoutCenter)sign=horizontal?(obj.layoutCenter.y>cz?-1:1):(obj.layoutCenter.x>cx?1:-1);
  }
  const root=createDesignerDoor(spec.id,width,opening.winTop-opening.sillBase,{swingDir:obj.swingDir,swingSign:sign});
  root.position.set(horizontal?cx:nearest?.x??cx,opening.sillBase,horizontal?nearest?.z??cz:cz);
  root.rotation.y=horizontal?0:-Math.PI/2;
  Object.assign(root.userData,{_wallHoriz:horizontal,_snapX:root.position.x,_snapZ:root.position.z,_placementX:root.position.x,_placementZ:root.position.z,objectType:spec.id,layoutId:obj.id});
  return root;
}
