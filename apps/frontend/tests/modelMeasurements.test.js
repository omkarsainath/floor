import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWall } from '../src/generators/wall.js';
import { createObject, getWindowSillAndTop } from '../src/generators/object.js';
import { buildWallSegments, openingSpanOnWall, polygonArea, summarizeMeasurements, wallLength } from '../src/measurements/modelMeasurements.js';

const wall = { id: 'wall-1', start: { x: 0, y: 0 }, end: { x: 12.4968, y: 0 }, height: 2.75, thickness: 0.23, wall_type: 'exterior' };
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test('41-foot wall and explicit thickness/height render at their exact supplied dimensions', () => {
  const mesh = createWall(wall);
  approx(mesh.geometry.parameters.width, 12.4968);
  approx(mesh.geometry.parameters.height, 2.75);
  approx(mesh.geometry.parameters.depth, 0.23);
  const shortFill = createWall({ ...wall, wall_type: 'half', height: 0.1, thickness: 0.08, yOffset: 2.65 });
  approx(shortFill.geometry.parameters.height, 0.1);
  approx(shortFill.geometry.parameters.depth, 0.08);
  approx(shortFill.position.y, 2.7);
});

test('concave room floor area uses its polygon, not its enclosing rectangle', () => {
  const points = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }];
  approx(polygonArea(points), 12);
  const summary = summarizeMeasurements({ calibration: { status: 'confirmed', source: 'manual' }, rooms: [{ name: 'Living', points, declared_area_m2: 10 }], walls: [wall] });
  approx(summary.rooms[0].area_sqft, 129.16692500051668);
  approx(summary.rooms[0].difference_percent, 20);
  assert.equal(summary.status, 'confirmed');
  assert.equal(summarizeMeasurements({ rooms: [{ points, boundary_source: 'detection_bbox' }] }).rooms.length, 0);
  assert.equal(summarizeMeasurements({ scale_m_per_px: 0.1, scale_source: 'door-width' }).status, 'unscaled');
});

test('opening projection recognizes a box straddling the wall even if corners are distant', () => {
  const span = openingSpanOnWall(wall, { x1: 2, y1: -1, x2: 4, y2: 1 });
  assert.ok(span);
  approx(span.start, 2);
  approx(span.end, 4);
  approx(span.distance, 0);
});

test('window fills inherit wall dimensions, conserve length, and leave exactly one opening', () => {
  const segments = buildWallSegments([wall], [{ bbox: { x1: 2, y1: -0.15, x2: 4, y2: 0.15 }, sillBase: 0.9, winTop: 2.1 }]);
  assert.equal(segments.length, 4);
  segments.forEach(segment => { assert.equal(segment.thickness, 0.23); assert.equal(segment.parentWallId, wall.id); });
  const volume = segments.reduce((sum, segment) => sum + wallLength(segment) * segment.height * segment.thickness, 0);
  approx(volume, (12.4968 * 2.75 - 2 * 1.2) * 0.23);
  assert.equal(Math.min(...segments.map(segment => segment.start.x)), 0);
  approx(Math.max(...segments.map(segment => segment.end.x)), 12.4968);
});

test('overlapping door and window do not create opaque duplicate fill pieces', () => {
  const openings = [
    { bbox: { x1: 2, y1: -0.15, x2: 4, y2: 0.15 }, sillBase: 0.9, winTop: 2.1 },
    { bbox: { x1: 3, y1: -0.15, x2: 5, y2: 0.15 }, sillBase: 0, winTop: 2 },
  ];
  const segments = buildWallSegments([wall], openings);
  const overlap = segments.filter(segment => segment.start.x === 3 && segment.end.x === 4);
  assert.equal(overlap.length, 1);
  approx(overlap[0].yOffset, 2.1);
  approx(overlap[0].height, 0.65);
});

test('a window cuts its host wall only, not a nearby parallel or perpendicular wall', () => {
  const parallel = { ...wall, id: 'parallel', start: { x: 0, y: 0.2 }, end: { x: 12.4968, y: 0.2 } };
  const crossing = { ...wall, id: 'crossing', start: { x: 2, y: 0 }, end: { x: 2, y: 4 } };
  const segments = buildWallSegments([wall, parallel, crossing], [{ bbox: { x1: 2, y1: -0.15, x2: 4, y2: 0.15 }, sillBase: 0.9, winTop: 2.1 }]);
  assert.equal(segments.filter(segment => segment.parentWallId === 'parallel').length, 1);
  assert.equal(segments.filter(segment => segment.parentWallId === 'crossing').length, 1);
  assert.equal(segments.filter(segment => segment.parentWallId === wall.id).length, 4);
});

