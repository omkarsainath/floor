import test from 'node:test';
import assert from 'node:assert/strict';
import { snapRadiusForPlan, snapWallIntersections, replaceAutoDoors } from '../src/tracer/wallGeometry.js';
import { buildMetricLayout } from '../src/tracer/planMeasurements.js';
import { buildWallSegments } from '../src/measurements/modelMeasurements.js';

const wall = (x1, y1, x2, y2, extra = {}) => ({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, ...extra });

test('snap repairs L/T junctions without tilting axes or losing metadata', () => {
  const input = [wall(0, 20, 98, 20, { height: 3 }), wall(100, 23, 100, 80), wall(50, 24, 50, 60)];
  const before = structuredClone(input);
  const result = snapWallIntersections(input);
  assert.deepEqual(result[0], wall(0, 20, 100, 20, { height: 3, geometry_edited: true }));
  assert.deepEqual(result[1].start, { x: 100, y: 20 });
  assert.deepEqual(result[2].start, { x: 50, y: 20 });
  assert.deepEqual(input, before);
  assert.deepEqual(snapWallIntersections(result), result);
});

test('short walls, doorway gaps and close parallel walls survive snapping', () => {
  for (const input of [
    [wall(0, 0, 6, 0)],
    [wall(0, 0, 40, 0), wall(46, 0, 100, 0)],
    [wall(0, 0, 100, 0), wall(0, 4, 100, 4)],
  ]) assert.deepEqual(snapWallIntersections(input, 18), input);
});

test('high-resolution plans use a larger bounded corner snap radius', () => {
  assert.equal(snapRadiusForPlan(600, 800), 10);
  assert.equal(snapRadiusForPlan(2048, 2048), 25);
  assert.equal(snapRadiusForPlan(6000, 4000), 32);
  const input = [wall(0, 100, 980, 100), wall(1000, 118, 1000, 900)];
  const result = snapWallIntersections(input, snapRadiusForPlan(2048, 2048));
  assert.deepEqual(result[0].end, { x: 1000, y: 100 });
  assert.deepEqual(result[1].start, { x: 1000, y: 100 });
});

test('short corner returns extend to the crossing without changing their direction', () => {
  const input = [wall(0, 20, 100, 20), wall(100, 27, 100, 43)];
  const snapped = snapWallIntersections(input, 10);
  assert.deepEqual(snapped[1].start, { x: 100, y: 20 });
  assert.deepEqual(snapped[1].end, input[1].end);
  assert.deepEqual(snapWallIntersections(snapped, 10), snapped);
});

test('a connected corner does not move to a second nearby wall on repeated snaps', () => {
  const input = [wall(0, 20, 100, 20), wall(100, 20, 100, 80), wall(106, 0, 106, 90)];
  const snapped = snapWallIntersections(input, 10);
  assert.deepEqual(snapped[0].end, input[0].end);
  assert.deepEqual(snapWallIntersections(snapped, 10), snapped);
});

test('repeated detections replace auto doors and respect authored doors', () => {
  const manual = { id: 'manual', source: 'manual', swingDir: 'left-inside', bbox: { x1: 10, y1: 10, x2: 50, y2: 50 } };
  const detections = [
    { id: 'door_auto_0', source: 'auto', bbox: { x1: 12, y1: 10, x2: 52, y2: 50 } },
    { id: 'door_auto_1', source: 'auto', bbox: { x1: 100, y1: 10, x2: 140, y2: 50 } },
  ];
  const once = replaceAutoDoors([manual], detections);
  assert.equal(once.length, 2);
  assert.deepEqual(once[0], manual);
  assert.deepEqual(replaceAutoDoors(once, detections), once);
  assert.deepEqual(replaceAutoDoors(once, []), [manual]);
});

for (const kind of ['door', 'window']) for (const vertical of [false, true]) {
  test(`snap/export preserves ${vertical ? 'vertical' : 'horizontal'} ${kind} masonry and clear opening`, () => {
    const rotate = p => vertical ? { x: p.y, y: p.x } : p;
    const make = (id,x1,y1,x2,y2) => ({ ...wall(x1,y1,x2,y2), id, source:'auto', thickness_px:25, thickness:.15 });
    const input = [make('left',0,100,100,100), make('right',200,100,300,100),
      make('near-left-jamb',80,100,80,200), make('near-right-jamb',220,100,220,200),
      make('outer-corner',305,105,305,200)].map(w => ({...w,start:rotate(w.start),end:rotate(w.end)}));
    const a=rotate({x:100,y:87.5}), b=rotate({x:200,y:112.5});
    const opening = {class:kind,bbox:{x1:a.x,y1:a.y,x2:b.x,y2:b.y},sillBase:kind==='door'?0:.9,winTop:2.1};
    const before=structuredClone(input);
    const snapped=snapWallIntersections(input,25,[opening]);
    assert.deepEqual(snapped[0].end,input[0].end,'left jamb must not move to the return');
    assert.deepEqual(snapped[1].start,input[1].start,'right jamb must not move to the return');
    assert.deepEqual(snapped[1].end,rotate({x:305,y:100}),'ordinary outer corner still snaps');
    assert.equal(snapped[1].source,'auto');
    assert.equal(snapped[1].geometry_edited,true);
    assert.deepEqual(snapWallIntersections(snapped,25,[opening]),snapped);
    assert.deepEqual(input,before);
    const layout=buildMetricLayout({walls:snapped,objects:[opening],metersPerPixel:.01});
    assert.equal(layout.walls[1].thickness,.25,'snapping must retain measured thickness, not the .15 placeholder');
    const pieces=buildWallSegments(layout.walls,layout.objects);
    const fills=pieces.filter(w=>w.isDetectedGap&&w.isOpeningFill);
    assert.equal(fills.length,kind==='door'?1:2);
    for(const w of fills) {
      assert.ok(Math.abs(Math.hypot(w.end.x-w.start.x,w.end.y-w.start.y)-1)<1e-8);
      assert.ok(w.yOffset>=opening.winTop || w.yOffset+w.height<=opening.sillBase,'opening remains unobstructed');
    }
    assert.ok(fills.some(w=>w.yOffset===2.1&&Math.abs(w.height-.9)<1e-8),'header above opening');
    if(kind==='window') assert.ok(fills.some(w=>w.yOffset===0&&w.height===.9),'wall below sill');
  });
}
