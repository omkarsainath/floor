import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { fabricMaterial } from './surfaceMaterials.js';
import { sofaCushionGeometry, sofaSurfaceTexture, sofaSurfaceUVs, sofaFrontSampler, sofaPatchworkTexture } from './sofaSurface.js';
import { sofaDesign } from './sofaDesigns.js';
import referencePrints from './textures/sofa-reference-prints.json' with { type: 'json' };

// Construction profiles follow the visible catalogue silhouettes. These are
// editable approximations, not recovered manufacturer meshes.
export function sofaProfile(product) {
  const specific=sofaDesign(product.id);
  if(specific)return {...specific};
  const name=product.label.toLowerCase();
  const profile={arms:'padded',back:'loose',seat:'split',pillows:2,tufts:0,feet:.1,pattern:false};
  if(/chester|camel|butterfly|royal|silver/.test(name))Object.assign(profile,{arms:'rolled',back:'tufted',tufts:3,feet:.1});
  if(/fountain|bali|rinkle|lisa|gloria|capetown/.test(name))Object.assign(profile,{arms:'wide',back:'channel',feet:.07});
  if(/craft|innova|titanic|voltas/.test(name))Object.assign(profile,{arms:'sloped',back:'loose',feet:.12});
  if(/piping|laser|star|office|deco|casa|orma|carvin/.test(name))Object.assign(profile,{arms:'track',back:'channel',feet:.06});
  if(/wood|teak|thapi|aster|fish|classic|box pattern/.test(name)||product.category==='wooden-sofas')Object.assign(profile,{arms:'timber',back:'framed',feet:.16,pillows:0});
  if(product.category==='recliners')Object.assign(profile,{arms:'wide',back:'recliner',feet:.035,pillows:0});
  if(/diwan/.test(name)&&!name.includes('+'))Object.assign(profile,{arms:'track',back:'low',seat:'bench',feet:.04,pillows:0});
  if(product.id==='sf-sofas-p21-27')Object.assign(profile,{seatPanels:2,backPanels:2});
  if(product.id==='sf-sofa-beds-p40-04')Object.assign(profile,{arms:'sloped',back:'gathered',seat:'bench',pillows:2,tufts:3,feet:.025,pattern:true});
  if(product.id==='sf-sofa-beds-p40-05')Object.assign(profile,{arms:'track',back:'diamond',seat:'bench',pillows:2,tufts:5,feet:.025});
  if(product.id==='sf-sofa-beds-p39-03')Object.assign(profile,{arms:'timber',back:'framed',seat:'bench',backPanels:3,pillows:0,feet:.025,frame:'enclosed',woodColor:'#17231b',seatColor:'#575640',floral:true});
  if(product.id==='sf-wooden-sofas-p43-02')Object.assign(profile,{woodColor:'#483a30',seatColor:'#a19b95',frame:'spindles'});
  if(product.id==='sf-wooden-sofas-p44-04')Object.assign(profile,{frame:'rails',feet:.025,woodColor:'#614332',seatColor:'#947368'});
  if(product.id==='sf-wooden-sofas-p44-05')Object.assign(profile,{frame:'rails',feet:.025,woodColor:'#242723',seatColor:'#c5beae'});
  if(product.id==='sf-wooden-sofas-p44-06')Object.assign(profile,{frame:'upholstered',woodColor:'#292622',seatColor:'#7a8185',feet:.16});
  if(product.id==='sf-wooden-sofas-p43-01')Object.assign(profile,{frame:'loop',woodColor:'#4b3824',seatColor:'#b7b299',feet:.18});
  if(product.id==='sf-wooden-sofas-p43-03')Object.assign(profile,{frame:'arch',woodColor:'#392e28',seatColor:'#9b8981',feet:.17});
  if(product.id==='sf-sofa-beds-p39-01')Object.assign(profile,{arms:'wide',seatColor:'#aaa1a0',backPattern:'lounger',pillows:0});
  if(product.id==='sf-sofa-beds-p39-02')Object.assign(profile,{arms:'rolled',seatColor:'#bab5a5',backPattern:'corner',frameColor:'#303c3c',pillows:0});
  return profile;
}