test('opening cuts on diagonal walls preserve endpoints and total wall volume', () => {
  const diagonal = { ...wall, start: { x: 0, y: 0 }, end: { x: 4, y: 4 } };
  const bbox = { x1: 1, y1: 1, x2: 2, y2: 2 };
  const segments = buildWallSegments([diagonal], [{ bbox, sillBase: 0.9, winTop: 2.1 }]);
  const totalVolume = segments.reduce((sum, segment) => sum + wallLength(segment) * segment.height * segment.thickness, 0);
  approx(totalVolume, (Math.sqrt(32) * 2.75 - Math.sqrt(2) * 1.2) * 0.23);
});

test('door heights match the wall cut and are not inferred from top-down bbox depth', () => {
  const dimensions = { height_m: 2.15, sill_height_m: 0.05 };
  const heights = getWindowSillAndTop('door', dimensions);
  approx(heights.sillBase, 0.05);
  approx(heights.winTop, 2.2);
  const door = createObject({ class: 'door', bbox: { x1: 2, y1: -0.3, x2: 3, y2: 0.3 }, walls: [wall], ...dimensions });
  const panels = [];
  door.traverse(child => { if (child.isMesh) panels.push(child.geometry.parameters.height || 0); });
  approx(Math.max(...panels), 2.15);
  approx(door.position.y, 0.05);
});

const splitDoorway = () => ({
  walls: [
    { ...wall, id: 'left', start: { x: 0, y: 0 }, end: { x: 2, y: 0 }, height: 3,
      faceColors: { inside: '#aabbcc', outside: '#ddeeff' } },
    { ...wall, id: 'right', start: { x: 3, y: 0 }, end: { x: 5, y: 0 }, height: 3 },
  ],
  openings: [{ id: 'door', class: 'door', bbox: { x1: 2, y1: -0.1, x2: 3, y2: 0.1 },
    ...getWindowSillAndTop('door') }],
});

test('detected doorway gap gets a lintel with host paint and unchanged measured walls', () => {
  const input = splitDoorway(), before = structuredClone(input);
  const segments = buildWallSegments(input.walls, input.openings);
  const fills = segments.filter(segment => segment.isDetectedGap);
  assert.equal(fills.length, 1);
  const lintel = fills[0];
  assert.deepEqual(lintel.start, { x: 2, y: 0 });
  assert.deepEqual(lintel.end, { x: 3, y: 0 });
  approx(lintel.yOffset, 2.4); approx(lintel.height, 0.6);
  assert.equal(lintel.thickness, wall.thickness);
  assert.equal(lintel.parentWallId, 'left');
  assert.deepEqual(lintel.faceColors, input.walls[0].faceColors);
  assert.equal(lintel.isOpeningFill, true);
  const mesh = createWall(lintel);
  approx(mesh.geometry.parameters.height, 0.6);
  approx(mesh.position.y, 2.7);
  assert.equal(mesh.children.length, 0);
  assert.deepEqual(input, before);
  assert.deepEqual(summarizeMeasurements({ walls: input.walls }).walls.map(w => w.length_m), [2, 2]);
});

test('vertical and reversed wall fragments keep a connected lintel and their paint orientation', () => {
  for (const vertical of [false, true]) for (const reversed of [false, true]) {
    const { walls, openings } = splitDoorway();
    if (vertical) {
      walls.forEach(w => ['start', 'end'].forEach(k => { w[k] = { x: w[k].y, y: w[k].x }; }));
      openings[0].bbox = { x1: -0.1, y1: 2, x2: 0.1, y2: 3 };
    }
    if (reversed) walls.forEach(w => { [w.start, w.end] = [w.end, w.start]; });
    const fills = buildWallSegments(walls, openings).filter(s => s.isDetectedGap);
    assert.equal(fills.length, 1);
    approx(wallLength(fills[0]), 1);
    approx(fills[0].yOffset + fills[0].height, 3);
    const host = walls[0], fill = fills[0];
    assert.ok((host.end.x-host.start.x)*(fill.end.x-fill.start.x)
      + (host.end.y-host.start.y)*(fill.end.y-fill.start.y) > 0);
  }
});

test('a small detection mismatch fills the lintel across the jambs without vertical slivers', () => {
  const { walls, openings } = splitDoorway();
  openings[0].bbox.x1 += 0.025; openings[0].bbox.x2 -= 0.025;
  const fills = buildWallSegments(walls, openings).filter(s => s.isDetectedGap);
  assert.equal(fills.length, 1);
  approx(wallLength(fills[0]), 1); approx(fills[0].yOffset, 2.4);
});

test('frame-to-wall offsets at a corner jamb still get a header across the complete gap', () => {
  const { walls, openings } = splitDoorway();
  walls.forEach(w => { w.thickness = 0.13; });
  walls[1].start.x = 3.07;
  openings[0].bbox.x2 = 2.91;
  const fills = buildWallSegments(walls, openings).filter(s => s.isDetectedGap);
  assert.equal(fills.length, 1);
  approx(wallLength(fills[0]), 1.07);
  approx(fills[0].height, 0.6);
});

