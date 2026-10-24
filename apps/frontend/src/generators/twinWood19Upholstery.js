import * as THREE from 'three';
import { sofaCushionGeometry } from './sofaSurface.js';

// The catalogue's 64 x 33 textile crop contains baked lighting and is too small
// to tile as a photograph. This is a conservative seamless woven approximation,
// not a recovered manufacturer fabric. One tile covers 80 cm on every insert.
export const INSERT_REPEAT_METERS = .8;
let textile;
export function twinWood19Textile() {
  if (textile) return textile;
  const size = 512, data = new Uint8Array(size * size * 4);
  const hash = (x,y) => {
    let n = Math.imul(x + 173, 374761393) ^ Math.imul(y + 91, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (u,v,cells) => {
    const x=u*cells,y=v*cells,ix=Math.floor(x),iy=Math.floor(y);
    const smooth=t=>t*t*(3-2*t),a=smooth(x-ix),b=smooth(y-iy);
    const at=(x,y)=>hash((x+cells)%cells,(y+cells)%cells);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix,iy),at(ix+1,iy),a),THREE.MathUtils.lerp(at(ix,iy+1),at(ix+1,iy+1),a),b);
  };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x/size,v=y/size;
    // Broken warp/weft slubs rather than repeated photographic rectangles.
    const warp=Math.pow(.5+.5*Math.sin(2*Math.PI*(u*64+.17*Math.sin(v*8*Math.PI))),10)*noise(u,v,32);
    const weft=Math.pow(.5+.5*Math.sin(2*Math.PI*(v*64+.13*Math.sin(u*12*Math.PI))),12)*noise(u+.5,v,16);
    const fleck=noise(u,v,128),cloud=noise(u,v,16);
    const shade=61+cloud*32+fleck*22+warp*74+weft*56;
    const i=(y*size+x)*4;
    data[i]=shade*1.025;data[i+1]=shade;data[i+2]=shade*.97;data[i+3]=255;
  }
  textile=new THREE.DataTexture(data,size,size);
  textile.name='19 · seamless dark woven approximation';textile.colorSpace=THREE.SRGBColorSpace;
  textile.wrapS=textile.wrapT=THREE.RepeatWrapping;textile.generateMipmaps=true;
  textile.minFilter=THREE.LinearMipmapLinearFilter;textile.anisotropy=8;textile.needsUpdate=true;
  return textile;
}

export function twinWood19Padding(w,h,d,{seat=false,radius=.045}={}) {
  const geometry=sofaCushionGeometry(w,h,d,{seat,scatter:!seat,radius,outline:false});
  const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++) {
    let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const u=x/(w/2),v=(seat?z/(d/2):y/(h/2));
    if(!seat) {
      // Sewn envelope: softly bowed outline, fuller middle, compressed bottom.
      x*=1-.045*v*v;
      y*=1-.055*u*u;
      z*=y<0 ? 1-.10*Math.pow(Math.abs(v),3) : 1;
    } else {
      // The seat is supported from underneath; loft belongs on its top only.
      y=Math.max(y,-h/2);
      if(y>0)y-=.004*Math.exp(-Math.pow((Math.abs(u)-.86)/.12,2))*(1-v*v);
    }
    p.setXYZ(i,x,y,z);
  }
  geometry.computeVertexNormals();
  const normals=geometry.attributes.normal,groups=new Map(),normal=new THREE.Vector3();
  for(let i=0;i<p.count;i++) {
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
    if(!groups.has(key))groups.set(key,{ids:[],normal:new THREE.Vector3()});
    const group=groups.get(key);group.ids.push(i);group.normal.add(normal.fromBufferAttribute(normals,i));
  }
  for(const group of groups.values()) {
    group.normal.normalize();for(const i of group.ids)normals.setXYZ(i,group.normal.x,group.normal.y,group.normal.z);
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
