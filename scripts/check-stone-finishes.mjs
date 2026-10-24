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
 const seed=await c('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('preciseFloorplan',JSON.stringify({units:'m',walls:[],rooms:[],objects:[{id:'drawer-test',class:'kitchen-pullout-slab',source:'catalog',bbox:{x1:-.9,x2:.9,y1:-.3,y2:.3}}]}));localStorage.setItem('floorplanTimestamp',String(Date.now()));`});
 await c('Page.navigate',{url:'http://127.0.0.1:5189/index.html'});
 await ready(`!!window.__kitchenViewer?.selectableMeshes?.some(r=>r.userData.objectType==='kitchen-pullout-slab')`);


 await evaluate(`(async()=>{
 const sys=await import('/src/kitchen/system.js'),v=window.__kitchenViewer,r=v.selectableMeshes.find(r=>r.userData.objectType==='kitchen-pullout-slab');
 const s=sys.kitchenState(r);delete s.cabinets['bay-2'].accessory;s.cabinets['bay-2'].profile.type='sink';sys.applyKitchenState(r,s);
 v.selectObject(r);document.querySelector('#kitchen-accessories-button').click();
 const initialPanel=document.querySelector('#kitchen-accessories-panel');initialPanel.selectCabinet(r,'bay-2');
 initialPanel.querySelector('[data-action="laminate-tab"]').click();
 initialPanel.querySelector('[data-laminate-id]').click();
 if(!sys.kitchenState(r).cabinets['bay-2'].finish)throw new Error('Bare sink cabinet colour did not apply');
 const cat=initialPanel.querySelector('[data-field="category"]');cat.value='waste';cat.dispatchEvent(new Event('change'));
 if(!sys.accessoryModel(r,'bay-2'))throw new Error('Sink bin not installed');
 initialPanel.selectCabinet(r,'bay-1');initialPanel.querySelector('[data-action="granite-tab"]').click();

 const panel=document.querySelector('#kitchen-accessories-panel');panel.querySelector('[data-stone-id="lavina-black-galaxy"]').click();
 if(sys.kitchenState(r).cabinets['bay-2'].counterStone!=='lavina-black-galaxy')throw new Error('Counter selection not applied');
 const saved=JSON.parse(localStorage.getItem('preciseFloorplan')).objects[0];if(saved.kitchen.cabinets['bay-2'].counterStone!=='lavina-black-galaxy')throw new Error('Counter not saved');
 const stonePanel=panel.querySelector('[aria-label="Granite and marble for slab tops"]'),laminatePanel=panel.querySelector('[aria-label="Laminate for cabinet fronts and sides"]');
 if(stonePanel.hidden||!laminatePanel.hidden)throw new Error('Material surfaces are not separated');
 panel.querySelector('[data-action="laminate-tab"]').click();
 if(!stonePanel.hidden||laminatePanel.hidden)throw new Error('Laminate tab did not switch');
 panel.querySelector('[data-laminate-id]').click();
 if(sys.kitchenState(r).cabinets['bay-1'].counterStone!=='lavina-black-galaxy')throw new Error('Laminate changed countertop stone');
 const laminate=JSON.stringify(sys.kitchenState(r).cabinets['bay-1'].finish);
 panel.querySelector('[data-action="granite-tab"]').click();panel.querySelector('[data-stone-id="lavina-river-white"]').click();
 if(JSON.stringify(sys.kitchenState(r).cabinets['bay-1'].finish)!==laminate)throw new Error('Stone changed cabinet laminate');
 panel.querySelector('[data-stone-id="lavina-black-galaxy"]').click();
 const scope=panel.querySelector('[data-field="scope"]');scope.value='multiple';scope.dispatchEvent(new Event('change'));
 const beforeBatch=JSON.stringify(sys.kitchenState(r));
 for(const id of ['bay-1','bay-3'])panel.querySelector('[data-laminate-target="0:'+id+'"]').click();
 const batchSwatch=panel.querySelector('[data-laminate-id]');batchSwatch.click();
 const batch=sys.kitchenState(r),before=JSON.parse(beforeBatch);
 for(const id of ['bay-1','bay-3'])if(batch.cabinets[id].finish?.laminateId!==batchSwatch.dataset.laminateId)throw new Error('Batch laminate missing '+id);
 if(JSON.stringify(batch.cabinets['bay-2'])!==JSON.stringify(before.cabinets['bay-2']))throw new Error('Batch changed unselected section');
 panel.querySelector('[data-action="undo"]').click();
 if(JSON.stringify(sys.kitchenState(r))!==beforeBatch)throw new Error('Batch undo failed');
 panel.close();
 const {createWardrobe}=await import('/src/generators/wardrobe.js');
 const {updateWardrobeFinishes}=await import('/src/generators/wardrobeFinishes.js');
 const {showWardrobeFinishEditor}=await import('/src/ui/wardrobeFinishEditor.js');
 const wardrobe=createWardrobe('wardrobe-3-loft',1.8,.6);let saves=0;
 const editor=showWardrobeFinishEditor({root:wardrobe,onChange:next=>{saves++;updateWardrobeFinishes(wardrobe,next);},onHighlight:()=>{},onToggle:()=>{},onClose:()=>{}});
 const ws=editor.querySelector('[data-field="scope"]');ws.value='multiple';ws.dispatchEvent(new Event('change'));
 const ids=wardrobe.userData.wardrobeSurfaces.filter(p=>['Main doors','Loft doors','Drawer fronts'].includes(p.group)).map(p=>p.id).filter((_,i)=>i%2===0);
 if(ids.length<2)throw new Error('Insufficient wardrobe targets');
 for(const id of ids)editor.querySelector('[data-laminate-target="'+id+'"]').click();
 editor.querySelector('[data-laminate-id]').click();
 if(saves!==1||Object.keys(wardrobe.userData.wardrobeFinishes).length!==ids.length||ids.some(id=>!wardrobe.userData.wardrobeFinishes[id]))throw new Error('Wardrobe batch wrong');
 editor.querySelector('[data-action="undo"]').click();
 if(Object.keys(wardrobe.userData.wardrobeFinishes).length)throw new Error('Wardrobe batch undo failed');
 editor.querySelector('[data-action="close"]').click();
 const {buildRoomFinish}=await import('/src/design/finishGeometry.js'),{getFinishStyle}=await import('/src/design/roomDesignCatalog.js');
 const floor=buildRoomFinish({room:{id:'stone-floor',points:[{x:-2,y:-1.5},{x:2,y:-1.5},{x:2,y:2},{x:-2,y:2}]},selection:{roomType:'kitchen',floor:'floor-lavina-river-white'},styleLookup:getFinishStyle});
 v.scene.add(floor);v.camera.position.set(1.4,2.4,2.5);v.controls.target.set(0,.65,0);v.controls.update();
 window.stoneMaps=[];v.scene.traverseVisible(n=>{if(n.material?.userData.stoneId)window.stoneMaps.push(n.material.map);});
 })()`);
 await ready('window.stoneMaps?.length>=4&&window.stoneMaps.every(m=>m?.image?.complete&&m.image.naturalWidth>0)');
 await pause(700);await shot('stone-counter-and-floor');
 console.log('Stone textures loaded; selection saved. Browser errors:',JSON.stringify(errors));if(errors.length)process.exitCode=1;
}catch(error){throw error;}finally{ws?.close();chrome.kill('SIGTERM');server.kill('SIGTERM');clearTimeout(deadline);}
