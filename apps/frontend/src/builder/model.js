import { projectStorage } from '../auth/storage.js';
export const THICKNESS=.15, GRID=.1524, DRAFT_KEY='easy2DPlanDraft', BACKUP_KEY='easy2DPreviousProject';
export const DRAFT_ARCHIVE_KEY='easy2DSavedPlans';
const clone=v=>structuredClone(v),id=()=>globalThis.crypto.randomUUID();
const close=(a,b)=>Math.abs(a-b)<.00001;
export const ROOM_PRESETS=[['Bedroom',3.048,3.6576,'#e4e9ff'],['Living Room',4.2672,3.6576,'#fff0d6'],['Kitchen',3.048,3.048,'#d9f3e9'],['Bathroom',1.8288,2.4384,'#dceffa','bathroom'],['Empty Room',3.048,3.048,'#efedf5'],['Pooja Room',1.2192,1.524,'#ffe5c2','pooja']];
export function newPlan(){return {version:1,id:id(),name:'My new home',units:'ft',rooms:[],objects:[],revision:0};}
export function roomEdges(r){const t=THICKNESS/2;return [
 {key:'top',a:{x:r.x-t,y:r.y-t},b:{x:r.x+r.w+t,y:r.y-t}},
 {key:'right',a:{x:r.x+r.w+t,y:r.y-t},b:{x:r.x+r.w+t,y:r.y+r.d+t}},
 {key:'bottom',a:{x:r.x-t,y:r.y+r.d+t},b:{x:r.x+r.w+t,y:r.y+r.d+t}},
 {key:'left',a:{x:r.x-t,y:r.y-t},b:{x:r.x-t,y:r.y+r.d+t}}];}
