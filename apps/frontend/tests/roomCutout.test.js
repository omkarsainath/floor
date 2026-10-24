import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { parseRoomCutout, roomCutoutOutline, CUTOUT_CORNERS } from '../src/tracer/roomCutout.js';
import { buildMarkedRoomLayout } from '../src/tracer/markedRooms.js';
import { polygonArea } from '../src/tracer/planMeasurements.js';
import { parseLayout } from '../src/loaders/jsonLoader.js';

const rectangle=[{x:0,y:0},{x:400,y:0},{x:400,y:600},{x:0,y:600}];
const base={id:'bedroom',name:'Bedroom',boundary_source:'manual',points:rectangle,declared_width_m:4,declared_depth_m:6};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('all four corner cut-outs subtract exact geometry and survive save/reload',()=>{
  for(const corner of CUTOUT_CORNERS) {
    const room={...base,cutout:parseRoomCutout(true,corner,'200 cm','3 m',base)};
    const preview=roomCutoutOutline(rectangle,room);
    close(polygonArea(preview),180000);
    const source={units:'m',metersPerUnit:1,rooms:[room],walls:[],objects:[]};
    const before=structuredClone(source);
    const {layout,report}=buildMarkedRoomLayout(source);
    assert.deepEqual(source,before);
    const points=layout.rooms[0].points;
    assert.equal(points.length,6);assert.equal(layout.walls.length,6);
    close(polygonArea(points),18);
    close(report.cutouts[0].removed_area_m2,6);
    close(report.cutouts[0].overall_area_m2,24);
    assert.equal(layout.suppress_bounding_floor,true);
    const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p.x,p.y)));
    const geometry=new THREE.ShapeGeometry(shape),positions=geometry.attributes.position,index=geometry.index;
    let renderedArea=0;
    for(let i=0;i<index.count;i+=3){
      const vertices=[0,1,2].map(j=>({x:positions.getX(index.getX(i+j)),y:positions.getY(index.getX(i+j))}));
      renderedArea+=polygonArea(vertices);
    }
    close(renderedArea,18);geometry.dispose();
    const saved=parseLayout(JSON.parse(JSON.stringify(layout)));
    close(polygonArea(saved.rooms[0].points),18);
    assert.equal(saved.rooms[0].cutout.corner,corner);
    assert.equal(saved.suppress_bounding_floor,true);
  }
});

test('cut-out has an exact corner position and can replace or be removed from a saved rectangle',()=>{
  const room={...base,cutout:parseRoomCutout(true,'top-left','2 m','3 m',base)};
  assert.deepEqual(roomCutoutOutline(rectangle,room),[{x:200,y:0},{x:400,y:0},{x:400,y:600},{x:0,y:600},{x:0,y:300},{x:200,y:300}]);
  const source={units:'m',rooms:[room],walls:[],objects:[]};
  room.cutout.width_m=1;
  close(polygonArea(buildMarkedRoomLayout(source).layout.rooms[0].points),21);
  delete room.cutout;
  close(polygonArea(buildMarkedRoomLayout(source).layout.rooms[0].points),24);
  assert.equal(buildMarkedRoomLayout(source).layout.suppress_bounding_floor,undefined);
});

test('invalid cut-outs explain missing units or impossible dimensions without changing input',()=>{
  for(const [width,depth] of [['4 m','2 m'],['2 m','6 m'],['bad','2 m'],['0','2 m']]){
    assert.throws(()=>parseRoomCutout(true,'top-left',width,depth,base),/cut-out/);
  }
  assert.throws(()=>parseRoomCutout(true,'top-left','2 m','3 m',{}),/overall/);
  assert.equal(parseRoomCutout(false,'top-left','','',{}),null);
  close(parseRoomCutout(true,'top-right','6 ft','5 ft',base).width_m,1.8288);
});

test('an existing bathroom floor inside the cut-out is not removed with the scan labels',()=>{
  const room={...base,points:rectangle.map(p=>({x:p.x/100,y:p.y/100})),cutout:parseRoomCutout(true,'top-left','2 m','3 m',base)};
  const bathroom={id:'bath',name:'Bathroom',boundary_source:'auto_walls',points:[{x:.1,y:.1},{x:1.9,y:.1},{x:1.9,y:2.9},{x:.1,y:2.9}]};
  const {layout}=buildMarkedRoomLayout({units:'m',rooms:[room,bathroom],walls:[],objects:[]});
  assert.equal(layout.rooms.length,2);
  assert.deepEqual(layout.rooms[1].points,bathroom.points);
});
