import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkedRoomLayout } from '../src/tracer/markedRooms.js';
import { buildMetricLayout, metricDimensionConstraints, polygonArea, roomSizeTargets } from '../src/tracer/planMeasurements.js';
import { parseLayout } from '../src/loaders/jsonLoader.js';
import { summarizeMeasurements, buildWallSegments } from '../src/measurements/modelMeasurements.js';

const p = (x,y) => ({x,y});
const EPSILON = 1e-6;
const rect = (x,y,w,h) => [p(x,y),p(x+w,y),p(x+w,y+h),p(x,y+h)];
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const room = (id,points,width,depth) => ({id,name:id,points,boundary_source:'manual', ...roomSizeTargets(width,depth)});
const layout = rooms => ({units:'m',metersPerUnit:1,image_transform:{center_px:p(0,0),meters_per_pixel:.008773},
  rooms,walls:[],objects:[],dimension_defaults:{wall_thickness_m:.15,wall_height_m:3}});
const span = (r,axis) => Math.max(...r.points.map(p=>p[axis]))-Math.min(...r.points.map(p=>p[axis]));

test('a marked room builds exact floors and walls without any scanned wall',()=>{
  const source=buildMetricLayout({walls:[],rooms:[room('Hall',rect(10,10,300,400),'3.29 m','4.995 m')],
    metersPerPixel:.01,defaults:{thickness:.15,height:3}});
  const before=structuredClone(source);
  const {layout:result,report}=buildMarkedRoomLayout(source,metricDimensionConstraints(source));
  assert.deepEqual(source,before);
  close(span(result.rooms[0],'x'),3.29);close(span(result.rooms[0],'y'),4.995);
  close(polygonArea(result.rooms[0].points),3.29*4.995);
  assert.equal(result.walls.length,4);
  const [top,right,bottom,left]=result.walls;
  close(right.start.x-left.start.x-.15,3.29);close(bottom.start.y-top.start.y-.15,4.995);
  assert.equal(report.mode,'marked-boundary');
  const reloaded=parseLayout(JSON.parse(JSON.stringify(result)));
  assert.equal(summarizeMeasurements(reloaded).constraint_status,'satisfied');
  reloaded.rooms[0].points[1].x+=1;
  assert.equal(summarizeMeasurements(reloaded).constraint_status,'mismatch');
});

test('arbitrary angled and concave outlines retain their shape and exact bounding dimensions',()=>{
  for(const points of [[p(0,0),p(2,1),p(3,4),p(0,3)],
    [p(0,0),p(3,0),p(3,1),p(1,1),p(1,3),p(0,3)]]) {
    for(const reverse of [false,true]) {
      const source=layout([room('Angled',reverse?[...points].reverse():points,'4 m','5 m')]);
      const {layout:result}=buildMarkedRoomLayout(source);
      close(span(result.rooms[0],'x'),4);close(span(result.rooms[0],'y'),5);
      assert.equal(result.rooms[0].points.length,points.length);
      assert.equal(result.walls.length,points.length);
      assert.doesNotThrow(()=>parseLayout(JSON.parse(JSON.stringify(result))));
    }
  }
});

test('different adjacent depths and inconsistent area no longer reject export',()=>{
  const source=layout([room('Hall',rect(0,0,2,2),'3.29 m','4.995 m'),room('Bedroom',rect(2.15,0,2,2),'3.5 m','3 m')]);
  source.rooms[0].declared_area_m2=1;
  const {layout:result,report}=buildMarkedRoomLayout(source,metricDimensionConstraints(source));
  close(span(result.rooms[0],'x'),3.29);close(span(result.rooms[0],'y'),4.995);
  close(span(result.rooms[1],'x'),3.5);close(span(result.rooms[1],'y'),3);
  assert.ok(report.notes.some(n=>n.includes('priority over the entered area')));
  assert.ok(result.superseded_dimension_constraints.some(c=>c.type==='area'));
  assert.equal(summarizeMeasurements(result).constraint_status,'satisfied');
  // Independent sizing moves the second room beside the first without overlap.
  close(Math.min(...result.rooms[1].points.map(p=>p.x))-Math.max(...result.rooms[0].points.map(p=>p.x)),.15);
  const sharedX=Math.max(...result.rooms[0].points.map(p=>p.x))+.075;
  const shared=result.walls.filter(w=>Math.abs(w.start.x-sharedX)<1e-6&&Math.abs(w.end.x-sharedX)<1e-6);
  close(shared.reduce((sum,w)=>sum+Math.abs(w.end.y-w.start.y),0),4.995+.15);
});

test('area sets the unspecified dimension; explicit width and depth remain authoritative',()=>{
  for(const [width,depth] of [['4 m',''],['','3 m'],['','']]) {
    const source=layout([room('Area',rect(0,0,2,2),width,depth)]);source.rooms[0].declared_area_m2=12;
    const {layout:result}=buildMarkedRoomLayout(source);
    close(polygonArea(result.rooms[0].points),12);
    if(width)close(span(result.rooms[0],'x'),4);
    if(depth)close(span(result.rooms[0],'y'),3);
  }
});

test('conflicting scan walls are replaced only in marked regions and windows need no existing wall',()=>{
  const source=layout([room('Hall',rect(0,0,2,2),'4 m','3 m')]);
  source.walls=[{id:'bad',start:p(.3,.3),end:p(1.7,1.6),thickness:.5,height:3},
    {id:'outside',start:p(10,10),end:p(12,13),thickness:.15,height:3},
    {id:'through',start:p(-5,1),end:p(8,1),thickness:.15,height:3}];
  source.objects=[{id:'window',class:'window',bbox:{x1:.5,y1:-.15,x2:1.5,y2:.05},sillHeight:1,height:1},
    {id:'table',class:'table',bbox:{x1:.5,y1:.5,x2:1,y2:1}}];
  const {layout:result}=buildMarkedRoomLayout(source,[{id:'scan',type:'length',start:p(0,0),end:p(2,0),target_m:100}]);
  assert.ok(!result.walls.some(w=>w.id.startsWith('bad')));
  assert.ok(result.walls.some(w=>w.id.startsWith('outside')));
  assert.equal(result.walls.filter(w=>w.id.startsWith('through')).length,2);
  assert.equal(result.objects.length,2);close(result.objects[1].bbox.x2,2);
  assert.equal(result.superseded_dimension_constraints.length,1);
  assert.doesNotThrow(()=>parseLayout(JSON.parse(JSON.stringify(result))));
  const segments=buildWallSegments(result.walls,[{...result.objects[0],sillBase:1,winTop:2}]);
  const acrossWindow=segments.filter(w=>Math.abs(w.start.y+.075)<1e-6&&Math.abs(w.end.y+.075)<1e-6 &&
    Math.min(w.start.x,w.end.x)<2&&Math.max(w.start.x,w.end.x)>2);
  assert.ok(acrossWindow.length>0);
  assert.ok(acrossWindow.every(w=>(w.yOffset||0)>=2-EPSILON||((w.yOffset||0)+w.height)<=1+EPSILON));
});