const referenceTextures=new Map();
function referenceFloralTexture(swatch){
  if(!referenceTextures.has(swatch)){
    const source=Uint8Array.from(atob(swatch.rgba),c=>c.charCodeAt(0));
    // Mirror a clean fabric sample into a periodic tile. Preserve its native
    // pixels; do not stretch a whole sofa photograph across the cushion.
    const w=swatch.width,h=swatch.height,bytes=new Uint8Array(w*h*16);
    for(let y=0;y<h*2;y++)for(let x=0;x<w*2;x++){
      const sx=x<w?x:w*2-1-x,sy=y<h?y:h*2-1-y;
      for(let c=0;c<4;c++)bytes[(y*w*2+x)*4+c]=source[(sy*w+sx)*4+c];
    }
    const floralTexture=new THREE.DataTexture(bytes,w*2,h*2);
    floralTexture.flipY=true;floralTexture.colorSpace=THREE.SRGBColorSpace;
    floralTexture.magFilter=THREE.LinearFilter;floralTexture.minFilter=THREE.LinearMipmapLinearFilter;
    floralTexture.generateMipmaps=true;floralTexture.needsUpdate=true;
    floralTexture.wrapS=floralTexture.wrapT=THREE.RepeatWrapping;
    floralTexture.channel=1;floralTexture.repeat.set(.12/.65,.12/(.65*h/w));floralTexture.anisotropy=8;
    floralTexture.name='PDF fabric sample · mirrored seamless approximation';
    referenceTextures.set(swatch,floralTexture);
  }
  return referenceTextures.get(swatch);
}

export function createSofaMaterials(product,override){
  const profile=override||sofaProfile(product),fabric=fabricMaterial(product.color);
  if(profile.seatColor)fabric.color.set(profile.seatColor);
  fabric.bumpMap=sofaSurfaceTexture();fabric.bumpScale=.00045;
  fabric.map=sofaSurfaceTexture('cloth');
  fabric.roughnessMap=sofaSurfaceTexture('roughness');fabric.roughness=.94;
  fabric.sheen=.32;fabric.sheenRoughness=.85;fabric.sheenColor.copy(fabric.color).lerp(new THREE.Color('white'),.15);
  const seam=fabric.clone();seam.color.multiplyScalar(.92);seam.map=null;seam.bumpMap=null;seam.roughnessMap=null;
  const pillow=fabric.clone();pillow.color.multiplyScalar(.93);
  // The reference's decorative pillows generally repeat its fabric, not white cubes.
  if(/craft/.test(product.label.toLowerCase()))pillow.color.set('#398d97');
  const backFabric=fabric.clone();
  if(profile.backColor)backFabric.color.set(profile.backColor);
  const reference=referencePrints[product.id];
  if(profile.backPrint&&reference){backFabric.color.set('#ffffff');backFabric.map=referenceFloralTexture(reference);backFabric.userData={sourceProduct:product.id,patternApproximation:'Mirrored native fabric crop; exact repeat size is inferred',sampleResolution:[reference.width,reference.height]};}
  if(profile.backPrint==='patchwork'){backFabric.color.set('#ffffff');backFabric.map=sofaPatchworkTexture();}
  const frameFabric=fabric.clone();if(profile.frameColor)frameFabric.color.set(profile.frameColor);
  const cornerFabric=backFabric.clone();
  if(profile.cornerColor)cornerFabric.color.set(profile.cornerColor);
  if(profile.cornerPrint&&reference){cornerFabric.color.set('#ffffff');cornerFabric.map=referenceFloralTexture(reference);}
  if(profile.cornerInvert){cornerFabric.color.set('#ffffff');cornerFabric.map=sofaPatchworkTexture('bowtie','#cec5ad','#263436');}
  if(profile.pillowColor)pillow.color.set(profile.pillowColor);
  if(profile.pillowPrint==='patchwork'){pillow.color.set('#ffffff');pillow.map=sofaPatchworkTexture('blocks',profile.frameColor||'#6f7774',profile.seatColor||'#c9bdaa');}
  const metal=new THREE.MeshStandardMaterial({color:profile.trimColor||'#bfa66d',metalness:.7,roughness:.3});
  const trim=fabric.clone();trim.color.set(profile.trimColor||profile.woodColor||'#bcb8ac');trim.map=null;
  if(profile.material==='leather')for(const material of [fabric,backFabric,frameFabric,pillow]){material.roughness=.58;material.sheen=.08;material.bumpScale=.00016;}
  if(profile.bodyPrint==='crossweave'&&reference)for(const material of [fabric,frameFabric,backFabric]){material.map=referenceFloralTexture(reference);material.color.set('#ffffff');}
  const wood=new THREE.MeshPhysicalMaterial({color:profile.woodColor||0x60412b,
    map:sofaSurfaceTexture('wood'),bumpMap:sofaSurfaceTexture('wood'),bumpScale:.00025,
    roughness:.4,clearcoat:.24,clearcoatRoughness:.32,envMapIntensity:.65});
  return {profile,fabric,backFabric,frameFabric,cornerFabric,seam,pillow,wood,metal,trim};
}

