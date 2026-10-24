import * as THREE from 'three';

function outline(w,d,r) {
  const p=new THREE.Shape(),x=-w/2,z=-d/2;
  p.moveTo(x+r,z);p.lineTo(x+w-r,z);p.quadraticCurveTo(x+w,z,x+w,z+r);
  p.lineTo(x+w,z+d-r);p.quadraticCurveTo(x+w,z+d,x+w-r,z+d);
  p.lineTo(x+r,z+d);p.quadraticCurveTo(x,z+d,x,z+d-r);
  p.lineTo(x,z+r);p.quadraticCurveTo(x,z,x+r,z);return p;
}
export function sinkDimensions(w,d) {return {w:w*.78,d:d*.68,depth:Math.min(.20,d*.34)};}
export function counterOpening(w,d,thickness,holeW,holeD,offsetX=0,offsetZ=0) {
  const shape=outline(w,d,.001),hole=outline(holeW,holeD,.025);
  const points=hole.getPoints(12).map(p=>new THREE.Vector2(p.x+offsetX,p.y-offsetZ));
  shape.holes.push(new THREE.Path(points));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:12});
  geometry.rotateX(-Math.PI/2);geometry.translate(0,-thickness/2,0);return geometry;
}
export function createInsetSink(w,d,depth) {
  const g=new THREE.Group();g.name='Inset kitchen sink';
  const steel=new THREE.MeshStandardMaterial({color:0x92999e,metalness:.65,roughness:.28,side:THREE.DoubleSide});
  const chrome=new THREE.MeshStandardMaterial({color:0xc4c9cb,metalness:.8,roughness:.2});
  const dark=new THREE.MeshStandardMaterial({color:0x25292d,roughness:.65});
  const add=(geometry,material,name)=>{const m=new THREE.Mesh(geometry,material);m.name=name;if(name.startsWith('sink-bowl'))m.userData.fixturePart='basin';m.castShadow=m.receiveShadow=true;g.add(m);return m;};
  const rim=outline(w+.038,d+.038,.04);rim.holes.push(new THREE.Path(outline(w,d,.025).getPoints(12)));
  const rimGeo=new THREE.ExtrudeGeometry(rim,{depth:.006,bevelEnabled:false,curveSegments:12});rimGeo.rotateX(-Math.PI/2);add(rimGeo,steel,'sink-rim');
  const upper=outline(w,d,.025).getPoints(12),lower=outline(w-.06,d-.06,.035).getPoints(12),positions=[];
  for(let i=0;i<upper.length-1;i++){
    const a=[upper[i].x,0,-upper[i].y],b=[upper[i+1].x,0,-upper[i+1].y],c=[lower[i].x,-depth,-lower[i].y],e=[lower[i+1].x,-depth,-lower[i+1].y];
    positions.push(...a,...b,...c,...b,...e,...c);
  }
  const wall=new THREE.BufferGeometry();wall.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));wall.computeVertexNormals();add(wall,steel,'sink-bowl-walls');
  const floor=new THREE.ShapeGeometry(outline(w-.06,d-.06,.035),12);floor.rotateX(-Math.PI/2);add(floor,steel,'sink-bowl-floor').position.y=-depth;
  const drain=add(new THREE.BoxGeometry(.075,.004,.075),chrome,'sink-drain');drain.position.set(w*.18,-depth+.003,d*.15);
  for(let i=-2;i<=2;i++){const slot=add(new THREE.BoxGeometry(.004,.002,.05),dark,'sink-drain-slot');slot.position.set(w*.18+i*.011,-depth+.006,d*.15);}
  const back=-d/2-.035,radius=Math.min(.105,d*.28),height=.23;
  const base=add(new THREE.CylinderGeometry(.027,.032,.045,24),chrome,'sink-tap-base');base.position.set(0,.0225,back);
  const points=[new THREE.Vector3(0,.025,back),new THREE.Vector3(0,height,back)];
  for(let i=1;i<=24;i++){const t=Math.PI*i/24;points.push(new THREE.Vector3(0,height+radius*Math.sin(t),back+radius*(1-Math.cos(t))));}
  points.push(new THREE.Vector3(0,height-.055,back+radius*2));
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),72,.013,12,false),chrome,'sink-gooseneck');
  const lever=add(new THREE.CylinderGeometry(.006,.006,.095,12),chrome,'sink-tap-lever');lever.position.set(.05,.08,back);
  for(let i=0;i<8;i++){const rail=add(new THREE.CylinderGeometry(.004,.004,d+.018,10),chrome,'sink-rack-rail');rail.rotation.x=Math.PI/2;rail.position.set(-w/2+.025+i*w*.035,.014,0);}
  for(const z of [-d/2,d/2]){const support=add(new THREE.BoxGeometry(w*.3,.022,.025),dark,'sink-rack-support');support.position.set(-w*.32,.012,z);}
  return g;
}
