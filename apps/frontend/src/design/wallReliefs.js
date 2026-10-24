import * as THREE from 'three';

// Stable, room-independent presets. Relief is physical geometry, not a printed image.
export const WALL_RELIEF_STYLES = Object.freeze([
  ['flow', 'Flowing plaster curves'], ['rose', 'Rose and foliage relief'],
  ['lilies', 'Calla lily relief'], ['leaves', 'Tropical veined leaves'],
  ['vines', 'Carved leafy vines'], ['tiles', 'Curved stone scales'],
  ['medallion', 'Floral medallion'], ['chevron', 'Layered diagonal panels'],
  ['blossom', 'Flowering branch'], ['palms', 'Palm frond relief'],
  ['ginkgo', 'Ginkgo fan garden'], ['tree', 'Golden tree of life'],
  ['waves', 'Layered dune waves'], ['horses', 'Seven horses and sun'],
  ['mountains', 'Mountain ridge relief'],
].map(([motif, label]) => Object.freeze({
  id: `wall-relief-${motif}`, label, roomType: 'all', category: 'wallPanel',
  material: motif === 'horses' ? 'Raised plaster relief · up to 14 cm depth · lights on/off' : 'Sculpted plaster',
  pattern: motif === 'horses' ? 'referenceMural' : 'sculptedRelief', motif,
  color: '#e7dfcd', accentColor: motif === 'tree' ? '#b59a63' : '#d1bea0',
  roughness: 0.82, metalness: motif === 'tree' ? 0.25 : 0, depthM: 0.012,
  source: 'Reference-inspired 3D relief',
})));
const clamp = (x, a=0, b=1) => Math.max(a, Math.min(b, x));
const ridge = (d, width) => Math.exp(-Math.pow(d / width, 2));
function segment(x,y,a,b,c,d,width) {
  const t=clamp(((x-a)*(c-a)+(y-b)*(d-b))/((c-a)**2+(d-b)**2 || 1));
  return ridge(Math.hypot(x-a-t*(c-a),y-b-t*(d-b)),width);
}
function leaf(x,y,cx,cy,length,width,angle,veins=true) {
  const dx=x-cx,dy=y-cy, u=(dx*Math.cos(angle)+dy*Math.sin(angle))/length;
  const v=(-dx*Math.sin(angle)+dy*Math.cos(angle))/width;
  if(Math.abs(u)>=1) return 0;
  const edge=Math.sin(Math.PI*(u+1)/2), q=Math.abs(v)/Math.max(.001,edge);
  if(q>=1) return 0;
  const dome=Math.pow(1-q*q,.65)*Math.pow(edge,.6);
  return dome*(veins ? .82+.12*Math.cos(65*(u+Math.abs(v)*.32))+.06*ridge(v,.09) : 1);
}
export function reliefHeight(motif,x,y) {
  let h=0;
  const line=(a,b,c,d,w=.007,gain=.6)=>{h=Math.max(h,gain*segment(x,y,a,b,c,d,w));};
  const petal=(cx,cy,l,w,a,v=true,gain=1)=>{h=Math.max(h,gain*leaf(x,y,cx,cy,l,w,a,v));};
  if(motif==='flow'||motif==='waves') {
    for(let i=-2;i<9;i++) {
      const d=motif==='flow'?x-(i*.17+.15*Math.sin(y*5+i*.45)):y-(i*.16+.055*Math.sin(x*8+i*.65));
      h=Math.max(h,.85*ridge(d,.035)+.12*ridge(d-.045,.009));
    }
  } else if(motif==='tiles') {
    const row=Math.floor(y*5),u=((x*5+row*.5)%1+1)%1,v=(y*5)%1;
    h=.8*Math.pow(Math.sin(Math.PI*u)*Math.sin(Math.PI*v),.6);
  } else if(motif==='chevron') {
    const d=((x*.8+Math.abs(y-.5)*.9)*5)%1;
    h=.2+.7*clamp(d/.85); if(d>.9)h=.08;
  } else if(motif==='mountains') {
    // Overlapping ranges with unequal summits and branching erosion channels.
    // A smooth rim avoids the old discontinuous, saw-toothed height steps.
    const ranges = [
      { peaks: [[.12,.86,.28],[.63,.94,.3],[.92,.72,.22]], base: .36, gain: .64 },
      { peaks: [[.32,.66,.29],[.85,.57,.3]], base: .14, gain: .8 },
      { peaks: [[.08,.37,.27],[.59,.4,.36],[.98,.28,.25]], base: -.16, gain: 1 },
    ];
    for (let k=0;k<ranges.length;k++) {
      const range=ranges[k];
      let skyline=-1, summit=0;
      for(const [px,py,width] of range.peaks) {
        const profile=py-Math.pow(Math.abs(x-px)/width,.82)*.37;
        if(profile>skyline){skyline=profile;summit=px;}
      }
      skyline+=.009*Math.sin(x*71+k)+.004*Math.sin(x*173+k*3);
      const delta=skyline-y;
      if(delta<=0) continue;
      const rise=clamp(delta/.025);const rim=rise*rise*(3-2*rise);
      const slope=clamp((y-range.base)/(skyline-range.base));
      const fan=(x-summit)/(delta+.16);
      const channels=.5+.3*Math.sin(fan*24+Math.sin(delta*22))+.2*Math.sin(fan*53+delta*19);
      const erosion=.055*channels*Math.sin(Math.PI*clamp(delta/.42));
      h=Math.max(h,range.gain*rim*(.32+.68*(slope*slope*(3-2*slope)))-erosion);
    }
  } else if(motif==='rose'||motif==='medallion') {
    const dx=x-.5,dy=y-.55,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
    for(let k=0;k<4;k++)h=Math.max(h,(1-k*.13)*ridge(r-(.045+k*.045+.015*Math.cos(a*(5+k)+k)),.019));
    for(let i=0;i<10;i++) {const a=i*Math.PI/5;petal(.5+Math.cos(a)*.28,.55+Math.sin(a)*.31,.14,.045,a);}
    if(motif==='medallion') h=Math.max(h,.55*ridge(Math.hypot(dx,dy)-.43,.008));
  } else if(motif==='leaves'||motif==='palms'||motif==='vines'||motif==='lilies') {
    for(let i=0;i<7;i++) {
      const cx=.13+(i%3)*.33,cy=.2+Math.floor(i/3)*.3,angle=.8+(i%2)*1.5;
      line(cx-.08,.03,cx,cy,.005,.45);
      if(motif==='lilies') {
        petal(cx,cy+.12,.14,.065,angle,false);petal(cx+.04,cy+.13,.1,.045,angle-.9,false,.8);
      } else if(motif==='palms') {
        for(let j=0;j<9;j++)for(const s of [-1,1])petal(cx+s*.04,cy+j*.015,.09,.009,Math.PI/2+s*.9,false,.7);
      } else petal(cx,cy,.22,motif==='vines'?.045:.105,angle);
    }
  } else if(motif==='ginkgo') {
    for(let row=0;row<4;row++)for(let col=0;col<4;col++) {
      const cx=.1+col*.25+(row%2)*.07,cy=.16+row*.23,dx=x-cx,dy=y-cy;
      line(cx,cy-.13,cx,cy,.003,.35);
      const r=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
      if(a>0&&a<Math.PI&&r<.09) h=Math.max(h,Math.sin(Math.PI*r/.09)*(.65+.25*Math.cos(a*18)));
    }
  } else if(motif==='tree'||motif==='blossom') {
    line(.45,.03,.47,.62,.018,.9);
    for(let i=0;i<12;i++) {
      const s=i%2?1:-1,by=.23+i*.043,bx=.47+s*(.17+(i%3)*.07),ey=by+.16;
      line(.47,by,bx,ey,.007,.75);
      for(let j=1;j<5;j++) {
        const t=j/4,cx=.47+(bx-.47)*t,cy=by+(ey-by)*t;
        petal(cx,cy+.026,.032,.013,1+s*.5,false,.85);
      }
      if(motif==='blossom')for(let p=0;p<5;p++){const a=p*Math.PI*2/5;petal(bx+Math.cos(a)*.025,ey+Math.sin(a)*.025,.035,.018,a,false);}
    }
  } else if(motif==='horses') {
    h=.7*ridge(Math.hypot(x-.5,y-.72)-.17,.008);
    for(let i=0;i<7;i++) {
      const cx=.1+i*.13,cy=.4+.035*Math.sin(i);
      petal(cx,cy,.057,.037,.1,false,.9);
      line(cx+.035,cy,cx+.046,cy+.1,.019,.95);
      petal(cx+.055,cy+.103,.024,.014,-.2,false);
      line(cx-.045,cy,cx-.073,cy-.055,.006,.7);
      for(const s of [-1,1]) {line(cx+s*.028,cy-.02,cx+s*.045,cy-.064,.006,.8);line(cx+s*.045,cy-.064,cx+s*.022,cy-.11,.005,.75);}
    }
  }
  return clamp(h);
}

