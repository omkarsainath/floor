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


 const downloadDir=await mkdtemp('/private/tmp/2d-downloads-');
 await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});
 await c('Page.navigate',{url:'http://127.0.0.1:5189/builder.html'});
 await ready(`!!document.querySelector('#download-2d')?.onclick`);
 const firstId=await evaluate(`(()=>{document.querySelector('[data-room="0"]').click();const p=JSON.parse(localStorage.getItem('easy2DPlanDraft'));return p.id;})()`);
 await c('Page.reload');await ready(`!!document.querySelector('#download-2d')?.onclick`);
 await evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('easy2DPlanDraft'));if(p.rooms.length)throw Error('Reopen was not fresh');document.querySelector('#builder-saved-files').click();if(!document.querySelector('#saved-files-list a[href*="plan="]'))throw Error('Saved plans missing');})()`);
 await evaluate(`document.querySelector('#saved-files-list a[href*="${firstId}"]').click()`);
 await ready(`document.querySelectorAll('#canvas .room').length===1`);
 await evaluate(`(()=>{document.querySelector('#zoom-in').click();document.querySelector('#wall-tool').click();document.querySelector('#download-2d').click();})()`);
 for(const format of ['svg','png','json']){
  await evaluate(`document.querySelector('[data-format="${format}"]').click()`);
  let bytes;
  for(let i=0;i<60;i++){try{bytes=await readFile(`${downloadDir}/My-new-home.${format}`);break;}catch{await pause(150);}}
  if(!bytes?.length)throw Error(`No ${format} download`);
  if(format==='json'&&JSON.parse(bytes).id!==firstId)throw Error('Wrong JSON plan');
  if(format==='svg'){
   const text=bytes.toString();if(!text.includes('Bedroom')||!text.includes('ft')||text.includes('data-editor-only')||text.includes('url(#grid)')||text.includes('resize-handle'))throw Error('SVG content incorrect');
  }
  if(format==='png'&&(bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||Math.max(bytes.readUInt32BE(16),bytes.readUInt32BE(20))!==2400))throw Error('PNG invalid');
 }
 await shot('builder-download-menu');
 await evaluate(`document.querySelector('#download-close').click()`);
 await c('Page.navigate',{url:'http://127.0.0.1:5189/builder.html'});
 await ready(`!!document.querySelector('#builder-saved-files')?.onclick`);
 await evaluate(`document.querySelector('#builder-saved-files').click()`);
 const {root}=await c('DOM.getDocument');const {nodeId}=await c('DOM.querySelector',{nodeId:root.nodeId,selector:'#saved-files-input'});
 await c('DOM.setFileInputFiles',{nodeId,files:[`${downloadDir}/My-new-home.json`]});
 await ready(`!!document.querySelector('#saved-files-preview button')`);
 await evaluate(`document.querySelector('#saved-files-preview button').click()`);
 await ready(`document.querySelectorAll('#canvas .room').length===1`);
 await c('Page.reload');await ready(`document.querySelectorAll('#canvas .room').length===1`);
 await evaluate(`document.querySelector('#show3d').click()`);
 await ready(`!!document.querySelector('#return-to-builder')`);
 await evaluate(`document.querySelector('#return-to-builder').click()`);
 await ready(`document.querySelectorAll('#canvas .room').length===1`);
 await c('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await evaluate(`(()=>{if(document.documentElement.scrollWidth>window.innerWidth+1)throw Error('Mobile horizontal overflow');})()`);
 await shot('builder-files-mobile');
 console.log('Fresh reopen, archived plan recovery, PNG/SVG/JSON downloads, JSON import, saved-plan reload, 3D return, and mobile checks passed. Downloads:',downloadDir,'Errors:',JSON.stringify(errors));
 if(errors.length)process.exitCode=1;
}finally{clearTimeout(deadline);ws?.close();chrome.kill('SIGTERM');server.kill('SIGTERM');}
