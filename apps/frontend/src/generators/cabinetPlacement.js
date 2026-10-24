import { wardrobeConfigFromRoot } from './wardrobeConfig.js';

export const isCabinetItem=id=>/^wardrobe(?:-|$)|^loft-(?:teal-oak|charcoal-walnut)-/.test(id||'');
const axes=angle=>({u:{x:Math.cos(angle),z:-Math.sin(angle)},n:{x:Math.sin(angle),z:Math.cos(angle)}});
const dot=(a,b)=>a.x*b.x+a.z*b.z;
const support=(box,axis)=>{const {u,n}=axes(box.rotation);return Math.abs(dot(u,axis))*box.w/2+Math.abs(dot(n,axis))*box.d/2;};
export function cabinetBoxesOverlap(a,b,tolerance=1e-5) {
  if(a.y+a.h<=b.y+tolerance||b.y+b.h<=a.y+tolerance)return false;
  const aa=axes(a.rotation),bb=axes(b.rotation),delta={x:a.x-b.x,z:a.z-b.z};
  return [aa.u,aa.n,bb.u,bb.n].every(axis=>Math.abs(dot(delta,axis))<support(a,axis)+support(b,axis)-tolerance);
}

// Closed carcass dimensions, not animated fronts or a world-axis bounding box.
export function cabinetPlacementBoxes(roots=[]) {
  const boxes=[];
  for(const root of roots){
    if(!root.userData?.isWardrobe||root.userData.isHelper)continue;
    const c=wardrobeConfigFromRoot(root),rotation=root.rotation.y,{u,n}=axes(rotation);
    boxes.push({x:root.position.x,z:root.position.z,y:root.position.y,w:c.width,d:c.depth,h:c.height,rotation,id:root.userData.layoutId});
    if(c.loft.enabled){
      const l=c.loft,x=l.alignment==='left'?(l.width-c.width)/2:l.alignment==='right'?(c.width-l.width)/2:0,z=(l.depth-c.depth)/2;
      boxes.push({x:root.position.x+u.x*x+n.x*z,z:root.position.z+u.z*x+n.z*z,y:root.position.y+c.height,w:l.width,d:l.depth,h:l.height,rotation,id:root.userData.layoutId});
    }
  }
  return boxes;
}

function wallBox(wall){
  const dx=wall.end.x-wall.start.x,dz=wall.end.y-wall.start.y;
  return {x:(wall.start.x+wall.end.x)/2,z:(wall.start.y+wall.end.y)/2,y:0,w:Math.hypot(dx,dz),d:Number(wall.thickness)||.15,h:Number(wall.height)||3,rotation:-Math.atan2(dz,dx)};
}