// Sample each already-carved wall span separately: a relief can never fill a
// door/window opening or escape the user's rectangular marked area.
export function reliefDepth(motif, width, height) {
  return Math.min(motif === 'mountains' ? .18 : .10, Math.min(width, height) * .065);
}
export function createReliefGeometry({motif,span,left,right,bottom,top,side=1,depth=.014,color='#e7dfcd',accentColor='#b59a63'}) {
  const a=Math.max(left,span.lo),b=Math.min(right,span.hi),c=Math.max(bottom,span.bottom),d=Math.min(top,span.top);
  if(b<=a||d<=c)return null;
  const resolution=motif==='mountains'?[360,280]:[180,150];
  const nx=Math.max(2,Math.ceil(resolution[0]*(b-a)/(right-left))),ny=Math.max(2,Math.ceil(resolution[1]*(d-c)/(top-bottom)));
  const positions=[],indices=[],colors=[],normals=[];
  const width=right-left,height=top-bottom,amplitude=reliefDepth(motif,width,height);
  const sample=(u,v)=>reliefHeight(motif,u,v);
  const eps=.001;
  const base=new THREE.Color(color),accent=new THREE.Color(motif==='tree'?accentColor:color);
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++) {
    const x=a+(b-a)*i/nx,y=c+(d-c)*j/ny,h=reliefHeight(motif,(x-left)/(right-left),(y-bottom)/(top-bottom));
    const u=(x-left)/width,v=(y-bottom)/height;
    positions.push(x,y,side*(depth+h*amplitude));
    // Derivatives use design coordinates, so normals match across carved spans.
    const hx=(sample(u+eps,v)-sample(u-eps,v))/(2*eps*width)*amplitude;
    const hy=(sample(u,v+eps)-sample(u,v-eps))/(2*eps*height)*amplitude;
    const normal=new THREE.Vector3(-hx,-hy,side).normalize();normals.push(normal.x,normal.y,normal.z);
    // Local cavity attenuation preserves detail under broad diffuse room light.
    // No painted directional shadow: raised faces still respond to scene lights.
    const surround=(sample(u+.012,v)+sample(u-.012,v)+sample(u,v+.012)+sample(u,v-.012))/4;
    const cavity=clamp((surround-h)*3.5,0,.32);
    const mineral=motif==='mountains' ? .92+.08*h : 1;
    const tint=base.clone().lerp(accent,clamp(h*2)).multiplyScalar((1-cavity)*mineral);
    colors.push(tint.r,tint.g,tint.b);
  }
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++) {
    const p=j*(nx+1)+i,q=p+nx+1;
    if(side>0)indices.push(p,p+1,q,p+1,q+1,q);else indices.push(p,q,p+1,p+1,q,q+1);
  }
  // Close the exposed perimeter down to the backing board, including cutouts.
  const edges=[
    Array.from({length:nx+1},(_,i)=>i),
    Array.from({length:ny+1},(_,j)=>j*(nx+1)+nx),
    Array.from({length:nx+1},(_,i)=>ny*(nx+1)+nx-i),
    Array.from({length:ny+1},(_,j)=>(ny-j)*(nx+1)),
  ];
  edges.forEach((edge,edgeIndex)=>{
    const outward=[[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]][edgeIndex];
    for(let i=0;i<edge.length-1;i++) {
      const first=positions.length/3;
      for(const [vertex,back] of [[edge[i],false],[edge[i+1],false],[edge[i+1],true],[edge[i],true]]) {
        positions.push(positions[vertex*3],positions[vertex*3+1],back?side*(depth-.001):positions[vertex*3+2]);
        normals.push(...outward);colors.push(colors[vertex*3],colors[vertex*3+1],colors[vertex*3+2]);
      }
      if(side>0)indices.push(first,first+2,first+1,first,first+3,first+2);
      else indices.push(first,first+1,first+2,first,first+2,first+3);
    }
  });
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  return geometry;
}
