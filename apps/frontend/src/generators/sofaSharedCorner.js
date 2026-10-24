import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { sofaCushionGeometry, sofaSurfaceUVs } from './sofaSurface.js';

// The square is shared once by the two runs. Back rails butt together; loose
// pillows follow an arc so the two perpendicular wings cannot intersect.
export function addSharedSofaCorner(root,d,h,materials,x,z) {
  const {profile:p,frameFabric,fabric,cornerFabric,wood}=materials;
  const group=new THREE.Group();group.name='shared-corner';group.position.set(x,0,z);root.add(group);
  const top=Math.min(p.seatHeight||.43,h*.6),pad=p.seatThickness||.135,foot=Math.min(p.feet,h*.18);
  function part(name,w,height,depth,px,py,pz,mat,soft=false){
    const geo=soft?sofaCushionGeometry(w,height,depth,{seat:name==='shared-corner-seat',scatter:name==='corner-cushion',radius:.045})
      :sofaSurfaceUVs(new RoundedBoxGeometry(w,height,depth,3,Math.min(.02,height/4,depth/4)));
    const mesh=new THREE.Mesh(geo,mat);mesh.name=name;mesh.position.set(px,py,pz);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;
  }
  part('corner-base',d,top-pad-foot,d,0,(top-pad+foot)/2,0,frameFabric);
  part('shared-corner-seat',d-.17,pad,d-.17,.085,top-pad/2,.085,fabric,true);
  const bh=h-(p.headrests?.095:0)-(top-pad)-.105,y=top-pad+bh/2;
  part('corner-back-x',d,bh,.105,0,y,-d/2+.0525,frameFabric);
  part('corner-back-z',.105,bh,d-.105,-d/2+.0525,y,.0525,frameFabric);
  for(const px of [-d*.36,d*.36])for(const pz of [-d*.36,d*.36])part('sofa-foot',.05,foot,.05,px,foot/2,pz,wood);
  const n=p.cornerPads||2,base=-d/2;
  const positions=n===3?[[.82,.285,.1],[.285,.82,Math.PI/2-.1],[.415,.415,Math.PI/4]]
    :n===1?[[.44,.44,Math.PI/4]]:[[.69,.275,0],[.275,.69,Math.PI/2]];
  positions.forEach(([u,v,yaw],i)=>{
    const width=d*(n===3?(i===2?.40:.33):n===1?.66:.49);
    const height=Math.min(.32,h-top-.035);
    const mesh=part('corner-cushion',width,height,.11,base+u*d,top+height/2,base+v*d,cornerFabric,true);
    mesh.rotation.set(0,yaw,0);mesh.rotateX(-.09);
  });
  return group;
}