test('overlapping openings share one gap fill and full-height doors leave no lintel', () => {
  const { walls, openings } = splitDoorway();
  const taller = { ...structuredClone(openings[0]), id: 'replacement', winTop: 2.7 };
  const fills = buildWallSegments(walls, [...openings, taller, taller]).filter(s => s.isDetectedGap);
  assert.equal(fills.length, 1);
  approx(fills[0].height, 0.3); approx(fills[0].yOffset, 2.7);
  assert.equal(buildWallSegments(walls, [{ ...taller, winTop: 3 }]).filter(s => s.isDetectedGap).length, 0);
});

test('raised opening in a detected gap keeps both the sill and lintel', () => {
  const { walls, openings } = splitDoorway();
  const fills = buildWallSegments(walls, [{ ...openings[0], sillBase: 0.2, winTop: 2.2 }]).filter(s => s.isDetectedGap);
  assert.equal(fills.length, 2);
  approx(fills[0].yOffset, 0); approx(fills[0].height, 0.2);
  approx(fills[1].yOffset, 2.2); approx(fills[1].height, 0.8);
});

test('scan thickness and centreline jitter still produce window sill and header',()=>{
  const {walls,openings}=splitDoorway();
  walls[1]={...walls[1],thickness:walls[0].thickness*1.25,
    start:{...walls[1].start,y:.035},end:{...walls[1].end,y:.035}};
  const fills=buildWallSegments(walls,[{...openings[0],sillBase:.9,winTop:2.1}]).filter(w=>w.isDetectedGap);
  assert.equal(fills.length,2);
  approx(fills[0].height,.9);approx(fills[1].yOffset,2.1);
});

test('unmatched gaps, isolated doors, unsupported corners and changed wall sections are not bridged', () => {
  const { walls, openings } = splitDoorway();
  const noBridges = (w, o) => assert.equal(buildWallSegments(w, o).filter(s => s.isDetectedGap).length, 0);
  noBridges(walls, []);
  noBridges(walls, [{ ...openings[0], bbox: { x1: 2.3, y1: -0.1, x2: 2.7, y2: 0.1 } }]);
  noBridges([walls[0]], openings);
  noBridges([walls[0], { ...walls[1], start: { x: 3.5, y: .5 }, end: { x: 3.5, y: 3 } }], openings);
  noBridges([walls[0], { ...walls[1], start: { x: 3, y: 0.2 }, end: { x: 5, y: 0.2 } }], openings);
  noBridges([walls[0], { ...walls[1], height: 2 }], openings);
  noBridges([walls[0], { ...walls[1], thickness: 0.5 }], openings);
});

test('door at a perpendicular corner gets a header without blocking the doorway', () => {
  const { walls, openings } = splitDoorway();
  walls[1].end = { x: 3, y: 3 };
  const original = structuredClone({ walls, openings });
  const fills = buildWallSegments(walls, openings).filter(s => s.isDetectedGap);
  assert.equal(fills.length, 1);
  assert.ok(fills[0].isCornerOpeningGap);
  approx(fills[0].yOffset, 2.4); approx(fills[0].height, .6);
  approx(wallLength(fills[0]), 1);
  assert.deepEqual(fills[0].faceColors, walls[0].faceColors);
  assert.deepEqual({ walls, openings }, original);
});

test('window between two corner returns gets a sill and header, with a clear pane', () => {
  const walls = [
    { ...wall, start: { x: 2, y: 0 }, end: { x: 2, y: 3 }, height: 3 },
    { ...wall, id: 'second', start: { x: 3, y: 0 }, end: { x: 3, y: 3 }, height: 3 },
  ];
  const opening = { class: 'window', bbox: { x1: 2, y1: -.1, x2: 3, y2: .1 }, sillBase: .9, winTop: 2.1 };
  const fills = buildWallSegments(walls, [opening]).filter(s => s.isDetectedGap);
  assert.equal(fills.length, 2);
  approx(fills[0].height, .9); approx(fills[1].yOffset, 2.1);
  const meshes = fills.map(createWall);
  meshes.forEach(m => m.updateMatrixWorld(true));
  const hit = y => new THREE.Raycaster(new THREE.Vector3(2.5,y,-1),new THREE.Vector3(0,0,1)).intersectObjects(meshes).length > 0;
  assert.ok(hit(.45)); assert.ok(hit(2.6)); assert.equal(hit(1.5),false);
  meshes.forEach(m => m.traverse(c => { c.geometry?.dispose(); (Array.isArray(c.material)?c.material:[c.material]).filter(Boolean).forEach(mat => mat.dispose()); }));
});

