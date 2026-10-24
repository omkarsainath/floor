import { openingGapWalls } from '../measurements/modelMeasurements.js';

const inside = (p, polygon) => {
  let value = false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i], b=polygon[j];
    if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) value=!value;
  }
  return value;
};

// Trace the perimeter of the UNION, not one slab per scan row. Clockwise outer
// loops and anticlockwise holes share grid vertices without internal seams.
function contours(mask, nx, ny, x0, y0, cell) {
  const edges = new Map();
  const key = (x,y) => y*(nx+1)+x;
  const add = (x,y,xx,yy) => { const k=key(x,y); if(!edges.has(k)) edges.set(k,[]); edges.get(k).push(key(xx,yy)); };
  const filled = (x,y) => x>=0 && y>=0 && x<nx && y<ny && mask[y*nx+x];
  for(let y=0;y<ny;y++) for(let x=0;x<nx;x++) if(filled(x,y)) {
    if(!filled(x,y-1)) add(x,y,x+1,y);
    if(!filled(x+1,y)) add(x+1,y,x+1,y+1);
    if(!filled(x,y+1)) add(x+1,y+1,x,y+1);
    if(!filled(x-1,y)) add(x,y+1,x,y);
  }
  const loops=[];
  while(edges.size) {
    const first=edges.keys().next().value, loop=[]; let k=first, previous=null;
    do {
      const x=k%(nx+1),y=Math.floor(k/(nx+1)); loop.push({x,y});
      const choices=edges.get(k);
      if(!choices?.length) break;
      // At a diagonal-only contact, turn right to keep components separate.
      if(choices.length>1 && previous!==null) {
        const dx=x-previous.x,dy=y-previous.y;
        choices.sort((a,b)=>{
          const turn=q=>dx*(Math.floor(q/(nx+1))-y)-dy*(q%(nx+1)-x);
          return turn(b)-turn(a);
        });
      }
      const next=choices.shift(); if(!choices.length) edges.delete(k);
      previous={x,y}; k=next;
    } while(k!==first);
    const simple=loop.filter((p,i)=>{
      const a=loop[(i+loop.length-1)%loop.length],b=loop[(i+1)%loop.length];
      return (p.x-a.x)*(b.y-p.y)!==(p.y-a.y)*(b.x-p.x);
    }).map(p=>({x:x0+p.x*cell,y:y0+p.y*cell}));
    if(simple.length>=3) loops.push(simple);
  }
  const area=poly=>poly.reduce((v,p,i)=>{const q=poly[(i+1)%poly.length];return v+p.x*q.y-p.y*q.x;},0)/2;
  const outer=loops.filter(p=>area(p)>0).map(points=>({points,holes:[]}));
  for(const hole of loops.filter(p=>area(p)<0)) {
    const owner=outer.filter(p=>inside(hole[0],p.points)).sort((a,b)=>area(a.points)-area(b.points))[0];
    if(owner) owner.holes.push(hole);
  }
  return outer;
}

/** Visual-only fallback; never exported as a measured room or floor area.
 * Flood the exterior of the wall/opening network, then cover enclosed cells
 * outside known room ceilings. No bounding rectangle roof across concave voids.
 * Known outdoor rooms and explicit footprint holes remain uncovered.
 */
