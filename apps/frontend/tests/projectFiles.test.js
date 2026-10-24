import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectFile,readProjectFile,openProjectFile,projectFilename,PREVIOUS_PROJECT_KEY} from '../src/state/projectFiles.js';
import {newPlan,addRoom,ROOM_PRESETS,exportPlan,DRAFT_KEY,addWallCut,uncutWallsFor,syncViewer} from '../src/builder/model.js';
const storage=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
const layout=()=>({units:'m',rooms:[],walls:[{id:'wall',start:{x:0,y:0},end:{x:5,y:0},height:3,thickness:.15,faceColors:{inside:'#123456'}}],objects:[{id:'slab',class:'kitchen-pullout-slab',bbox:{x1:1,y1:1,x2:2.8,y2:1.6},rotationY:Math.PI/2,elevation:.1,kitchen:{cabinets:{'bay-1':{finish:{laminateId:'greenlam-example'},profile:{cabinetType:'sink'},accessory:{id:'bin',variantId:'single'}}}},countertopStone:{id:'jet-black'},photoSofaSpec:{referenceImage:'data:image/png;base64,AA=='}}],calibration:{status:'confirmed'},roomDesigns:{room:{floor:'stone'}},customMurals:[{image:'data:image/png;base64,BB=='}]});

test('project backup keeps traced plans with zero rooms, furniture, finishes and embedded images',()=>{
 const original=layout(),backup=createProjectFile(original,'My kitchen',storage()),loaded=readProjectFile(JSON.stringify(backup));
 assert.equal(loaded.layout.rooms.length,0);assert.deepEqual(loaded.layout.objects,original.objects);assert.deepEqual(loaded.layout.walls[0].faceColors,original.walls[0].faceColors);assert.deepEqual(loaded.layout.roomDesigns,original.roomDesigns);assert.deepEqual(loaded.layout.customMurals,original.customMurals);assert.equal(loaded.layout.projectName,'My kitchen');assert.equal(original.projectName,undefined);
});
test('matching 2D source and wall cuts travel with the project and preserve 3D edits on return',()=>{
 const s=storage(),p=newPlan();addRoom(p,ROOM_PRESETS[0]);const w=uncutWallsFor(p)[0];addWallCut(p,w.id,.5,.9);s.setItem(DRAFT_KEY,JSON.stringify(p));const l=exportPlan(p);l.objects=layout().objects;
 const project=createProjectFile(l,'Builder home',s),previous=createProjectFile(layout(),'Earlier',s);openProjectFile(project,previous,s);
 const restored=JSON.parse(s.getItem(DRAFT_KEY)),viewer=JSON.parse(s.getItem('preciseFloorplan'));assert.deepEqual(restored.wallCuts,p.wallCuts);assert.equal(viewer.builder.id,p.id);assert.deepEqual(syncViewer(restored,viewer).objects[0].record.kitchen,l.objects[0].kitchen);
 const other=storage();other.setItem(DRAFT_KEY,JSON.stringify({...p,revision:9}));assert.equal(createProjectFile(l,'No matching draft',other).layout.builder,undefined);
});
test('opening a backup preserves current project for restoration and rejects malformed input before writing',()=>{
 const s=storage(),a=createProjectFile(layout(),'First',s),b=createProjectFile(layout(),'Second',s);b.layout.objects[0].elevation=2;
 openProjectFile(b,a,s);assert.equal(JSON.parse(s.getItem('preciseFloorplan')).objects[0].elevation,2);assert.equal(readProjectFile(s.getItem(PREVIOUS_PROJECT_KEY)).name,'First');
 const previous=s.getItem('preciseFloorplan');assert.throws(()=>openProjectFile({format:'ai-3d-project',version:1,layout:{}},b,s));assert.equal(s.getItem('preciseFloorplan'),previous);
 openProjectFile(readProjectFile(s.getItem(PREVIOUS_PROJECT_KEY)),b,s);assert.equal(JSON.parse(s.getItem('preciseFloorplan')).projectName,'First');assert.equal(readProjectFile(s.getItem(PREVIOUS_PROJECT_KEY)).name,'Second');
 const bad=structuredClone(b);bad.layout.walls[0].start.x='not a number';assert.throws(()=>readProjectFile(bad),/finite/);assert.throws(()=>readProjectFile({...b,version:5}));
});
test('failed storage write restores current project instead of reporting success',()=>{
 const s=storage(),a=createProjectFile(layout(),'Before',s),b=createProjectFile(layout(),'After',s);s.setItem('preciseFloorplan',JSON.stringify(a.layout));s.setItem('floorplanTimestamp','old');const before=s.getItem('preciseFloorplan');let writes=0;
 const failing={...s,setItem:(key,value)=>{if(++writes===3)throw Error('Quota exceeded');s.setItem(key,value);}};
 assert.throws(()=>openProjectFile(b,a,failing),/storage/);assert.equal(s.getItem('preciseFloorplan'),before);assert.equal(s.getItem('floorplanTimestamp'),'old');assert.equal(s.getItem(PREVIOUS_PROJECT_KEY),null);
});
test('backup filenames are safe and retain meaningful names',()=>{
 assert.equal(projectFilename('My Home'),'My-Home.project.json');assert.equal(projectFilename('../'),'my-home.project.json');assert.ok(!projectFilename('Home/../../test').includes('/'));
});
