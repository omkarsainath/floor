import test from 'node:test';
import assert from 'node:assert/strict';
import {newPlan,ROOM_PRESETS,addRoom,wallsFor,changeRoom,addObject,attachOpening,exportPlan,rotateRoom,removeItem,duplicateItem,loadDraft,launchPlan,syncViewer,objectProblem,THICKNESS,BACKUP_KEY} from '../src/builder/model.js';
import {parseLayout} from '../src/loaders/jsonLoader.js';
import {buildWallSegments} from '../src/measurements/modelMeasurements.js';
const fixture=()=>{const p=newPlan();addRoom(p,ROOM_PRESETS[0]);addRoom(p,ROOM_PRESETS[0]);return p;};
const bed={id:'bed',label:'Bed',w:1.5,d:2};
const door={id:'door',label:'Door',w:.9,d:.15};
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
test('two adjoining rooms share one wall with exact clear room dimensions',()=>{const p=fixture(),walls=wallsFor(p);assert.equal(walls.length,7);assert.equal(walls.filter(w=>w.wall_type==='interior').length,1);const l=parseLayout(exportPlan(p));assert.equal(l.rooms[0].points[1].x-l.rooms[0].points[0].x,3.048);assert.equal(l.units,'m');assert.equal(p.rooms[1].x,p.rooms[0].w+THICKNESS);});
test('partial shared partitions split at junctions without duplicate wall segments',()=>{const p=fixture();changeRoom(p,{...p.rooms[1],d:1.8,y:1});const w=wallsFor(p);assert.equal(w.filter(w=>w.wall_type==='interior').length,1);assert.equal(new Set(w.map(w=>JSON.stringify([w.start,w.end]))).size,w.length);});
test('rooms reject overlap, move contents, rotate contents, and delete as a unit',()=>{const p=fixture(),r=p.rooms[0],o=addObject(p,bed,r.id);assert.throws(()=>changeRoom(p,{...r,x:1}),/overlap/);const before={...o};changeRoom(p,{...r,y:-5});assert.equal(o.y,before.y-5);removeItem(p,p.rooms[1].id);rotateRoom(p,r.id);assert.equal(r.w,ROOM_PRESETS[0][2]);const copy=duplicateItem(p,r.id);assert.equal(p.objects.length,2);removeItem(p,r.id);assert.equal(p.rooms[0].id,copy.id);assert.equal(p.objects.length,1);});
test('wall openings attach, reject overlap and oversized changes, and export along vertical walls',()=>{const p=fixture(),r=p.rooms[0],o=addObject(p,door,r.id,true);attachOpening(p,o,{x:r.x+r.w+THICKNESS/2,y:r.y+r.d/2});const record=exportPlan(p).objects[0];assert.ok(record.bbox.y2-record.bbox.y1>.89);assert.ok(record.bbox.x2-record.bbox.x1<.16);const another={...o,id:'other'};assert.throws(()=>attachOpening(p,another,{x:o.x,y:o.y}),/overlap/);o.w=10;assert.match(objectProblem(p,o),/corner/);});
test('draft and viewer handoff preserve prior projects and edited component settings',()=>{const p=fixture(),o=addObject(p,bed,p.rooms[0].id),s=storage();s.setItem('preciseFloorplan','{"rooms":[],"walls":[],"objects":[]}');const l=launchPlan(p,s);assert.ok(s.getItem(BACKUP_KEY));assert.equal(loadDraft(s).id,p.id);l.objects[0].wardrobeFinishes={'door-1':{laminateId:'example'}};l.objects[0].bbox.x1+=.2;l.objects[0].bbox.x2+=.2;const updated=syncViewer(p,l);assert.deepEqual(exportPlan(updated).objects[0].wardrobeFinishes,l.objects[0].wardrobeFinishes);assert.ok(Math.abs(updated.objects[0].x-o.x-.2)<1e-8);l.builder.id='unrelated';assert.deepEqual(syncViewer(p,l),p);});
test('furniture crossing a boundary is flagged, elevated overlapping furniture is allowed',()=>{const p=fixture(),o=addObject(p,bed,p.rooms[0].id),loft=addObject(p,{id:'loft',w:1,d:.5,elevation:2},p.rooms[0].id);assert.equal(objectProblem(p,o),null);assert.equal(objectProblem(p,loft),null);o.x=-1;assert.match(objectProblem(p,o),/crosses/);});

