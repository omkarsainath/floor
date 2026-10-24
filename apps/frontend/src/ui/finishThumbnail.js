import { buildRoomFinish } from '../design/finishGeometry.js';
import { getFinishStyle } from '../design/roomDesignCatalog.js';
import { attachModelThumbnail } from './modelThumbnail.js';
import { HORSE_MURAL } from '../design/wallMural.js';

export function attachFinishThumbnail(img,style) {
  if(style.image){img.src=style.image;return;}
  if(style.pattern==='referenceMural'){img.src=HORSE_MURAL.lit;return;}
  const room={id:'preview',points:[{x:0,y:0},{x:4,y:0},{x:4,y:3},{x:0,y:3}]};
  attachModelThumbnail(img,`finish:${style.id}`,()=>buildRoomFinish({
    room,selection:{[style.category]:style.id},styleLookup:getFinishStyle,
    wallSurfaces:[{id:'preview-wall',wallId:'preview-wall',start:{x:0,y:0},end:{x:4,y:0},normal:{x:0,y:1},height:3,yOffset:0}],
  }),{front:style.category==='wallPanel'||style.category==='tvPanel',ceiling:style.category==='ceiling'});
}