export function addUpholsteredSeat(parent,w,d,h,count,materials,{openLeft=false,openRight=false,chaise=false,backCount,seatWidths,cornerBack=false,pillowCount,shortArmDepth}={}){
  const {profile:p,fabric,backFabric=fabric,frameFabric=fabric,cornerFabric=backFabric,seam,pillow,wood,metal=wood,trim=wood}=materials;
  parent.userData.sofaConstruction=p.back;
  const timber=p.arms==='timber',foot=Math.min(p.feet,h*.18);
  const top=Math.min(p.seatHeight||.46,h*.6),pad=p.seatThickness||.14,arm=p.armWidth||(timber?.085:p.arms==='wide'?.21:p.arms==='rolled'?.18:.125);
  const leftArm=openLeft?0:arm,rightArm=openRight?0:arm;
  const inner=w-leftArm-rightArm,center=(leftArm-rightArm)/2;
  function cushion(name,sx,sy,sz,x,y,z,mat=fabric,round=.05,tuftCols=0){
    const soft=['seat-cushion','back-cushion','scatter-cushion','headrest','adjustable-headrest','lumbar-pad','footrest'].includes(name)||(!timber&&['sofa-arm','arm-side-panel'].includes(name));
    const geometry=soft
      ? sofaCushionGeometry(sx,sy,sz,{seat:name==='seat-cushion',scatter:name==='scatter-cushion',tufts:tuftCols,tuftRows:p.tuftRows||1,channels:((p.backChannels||p.back==='channel')&&name==='back-cushion')?Math.max(5,Math.round(sx/.07)):0,diamond:p.back==='diamond'&&name==='back-cushion',radius:round})
      : sofaSurfaceUVs(new RoundedBoxGeometry(sx,sy,sz,4,Math.min(round,sx*.22,sy*.4,sz*.4)));
    // Phase changes represent separately cut fabric panels at the same physical
    // repeat size. They avoid identical flowers at the centre of every cushion.
    if(mat.map?.name.startsWith('PDF fabric sample')){
      mat=mat.clone();mat.map=mat.map.clone();
      const phase=parent.children.length*.381966+x*.73;
      mat.map.offset.set(phase%1,(phase*.618034)%1);mat.map.needsUpdate=true;
    }
    const mesh=new THREE.Mesh(geometry,mat);mesh.userData.dimensions={width:sx,height:sy,depth:sz};mesh.name=name;mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function piping(mesh,sx,sy,sz){
    const r=Math.min(.035,sx*.1,sy*.15);let points=[];
    for(const [cx,cy,start] of [[sx/2-r,sy/2-r,0],[-sx/2+r,sy/2-r,Math.PI/2],[-sx/2+r,-sy/2+r,Math.PI],[sx/2-r,-sy/2+r,Math.PI*1.5]]){
      for(let k=0;k<=5;k++){const a=start+k*Math.PI/10;points.push(new THREE.Vector3(cx+Math.cos(a)*r,cy+Math.sin(a)*r,sz/2-.012));}
    }
    // Follow the padded surface at the seam instead of letting a planar cord
    // intermittently disappear into the bevel (which looked like dashed ink).
    if(mesh.geometry){
      points=new THREE.CatmullRomCurve3(points,true).getPoints(192).slice(0,-1);
      const sample=sofaFrontSampler(mesh.geometry);
      for(const point of points){
        const z=sample(point.x,point.y);
        if(z!==null)point.z=z+.0025;
      }
    }
    const curve=new THREE.CatmullRomCurve3(points,true);
    const cord=new THREE.Mesh(new THREE.TubeGeometry(curve,256,.0012,6,true),seam);cord.name='upholstery-piping';mesh.add(cord);
  }
  function fabricInsert(mesh,w,h,y=0){
    const material=fabric.clone();material.color.set(p.insertColor);material.map=sofaSurfaceTexture('damask');
    const geo=new THREE.PlaneGeometry(w,h,24,12),vertices=geo.attributes.position,sample=sofaFrontSampler(mesh.geometry);
    for(let i=0;i<vertices.count;i++){const x=vertices.getX(i),py=vertices.getY(i)+y;vertices.setXYZ(i,x,py,(sample(x,py)??0)+.001);}
    geo.computeVertexNormals();sofaSurfaceUVs(geo);const insert=new THREE.Mesh(geo,material);insert.name='bordered-fabric-insert';insert.receiveShadow=true;mesh.add(insert);
  }
  const baseH=top-pad-foot;
  const exposedTimber=timber&&['loop','arch','spindles','upholstered'].includes(p.frame);
  const base=cushion('upholstered-base',w,exposedTimber?.075:baseH,d,0,exposedTimber?top-pad-.0375:foot+baseH/2,0,timber?wood:frameFabric,.025);
  if(p.baseChannels){
    for(let x=-w/2+.035;x<w/2-.02;x+=.055){
      const fold=cushion('base-fabric-gather',.012,baseH*.86,.006,x,foot+baseH/2,d/2,frameFabric,.003);
      fold.rotation.z=.025*Math.sin(x*9);
    }
  }
  if(timber&&['enclosed','rails'].includes(p.frame)){
    const inset=wood.clone();inset.color.multiplyScalar(.5);
    for(let row=1;row<=3;row++)cushion('wood-front-recess',w-.12,.008,.004,0,foot+baseH*row/4,d/2+.001,inset,.001);
    for(const side of [-1,1])cushion('wood-front-stile',.055,top-foot,.035,side*(w-.055)/2,(top+foot)/2,d/2-.018,wood,.009);
  }
  for(const x of [-w*.41,w*.41])for(const z of [-d*.36,d*.36]){
    if(['metal','tapered','bun'].includes(p.footStyle)){
      const geometry=p.footStyle==='bun'?new THREE.SphereGeometry(.04,12,8):new THREE.CylinderGeometry(.035,.021,foot,10);
      const leg=new THREE.Mesh(sofaSurfaceUVs(geometry),p.footStyle==='metal'?metal:wood);
      if(p.footStyle==='bun')leg.scale.y=foot/.08;
      leg.position.set(x,foot/2,z);leg.name='sofa-foot';leg.castShadow=leg.receiveShadow=true;parent.add(leg);
    }else cushion('sofa-foot',.055,foot,.055,x,foot/2,z,wood,.005);
  }
  const headH=p.headrests?(p.headrestHeight||.16):0,headReveal=p.headrests?Math.min(.095,headH*.55):0;
  const backH=p.back==='low'?h*.33:h-(top-pad)-headReveal-.105;
  const noBack=chaise||p.back==='none';
  const rear=noBack?null:cushion('back-shell',w-leftArm-rightArm,backH,.105,center,top-pad+backH/2,-d*.5+.0525,timber?wood:frameFabric,.025);
  const bench=p.seat==='bench';
  const seatCount=bench?1:(p.seatPanels||count),sw=(inner-.009*(seatCount-1))/seatCount;
  const widths=seatWidths||Array(seatCount).fill(sw);
  let edge=-w/2+leftArm;
  for(let i=0;i<widths.length;i++){
    const width=widths[i]-.006,depth=d-.17;
    const seat=cushion('seat-cushion',width,pad,depth,edge+widths[i]/2,top-pad/2,d/2-.012-depth/2,fabric,.038);
    // Sew along the front perimeter, not a floating rectangle across the loft.
    piping(seat,width-.035,pad-.035,depth);
    if(p.seatChannels)for(let x=-width/2+.045;x<width/2-.02;x+=.075)cushion('seat-front-channel',.002,pad*.7,.002,seat.position.x+x,top-pad*.5,d/2-.013,seam,.001);
    edge+=widths[i]+(seatWidths?0:.009);
  }
  if(!noBack){
    const backs=backCount||p.backPanels||(['gathered','diamond','fixed'].includes(p.back)?1:count);
    const bw=inner/backs,bh=Math.max(.2,h-top-headReveal-.025),bd=p.back==='recliner'?.21:.145;
    for(let i=0;i<backs;i++){
      const x=center-inner/2+bw*(i+.5),backMat=cornerBack&&i===0?cornerFabric:backFabric;
      const rows=['split','grid','recliner'].includes(p.back)?(p.backRows||2):1;
      for(let row=0;row<rows;row++){
        const rh=bh/rows;
        const backZ=-d*.5+.15-(rh*(row+.5)-bh/2)*Math.tan(p.backLean||.08);
        const back=cushion('back-cushion',bw-.012,rh-.008,bd,x,top+rh*(row+.5)-.003,backZ,backMat,.035,p.tufts||(p.backTufts&&row===0?3:0));
        back.rotation.x=-(p.backLean||.08);piping(back,bw-.042,rh-.032,bd);
        if(p.backInserts){
          const ih=(rh-.1)/p.backInserts;
          for(let k=0;k<p.backInserts;k++)fabricInsert(back,bw-.1,ih-.012,-(rh-.1)/2+ih*(k+.5));
        }
        for(let button=0;button<(p.tufts||0);button++){
          const stud=new THREE.Mesh(new THREE.SphereGeometry(.005,8,6),seam);stud.scale.z=.45;
          stud.position.set(-(bw-.012)/2+(bw-.012)*(button+.5)/p.tufts,0,bd/2-.018);stud.name='fabric-button';back.add(stud);
        }
        if(p.backBand){const band=cushion('back-accent-band',bw-.016,.036,.012,x,back.position.y,-d*.5+.15+bd/2+.015,trim,.005);band.material=trim.clone();band.material.color.set(p.backBand);}
      }
      if(p.headrests){
        const headMat=p.headrestColor?frameFabric.clone():frameFabric;
        if(p.headrestColor)headMat.color.set(p.headrestColor);
        const head=cushion('adjustable-headrest',bw-.025,headH,.105,x,h-headH/2,-d*.5+.07,headMat,.033);head.rotation.x=-.16;
        for(const side of [-1,1])cushion('headrest-stem',.012,.08,.012,x+side*bw*.27,h-headH-.018,-d*.5+.06,metal,.003);
      }
      if(p.lumbar)cushion('lumbar-pad',bw*.72,bh*.38,.09,x,top+bh*.28,-d*.5+.275,backMat,.035);
      if(p.recliner)cushion('footrest',bw-.018,.19,.09,x,top-.21,d*.5-.04,fabric,.035);
    }
  }
  const fullDepth=d;
  for(const side of [-1,1]){
    if(side<0&&openLeft||side>0&&openRight)continue;
    const armStart=parent.children.length,d=shortArmDepth||fullDepth;
    const armH=timber?(p.frame==='enclosed'?.045:.06):p.arms==='rolled'?.19:p.arms==='swept'?.22:.13;
    const armY=timber?top+.11:top+.12;
    const m=cushion('sofa-arm',arm,armH,d*.95,side*(w-arm)/2,armY,0,timber?wood:frameFabric,p.arms==='rolled'?.09:.065);
    if(!timber&&!p.sideShelf){
      // Upholstered side cheeks join the arm to the base, without a floating gap.
      cushion('arm-side-panel',arm*.92,armY-foot, d*.92,side*(w-arm)/2,(armY+foot)/2,0,frameFabric,.045);
      if(p.arms==='rolled'){
        const roll=new THREE.Mesh(sofaSurfaceUVs(new THREE.CylinderGeometry(arm*.64,arm*.64,d*.91,24)),frameFabric);
        roll.rotation.x=Math.PI/2;roll.position.set(side*(w-arm)/2,armY+armH*.28,0);
        roll.castShadow=true;roll.receiveShadow=true;roll.name='rolled-arm-bolster';parent.add(roll);
      }
    }
    if(p.arms==='sloped'||p.arms==='swept'){
      const positions=m.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){
        const z=positions.getZ(i),y=positions.getY(i);
        const weight=(y+armH/2)/armH;
        positions.setY(i,y+(-z/d)*.2*weight);
        positions.setX(i,positions.getX(i)+side*weight*.035);
      }
      m.geometry.computeVertexNormals();
    }
    if(!timber){
      const ax=side*(w-arm)/2,outer=side*w/2;
      const tube=(name,points,material=trim,r=.008)=>{
        const curve=new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v)));
        const mesh=new THREE.Mesh(sofaSurfaceUVs(new THREE.TubeGeometry(curve,32,r,6,false)),material);
        mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
      };
      if(p.sideShelf){
        const low=.22,high=armY-armH/2,opening=high-low;
        cushion('arm-shelf-base',arm,low-foot,d*.94,ax,foot+(low-foot)/2,0,frameFabric,.025);
        for(const z of [-d*.37,d*.37])cushion('arm-shelf-post',arm,opening,.13,ax,(high+low)/2,z,frameFabric,.018);
        const dark=wood.clone();dark.color.multiplyScalar(.55);
        cushion('arm-shelf-interior',.018,opening,d*.64,ax-side*(arm/2-.018),(high+low)/2,0,dark,.002);
        cushion('arm-shelf-floor',arm-.02,.016,d*.64,ax,low+.008,0,wood,.003);
      }
      if(p.armShelf)cushion('timber-arm-tray',arm+.012,.022,d*.91,ax,armY+armH/2+.012,0,wood,.008);
      if(p.armTrim){
        const z=d*.476,lo=foot+.065,hi=armY+.04,l=ax-arm*.33,r=ax+arm*.33;
        if(p.armTrim==='scroll-panel'){
          // Silhouette of the visible dark carved end insert. Fine relief in the
          // catalogue is unresolved; the raised ornamental panel is approximate.
          const shape=new THREE.Shape();shape.moveTo(-arm*.47,lo);shape.bezierCurveTo(arm*.42,lo+.10,-arm*.35,hi-.08,arm*.38,hi);
          shape.lineTo(arm*.48,lo);shape.quadraticCurveTo(0,lo+.035,-arm*.47,lo);
          const geometry=new THREE.ExtrudeGeometry(shape,{depth:.016,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.003,bevelThickness:.003});
          const panel=new THREE.Mesh(sofaSurfaceUVs(geometry),trim);panel.name='carved-arm-end-approximation';panel.position.set(ax,0,z);panel.castShadow=panel.receiveShadow=true;parent.add(panel);
        }else if(p.armTrim==='sweep'){
          tube('swept-arm-inlay',[[outer,lo,d*.38],[outer,armY-.03,d*.16],[outer,armY+.08,-d*.08],[outer,armY+.17,-d*.4]],trim,.024);
        }else if(p.armTrim==='stripe'||p.armTrim==='fluted'){
          const n=p.armTrim==='fluted'?7:1;
          for(let col=0;col<n;col++)cushion('arm-front-inlay',n===1?arm*.42:.01,hi-lo,.015,ax+(col-(n-1)/2)*arm*.085,(lo+hi)/2,z,trim,.004);
        }else if(p.armTrim==='double'){
          for(const sign of [-1,1])cushion('twin-arm-post',.028,hi-lo,.025,ax+sign*arm*.34,(lo+hi)/2,z,wood,.006);
          for(const y of [lo+.075,hi-.085])cushion('twin-arm-band',arm*.95,.04,.023,ax,y,z+.01,trim,.005);
        }else{
          tube('arm-outline',[[l,lo,z],[l,hi-.01,z],[ax,hi+.028,z],[r,hi-.01,z],[r,lo+(p.armTrim==='hook'?.1:0),z]],trim,p.armTrim==='hook'?.018:.009);
          if(p.armTrim==='perforated')for(let row=0;row<4;row++){
            const y=lo+.045+row*(hi-lo-.07)/4;
            tube('pierced-arm-ornament',[[ax-.018,y,z+.012],[ax,y+.02,z+.012],[ax+.018,y,z+.012]],trim,.005);
          }
        }
      }
      if(p.armBadge)for(let row=0;row<3;row++)cushion('arm-metal-badge',.03,.008,.006,ax,armY-.09-row*.018,d*.484,metal,.002);
      if(p.sideChannels){
        for(let z=-d*.38;z<d*.4;z+=.06)cushion('side-upholstery-channel',.006,armY-foot-.055,.012,outer,(armY+foot)/2,z,frameFabric,.004);
      }
      if(p.sideTufts){
        const panel=new THREE.Mesh(sofaCushionGeometry(d*.76,armY-foot-.06,.035,{diamond:true,radius:.015}),frameFabric);
        panel.rotation.y=side*Math.PI/2;panel.position.set(outer,(armY+foot)/2,0);panel.name='quilted-arm-side';panel.castShadow=panel.receiveShadow=true;parent.add(panel);
      }
      if(p.backInserts){
        const panel=new THREE.Mesh(sofaCushionGeometry(d*.78,armY-foot-.08,.02,{radius:.008}),frameFabric);
        panel.rotation.y=side*Math.PI/2;panel.position.set(outer,(armY+foot)/2,0);panel.name='bordered-arm-side';panel.castShadow=panel.receiveShadow=true;parent.add(panel);
        const ih=(armY-foot-.13)/2;for(const y of [-1,1])fabricInsert(panel,d*.68,ih-.012,y*ih/2);
      }
      if(p.arms==='rolled'){
        const points=[];for(let j=0;j<=45;j++){const a=j/45*Math.PI*3.3,r=arm*.48*(1-j/60);points.push([ax+Math.cos(a)*r,armY+armH*.28+Math.sin(a)*r,d*.46]);}
        tube('rolled-arm-scroll',points,seam,.002);
      }
    }
    if(timber){
      if(p.frame==='enclosed'||p.frame==='upholstered'){
        cushion('wood-side-panel',arm*.6,armY-foot,d*.91,side*(w-arm)/2,(armY+foot)/2,0,p.frame==='upholstered'?fabric:wood,.012);
      }else if(p.frame==='rails'){
        for(let row=0;row<3;row++)cushion('horizontal-arm-rail',arm*.55,.045,d*.88,side*(w-arm)/2,foot+.08+row*.115,0,wood,.014);
        for(const z of [-d*.41,d*.41])cushion('arm-post',.05,armY-foot,.055,side*(w-arm)/2,(armY+foot)/2,z,wood,.014);
      }else if(p.frame==='loop'||p.frame==='arch'){
        const x=side*(w-arm)/2;
        const points=p.frame==='loop'
          ? [[-d*.39,foot+.06],[-d*.18,armY-.03],[d*.05,armY-.025],[d*.4,.055],[d*.44,foot+.04]]
          : [[-d*.38,foot+.08],[-d*.24,armY-.04],[0,armY-.025],[d*.25,armY-.06],[d*.39,foot+.06]];
        const curve=new THREE.CatmullRomCurve3(points.map(([z,y])=>new THREE.Vector3(x,y,z)));
        const rail=new THREE.Mesh(sofaSurfaceUVs(new THREE.TubeGeometry(curve,32,.022,8,false)),wood);
        rail.name='curved-timber-side';rail.castShadow=true;rail.receiveShadow=true;parent.add(rail);
      }else for(let i=0;i<5;i++)cushion('arm-spindle',.026,.25,.028,side*(w-arm)/2,top-.04,-d*.32+i*d*.16,wood,.005);
    }
    if(shortArmDepth)for(const child of parent.children.slice(armStart))child.position.z-=(fullDepth-shortArmDepth)/2;
  }
  const pillowTotal=pillowCount??p.pillows;
  if(pillowTotal&&w>.7&&!chaise){
    const pw=Math.min(.38,inner*.29),ph=Math.min(.34,h-top-.02);
    for(const side of (pillowTotal===1?[0]:pillowTotal===3?[-1,0,1]:[-1,1])){
      const m=cushion('scatter-cushion',pw,ph,.11,center+side*(inner/2-pw*.6),top+ph*.45,-d*.15,pillow,.06);
      m.rotation.set(-.12,side*.12,side*-.14);piping(m,pw-.04,ph-.04,.11);
    }
  }
  return rear;
}
