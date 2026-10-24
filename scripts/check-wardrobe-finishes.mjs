// Isolated browser regression check. Requires installed Google Chrome on macOS.
// Starts its own Vite server; never reads or writes the user's browser profile.
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
const profile=await mkdtemp('/private/tmp/greenlam-browser-');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','apps/frontend','--host','127.0.0.1','--port','5187','--strictPort'],{stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{let output='';server.stdout.on('data',b=>{output+=b;if(output.includes('5187'))resolve();});server.on('exit',code=>reject(new Error(`Vite exited: ${code}`)));setTimeout(()=>reject(new Error('Vite startup timed out')),15000).unref();});
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank']);
const deadline=setTimeout(()=>{chrome.kill('SIGTERM');server.kill('SIGTERM');process.exit(2);},110000);
let ws;
try{
 const endpoint=await new Promise((resolve,reject)=>{let output='';chrome.stderr.on('data',b=>{output+=b;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.on('error',reject);chrome.on('exit',c=>reject(new Error(`Chrome exited: ${c}`)));});
 ws=new WebSocket(endpoint);await new Promise(r=>ws.onopen=r);
 let seq=0;const pending=new Map(),errors=[],failedAssets=[];
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Network.responseReceived'&&m.params.response.url.includes('/catalog/greenlam/')&&m.params.response.status>=400)failedAssets.push(m.params.response.url);};
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await call('Target.createTarget',{url:'about:blank'}),{sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
 const c=(m,p={})=>call(m,p,sessionId);
 // Expose viewer state only inside this isolated test browser. Production
 // source and the user's running viewer are not modified by this hook.
 ws.addEventListener('message',async({data})=>{
   const event=JSON.parse(data);if(event.method!=='Fetch.requestPaused')return;
   const {requestId}=event.params;
   try{
     const response=await c('Fetch.getResponseBody',{requestId});
     const source=response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body;
     const hook='\nwindow.__viewerTest={THREE,scene,camera,renderer,controls,selectableMeshes,selectObject,editWardrobeFinishes,get helper(){return selectionHelper;},get viewerControls(){return viewerControls;}};';
     await c('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(source+hook).toString('base64')});
   }catch(error){errors.push(String(error));await c('Fetch.continueRequest',{requestId});}
 });
 const evaluate=async expression=>{const r=await c('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const ready=async expression=>{for(let i=0;i<50;i++){if(await evaluate(expression))return;await pause(200);}throw new Error('Page did not become ready');};
 const shot=async name=>{const s=await c('Page.captureScreenshot',{format:'png'});await writeFile(`/private/tmp/${name}.png`,Buffer.from(s.data,'base64'));};
 await c('Page.enable');await c('Runtime.enable');await c('Network.enable');await c('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
 await c('Page.navigate',{url:'http://127.0.0.1:5187/tests/wardrobe-finishes-preview.html'});
 await ready(`document.body.dataset.ready==='true'`);
 console.log('Studio loaded.');
 // Compare GPU pixels, not just material metadata or whole-scene screenshots:
 // an edge-band/highlight change can hide a stale front-face texture.
 await evaluate(`(async()=>{
   const {THREE,renderer}=window.__wardrobePreview;
   window.checkLaminatePixels=map=>{
     const source=map.image,canvas=document.createElement('canvas');
     canvas.width=source.naturalWidth||source.width;canvas.height=source.naturalHeight||source.height;
     canvas.getContext('2d').drawImage(source,0,0);
     const reference=map.clone();reference.source=new THREE.Source(canvas);reference.needsUpdate=true;
     const target=new THREE.WebGLRenderTarget(32,32),scene=new THREE.Scene();
     const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,2);camera.position.z=1;
     const material=new THREE.MeshBasicMaterial({map,toneMapped:false}),geometry=new THREE.PlaneGeometry(2,2);
     scene.add(new THREE.Mesh(geometry,material));
     const previousTarget=renderer.getRenderTarget(),actual=new Uint8Array(4096),expected=new Uint8Array(4096);
     const gl=renderer.getContext();
     try{
       renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,32,32,actual);
       material.map=reference;renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,32,32,expected);
       if(gl.getError()!==gl.NO_ERROR)throw new Error('Laminate upload produced a WebGL error');
       if(actual.some((v,i)=>Math.abs(v-expected[i])>2))throw new Error('GPU still shows the previous laminate pixels');
       return Array.from(actual);
     }finally{renderer.setRenderTarget(previousTarget);reference.dispose();target.dispose();material.dispose();geometry.dispose();}
   };
 })()`);
 // A clicked, already visible swatch must reach the rendered open door in
 // this same event, without waiting for a new image request or page reload.
 await ready(`(()=>{const img=document.querySelector('[data-laminate-id="gl-5649-arn"] img');return img?.complete&&img.naturalWidth>0;})()`);
 console.log(await evaluate(`(()=>{
   const {root,renderer,scene,camera}=window.__wardrobePreview;
   const p=document.querySelector('#wardrobe-finish-editor'),part=p.querySelector('[data-field="part"]');
   if(part.value!=='door-1')throw new Error('Expected initial Door 1 selection');
   const meshes=[];root.traverse(n=>{if(n.userData.wardrobeSurface?.id==='door-1')meshes.push(n);});
   const door=meshes[0],mat=door.material[4];
   door.parent.rotation.y=-.7;root.updateMatrixWorld(true);renderer.render(scene,camera);
   const before=renderer.domElement.toDataURL();
   const b=p.querySelector('[data-laminate-id="gl-5649-arn"]'),img=b.querySelector('img');
   if(!img.complete||!img.naturalWidth)throw new Error('Visible swatch unexpectedly not decoded');
   const start=performance.now();b.click();
   if(door.material[4]!==mat)throw new Error('Click replaced rather than updated the live material');
   if(mat.userData.laminateId!=='gl-5649-arn'||mat.userData.textureStatus!=='loaded')throw new Error('Loaded swatch did not apply synchronously');
   if(door.material[5]!==mat||door.parent.rotation.y!==-.7)throw new Error('Open door reverse face or pose is incorrect');
   renderer.render(scene,camera);
   if(renderer.domElement.toDataURL()===before)throw new Error('First frame did not change');
   const elapsed=performance.now()-start;
   window.checkLaminatePixels(mat.map);
   door.parent.rotation.y=0;
   p.querySelector('[data-action="reset"]').click();
   return {instantTexture:true,firstFrameChanged:true,clickAndRenderMs:Math.round(elapsed)};
 })()`));
 await ready(`['gl-175-arn','gl-5641-arn','gl-5649-arn'].every(id=>{const img=document.querySelector('[data-laminate-id="'+id+'"] img');return img?.complete&&img.naturalWidth>0;})`);
 console.log(await evaluate(`(()=>{
   const {root}=window.__wardrobePreview,p=document.querySelector('#wardrobe-finish-editor');
   const surfaces=[];root.traverse(n=>{if(n.userData.wardrobeSurface)surfaces.push(n);});
   for(const id of ['door-2','drawer-1']){
     const part=p.querySelector('[data-field="part"]');part.value=id;part.dispatchEvent(new Event('change'));
     const mesh=surfaces.find(n=>n.userData.wardrobeSurface.id===id),material=mesh.material[4];
     let previousPixels;
     for(const swatch of ['gl-175-arn','gl-5641-arn','gl-5649-arn','gl-175-arn']){
       const neighbours=surfaces.filter(n=>n!==mesh).map(n=>[n,n.material[n.userData.wardrobeSurface.face].map.version]);
       p.querySelector('[data-laminate-id="'+swatch+'"]').click();
       if(material.userData.laminateId!==swatch||material.userData.textureStatus!=='loaded')throw new Error(id+' did not update immediately');
       const pixels=window.checkLaminatePixels(material.map);
       if(previousPixels&&pixels.every((v,i)=>v===previousPixels[i]))throw new Error(id+' pixels did not change');
       for(const [n,version] of neighbours)if(n.material[n.userData.wardrobeSurface.face].map.version!==version)throw new Error('Neighbour changed');
       previousPixels=pixels;
     }
     p.querySelector('[data-action="reset"]').click();
   }
   return {doorAndDrawerPixels:'updated on every click',neighbours:'unchanged'};
 })()`));
 console.log(await evaluate(`(()=>{
  const p=document.querySelector('#wardrobe-finish-editor'),field=n=>p.querySelector('[data-field="'+n+'"]'),button=n=>p.querySelector('[data-action="'+n+'"]');
  const pick=id=>{const b=p.querySelector('[data-laminate-id="'+id+'"]');if(!b)throw new Error('Missing swatch '+id);b.click();};
  const root=window.__wardrobePreview.root;
  const choose=id=>{field('part').value=id;field('part').dispatchEvent(new Event('change'));};
  choose('door-1');pick('gl-5106-brl');
  choose('door-2');pick('gl-5675-sgl');
  choose('side-left');pick('gl-9854-afx');
  if(Object.keys(root.userData.wardrobeFinishes).length!==3)throw new Error('Changes leaked to unselected parts');
  button('undo').click();if(root.userData.wardrobeFinishes['side-left'])throw new Error('Undo failed');
  choose('door-1');field('rotation').value='90';field('rotation').dispatchEvent(new Event('change'));
  if(root.userData.wardrobeFinishes['door-1'].rotation!==90)throw new Error('Grain change failed');
  field('scope').value='sides';field('scope').dispatchEvent(new Event('change'));pick('gl-5106-brl');
  if(root.userData.wardrobeFinishes['side-left'].laminateId!==root.userData.wardrobeFinishes['side-right'].laminateId)throw new Error('Both sides scope failed');
  choose('door-3');pick('gl-364-sat');
  choose('loft-1');pick('gl-364-sat');
  field('scope').value='loft';field('scope').dispatchEvent(new Event('change'));pick('gl-364-sat');
  choose('door-2');button('toggle').click();
  return {parts:root.userData.wardrobeSurfaces.length,edits:Object.keys(root.userData.wardrobeFinishes).length};
 })()`));
 await pause(100);
 await shot('greenlam-before-texture-check');
 console.log('Texture diagnostics',await evaluate(`(()=>{const out=[];window.__wardrobePreview.root.traverse(n=>{if(n.userData.wardrobeSurface){const m=n.material[n.userData.wardrobeSurface.face];out.push({id:n.userData.wardrobeSurface.id,status:m.userData.textureStatus,map:!!m.map});}});return out;})()`));
 console.log('Asset failures',failedAssets);
 await ready(`(()=>{let ready=true;window.__wardrobePreview.root.traverse(n=>{if(n.userData.wardrobeSurface&&n.material[n.userData.wardrobeSurface.face].userData.textureStatus!=='loaded')ready=false;});return ready;})()`);
 console.log(await evaluate(`(()=>{const root=window.__wardrobePreview.root;let loaded=0;root.traverse(n=>{if(n.userData.wardrobeSurface){const mat=n.material[n.userData.wardrobeSurface.face];if(mat.userData.textureStatus==='loaded')loaded++;else throw new Error('Texture not loaded: '+mat.name);}});return {loaded};})()`));
 await shot('greenlam-studio-open');
 await c('Page.reload');await ready(`document.body.dataset.ready==='true'`);
 await evaluate(`(()=>{const s=window.__wardrobePreview.root.userData.wardrobeFinishes;if(s['door-2']?.laminateId!=='gl-5675-sgl'||s['door-1']?.rotation!==90)throw new Error('Preview reload failed');document.querySelector('[data-field="part"]').value='door-2';document.querySelector('[data-field="part"]').dispatchEvent(new Event('change'));})()`);
 await pause(1200);await shot('greenlam-studio');
 await c('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(400);
 if(!await evaluate(`(()=>{const r=document.querySelector('#wardrobe-finish-editor').getBoundingClientRect();return innerWidth===390&&r.left>=0&&r.right<=390&&r.bottom<=844;})()`))throw new Error('Mobile panel overflows');
 await shot('greenlam-studio-mobile');
 await c('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
 // Check the actual viewer's toolbar, persistence callback and keyboard guard.
 await c('Fetch.enable',{patterns:[{urlPattern:'*/src/main.js*',requestStage:'Response'}]});
 await evaluate(`localStorage.setItem('preciseFloorplan',JSON.stringify({units:'m',walls:[],rooms:[{id:'room-test',type:'bedroom',points:[{x:-3,y:-2},{x:3,y:-2},{x:3,y:5},{x:-3,y:5}]}],objects:[{id:'wardrobe-test',class:'wardrobe-3-loft',source:'catalog',bbox:{x1:-.9,y1:-.3,x2:.9,y2:.3},rotationY:0},{id:'wardrobe-neighbour',class:'wardrobe-3-loft',source:'catalog',bbox:{x1:1.1,y1:-.3,x2:2.9,y2:.3},rotationY:0}]}));localStorage.setItem('floorplanTimestamp',String(Date.now()));`);
 await c('Page.navigate',{url:'http://127.0.0.1:5187/index.html'});await pause(2500);
 const open=async()=>evaluate(`(()=>{const canvas=document.querySelector('canvas');for(let y=220;y<=900;y+=20)for(let x=350;x<=1200;x+=20){canvas.dispatchEvent(new MouseEvent('click',{clientX:x,clientY:y,bubbles:true}));const edit=document.querySelector('#wardrobe-finishes-button');if(edit){edit.click();return true;}}return false;})()`);
 if(!await open())throw new Error('Could not select wardrobe / open actual viewer editor');
 await ready(`['gl-175-arn','gl-5649-arn'].every(id=>document.querySelector('[data-laminate-id="'+id+'"] img')?.naturalWidth>0)`);
 console.log(await evaluate(`(()=>{
   const v=window.__viewerTest,{THREE,renderer,scene,camera}=v;
   const root=v.selectableMeshes.find(n=>n.userData.isWardrobe);
   if(!v.viewerControls.setWalkMode())throw new Error('Could not enter walk mode');
   v.selectObject(root);v.editWardrobeFinishes(root,'door-1');
   const meshes=[];root.traverse(n=>{if(n.userData.wardrobeSurface)meshes.push(n);});
   const door=meshes.find(n=>n.userData.wardrobeSurface.id==='door-1');
   door.parent.rotation.y=-.7;root.updateMatrixWorld(true);
   const center=new THREE.Box3().setFromObject(door).getCenter(new THREE.Vector3());
   camera.position.copy(center).add(new THREE.Vector3(0,0,3));camera.lookAt(center);camera.updateMatrixWorld(true);
   const p=document.querySelector('#wardrobe-finish-editor');
   const target=new THREE.WebGLRenderTarget(160,160),pixels=new Uint8Array(160*160*4);
   const capture=()=>{renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,160,160,pixels);renderer.setRenderTarget(null);return Array.from(pixels);};
   p.querySelector('[data-laminate-id="gl-175-arn"]').click();const purple=capture();
   p.querySelector('[data-laminate-id="gl-5649-arn"]').click();const brown=capture();
   if(v.helper.object!==door)throw new Error('Highlight does not match edited door');
   if(purple.every((n,i)=>n===brown[i]))throw new Error('Viewer door stayed purple');
   const live=door.material[4],fresh=live.clone();
   if(live.userData.laminateId!=='gl-5649-arn')throw new Error('Saved choice did not reach highlighted door material');
   door.material=door.material.map(m=>m===live?fresh:m);const expected=capture();
   door.material=door.material.map(m=>m===fresh?live:m);fresh.dispose();target.dispose();
   if(brown.some((n,i)=>Math.abs(n-expected[i])>2))throw new Error('Live physical material differs from freshly rendered finish');
   renderer.render(scene,camera);
   return {viewerOpenDoor:'pixels changed from purple to brown',highlight:'matches edited door',material:live.userData.laminateId};
 })()`));
 await shot('greenlam-viewer-open-door-brown');
 console.log(await evaluate(`(()=>{
   const v=window.__viewerTest,{THREE,renderer,scene,camera}=v;
   const root=v.selectableMeshes.find(n=>n.userData.layoutId==='wardrobe-test');
   v.editWardrobeFinishes(root,'drawer-1');
   const drawer=v.helper.object,others=[];
   scene.traverse(n=>{if(n.userData.wardrobeSurface&&n!==drawer)others.push([n,JSON.stringify(n.userData.laminateChoice)]);});
   drawer.parent.position.z=.3;root.updateMatrixWorld(true);
   const center=new THREE.Box3().setFromObject(drawer).getCenter(new THREE.Vector3());
   camera.position.copy(center).add(new THREE.Vector3(0,.3,2));camera.lookAt(center);camera.updateMatrixWorld(true);
   const target=new THREE.WebGLRenderTarget(160,160),pixels=new Uint8Array(160*160*4);
   let previous;
   try{
     for(const id of ['gl-175-arn','gl-5649-arn','gl-175-arn']){
       document.querySelector('[data-laminate-id="'+id+'"]').click();
       if(drawer.material[4].userData.laminateId!==id)throw new Error('Drawer material did not update');
       renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,160,160,pixels);
       if(previous&&pixels.every((n,i)=>n===previous[i]))throw new Error('Drawer pixels did not change');
       previous=Array.from(pixels);
       for(const [mesh,choice] of others)if(JSON.stringify(mesh.userData.laminateChoice)!==choice)throw new Error('Finish changed a neighbouring part or wardrobe');
     }
   }finally{renderer.setRenderTarget(null);target.dispose();}
   return {viewerDrawer:'changes on repeated clicks',otherPartsAndWardrobes:'unchanged',walkMode:v.viewerControls.isWalkMode()};
 })()`));
 await evaluate(`(()=>{const p=document.querySelector('#wardrobe-finish-editor'),select=p.querySelector('[data-field="part"]');select.value='door-2';select.dispatchEvent(new Event('change'));p.querySelector('[data-laminate-id="gl-175-arn"]').click();p.querySelector('[data-field="rotation"]').value='90';p.querySelector('[data-field="rotation"]').dispatchEvent(new Event('change'));window.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}));const record=JSON.parse(localStorage.preciseFloorplan).objects.find(o=>o.id==='wardrobe-test');if(record?.wardrobeFinishes?.['door-2']?.laminateId!=='gl-175-arn')throw new Error('Viewer persistence or Delete guard failed');})()`);
 await c('Page.reload');await pause(2500);if(!await open())throw new Error('Cannot reopen after viewer reload');
 await evaluate(`(()=>{const p=document.querySelector('#wardrobe-finish-editor'),select=p.querySelector('[data-field="part"]');select.value='door-2';select.dispatchEvent(new Event('change'));if(p.querySelector('[aria-pressed="true"]').dataset.laminateId!=='gl-175-arn'||p.querySelector('[data-field="rotation"]').value!=='90')throw new Error('Actual viewer reload failed');})()`);
 await evaluate(`document.querySelector('[data-action="inspect"]').click()`);await pause(1200);
 await shot('greenlam-viewer-tested');
 console.log('PASS: per-part isolation, group edits, undo, grain, texture loads, mobile layout, viewer toolbar, keyboard guard and reload.');
 console.log('JS exceptions:',JSON.stringify(errors),'Failed Greenlam requests:',JSON.stringify(failedAssets));
 if(errors.length||failedAssets.length)process.exitCode=1;
}finally{ws?.close();chrome.kill('SIGTERM');server.kill('SIGTERM');clearTimeout(deadline);}
