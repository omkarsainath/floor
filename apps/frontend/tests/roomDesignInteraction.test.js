import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchRoomWallHit } from '../src/ui/roomDesignInteraction.js';
import { normalizeRoomDesign } from '../src/design/roomDesignCatalog.js';
import { createRoomDesignController } from '../src/design/roomDesignController.js';

test('live light updates keep other meshes and finishes intact and roll back failed edits',()=>{
  const room={id:'live',height:3,points:[{x:0,y:0},{x:6,y:0},{x:6,y:6},{x:0,y:6}]};
  const layout={rooms:[room],walls:[]};let saved,canSave=true;
  const controller=createRoomDesignController({scene:new THREE.Scene(),getLayout:()=>layout,getWallSegments:()=>[],save:value=>{if(!canSave)return false;saved=JSON.stringify(value);return true;}});
  assert.equal(controller.apply(room.id,{roomType:'living',ceilingLights:[{id:'a',type:'linear-led',x:2,z:2},{id:'b',type:'pendant',x:4,z:4}]}).ok,true);
  const group=controller.getGroup(room.id),other=group.getObjectByName('ceiling-light:b');
  assert.equal(controller.updateLight(room.id,'a',{widthM:1.8,depthM:.24,lumens:1200}).ok,true);
  assert.equal(controller.getGroup(room.id),group);
  assert.equal(group.getObjectByName('ceiling-light:b'),other);
  assert.equal(JSON.parse(saved).rooms[0].design.ceilingLights[0].widthM,1.8);
  assert.equal(room.design.ceilingLights[0].lumens,1200);
  assert.equal(controller.updateLight(room.id,'a',{x:2.5,z:1.5,type:'downlight',beamWidthM:1.2,beamHeightM:.4,aimTiltDegrees:60,aimDirectionDegrees:180}).ok,true);
  const moved=group.getObjectByName('ceiling-light:a');
  assert.equal(moved.position.x,2.5);assert.equal(moved.position.z,1.5);
  const persisted=JSON.parse(saved).rooms[0].design.ceilingLights[0];
  assert.equal(persisted.x,2.5);assert.equal(persisted.z,1.5);assert.equal(persisted.beamWidthM,1.2);assert.equal(persisted.aimTiltDegrees,60);
  assert.equal(group.getObjectByName('ceiling-light:b'),other);
  const before=JSON.stringify(room.design),body=group.getObjectByName('ceiling-light:a');
  assert.equal(controller.updateLight(room.id,'a',{widthM:5,depthM:5}).ok,false);
  assert.equal(controller.updateLight(room.id,'a',{x:-1,z:1}).ok,false);
  assert.equal(JSON.stringify(room.design),before);assert.equal(group.getObjectByName('ceiling-light:a'),body);
  canSave=false;
  assert.equal(controller.updateLight(room.id,'a',{lumens:1800}).ok,false);
  assert.equal(JSON.stringify(room.design),before);assert.equal(group.getObjectByName('ceiling-light:a'),body);
  assert.equal(controller.updateLight(room.id,'missing',{lumens:1800}).ok,false);
  controller.destroy();
});

test('resizing and deleting one ceiling light persists without changing other lights or room finishes',()=>{
  const room={id:'lights',height:3,points:[{x:0,y:0},{x:6,y:0},{x:6,y:6},{x:0,y:6}]};
  const layout={units:'m',rooms:[room],walls:[]};let saved;
  const controller=createRoomDesignController({scene:new THREE.Scene(),getLayout:()=>layout,getWallSegments:()=>[],save:value=>{saved=JSON.stringify(value);return true;}});
  const settings={roomType:'living',ceilingLights:[{id:'a',type:'linear-led',x:2,z:2},{id:'b',type:'pendant',x:4,z:4}]};
  assert.equal(controller.apply(room.id,settings).ok,true);
  const other=structuredClone(room.design.ceilingLights[1]);
  const resized={...room.design,ceilingLights:room.design.ceilingLights.map(l=>l.id==='a'?{...l,widthM:1.8,depthM:.24}:l)};
  assert.equal(controller.apply(room.id,resized).ok,true);
  room.design=JSON.parse(saved).rooms[0].design;controller.rebuild();
  assert.equal(room.design.ceilingLights[0].widthM,1.8);assert.equal(room.design.ceilingLights[0].depthM,.24);
  assert.deepEqual(room.design.ceilingLights[1],other);
  const root=controller.getGroup(room.id).getObjectByName('ceiling-light:a');
  assert.equal(root.userData.placement.widthM,1.8);
  let disposed=false;root.traverse(n=>{if(n.geometry)n.geometry.addEventListener('dispose',()=>disposed=true);});
  assert.equal(controller.apply(room.id,{...room.design,ceilingLights:[other]}).ok,true);
  assert.equal(disposed,true);assert.equal(controller.getGroup(room.id).getObjectByName('ceiling-light:a'),undefined);
  room.design=JSON.parse(saved).rooms[0].design;controller.rebuild();
  assert.deepEqual(room.design.ceilingLights,[other]);assert.equal(room.design.roomType,'living');
  controller.destroy();
});

