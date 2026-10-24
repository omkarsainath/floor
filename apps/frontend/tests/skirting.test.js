import test from 'node:test';
import assert from 'node:assert/strict';
import {createWall} from '../src/generators/wall.js';
import {buildWallSegments} from '../src/measurements/modelMeasurements.js';
import {parseLayout} from '../src/loaders/jsonLoader.js';

test('separate skirting dimensions and colour survive layout reload',()=>{
 const wall={id:'wall',start:{x:0,y:0},end:{x:4,y:0},height:3,thickness:.15,skirting:{enabled:true,height:.12,depth:.03,color:'#443322'}};
 const restored=parseLayout(JSON.parse(JSON.stringify({units:'m',walls:[wall],rooms:[],objects:[]})));
 const root=createWall(restored.walls[0]);assert.equal(root.children.length,2);
 for(const child of root.children){assert.equal(child.geometry.parameters.height,.12);assert.equal(child.geometry.parameters.depth,.03);assert.equal(child.material.color.getHexString(),'443322');assert.equal(child.userData.isSkirting,true);}
 assert.equal(createWall({...wall,skirting:{enabled:false}}).children.length,0);
 assert.equal(createWall({...wall,yOffset:2}).children.length,0);
});
test('door lintels have no floating skirting and adjacent wall pieces retain it',()=>{
 const walls=[{id:'wall',start:{x:0,y:0},end:{x:4,y:0},height:3,thickness:.15,skirting:{enabled:true,height:.1}}];
 const openings=[{class:'door',bbox:{x1:1.5,y1:-.1,x2:2.5,y2:.1},sillBase:0,winTop:2.1}];
 const segments=buildWallSegments(walls,openings);
 assert.ok(segments.some(s=>s.yOffset>0));
 for(const s of segments)assert.equal(createWall(s).children.length,s.yOffset>0?0:2);
});

test('tile skirting retains finish and tile width after reload with no overlapping faces',()=>{
 const wall={id:'tiled',start:{x:0,y:0},end:{x:2,y:0},height:3,thickness:.15,skirting:{enabled:true,height:.12,depth:.02,tileId:'lavina-absolute-black',tileWidth:.6}};
 const saved=parseLayout(JSON.parse(JSON.stringify({units:'m',walls:[wall],rooms:[],objects:[]})));
 const root=createWall(saved.walls[0]);
 for(const backing of root.children){
  assert.equal(backing.children.length,4);
  assert.equal(backing.children[0].material.userData.stoneId,'lavina-absolute-black');
  assert.ok(Math.abs(backing.children[0].geometry.parameters.width-.598)<1e-6);
  assert.ok(Math.abs(backing.children.at(-1).geometry.parameters.width-.198)<1e-6);
  for(const tile of backing.children)assert.ok(Math.abs(tile.position.z)-tile.geometry.parameters.depth/2>=backing.geometry.parameters.depth/2-1e-8);
 }
 assert.equal(createWall({...wall,skirting:{...wall.skirting,tileId:'unknown'}}).children[0].children.length,0);
});
