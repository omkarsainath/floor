import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export async function exportFurnitureGLB(model){
  const snapshot=model.clone(true),materials=new Map(),textures=new Map();
  function drawable(texture){
    if(!texture?.isDataTexture)return texture;
    if(textures.has(texture))return textures.get(texture);
    const {width,height,data}=texture.image,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data),width,height),0,0);
    const copy=new THREE.CanvasTexture(canvas);copy.copy(texture);copy.source=new THREE.Source(canvas);copy.needsUpdate=true;textures.set(texture,copy);return copy;
  }
  function material(source){
    if(materials.has(source))return materials.get(source);
    const copy=source.clone();materials.set(source,copy);
    for(const slot of ['map','roughnessMap','metalnessMap','normalMap'])if(copy[slot])copy[slot]=drawable(copy[slot]);
    if(source.bumpMap?.isDataTexture){
      const {width:w,height:h,data}=source.bumpMap.image,normal=new Uint8Array(w*h*4),scale=source.bumpScale;
      const value=(x,y)=>data[(((y+h)%h)*w+(x+w)%w)*4]/255;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const v=new THREE.Vector3(-(value(x+1,y)-value(x-1,y))*scale*w/.24,-(value(x,y+1)-value(x,y-1))*scale*h/.24,1).normalize(),i=(y*w+x)*4;
        normal[i]=Math.round((v.x*.5+.5)*255);normal[i+1]=Math.round((v.y*.5+.5)*255);normal[i+2]=Math.round((v.z*.5+.5)*255);normal[i+3]=255;
      }
      const map=new THREE.DataTexture(normal,w,h);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.channel=1;
      map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
      copy.normalMap=drawable(map);copy.bumpMap=null;
    }
    return copy;
  }
  snapshot.traverse(n=>{if(n.isMesh)n.material=Array.isArray(n.material)?n.material.map(material):material(n.material);});
  try{return await new GLTFExporter().parseAsync(snapshot,{binary:true,onlyVisible:true});}
  finally{for(const m of materials.values())m.dispose();for(const t of textures.values())t.dispose();}
}
export function downloadFurnitureGLB(data,name='sofa.glb'){
  const url=URL.createObjectURL(new Blob([data],{type:'model/gltf-binary'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
