import * as THREE from 'three';
import swatches from './greenlamCatalog.json' with { type: 'json' };

// Application statements are transcribed from the supplied PDF, not inferred
// from a design's colour. Roughness/bump are visual approximations, not lab data.
export const GREENLAM_FINISHES = {
  ARN: { label:'Aran · woven texture', page:10, roughness:.82, bump:.00022, application:'Wardrobe, wall paneling and premium furniture', sheets:[[1.22,2.44],[1.22,3.05]] },
  BRL: { label:'Barrel · woodgrain', page:12, roughness:.62, bump:.00028, application:'Wardrobe, wall paneling and premium furniture', sheets:[[1.22,2.44]] },
  CNY: { label:'Canyon · stone texture', page:14, roughness:.71, bump:.00038, application:'Wardrobe, wall paneling and premium furniture', sheets:[[1.22,2.44]] },
  AFX: { label:'AFX · ultra matte', page:16, roughness:.94, bump:.00003, application:'Ultra-matte surface; this page does not specify wardrobe application', sheets:[[1.22,2.44],[1.3,3.05]], applicationUnspecified:true },
  'UNI-SUD': { label:'Unicore · suede', page:17, roughness:.79, bump:.00006, application:'Cabinets, shelves, doors and furniture', sheets:[[1.22,2.44]], unicore:true },
  'UNI-HDG': { label:'Unicore · HD gloss', page:17, roughness:.13, clearcoat:.85, bump:.00001, application:'Cabinets, shelves, doors and furniture', sheets:[[1.22,2.44]], unicore:true },
  SAT: { label:'Satin · super matte', page:18, roughness:.87, bump:.00005, application:'Wardrobe, wall paneling and premium furniture', sheets:[[1.22,2.44],[1.22,3.05]] },
  HDG: { label:'HD Gloss', page:25, roughness:.13, clearcoat:.9, bump:.00001, application:'Kitchen wardrobe, wall paneling and premium furniture', sheets:[[1.22,2.44]] },
  VRB: { label:'VRB · dry matte wood', page:30, roughness:.84, bump:.00024, application:'Wardrobe, wall paneling and premium furniture', sheets:[[1.22,2.44],[1.22,3.05]] },
  SY1: { label:'Synchro · elm', page:33, roughness:.61, bump:.0003, application:'Wardrobe, wall paneling and premium furniture', sheets:[[1.22,2.44]] },
  SY2: { label:'Synchro · ash', page:33, roughness:.61, bump:.0003, application:'Wardrobe, wall paneling and premium furniture', sheets:[[1.22,2.44]] },
  SGL: { label:'Super Gloss', page:34, roughness:.09, clearcoat:1, bump:.00001, application:'Kitchen shutters, wardrobe and reception', sheets:[[1.22,2.44],[1.22,3.05]] },
};
export const GREENLAM_CATALOG = swatches;
export const GREENLAM_BY_ID = new Map(swatches.map(s=>[s.id,s]));
export const GREENLAM_SOURCE = '/catalog/greenlam/source.pdf';

export function normalizeLaminateChoice(choice) {
  if (!choice) return null;
  let custom;
  if(choice.custom){
    const c=choice.custom;
    if(typeof c.image!=='string'||c.image.length>600000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(c.image)||!/^custom-[\w-]{1,80}$/.test(choice.laminateId))return null;
    custom={image:c.image,name:String(c.name||'Uploaded laminate').slice(0,80),sampleAspect:Math.max(.1,Math.min(10,Number(c.sampleAspect)||1))};
    GREENLAM_BY_ID.set(choice.laminateId,{id:choice.laminateId,...custom,code:'Custom',finish:'SAT',kind:'wood',color:'#c5b9a5'});
  }
  if (!GREENLAM_BY_ID.has(choice.laminateId)) return null;
  return { ...(custom?{custom}:{}),laminateId:choice.laminateId, rotation:choice.rotation===90?90:0,
    scale:typeof choice.scale==='number'&&Number.isFinite(choice.scale)?Math.max(.5,Math.min(2,choice.scale)):1 };
}

// Cache decoded images, not GPU textures: panels retain independent UVs and
// disposal. A visible swatch is already decoded when clicked, so it can be used
// in the next frame without another asynchronous TextureLoader request.
const imageCache=new Map(),pendingImages=new Map(),materialStates=new WeakMap();
const decodedSwatches=new WeakMap();
const bumpPixels=new Map();
export function cacheLaminateImage(id,image) {
  if(!GREENLAM_BY_ID.has(id)||!image?.complete||!image.naturalWidth)return false;
  let source=image;
  // Card images have CSS thumbnail dimensions. Three allocates storage from
  // image.width/height, but WebGL uploads naturalWidth/naturalHeight. Snapshot
  // those decoded pixels at their real size, independent of the panel layout.
  if(image.width!==image.naturalWidth||image.height!==image.naturalHeight){
    source=decodedSwatches.get(image);
    if(!source){
      source=document.createElement('canvas');
      source.width=image.naturalWidth;source.height=image.naturalHeight;
      source.getContext('2d').drawImage(image,0,0);
      decodedSwatches.set(image,source);
    }
  }
  imageCache.delete(id);imageCache.set(id,source);
  if(imageCache.size>48)imageCache.delete(imageCache.keys().next().value);
  return true;
}
export function preloadLaminateImage(id) {
  if(typeof document==='undefined'||!GREENLAM_BY_ID.has(id))return Promise.resolve(null);
  if(imageCache.has(id))return Promise.resolve(imageCache.get(id));
  if(pendingImages.has(id))return pendingImages.get(id);
  const promise=new Promise(resolve=>{
    new THREE.ImageLoader().load(GREENLAM_BY_ID.get(id).image,image=>{
      cacheLaminateImage(id,image);resolve(image);
    },undefined,()=>resolve(null));
  }).finally(()=>pendingImages.delete(id));
  pendingImages.set(id,promise);return promise;
}
function microBump(kind) {
  if(bumpPixels.has(kind))return bumpPixels.get(kind);
  const n=128,data=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const grain=kind==='textile'?Math.sin(x*Math.PI/2)*Math.sin(y*Math.PI/2):kind==='wood'?Math.sin(x*.95+Math.sin(y*.08)):
      Math.sin(x*127.1+y*311.7)*Math.cos(y*71.3+x*19.1);
    const i=(y*n+x)*4;data[i]=data[i+1]=data[i+2]=128+Math.round(grain*35);data[i+3]=255;
  }
  bumpPixels.set(kind,data);return data;
}

