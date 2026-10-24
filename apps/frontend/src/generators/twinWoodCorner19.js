import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { sofaSurfaceUVs, sofaSurfaceTexture, sofaFrontSampler } from './sofaSurface.js';
import { twinWood19Padding, twinWood19Textile, INSERT_REPEAT_METERS } from './twinWood19Upholstery.js';

export const TWIN_WOOD_19 = Object.freeze({ width:2.794, depth:2.794, wingDepth:.8636, height:.8382 });

// No. 19 only: PDF 18 / printed 09, upper photograph. Hidden supports and
// rear upholstery are inferred. Do not use this construction for No. 20 or 38.
export function createTwinWoodCorner19(width=TWIN_WOOD_19.width, depth=TWIN_WOOD_19.depth) {
  const {width:L,wingDepth:D,height:H}=TWIN_WOOD_19, A=.215, B=.14;
  const root=new THREE.Group();root.name='Twin Wood Handle Corner Sofa — 19';
  const fabric=new THREE.MeshPhysicalMaterial({name:'19 · taupe woven upholstery',color:'#928a82',
    map:sofaSurfaceTexture('cloth'),bumpMap:sofaSurfaceTexture(),bumpScale:.00065,
    roughnessMap:sofaSurfaceTexture('roughness'),roughness:.91,envMapIntensity:.65,sheen:.16,sheenRoughness:.85});
  const patterned=fabric.clone();patterned.name='19 · dark patterned fabric';patterned.color.set('#aaa7a1');patterned.map=twinWood19Textile();
  patterned.userData={sourceProduct:'sf-sofas-p18-19',sourceResolution:[64,33],repeatMeters:[INSERT_REPEAT_METERS,INSERT_REPEAT_METERS],approximation:'Seamless woven reconstruction; source photograph cannot resolve the exact weave'};
  const wood=new THREE.MeshPhysicalMaterial({name:'19 · light wood',color:'#c9b6a1',map:sofaSurfaceTexture('wood'),roughness:.5,clearcoat:.12,clearcoatRoughness:.45});
  const dark=new THREE.MeshStandardMaterial({name:'19 · dark vertical trim',color:'#292e31',roughness:.46});
  const feet=new THREE.MeshStandardMaterial({name:'19 · short dark feet',color:'#24211f',roughness:.62});
  const thread=new THREE.MeshStandardMaterial({name:'19 · piping',color:'#928a82',roughness:1,envMapIntensity:.35});
  function part(parent,name,w,h,d,x,y,z,material=fabric,soft=false,seat=false,r=.012){
    const geometry=soft?twinWood19Padding(w,h,d,{seat,radius:r}):sofaSurfaceUVs(new RoundedBoxGeometry(w,h,d,3,Math.min(r,w/4,h/4,d/4)));
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;
    mesh.userData={part:name,dimensions:{width:w,height:h,depth:d}};parent.add(mesh);return mesh;
  }
  // Thin inlays follow the actual padded front, keeping the broad border as
  // plain fabric. UVs are metres, never a stretched product photograph.
  let textilePanel=0;
  function inset(mesh,w,h,offsetX=0,offsetY=0,material=patterned){
    const phase=mesh.userData.textilePhase??(mesh.userData.textilePhase=[(++textilePanel*.381966)%1,(textilePanel*.618034)%1]);
    const sample=mesh.geometry.index?sofaFrontSampler(mesh.geometry):()=>mesh.userData.dimensions.depth/2,nx=24,ny=12,p=[],uv=[],index=[];
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
      const x=(i/nx-.5)*w+offsetX,y=(j/ny-.5)*h+offsetY;
      p.push(x,y,(sample(x,y)??mesh.userData.dimensions.depth/2)+.0006);
      uv.push(x/INSERT_REPEAT_METERS+phase[0],y/INSERT_REPEAT_METERS+phase[1]);
    }
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+2,d=a+nx+1;index.push(a,b,d,b,c,d);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();sofaSurfaceUVs(g);
    const panel=new THREE.Mesh(g,material);panel.name='patterned-insert';panel.receiveShadow=true;mesh.add(panel);return panel;
  }
  function piping(mesh,w,h){
    const points=[],r=.018,sample=sofaFrontSampler(mesh.geometry);
    for(const [cx,cy,start] of [[w/2-r,h/2-r,0],[-w/2+r,h/2-r,Math.PI/2],[-w/2+r,-h/2+r,Math.PI],[w/2-r,-h/2+r,Math.PI*1.5]]){
      for(let i=0;i<=8;i++){const a=start+i*Math.PI/16,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;points.push(new THREE.Vector3(x,y,(sample(x,y)??0)+.001));}
    }
    // Reproject along the straight spans too: interpolating only the corner
    // samples lets the cord dip into the foam and appear as dotted black marks.
    const fitted=new THREE.CatmullRomCurve3(points,true).getPoints(192).slice(0,-1);
    for(const p of fitted)p.z=(sample(p.x,p.y)??p.z)+.0022;
    const seam=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fitted,true),256,.00125,6,true),thread);
    seam.name='upholstery-piping';mesh.add(seam);
  }
  function backCushion(name,w,h,x,z,yaw=0){
    const group=new THREE.Group();group.name=name;group.position.set(x,.431+h/2,z);group.rotation.y=yaw;root.add(group);
    const mesh=part(group,'loose-back-cushion',w,h,w>.5?.17:.12,0,0,0,fabric,true,false,.045);mesh.rotation.x=-.14;
    const iw=w-.105,ih=h-.09,bar=.009;
    // Four dark panels, narrow crossing taupe strips, broad sewn outer border.
    if(w>.5) {
      for(const sx of [-1,1])for(const sy of [-1,1])inset(mesh,(iw-bar)/2,(ih-bar)/2,sx*(iw+bar)/4,sy*(ih+bar)/4);
    } else inset(mesh,iw,ih);
    piping(mesh,w-.06,h-.055);return group;
  }
  // Three disjoint volumes partition the L. The shared D × D corner is counted
  // once; neither wing adds another corner onto the overall 110-inch length.
  part(root,'corner-base',D,.19,D,D/2,.145,D/2,fabric,false,false,.022);
  part(root,'base-x-wing',L-D-A,.19,D,(L+D-A)/2,.145,D/2,fabric,false,false,.022);
  part(root,'base-z-wing',D,.19,L-D-A,D/2,.145,(L+D-A)/2,fabric,false,false,.022);
  // Rails meet at a butt joint rather than occupying the same corner volume.
  part(root,'backrest-x-wing',L-A,.475,B,(L-A)/2,.4775,B/2,fabric,false,false,.025);
  part(root,'backrest-z-wing',B,.475,L-A-B,B/2,.4775,(L-A+B)/2,fabric,false,false,.025);
  const run=L-D-A,seatD=D-.17;
  const seatX=part(root,'seat-x-wing',run-.004,.20,seatD,(D+L-A)/2,.34,(D+.16)/2,fabric,true,true,.055);
  const seatZ=part(root,'seat-z-wing',run-.004,.20,seatD,(D+.16)/2,.34,(D+L-A)/2,fabric,true,true,.055);seatZ.rotation.y=Math.PI/2;
  part(root,'shared-corner-seat',D-.168,.20,D-.168,(D+.16)/2,.34,(D+.16)/2,fabric,true,true,.055);
  for(const seat of [seatX,seatZ])piping(seat,run-.05,.155);
  const cw=(run-.022)/2;
  for(let i=0;i<2;i++){
    const p=D+.009+cw/2+i*(cw+.004);
    backCushion('back-cushion-x-'+i,cw,.386,p,.255);
    backCushion('back-cushion-z-'+i,cw,.386,.255,p,Math.PI/2);
  }
  // The photograph shows three smaller pillows at the inside corner. Their
  // rear supports and exact angles are inferred; padded volumes stay separate.
  backCushion('corner-cushion-x',.30,.30,.708,.245,.10);
  backCushion('corner-cushion-z',.30,.30,.245,.708,Math.PI/2-.10);
  backCushion('corner-cushion-diagonal',.36,.30,.36,.36,Math.PI/4);
  function arm(x,z,yaw){
    const g=new THREE.Group();g.name='square-end-arm';g.position.set(x,0,z);g.rotation.y=yaw;root.add(g);
    part(g,'arm-body',A-.008,.51,D-.012,0,.305,0,fabric,false,false,.027);
    part(g,'arm-top',A,.055,D,0,.5875,0,fabric,false,false,.025);
    // Patterned outer side, with a plain border and horizontal divider.
    const side=part(g,'arm-outer-panel',D-.10,.435,.009,A/2-.006,.305,0,fabric,false,false,.002);side.rotation.y=Math.PI/2;
    inset(side,D-.16,.185,0,.106);inset(side,D-.16,.185,0,-.106);
    // At the exposed front: two light wood stiles beside a dark central accent.
    part(g,'light-wood-stile',.055,.49,.012,-A*.31,.305,D/2-.007,wood,false,false,.003);
    part(g,'dark-vertical-accent',.044,.49,.012,.004,.305,D/2-.007,dark,false,false,.002);
    part(g,'light-wood-stile',.055,.49,.012,A*.31,.305,D/2-.007,wood,false,false,.003);
    part(g,'end-foot',A-.025,.05,D-.075,0,.025,0,feet,false,false,.006);return g;
  }
  arm(L-A/2,D/2,0);arm(D/2,L-A/2,Math.PI/2).scale.x=-1;
  // Plain, undecorated underside and supports, consistent with the visible feet.
  for(const [x,z] of [[.085,.085],[D-.08,D-.08],[1.64,.12],[.12,1.64]])part(root,'support-foot',.085,.05,.085,x,.025,z,feet,false,false,.004);
  root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
  for(const c of root.children){c.position.x-=L/2;c.position.z-=L/2;}
  // Preserve measured envelope, including loft and the slight cushion lean.
  root.scale.set(width/size.x,H/size.y,depth/size.z);
  root.userData={sofaFactoryProduct:'sf-sofas-p18-19',sourcePage:18,referenceApproximation:true,
    sofaDesign:{id:'sf-sofas-p18-19',layout:'corner',dedicated:true},catalogueDimensions:{...TWIN_WOOD_19},
    inferredDetails:['rear support construction','underside supports','corner pillow angles','fabric weave and repeat size (procedural approximation)','cushion loft and compression']};
  return root;
}
