// Replay a saved scan through the actual tracer export and 3D wall splitter.
// Usage: node apps/backend/scripts/inspect_opening_fills.mjs scan.json
// Piece counts are diagnostics, not an accuracy or full-coverage measurement.
import fs from 'node:fs';
import { buildMetricLayout } from '../../frontend/src/tracer/planMeasurements.js';
import { buildWallSegments, openingGapWalls, openingSpanOnWall } from '../../frontend/src/measurements/modelMeasurements.js';
import { getWindowSillAndTop } from '../../frontend/src/generators/object.js';
const scan=JSON.parse(fs.readFileSync(process.argv[2]));
const layout=buildMetricLayout({walls:scan.walls,doors:scan.doors,objects:scan.rooms_and_objects,metersPerPixel:.01});
const openings=layout.objects.filter(o=>/door|window|glass/i.test(o.class)).map(o=>({...o,...getWindowSillAndTop(o.class,o)}));
const gaps=openingGapWalls(layout.walls,openings), segments=buildWallSegments(layout.walls,openings);
const center=layout.image_transform.center_px;
const pixel=p=>({x:Math.round(p.x/.01+center.x),y:Math.round(p.y/.01+center.y)});
for(const o of openings){
 const box=o.bbox, midpoint={x:(box.x1+box.x2)/2,y:(box.y1+box.y2)/2};
 const fills=segments.filter(s=>s.isOpeningFill && openingSpanOnWall(s,box));
 console.log(o.id,o.class,pixel(midpoint),'fills',fills.length,
   'collinear gaps',gaps.filter(w=>w.supportingOpenings.includes(o)).length,
   'corner pieces',fills.filter(w=>w.isCornerOpeningGap).length);
 if(!fills.length){
  const near=layout.walls.filter(w=>Math.min(...[w.start,w.end].map(p=>Math.hypot(p.x-midpoint.x,p.y-midpoint.y)))<Math.max(box.x2-box.x1,box.y2-box.y1)*1.7);
  console.log(near.map(w=>({id:w.id,a:pixel(w.start),b:pixel(w.end),t:w.thickness})),box);
 }
}
