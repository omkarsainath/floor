import * as THREE from 'three';
import catalog from './stoneCatalog.js';
export const STONES=Object.freeze(catalog);
export const STONE_BY_ID=new Map(STONES.map(s=>[s.id,s]));
export function stoneTexture(id) {
  const stone=STONE_BY_ID.get(id);if(!stone||typeof document==='undefined')return null;
  // Each material owns its texture so floor disposal cannot invalidate counters.
  const texture=new THREE.TextureLoader().load(stone.image);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.MirroredRepeatWrapping;
  texture.anisotropy=8;return texture;
}
export function stoneMaterial(id) {
  const material=new THREE.MeshStandardMaterial({color:0xffffff,map:stoneTexture(id),roughness:.24,metalness:0});
  material.userData.stoneId=id;return material;
}
export function mapCounterStone(mesh,scale) {
  const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,uv=new Float32Array(p.count*2);
  // Catalogue swatches are 1.8:1. Approximate 1.2 m image width; not a slab scan.
  for(let i=0;i<p.count;i++){
    const x=(p.getX(i)+mesh.position.x)*scale.x,y=(p.getY(i)+mesh.position.y)*scale.y,z=(p.getZ(i)+mesh.position.z)*scale.z;
    const top=Math.abs(n.getY(i))>.5,side=Math.abs(n.getX(i))>Math.abs(n.getZ(i));
    uv[i*2]=(top||!side?x:z)/1.2;uv[i*2+1]=(top?z:y)/(.6666667);
  }
  mesh.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
}
