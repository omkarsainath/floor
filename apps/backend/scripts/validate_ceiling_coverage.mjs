// Replay the real tracer export and renderer (not a separate roof algorithm).
// node apps/backend/scripts/validate_ceiling_coverage.mjs scan.json [output.json]
import fs from 'node:fs';
import * as THREE from 'three';
import { buildMetricLayout } from '../../frontend/src/tracer/planMeasurements.js';
import { buildCeilingCoverage } from '../../frontend/src/generators/ceilingCoverage.js';
import { createCeiling } from '../../frontend/src/generators/ceiling.js';
import { openingGapWalls } from '../../frontend/src/measurements/modelMeasurements.js';
const [input,output]=process.argv.slice(2);
const scan=JSON.parse(fs.readFileSync(input));
const layout=buildMetricLayout({walls:scan.walls,rooms:scan.room_boundaries || [],
  doors:scan.doors,objects:scan.rooms_and_objects,metersPerPixel:.01});
const openings=layout.objects.filter(o=>/door|window|glass/i.test(o.class));
const diagnostics={};
const coverage=buildCeilingCoverage(layout,layout.rooms,openings,diagnostics);
const center=layout.image_transform.center_px;
const toPixel=p=>({x:p.x/.01+center.x,y:p.y/.01+center.y});
const mesh=createCeiling(coverage);mesh?.updateMatrixWorld(true);
const probes=[];
for(let y=-12;y<=12;y+=.25) for(let x=-12;x<=12;x+=.25) {
  if(mesh && new THREE.Raycaster(new THREE.Vector3(x,10,y),new THREE.Vector3(0,-1,0)).intersectObject(mesh,true).length) probes.push(toPixel({x,y}));
}
const result={input,slabs:coverage.length,rayHitSamples:probes.length,
  coverage:coverage.map(r=>({...r,points:r.points.map(toPixel),holes:r.holes?.map(h=>h.map(toPixel))})),
  openingSpans:openingGapWalls(layout.walls,openings).map(w=>({...w,start:toPixel(w.start),end:toPixel(w.end)}))};
// Optional leak probe in original-image pixels. A path reaching the frame
// identifies the actual break that prevents an enclosing slab.
if(process.env.CEILING_PROBE) {
  const [px,py]=process.env.CEILING_PROBE.split(',').map(Number);
  const {nx,ny,x0,y0,cell,blocked}=diagnostics;
  const x=Math.floor(((px-center.x)*.01-x0)/cell),y=Math.floor(((py-center.y)*.01-y0)/cell);
  const start=y*nx+x,queue=[start],parent=new Map([[start,null]]);let end=null;
  for(let i=0;i<queue.length;i++) {
    const k=queue[i],xx=k%nx,yy=Math.floor(k/nx);
    if(xx===0 || yy===0 || xx===nx-1 || yy===ny-1) {end=k;break;}
    for(const n of [k-1,k+1,k-nx,k+nx]) if(!blocked[n] && !parent.has(n)) {parent.set(n,k);queue.push(n);}
  }
  result.leakPath=[];
  while(end!==null) {
    result.leakPath.push(toPixel({x:x0+(end%nx+.5)*cell,y:y0+(Math.floor(end/nx)+.5)*cell}));
    end=parent.get(end);
  }
}
if(output) fs.writeFileSync(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({input,slabs:result.slabs,rayHitSamples:probes.length,openingSpans:result.openingSpans.length}));
