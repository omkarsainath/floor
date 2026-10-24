import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sofaCushionGeometry, sofaSurfaceUVs, sofaFrontSampler } from '../src/generators/sofaSurface.js';
import { createSofaMaterials } from '../src/generators/sofaUpholstery.js';
import { createDetailedFurniture } from '../src/generators/detailedFurniture.js';

function nearestSurface(geometry, x, y, z) {
  const p = geometry.attributes.position;
  let best, distance = Infinity;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i), d = v.distanceToSquared(new THREE.Vector3(x, y, z));
    if (d < distance) { distance = d; best = v; }
  }
  return best;
}
test('seat tops and back fronts have actual foam loft, with recessed tuft centres', () => {
  const seat = sofaCushionGeometry(.6,.14,.7,{seat:true});
  assert.ok(nearestSurface(seat,0,.07,0).y > .085, 'seat top must not be a flat slab');
  const plain = sofaCushionGeometry(.6,.45,.19), tufted = sofaCushionGeometry(.6,.45,.19,{tufts:1});
  assert.ok(nearestSurface(plain,0,0,.095).z > .11);
  assert.ok(nearestSurface(tufted,0,0,.095).z < .105);
  for (const geometry of [seat,plain,tufted]) {
    assert.ok([...geometry.attributes.normal.array].every(Number.isFinite));
    assert.ok(geometry.attributes.position.count < 18000);
  }
});
test('textile UVs keep the same physical thread scale on different-sized faces', () => {
  for (const width of [.5,2]) {
    const g = sofaSurfaceUVs(new THREE.BoxGeometry(width,.3,.6));
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv1;
    const front = Array.from({length:p.count},(_,i)=>i).filter(i=>n.getZ(i)===1);
    const span = Math.max(...front.map(i=>uv.getX(i)))-Math.min(...front.map(i=>uv.getX(i)));
    assert.ok(Math.abs(span-width/.12)<1e-5);
  }
});
test('seam sampling matches actual cushion intersections, including bevels and tufts', () => {
  const geometry=sofaCushionGeometry(.8,.4,.19,{tufts:3}),sample=sofaFrontSampler(geometry);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()),ray=new THREE.Raycaster();
  ray.ray.direction.set(0,0,-1);
  for(const x of [-.38,-.34,-.13,0,.19,.38])for(const y of [-.17,0,.17]){
    ray.ray.origin.set(x,y,1);
    const hit=ray.intersectObject(mesh)[0];
    assert.ok(hit);assert.ok(Math.abs(sample(x,y)-hit.point.z)<1e-6);
  }
  assert.equal(sample(3,3),null);
});
test('Spider uses fine relief instead of a painted rib pattern, with isolated materials', () => {
  const product={id:'sf-sofa-beds-p40-04',label:'Spider',category:'sofa-beds',color:'#397c70'};
  const a=createSofaMaterials(product),b=createSofaMaterials(product);
  assert.equal(a.fabric.map.name,'Sofa cloth · physical scale');
  assert.equal(a.fabric.bumpMap.channel,1);
  assert.ok(a.fabric.bumpScale<.001);
  a.fabric.color.set('red');assert.notEqual(a.fabric.color.getHex(),b.fabric.color.getHex());
  assert.equal(a.fabric.bumpMap,b.fabric.bumpMap);
});
test('standard sofas and chaise retain requested footprints with the shared upholstery',()=>{
  for(const id of ['sofa','sofa-2','sofa-3','loveseat','l-sofa']){
    const model=createDetailedFurniture(id,2.2,id==='l-sofa'?1.8:.9),b=new THREE.Box3().setFromObject(model),s=b.getSize(new THREE.Vector3());
    assert.ok(Math.abs(s.x-2.2)<1e-5);assert.ok(Math.abs(s.z-(id==='l-sofa'?1.8:.9))<1e-5);
    assert.ok(Math.abs(b.min.y)<1e-6);
    const seats=[];model.traverse(n=>{if(n.name==='seat-cushion')seats.push(n);});
    assert.ok(seats.length>=2);assert.ok(seats.every(n=>n.geometry.attributes.uv1));
  }
});
