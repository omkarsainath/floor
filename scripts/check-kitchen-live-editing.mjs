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

 await c('Page.removeScriptToEvaluateOnNewDocument',{identifier:seed.identifier});
 console.log('Live edit viewer loaded.');
 console.log(await evaluate(`(async()=>{
 const sys=await import('/src/kitchen/system.js'),v=window.__kitchenViewer,root=v.selectableMeshes.find(r=>r.userData.objectType==='kitchen-pullout-slab');
 v.selectObject(root);document.querySelector('#kitchen-accessories-button').click();
 const p=document.querySelector('#kitchen-accessories-panel');p.selectCabinet(root,'bay-1');
 const assert=(v,m)=>{if(!v)throw new Error(m)},near=(a,b)=>Math.abs(a-b)<.00001;
 const field=k=>p.querySelector('input[type="number"][data-field="'+k+'"]');
 const enter=(k,value)=>{const i=field(k);i.focus();i.value=value;i.dispatchEvent(new Event('input'));};
 const current=()=>sys.cabinetList(root)[0],state=()=>sys.kitchenState(root),saved=()=>JSON.parse(localStorage.getItem('preciseFloorplan')).objects.find(o=>o.id===root.userData.layoutId);
 const original=current().width,neighbor=sys.cabinetList(root)[1].width;
 p.querySelector('details').open=true;
 enter('width','');assert(near(current().width,original),'Empty draft resized model');
 enter('width','7');assert(near(current().width,original),'Incomplete draft resized model');
 enter('width','650');assert(near(current().width,.65),'Width did not apply on input');
 enter('width','700');assert(near(current().width,.7),'Second width edit did not apply');
 assert(document.activeElement===field('width')&&p.querySelector('details').open,'Editing lost focus or collapsed measurements');
 assert(near(sys.cabinetList(root)[1].width,neighbor),'Neighbor resized');
 assert(near(saved().kitchen.sectionSizes[0].width,.736),'Resize not autosaved');
 p.querySelector('[data-action="undo"]').click();assert(near(current().width,original),'Undo did not group typing');
 p.querySelector('[data-action="redo"]').click();assert(near(current().width,.7),'Redo did not restore size');
 enter('height','800');assert(near(current().height,.8),'Height not immediate');
 enter('depth','650');assert(near(current().depth,.65),'Depth not immediate');
 enter('boardThickness','20');assert(near(current().boardThickness,.02),'Board thickness not immediate');
 const before=JSON.stringify(state());enter('width','150');assert(JSON.stringify(state())===before,'Invalid fit altered state');
 assert(field('width').value==='150'&&p.querySelector('[data-measurement-status]').textContent.includes('Needs'),'Invalid draft feedback missing');
 enter('width','700');
 const category=p.querySelector('[data-field="category"]');category.value='wicker';category.dispatchEvent(new Event('change'));
 assert(current().accessory.productModelId==='concept-wicker-2','Category did not auto install');
 p.querySelector('[data-laminate-id]').click();const laminate=current().accessory.laminate.laminateId;
 const grain=p.querySelector('[data-field="grain"]');grain.value='90';grain.dispatchEvent(new Event('change'));
 assert(current().accessory.laminate.rotation===90,'Grain did not update');
 const product=p.querySelector('[data-field="product"]');product.value='concept-wicker-3';product.dispatchEvent(new Event('change'));
 assert(current().accessory.productModelId==='concept-wicker-3','Configuration did not auto install');
 assert(current().accessory.laminate.laminateId===laminate&&current().accessory.laminate.rotation===90,'Replacement lost finish');
 category.value='pantry';category.dispatchEvent(new Event('change'));
 assert(current().accessory.productModelId==='concept-wicker-3','Incompatible selection replaced model');
 const tier=p.querySelector('[data-field="tier"]');tier.value='1';tier.dispatchEvent(new Event('change'));
 const slider=p.querySelector('input[type="range"][data-field="opening"]');slider.value='35';slider.dispatchEvent(new Event('input'));
 assert(JSON.stringify(current().accessory.tierStates)==='[0,0.35,0]','Slider moved other drawers');
 const moving=sys.accessoryModel(root,'bay-1').userData.kitchenModel.moving;
 assert(moving[1].position.z>moving[0].position.z,'Slider geometry not immediate');
 window.liveExpected=JSON.stringify(saved().kitchen);
 window.liveHelpers={sys,v,root,p,assert,near,field,enter,current,state,saved};
 p.selectCabinet(root,'bay-2');assert(near(Number(field('width').value)/1000,neighbor),'Section switch kept old draft');
 p.selectCabinet(root,'bay-1');p.querySelector('details').open=true;
 v.camera.position.copy(root.position).add(v.camera.position.clone().set(2,1.8,3.2));v.controls.target.copy(root.position).add(v.camera.position.clone().set(0,.45,0));v.controls.update();
 return {liveDimensions:true,focusPreserved:true,undoRedo:true,automaticReplacement:true,finishRetained:true,independentSlider:true,invalidEditRollback:true};
 })()`));
 const expected=await evaluate('window.liveExpected');
 await shot('kitchen-live-editing');
 await c('Page.reload');
 await ready(`!!window.__kitchenViewer?.selectableMeshes?.some(r=>r.userData.objectType==='kitchen-pullout-slab')`);
 console.log(await evaluate(`(async()=>{
 const sys=await import('/src/kitchen/system.js'),root=window.__kitchenViewer.selectableMeshes.find(r=>r.userData.objectType==='kitchen-pullout-slab');
 if(JSON.stringify(sys.kitchenState(root))!==${JSON.stringify(expected)})throw new Error('Reload changed saved geometry or accessory state');
 const c=sys.cabinetList(root)[0];if(Math.abs(c.width-.7)>.00001||Math.abs(c.height-.796)>.00001||Math.abs(c.depth-.646)>.00001)throw new Error('Reload did not retain physical dimensions');
 return {reloadGeometry:true,reloadAccessoryAndFinish:true};
 })()`));
 console.log('JS exceptions:',JSON.stringify(errors),'Failed Greenlam requests:',JSON.stringify(failedAssets));
 if(errors.length||failedAssets.length)process.exitCode=1;
}catch(error){console.log('Captured browser errors:',JSON.stringify(errors));throw error;}finally{ws?.close();chrome.kill('SIGTERM');server.kill('SIGTERM');clearTimeout(deadline);}