export function uncutWallsFor(plan){
 const groups=new Map();for(const r of plan.rooms)for(const e of roomEdges(r)){
  const horizontal=close(e.a.y,e.b.y),line=horizontal?e.a.y:e.a.x,key=`${horizontal?'h':'v'}:${line.toFixed(5)}`;
  if(!groups.has(key))groups.set(key,{horizontal,line,spans:[]});groups.get(key).spans.push({a:horizontal?e.a.x:e.a.y,b:horizontal?e.b.x:e.b.y,room:r.id,edge:e.key});
 }
 const walls=[];for(const [key,g] of groups){const cuts=[...new Set(g.spans.flatMap(s=>[s.a,s.b]))].sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i],owners=g.spans.filter(s=>(a+b)/2>s.a-1e-6&&(a+b)/2<s.b+1e-6);if(!owners.length||b-a<1e-6)continue;
   walls.push({builderRoomId:owners[0].room,builderEdge:owners[0].edge,id:`builder-wall-${key}:${a.toFixed(5)}:${b.toFixed(5)}`,start:g.horizontal?{x:a,y:g.line}:{x:g.line,y:a},end:g.horizontal?{x:b,y:g.line}:{x:g.line,y:b},height:3,thickness:THICKNESS,wall_type:owners.length>1?'interior':'exterior'});
  }
 }return walls;
}
// Cuts belong to a room edge, so they follow that room when it moves.
export function wallCutLine(plan,cut){
 const r=plan.rooms.find(r=>r.id===cut.roomId),e=r&&roomEdges(r).find(e=>e.key===cut.edge);if(!e)return null;
 const horizontal=close(e.a.y,e.b.y),length=Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y);
 if(!Number.isFinite(cut.offset)||!Number.isFinite(cut.length)||cut.offset<0||cut.length<=0||cut.offset+cut.length>length+1e-5)return null;
 return {start:horizontal?{x:e.a.x+cut.offset,y:e.a.y}:{x:e.a.x,y:e.a.y+cut.offset},end:horizontal?{x:e.a.x+cut.offset+cut.length,y:e.a.y}:{x:e.a.x,y:e.a.y+cut.offset+cut.length}};
}
export function wallsFor(plan){
 const cuts=(plan.wallCuts||[]).map(c=>wallCutLine(plan,c)).filter(Boolean);
 return uncutWallsFor(plan).flatMap(w=>{
  const horizontal=close(w.start.y,w.end.y),axis=horizontal?'x':'y',fixed=horizontal?'y':'x';let spans=[[w.start[axis],w.end[axis]]];
  // Adjacent rooms can retain separate, slightly offset wall centre lines
  // (for example a 6-inch grid gap versus a 150 mm wall). Cut through the
  // entire touching wall band, but never a perpendicular or separated wall.
  for(const cut of cuts){if(!close(cut.start[fixed],cut.end[fixed])||Math.abs(cut.start[fixed]-w.start[fixed])>THICKNESS+1e-5)continue;
   spans=spans.flatMap(([a,b])=>{const l=Math.max(a,cut.start[axis]),r=Math.min(b,cut.end[axis]);return r<=l?[[a,b]]:[[a,l],[r,b]].filter(([x,y])=>y-x>1e-6);});
  }
  return spans.map(([a,b])=>({...w,id:close(a,w.start[axis])&&close(b,w.end[axis])?w.id:`${w.id}:cut:${a.toFixed(5)}:${b.toFixed(5)}`,start:{...w.start,[axis]:a},end:{...w.end,[axis]:b}}));
 });
}
function checkWallCuts(plan){
 for(const c of plan.wallCuts||[])if(!wallCutLine(plan,c))throw Error('A wall cut no longer fits. Restore that cut before making the room smaller.');
}
export function addWallCut(plan,wallId,start,length){
 const wall=uncutWallsFor(plan).find(w=>w.id===wallId);if(!wall)throw Error('Choose a wall first.');
 const total=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);
 if(!Number.isFinite(start)||!Number.isFinite(length)||start<0||length<.05||start+length>total+1e-5)throw Error('Keep the cut inside this wall. Use a cut width of at least 5 cm.');
 const room=plan.rooms.find(r=>r.id===wall.builderRoomId),edge=roomEdges(room).find(e=>e.key===wall.builderEdge);
 const cut={id:id(),roomId:room.id,edge:edge.key,offset:Math.hypot(wall.start.x-edge.a.x,wall.start.y-edge.a.y)+start,length};
 const trial={...plan,wallCuts:[...(plan.wallCuts||[]),cut]};
 for(const o of plan.objects.filter(o=>o.opening)){const error=objectProblem(trial,o);if(error)throw Error('Move or delete the door or window on this part of the wall before cutting it.');}
 plan.wallCuts=trial.wallCuts;return cut;
}
export function restoreWallCut(plan,cutId){plan.wallCuts=(plan.wallCuts||[]).filter(c=>c.id!==cutId);}
export const isPooja=r=>r?.kind==='pooja';
export const canNestRoom=r=>isPooja(r)||r?.kind==='bathroom'||(!r?.kind&&/^bathroom$/i.test(r?.name?.trim()||''));
function containsRoom(parent,child){
 // A shared outside wall is allowed; otherwise leave room for the partition.
 const gaps=[child.x-parent.x,child.y-parent.y,parent.x+parent.w-child.x-child.w,parent.y+parent.d-child.y-child.d];
 return gaps.every(g=>g>=-1e-6&&(Math.abs(g)<1e-6||g>=THICKNESS-1e-6))&&parent.w*parent.d>child.w*child.d+1e-6;
}
export function roomHost(plan,room){return canNestRoom(room)?plan.rooms.filter(p=>p.id!==room.id&&containsRoom(p,room)).sort((a,b)=>a.w*a.d-b.w*b.d)[0]||null:null;}
export function roomAt(plan,x,y){return [...plan.rooms].sort((a,b)=>a.w*a.d-b.w*b.d).find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.d);}
export function placePooja(plan,roomId,hostId){return placeInsideRoom(plan,roomId,hostId);}
export function placeInsideRoom(plan,roomId,hostId){
 const room=plan.rooms.find(r=>r.id===roomId),host=plan.rooms.find(r=>r.id===hostId);if(!canNestRoom(room)||!host||room.id===host.id||roomHost(plan,host))throw Error('Choose a separate room to place this room inside.');
 const candidates=[{x:host.x,y:host.y},{x:host.x+host.w-room.w,y:host.y},{x:host.x,y:host.y+host.d-room.d},{x:host.x+host.w-room.w,y:host.y+host.d-room.d}];
 for(const pt of candidates){const next={...room,...pt};if(containsRoom(host,next)&&!roomProblem(plan,next)){try{changeRoom(plan,next);return;}catch{ /* Try another corner clear of existing doors and windows. */ }}}
 throw Error('This room does not fit here. Reduce its width or length, or choose a larger room.');
}
export function roomProblem(plan,r){
 if(![r.x,r.y,r.w,r.d].every(Number.isFinite)||r.w<.6||r.d<.6||r.w>50||r.d>50)return 'Use a room size between 2 and 164 feet (0.6–50 m).';
 const host=roomHost(plan,r);if(host&&roomHost(plan,host))return 'Place this room inside a separate room, not inside an already nested room.';
 for(const o of plan.rooms)if(o.id!==r.id&&!(canNestRoom(r)&&containsRoom(o,r))&&!(canNestRoom(o)&&containsRoom(r,o))&&r.x<o.x+o.w+THICKNESS-1e-6&&r.x+r.w+THICKNESS>o.x+1e-6&&r.y<o.y+o.d+THICKNESS-1e-6&&r.y+r.d+THICKNESS>o.y+1e-6)return 'These rooms overlap. Move this room beside the other one.';
 return null;
}
export function snapRoom(plan,r){
 const gridX=Math.round(r.x/GRID)*GRID,gridY=Math.round(r.y/GRID)*GRID;
 const xs=[],ys=[];
 for(const o of plan.rooms)if(o.id!==r.id){
  xs.push(o.x,o.x+o.w+THICKNESS,o.x-r.w-THICKNESS,o.x+o.w-r.w);
  ys.push(o.y,o.y+o.d+THICKNESS,o.y-r.d-THICKNESS,o.y+o.d-r.d);
 }
 // Test nearby combinations together: the nearest X and Y independently
 // can push a room into a neighbour even when a valid shared-wall fit exists.
 const nearby=(v,values,grid)=>[...new Set(values.filter(n=>Math.abs(n-v)<.25).concat(grid,v))];
 const candidates=[];
 for(const x of nearby(r.x,xs,gridX))for(const y of nearby(r.y,ys,gridY)){
  const next={...r,x,y};if(roomProblem(plan,next))continue;
  // Prefer aligned edges/grid over raw pointer coordinates, but never trade
  // a valid position for an overlapping snap. Preserve room dimensions.
  const rawPenalty=(x===r.x&&!xs.includes(x)&&x!==gridX ? .26 : 0)+(y===r.y&&!ys.includes(y)&&y!==gridY ? .26 : 0);
  candidates.push({next,score:Math.hypot(x-r.x,y-r.y)+rawPenalty});
 }
 candidates.sort((a,b)=>a.score-b.score);
 return candidates[0]?.next||{...r,x:gridX,y:gridY};
}
export function addRoom(plan,preset){const [name,w,d,color,kind]=preset;const r={id:id(),name,w,d,color,...(kind?{kind}:{}),x:plan.rooms.length?Math.max(...plan.rooms.map(r=>r.x+r.w))+THICKNESS:0,y:0};plan.rooms.push(r);return r;}
export function changeRoom(plan,next){
 const old=plan.rooms.find(r=>r.id===next.id);if(!old)throw Error('Room not found.');const dx=next.x-old.x,dy=next.y-old.y;
 const children=plan.rooms.filter(r=>roomHost(plan,r)?.id===old.id);
 const replacements=new Map([[old.id,next],...children.map(r=>[r.id,{...r,x:r.x+dx,y:r.y+dy}])]);
 const trial={...plan,objects:clone(plan.objects),rooms:plan.rooms.map(r=>replacements.get(r.id)||r)};
 for(const r of trial.rooms){const error=roomProblem(trial,r);if(error)throw Error(error);}
 for(const child of children)if(roomHost(trial,replacements.get(child.id))?.id!==old.id)throw Error('Keep the inner room inside this room, or move it out before resizing.');
 checkWallCuts(trial);refreshOpenings(trial);for(const opening of trial.objects.filter(o=>o.opening)){const error=objectProblem(trial,opening);if(error)throw Error('This room position blocks an existing door or window. '+error);}
 for(const o of plan.objects)if(replacements.has(o.roomId)){o.x+=dx;o.y+=dy;}
 for(const r of plan.rooms)if(replacements.has(r.id))Object.assign(r,replacements.get(r.id));refreshOpenings(plan);
}
export function openingPosition(plan,o){const r=plan.rooms.find(r=>r.id===o.roomId);if(!r)return null;const e=roomEdges(r).find(e=>e.key===o.edge);if(!e)return null;return {x:e.a.x+(e.b.x-e.a.x)*o.along,y:e.a.y+(e.b.y-e.a.y)*o.along,rotation:close(e.a.y,e.b.y)?0:Math.PI/2};}
export function refreshOpenings(plan){for(const o of plan.objects)if(o.opening)Object.assign(o,openingPosition(plan,o)||{});}
export function attachOpening(plan,o,point){let best=null;
 for(const r of plan.rooms)for(const e of roomEdges(r)){const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,len=Math.hypot(dx,dy);if(o.w>len-THICKNESS*2)continue;const margin=(o.w/2+THICKNESS)/len,along=Math.max(margin,Math.min(1-margin,((point.x-e.a.x)*dx+(point.y-e.a.y)*dy)/(len*len)));const x=e.a.x+dx*along,y=e.a.y+dy*along,dist=Math.hypot(point.x-x,point.y-y);if(!best||dist<best.dist)best={roomId:r.id,edge:e.key,along,x,y,rotation:dy===0?0:Math.PI/2,dist};}
 if(!best||best.dist>.8)throw Error('Place the door or window on a wall.');Object.assign(o,best);delete o.dist;
 const error=objectProblem(plan,o);if(error)throw Error(error);
}
export function footprint(o){const c=Math.abs(Math.cos(o.rotation||0)),s=Math.abs(Math.sin(o.rotation||0));return {w:o.w*c+o.d*s,d:o.w*s+o.d*c};}
export function objectProblem(plan,o){
 if(![o.w,o.d,o.x,o.y,o.elevation||0].every(Number.isFinite)||o.w<=0||o.d<=0)return 'Enter a positive size.';
 if(o.opening){const r=plan.rooms.find(r=>r.id===o.roomId),e=r&&roomEdges(r).find(e=>e.key===o.edge);if(!e)return 'Place this opening on a wall.';const length=Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y);if(o.along*length-o.w/2<THICKNESS-.0001||(1-o.along)*length-o.w/2<THICKNESS-.0001)return 'This opening is too close to a corner. Move it or make it smaller.';
  const horizontal=close(e.a.y,e.b.y),position=horizontal?o.x:o.y;
  const host=wallsFor(plan).find(w=>horizontal?close(w.start.y,o.y)&&close(w.end.y,o.y)&&position-o.w/2>=w.start.x+.04&&position+o.w/2<=w.end.x-.04:close(w.start.x,o.x)&&close(w.end.x,o.x)&&position-o.w/2>=w.start.y+.04&&position+o.w/2<=w.end.y-.04);
  if(!host)return 'Move this opening away from the room junction or make it smaller.';
  for(const other of plan.objects)if(other.id!==o.id&&other.opening){const a=footprint(o),b=footprint(other);if(Math.abs(o.x-other.x)<(a.w+b.w)/2-.001&&Math.abs(o.y-other.y)<(a.d+b.d)/2-.001)return 'These doors or windows overlap. Move one along the wall.';}return null;
 }
 const f=footprint(o),hostRoom=roomAt(plan,o.x,o.y);if(![hostRoom].filter(Boolean).some(r=>o.x-f.w/2>=r.x-.001&&o.x+f.w/2<=r.x+r.w+.001&&o.y-f.d/2>=r.y-.001&&o.y+f.d/2<=r.y+r.d+.001))return 'This item crosses a room edge. Move it inside or make it smaller.';
 for(const other of plan.objects){if(other.id===o.id||other.opening)continue;const b=footprint(other),base=o.elevation||0,otherBase=other.elevation||0;
  if(base+(o.objectHeightM||.9)<=otherBase||otherBase+(other.objectHeightM||.9)<=base)continue;
  if(Math.abs(o.x-other.x)<(f.w+b.w)/2-.02&&Math.abs(o.y-other.y)<(f.d+b.d)/2-.02)return 'These furniture items overlap at the same height. Check their placement.';
 }return null;
}
export function addObject(plan,item,roomId,opening=false){const r=plan.rooms.find(r=>r.id===roomId)||plan.rooms[0];if(!r)throw Error('Add a room first.');const o={id:id(),class:item.id,label:item.label||item.id,icon:item.icon||'▣',roomId:r.id,w:item.w,d:item.d,x:r.x+r.w/2,y:r.y+r.d/2,rotation:0,elevation:item.elevation||0,objectHeightM:item.objectHeightM,opening,record:{...(item.sectionCount?{kitchenSectionCount:item.sectionCount}:{}),...(item.photoSofaSpec?{photoSofaSpec:item.photoSofaSpec}:{})}};
 if(opening){let placed=false;for(const e of roomEdges(r)){for(const along of [.5,.25,.75]){try{attachOpening(plan,o,{x:e.a.x+(e.b.x-e.a.x)*along,y:e.a.y+(e.b.y-e.a.y)*along});placed=true;break;}catch{}}if(placed)break;}if(!placed)throw Error('There is no free wall space for this opening. Make it smaller or choose another room.');}
 else if(objectProblem(plan,o)){const center={x:o.x,y:o.y};let placed=false;for(let y=r.y+o.d/2+.05;y<=r.y+r.d-o.d/2;y+=GRID){for(let x=r.x+o.w/2+.05;x<=r.x+r.w-o.w/2;x+=GRID){o.x=x;o.y=y;if(!objectProblem(plan,o)){placed=true;break;}}if(placed)break;}if(!placed)Object.assign(o,center);}
 plan.objects.push(o);return o;}
