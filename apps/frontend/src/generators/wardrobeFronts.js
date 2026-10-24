import * as THREE from 'three';

// Full-overlay fronts cover carcass edges, leaving only a 1 mm operating seam.
export function coverWardrobeFronts(root,{width,height,bottom=.08,splitHeight=null}={}) {
  root.updateMatrixWorld(true);
  const modules=root.children.filter(n=>n.userData.wardrobeBounds);
  for(const module of modules.length?modules:[root]){
    const bounds=module.userData.wardrobeBounds||{width,height,bottom},panels=[];
    module.traverse(mesh=>{
      if(!mesh.isMesh||!['door-front','sliding-front','drawer-front'].includes(mesh.name))return;
      const center=module.worldToLocal(mesh.getWorldPosition(new THREE.Vector3())),[w,h]=mesh.userData.panelSize;
      panels.push({mesh,cx:center.x,cy:center.y,w,h,left:center.x-w/2,right:center.x+w/2,low:center.y-h/2,high:center.y+h/2});
    });
    // A tall door may border both a door and narrower drawer fronts. Share
    // one boundary across all of them instead of choosing a different midpoint.
    const joins=[];
    for(let i=0;i<panels.length;i++)for(let j=0;j<panels.length;j++){
      const a=panels[i],b=panels[j];
      if(i===j||Math.min(a.high,b.high)-Math.max(a.low,b.low)<=.01||b.left<a.right-1e-6||b.left-a.right>=.1)continue;
      const keys=new Set([`${i}:right`,`${j}:left`]);
      for(let k=joins.length-1;k>=0;k--)if([...keys].some(key=>joins[k].has(key))){
        for(const key of joins[k])keys.add(key);joins.splice(k,1);
      }
      joins.push(keys);
    }
    const edges=new Map();
    for(const group of joins){
      const values=[...group].map(key=>{const [i,side]=key.split(':');return panels[i][side];});
      const boundary=(Math.min(...values)+Math.max(...values))/2;
      for(const key of group)edges.set(key,boundary);
    }
    for(const p of panels){
      let {left,right,low,high}=p;
      if(Math.abs(left+bounds.width/2)<.075)left=-bounds.width/2;
      if(Math.abs(right-bounds.width/2)<.075)right=bounds.width/2;
      if(Math.abs(high-bounds.height)<.075)high=bounds.height;
      if(Math.abs(low-bounds.bottom)<.075)low=bounds.bottom;
      for(const other of panels){
        if(other===p)continue;
        const overlapX=Math.min(p.right,other.right)-Math.max(p.left,other.left);
        if(overlapX>.01){
          if(other.low>=p.high-1e-6&&other.low-p.high<.1)high=(p.high+other.low)/2;
          if(p.low>=other.high-1e-6&&p.low-other.high<.1)low=(p.low+other.high)/2;
        }
      }
      const index=panels.indexOf(p);
      left=edges.get(`${index}:left`)??left;right=edges.get(`${index}:right`)??right;
      if(splitHeight!=null){
        if(p.mesh.parent.userData.wardrobePart==='loft')low=splitHeight;
        else if(Math.abs(p.high-splitHeight)<.075)high=splitHeight;
      }
      left+=.0005;right-=.0005;low+=.0005;high-=.0005;
      const dw=right-left,dh=high-low,dx=(left+right)/2-p.cx,dy=(low+high)/2-p.cy,mesh=p.mesh,parent=mesh.parent;
      mesh.geometry.scale(dw/p.w,dh/p.h,1);mesh.userData.panelSize[0]=dw;mesh.userData.panelSize[1]=dh;
      const oldX=mesh.position.x;
      if(parent.userData._animProp==='ry'){
        const side=oldX<0?-1:1;
        parent.position.x+=dx-side*(dw-p.w)/2;parent.position.y+=dy;mesh.position.x=side*dw/2;
        for(const child of parent.children)if(/handle/.test(child.name))child.position.x+=side*(dw-p.w);
      }else{
        mesh.position.x+=dx;mesh.position.y+=dy;
        for(const child of parent.children)if(child.name.endsWith('handle')){child.position.x+=dx;child.position.y+=dy;}
      }
      for(const child of parent.children)if(child.name.startsWith('door-mirror')){
        child.position.x+=mesh.position.x-oldX;
        if(parent.userData._animProp!=='ry')child.position.y+=dy;
        if(child.userData.fitDoor){
          const border=child.name.endsWith('frame')?.008:0,w=dw-.04+border,h=dh-.04+border;
          child.geometry.scale(w/child.userData.panelSize[0],h/child.userData.panelSize[1],1);
          child.userData.panelSize[0]=w;child.userData.panelSize[1]=h;
        }
      }
    }
  }
  root.updateMatrixWorld(true);return root;
}