test('shared-wall doors produce an actual floor-level opening and a lintel in 3D',()=>{
 const p=fixture(),r=p.rooms[0],o=addObject(p,door,r.id,true);attachOpening(p,o,{x:r.w+THICKNESS/2,y:r.d/2});const layout=exportPlan(p),obj=layout.objects[0],wall=layout.walls.find(w=>w.wall_type==='interior');
 const pieces=buildWallSegments(layout.walls,[{id:obj.id,bbox:obj.bbox,sillBase:0,winTop:2.1}]).filter(w=>w.parentWallId===wall.id);
 assert.ok(pieces.length>1);const middle=pieces.filter(w=>Math.min(w.start.y,w.end.y)<o.y&&Math.max(w.start.y,w.end.y)>o.y);assert.ok(middle.length);assert.ok(middle.every(w=>(w.yOffset||0)>2),'Only the lintel should occupy the doorway centre');
});
test('save failure does not erase the previous project and opening duplication finds free wall space',()=>{
 const p=fixture(),o=addObject(p,door,p.rooms[0].id,true);const duplicate=duplicateItem(p,o.id);assert.equal(objectProblem(p,duplicate),null);const s=storage();s.setItem('preciseFloorplan','{"rooms":[],"objects":[]}');const previous=s.getItem('preciseFloorplan');const fail={getItem:s.getItem,setItem:()=>{throw Error('Storage full');}};assert.throws(()=>launchPlan(p,fail),/Storage full/);assert.equal(s.getItem('preciseFloorplan'),previous);
});
test('an opening cannot cross a T junction, and invalid backups cannot replace a good draft',async()=>{
 const {validatePlan}=await import('../src/builder/model.js');const p=fixture();changeRoom(p,{...p.rooms[1],y:1,d:1.8});const o={id:'junction',class:'door',opening:true,roomId:p.rooms[0].id,edge:'right',along:1/3,w:.9,d:.15,x:p.rooms[0].w+.075,y:.925,rotation:Math.PI/2};assert.match(objectProblem(p,o),/junction/);
 assert.throws(()=>validatePlan({...p,rooms:[{...p.rooms[0],w:NaN}]}));assert.equal(exportPlan(fixture()).calibration.status,'confirmed');
});

