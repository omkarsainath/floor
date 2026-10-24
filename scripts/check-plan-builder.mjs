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

 await c('Page.navigate',{url:'http://127.0.0.1:5189/tracer.html'});
 await ready(`!!document.querySelector('.builder-start')`);
 await evaluate(`(()=>{const b=document.querySelector('.builder-start'),canvas=document.querySelector('#overlay');if(b.getBoundingClientRect().top<canvas.getBoundingClientRect().bottom)throw Error('Builder button is not below canvas');localStorage.setItem('preciseFloorplan',JSON.stringify({units:'m',rooms:[],walls:[],objects:[]}));b.click();})()`);
 await ready(`!!document.querySelector('[data-room]')`);
 await evaluate(`(()=>{
 const click=s=>document.querySelector(s).click();click('[data-room="0"]');click('[data-room="1"]');
 let p=JSON.parse(localStorage.getItem('easy2DPlanDraft'));if(p.rooms.length!==2)throw Error('Rooms not saved');
 const select=document.querySelector('#selection');select.value=p.rooms[0].id;select.dispatchEvent(new Event('change'));
 document.querySelector('#width').value='9 ft 6 in';click('#apply-size');p=JSON.parse(localStorage.getItem('easy2DPlanDraft'));if(Math.abs(p.rooms[0].w-2.8956)>.0001)throw Error('Feet/inches size incorrect');click('#undo');
 click('[data-step="2"]');
 const search=document.querySelector('#search');search.value='Slab with';search.dispatchEvent(new Event('input'));click('[data-item="0"]');
 search.value='';search.dispatchEvent(new Event('input'));const cat=document.querySelector('#category');cat.value='beds';cat.dispatchEvent(new Event('change'));click('[data-item="0"]');
 document.querySelector('#delete').click();document.querySelector('#undo').click();
 cat.value='designer-doors';cat.dispatchEvent(new Event('change'));click('[data-item="0"]');
 })()`);
 // Resize a room with its canvas handle, then undo using the keyboard.
 const resize=await evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('easy2DPlanDraft')),select=document.querySelector('#selection');select.value=p.rooms[0].id;select.dispatchEvent(new Event('change'));const handle=document.querySelector('[data-corner="br"]').getBoundingClientRect();return {x:handle.x+handle.width/2,y:handle.y+handle.height/2,depth:p.rooms[0].d};})()`);
 await c('Input.dispatchMouseEvent',{type:'mousePressed',x:resize.x,y:resize.y,button:'left',clickCount:1});
 await c('Input.dispatchMouseEvent',{type:'mouseMoved',x:resize.x,y:resize.y+35,button:'left',buttons:1});
 await c('Input.dispatchMouseEvent',{type:'mouseReleased',x:resize.x,y:resize.y+35,button:'left',clickCount:1});
 if(await evaluate(`JSON.parse(localStorage.getItem('easy2DPlanDraft')).rooms[0].d`)===resize.depth)throw Error('Canvas resize handle did not change room');
 await c('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:4});
 await c('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:4});
 if(Math.abs(await evaluate(`JSON.parse(localStorage.getItem('easy2DPlanDraft')).rooms[0].d`)-resize.depth)>.0001)throw Error('Command Z did not restore room');
 // Move the new door with actual pointer events onto the shared partition.
 const drag=await evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('easy2DPlanDraft')),o=p.objects.at(-1),r=p.rooms[0],m=document.querySelector('svg').getScreenCTM();const a=new DOMPoint(o.x,o.y).matrixTransform(m),b=new DOMPoint(r.x+r.w+.075,r.y+r.d/2).matrixTransform(m);return {ax:a.x,ay:a.y,bx:b.x,by:b.y};})()`);
 await c('Input.dispatchMouseEvent',{type:'mousePressed',x:drag.ax,y:drag.ay,button:'left',clickCount:1});
 await c('Input.dispatchMouseEvent',{type:'mouseMoved',x:drag.bx,y:drag.by,button:'left',buttons:1});
 await c('Input.dispatchMouseEvent',{type:'mouseReleased',x:drag.bx,y:drag.by,button:'left',clickCount:1});
 await evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('easy2DPlanDraft'));if(Math.abs(p.objects.at(-1).x-p.rooms[0].w-.075)>.001)throw Error('Door drag did not attach to shared wall');const cat=document.querySelector('#category');cat.value='windows';cat.dispatchEvent(new Event('change'));document.querySelector('[data-item="0"]').click();document.querySelector('[data-step="3"]').click();})()`);
 await shot('easy-2d-builder-desktop');
 await evaluate(`history.replaceState(null,'','/builder.html?plan='+encodeURIComponent(JSON.parse(localStorage.getItem('easy2DPlanDraft')).id))`);
 await c('Page.reload');await ready(`!!document.querySelector('#selection option[value]:not([value=""])')`);
 await evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('easy2DPlanDraft'));if(p.rooms.length!==2||p.objects.length!==4)throw Error('Reload lost plan');document.querySelector('#show3d').click();})()`);
 await ready(`!!window.__kitchenViewer?.selectableMeshes?.length`);
 await evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('preciseFloorplan'));if(p.source!=='easy-2d-builder'||p.rooms.length!==2||p.objects.length!==4)throw Error('Viewer handoff wrong');if(!localStorage.getItem('easy2DPreviousProject'))throw Error('Old project not backed up');if(!window.__kitchenViewer.selectableMeshes.some(r=>r.userData.objectType==='kitchen-pullout-slab'))throw Error('Slab absent in 3D');const v=window.__kitchenViewer;v.selectObject(v.selectableMeshes.find(r=>r.userData.objectType==='kitchen-pullout-slab'));document.querySelector('#kitchen-accessories-button').click();document.querySelector('[data-action=laminate-tab]').click();document.querySelector('[data-laminate-id]').click();document.querySelector('#kitchen-accessories-panel').close();})()`);
 await shot('easy-2d-builder-viewer');
 // Save the actual edited kitchen, download it, then reopen and restore via the UI.
 const downloads=await mkdtemp('/private/tmp/project-downloads-');
 await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
 await evaluate(`(()=>{document.querySelector('#save-project-toggle').click();document.querySelector('#project-name').value='Kitchen home';document.querySelector('#project-save').click();if(JSON.parse(localStorage.getItem('preciseFloorplan')).projectName!=='Kitchen home')throw Error('Save on device failed');document.querySelector('#project-download').click();})()`);
 let backup;for(let i=0;i<50;i++){try{backup=JSON.parse(await readFile(downloads+'/Kitchen-home.project.json','utf8'));break;}catch{await pause(100);}}
 if(!backup?.layout?.objects?.find(o=>o.class==='kitchen-pullout-slab')?.kitchen?.cabinets?.['bay-1']?.finish?.laminateId)throw Error('Downloaded backup lost kitchen finish');
 if(!backup.builderDraft)throw Error('Backup lost 2D source');
 const importFile=async path=>{const {root}=await c('DOM.getDocument'),{nodeId}=await c('DOM.querySelector',{nodeId:root.nodeId,selector:'#project-file'});await c('DOM.setFileInputFiles',{nodeId,files:[path]});};
 await writeFile(downloads+'/invalid.json','{"hello":"not a project"}');await importFile(downloads+'/invalid.json');
 await ready(`document.querySelector('#project-status').dataset.error==='true'`);
 await evaluate(`(()=>{if(!document.querySelector('#project-open').hidden||JSON.parse(localStorage.getItem('preciseFloorplan')).projectName!=='Kitchen home')throw Error('Invalid backup changed current project');})()`);
 const edited=structuredClone(backup);edited.name='Reopened home';edited.layout.objects.find(o=>o.class==='kitchen-pullout-slab').elevation=.25;
 await writeFile(downloads+'/reopen.project.json',JSON.stringify(edited));await importFile(downloads+'/reopen.project.json');
 await ready(`!document.querySelector('#project-open').hidden`);await evaluate(`document.querySelector('#project-open').click()`);
 await ready(`!!window.__kitchenViewer?.scene&&!!document.querySelector('#project-dialog')&&!document.querySelector('#project-dialog').open`);
 await evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('preciseFloorplan'));if(p.projectName!=='Reopened home'||p.objects.find(o=>o.class==='kitchen-pullout-slab').elevation!==.25)throw Error('Reopened project mismatch');document.querySelector('#save-project-toggle').click();document.querySelector('#project-previous').click();document.querySelector('#project-open').click();})()`);
 await ready(`!!window.__kitchenViewer?.scene&&!!document.querySelector('#project-dialog')&&!document.querySelector('#project-dialog').open`);
 await evaluate(`(()=>{if(JSON.parse(localStorage.getItem('preciseFloorplan')).projectName!=='Kitchen home')throw Error('Previous project not restored');document.querySelector('#save-project-toggle').click();})()`);
 await shot('save-project-dialog');await evaluate(`document.querySelector('#project-close').click()`);
 await evaluate(`document.querySelector('#return-to-builder').click()`);
 await ready(`!!document.querySelector('#canvas')`);
 await evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('easy2DPlanDraft'));if(!p.objects.find(o=>o.class==='kitchen-pullout-slab').record.kitchen?.cabinets?.['bay-1']?.finish?.laminateId)throw Error('3D kitchen edit lost on return');})()`);
 await evaluate(`(()=>{
 document.querySelector('[data-step="1"]').click();document.querySelector('[data-room="5"]').click();
 let p=JSON.parse(localStorage.getItem('easy2DPlanDraft'));const hostIds=p.rooms.filter(r=>r.kind!=='pooja').map(r=>r.id);
 for(const id of hostIds){const field=document.querySelector('#pooja-host');if(!field)throw Error('Pooja placement control missing');field.value=id;field.dispatchEvent(new Event('change'));p=JSON.parse(localStorage.getItem('easy2DPlanDraft'));const child=p.rooms.find(r=>r.kind==='pooja'),host=p.rooms.find(r=>r.id===id);if(child.x<host.x||child.x+child.w>host.x+host.w+.001)throw Error('Pooja not placed in chosen room');}
 document.querySelector('#undo').click();document.querySelector('#redo').click();
 })()`);
 await shot('easy-2d-pooja-room');
 await evaluate(`history.replaceState(null,'','/builder.html?plan='+encodeURIComponent(JSON.parse(localStorage.getItem('easy2DPlanDraft')).id))`);
 await c('Page.reload');await ready(`!!document.querySelector('#canvas')`);
 await evaluate(`document.querySelector('#show3d').click()`);
 await ready(`!!window.__kitchenViewer?.scene`);
 await evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('preciseFloorplan')),pr=p.rooms.find(r=>r.room_type==='pooja');if(!pr?.builderParentRoomId||!p.rooms.find(r=>r.id===pr.builderParentRoomId).floorHoles.length)throw Error('Nested Pooja lost on 3D handoff');document.querySelector('#return-to-builder').click();})()`);
 await ready(`!!document.querySelector('#canvas')`);
 // Wall cuts: reproduce slightly offset wall layers and select the partition with a real pointer.
 await evaluate(`(async()=>{const m=await import('/src/builder/model.js'),p=m.newPlan();const empty=m.addRoom(p,m.ROOM_PRESETS[4]),living=m.addRoom(p,m.ROOM_PRESETS[1]);m.changeRoom(p,{...living,x:empty.w+m.GRID,d:empty.d});localStorage.setItem(m.DRAFT_KEY,JSON.stringify(p));localStorage.removeItem('preciseFloorplan');})()`);
 await evaluate(`history.replaceState(null,'','/builder.html?plan='+encodeURIComponent(JSON.parse(localStorage.getItem('easy2DPlanDraft')).id))`);
 await c('Page.reload');await ready(`!!document.querySelector('#wall-tool')`);
 const wallPoint=await evaluate(`(()=>{document.querySelector('#wall-tool').click();const p=JSON.parse(localStorage.getItem('easy2DPlanDraft')),r=p.rooms[0],pt=new DOMPoint(r.x+r.w+.075,r.y+r.d/2).matrixTransform(document.querySelector('svg').getScreenCTM());return {x:pt.x,y:pt.y};})()`);
 await c('Input.dispatchMouseEvent',{type:'mousePressed',...wallPoint,button:'left',clickCount:1});
 await c('Input.dispatchMouseEvent',{type:'mouseReleased',...wallPoint,button:'left',clickCount:1});
 await evaluate(`(()=>{if(!document.querySelector('#cut-part'))throw Error('Clicking a wall did not select it');document.querySelector('#cut-start').value='1 ft';document.querySelector('#cut-width').value='3 ft';document.querySelector('#cut-part').click();const p=JSON.parse(localStorage.getItem('easy2DPlanDraft'));if(p.wallCuts?.length!==1||Math.abs(p.wallCuts[0].length-.9144)>.00001)throw Error('Wall cut not saved');document.querySelector('svg').focus();})()`);
 await c('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:4});
 await c('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:4});
 await evaluate(`(()=>{if(JSON.parse(localStorage.getItem('easy2DPlanDraft')).wallCuts?.length)throw Error('Undo did not restore wall');document.querySelector('#redo').click();})()`);
 await shot('easy-2d-wall-cut');
 await evaluate(`(()=>{document.querySelector('[data-restore-cut]').click();if(JSON.parse(localStorage.getItem('easy2DPlanDraft')).wallCuts.length)throw Error('Restore cut failed');document.querySelector('#cut-whole').click();if(JSON.parse(localStorage.getItem('easy2DPlanDraft')).wallCuts.length!==1)throw Error('Whole wall removal failed');})()`);
 await evaluate(`history.replaceState(null,'','/builder.html?plan='+encodeURIComponent(JSON.parse(localStorage.getItem('easy2DPlanDraft')).id))`);
 await c('Page.reload');await ready(`!!document.querySelector('#show3d')`);
 await evaluate(`document.querySelector('#show3d').click()`);await ready(`!!window.__kitchenViewer?.scene`);
 await evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('preciseFloorplan'));const room=p.rooms.find(r=>r.name==='Empty Room'),seam=room.points[1].x+.075,middle=(room.points[0].y+room.points[2].y)/2;if(p.walls.some(w=>Math.abs(w.start.x-seam)<.01&&Math.abs(w.end.x-seam)<.01&&w.start.y<middle&&w.end.y>middle))throw Error('Neighbouring living-room wall reappeared in 3D');document.querySelector('#return-to-builder').click();})()`);
 await ready(`!!document.querySelector('#wall-tool')`);
 await evaluate(`(()=>{if(JSON.parse(localStorage.getItem('easy2DPlanDraft')).wallCuts.length!==1)throw Error('Returning from 3D lost wall cut');})()`);
 await c('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await evaluate(`document.querySelector('[data-step="2"]').click()`);await pause(400);await shot('easy-2d-builder-mobile');
 await evaluate(`(()=>{if(document.documentElement.scrollWidth>window.innerWidth+1)throw Error('Mobile horizontal overflow');})()`);
 console.log('Builder browser flow passed. Errors:',JSON.stringify(errors));if(errors.length)process.exitCode=1;
}finally{clearTimeout(deadline);ws?.close();chrome.kill('SIGTERM');server.kill('SIGTERM');}
