import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyDimensionConstraints } from '../src/measurements/dimensionConstraints.js';
import { polygonArea, summarizeMeasurements } from '../src/measurements/modelMeasurements.js';
import { createWall } from '../src/generators/wall.js';
import { parseLayout } from '../src/loaders/jsonLoader.js';
import { buildMetricLayout, metricDimensionConstraints, parseArea, areaAnnotationForRoom, snapRoomVertex } from '../src/tracer/planMeasurements.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
const p=(x,y)=>({x,y});
const rect=(x1,y1,x2,y2)=>[p(x1,y1),p(x2,y1),p(x2,y2),p(x1,y2)];
const wall=(id,x1,y1,x2,y2)=>({id,start:p(x1,y1),end:p(x2,y2),thickness:0.2,height:3});
function fixture(adjacent=false) {
  return {units:'m',metersPerUnit:1, walls:[wall('top',-.1,-.1,adjacent?4.3:2.1,-.1),
    wall('left',-.1,-.1,-.1,2.1),wall('shared',2.1,-.1,2.1,2.1),
    wall('bottom',-.1,2.1,adjacent?4.3:2.1,2.1),...(adjacent?[wall('right',4.3,-.1,4.3,2.1)]:[])],
    rooms:[{id:'verandah',name:'Kitchen Verandah',points:rect(0,0,2,2),boundary_reference:'inside_faces'},
      ...(adjacent?[{id:'next',points:rect(2.2,0,4.2,2),boundary_reference:'inside_faces'}]:[])],
    objects:[{id:'window',class:'window',bbox:{x1:2.05,y1:.5,x2:2.15,y2:1.2}},
      {id:'table',class:'table',bbox:{x1:.5,y1:.6,x2:1.1,y2:1.3}}]};
}
const length={id:'span',type:'length',start:p(0,-.6),end:p(2,-.6),target_m:4.50,text:'4.50 m'};
const area={id:'area',type:'area',room_id:'verandah',target_m2:4.4};

test('4.4 m² room and 4.50 m clear span jointly control actual floor and wall geometry',()=>{
  const source=fixture(); const before=structuredClone(source);
  const {layout,report}=applyDimensionConstraints(source,[length,area]);
  assert.deepEqual(source,before);
  close(polygonArea(layout.rooms[0].points),4.4);
  const left=layout.walls.find(w=>w.id==='left'),right=layout.walls.find(w=>w.id==='shared');
  const top=layout.walls.find(w=>w.id==='top'),bottom=layout.walls.find(w=>w.id==='bottom');
  const insideWidth=right.start.x-right.thickness/2-(left.start.x+left.thickness/2);
  const insideDepth=bottom.start.y-bottom.thickness/2-(top.start.y+top.thickness/2);
  close(insideWidth,4.5); close(insideWidth*insideDepth,4.4);
  const renderedLeft=new THREE.Box3().setFromObject(createWall(left));
  // BoxGeometry itself is exact; baseboards intentionally project slightly into the room.
  close(createWall(left).geometry.parameters.depth,0.2);
  assert.ok(renderedLeft.min.x<renderedLeft.max.x);
  close(report.max_error_m,0);close(report.max_error_m2,0);
  assert.equal(summarizeMeasurements(parseLayout(layout)).constraint_status,'satisfied');
});

test('shared wall and window move with both constrained rooms, preserving wall thickness',()=>{
  const {layout}=applyDimensionConstraints(fixture(true),[length,area,{id:'nextArea',type:'area',room_id:'next',target_m2:6}]);
  close(polygonArea(layout.rooms[0].points),4.4);close(polygonArea(layout.rooms[1].points),6);
  const shared=layout.walls.find(w=>w.id==='shared');
  close(layout.rooms[0].points[1].x,shared.start.x-.1);
  close(layout.rooms[1].points[0].x,shared.start.x+.1);
  close((layout.objects[0].bbox.x1+layout.objects[0].bbox.x2)/2,shared.start.x);
  layout.walls.forEach(w=>close(w.thickness,.2));
  assert.equal(layout.walls.filter(w=>w.id==='shared').length,1);
});