test('Pooja Room fits inside any ordinary room, keeps overlap protection and exports a separate floor',async()=>{
 const {placePooja,roomHost,roomAt}=await import('../src/builder/model.js');
 for(const preset of ROOM_PRESETS.filter(p=>p[4]!=='pooja')){
  const p=newPlan(),host=addRoom(p,preset),pr=addRoom(p,ROOM_PRESETS.find(p=>p[4]==='pooja'));
  placePooja(p,pr.id,host.id);assert.equal(roomHost(p,pr).id,host.id);assert.equal(roomAt(p,pr.x+.3,pr.y+.3).id,pr.id);
  assert.equal(exportPlan(p).rooms.find(r=>r.id===host.id).floorHoles.length,1);
  assert.throws(()=>changeRoom(p,{...pr,x:host.x+host.w-.1}),/overlap/);
  const o=addObject(p,{id:'pooja-unit',w:.5,d:.3},pr.id),x=pr.x;changeRoom(p,{...host,x:host.x+5});assert.equal(pr.x,x+5);assert.equal(o.roomId,pr.id);
  const oldW=host.w;assert.throws(()=>changeRoom(p,{...host,w:.7}));assert.equal(host.w,oldW);
  const copy=duplicateItem(p,host.id);assert.equal(p.rooms.filter(r=>roomHost(p,r)?.id===copy.id).length,1);
  removeItem(p,host.id);assert.equal(p.rooms.length,2);assert.equal(p.objects.length,1);
 }
});
test('Pooja Room rotates with its parent and two Pooja Rooms cannot overlap',async()=>{
 const {placePooja,roomHost}=await import('../src/builder/model.js');const p=newPlan(),host=addRoom(p,ROOM_PRESETS[1]),pr=addRoom(p,ROOM_PRESETS.at(-1));placePooja(p,pr.id,host.id);const o=addObject(p,{id:'pooja-unit',w:.5,d:.3},pr.id);rotateRoom(p,host.id);assert.equal(roomHost(p,pr).id,host.id);assert.equal(objectProblem(p,o),null);
 const second=addRoom(p,ROOM_PRESETS.at(-1));assert.throws(()=>changeRoom(p,{...second,x:pr.x,y:pr.y}),/overlap/);
});
test('nested Pooja floors do not overlap parent floors or applied floor finishes',async()=>{
 const {placePooja}=await import('../src/builder/model.js'),{createFloorGeometry}=await import('../src/generators/floor.js'),{buildRoomFinish}=await import('../src/design/finishGeometry.js');
 const p=newPlan(),host=addRoom(p,ROOM_PRESETS[1]),pr=addRoom(p,ROOM_PRESETS.at(-1));placePooja(p,pr.id,host.id);
 for(const interior of [false,true]){
  if(interior)changeRoom(p,{...pr,x:host.x+.4,y:host.y+.4});
  const room=exportPlan(p).rooms[0],floor={geometry:createFloorGeometry(room.points,room.floorHoles)};
  const area=g=>{const pos=g.attributes.position,idx=g.index;let total=0;for(let i=0;i<(idx?idx.count:pos.count);i+=3){const a=idx?idx.getX(i):i,b=idx?idx.getX(i+1):i+1,c=idx?idx.getX(i+2):i+2;total+=Math.abs((pos.getX(b)-pos.getX(a))*(pos.getZ(c)-pos.getZ(a))-(pos.getZ(b)-pos.getZ(a))*(pos.getX(c)-pos.getX(a)))/2;}return total;};
  assert.ok(Math.abs(area(floor.geometry)-(host.w*host.d-pr.w*pr.d))<1e-5);
  const group=buildRoomFinish({room,selection:{floor:'test'},styleLookup:()=>({id:'test',category:'floor',color:'#ffffff',pattern:'microcement'})});let finish;group.traverse(n=>{if(n.userData.isRoomFinishFloor)finish=n;});assert.ok(finish);assert.ok(Math.abs(area(finish.geometry)-(host.w*host.d-pr.w*pr.d))<1e-5);
 }
});

