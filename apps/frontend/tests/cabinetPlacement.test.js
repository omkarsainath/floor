import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { snapCabinetPlacement, cabinetPlacementBoxes, cabinetBoxesOverlap } from '../src/generators/cabinetPlacement.js';
import { createWardrobe, WARDROBE_CATALOG, LOFT_CATALOG } from '../src/generators/wardrobe.js';
import { defaultWardrobeConfig, wardrobeConfigFromRoot } from '../src/generators/wardrobeConfig.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const wall={id:'back',start:{x:-3,y:0},end:{x:3,y:0},thickness:.2,height:3};
const item={id:'wardrobe-1',w:1,d:.6,h:2.2};

test('new wardrobes automatically align their back to either wall face without changing dimensions',()=>{
  for(const side of [-1,1]){
    const p=snapCabinetPlacement({x:.4,z:side*.7},item,{walls:[wall]});
    assert.equal(p.valid,true);assert.equal(p.wallId,'back');close(p.z,side*.4);
    close(p.w,1);close(p.d,.6);close(p.h,2.2);close(Math.cos(p.rotation),side);
  }
});
test('corner placement is flush with both wall faces and too-wide cabinets are rejected',()=>{
  const left={id:'left',start:{x:-3,y:0},end:{x:-3,y:3},thickness:.2,height:3};
  const right={...left,id:'right',start:{x:-1,y:0},end:{x:-1,y:3}};
  const p=snapCabinetPlacement({x:-2.6,z:.15},item,{walls:[wall,left,right]});
  assert.equal(p.valid,true);close(p.x,-2.4);close(p.z,.4);
  assert.equal(snapCabinetPlacement({x:-2,z:.15},{...item,w:1.9},{walls:[wall,left,right]}).valid,false);
});
test('adjacent cabinets meet exactly while retaining unequal depths, heights and elevations',()=>{
  const other={x:0,z:.55,y:0,w:1,d:.9,h:2.8,rotation:0,id:'old'};
  for(const side of [-1,1]){
    const p=snapCabinetPlacement({x:side*.95,z:.5},item,{walls:[wall],neighbours:[other]});
    assert.equal(p.valid,true);assert.equal(p.neighbourId,'old');close(p.x,side);close(p.z,.4);
    close(p.y,0);close(p.h,2.2);close(p.d,.6);assert.equal(cabinetBoxesOverlap(p,other),false);
  }
  const loft=snapCabinetPlacement({x:.95,z:.3},{...item,id:'loft-teal-oak-1',elevation:2.2,h:.6,d:.4},{walls:[wall],neighbours:[other]});
  assert.equal(loft.valid,true);close(loft.x,1);close(loft.y,2.2);close(loft.d,.4);close(loft.h,.6);
  assert.equal(other.h,2.8);assert.equal(other.d,.9);
});
test('elevated loft may sit above a wardrobe without being raised by its surface',()=>{
  const other={x:0,z:.4,y:0,w:1,d:.6,h:2.2,rotation:0};
  const p=snapCabinetPlacement({x:0,z:.4},{...item,id:'loft-teal-oak-1',h:.6,elevation:2.2},{walls:[wall],neighbours:[other]});
  assert.equal(p.valid,true);close(p.x,0);close(p.y,2.2);
  assert.equal(snapCabinetPlacement({x:0,z:.4},item,{walls:[wall],neighbours:[other]}).valid,false);
});
test('diagonal walls and neighbouring cabinets use local dimensions instead of world bounding boxes',()=>{
  const diagonal={...wall,start:{x:0,y:0},end:{x:4,y:4}};
  const first=snapCabinetPlacement({x:1,z:1.4},item,{walls:[diagonal]});
  assert.equal(first.valid,true);close(first.rotation,-Math.PI/4);
  const p=snapCabinetPlacement({x:first.x+Math.SQRT1_2*.95,z:first.z+Math.SQRT1_2*.95},item,{walls:[diagonal],neighbours:[{...first,id:'diagonal'}]});
  assert.equal(p.valid,true);assert.equal(p.neighbourId,'diagonal');
  close(Math.hypot(p.x-first.x,p.z-first.z),1);assert.equal(cabinetBoxesOverlap(p,first),false);
});
test('placement boxes ignore open doors and retain independently dimensioned loft and body',()=>{
  const c=defaultWardrobeConfig('wardrobe-1-loft',1,.6);c.loft.width=1.6;c.loft.depth=.8;c.loft.alignment='left';
  const root=createWardrobe('wardrobe-1-loft',1,.6,{wardrobeConfig:c});root.position.set(2,.1,3);root.rotation.y=Math.PI/4;
  const before=cabinetPlacementBoxes([root]);
  root.traverse(n=>{if(n.userData._animProp==='ry')n.rotation.y=n.userData._openState;});
  assert.deepEqual(cabinetPlacementBoxes([root]),before);assert.equal(before.length,2);
  close(before[0].w,1);close(before[1].w,1.6);close(before[1].d,.8);close(before[1].y,2.22);
  const legacy=createWardrobe('wardrobe-1',1,.6,{wardrobeAttachment:{wallId:'back',side:-1}});
  assert.deepEqual(wardrobeConfigFromRoot(legacy).attachment,{wallId:'back',side:-1});
});
test('legacy and editable hinged fronts cover frame edges, keep narrow seams, and open exactly 90 degrees',()=>{
  for(const spec of [...WARDROBE_CATALOG,...LOFT_CATALOG].filter(s=>!s.id.includes('sliding'))){
    for(const editable of [false,true]){
      const root=createWardrobe(spec.id,spec.w,spec.d,editable?{wardrobeConfig:defaultWardrobeConfig(spec.id,spec.w,spec.d)}:{});
      root.updateMatrixWorld(true);const panels=[];
      root.traverse(n=>{
        if(n.userData._animProp==='ry')close(Math.abs(n.userData._openState),Math.PI/2);
        if(!['door-front','drawer-front'].includes(n.name))return;
        const p=n.getWorldPosition(new THREE.Vector3()),[w,h]=n.userData.panelSize;
        panels.push({left:p.x-w/2,right:p.x+w/2,bottom:p.y-h/2,top:p.y+h/2});
      });
      close(Math.min(...panels.map(p=>p.left)),-spec.w/2+.0005);
      close(Math.max(...panels.map(p=>p.right)),spec.w/2-.0005);
      for(const a of panels)for(const b of panels){
        if(a===b)continue;
        const overlapY=Math.min(a.top,b.top)-Math.max(a.bottom,b.bottom),overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left);
        if(overlapY>.01&&b.left>a.right&&b.left-a.right<.1)close(b.left-a.right,.001);
        if(overlapX>.01&&b.bottom>a.top&&b.bottom-a.top<.1)close(b.bottom-a.top,.001);
      }
    }
  }
});
