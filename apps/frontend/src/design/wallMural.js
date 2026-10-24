import * as THREE from 'three';

export const HORSE_MURAL = {
  lit: '/textures/wall-designs/seven-horses-lit.png',
  unlit: '/textures/wall-designs/seven-horses-unlit.png',
  aspect: 1672 / 941,
  depth: '/textures/wall-designs/seven-horses-depth.png',
  reliefM: .14,
};

// Contain the entire artwork rather than stretch horse anatomy or crop heads.
export function muralBounds(left,right,bottom,top,aspect=HORSE_MURAL.aspect) {
  const width=Math.min(right-left,(top-bottom)*aspect),height=width/aspect;
  const x=(left+right)/2,y=(bottom+top)/2;
  return {left:x-width/2,right:x+width/2,bottom:y-height/2,top:y+height/2};
}
const depthCache = new Map();
function loadDepthPixels(url) {
  if (!depthCache.has(url)) depthCache.set(url, new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');canvas.width=512;canvas.height=288;
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,512,288);
      resolve(context.getImageData(0,0,512,288));
    };
    image.onerror=()=>reject(new Error('Could not load horse relief depth.'));
    image.src=url;
  }));
  // Retain only a few decoded height fields; scene geometries own their vertices.
  if (depthCache.size > 4) depthCache.delete(depthCache.keys().next().value);
  return depthCache.get(url);
}
export function applyMuralDepth(geometry, pixels) {
  const position=geometry.attributes.position,uv=geometry.attributes.uv;
  const {side,depth,amplitude,frontCount}=geometry.userData.relief;
  const sample=(u,v)=>{
    const x=Math.max(0,Math.min(pixels.width-1,u*(pixels.width-1)));
    const y=Math.max(0,Math.min(pixels.height-1,(1-v)*(pixels.height-1)));
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,pixels.width-1),y1=Math.min(y0+1,pixels.height-1);
    const value=(a,b)=>pixels.data[(b*pixels.width+a)*4]/255;
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(value(x0,y0),value(x1,y0),x-x0),THREE.MathUtils.lerp(value(x0,y1),value(x1,y1),x-x0),y-y0);
  };
  for(let i=0;i<frontCount;i++) position.setZ(i,side*(depth+amplitude*sample(uv.getX(i),uv.getY(i))));
  for(const [vertex,source] of geometry.userData.relief.edgeTops)position.setZ(vertex,position.getZ(source));
  position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
}
export function muralGeometry(span,bounds,side,depth,assets=HORSE_MURAL) {
  const left=Math.max(span.lo,bounds.left),right=Math.min(span.hi,bounds.right);
  const bottom=Math.max(span.bottom,bounds.bottom),top=Math.min(span.top,bounds.top);
  if(right<=left||top<=bottom)return null;
  const nx=Math.max(2,Math.ceil(320*(right-left)/(bounds.right-bounds.left)));
  const ny=Math.max(2,Math.ceil(180*(top-bottom)/(bounds.top-bounds.bottom)));
  const positions=[],uvs=[],indices=[],edgeTops=[];
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
    const x=left+(right-left)*i/nx,y=bottom+(top-bottom)*j/ny;
    positions.push(x,y,side*depth);uvs.push((x-bounds.left)/(bounds.right-bounds.left),(y-bounds.bottom)/(bounds.top-bounds.bottom));
  }
  const frontCount=positions.length/3;
  const quad=(a,b,c,d)=>{if(side>0)indices.push(a,b,c,a,c,d);else indices.push(a,c,b,a,d,c);};
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;quad(a,a+1,a+nx+2,a+nx+1);}
  const edges=[Array.from({length:nx+1},(_,i)=>i),Array.from({length:ny+1},(_,j)=>j*(nx+1)+nx),Array.from({length:nx+1},(_,i)=>ny*(nx+1)+nx-i),Array.from({length:ny+1},(_,j)=>(ny-j)*(nx+1))];
  for(const edge of edges)for(let i=0;i<edge.length-1;i++){
    const start=positions.length/3;
    for(const [source,back] of [[edge[i],false],[edge[i],true],[edge[i+1],true],[edge[i+1],false]]){
      const vertex=positions.length/3;
      positions.push(positions[source*3],positions[source*3+1],side*(depth-(back?.002:0)));
      uvs.push(uvs[source*2],uvs[source*2+1]);if(!back)edgeTops.push([vertex,source]);
    }
    quad(start,start+1,start+2,start+3);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.userData.relief={side,depth,frontCount,edgeTops,amplitude:Math.min(assets.reliefM,(bounds.top-bounds.bottom)*.08)};
  // CPU displacement also updates raycasting, bounds, and shadow geometry.
  if(typeof Image!=='undefined'){
    let disposed=false;geometry.addEventListener('dispose',()=>{disposed=true;});
    geometry.userData.depthReady=loadDepthPixels(assets.depth).then(pixels=>{if(!disposed)applyMuralDepth(geometry,pixels);}).catch(error=>{if(!disposed)console.error(error);});
  }
  return geometry;
}
export function createMuralMaterial(assets=HORSE_MURAL) {
  const loader=new THREE.TextureLoader();
  const texture=url=>{const t=loader.load(url);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;};
  // Texture retains fine artwork detail; displaced geometry supplies real parallax and shading.
  const lit=texture(assets.lit),unlit=assets.unlit===assets.lit?lit:texture(assets.unlit);
  const material=new THREE.MeshStandardMaterial({map:lit,roughness:.88,metalness:0,side:THREE.DoubleSide,
    emissive:0xffffff,emissiveMap:lit,emissiveIntensity:assets.preserveAppearance ? .35 : .18});
  // Uploaded photographs have no separate lighting pass. Extract only bright,
  // warm pixels for an approximate glow; retain the original colour map.
  if (assets.preserveAppearance && typeof document !== 'undefined') {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
    const glow=new THREE.CanvasTexture(canvas);glow.colorSpace=THREE.SRGBColorSpace;
    material.emissiveMap=glow;material.muralGlowMap=glow;
    let disposed=false;material.addEventListener('dispose',()=>{disposed=true;});
    const source=new Image();
    source.onload=()=>{
      if(disposed)return;
      const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0,512,512);
      const pixels=ctx.getImageData(0,0,512,512);
      for(let i=0;i<pixels.data.length;i+=4){
        const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];
        const strength=Math.max(0,Math.min(1,((r+g)/2-155)/85))*Math.max(0,Math.min(1,(r-b)/45));
        pixels.data[i]=r*strength;pixels.data[i+1]=g*strength;pixels.data[i+2]=b*strength;
      }
      ctx.putImageData(pixels,0,0);glow.needsUpdate=true;
    };
    source.src=assets.lit;
  }
  // Explicit texture properties are also collected by disposeRoomFinish.
  material.muralLitMap=lit;material.muralUnlitMap=unlit;
  return material;
}