export function snapCabinetPlacement(point,item,{walls=[],neighbours=[],rotation=0,maxWallDistance=2.5,snapDistance=.3}={}) {
  const height=item.h??(item.id?.startsWith('loft-')?.6:item.id?.includes('loft')?2.7:2.2);
  const base={x:point.x,z:point.z,y:item.elevation??0,w:item.w,d:item.d,h:height,rotation};
  const validWalls=walls.filter(w=>w.start&&w.end&&Math.hypot(w.end.x-w.start.x,w.end.y-w.start.y)>.05);
  let anchor=null;
  if(item.wallAttached!==false)for(const wall of validWalls){
    if(base.y>=(Number(wall.height)||3))continue;
    const dx=wall.end.x-wall.start.x,dz=wall.end.y-wall.start.y,len=Math.hypot(dx,dz),u={x:dx/len,z:dz/len};
    const along=Math.max(0,Math.min(len,(point.x-wall.start.x)*u.x+(point.z-wall.start.y)*u.z));
    const x=wall.start.x+u.x*along,z=wall.start.y+u.z*along,distance=Math.hypot(point.x-x,point.z-z);
    if(distance>maxWallDistance||anchor&&distance>=anchor.distance)continue;
    const side=(-u.z*(point.x-x)+u.x*(point.z-z))<0?-1:1,n={x:-u.z*side,z:u.x*side};
    anchor={wall,u,n,len,side,distance};
  }
  let candidate={...base},minAlong=-Infinity,maxAlong=Infinity;
  if(anchor){
    const {wall,u,n,len}=anchor,clearance=base.d/2+(Number(wall.thickness)||.15)/2;
    const origin={x:wall.start.x+n.x*clearance,z:wall.start.y+n.z*clearance};
    minAlong=base.w/2;maxAlong=len-base.w/2;
    candidate.rotation=Math.atan2(n.x,n.z);
    // Side walls at a corner tighten the available span by their actual faces.
    for(const other of validWalls){
      if(other===wall||base.y>=(Number(other.height)||3))continue;
      const box=wallBox(other),axis=axes(box.rotation),delta={x:point.x-box.x,z:point.z-box.z};
      if(Math.abs(dot(delta,axis.u))>box.w/2+base.w+base.d)continue;
      if(Math.abs(dot(delta,axis.n))>base.w+base.d+.3)continue;
      const side=dot(delta,axis.n)<0?-1:1,normal={x:axis.n.x*side,z:axis.n.z*side};
      const coefficient=dot(u,normal),needed=support(candidate,normal)+box.d/2-dot({x:origin.x-box.x,z:origin.z-box.z},normal);
      if(coefficient>.001)minAlong=Math.max(minAlong,needed/coefficient);
      else if(coefficient<-.001)maxAlong=Math.min(maxAlong,needed/coefficient);
    }
    if(minAlong>maxAlong+1e-6)return {...candidate,valid:false,reason:'This cabinet does not fit between these walls. Reduce its width or choose another space.'};
    const along=Math.max(minAlong,Math.min(maxAlong,(point.x-wall.start.x)*u.x+(point.z-wall.start.y)*u.z));
    candidate.x=origin.x+u.x*along;candidate.z=origin.z+u.z*along;
    candidate.wallId=wall.id;candidate.wallSide=anchor.side;
  }
  const choices=[];
  for(const other of neighbours){
    const a=axes(other.rotation),offset={x:candidate.x-other.x,z:candidate.z-other.z};
    if(anchor&&dot(a.n,anchor.n)<.999)continue;
    const backDifference=dot(offset,a.n)-(base.d-other.d)/2;
    if(Math.abs(backDifference)>snapDistance+base.d/2)continue;
    for(const side of [-1,1]){
      const across=side*(base.w+other.w)/2;
      if(Math.abs(dot(offset,a.u)-across)>Math.max(snapDistance,base.w/2))continue;
      const next={...candidate,rotation:other.rotation,
        x:other.x+a.u.x*across+a.n.x*(base.d-other.d)/2,z:other.z+a.u.z*across+a.n.z*(base.d-other.d)/2,neighbourId:other.id};
      // A wall remains the rear reference even when neighbouring depths differ.
      if(anchor){
        const along=(next.x-anchor.wall.start.x)*anchor.u.x+(next.z-anchor.wall.start.y)*anchor.u.z;
        if(along<minAlong-1e-6||along>maxAlong+1e-6)continue;
        if(Math.abs(backDifference)>.025)continue;
      }
      choices.push(next);
    }
  }
  const valid=box=>!neighbours.some(other=>cabinetBoxesOverlap(box,other))&&!validWalls.some(w=>cabinetBoxesOverlap(box,wallBox(w)));
  choices.sort((a,b)=>Math.hypot(a.x-point.x,a.z-point.z)-Math.hypot(b.x-point.x,b.z-point.z));
  const snapped=choices.find(valid);
  if(snapped)return {...snapped,valid:true};
  if(valid(candidate))return {...candidate,valid:true};
  return {...candidate,valid:false,reason:'This position overlaps a wall or cabinet. Move beside it or choose a smaller width.'};
}