export function removeItem(plan,id){const ids=new Set([id,...plan.rooms.filter(r=>roomHost(plan,r)?.id===id).map(r=>r.id)]);plan.wallCuts=(plan.wallCuts||[]).filter(c=>!ids.has(c.roomId));plan.rooms=plan.rooms.filter(r=>!ids.has(r.id));plan.objects=plan.objects.filter(o=>o.id!==id&&!ids.has(o.roomId));}
export function rotateRoom(plan,id){const r=plan.rooms.find(r=>r.id===id),next={...r,w:r.d,d:r.w};const children=plan.rooms.filter(c=>roomHost(plan,c)?.id===id),childNext=children.map(c=>({...c,x:r.x+r.d-(c.y-r.y)-c.d,y:r.y+c.x-r.x,w:c.d,d:c.w}));const trial={...plan,rooms:plan.rooms.map(c=>c.id===id?next:childNext.find(n=>n.id===c.id)||c)};for(const c of trial.rooms){const error=roomProblem(trial,c);if(error)throw Error(error);}
 for(const o of plan.objects.filter(o=>o.roomId===id||children.some(c=>c.id===o.roomId))){const x=o.x-r.x,y=o.y-r.y;o.x=r.x+r.d-y;o.y=r.y+x;o.rotation=(o.rotation||0)-Math.PI/2;if(o.opening){const edge=o.edge;o.edge={top:'right',right:'bottom',bottom:'left',left:'top'}[edge];if(edge==='right'||edge==='left')o.along=1-o.along;}}
 for(const cut of plan.wallCuts||[])if(cut.roomId===id||children.some(c=>c.id===cut.roomId)){
  const owner=plan.rooms.find(r=>r.id===cut.roomId),edge=cut.edge;
  if(edge==='right'||edge==='left')cut.offset=Math.max(0,owner.d+THICKNESS-cut.offset-cut.length);
  cut.edge={top:'right',right:'bottom',bottom:'left',left:'top'}[edge];
 }
 Object.assign(r,next);for(const c of children)Object.assign(c,childNext.find(n=>n.id===c.id));refreshOpenings(plan);
}
export function duplicateItem(plan,key){const r=plan.rooms.find(r=>r.id===key);if(r){const next={...clone(r),id:id(),x:Math.max(...plan.rooms.map(r=>r.x+r.w))+THICKNESS};const children=plan.rooms.filter(c=>roomHost(plan,c)?.id===r.id),ids=new Map([[r.id,next.id]]);plan.rooms.push(next);for(const c of children){const copy={...clone(c),id:id(),x:c.x+next.x-r.x};ids.set(c.id,copy.id);plan.rooms.push(copy);}for(const cut of [...(plan.wallCuts||[])].filter(c=>ids.has(c.roomId)))plan.wallCuts.push({...clone(cut),id:id(),roomId:ids.get(cut.roomId)});for(const o of [...plan.objects].filter(o=>ids.has(o.roomId)))plan.objects.push({...clone(o),id:id(),roomId:ids.get(o.roomId),x:o.x+next.x-r.x});refreshOpenings(plan);return next;}
 const o=plan.objects.find(o=>o.id===key),next={...clone(o),id:id(),x:o.x+GRID,y:o.y+GRID};if(o.opening){let placed=false;const r=plan.rooms.find(r=>r.id===o.roomId);for(const e of roomEdges(r)){for(const along of [.25,.5,.75]){try{attachOpening(plan,next,{x:e.a.x+(e.b.x-e.a.x)*along,y:e.a.y+(e.b.y-e.a.y)*along});placed=true;break;}catch{}}if(placed)break;}if(!placed)throw Error('There is no free wall space for another opening.');}plan.objects.push(next);return next;}
