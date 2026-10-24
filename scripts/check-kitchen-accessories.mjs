// Isolated browser regression check. Requires installed Google Chrome on macOS.
// Starts its own Vite server; never reads or writes the user's browser profile.
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
const profile=await mkdtemp('/private/tmp/kitchen-browser-');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','apps/frontend','--host','127.0.0.1','--port','5189','--strictPort'],{stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{let output='';server.stdout.on('data',b=>{output+=b;if(output.includes('5189'))resolve();});server.on('exit',code=>reject(new Error(`Vite exited: ${code}`)));setTimeout(()=>reject(new Error('Vite startup timed out')),15000).unref();});
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank']);
const deadline=setTimeout(()=>{chrome.kill('SIGTERM');server.kill('SIGTERM');process.exit(2);},300000);
let ws; const errors=[];
try{
 const endpoint=await new Promise((resolve,reject)=>{let output='';chrome.stderr.on('data',b=>{output+=b;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.on('error',reject);chrome.on('exit',c=>reject(new Error(`Chrome exited: ${c}`)));});
 ws=new WebSocket(endpoint);await new Promise(r=>ws.onopen=r);
 let seq=0;const pending=new Map(),failedAssets=[];
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Network.responseReceived'&&m.params.response.url.includes('/catalog/greenlam/')&&m.params.response.status>=400)failedAssets.push(m.params.response.url);};
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await call('Target.createTarget',{url:'about:blank'}),{sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
 const c=(m,p={})=>call(m,p,sessionId);
 const evaluate=async expression=>{const r=await c('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const ready=async expression=>{for(let i=0;i<50;i++){if(await evaluate(expression))return;await pause(200);}throw new Error('Page did not become ready');};
 const shot=async name=>{const s=await c('Page.captureScreenshot',{format:'png'});await writeFile(`/private/tmp/${name}.png`,Buffer.from(s.data,'base64'));};
 await c('Page.enable');await c('Runtime.enable');await c('Network.enable');await c('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
 await c('Page.navigate',{url:'http://127.0.0.1:5189/tests/kitchen-accessories-preview.html'});
 await ready(`document.body.dataset.ready==='true'`);
 console.log('Kitchen studio loaded.');
 await evaluate(`document.querySelector('#operate').click()`);await ready(`window.__kitchenPreview.accessoryModel(window.__kitchenPreview.root,'bay-1').userData.openProgress>.995`);
 await shot('kitchen-bottle-open');
 for(const id of ['concept-corner','concept-cutlery','concept-waste-2','concept-wicker-3','concept-pantry','concept-spice','concept-bottle-3']){
   console.log(await evaluate(`(()=>{const select=document.querySelector('#model');select.value='${id}';select.dispatchEvent(new Event('change'));document.querySelector('#operate').click();return {product:'${id}',installed:!!window.__kitchenPreview.accessoryModel(window.__kitchenPreview.root,'bay-1')};})()`));
   await ready(`window.__kitchenPreview.accessoryModel(window.__kitchenPreview.root,'bay-1')?.userData.openProgress>.995`);await shot(id);
 }
 await evaluate(`document.querySelector('#model').value='concept-bottle-2';document.querySelector('#model').dispatchEvent(new Event('change'));`);
 await ready(`(()=>{const img=document.querySelector('[data-laminate-id="gl-175-arn"] img');return img?.complete&&img.naturalWidth>0;})()`);
 console.log(await evaluate(`(()=>{
 const p=document.querySelector('#kitchen-accessories-panel'),field=n=>p.querySelector('[data-field="'+n+'"]'),btn=n=>p.querySelector('[data-action="'+n+'"]');
 const {root,kitchenState,accessoryModel}=window.__kitchenPreview;
 p.querySelector('[data-laminate-id="gl-175-arn"]').click();
 let a=kitchenState(root).cabinets['bay-1'].accessory;if(a.laminateMode!=='OVERRIDE'||a.selectedLaminateId!=='gl-175-arn')throw new Error('Override failed');
 field('scope').value='all';p.querySelector('[data-laminate-id="gl-5675-sgl"]').click();
 if(accessoryModel(root,'bay-1').getObjectByName('laminate-front').material.userData.laminateId!=='gl-175-arn')throw new Error('Override followed kitchen');
 btn('reset').click();if(accessoryModel(root,'bay-1').getObjectByName('laminate-front').material.userData.laminateId!=='gl-5675-sgl')throw new Error('Reset failed');
 btn('undo').click();if(kitchenState(root).cabinets['bay-1'].accessory.laminateMode!=='OVERRIDE')throw new Error('Undo failed');
 btn('redo').click();btn('save').click();
 const before=kitchenState(root);btn('remove').click();if(accessoryModel(root,'bay-1'))throw new Error('Remove failed');btn('undo').click();
 if(JSON.stringify(before)!==JSON.stringify(kitchenState(root)))throw new Error('Removal undo failed');
 btn('preview').click();btn('cancel').click();if(JSON.stringify(before)!==JSON.stringify(kitchenState(root)))throw new Error('Preview mutated saved state');
 return {overrides:true,inheritance:true,undoRedo:true,removeRestore:true,previewCancel:true};
 })()`));
 await c('Page.reload');await ready(`document.body.dataset.ready==='true'`);
 console.log(await evaluate(`(()=>{const {root,kitchenState}=window.__kitchenPreview;if(kitchenState(root).cabinets['bay-1'].accessory.laminateMode!=='INHERIT'||kitchenState(root).cabinets['bay-1'].finish.laminateId!=='gl-5675-sgl')throw new Error('Reload failed');return {reload:true};})()`));
 console.log(await evaluate(`(async()=>{
 const {createObject}=await import('/src/generators/object.js');
 const {showKitchenAccessories}=await import('/src/ui/kitchenAccessoriesPanel.js');
 const {applyKitchenState,kitchenState,accessoryModel}=await import('/src/kitchen/system.js');
 const {THREE}=window.__kitchenPreview;
 const root=createObject({id:'bare-slab',class:'kitchen-slab',source:'catalog',bbox:{x1:-.9,x2:.9,y1:-.3,y2:.3}});
 applyKitchenState(root,{cabinets:{'bay-1':{profile:{confirmed:true}}}});
 const wall=new THREE.Mesh(new THREE.BoxGeometry(.15,3,2),new THREE.MeshBasicMaterial());wall.position.set(-.975,1.5,0);
 const door=createObject({class:'door',bbox:{x1:.97,x2:1.03,y1:-.3,y2:.7}});door.visible=false;
 let saved=0;
 const panel=showKitchenAccessories({roots:[root],getObstacles:()=>[wall,door],onSave:()=>{saved++;return true;}});
 const button=name=>panel.querySelector('[data-action="'+name+'"]'),status=panel.querySelector('[role="status"]');
 button('install').click();
 if(!accessoryModel(root,'bay-1')||saved!==1)throw new Error('Flush-wall installation failed: '+status.textContent);
 wall.visible=false;
 for(const angle of [.01,.37]){
   button('remove').click();root.rotation.y=angle;button('install').click();
   if(!accessoryModel(root,'bay-1')||!status.textContent.includes('saved'))throw new Error('Rotated slab installation failed: '+status.textContent);
   button('open').click();
   if(kitchenState(root).cabinets['bay-1'].accessory.openingState!==1)throw new Error('Rotated slab opening failed: '+status.textContent);
 }
 root.rotation.y=0;door.visible=true;
 button('remove').click();
 const beforePreviewSave=saved;
 button('preview').click();
 if(!accessoryModel(root,'bay-1')||!status.textContent.startsWith('Preview only.'))throw new Error('Preview beside door failed: '+status.textContent);
 if(saved!==beforePreviewSave)throw new Error('Preview saved unexpectedly');
 button('cancel').click();if(accessoryModel(root,'bay-1'))throw new Error('Door preview cancellation failed');
 button('install').click();if(!accessoryModel(root,'bay-1')||!status.textContent.includes('saved'))throw new Error('Installation beside door failed: '+status.textContent);
 button('open').click();if(kitchenState(root).cabinets['bay-1'].accessory.openingState!==1)throw new Error('Opening beside door failed');
 button('remove').click();door.position.x-=.12;
 button('preview').click();
 if(accessoryModel(root,'bay-1')||!status.textContent.includes('door panel'))throw new Error('Real door collision was not blocked: '+status.textContent);
 door.visible=false;wall.visible=true;
 button('remove').click();
 wall.position.set(0,1.5,.68);wall.geometry.dispose();wall.geometry=new THREE.BoxGeometry(3,3,.08);
 button('install').click();
 if(!accessoryModel(root,'bay-1')||!status.textContent.includes('Installed and saved closed'))throw new Error('Closed installation with blocked full opening failed: '+status.textContent);
 button('open').click();
 if(!status.textContent.includes('blocked')||kitchenState(root).cabinets['bay-1'].accessory.openingState!==0)throw new Error('Blocked movement was allowed');
 const before=kitchenState(root);wall.position.z=.3;panel.scrollTop=panel.scrollHeight;
 button('install').click();
 if(!status.textContent.includes('Cannot install in the closed position'))throw new Error('Closed collision was not explained');
 if(JSON.stringify(before)!==JSON.stringify(kitchenState(root)))throw new Error('Failed replacement changed saved installation');
 const a=status.getBoundingClientRect(),b=panel.getBoundingClientRect();
 if(a.top<b.top||a.bottom>b.bottom)throw new Error('Installation failure is outside visible panel');
 panel.close();wall.geometry.dispose();wall.material.dispose();
 return {flushWallInstallation:true,rotatedSlabInstallation:true,rotatedSlabOpening:true,previewBesideDoor:true,installBesideDoor:true,realDoorBlocked:true,blockedOpeningWarning:true,blockedMotionGuard:true,failedReplacementRestored:true,visibleFailure:true};
 })()`));
 ws.addEventListener('message',async({data})=>{
   const event=JSON.parse(data);if(event.method!=='Fetch.requestPaused')return;
   const {requestId}=event.params;
   try{
     const response=await c('Fetch.getResponseBody',{requestId});
     const source=response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body;
     const hook='\nwindow.__kitchenViewer={scene,camera,renderer,controls,selectableMeshes,selectObject};';
     await c('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(source+hook).toString('base64')});
   }catch(error){errors.push(String(error));await c('Fetch.continueRequest',{requestId});}
 });
 await c('Fetch.enable',{patterns:[{urlPattern:'*/src/main.js*',requestStage:'Response'}]});
 // Exercise the real viewer entry point with an isolated saved floor plan.
 await evaluate(`localStorage.setItem('preciseFloorplan',JSON.stringify({units:'m',walls:[],rooms:[],objects:[{id:'viewer-kitchen',class:'kitchen-base-cabinet',source:'catalog',bbox:{x1:-.23,x2:.23,y1:-.32,y2:.32},objectHeightM:1,kitchen:window.__kitchenPreview.kitchenState(window.__kitchenPreview.root)}]}));localStorage.setItem('floorplanTimestamp',String(Date.now()));`);
 await c('Page.navigate',{url:'http://127.0.0.1:5189/index.html'});
 await ready(`!!document.querySelector('#kitchen-accessories-button')`);await pause(1500);
 await evaluate(`document.querySelector('#kitchen-accessories-button').click()`);
 await ready(`!!document.querySelector('#kitchen-accessories-panel [data-field="cabinet"]')`);
 console.log(await evaluate(`(()=>{const p=document.querySelector('#kitchen-accessories-panel');p.querySelector('[data-action="open"]').click();if(!p.querySelector('[role="status"]').textContent.includes('saved'))throw new Error('Viewer open/save failed: '+p.querySelector('[role="status"]').textContent);p.querySelector('[data-action="inspect"]').click();return {viewerIntegration:true};})()`));
 await pause(1500);await shot('kitchen-actual-viewer');
 const point=await evaluate(`(()=>{
 const v=window.__kitchenViewer,root=v.selectableMeshes.find(r=>r.userData.isKitchenCabinet);
 document.querySelector('#kitchen-accessories-panel').close();
 const handle=root.getObjectByName('accessory-handle'),p=handle.getWorldPosition(v.camera.position.clone()).project(v.camera);
 return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
 })()`);
 await c('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
 await c('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
 await c('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
 console.log(await evaluate(`(()=>{const root=window.__kitchenViewer.selectableMeshes.find(r=>r.userData.isKitchenCabinet);if(root.userData.kitchen.cabinets['bay-1'].accessory.openingState!==0)throw new Error('3D handle click did not close the accessory');document.querySelector('#kitchen-accessories-button').click();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete'}));if(window.__kitchenViewer.selectableMeshes.length!==1)throw new Error('Editor Delete guard failed');return {handleRayPick:true,keyboardGuard:true};})()`));
 await c('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(400);
 console.log(await evaluate(`(()=>{const rect=document.querySelector('#kitchen-accessories-panel').getBoundingClientRect();if(rect.left<0||rect.right>innerWidth+1)throw new Error('Mobile panel overflow');return {mobile:true};})()`));
 await c('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
 await evaluate(`(()=>{
 document.querySelector('#kitchen-accessories-panel').close();
 document.querySelector('#catalog-toggle-btn').click();
 [...document.querySelectorAll('button')].find(b=>b.textContent==='🍳 Kitchen').click();
 const card=document.querySelector('[data-item-id="kitchen-pullout-slab"]');
 if(!card||!card.textContent.includes('Slab with Pull-outs'))throw new Error('Prefab catalog card missing');card.click();
 const v=window.__kitchenViewer;v.camera.position.set(4,3,5);v.controls.target.set(2,0,1);v.controls.update();
 })()`);
 await pause(500);
 const placement=await evaluate(`(()=>{const v=window.__kitchenViewer,p=v.camera.position.clone().set(2,0,1).project(v.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};})()`);
 await c('Input.dispatchMouseEvent',{type:'mouseMoved',...placement});await pause(200);
 await c('Input.dispatchMouseEvent',{type:'mousePressed',...placement,button:'left',clickCount:1});
 await c('Input.dispatchMouseEvent',{type:'mouseReleased',...placement,button:'left',clickCount:1});
 console.log(await evaluate(`(()=>{
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));document.querySelector('#catalog-toggle-btn').click();
 const v=window.__kitchenViewer,root=v.selectableMeshes.find(r=>r.userData.objectType==='kitchen-pullout-slab');
 if(!root)throw new Error('Catalog placement failed');
 const saved=JSON.parse(localStorage.getItem('preciseFloorplan')).objects.find(o=>o.id===root.userData.layoutId);
 if(Object.keys(saved?.kitchen?.cabinets||{}).length!==3)throw new Error('Placed prefab state was not saved');
 v.selectObject(root);document.querySelector('#kitchen-accessories-button').click();
 const panel=document.querySelector('#kitchen-accessories-panel');
 for(const id of ['bay-1','bay-2','bay-3']){panel.selectCabinet(root,id);panel.querySelector('[data-action="open"]').click();if(root.userData.kitchen.cabinets[id].accessory.openingState!==1)throw new Error('Prefab opening failed: '+panel.querySelector('[role="status"]').textContent);}
 v.camera.position.copy(root.position).add(v.camera.position.clone().set(2.2,1.8,3));v.controls.target.copy(root.position).add(v.camera.position.clone().set(0,.45,0));v.controls.update();
 return {catalogPlacement:true,prefabSaved:true,threeIndependentPullouts:true};
 })()`));
 await pause(1500);await shot('kitchen-catalog-pullouts');
 console.log(await evaluate(`(()=>{
 const root=window.__kitchenViewer.selectableMeshes.find(r=>r.userData.objectType==='kitchen-pullout-slab'),p=document.querySelector('#kitchen-accessories-panel');
 const field=n=>p.querySelector('[data-field="'+n+'"]'),button=n=>p.querySelector('[data-action="'+n+'"]');
 p.selectCabinet(root,'bay-1');field('category').value='spice';field('category').dispatchEvent(new Event('change'));button('install').click();
 if(root.userData.kitchen.cabinets['bay-1'].accessory.productModelId!=='concept-spice')throw new Error('Prefab replacement failed');
 p.selectCabinet(root,'bay-2');button('remove').click();if(root.userData.kitchen.cabinets['bay-2'].accessory)throw new Error('Prefab removal failed');
 p.selectCabinet(root,'bay-3');p.querySelector('[data-laminate-id="gl-175-arn"]').click();
 if(root.userData.kitchen.cabinets['bay-3'].accessory.selectedLaminateId!=='gl-175-arn')throw new Error('Prefab finish failed');
 return {prefabReplacement:true,prefabRemoval:true,prefabFinish:true};
 })()`));
 await c('Page.reload');await ready(`!!window.__kitchenViewer?.selectableMeshes?.some(r=>r.userData.objectType==='kitchen-pullout-slab')`);
 console.log(await evaluate(`(()=>{
 const root=window.__kitchenViewer.selectableMeshes.find(r=>r.userData.objectType==='kitchen-pullout-slab'),b=root.userData.kitchen.cabinets;
 if(b['bay-1'].accessory.productModelId!=='concept-spice'||b['bay-2'].accessory||b['bay-3'].accessory.selectedLaminateId!=='gl-175-arn')throw new Error('Prefab edits did not survive reload');
 return {prefabReload:true};
 })()`));
 await evaluate(`(()=>{
 const v=window.__kitchenViewer,root=v.selectableMeshes.find(r=>r.userData.objectType==='kitchen-pullout-slab');
 v.selectObject(root);document.querySelector('#kitchen-accessories-button').click();
 const p=document.querySelector('#kitchen-accessories-panel');p.selectCabinet(root,'bay-3');p.querySelector('[data-action="shut"]').click();
 p.selectCabinet(root,'bay-1');const category=p.querySelector('[data-field="category"]');category.value='wicker';category.dispatchEvent(new Event('change'));
 p.querySelector('[data-field="product"]').value='concept-wicker-2';p.querySelector('[data-action="install"]').click();
 if(root.userData.kitchen.cabinets['bay-1'].accessory.productModelId!=='concept-wicker-2')throw new Error('Wicker click fixture installation failed');
 p.close();v.camera.position.copy(root.position).add(v.camera.position.clone().set(0,1.4,3.2));v.controls.target.copy(root.position).add(v.camera.position.clone().set(0,.45,0));v.controls.update();
 })()`);
 await pause(1200);
 const clickDrawer=async index=>{
   const point=await evaluate(`(async()=>{
     const {accessoryModel}=await import('/src/kitchen/system.js'),v=window.__kitchenViewer,root=v.selectableMeshes.find(r=>r.userData.objectType==='kitchen-pullout-slab');
     const handle=accessoryModel(root,'bay-1').userData.kitchenModel.moving[${index}].getObjectByName('accessory-handle');root.updateWorldMatrix(true,true);
     const p=handle.getWorldPosition(v.camera.position.clone()).project(v.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
   })()`);
   await c('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await c('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await c('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
 };
 const drawerState=`window.__kitchenViewer.selectableMeshes.find(r=>r.userData.objectType==='kitchen-pullout-slab').userData.kitchen.cabinets['bay-1'].accessory.tierStates`;
 await clickDrawer(0);await ready(`JSON.stringify(${drawerState})==='[1,0]'`);await pause(1200);
 await clickDrawer(1);await ready(`JSON.stringify(${drawerState})==='[1,1]'`);await pause(1200);
 await clickDrawer(0);await ready(`JSON.stringify(${drawerState})==='[0,1]'`);await pause(1200);
 console.log(await evaluate(`(()=>{
 const v=window.__kitchenViewer,root=v.selectableMeshes.find(r=>r.userData.objectType==='kitchen-pullout-slab');
 const saved=JSON.parse(localStorage.getItem('preciseFloorplan')).objects.find(o=>o.id===root.userData.layoutId);
 if(JSON.stringify(saved.kitchen.cabinets['bay-1'].accessory.tierStates)!=='[0,1]')throw new Error('Independent drawer clicks not saved');
 document.querySelector('#kitchen-accessories-button').click();const p=document.querySelector('#kitchen-accessories-panel');p.selectCabinet(root,'bay-1');
 const tier=p.querySelector('[data-field="tier"]'),slider=p.querySelector('[data-field="opening"][type="range"]');tier.value='1';tier.dispatchEvent(new Event('change'));
 if(slider.value!=='100')throw new Error('Selected drawer slider mismatch');p.querySelector('[data-action="shut"]').click();
 if(tier.value!=='1'||slider.value!=='0')throw new Error('Drawer selector reset after operation');
 p.querySelector('[data-action="open"]').click();if(JSON.stringify(root.userData.kitchen.cabinets['bay-1'].accessory.tierStates)!=='[0,1]')throw new Error('Panel operated the wrong drawer');
 return {independentHandleClicks:true,independentClickSaving:true,drawerSelectionPreserved:true};
 })()`));
 await shot('kitchen-independent-drawer');
 console.log('JS exceptions:',JSON.stringify(errors),'Failed Greenlam requests:',JSON.stringify(failedAssets));
 if(errors.length||failedAssets.length)process.exitCode=1;
}catch(error){console.log('Captured browser errors:',JSON.stringify(errors));throw error;}finally{ws?.close();chrome.kill('SIGTERM');server.kill('SIGTERM');clearTimeout(deadline);}
