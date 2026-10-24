// Isolated browser regression check. Requires installed Google Chrome on macOS.
// Starts its own Vite server; never reads or writes the user's browser profile.
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
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



 await c('Page.navigate',{url:'http://127.0.0.1:5189/tracer.html'});
 await ready(`!!document.querySelector('#saved-files-toggle')?.onclick`);
 await evaluate(`(async()=>{
  const m=await import('/src/builder/model.js'),f=await import('/src/state/projectFiles.js');
  const first=m.newPlan();first.name='Archived home';m.addRoom(first,m.ROOM_PRESETS[0]);m.saveDraft(first);
  const second=m.newPlan();second.name='Current home';m.addRoom(second,m.ROOM_PRESETS[1]);m.saveDraft(second);
  const layout=m.exportPlan(second);layout.projectName='3D home';localStorage.setItem('preciseFloorplan',JSON.stringify(layout));
  localStorage.setItem('floorplanTimestamp','123');localStorage.setItem(m.BACKUP_KEY,JSON.stringify(layout));localStorage.setItem(f.PREVIOUS_PROJECT_KEY,JSON.stringify(f.createProjectFile(layout,'Earlier project')));
  document.querySelector('#saved-files-toggle').click();
  if(document.querySelectorAll('#saved-files-list .saved-delete').length!==5)throw Error('Missing Delete buttons');
  window.confirm=()=>false;document.querySelector('[aria-label="Delete Archived home"]').click();
  if(m.savedDrafts().length!==1)throw Error('Cancelled delete changed storage');
  window.confirm=()=>true;document.querySelector('[aria-label="Delete Archived home"]').click();
  if(m.savedDrafts().length||document.querySelector('[aria-label="Delete Archived home"]'))throw Error('Archive not deleted');
  if(!localStorage.getItem(m.DRAFT_KEY))throw Error('Other draft deleted');
 })()`);
 await shot('saved-files-delete');
 await evaluate(`(()=>{
  document.querySelector('[aria-label="Delete Previous project: Earlier project"]').click();
  if(localStorage.getItem('previous3DProjectBackup'))throw Error('Previous project not deleted');
  const cards=[...document.querySelectorAll('.saved-entry')];cards.find(card=>card.textContent.includes('Saved before switching')).querySelector('.saved-delete').click();
  if(localStorage.getItem('easy2DPreviousProject'))throw Error('Builder project backup not deleted');
  document.querySelector('[aria-label="Delete 3D home"]').click();
  if(localStorage.getItem('preciseFloorplan')||localStorage.getItem('floorplanTimestamp'))throw Error('3D project not deleted');
  document.querySelector('[aria-label="Delete Current home"]').click();
  if(localStorage.getItem('easy2DPlanDraft'))throw Error('Current draft not deleted');
  if(!document.querySelector('#saved-files-list').textContent.includes('No readable plans'))throw Error('Empty state missing');
 })()`);
 await c('Page.navigate',{url:'http://127.0.0.1:5189/builder.html'});
 await ready(`!!document.querySelector('#builder-saved-files')?.onclick`);
 const deletedId=await evaluate(`(()=>{document.querySelector('[data-room="0"]').click();const id=JSON.parse(localStorage.getItem('easy2DPlanDraft')).id;document.querySelector('#builder-saved-files').click();window.confirm=()=>true;document.querySelector('#saved-files-list .saved-delete').click();if(document.querySelectorAll('#canvas .room').length)throw Error('Deleted plan remains in editor');if(!document.querySelector('#undo').disabled)throw Error('Deleted plan can be undone');return id;})()`);
 await evaluate(`(()=>{document.querySelector('#saved-files-close').click();document.querySelector('[data-room="1"]').click();const p=JSON.parse(localStorage.getItem('easy2DPlanDraft'));if(p.id===${JSON.stringify(deletedId)})throw Error('Deleted plan resurrected');if(JSON.parse(localStorage.getItem('easy2DSavedPlans')||'[]').some(e=>e.plan.id===${JSON.stringify(deletedId)}))throw Error('Deleted plan archived again');})()`);
 console.log('Delete checks passed: cancel, each saved file type, unrelated files preserved, empty state, active editor reset. Errors:',JSON.stringify(errors));
 if(errors.length)process.exitCode=1;
}finally{clearTimeout(deadline);ws?.close();chrome.kill('SIGTERM');server.kill('SIGTERM');}