const surface = { start: { x: 0, y: 0.1 }, end: { x: 4, y: 0.1 }, normal: { x: 0, y: 1 }, yOffset: 0, height: 3, parentWallId: 'wall' };
test('3D wall marking accepts only the selected room face and never caps, outside faces, or neighbouring walls', () => {
  const object = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.2));
  object.userData.parentWallId = 'wall'; object.updateMatrixWorld(true);
  const hit = { object, point: new THREE.Vector3(2, 1.2, 0.1), face: { normal: new THREE.Vector3(0, 0, 1) } };
  assert.equal(matchRoomWallHit(hit, [surface]), surface);
  assert.equal(matchRoomWallHit({ ...hit, face: { normal: new THREE.Vector3(0, 0, -1) } }, [surface]), null);
  assert.equal(matchRoomWallHit({ ...hit, face: { normal: new THREE.Vector3(0, 1, 0) } }, [surface]), null);
  assert.equal(matchRoomWallHit({ ...hit, point: new THREE.Vector3(5, 1, 0.1) }, [surface]), null);
  assert.equal(matchRoomWallHit({ ...hit, point: new THREE.Vector3(2, 1, 2) }, [surface]), null);
  assert.equal(matchRoomWallHit(hit, [{ ...surface, parentWallId: 'other-room' }]), null);
  // World-space normals, rather than unrotated geometry normals, choose the face.
  object.rotation.y = Math.PI / 2; object.updateMatrixWorld(true);
  const rotated = { ...surface, start: { x: 0.1, y: 0 }, end: { x: 0.1, y: -4 }, normal: { x: 1, y: 0 } };
  assert.equal(matchRoomWallHit({ ...hit, point: new THREE.Vector3(0.1, 1.2, -2) }, [rotated]), rotated);
  object.geometry.dispose(); object.material.dispose();
});

test('invalid marked data cannot silently become a full-wall finish or replace the saved design', () => {
  const bad = { roomType: 'living', wallPanel: 'living-wallPanel-charcoal-louvers', accentWallId: 'wall',
    wallPanelRegions: [{ id: 'bad', wallId: 'wall', startM: 0.5, endM: 2, bottomM: 0.4, topM: 2.2, styleId: 'missing-style' }] };
  assert.equal(normalizeRoomDesign(bad).wallPanel, undefined);
  const room = { id: 'room', name: 'Living Room', height: 3, boundary_source: 'manual', points: [{ x: 0.1, y: 0.1 }, { x: 3.9, y: 0.1 }, { x: 3.9, y: 2.9 }, { x: 0.1, y: 2.9 }] };
  const wall = { id: 'wall', start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, height: 3, thickness: 0.2 };
  const layout = { rooms: [room], walls: [wall] };
  const controller = createRoomDesignController({ scene: new THREE.Scene(), getLayout: () => layout, getWallSegments: () => [wall], save: () => true });
  assert.equal(controller.apply('room', { roomType: 'living', ceiling: 'ceiling-flat' }).ok, true);
  const saved = room.design, group = controller.getGroup('room');
  assert.equal(controller.apply('room', bad).ok, false);
  assert.equal(room.design, saved); assert.equal(controller.getGroup('room'), group);
  assert.equal(controller.apply('room', { roomType: 'living', ceilingLights: [{ type: 'unknown', x: 2, z: 2 }] }).ok, false);
  assert.equal(room.design, saved);
  controller.destroy();
});