export function buildCeilingCoverage(layout, rooms, openings = [], diagnostics = null) {
  const walls=(layout.walls || []).filter(w=>w.start && w.end &&
    [w.start.x,w.start.y,w.end.x,w.end.y].every(Number.isFinite));
  // A merged detector label such as "Bedroom / Balcony" does NOT establish
  // that the whole polygon is outdoors. Only explicit/unambiguous zones do.
  const outdoor = r => r.ceiling === false || [r.type,r.name].some(value =>
    /^(courtyard|open[ -]?(sky|to sky)|o\.?t\.?s\.?|terrace|balcony|patio)$/i.test(String(value || '').trim()));
  const covered=rooms.filter(r=>!outdoor(r));
  if (!walls.length) return covered;
  const barriers=[...walls,...openingGapWalls(walls,openings)];
  // A narrow door/window symbol can terminate at a perpendicular corner jamb.
  // The render-only collinear-host rule is deliberately stricter, but ceiling
  // enclosure must also recognize these bounded openings. Both ends need
  // nearby structural support; a freestanding symbol is never a boundary.
  // This is a plan boundary, independent of whether a lintel was rendered.
  const pending=openings.filter(o=>/door|window|glass/i.test(o.class || '')).flatMap(o=>{
    const b=o.bbox;
    if(!b || ![b.x1,b.y1,b.x2,b.y2].every(Number.isFinite)) return [];
    const x1=Math.min(b.x1,b.x2),x2=Math.max(b.x1,b.x2),y1=Math.min(b.y1,b.y2),y2=Math.max(b.y1,b.y2);
    const dx=x2-x1,dy=y2-y1,short=Math.min(dx,dy),long=Math.max(dx,dy);
    if(short<=0 || long<short*2.5) return [];
    const horizontal=dx>dy;
    return [{start:horizontal?{x:x1,y:(y1+y2)/2}:{x:(x1+x2)/2,y:y1},
      end:horizontal?{x:x2,y:(y1+y2)/2}:{x:(x1+x2)/2,y:y2},
      thickness:short,height:3,openingBoundary:true}];
  });
  const supported=pendingWall=>[pendingWall.start,pendingWall.end].every(p=>barriers.some(w=>{
    const dx=w.end.x-w.start.x,dy=w.end.y-w.start.y,l2=dx*dx+dy*dy;
    if(!l2) return false;
    const t=Math.max(0,Math.min(1,((p.x-w.start.x)*dx+(p.y-w.start.y)*dy)/l2));
    return Math.hypot(p.x-w.start.x-t*dx,p.y-w.start.y-t*dy)
      <=Math.max((w.thickness || .15)*.8,pendingWall.thickness);
  }));
  for(let pass=0;pass<openings.length && pending.length;pass++) {
    let added=false;
    for(let i=pending.length-1;i>=0;i--) if(supported(pending[i])) {
      barriers.push(pending[i]);pending.splice(i,1);added=true;
    }
    if(!added) break;
  }
  // Raster fits stop at inside faces rather than at the mathematical corner.
  // Close only wall-sized, intersecting corner discrepancies; never extend a
  // line across an unlabelled door-width gap or connect parallel neighbours.
  const cornerBridges=[];
  for(let i=0;i<barriers.length;i++) for(let j=i+1;j<barriers.length;j++) {
    const a=barriers[i],b=barriers[j];
    const ax=a.end.x-a.start.x,ay=a.end.y-a.start.y,bx=b.end.x-b.start.x,by=b.end.y-b.start.y;
    const al=Math.hypot(ax,ay),bl=Math.hypot(bx,by),cross=ax*by-ay*bx;
    if(!al || !bl || Math.abs(cross)/(al*bl)<.5) continue;
    const dx=b.start.x-a.start.x,dy=b.start.y-a.start.y;
    const t=(dx*by-dy*bx)/cross,s=(dx*ay-dy*ax)/cross;
    const tolerance=((a.thickness || .15)+(b.thickness || .15))*.65;
    const da=Math.max(0,-t,t-1)*al,db=Math.max(0,-s,s-1)*bl;
    if(da>tolerance || db>tolerance) continue;
    const intersection={x:a.start.x+t*ax,y:a.start.y+t*ay};
    if(da>1e-8) cornerBridges.push({...a,start:t<0?a.start:a.end,end:intersection});
    if(db>1e-8) cornerBridges.push({...b,start:s<0?b.start:b.end,end:intersection});
  }
  barriers.push(...cornerBridges);
  const extent=[...walls.flatMap(w=>[w.start,w.end]),...covered.flatMap(r=>r.points),...(layout.footprint?.points || [])];
  const xs=extent.map(p=>p.x), ys=extent.map(p=>p.y);
  const cell=Math.max(.015,Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))/500);
  const padding=Math.max(...walls.map(w=>w.thickness || .15))+cell*3;
  const x0=Math.min(...xs)-padding, y0=Math.min(...ys)-padding;
  const nx=Math.ceil((Math.max(...xs)-x0+padding)/cell), ny=Math.ceil((Math.max(...ys)-y0+padding)/cell);
  const blocked=new Uint8Array(nx*ny), exterior=new Uint8Array(nx*ny);
  for (const wall of barriers) {
    const a=wall.start,b=wall.end,dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
    if (!l2) continue;
    const radius=(wall.thickness || .15)/2+cell*.55;
    const loX=Math.max(0,Math.floor((Math.min(a.x,b.x)-radius-x0)/cell));
    const hiX=Math.min(nx-1,Math.ceil((Math.max(a.x,b.x)+radius-x0)/cell));
    const loY=Math.max(0,Math.floor((Math.min(a.y,b.y)-radius-y0)/cell));
    const hiY=Math.min(ny-1,Math.ceil((Math.max(a.y,b.y)+radius-y0)/cell));
    for(let y=loY;y<=hiY;y++) for(let x=loX;x<=hiX;x++) {
      const px=x0+(x+.5)*cell,py=y0+(y+.5)*cell;
      const t=Math.max(0,Math.min(1,((px-a.x)*dx+(py-a.y)*dy)/l2));
      if (Math.hypot(px-a.x-t*dx,py-a.y-t*dy)<=radius) blocked[y*nx+x]=1;
    }
  }
  const queue=[0]; exterior[0]=1;
  for(let i=0;i<queue.length;i++) {
    const k=queue[i],x=k%nx,y=Math.floor(k/nx);
    for(const [xx,yy] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
      if(xx<0 || yy<0 || xx>=nx || yy>=ny) continue;
      const n=yy*nx+xx;
      if(!blocked[n] && !exterior[n]) { exterior[n]=1;queue.push(n); }
    }
  }
  if(diagnostics) Object.assign(diagnostics,{nx,ny,x0,y0,cell,blocked,exterior,barriers});
  const exclusions=[...rooms.filter(outdoor).map(r=>r.points),...(layout.footprint?.holes || [])];
  const footprint=layout.footprint?.points;
  const height=Math.max(...walls.map(w=>w.height || 3));
  const special=covered.filter(r=>Math.abs((r.height || height)-height)>.01 || r.design?.ceiling);
  const roof=new Uint8Array(nx*ny);
  for(let y=0;y<ny;y++) {
    for(let x=0;x<nx;x++) {
      const p={x:x0+(x+.5)*cell,y:y0+(y+.5)*cell};
      // Include wall tops adjacent to enclosed interior, not every isolated
      // detector line. This joins the slab across partition walls.
      let enclosed=!blocked[y*nx+x] && !exterior[y*nx+x];
      if(blocked[y*nx+x]) {
        const reach=Math.ceil((padding-cell*3)/cell)+1;
        for(let dy=-reach;dy<=reach && !enclosed;dy++) for(let dx=-reach;dx<=reach;dx++) {
          const xx=x+dx,yy=y+dy;
          if(xx>=0 && yy>=0 && xx<nx && yy<ny && !blocked[yy*nx+xx] && !exterior[yy*nx+xx]) {enclosed=true;break;}
        }
      }
      roof[y*nx+x]=Boolean((footprint ? inside(p,footprint) : enclosed || covered.some(r=>inside(p,r.points)))
        && !exclusions.some(poly=>inside(p,poly)) && !special.some(r=>inside(p,r.points)));
    }
  }
  return [...special,...contours(roof,nx,ny,x0,y0,cell).map((polygon,i)=>({
    ...polygon,id:`ceiling-coverage-${i}`,height,ceilingCoverageOnly:true,
    boundary_source:'enclosed-wall-network',boundary_tolerance_m:cell,
  }))];
}
