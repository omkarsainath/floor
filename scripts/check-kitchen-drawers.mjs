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
 await c('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('preciseFloorplan',JSON.stringify({units:'m',walls:[],rooms:[],objects:[{id:'drawer-test',class:'kitchen-pullout-slab',source:'catalog',bbox:{x1:-.9,x2:.9,y1:-.3,y2:.3}}]}));localStorage.setItem('floorplanTimestamp',String(Date.now()));`});
 await c('Page.navigate',{url:'http://127.0.0.1:5189/index.html'});
 await ready(`!!window.__kitchenViewer?.selectableMeshes?.some(r=>r.userData.objectType==='kitchen-pullout-slab')`);
 console.log('Drawer viewer loaded.');
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
