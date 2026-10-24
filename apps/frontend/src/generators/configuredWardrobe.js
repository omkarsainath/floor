import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { normalizeWardrobeConfig } from './wardrobeConfig.js';
import { initializeWardrobeFinishes } from './wardrobeFinishes.js';
import { createWardrobeMirror } from './wardrobeMirror.js';
import { coverWardrobeFronts } from './wardrobeFronts.js';

export function createConfiguredWardrobe(type,input,options={}) {
  const c=normalizeWardrobeConfig(input),root=new THREE.Group();
  root.userData={isWardrobe:true,isStandaloneLoft:c.standalone,wardrobeVariant:type,
    wardrobeConfig:c,nominalHeight:c.height+(c.loft.enabled?c.loft.height:0)};
  const t=.022,gap=.004;
  const wood=new THREE.MeshStandardMaterial({color:0xb49b7a,roughness:.7});
  const inner=new THREE.MeshStandardMaterial({color:0xd2b994,roughness:.72});
  const front=new THREE.MeshStandardMaterial({color:0x233f4d,roughness:.5});
  const metal=new THREE.MeshStandardMaterial({color:0x27282a,roughness:.3,metalness:.65});
  const box=(name,w,h,d,x,y,z,material,parent,surface,section)=>{
    const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,1,Math.min(.0012,w/8,h/8,d/8)),material);
    mesh.name=name;mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.userData={panelSize:[w,h,d],defaultLaminate:material===front?'gl-467-sat':'gl-5106-brl'};
    if(surface)mesh.userData.wardrobeSurfaceSpec=surface;
    if(section)mesh.userData.wardrobeSectionId=section;
    parent.add(mesh);return mesh;
  };
  const handleOffset=(value,panelHeight,handleHeight)=>{const limit=Math.max(0,(panelHeight-handleHeight)/2-.02);return Math.max(-limit,Math.min(limit,value??0));};
  const surface=(id,label,group,face=4)=>({id,label,group,face});
  const moving=(name,part,prop,closed,open,x,y,z,parent,section)=>{
    const node=new THREE.Group();node.name=name;node.position.set(x,y,z);
    node.userData={_animType:'wardrobe',_animProp:prop,_closedState:closed,_openState:open,_animOpen:false,wardrobePart:part,wardrobeSectionId:section};
    parent.add(node);return node;
  };
  function addMirror(parent,x,width,height,mirror,z) {
    if(mirror?.mode==='none'||!mirror)return;
    const w=mirror.mode==='custom'?mirror.width:Math.max(.05,width-.04);
    const h=mirror.mode==='custom'?mirror.height:Math.max(.05,height-.04);
    const frame=box('door-mirror-frame',w+.008,h+.008,.006,x,0,z,metal,parent);frame.userData.fitDoor=mirror.mode==='fit';
    const mesh=createWardrobeMirror(w,h);mesh.position.set(x,0,z+.007);mesh.userData.fitDoor=mirror.mode==='fit';parent.add(mesh);
  }
  function buildModule({width,height,depth,x=0,y=0,z=0,sections,loft=false,opening='hinged',prefix=''}) {
    const module=new THREE.Group();module.name=loft?'loft-module':'wardrobe-module';module.position.set(x,y,z);root.add(module);
    module.userData.wardrobeModule=loft?'loft':'main';
    module.userData.wardrobeBounds={width,height,bottom:loft?0:.08};
    const base=loft?0:.08,group='Carcass';
    // Fit the back and sides between the caps: overlapping outer faces flicker
    // when the camera moves, especially after applying contrasting laminates.
    box(prefix+'back',width-2*t,height-base-2*t,t,0,(height+base)/2,-depth/2+t/2,wood,module,surface(prefix+'back',loft?'Loft back':'Outside back',group,5));
    for(const side of [-1,1])box(prefix+'side',t,height-base-2*t,depth,side*(width-t)/2,(height+base)/2,0,wood,module,
      surface(prefix+(side<0?'side-left':'side-right'),`${loft?'Loft ':''}${side<0?'left':'right'} side`,group,side<0?1:0));
    box(prefix+'top',width,t,depth,0,height-t/2,0,wood,module,surface(prefix+'top',loft?'Loft top':'Top panel',group,2));
    box('bottom',width,t,depth,0,base+t/2,0,inner,module);
    if(!loft)box('plinth',width-.028,base,depth-.035,0,base/2,-.0175,front,module,surface('plinth','Plinth',group));
    let cursor=-width/2;
    sections.forEach((s,i)=>{
      const sectionGroup=new THREE.Group();sectionGroup.name=`section-${s.id}`;sectionGroup.userData.wardrobeSectionId=s.id;module.add(sectionGroup);
      const left=cursor+(i===0?t:t/2),right=cursor+s.width-(i===sections.length-1?t:t/2),middle=(left+right)/2;
      cursor+=s.width;
      if(i)box('divider',t,height-base-t,depth-2*t,left-t/2,(height+base-t)/2,0,inner,sectionGroup,null,s.id);
      const shelf=level=>box('shelf',right-left,t,depth-2*t,middle,level,0,inner,sectionGroup,null,s.id);
      const hasDrawers=['mixed','drawers','dressing','shelves'].includes(s.front);
      const drawerTop=s.front==='drawers'?height-t:base+s.drawerHeight;
      if(hasDrawers){
        const dh=(drawerTop-base)/s.drawerCount,trayDepth=depth*.72;
        shelf(drawerTop);
        for(let j=0;j<s.drawerCount;j++){
          const cy=base+(j+.5)*dh,dw=right-left-gap;
          const node=moving(`section-${s.id}-drawer-${j+1}`,'drawers','pz',0,depth*.65,0,0,0,sectionGroup,s.id);
          box('drawer-front',dw,dh-gap,t,middle,cy,depth/2+t/2,front,node,
            surface(s.drawerIds[j],`Section ${i+1} · Drawer ${j+1}`,'Drawer fronts'),s.id);
          if(s.drawerHandles!==false)box('drawer-handle',Math.min(s.drawerHandleLength??dw*.5,dw-.04),s.drawerHandleThickness??.016,s.drawerHandleDepth??.034,middle,cy+handleOffset(s.drawerHandleOffsetY,dh-gap,s.drawerHandleThickness??.016),depth/2+.013+(s.drawerHandleDepth??.034)/2,metal,node);
          const bottom=cy-dh/2+t*1.5,trayH=dh*.6;
          box('drawer-bottom',dw-2*t,t,trayDepth,middle,bottom,depth/2-trayDepth/2,inner,node);
          for(const xx of [left+t/2,right-t/2])box('drawer-side',t,trayH,trayDepth,xx,bottom+trayH/2,depth/2-trayDepth/2,inner,node);
          box('drawer-back',dw-2*t,trayH,t,middle,bottom+trayH/2,depth/2-trayDepth,inner,node);
        }
      }
      const doorBottom=hasDrawers?drawerTop+.025:loft?t:base;
      const doorTop=loft?height-t:height;
      if(['door','mixed'].includes(s.front)){
        const dw=right-left-gap,dh=doorTop-doorBottom-gap,cy=(doorBottom+doorTop)/2;
        const side=s.hinge==='right'?-1:1;
        const isSliding=opening==='sliding'&&sections.length>1;
        const id=loft?`loft-${s.id}`:`door-${s.id}`;
        const pivot=isSliding?
          moving(`sliding-leaf-${s.id}`,loft?'loft':'doors','px',middle,i===sections.length-1?-width/2+dw/2:width/2-dw/2,middle,cy,depth/2+t/2+i*.06,sectionGroup,s.id):
          moving(`${loft?'loft':'main'}-leaf-${s.id}`,loft?'loft':'doors','ry',0,-side*Math.PI/2,side===1?left:right,cy,depth/2+t/2,sectionGroup,s.id);
        const offset=isSliding?0:side*dw/2;
        box('door-front',dw,dh,t,offset,0,0,front,pivot,surface(id,`${loft?'Loft door':'Door'} ${i+1}`,loft?'Loft doors':'Main doors'),s.id);
        if(s.doorHandle!==false)box('door-handle',s.doorHandleThickness??.016,Math.min(s.doorHandleLength??Math.min(.65,dh*.4),dh-.04),s.doorHandleDepth??.032,offset+side*(dw/2-.045),handleOffset(s.doorHandleOffsetY,dh,Math.min(s.doorHandleLength??Math.min(.65,dh*.4),dh-.04)),.012+(s.doorHandleDepth??.032)/2,metal,pivot);
        addMirror(pivot,offset,dw,dh,s.mirror,t/2+.003);
        shelf(Math.max(doorBottom+t,doorTop-.22));
        if(dh>.6){
          const rail=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,Math.max(.05,dw-2*t),12),metal);
          rail.name='hanging-rail';rail.rotation.z=Math.PI/2;rail.position.set(middle,doorTop-.34,0);sectionGroup.add(rail);
        }
      }else if(s.front==='dressing'){
        const h=doorTop-doorBottom-.08,w=right-left-.08;
        const holder=new THREE.Group();holder.position.set(middle,(doorTop+doorBottom)/2,-depth/2+t);sectionGroup.add(holder);
        addMirror(holder,0,w,h,{mode:'fit'},.01);shelf(doorBottom);
      }else if(s.front==='open'||s.front==='shelves'){
        const bottom=hasDrawers?drawerTop:base;
        for(let j=1;j<=3;j++)shelf(bottom+(doorTop-bottom)*j/4);
      }
    });
    return module;
  }
  buildModule({width:c.width,height:c.height,depth:c.depth,sections:c.sections,loft:c.standalone,opening:c.opening});
  if(c.loft.enabled){
    const l=c.loft,x=l.alignment==='left'?(l.width-c.width)/2:l.alignment==='right'?(c.width-l.width)/2:0;
    buildModule({width:l.width,height:l.height,depth:l.depth,x,y:c.height,z:(l.depth-c.depth)/2,loft:true,prefix:'loft-',
      sections:Array.from({length:l.count},(_,i)=>({id:String(i+1),width:l.width/l.count,front:'door',hinge:i%2?'right':'left',doorHandle:l.handles,doorHandleLength:l.handleLength,doorHandleThickness:l.handleThickness,doorHandleDepth:l.handleDepth,doorHandleOffsetY:l.handleOffsetY,mirror:{mode:'none'}}))});
  }
  coverWardrobeFronts(root);
  initializeWardrobeFinishes(root,options);
  // Materials used solely for identifying defaults are not retained by a mesh.
  const used=new Set();root.traverse(n=>{for(const m of Array.isArray(n.material)?n.material:[n.material])if(m)used.add(m);});
  for(const m of [wood,front,inner,metal])if(!used.has(m))m.dispose();
  return root;
}