test('corner supports work vertically, with reversed hosts, and with small jamb offsets', () => {
  for (const vertical of [false,true]) for (const reversed of [false,true]) {
    const { walls, openings } = splitDoorway();
    walls[1].start.x = 3.06; walls[1].end = { x: 3.06, y: 3 };
    if (reversed) [walls[0].start,walls[0].end]=[walls[0].end,walls[0].start];
    if (vertical) {
      walls.forEach(w => [w.start,w.end].forEach(p => { [p.x,p.y]=[p.y,p.x]; }));
      openings[0].bbox = { x1: -.1, y1: 2, x2: .1, y2: 3 };
    }
    const fills=buildWallSegments(walls,openings).filter(s=>s.isDetectedGap);
    assert.equal(fills.length,1); approx(wallLength(fills[0]),1.06);
    const host=walls[0],fill=fills[0];
    assert.ok((host.end.x-host.start.x)*(fill.end.x-fill.start.x)+(host.end.y-host.start.y)*(fill.end.y-fill.start.y)>0);
  }
});

test('corner fallback rejects mismatched levels, ambiguous swing boxes and existing host walls', () => {
  const { walls, openings }=splitDoorway(); walls[1].end={x:3,y:3};
  const none=(ws,os)=>assert.equal(buildWallSegments(ws,os).filter(s=>s.isDetectedGap).length,0);
  none([walls[0]],openings);
  none([walls[0],{...walls[1],height:2}],openings);
  none([walls[0],{...walls[1],yOffset:1}],openings);
  none(walls,[{...openings[0],bbox:{x1:2,y1:0,x2:3,y2:1}}]);
  const continuous={...walls[0],id:'continuous',start:{x:0,y:0},end:{x:5,y:0}};
  none([...walls,continuous],openings);
});

test('duplicate corner window detections do not duplicate masonry', () => {
  const { walls, openings }=splitDoorway(); walls[1].end={x:3,y:3};
  const window={...openings[0],class:'window',sillBase:.9,winTop:2.1};
  assert.equal(buildWallSegments(walls,[window,{...window}]).filter(s=>s.isDetectedGap).length,2);
});

test('one opening never adds lintels to two nearby parallel wall lines', () => {
  const { walls, openings } = splitDoorway();
  const parallel = walls.map(w => ({ ...w, id: w.id + '-parallel',
    start: { ...w.start, y: 0.2 }, end: { ...w.end, y: 0.2 } }));
  openings[0].bbox.y1 = -0.3; openings[0].bbox.y2 = 0.3;
  const fills = buildWallSegments([...walls, ...parallel], openings).filter(s => s.isDetectedGap);
  assert.equal(fills.length, 1);
  approx(fills[0].start.y, 0);
});

test('an existing wall across the opening does not also get a duplicate gap lintel', () => {
  const { walls, openings } = splitDoorway();
  const continuous = { ...walls[0], id: 'continuous', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } };
  assert.equal(buildWallSegments([...walls, continuous], openings).filter(s => s.isDetectedGap).length, 0);
});

test('an opening assigned to a parallel wall cannot enable an unrelated partial gap fill', () => {
  const { walls, openings } = splitDoorway();
  walls.forEach(w => { w.thickness = 0.05; });
  const parallel = walls.map(w => ({ ...w, id: w.id + '-parallel',
    start: { ...w.start, y: 0.1 }, end: { ...w.end, y: 0.1 } }));
  const broad = { ...openings[0], bbox: { x1: 2, y1: -0.05, x2: 3, y2: 0.25 } };
  const partial = { ...openings[0], id: 'partial', bbox: { x1: 2.3, y1: -0.02, x2: 2.7, y2: 0.02 } };
  const fills = buildWallSegments([...walls, ...parallel], [broad, partial]).filter(s => s.isDetectedGap);
  assert.equal(fills.length, 1);
  approx(fills[0].start.y, 0.1);
});

test('adjoining door and side-light share a gap without losing the window sill',()=>{
  const walls=[{id:'a',start:{x:0,y:0},end:{x:2,y:0},height:3,thickness:.15},
    {id:'b',start:{x:4,y:0},end:{x:6,y:0},height:3,thickness:.15}];
  const openings=[{id:'door',bbox:{x1:2,y1:-.1,x2:3,y2:.1},sillBase:0,winTop:2.1},
    {id:'side-light',bbox:{x1:3,y1:-.1,x2:4,y2:.1},sillBase:.9,winTop:2.1}];
  const fills=buildWallSegments(walls,openings).filter(w=>w.isDetectedGap);
  assert.ok(fills.some(w=>w.start.x===2 && w.end.x===3 && w.yOffset===2.1));
  assert.ok(fills.some(w=>w.start.x===3 && w.end.x===4 && w.height===.9 && w.yOffset===0));
  assert.ok(!fills.some(w=>w.start.x<3 && w.yOffset===0));
});
