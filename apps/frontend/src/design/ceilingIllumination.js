import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

let initialized = false;

// Decorative surface lighting is diffuse, not a pair of spot cones. A bounded
// set of broad emitters approximates the luminous ceiling without wall hotspots.
// Three's area lights do not cast shadow maps; contact occlusion is supplied by
// Render mode, and the scene's existing shadow-casting lights remain unchanged.
export function addCeilingIllumination(group, { peak, color, roomId, polygon }) {
  if (!polygon?.length) return;
  if (!initialized) { RectAreaLightUniformsLib.init(); initialized = true; }
  const minX = Math.min(...polygon.map(p=>p.x)), maxX = Math.max(...polygon.map(p=>p.x));
  const minZ = Math.min(...polygon.map(p=>p.y)), maxZ = Math.max(...polygon.map(p=>p.y));
  const contains = (x,z) => {
    let inside=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const a=polygon[i],b=polygon[j];
      if((a.y>z)!==(b.y>z)&&x<(b.x-a.x)*(z-a.y)/(b.y-a.y)+a.x) inside=!inside;
    }
    return inside;
  };
  const rig = new THREE.Group(); rig.name='ceiling-illumination';
  const width=maxX-minX, depth=maxZ-minZ;
  const rectangular = polygon.every(p=>(p.x===minX||p.x===maxX)&&(p.y===minZ||p.y===maxZ)) && polygon.length===4;
  const divisions = rectangular ? 1 : 2;
  for(let ix=0;ix<divisions;ix++) for(let iz=0;iz<divisions;iz++) {
    const x=minX+width*(ix+.5)/divisions,z=minZ+depth*(iz+.5)/divisions;
    if(!contains(x,z)) continue;
    let w=width/divisions*.88,d=depth/divisions*.88;
    for(let n=0;n<12&&![-1,1].every(s=>[-1,1].every(t=>contains(x+s*w/2,z+t*d/2)));n++){w*=.75;d*=.75;}
    if(![-1,1].every(s=>[-1,1].every(t=>contains(x+s*w/2,z+t*d/2))))continue;
    const light=new THREE.RectAreaLight(color, 3, w, d);
    light.position.set(x,peak-.04,z);
    light.rotation.x=-Math.PI/2;
    light.userData={isAuthoredLight:true,isCeilingIllumination:true,roomId,distribution:'diffuse-surface'};
    rig.add(light);
  }
  group.add(rig);
}
