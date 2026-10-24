import * as T from 'three';
import {buildCeilingLight,disposeCeilingLight} from '../src/design/ceilingLights.js';

// A controlled wall render verifies that independently changing beam width
// and height changes actual wall illumination, not just fixture metadata.
export function renderBeam(width,height){
  const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true,antialias:true});
  renderer.setSize(600,300);renderer.shadowMap.enabled=true;renderer.outputColorSpace=T.SRGBColorSpace;
  const scene=new T.Scene();scene.background=new T.Color(0);
  const camera=new T.OrthographicCamera(-3,3,1.5,-1.5,.1,20);camera.position.set(0,1.5,6);camera.lookAt(0,1.5,0);
  const wall=new T.Mesh(new T.PlaneGeometry(6,3),new T.MeshStandardMaterial({color:0xffffff,roughness:1}));wall.position.y=1.5;wall.receiveShadow=true;scene.add(wall);
  const lamp=buildCeilingLight({placement:{id:'beam',type:'downlight',x:0,z:1.6,lumens:120,beamWidthM:width,beamHeightM:height,aimTiltDegrees:60,aimDirectionDegrees:180},ceilingY:2.8,roomId:'test'});
  lamp.getObjectByName('fixture-body').visible=false;scene.add(lamp);
  renderer.render(scene,camera);
  const gl=renderer.getContext(),pixels=new Uint8Array(600*300*4);gl.readPixels(0,0,600,300,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let peak=0;for(let i=0;i<pixels.length;i+=4)peak=Math.max(peak,pixels[i]);
  let minX=600,maxX=-1,minY=300,maxY=-1;
  for(let y=0;y<300;y++)for(let x=0;x<600;x++)if(pixels[(y*600+x)*4]>Math.max(10,peak*.2)){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const result={widthPx:maxX-minX+1,heightPx:maxY-minY+1,peak,image:renderer.domElement.toDataURL('image/png')};
  disposeCeilingLight(lamp);wall.geometry.dispose();wall.material.dispose();renderer.dispose();renderer.forceContextLoss();
  return result;
}