test('partial shared-wall cuts leave a full-height gap in exported 3D geometry and restore cleanly',async()=>{
 const {uncutWallsFor,addWallCut,restoreWallCut}=await import('../src/builder/model.js');
 const p=fixture(),wall=uncutWallsFor(p).find(w=>w.wall_type==='interior'),original=wallsFor(p);
 const cut=addWallCut(p,wall.id,.7,1.2),layout=parseLayout(exportPlan(p));
 const pieces=buildWallSegments(layout.walls,[]).filter(w=>Math.abs(w.start.x-wall.start.x)<1e-6&&Math.abs(w.end.x-wall.start.x)<1e-6);
 assert.equal(pieces.length,2);const gap=wall.start.y+.7+.6;
 assert.ok(pieces.every(w=>gap<=Math.min(w.start.y,w.end.y)||gap>=Math.max(w.start.y,w.end.y)),'No wall or lintel in the cut');
 assert.equal(layout.rooms.length,2);restoreWallCut(p,cut.id);assert.deepEqual(wallsFor(p),original);
 const total=wall.end.y-wall.start.y;addWallCut(p,wall.id,0,total);
 assert.equal(wallsFor(p).filter(w=>w.wall_type==='interior').length,0);
});
test('wall cuts survive saving and viewer return, follow rooms, rotate and duplicate with rooms',async()=>{
 const {uncutWallsFor,addWallCut,wallCutLine}=await import('../src/builder/model.js');
 const p=newPlan(),r=addRoom(p,ROOM_PRESETS[0]);const w=uncutWallsFor(p).find(w=>w.builderEdge==='right');const cut=addWallCut(p,w.id,.6,1);
 const before=wallCutLine(p,cut);changeRoom(p,{...r,x:4,y:2});const after=wallCutLine(p,cut);assert.equal(after.start.x,before.start.x+4);assert.equal(after.start.y,before.start.y+2);
 const s=storage(),layout=launchPlan(p,s),saved=loadDraft(s);assert.deepEqual(saved.wallCuts,p.wallCuts);assert.deepEqual(syncViewer(saved,layout).wallCuts,p.wallCuts);
 const initial=structuredClone(wallCutLine(p,cut));for(let i=0;i<4;i++)rotateRoom(p,r.id);const rotated=wallCutLine(p,cut);assert.ok(Math.abs(initial.start.y-rotated.start.y)<1e-6);assert.equal(cut.edge,'right');
 const copy=duplicateItem(p,r.id);assert.equal(p.wallCuts.length,2);assert.equal(p.wallCuts[1].roomId,copy.id);removeItem(p,r.id);assert.equal(p.wallCuts.length,1);assert.equal(p.wallCuts[0].roomId,copy.id);
});
test('wall cut bounds, backup validation, shrinking rooms and existing doors are protected',async()=>{
 const {uncutWallsFor,addWallCut,validatePlan}=await import('../src/builder/model.js');
 const p=newPlan(),r=addRoom(p,ROOM_PRESETS[0]),o=addObject(p,door,r.id,true),wall=uncutWallsFor(p).find(w=>w.builderEdge===o.edge);
 assert.throws(()=>addWallCut(p,wall.id,0,100),/inside/);
 assert.throws(()=>addWallCut(p,wall.id,0,Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y)),/door or window/);
 assert.equal(p.wallCuts,undefined);removeItem(p,o.id);addWallCut(p,wall.id,1.5,1);
 assert.throws(()=>changeRoom(p,{...r,w:1}),/wall cut/);
 const invalid=structuredClone(p);invalid.wallCuts[0].offset=NaN;assert.throws(()=>validatePlan(invalid),/wall cut/);
 const onGap={id:'gap-door',class:'door',opening:true,roomId:r.id,edge:'top',along:2/(r.w+THICKNESS),w:.8,d:.15,x:r.x-.075+2,y:r.y-.075,rotation:0};assert.match(objectProblem(p,onGap),/junction/);
});
test('overlapping cuts merge geometrically and restoring one preserves the other',async()=>{
 const {uncutWallsFor,addWallCut,restoreWallCut}=await import('../src/builder/model.js');
 const p=newPlan();addRoom(p,ROOM_PRESETS[0]);const wall=uncutWallsFor(p).find(w=>w.builderEdge==='top');
 const a=addWallCut(p,wall.id,.4,1),b=addWallCut(p,wall.id,1,1);
 const length=()=>wallsFor(p).filter(w=>w.start.y===wall.start.y&&w.end.y===wall.start.y).reduce((n,w)=>n+w.end.x-w.start.x,0);
 assert.ok(Math.abs(length()-(wall.end.x-wall.start.x-1.6))<1e-6);restoreWallCut(p,a.id);assert.ok(Math.abs(length()-(wall.end.x-wall.start.x-b.length))<1e-6);
});