function setLaminateImage(material,state,image) {
  let map=state.map;
  const previous=map.image;
  const width=source=>source.naturalWidth||source.width;
  const height=source=>source.naturalHeight||source.height;
  // WebGL2 texture storage is immutable after its first upload. Catalogue
  // crops (and the 1x1 fallback) differ in size, so needsUpdate alone cannot
  // resize that storage. Keep the material/UVs, but replace the GPU texture.
  if(width(previous)!==width(image)||height(previous)!==height(image)){
    const replacement=map.clone();
    replacement.source=new THREE.Source(image);
    map.dispose();
    map=state.map=material.map=replacement;
  }else map.image=image;
  map.needsUpdate=true;
}

export function createLaminateMaterial(choice,width,height) {
  const material=new THREE.MeshPhysicalMaterial({metalness:0,envMapIntensity:.85,clearcoatRoughness:.1});
  const state={revision:0,disposed:false};materialStates.set(material,state);
  if(typeof document!=='undefined'){
    state.fallback=document.createElement('canvas');state.fallback.width=state.fallback.height=1;
    // Keep map and bump slots present across edits to retain the shader.
    // The colour texture itself is replaced when image dimensions change.
    state.map=new THREE.Texture(state.fallback);state.map.colorSpace=THREE.SRGBColorSpace;
    state.map.wrapS=state.map.wrapT=THREE.MirroredRepeatWrapping;state.map.anisotropy=4;
    state.bump=new THREE.DataTexture(microBump('solid'),128,128);
    state.bump.wrapS=state.bump.wrapT=THREE.RepeatWrapping;state.bump.magFilter=THREE.LinearFilter;
    state.bump.minFilter=THREE.LinearMipmapLinearFilter;state.bump.generateMipmaps=true;
    material.map=state.map;material.bumpMap=state.bump;
  }
  material.addEventListener('dispose',()=>{
    state.disposed=true;state.revision++;state.map?.dispose();state.bump?.dispose();
  });
  return updateLaminateMaterial(material,choice,width,height);
}

export function updateLaminateMaterial(material,choice,width,height) {
  const normalized=normalizeLaminateChoice(choice);
  if(!normalized)throw new Error('Unknown Greenlam design.');
  const state=materialStates.get(material);
  if(!state||state.disposed)throw new Error('Laminate material is no longer editable.');
  const swatch=GREENLAM_BY_ID.get(normalized.laminateId),finish=GREENLAM_FINISHES[swatch.finish];
  const revision=++state.revision;
  const hasClearcoat=material.clearcoat>0;
  material.roughness=finish.roughness;material.clearcoat=finish.clearcoat||0;
  if(hasClearcoat!==(material.clearcoat>0))material.needsUpdate=true;
  material.name=`Greenlam ${swatch.code} ${swatch.finish} · ${swatch.name}`;
  material.userData={laminateId:swatch.id,pdfPage:swatch.pdfPage,textureStatus:'fallback',...normalized};
  material.color.set(swatch.color);
  if(!state.map)return material;
  const {bump,fallback}=state;
  const context=fallback.getContext('2d');context.fillStyle=swatch.color;context.fillRect(0,0,1,1);
  setLaminateImage(material,state,imageCache.get(swatch.id)||fallback);material.color.set(0xffffff);
  if(state.map.image!==fallback)material.userData.textureStatus='loaded';
  else preloadLaminateImage(swatch.id).then(image=>{
    // Rapid A→B→C edits and disposal must never let an older download win.
    if(state.disposed||state.revision!==revision)return;
    if(image){setLaminateImage(material,state,image);material.userData.textureStatus='loaded';}
    else material.userData.textureStatus='error';
  });
  const sampleW=1.22*normalized.scale,sampleH=sampleW/swatch.sampleAspect;
  const across=normalized.rotation===90?height:width,along=normalized.rotation===90?width:height;
  const map=state.map;
  map.repeat.set(across/sampleW,along/sampleH);map.center.set(.5,.5);map.rotation=normalized.rotation*Math.PI/180;
  bump.image.data=microBump(swatch.kind);bump.needsUpdate=true;
  bump.repeat.set(across*18,along*18);bump.rotation=map.rotation;material.bumpScale=finish.bump;
  return material;
}

export function laminateSheetNote(choice,width,height) {
  const swatch=GREENLAM_BY_ID.get(choice?.laminateId);if(!swatch)return '';
  const finish=GREENLAM_FINISHES[swatch.finish];
  const fits=finish.sheets.some(([w,h])=>choice.rotation===90?height<=w&&width<=h:width<=w&&height<=h);
  return fits?'':'This panel exceeds the listed sheet size in this grain direction; a joint or a different sheet size is needed.';
}
