import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkedRoomLayout } from '../src/tracer/markedRooms.js';
import { polygonArea } from '../src/tracer/planMeasurements.js';
import { buildWallSegments } from '../src/measurements/modelMeasurements.js';
import { parseLayout } from '../src/loaders/jsonLoader.js';

const p=(x,y)=>({x,y});
const wall=(id,x1,y1,x2,y2)=>({id,start:p(x1,y1),end:p(x2,y2),height:3,thickness:.15});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(){return {units:'m',metersPerUnit:1,image_transform:{meters_per_pixel:.01},
  rooms:[{id:'hall',name:'Hall',boundary_source:'manual',points:[p(0,0),p(4,0),p(4,6),p(0,6)],declared_width_m:3.29,declared_depth_m:4.995}],
  walls:[wall('top',-.075,-.075,4.075,-.075),wall('left',-.075,-.075,-.075,6.075),
    wall('bottom',-.075,6.075,4.075,6.075),wall('bedroom-side',4.075,-.075,4.075,4)],objects:[]};}
const rightWalls=layout=>layout.walls.filter(w=>w.source==='marked-room'&&Math.abs(w.start.x-3.365)<1e-6&&Math.abs(w.end.x-3.365)<1e-6);

test('Hall keeps its kitchen passage at the end of a partially walled edge after sizing and reload',()=>{
  const source=fixture(),before=structuredClone(source);
  const {layout,report}=buildMarkedRoomLayout(source);
  assert.deepEqual(source,before);
  const right=rightWalls(layout);assert.equal(right.length,1);
  close(Math.max(right[0].start.y,right[0].end.y),4/6*4.995);
  close(polygonArea(layout.rooms[0].points),3.29*4.995);
  assert.ok(report.notes.some(n=>n.includes('open passage')));
  const loaded=parseLayout(JSON.parse(JSON.stringify(layout)));
  close(rightWalls(loaded)[0].end.y,4/6*4.995);
});

test('internal gaps and fully open edges remain open without a door detection',()=>{
  const source=fixture();source.walls.at(-1).end.y=2;
  source.walls.push(wall('right-lower',4.075,4,4.075,6.075));
  let result=buildMarkedRoomLayout(source).layout;
  const runs=rightWalls(result).sort((a,b)=>a.start.y-b.start.y);
  assert.equal(runs.length,2);
  close(runs[0].end.y,2/6*4.995);close(runs[1].start.y,4/6*4.995);
  source.walls=source.walls.slice(0,3);
  result=buildMarkedRoomLayout(source).layout;
  assert.equal(rightWalls(result).length,0);
});

test('window gaps still retain sill and lintel while the kitchen passage stays empty',()=>{
  const source=fixture();source.walls.at(-1).end.y=1;
  source.walls.push(wall('right-below-window',4.075,2.5,4.075,4));
  source.objects.push({id:'window',class:'window',bbox:{x1:3.95,y1:1,x2:4.2,y2:2.5}});
  const {layout}=buildMarkedRoomLayout(source);
  const right=rightWalls(layout);assert.equal(right.length,1);close(right[0].end.y,4/6*4.995);
  const rendered=buildWallSegments(layout.walls,[{...layout.objects[0],sillBase:1,winTop:2.2}]);
  const pieces=rendered.filter(w=>w.parentWallId===right[0].id);
  assert.ok(pieces.some(w=>w.isOpeningFill&&w.yOffset===0&&Math.abs(w.height-1)<1e-6));
  assert.ok(pieces.some(w=>w.isOpeningFill&&Math.abs(w.yOffset-2.2)<1e-6));
  assert.ok(pieces.every(w=>Math.max(w.start.y,w.end.y)<=4/6*4.995+1e-6));
});

test('reversed tracing order and reversed scan walls preserve the same passage',()=>{
  const source=fixture();source.rooms[0].points.reverse();
  source.walls.forEach(w=>{[w.start,w.end]=[w.end,w.start];});
  const result=buildMarkedRoomLayout(source).layout;
  const right=rightWalls(result);assert.equal(right.length,1);
  close(Math.max(right[0].start.y,right[0].end.y),4/6*4.995);
});

test('creating a room without wall evidence still supplies its complete boundary',()=>{
  const source=fixture();source.walls=[];
  const {layout}=buildMarkedRoomLayout(source);
  assert.equal(layout.walls.length,4);
});