test('wall length constraint controls rendered BoxGeometry and saved targets detect later wall edits',()=>{
  const source=fixture();
  const constraint={...length,start:{...source.walls[0].start},end:{...source.walls[0].end}};
  const {layout}=applyDimensionConstraints(source,[constraint,area]);
  close(createWall(layout.walls[0]).geometry.parameters.width,4.5);
  const restored=parseLayout(JSON.parse(JSON.stringify(layout)));
  assert.equal(summarizeMeasurements(restored).constraint_status,'satisfied');
  restored.walls.find(w=>w.id==='shared').start.x+=.2;
  restored.walls.find(w=>w.id==='shared').end.x+=.2;
  // The span endpoint can be bound to the top wall endpoint instead; modify
  // whichever physical endpoint the solver recorded, not its reference label.
  const anchor=restored.dimension_constraints[0].end_anchor;
  const host=restored.walls.find(w=>w.id===anchor.wall_id);
  if(anchor.kind==='endpoint') host[anchor.endpoint][anchor.axis]+=.2;
  else {host.start[anchor.axis]+=.2;host.end[anchor.axis]+=.2;}
  assert.equal(summarizeMeasurements(restored).constraint_status,'mismatch');
});

test('unbound dimension graphics cannot independently stretch while the walls stay unchanged',()=>{
  const source=fixture();
  assert.throws(()=>applyDimensionConstraints(source,[{...length,start:p(.5,-.5),end:p(1.5,-.5)}]),/does not align with a wall/);
});

test('concave room area is constrained using its actual inside polygon',()=>{
  const source={units:'m',walls:[wall('top',-.1,-.1,3.1,-.1),wall('east',3.1,-.1,3.1,1.1),
    wall('return-h',3.1,1.1,1.1,1.1),wall('return-v',1.1,1.1,1.1,3.1),
    wall('bottom',1.1,3.1,-.1,3.1),wall('west',-.1,3.1,-.1,-.1)],
    rooms:[{id:'verandah',points:[p(0,0),p(3,0),p(3,1),p(1,1),p(1,3),p(0,3)],boundary_reference:'inside_faces'}]};
  const {layout}=applyDimensionConstraints(source,[{...length,end:p(3,-.6)},area]);
  close(polygonArea(layout.rooms[0].points),4.4);
  assert.equal(layout.rooms[0].points.length,6);
});

test('conflicting dimensions fail atomically instead of exporting a misleading model',()=>{
  const source=fixture(),before=structuredClone(source);
  assert.throws(()=>applyDimensionConstraints(source,[length,{...length,id:'conflict',target_m:5}]),/cannot all be satisfied/);
  assert.deepEqual(source,before);
  assert.throws(()=>applyDimensionConstraints(source,[length,area,{id:'depth',type:'length',start:p(-.6,0),end:p(-.6,2),target_m:2}]),/cannot all be satisfied/);
});

test('clear room area rejects wall-centre outlines, floating annotations and unsupported diagonal correction',()=>{
  const center=fixture();center.rooms[0].points=rect(-.1,-.1,2.1,2.1);
  assert.throws(()=>applyDimensionConstraints(center,[area]),/inside|wall/);
  const floating=fixture();floating.rooms[0].points=rect(.3,.3,1.7,1.7);
  assert.throws(()=>applyDimensionConstraints(floating,[area]),/inside wall face/);
  const diagonal=fixture();diagonal.walls[0].end.y=.2;
  assert.throws(()=>applyDimensionConstraints(diagonal,[length]),/horizontal and vertical/);
});

test('printed area parsing and matching never use a nearby room’s annotation',()=>{
  close(parseArea('A: 4.4 m²'),4.4);close(parseArea('4.4 m^2'),4.4);
  const annotation={id:'a',confidence:.95,value_m2:4.4,bbox:[20,20,50,40],text:'4.4 m²'};
  assert.equal(areaAnnotationForRoom(rect(0,0,100,100),[annotation]),annotation);
  assert.equal(areaAnnotationForRoom(rect(100,0,200,100),[annotation]),null);
  assert.equal(areaAnnotationForRoom(rect(0,0,100,100),[annotation,{...annotation,id:'b'}]),null);
  assert.deepEqual(snapRoomVertex([p(10,10),p(100,10)],p(104,80)),p(100,80));
});

test('pixel references become world spans and imported units cannot change SI targets',()=>{
  const layout=buildMetricLayout({walls:[{...wall('top',0,0,450,0),source:'manual'}],metersPerPixel:.01,
    rooms:[{id:'a',points:rect(0,10,200,200),boundary_reference:'inside_faces',declared_area_m2:4.4}]});
  const constraints=metricDimensionConstraints(layout,[{...length,start:p(0,0),end:p(450,0)}]);
  close(constraints[0].end.x-constraints[0].start.x,4.5);close(constraints[1].target_m2,4.4);
  const imported=parseLayout({units:'cm',walls:[],rooms:[],dimension_constraints:[{...length,start:p(0,0),end:p(450,0)}]});
  close(imported.dimension_constraints[0].end.x,4.5);close(imported.dimension_constraints[0].target_m,4.5);
});
