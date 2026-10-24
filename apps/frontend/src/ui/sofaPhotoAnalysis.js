// Local, deterministic visual retrieval, not single-image photogrammetry.
// Suggestions are editable; no photo is sent to a remote service.
const cache=new Map();
function signature(image){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
  const c=canvas.getContext('2d',{willReadFrequently:true});c.fillStyle='white';c.fillRect(0,0,96,96);
  const scale=Math.min(96/image.width,96/image.height),w=image.width*scale,h=image.height*scale;
  c.drawImage(image,(96-w)/2,(96-h)/2,w,h);
  const pixels=c.getImageData(0,0,96,96).data;
  let x1=96,y1=96,x2=0,y2=0;const colours=[];
  for(let y=0;y<96;y++)for(let x=0;x<96;x++){
    const i=(y*96+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    if(Math.max(r,g,b)<229||Math.max(r,g,b)-Math.min(r,g,b)>28){x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);if(y>25&&y<76)colours.push([r,g,b]);}
  }
  if(x2<=x1||y2<=y1)throw new Error('No furniture detail found. Use a clear sofa photo with a simple background.');
  const sample=document.createElement('canvas');sample.width=sample.height=24;const sc=sample.getContext('2d');sc.drawImage(canvas,x1,y1,x2-x1+1,y2-y1+1,0,0,24,24);
  const data=sc.getImageData(0,0,24,24).data;
  const median=k=>colours.map(c=>c[k]).sort((a,b)=>a-b)[Math.floor(colours.length*.5)]??128;
  return {data,aspect:(x2-x1+1)/(y2-y1+1),color:'#'+[0,1,2].map(k=>median(k).toString(16).padStart(2,'0')).join('')};
}
function difference(a,b){let sum=0;for(let i=0;i<a.data.length;i+=4)for(let k=0;k<3;k++)sum+=Math.abs(a.data[i+k]-b.data[i+k])/255;return sum/(a.data.length*.75)+.025*Math.abs(Math.log(a.aspect/b.aspect));}
export async function analyseSofaPhoto(file,products){
  if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error('Choose a JPEG, PNG or WebP sofa photo.');
  if(file.size>15*1024*1024)throw new Error('Use a photo smaller than 15 MB.');
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.width<80||bitmap.height<60)throw new Error('Use a larger photo so the sofa details are visible.');
    const source=signature(bitmap),matches=[];
    for(const product of products){
      if(!cache.has(product.id))cache.set(product.id,(async()=>{const image=new Image();image.src=product.image;await image.decode();return signature(image);})());
      try{const reference=await cache.get(product.id);matches.push({id:product.id,distance:difference(source,reference)});}catch{/* A missing thumbnail does not prevent local upload. */}
    }
    matches.sort((a,b)=>a.distance-b.distance);
    if(!matches.length)throw new Error('Catalogue reference photos could not load. Please retry.');
    const canvas=document.createElement('canvas'),scale=Math.min(1,400/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return {matches:matches.slice(0,5),color:source.color,photo:canvas.toDataURL('image/jpeg',.76)};
  }finally{bitmap.close();}
}