test('cuts pass through both offset wall layers between an Empty Room and Living Room',async()=>{
 const {uncutWallsFor,addWallCut,restoreWallCut,wallCutLine,GRID}=await import('../src/builder/model.js');
 for(const horizontal of [false,true])for(const fromLiving of [false,true]){
  const p=newPlan(),empty=addRoom(p,ROOM_PRESETS[4]),living=addRoom(p,ROOM_PRESETS[1]);
  changeRoom(p,{...living,x:horizontal?0:empty.w+GRID,y:horizontal?empty.d+GRID:0});
  const owner=fromLiving?living:empty,edge=horizontal?(fromLiving?'top':'bottom'):(fromLiving?'left':'right');
  const wall=uncutWallsFor(p).find(w=>w.builderRoomId===owner.id&&w.builderEdge===edge),original=wallsFor(p),cut=addWallCut(p,wall.id,.5,1);
  const line=wallCutLine(p,cut),axis=horizontal?'x':'y',fixed=horizontal?'y':'x',middle=(line.start[axis]+line.end[axis])/2;
  const across=w=>Math.abs(w.start[fixed]-line.start[fixed])<.01&&Math.abs(w.end[fixed]-line.start[fixed])<.01&&w.start[axis]<middle&&w.end[axis]>middle;
  assert.equal(original.filter(across).length,2,'Fixture has two overlapping wall layers');
  assert.equal(wallsFor(p).filter(across).length,0);
  const saved=structuredClone(p),layout=parseLayout(exportPlan(saved));
  assert.equal(buildWallSegments(layout.walls,[]).filter(across).length,0,'Saved cuts remove both wall layers in 3D');
  restoreWallCut(p,cut.id);assert.deepEqual(wallsFor(p),original);
 }
});
test('cutting a touching wall band leaves separated parallel and perpendicular walls intact',async()=>{
 const {uncutWallsFor,addWallCut}=await import('../src/builder/model.js');
 for(const gap of [.0024,.05,THICKNESS,THICKNESS+.02]){
  const p=newPlan(),empty=addRoom(p,ROOM_PRESETS[4]),living=addRoom(p,ROOM_PRESETS[1]);
  changeRoom(p,{...living,x:empty.w+THICKNESS+gap,y:1});
  const raw=uncutWallsFor(p),wall=raw.find(w=>w.builderRoomId===empty.id&&w.builderEdge==='right');
  addWallCut(p,wall.id,0,wall.end.y-wall.start.y);
  const neighbour=wallsFor(p).filter(w=>w.builderRoomId===living.id&&w.builderEdge==='left');
  assert.equal(neighbour.some(w=>w.start.y<2&&w.end.y>2),gap>THICKNESS);
  assert.ok(neighbour.some(w=>w.end.y>empty.d+THICKNESS),'The unselected length of the living-room wall remains');
  assert.deepEqual(wallsFor(p).filter(w=>Math.abs(w.start.y-w.end.y)<1e-6),raw.filter(w=>Math.abs(w.start.y-w.end.y)<1e-6));
 }
});

 test('bathrooms fit inside every room type and preserve parent movement and floor cutouts',async()=>{
 const {placeInsideRoom,roomHost}=await import('../src/builder/model.js');
 for(const preset of ROOM_PRESETS){
  const p=newPlan(),host=addRoom(p,preset);changeRoom(p,{...host,w:5,d:5});
  const bath=addRoom(p,ROOM_PRESETS[3]);placeInsideRoom(p,bath.id,host.id);
  assert.equal(roomHost(p,bath)?.id,host.id);
  const exported=exportPlan(p);assert.equal(exported.rooms.find(r=>r.id===bath.id).room_type,'bathroom');
  assert.equal(exported.rooms.find(r=>r.id===host.id).floorHoles.length,1);
  const x=bath.x;changeRoom(p,{...host,x:host.x+6});assert.equal(bath.x,x+6);
  assert.throws(()=>changeRoom(p,{...bath,x:host.x+host.w-.2}),/overlap/);
  const other=addRoom(p,ROOM_PRESETS[3]);assert.throws(()=>changeRoom(p,{...other,x:bath.x,y:bath.y}),/overlap/);
 }
 });
 test('saved bathrooms without a kind can be placed inside rooms',async()=>{
 const {placeInsideRoom,roomHost}=await import('../src/builder/model.js');
 const p=newPlan(),host=addRoom(p,ROOM_PRESETS[1]),bath=addRoom(p,ROOM_PRESETS[3]);delete bath.kind;
 placeInsideRoom(p,bath.id,host.id);assert.equal(roomHost(p,bath)?.id,host.id);
 });

test('room snapping finds a valid shared-wall fit between two neighbours',async()=>{
 const {snapRoom,roomProblem}=await import('../src/builder/model.js');
 const p=newPlan();p.rooms=[
  {id:'left',name:'Bedroom',x:0,y:0,w:2,d:3},
  {id:'right',name:'Kitchen',x:4.3,y:0,w:2,d:3},
  {id:'distant',name:'Bedroom',x:2.14,y:10,w:2,d:3},
  {id:'moving',name:'Empty Room',x:10,y:0,w:2,d:2}];
 const snapped=snapRoom(p,{...p.rooms[3],x:2.14,y:.02});
 assert.equal(roomProblem(p,snapped),null);assert.ok(Math.abs(snapped.x-2.15)<1e-6);
 assert.equal(snapped.w,2);assert.equal(snapped.d,2);changeRoom(p,snapped);
});
test('snapping still rejects a room wider than the gap',async()=>{
 const {snapRoom,roomProblem}=await import('../src/builder/model.js');
 const p=newPlan();p.rooms=[{id:'left',x:0,y:0,w:2,d:3},{id:'right',x:4.3,y:0,w:2,d:3}];
 const snapped=snapRoom(p,{id:'moving',name:'Empty Room',x:2.15,y:0,w:2.1,d:2});
 assert.match(roomProblem(p,snapped),/overlap/);
});