test('raised artwork remains selectable on tilted triangles only in its owning room',()=>{
  const object=new THREE.Mesh(new THREE.PlaneGeometry());
  object.userData={parentWallId:'wall',isRoomFinish:true,roomId:'living',finishDepthM:.28};object.updateMatrixWorld(true);
  const hit={object,point:new THREE.Vector3(2,1,.37),face:{normal:new THREE.Vector3(.95,.3,.05).normalize()}};
  assert.equal(matchRoomWallHit(hit,[surface],{roomId:'living'}),surface);
  assert.equal(matchRoomWallHit(hit,[surface],{roomId:'bedroom'}),null);
  assert.equal(matchRoomWallHit({...hit,point:new THREE.Vector3(2,1,1)},[surface],{roomId:'living'}),null);
  object.geometry.dispose();object.material.dispose();
});
test('Orbit can select the top cap for a whole wall, but area corners cannot use it',()=>{
  const object=new THREE.Mesh(new THREE.BoxGeometry());object.userData.parentWallId='wall';object.updateMatrixWorld(true);
  const hit={object,point:new THREE.Vector3(2,3,0),face:{normal:new THREE.Vector3(0,1,0)}};
  assert.equal(matchRoomWallHit(hit,[surface]),null);
  assert.equal(matchRoomWallHit(hit,[surface],{allowTop:true}),surface);
  assert.equal(matchRoomWallHit({...hit,point:new THREE.Vector3(2,2,0)},[surface],{allowTop:true}),null);
  object.geometry.dispose();object.material.dispose();
});
test('picking a different room transfers the wall style without copying its floor and lights',async()=>{
  const {wallDraftForTarget}=await import('../src/ui/roomDesignInteraction.js');
  const room={name:'Bedroom',design:{roomType:'bedroom',floor:'bedroom-floor',ceilingLights:[{id:'target'}]}};
  const source={roomType:'living',wallPanel:'wall-relief-horses',floor:'living-floor',ceilingLights:[{id:'source'}]};
  const result=wallDraftForTarget(source,room);
  assert.equal(result.wallPanel,source.wallPanel);assert.equal(result.floor,'bedroom-floor');
  assert.deepEqual(result.ceilingLights,[{id:'target'}]);assert.equal(room.design.wallPanel,undefined);
});

test('explicit bare-wall picking accepts both broad faces but not furniture or jambs',async()=>{
  const {directWallFaceHit}=await import('../src/ui/roomDesignInteraction.js');
  const wall={id:'w',start:{x:0,y:0},end:{x:4,y:0}};
  const object=new THREE.Mesh(new THREE.BoxGeometry(4,3,.2));object.userData={isWall:true,parentWallId:'w'};object.updateMatrixWorld(true);
  const hit={object,point:new THREE.Vector3(2,1,.1),face:{normal:new THREE.Vector3(0,0,1)}};
  assert.equal(directWallFaceHit(hit,[wall]).side,1);
  assert.equal(directWallFaceHit({...hit,face:{normal:new THREE.Vector3(0,0,-1)}},[wall]).side,-1);
  assert.equal(directWallFaceHit({...hit,face:{normal:new THREE.Vector3(1,0,0)}},[wall]),null);
  object.userData.isWall=false;assert.equal(directWallFaceHit(hit,[wall]),null);
  object.geometry.dispose();object.material.dispose();
});

test('explicit face saves on an unmatched outline, preserves openings and survives rebuild',()=>{
  const room={id:'r',name:'Living Room',height:3,points:[{x:.4,y:.4},{x:3.6,y:.4},{x:3.6,y:3},{x:.4,y:3}]};
  const wall={id:'w',start:{x:0,y:0},end:{x:4,y:0},height:3,thickness:.2};
  const segments=[{...wall,parentWallId:'w',end:{x:1,y:0}}, {...wall,parentWallId:'w',start:{x:2,y:0}},
    {...wall,parentWallId:'w',start:{x:1,y:0},end:{x:2,y:0},yOffset:2.2,height:.8}];
  const layout={rooms:[room],walls:[wall]};const controller=createRoomDesignController({scene:new THREE.Scene(),getLayout:()=>layout,getWallSegments:()=>segments,save:()=>true});
  assert.equal(controller.getWallChoices('r').length,0);
  for(const side of [1,-1]){
    const result=controller.apply('r',{roomType:'living',wallPanel:'living-wallPanel-charcoal-louvers',accentWallId:'w',accentWallSide:side});assert.equal(result.ok,true,result.message);
    assert.equal(room.design.accentWallSide,side);
    const surfaces=controller.getWallSurfaces('r');assert.equal(surfaces.length,3);
    assert.ok(surfaces.every(s=>Math.abs(s.start.y-.1*side)<1e-6));
    assert.ok(!surfaces.some(s=>s.start.x<1.5&&s.end.x>1.5&&s.yOffset<1));
    room.design=JSON.parse(JSON.stringify(room.design));controller.rebuild();assert.ok(controller.getGroup('r'));
  }
  controller.destroy();
});