export function exportPlan(plan){checkWallCuts(plan);if(!plan.rooms.length)throw Error('Add a room first.');for(const r of plan.rooms){const e=roomProblem(plan,r);if(e)throw Error(e);}refreshOpenings(plan);for(const o of plan.objects.filter(o=>o.opening)){const e=objectProblem(plan,o);if(e)throw Error(e);}
 return {...clone(plan.viewerLayout||{}),units:'m',metersPerUnit:1,source:'easy-2d-builder',builder:{id:plan.id,revision:plan.revision},calibration:{status:'confirmed',source:'user-entered-builder-dimensions',metersPerPixel:1},rooms:plan.rooms.map(r=>({...clone(plan.viewerLayout?.rooms?.find(old=>old.id===r.id)||{}),id:r.id,name:r.name,room_type:isPooja(r)?'pooja':r.name.toLowerCase().replace(' room',''),builderParentRoomId:roomHost(plan,r)?.id,floorHoles:plan.rooms.filter(c=>roomHost(plan,c)?.id===r.id).map(c=>[{x:c.x,y:c.y},{x:c.x+c.w,y:c.y},{x:c.x+c.w,y:c.y+c.d},{x:c.x,y:c.y+c.d}]),height:3,points:[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.d},{x:r.x,y:r.y+r.d}]})),walls:wallsFor(plan).map(w=>({...clone(plan.viewerLayout?.walls?.find(old=>old.id===w.id)||{}),...w})),objects:plan.objects.map(o=>{const f=o.opening?footprint(o):o;return {...clone(o.record||{}),id:o.id,class:o.class,source:'catalog',bbox:{x1:o.x-f.w/2,x2:o.x+f.w/2,y1:o.y-f.d/2,y2:o.y+f.d/2},rotationY:o.rotation||0,elevation:o.elevation||0,...(o.objectHeightM?{objectHeightM:o.objectHeightM}:{}),builderRoomId:o.roomId};})};
}
export function savedDrafts(storage=projectStorage){
 const entries=JSON.parse(storage.getItem(DRAFT_ARCHIVE_KEY)||'[]');
 if(!Array.isArray(entries))throw Error('Saved 2D plans could not be read.');
 return entries;
}
export function saveDraft(plan,storage=projectStorage){
 const previous=JSON.parse(storage.getItem(DRAFT_KEY)||'null');
 // Keep each earlier home before a fresh plan or imported backup takes its place.
 // Write the archive first: a storage failure must leave the old draft intact.
 if(previous&&previous.id!==plan.id&&previous.rooms?.length){
  validatePlan(previous);
  const entries=savedDrafts(storage).filter(entry=>entry.plan.id!==previous.id);
  entries.unshift({plan:previous,savedAt:new Date().toISOString()});
  storage.setItem(DRAFT_ARCHIVE_KEY,JSON.stringify(entries));
 }
 storage.setItem(DRAFT_KEY,JSON.stringify(plan));
}
export function loadSavedDraft(id,storage=projectStorage){
 const current=JSON.parse(storage.getItem(DRAFT_KEY)||'null');
 if(current?.id===id)return validatePlan(current);
 const entry=savedDrafts(storage).find(entry=>entry.plan.id===id);
 if(!entry)throw Error('This saved 2D plan could not be found. Open Saved Files to choose another plan.');
 return validatePlan(entry.plan);
}
export function deleteSavedDraft(id,storage=projectStorage){
 const draft=storage.getItem(DRAFT_KEY),archive=storage.getItem(DRAFT_ARCHIVE_KEY);
 const current=draft?JSON.parse(draft):null;
 const entries=savedDrafts(storage),remaining=entries.filter(entry=>entry.plan.id!==id);
 const changes=[];
 // Remove any older archived copy too, so deleting the current draft cannot
 // reveal an earlier version of the same plan in Saved Files.
 if(remaining.length!==entries.length)changes.push([DRAFT_ARCHIVE_KEY,remaining.length?JSON.stringify(remaining):null,archive]);
 if(current?.id===id)changes.push([DRAFT_KEY,null,draft]);
 const applied=[];
 try{
  for(const [key,value,previous] of changes){
   if(value===null)storage.removeItem(key);else storage.setItem(key,value);
   applied.push([key,previous]);
  }
 }catch(error){
  for(const [key,previous] of applied.reverse()){
   try{if(previous===null)storage.removeItem(key);else storage.setItem(key,previous);}catch{ /* Keep the original storage error. */ }
  }
  throw error;
 }
}
export function validatePlan(p){
 if(!p||p.version!==1||typeof p.id!=='string'||!Array.isArray(p.rooms)||!Array.isArray(p.objects)||!Number.isFinite(p.revision))throw Error('Choose a valid backup made by this builder.');
 const ids=new Set();for(const r of p.rooms){if(typeof r.id!=='string'||ids.has(r.id)||typeof r.name!=='string')throw Error('Room names or IDs are invalid.');ids.add(r.id);const error=roomProblem(p,r);if(error)throw Error(error);}
 for(const o of p.objects){if(typeof o.id!=='string'||ids.has(o.id)||typeof o.class!=='string'||![o.x,o.y,o.w,o.d,o.rotation||0,o.elevation||0].every(Number.isFinite)||o.w<=0||o.d<=0||!p.rooms.some(r=>r.id===o.roomId))throw Error('An item in this backup has invalid dimensions or a missing room.');ids.add(o.id);}
 if(p.wallCuts!==undefined&&!Array.isArray(p.wallCuts))throw Error('Invalid wall cuts in backup.');
 for(const c of p.wallCuts||[]){if(!c||typeof c.id!=='string'||ids.has(c.id))throw Error('Invalid wall cut in backup.');ids.add(c.id);}
 checkWallCuts(p);p.units=p.units==='m'?'m':'ft';return p;
}
export function loadDraft(storage=projectStorage){const raw=storage.getItem(DRAFT_KEY);if(!raw)return newPlan();return validatePlan(JSON.parse(raw));}
export function syncViewer(plan,layout){
 if(layout?.builder?.id!==plan.id||layout.builder.revision!==plan.revision)return plan;
 const p=clone(plan);p.viewerLayout=clone(layout);
 p.objects=(layout.objects||[]).map(o=>{
  const previous=plan.objects.find(x=>x.id===o.id),b=o.bbox,opening=previous?.opening??/door|window/.test(o.class),vertical=opening&&Math.abs(Math.sin(o.rotationY||0))>.5;
  const x=(b.x1+b.x2)/2,y=(b.y1+b.y2)/2;
  const result={...previous,id:o.id,class:o.class,label:previous?.label||o.class,roomId:roomAt(p,x,y)?.id||o.builderRoomId||previous?.roomId||p.rooms[0]?.id,w:vertical?b.y2-b.y1:b.x2-b.x1,d:vertical?b.x2-b.x1:b.y2-b.y1,x,y,rotation:o.rotationY||0,elevation:o.elevation||0,objectHeightM:o.objectHeightM,opening,record:clone(o)};
  return result;
 });
 // Re-anchor openings using their latest saved viewer positions.
 for(const o of p.objects.filter(o=>o.opening)){try{attachOpening(p,o,{x:o.x,y:o.y});}catch{ /* Keep the saved position and show an actionable validation error. */ }}
 return p;
}
export function launchPlan(plan,storage=projectStorage){const layout=exportPlan(plan),old=storage.getItem('preciseFloorplan');if(old&&JSON.parse(old)?.builder?.id!==plan.id)storage.setItem(BACKUP_KEY,old);saveDraft(plan,storage);storage.setItem('preciseFloorplan',JSON.stringify(layout));storage.setItem('floorplanTimestamp',String(Date.now()));return layout;}
