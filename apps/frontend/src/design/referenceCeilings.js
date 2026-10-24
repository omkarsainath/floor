// One modeled interpretation per numbered page of the user's 54-page montage.
// No remote textures, image planes, or room measurement changes are required.
const recipes = [
 ['Lattice panels & wood islands','lattice','#805536','#ffe4a6'],
 ['Midnight sweeping waves','wave','#18264e','#d5efff'],
 ['Interlocking angular trays','maze','#302b28','#fff0b9'],
 ['Overlapping luminous squares','squares','#b78b53','#fff0c7'],
 ['Sculpted ivory blossom','flower','#ac8046','#e9ffff'],
 ['Long tray & twin recesses','tray','#534136','#ffe2a0'],
 ['Nested squares & floating blocks','nested','#504233','#fff1c4'],
 ['Blue-edged lotus','lotus','#673946','#b4f8ff'],
 ['Flowing twin medallions','wave-rings','#515355','#eaffff'],
 ['Floral lattice medallion','petal-lattice','#8a693d','#ffe0a2'],
 ['Rose geometric islands','islands','#b15171','#ffd3ea'],
 ['Illuminated lattice border','lattice-border','#896037','#ffe6aa'],
 ['Stepped ribbon & sweep','ribbons','#663c34','#f4f5e9'],
 ['Floating checkerboard','checker','#c2ac85','#fff1bf'],
 ['Crimson layered flower','lotus','#b84362','#ffd4e5'],
 ['Soft flowing cove','wave','#bda975','#fff4ce'],
 ['Three-petal swirl','swirl','#b7a06a','#ffffd6'],
 ['Split cyan halo','split-ring','#60594b','#74e7f7'],
 ['Triple circle & bar composition','triple','#686d74','#bee7ff'],
 ['Overlapping circular islands','discs','#634830','#ffe4a8'],
 ['Radial medallion & spokes','radial','#85613c','#fff0d2'],
 ['Luminous leaf rosette','rosette','#aa7d46','#fff2ca'],
 ['Hexagon light network','hexagons','#af773d','#ffc881'],
 ['Emerald petal cove','flower','#788275','#73ffc4'],
 ['Rose twin halo corridor','twin-rings','#704452','#ffd0e8'],
 ['Concentric cream circles','rings','#a78a5c','#fff2d5'],
 ['Violet sweeping ribbons','ribbons','#333044','#a9a0ff'],
 ['Branching sunburst','sunburst','#96774f','#fff0bc'],
 ['Circular spine & end loops','triple','#716553','#d5b7ff'],
 ['Stepped elliptical rings','ellipses','#333c45','#f5ffff'],
 ['Blue cove & parallel bars','tray-bars','#584432','#619bff'],
 ['Crossed luminous battens','crosshatch','#9b7547','#fff4d1'],
 ['Jaali centre & cyan border','jaali','#574634','#6ceeff'],
 ['Layered white lotus','lotus','#b7b8a7','#eaffff'],
 ['Curved timber slats','slat-wave','#98613b','#ffe2ad'],
 ['Triangular folded panels','triangles','#8b8b89','#ffebbc'],
 ['Electric angular paths','maze','#7b7d88','#759dff'],
 ['Crimson rings & blades','radial','#984b55','#fff0db'],
 ['Petal lattice & radial blocks','petal-lattice','#87623f','#fff1bf'],
 ['Linked square light frames','squares','#976d41','#fff3c3'],
 ['Gold perforated twin halos','twin-lattice','#976c3c','#ffc5ed'],
 ['Violet bars & central diamond','diamond','#8e517f','#e6beff'],
 ['Golden lattice islands','lattice','#9f7945','#ffe5aa'],
 ['Violet tray & dark circles','tray-discs','#5c5067','#cb99ff'],
 ['Offset rectangular steps','nested','#4a3c30','#aaddff'],
 ['Mint oval medallions','triple','#95734c','#a0ffe5'],
 ['Blue illuminated cross','cross','#3c435c','#73bdff'],
 ['Blue wave & floating diamond','wave-diamond','#577a94','#edffff'],
 ['Purple floral tray','lotus','#8c5da0','#edb6ff'],
 ['Mint circle & rectangular recess','ring-square','#61968d','#d8fff4'],
 ['Floating square coffers','coffers','#9c9c95','#f4ffff'],
 ['Cyan halo & corner fins','halo-fins','#918989','#8fffea'],
 ['Teal architectural steps','maze','#267f7b','#e0ffff'],
 ['Staggered wood islands','islands','#9a7647','#fff0ba'],
];
export const REFERENCE_CEILING_TYPES=Object.freeze(recipes.map(([label,motif,accentColor,lightColor],i)=>Object.freeze({
 id:`ceiling-reference-${String(i+1).padStart(2,'0')}`,label:`Ref ${String(i+1).padStart(2,'0')} · ${label}`,
 category:'ceiling',roomType:'all',pattern:'profile',ceilingType:'reference',referenceIndex:i+1,motif,
 color:'#eeeae2',accentColor,lightColor,roughness:.72,metalness:0,raised:false,
 material:'Layered gypsum-look panels with decorative relief and emissive lighting strips; reference-inspired proportions.',
 source:Object.freeze({reference:'User-provided false-ceiling montage',entry:`Page ${i+1} / 54`}),
})));

