import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

let reflectionDepth=0;
export function createWardrobeMirror(width,height) {
  const mirror=new Reflector(new THREE.PlaneGeometry(width,height),{
    color:0xbcbcbc,clipBias:.003,multisample:0,
    // The target captures the camera's whole view, not just the glass area.
    // Narrow targets make tall door mirrors visibly pixelated.
    textureWidth:1024,textureHeight:1024,
  });
  mirror.name='door-mirror';mirror.userData={isWardrobeMirror:true,panelSize:[width,height,.004]};
  // An ordinary colour target also works on devices without float rendering.
  mirror.getRenderTarget().texture.type=THREE.UnsignedByteType;
  const renderReflection=mirror.onBeforeRender;
  mirror.onBeforeRender=function(renderer,scene,camera){
    // Multiple mirrored doors must not recursively render each other.
    if(reflectionDepth||scene.overrideMaterial)return;
    const helpers=[];scene.traverse(n=>{if(n.visible&&n.userData.isHelper){helpers.push(n);n.visible=false;}});
    reflectionDepth++;
    try{renderReflection.call(this,renderer,scene,camera);}
    finally{reflectionDepth--;for(const helper of helpers)helper.visible=true;}
  };
  // Existing object/thumbnail disposal paths dispose mesh materials. Tie the
  // reflection target to that same lifecycle so repeated size edits cannot leak.
  mirror.material.addEventListener('dispose',()=>mirror.getRenderTarget().dispose());
  return mirror;
}
