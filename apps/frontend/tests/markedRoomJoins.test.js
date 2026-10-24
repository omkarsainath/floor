import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkedRoomLayout } from '../src/tracer/markedRooms.js';
import { polygonArea } from '../src/tracer/planMeasurements.js';
import { buildWallSegments } from '../src/measurements/modelMeasurements.js';
const p=(x,y)=>({x,y});
const rect=(x,y,w,h)=>[p(x,y),p(x+w,y),p(x+w,y+h),p(x,y+h)];
const room=(id,points,w,h)=>({id,name:id,points,boundary_source:'manual',declared_width_m:w,declared_depth_m:h});
const wall=(id,x1,y1,x2,y2)=>({id,start:p(x1,y1),end:p(x2,y2),thickness:.15,height:3});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const bounds=points=>({left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))});

test('shrinking a room carries originally adjoining rooms with it instead of leaving strips between walls',()=>{
  for(const second of [rect(4.15,0,3,6),rect(0,6.15,4,3),rect(-3.15,0,3,6),rect(0,-3.15,4,3)]){
    const source={units:'m',rooms:[room('Hall',rect(0,0,4,6),3.29,4.995),room('Next',second,2.5,3)],walls:[],objects:[]};
    const before=structuredClone(source),{layout}=buildMarkedRoomLayout(source);
    assert.deepEqual(source,before);
    const a=bounds(layout.rooms[0].points),b=bounds(layout.rooms[1].points),s=bounds(second);
    if(s.left>4)close(b.left-a.right,.15);
    else if(s.top>6)close(b.top-a.bottom,.15);
    else if(s.right<0)close(a.left-b.right,.15);
    else close(a.top-b.bottom,.15);
    close(polygonArea(layout.rooms[0].points),3.29*4.995);
    close(polygonArea(layout.rooms[1].points),7.5);
  }
});

test('a chain of adjoining resized rooms stays connected while an unrelated room stays distant',()=>{
  const source={units:'m',rooms:[room('A',rect(0,0,4,4),3,3),room('B',rect(4.15,0,4,4),2,3),
    room('C',rect(8.3,0,4,4),3.5,3),room('Separate',rect(20,0,4,4),4,4)],walls:[],objects:[]};
  const {layout}=buildMarkedRoomLayout(source), boxes=layout.rooms.map(r=>bounds(r.points));
  close(boxes[1].left-boxes[0].right,.15);close(boxes[2].left-boxes[1].right,.15);
  close(boxes[3].left,20);
});

test('small jamb and corner scan seams close while the full kitchen passage stays open',()=>{
  const source={units:'m',image_transform:{meters_per_pixel:.01},rooms:[room('Hall',rect(0,0,4,6),4,6)],
    walls:[wall('top',.05,-.075,3.95,-.075),wall('left',-.075,.05,-.075,5.95),wall('bottom',.05,6.075,3.95,6.075),
      wall('right-above-door',4.075,.05,4.075,1),wall('right-below-door',4.075,2.1,4.075,4)],
    objects:[{id:'door',class:'door',bbox:{x1:3.9,y1:1.05,x2:4.1,y2:2.05}}]};
  const {layout}=buildMarkedRoomLayout(source);
  const right=layout.walls.filter(w=>w.source==='marked-room'&&Math.abs(w.start.x-4.075)<1e-6&&Math.abs(w.end.x-4.075)<1e-6);
  assert.equal(right.length,1);close(right[0].start.y,-.075);close(right[0].end.y,4);
  close((layout.objects[0].bbox.x1+layout.objects[0].bbox.x2)/2,4.075);
  const pieces=buildWallSegments(layout.walls,[{...layout.objects[0],sillBase:0,winTop:2.4}]);
  const lintels=pieces.filter(w=>w.parentWallId===right[0].id&&w.isOpeningFill);
  assert.equal(lintels.length,1);close(lintels[0].yOffset,2.4);
  assert.ok(pieces.filter(w=>w.parentWallId===right[0].id).every(w=>Math.max(w.start.y,w.end.y)<=4+1e-6));
});
