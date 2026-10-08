import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLength, parseArea, polygonArea, validateBoundary, scaleFromReference, scaleFromRoomArea, buildMetricLayout } from '../src/tracer/planMeasurements.js';
import { parseLayout, loadLayout } from '../src/loaders/jsonLoader.js';
import { persistLayout } from '../src/state/projectPersistence.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const rectangle = [{x:0,y:0},{x:400,y:0},{x:400,y:300},{x:0,y:300}];
const wall = { start: {x:0,y:0}, end: {x:1000,y:0}, thickness_px: 12, thickness: 0.15, source: 'cv' };

test('dimension parser accepts image notation and never truncates feet to metres', () => {
  close(parseLength(`41' 0"`), 12.4968);
  close(parseLength('30′ 10″'), 9.398);
  close(parseLength('10 ft 6 in'), 3.2004);
  close(parseLength('420 cm'), 4.2);
  close(parseLength('900 mm'), 0.9);
  close(parseLength('3.25'), 3.25);
  for (const value of ['41 elephants', '0', '-4 m', `3' 14"`, '10 x 12', '120 sqft', null]) assert.equal(parseLength(value), null);
  close(parseArea('120 sq. ft'), 11.1483648);
  close(parseArea('11.5 m²'), 11.5);
  assert.equal(parseArea('120'), null);
});

test('41-foot reference scales walls, detected thickness, objects and room areas once through save/import', () => {
  const reference = { start: {x:20,y:25}, end:{x:1020,y:25}, meters:parseLength(`41' 0"`) };
  const scale = scaleFromReference(reference);
  const result = buildMetricLayout({ walls:[wall], rooms:[{name:'Bedroom', points:rectangle}],
    objects:[{class:'bed',bbox:{x1:100,y1:100,x2:300,y2:400}}],
    metersPerPixel:scale, scaleSource:'manual', calibration:{status:'confirmed',reference} });
  const entries = new Map();
  persistLayout(result, {setItem:(key,value)=>entries.set(key,value)});
  const restored = parseLayout(JSON.parse(entries.get('preciseFloorplan')));
  close(restored.walls[0].end.x - restored.walls[0].start.x, 12.4968);
  close(restored.walls[0].thickness, 12 * scale);
  close(restored.objects[0].bbox.x2 - restored.objects[0].bbox.x1, 200 * scale);
  close(polygonArea(restored.rooms[0].points), 120000 * scale * scale);
  assert.equal(restored.calibration.status, 'confirmed');
  close(restored.calibration.reference.meters, 12.4968);
  assert.equal(restored.units,'m');
});

test('uncalibrated preview cannot claim measured area or confirmed scale', () => {
  const layout = buildMetricLayout({walls:[wall], calibration:{status:'confirmed'}});
  assert.equal(layout.calibration.status,'unscaled');
  assert.equal(layout.scale_m_per_px,null);
  assert.deepEqual(layout.rooms,[]);
});

test('area annotations preserve independent evidence rather than deforming the room', () => {
  const layout = buildMetricLayout({walls:[wall],metersPerPixel:0.01,
    rooms:[{points:rectangle,declared_area_m2:20}]});
  close(polygonArea(layout.rooms[0].points),12);
  assert.equal(layout.rooms[0].declared_area_m2,20);
  assert.throws(()=>validateBoundary([{x:0,y:0},{x:4,y:3},{x:0,y:3},{x:4,y:0}]),/crosses/);
});

test('an explicitly chosen room area determines uniform scale using the actual outline', () => {
  const scale = scaleFromRoomArea(rectangle, parseArea('120 sqft'));
  const layout = buildMetricLayout({ walls:[wall], rooms:[{points:rectangle}], metersPerPixel:scale });
  close(polygonArea(layout.rooms[0].points),parseArea('120 sqft'));
  assert.throws(()=>scaleFromRoomArea([],12),/corners/);
});

test('metres-per-unit is applied exactly once and invalid walls cannot become zero coordinates', async () => {
  const imported = parseLayout({metersPerUnit:0.3048, walls:[{start:{x:0,y:0},end:{x:41,y:0},height:10,thickness:0.5}], rooms:[]});
  close(imported.walls[0].end.x,12.4968);
  close(imported.walls[0].height,3.048);
  close(imported.walls[0].thickness,0.1524);
  assert.deepEqual(parseLayout(imported),imported);
  assert.throws(()=>parseLayout({walls:[{start:{x:'bad',y:0},end:{x:4,y:0}}]}),/must be finite/);
  assert.throws(()=>parseLayout({walls:[{start:{x:0,y:0},end:{x:4,y:0},thickness:-1}]}),/positive/);
  assert.throws(()=>parseLayout({units:'m',metersPerUnit:0.3048}),/disagree/);
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>({ok:false,status:404,statusText:'Not found'});
  try { await assert.rejects(loadLayout('/missing'),/404/); }
  finally { globalThis.fetch=previous; }
});

test('legacy detections preserve declared units and mark room rectangles as estimates', async () => {
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,json:async()=>({units:'cm',detections:[
    {type:'wall',bbox:{coordinates:{x1:0,y1:0,x2:1000,y2:20}}},
    {type:'room',bbox:{coordinates:{x1:0,y1:20,x2:1000,y2:500}}},
  ]})});
  try {
    const layout=await loadLayout('/detections');
    close(layout.walls[0].end.x-layout.walls[0].start.x,10);
    close(layout.walls[0].thickness,0.2);
    assert.equal(layout.units,'m');
    assert.equal(layout.rooms[0].boundary_source,'detection_bbox');
    assert.equal(layout.rooms[0].area_source,'bbox');
    assert.equal(layout.rooms[0].height,3);
  } finally { globalThis.fetch=previous; }
});