/** All design pieces are convex patches; the caller clips each to the room. */
export function decorateReferenceCeiling({style,patch,material,accent,light,minX,minZ,width,depth,peak,drop}){
 const cx=minX+width/2,cz=minZ+depth/2;
 const point=(x,z)=>({x:cx+x*width,y:cz+z*depth});
 const level=peak+.032,upper=peak+drop*.75;
 const poly=(p,mat=accent,y=level,t=.022)=>patch(p.map(([x,z])=>point(x,z)),y,mat,t);
 const box=(x,z,w,d,mat=accent,y=level)=>poly([[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]],mat,y);
 const strip=(a,b,thick=.012,mat=light,y=level-.004)=>{
  const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<1e-8)return;
  const nx=-dz/len*thick/2,nz=dx/len*thick/2;
  poly([[a[0]+nx,a[1]+nz],[a[0]-nx,a[1]-nz],[b[0]-nx,b[1]-nz],[b[0]+nx,b[1]+nz]],mat,y,.004);
 };
 const circle=(x,z,r,mat=accent,y=level,n=40)=>{
  const rz=r*width/depth;
  poly(Array.from({length:n},(_,i)=>[x+Math.cos(i*2*Math.PI/n)*r,z+Math.sin(i*2*Math.PI/n)*rz]),mat,y);
 };
 const ring=(x,z,r,band=.025,mat=accent,y=level,start=0,end=Math.PI*2)=>{
  const n=Math.ceil((end-start)/Math.PI*24),rz=width/depth;
  for(let i=0;i<n;i++){
   const a=start+(end-start)*i/n,b=start+(end-start)*(i+1)/n;
   poly([[x+Math.cos(a)*r,z+Math.sin(a)*r*rz],[x+Math.cos(b)*r,z+Math.sin(b)*r*rz],
    [x+Math.cos(b)*(r-band),z+Math.sin(b)*(r-band)*rz],[x+Math.cos(a)*(r-band),z+Math.sin(a)*(r-band)*rz]],mat,y);
  }
 };
 const frame=(x,z,w,d,mat=light,y=level-.004)=>{
  const pts=[[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]];
  pts.forEach((p,i)=>strip(p,pts[(i+1)%4],.009,mat,y));
 };
 const petals=(count,r=.3,inner=.07,mat=accent,y=level,rotation=0)=>{
  for(let i=0;i<count;i++){
   const a=i*Math.PI*2/count+rotation,da=Math.PI/count*.68,ratio=width/depth;
   const outline=[];
   for(const side of [-1,1])for(let j=0;j<=20;j++){
    const t=side===-1?j/20:1-j/20,along=inner+(r-inner)*t,across=side*Math.sin(Math.PI*t)*r*Math.sin(da)*.72;
    outline.push([Math.cos(a)*along-Math.sin(a)*across,(Math.sin(a)*along+Math.cos(a)*across)*ratio]);
   }
   poly(outline,mat,y);
  }
 };
 const lattice=(x,z,w,d)=>{
  box(x,z,w,d,light,upper);
  for(let i=0;i<=9;i++){
   const px=x-w/2+i*w/9;strip([px,z-d/2],[px,z+d/2],.014,accent,level);
  }
  for(let i=0;i<=6;i++){const pz=z-d/2+i*d/6;strip([x-w/2,pz],[x+w/2,pz],.014,accent,level);}
 };
 const ribbon=(pts,thickness,mat,y)=>{
  const normals=pts.map((p,i)=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);return [-dz/l*thickness/2,dx/l*thickness/2];});
  for(let i=0;i<pts.length-1;i++){
   const a=pts[i],b=pts[i+1],n=normals[i],m=normals[i+1];
   poly([[a[0]+n[0],a[1]+n[1]],[a[0]-n[0],a[1]-n[1]],[b[0]-m[0],b[1]-m[1]],[b[0]+m[0],b[1]+m[1]]],mat,y);
  }
 };
 const waves=()=>{
  for(let band=0;band<2;band++){
   const pts=Array.from({length:65},(_,i)=>{const z=-.40+i*.80/64;return [Math.sin(z*7+band*1.8)*.17+(band-.5)*.22,z];});
   ribbon(pts,.09,accent,level-band*.009);
   ribbon(pts.map(p=>[p[0]+.051,p[1]]),.009,light,level-.004-band*.009);
  }
 };
 // Perimeter tray and downlights appear on every reference page.
 const border=.045;
 box(0,-.5+border/2,1,border,material,level);box(0,.5-border/2,1,border,material,level);
 box(-.5+border/2,0,border,1-border*2,material,level);box(.5-border/2,0,border,1-border*2,material,level);
 frame(0,0,.89,.89,light,upper);
 const lights=Math.max(3,Math.min(7,Math.round(Math.max(width,depth))));
 for(let i=0;i<lights;i++)for(const side of [-1,1])circle(-.39+i*.78/(lights-1),side*.473,Math.min(.009,.035/width),light,level-.006,12);
 // Keep circular motifs within even a long, narrow room.
 const r=.40*Math.min(1,depth/width),motif=style.motif;
 switch(motif){
  case 'lattice':lattice(-.27,0,.24,.72);lattice(.27,0,.24,.72);box(0,-.23,.23,.20);box(0,.23,.23,.20);break;
  case 'lattice-border':case 'jaali':
   lattice(0,-.32,.77,.15);lattice(0,.32,.77,.15);lattice(-.32,0,.13,.48);lattice(.32,0,.13,.48);
   ring(0,0,r*.6,.024,light);break;
  case 'wave':case 'ribbons':case 'wave-diamond':case 'slat-wave':
   waves();
   if(motif==='slat-wave')for(let i=0;i<13;i++)box(-.27,-.39+i*.062,.23,.017,accent,level-.012);
   if(motif==='wave-diamond')poly([[0,-.16],[.14,0],[0,.16],[-.14,0]],material,level-.025);
   break;
  case 'wave-rings':waves();ring(-.10,-.22,r*.58,.03,light,level-.012);ring(.10,.22,r*.58,.03,light,level-.012);break;
  case 'flower':case 'lotus':case 'rosette':case 'petal-lattice':
   petals(motif==='rosette'?10:motif==='flower'?5:8,r,.035,light,upper);
   petals(motif==='rosette'?10:motif==='flower'?5:8,r*.94,.04,accent,level);
   if(motif==='lotus')petals(8,r*.60,.02,material,level-.028,Math.PI/8);
   if(motif==='petal-lattice')for(let i=0;i<8;i++){const a=i*Math.PI/4;circle(Math.cos(a)*r*.62,Math.sin(a)*r*.62*width/depth,r*.065,light,level-.006,12);}
   circle(0,0,r*.17,light,level-.032);break;
  case 'maze':case 'nested':
   for(let i=0;i<4;i++){
    const s=.77-i*.15,offset=motif==='maze'?(i%2?-.06:.06):0;
    frame(offset,0,s,s,light,level-i*.007);
    strip([-s/2+offset,-s/2],[s/2+offset,-s/2],.045,accent,level-.003-i*.007);
    strip([s/2+offset,-s/2],[s/2+offset,s/2],.045,accent,level-.003-i*.007);
   }break;
  case 'squares':for(const [x,z,s] of [[-.2,-.15,.34],[.18,-.15,.28],[0,.14,.38],[.25,.24,.20]]){box(x,z,s,s,accent);frame(x,z,s-.018,s-.018);}break;
  case 'checker':case 'coffers':case 'islands':
   for(let x=0;x<4;x++)for(let z=0;z<4;z++)if(motif==='coffers'||(x+z)%2===0){
    const px=-.30+x*.2,pz=-.30+z*.2;box(px,pz,.16,.16,accent,level-(x%2)*.009);frame(px,pz,.175,.175,light,upper);
   }break;
  case 'tray':case 'tray-bars':case 'tray-discs':
   box(0,0,.70,.72,accent,upper);frame(0,0,.70,.72);
   if(motif==='tray-discs'){circle(0,-.22,r*.40,accent,level-.013);circle(0,.22,r*.40,accent,level-.013);}
   else for(const z of [-.22,.22]){box(0,z,.30,.18,material,level);frame(0,z,.32,.20);}
   if(motif==='tray-bars')for(const x of [-.24,.24])box(x,0,.035,.65,accent,level-.014);
   break;
  case 'split-ring':for(let i=0;i<2;i++)ring(0,0,r,.03,light,level,i*Math.PI+.12,(i+1)*Math.PI-.12);ring(0,0,r*.68,.028,accent);break;
  case 'rings':case 'ellipses':case 'discs':
   for(let i=0;i<3;i++)ring(motif==='discs'?(i-1)*.06:0,0,r*(1-i*.24),.027,i%2?light:accent,level-i*.01);break;
  case 'triple':case 'twin-rings':case 'twin-lattice':
   for(const z of motif==='triple'?[-.27,0,.27]:[-.23,.23]){
    const rr=Math.min(r*.62,.14*depth/width);circle(0,z,rr,accent);ring(0,z,rr+.012,.014,light,upper);
    ring(0,z,rr*.65,.009,light,level-.005);
    if(motif==='twin-lattice')for(let i=0;i<16;i++){const a=i*Math.PI/8;circle(Math.cos(a)*rr*.83,z+Math.sin(a)*rr*.83*width/depth,.008,light,level-.006,8);}
   }break;
  case 'radial':case 'sunburst':case 'swirl':
   ring(0,0,r*.56,.035,light);circle(0,0,r*.32,accent);
   for(let i=0;i<(motif==='swirl'?3:12);i++){
    const n=motif==='swirl'?3:12,a=i*Math.PI*2/n;
    const pts=Array.from({length:13},(_,j)=>{const t=j/12,angle=a+(motif==='sunburst'?.15:.65)*t,rr=r*(.4+.63*t);return [Math.cos(angle)*rr,Math.sin(angle)*rr*width/depth];});
    for(let j=0;j<12;j++)strip(pts[j],pts[j+1],motif==='radial'?.04:.016,i%2?light:accent,level-.006);
   }break;
  case 'hexagons':for(let x=0;x<3;x++)for(let z=0;z<3;z++){
   const px=(x-1)*.24,pz=(z-1)*.24+(x%2)*.10;
   const pts=Array.from({length:6},(_,i)=>[px+Math.cos(i*Math.PI/3)*.12,pz+Math.sin(i*Math.PI/3)*.12]);
   pts.forEach((p,i)=>strip(p,pts[(i+1)%6],.015));
  }break;
  case 'crosshatch':for(let i=-2;i<=2;i++){strip([-.32,i*.10-.13],[.32,i*.10+.13],.024);strip([i*.10-.13,-.32],[i*.10+.13,.32],.024);}break;
  case 'triangles':for(let x=0;x<3;x++)for(let z=0;z<3;z++){
   const a=-.36+x*.24,b=-.36+z*.24;poly([[a,b],[a+.22,b],[a+.11,b+.22]],accent,level);strip([a,b],[a+.11,b+.22],.009);
  }break;
  case 'diamond':poly([[0,-.18],[.16,0],[0,.18],[-.16,0]],accent);for(const side of [-1,1])for(let i=0;i<3;i++)box(side*(.25+i*.05),0,.025,.65);break;
  case 'cross':box(0,0,.1,.65);box(0,0,.58,.1);frame(0,0,.72,.75);break;
  case 'ring-square':ring(0,.20,r*.65,.025,light);frame(0,-.23,.40,.25);break;
  case 'halo-fins':ring(0,0,r*.65,.035,light);for(const s of [-1,1])for(let i=0;i<4;i++)box(s*.28,-.3+i*.08,.15,.026,accent);break;
 }
}
