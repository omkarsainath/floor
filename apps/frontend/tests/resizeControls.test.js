import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const panelCode=source.slice(source.indexOf('function _showObjectPanel(obj) {'),source.indexOf('// ── Wall colour picker'));
const resizeCode=source.slice(source.indexOf('function _resizeEdge(side, delta) {'),source.indexOf('// ── Resize handle system'));

// Exercise the actual panel handlers without starting the WebGL application.
function element(tag){
  return {tag,style:{},children:[],attributes:{},events:{},
    append(...children){this.children.push(...children);},
    appendChild(child){this.children.push(child);},
    setAttribute(key,value){this.attributes[key]=value;},
    addEventListener(key,handler){this.events[key]=handler;},
  };
}
for(const [title,side,opposite] of [
  ['Shrink from back (10 cm)','nz','max'],
  ['Shrink from front (10 cm)','pz','min'],
])test(`${title}: toolbar shrinks the intended edge and persists`,()=>{
  const body=element('body');
  const selectedObject=new THREE.Mesh(new THREE.BoxGeometry(2,1,2));
  selectedObject.position.set(3,.5,4);
  let saves=0;
  const context={THREE,selectedObject,selectionHelper:null,
    document:{getElementById:()=>null,createElement:element,body},
    deleteSelected(){},deselectObject(){},
    _persistResize(obj){assert.equal(obj,selectedObject);saves++;},
  };
  runInNewContext(`${resizeCode}\n${panelCode}\n_showObjectPanel(selectedObject);`,context);
  const panel=body.children[0];
  const button=panel.children.find(child=>child.title===title);
  assert.ok(button,'shrink control is included in the rendered toolbar');
  assert.equal(button.attributes['aria-label'],title);
  const before=new THREE.Box3().setFromObject(selectedObject);
  button.events.click({stopPropagation(){}});
  const after=new THREE.Box3().setFromObject(selectedObject);
  assert.ok(Math.abs((after.max.z-after.min.z)-1.9)<1e-8);
  assert.ok(Math.abs(before[opposite].z-after[opposite].z)<1e-8,'opposite edge stays fixed');
  assert.equal(after.max.x-after.min.x,2,'left/right width is unchanged');
  assert.equal(saves,1,'change uses the existing save path');
  for(let i=0;i<30;i++)button.events.click({stopPropagation(){}});
  const minimum=new THREE.Box3().setFromObject(selectedObject);
  assert.ok(Math.abs((minimum.max.z-minimum.min.z)-.1)<1e-8,'cannot shrink below 10 cm');
});
