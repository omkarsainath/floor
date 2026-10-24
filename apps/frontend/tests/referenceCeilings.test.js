import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {REFERENCE_CEILING_TYPES} from '../src/design/referenceCeilings.js';
import {buildCeilingProfile} from '../src/design/ceilingProfiles.js';
import {getFinishStyle,optionsFor,normalizeRoomDesign} from '../src/design/roomDesignCatalog.js';
import {createRoomDesignController} from '../src/design/roomDesignController.js';
import {parseLayout} from '../src/loaders/jsonLoader.js';
import {disposeRoomFinish} from '../src/design/finishGeometry.js';
const shapes=[[{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}],
 [{x:0,y:0},{x:6,y:0},{x:6,y:1.5},{x:2,y:1.5},{x:2,y:4},{x:0,y:4}]];
for(const style of REFERENCE_CEILING_TYPES)test(`${style.id}: clipped finite layers and bounded render cost`,()=>{
 for(const [index,points] of shapes.entries()){
  const room={id:'r',height:3,points},copy=JSON.stringify(room);
  const group=buildCeilingProfile({room,style,selection:{ceilingDropM:.2}});
  assert.ok(group.children.filter(n=>n.isMesh).length<=3);assert.ok(group.children.some(n=>n.material?.emissiveIntensity>1));
  const emitters=[];group.traverse(n=>{if(n.isLight)emitters.push(n);});
  assert.ok(emitters.length>=1&&emitters.length<=4,'bounded real illumination per ceiling');
  for(const emitter of emitters){
   assert.equal(emitter.userData.isAuthoredLight,true,'lights survive Render mode');
   assert.ok(emitter.intensity>0&&emitter.isRectAreaLight);
   assert.equal(emitter.userData.distribution,'diffuse-surface');
   assert.ok(emitter.width>0&&emitter.height>0);
   const normal=new THREE.Vector3(0,0,-1).applyQuaternion(emitter.quaternion);
   assert.ok(normal.y<-.99,'surface emission points into room');
   assert.ok(emitter.position.x>=0&&emitter.position.x<=6&&emitter.position.z>=0&&emitter.position.z<=4);
   if(index)assert.ok(emitter.position.x<=2.00001||emitter.position.z<=1.50001,'no emitter in L-shaped void');
   assert.equal(emitter.castShadow,false,'no artificial spotlight shadows');
  }
  group.traverse(n=>{if(!n.isMesh)return;
   assert.equal(n.userData.walkSurfaceTriangles,true);
   const pos=n.geometry.attributes.position;
   for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    assert.ok([x,y,z].every(Number.isFinite));
    assert.ok(x>=-1e-5&&x<=6.00001&&z>=-1e-5&&z<=4.00001);
    assert.ok(y>=2.79999&&y<=3.00001);
    if(index)assert.ok(x<=2.00001||z<=1.50001,'no geometry across L-shaped void');
   }
  });
  assert.equal(JSON.stringify(room),copy);disposeRoomFinish(group);
 }
});

test('all 54 references are available, saveable and restored by the room controller',()=>{
 assert.equal(REFERENCE_CEILING_TYPES.length,54);
 for(const style of REFERENCE_CEILING_TYPES){
  assert.equal(getFinishStyle(style.id),style);
  for(const roomType of ['living','bedroom','kitchen','bathroom'])assert.ok(optionsFor(roomType,'ceiling').includes(style));
  const room={id:'r',name:'Living Room',height:3,points:shapes[0],boundary_source:'manual'};
  const layout={units:'m',rooms:[room],walls:[],objects:[]};let saved;
  const c=createRoomDesignController({scene:new THREE.Scene(),getLayout:()=>layout,getWallSegments:()=>[],save:value=>{saved=JSON.stringify(value);return true;}});
  const selection=normalizeRoomDesign({roomType:'living',ceiling:style.id,ceilingDropM:.2});
  assert.equal(c.apply('r',selection).ok,true);c.destroy();
  const restored=parseLayout(JSON.parse(saved));assert.equal(restored.rooms[0].design.ceiling,style.id);
  const next=createRoomDesignController({scene:new THREE.Scene(),getLayout:()=>restored,getWallSegments:()=>[]});next.rebuild();
  assert.ok(next.getGroup('r'));next.setCeilingsVisible(false);next.setCeilingsVisible(true);next.destroy();
 }
});
