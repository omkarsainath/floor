import { SOFA_FACTORY_CATALOG, createSofaFactoryFurniture, createSofaProduct } from './sofaFactory.js';
import { sofaDesign } from './sofaDesigns.js';

export const PHOTO_SOFA_CLASS='uploaded-sofa';
export const PHOTO_LAYOUTS=['straight','corner','chaise','set','daybed','recliner'];
export function validatePhotoSofaSpec(input){
  if(!input||input.version!==1)throw new Error('Unsupported sofa photo model.');
  const reference=SOFA_FACTORY_CATALOG.find(p=>p.id===input.referenceId&&sofaDesign(p.id));
  if(!reference)throw new Error('Choose a catalogue construction reference.');
  const number=(key,min,max)=>{const v=Number(input[key]);if(!Number.isFinite(v)||v<min||v>max)throw new Error(`${key}: enter a value from ${min} to ${max} metres.`);return v;};
  const width=number('width',.4,12),depth=number('depth',.3,12),height=number('height',.35,2),seatingDepth=number('seatingDepth',.4,1.5);
  if(!PHOTO_LAYOUTS.includes(input.layout))throw new Error('Choose the seating layout.');
  if(['corner','chaise'].includes(input.layout)&&(width<=seatingDepth+.35||depth<=seatingDepth+.25))throw new Error('Overall width and depth must include the seating wings and shared corner.');
  const count=key=>{const v=Number(input[key]);if(!Number.isInteger(v)||v<1||v>6)throw new Error('Cushion counts must be whole numbers from 1 to 6.');return v;};
  const color=key=>{if(!/^#[0-9a-f]{6}$/i.test(input[key]))throw new Error('Choose valid upholstery colours.');return input[key];};
  return {version:1,referenceId:reference.id,layout:input.layout,width,depth,height,seatingDepth,
    mainSeats:count('mainSeats'),wingSeats:count('wingSeats'),mainBacks:count('mainBacks'),wingBacks:count('wingBacks'),
    seatColor:color('seatColor'),frameColor:color('frameColor'),side:input.side==='right'?'right':'left',
    useCatalogueModel:!!input.useCatalogueModel,useCatalogueFabric:!!input.useCatalogueFabric,
    photo:typeof input.photo==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(input.photo)&&input.photo.length<150000?input.photo:null,
    provenance:'Photo-assisted procedural approximation. Size supplied by user; rear, underside, cushion depth and fabric repeat are inferred.'};
}

export function createPhotoSofa(input,width,depth){
  const spec=validatePhotoSofaSpec(input),reference=SOFA_FACTORY_CATALOG.find(p=>p.id===spec.referenceId);
  let root;
  if(spec.useCatalogueModel){
    root=createSofaFactoryFurniture(reference.id,width??spec.width,depth??spec.depth);
    root.scale.y*=spec.height/reference.h;
  }else{
    const profile={...sofaDesign(reference.id),layout:spec.layout,mainSeats:spec.mainSeats,wingSeats:spec.wingSeats,
      mainBacks:spec.mainBacks,wingBacks:spec.wingBacks,seatColor:spec.seatColor,backColor:spec.seatColor,frameColor:spec.frameColor,
      chaiseSide:spec.side,cornerSide:spec.side,seat:'split',seatPanels:undefined,backPanels:undefined};
    if(!spec.useCatalogueFabric)Object.assign(profile,{backPrint:undefined,cornerPrint:undefined,pillowPrint:undefined,bodyPrint:undefined,cornerColor:spec.seatColor});
    if(spec.layout==='daybed')profile.back='none';
    if(spec.layout==='recliner')Object.assign(profile,{layout:'straight',back:'recliner',recliner:true,mainSeats:1,mainBacks:1});
    const product={...reference,w:spec.width,d:spec.depth,h:spec.height,seatingDepth:spec.seatingDepth,
      setSeats:undefined,corner:spec.layout==='corner',category:'sofas',referenceAudit:{inferred:[spec.provenance]}};
    if(spec.layout==='set'){
      // The photo supplies no component measurements. Preserve the chosen set's
      // relative piece sizes, and disclose the overall user resizing as inferred.
      product.setSeats=reference.setSeats||[spec.mainSeats,spec.wingSeats];
      product.dimensionRows=reference.setSeats?reference.dimensionRows:[[spec.width/.0254,spec.seatingDepth/.0254,spec.height/.0254],[spec.width*.7/.0254,spec.seatingDepth/.0254,spec.height/.0254]];
    }
    root=createSofaProduct(product,width??spec.width,depth??spec.depth,profile);
  }
  root.name='Photo sofa';root.userData.photoSofaSpec=spec;root.userData.referenceApproximation=true;
  return root;
}
