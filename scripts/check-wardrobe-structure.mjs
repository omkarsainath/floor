// Exercise the real viewer with an isolated profile; user's projects are untouched.
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
const profile=await mkdtemp('/private/tmp/wardrobe-structure-browser-');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','apps/frontend','--host','127.0.0.1','--port','5188','--strictPort'],{stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{if(String(b).includes('5188'))resolve();});server.on('exit',code=>reject(new Error(`Vite exited ${code}`)));});
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank']);
const deadline=setTimeout(()=>{chrome.kill();server.kill();process.exit(2);},150000);
let ws;
try{
  const endpoint=await new Promise((resolve,reject)=>{let output='';chrome.stderr.on('data',b=>{output+=b;const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match)resolve(match[1]);});chrome.on('error',reject);chrome.on('exit',code=>reject(new Error(`Chrome exited ${code}`)));});
  ws=new WebSocket(endpoint);await new Promise(resolve=>ws.onopen=resolve);
  let sequence=0;const pending=new Map(),errors=[];
  ws.onmessage=({data})=>{const event=JSON.parse(data);if(event.id){const request=pending.get(event.id);pending.delete(event.id);event.error?request.reject(new Error(JSON.stringify(event.error))):request.resolve(event.result);}else if(event.method==='Runtime.exceptionThrown')errors.push(event.params.exceptionDetails);};
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
  const {targetId}=await call('Target.createTarget',{url:'about:blank'}),{sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const c=(method,params={})=>call(method,params,sessionId);
  // Test-only access to module state, injected into this browser response.
  ws.addEventListener('message',async({data})=>{
    const event=JSON.parse(data);if(event.method!=='Fetch.requestPaused')return;
    const {requestId}=event.params;
    try{
      const response=await c('Fetch.getResponseBody',{requestId});
      const source=response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body;
      const hook='\nwindow.__structureTest={THREE,scene,camera,renderer,controls,selectableMeshes,selectObject,editWardrobeStructure,get viewerControls(){return viewerControls;}};';
      await c('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(source+hook).toString('base64')});
    }catch(error){errors.push(String(error));await c('Fetch.continueRequest',{requestId});}
  });
  const evaluate=async expression=>{const r=await c('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const ready=async expression=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await pause(150);}throw new Error('Viewer not ready');};
  const screenshot=async name=>{const shot=await c('Page.captureScreenshot',{format:'png'});await writeFile(`/private/tmp/${name}.png`,Buffer.from(shot.data,'base64'));};
  await c('Page.enable');await c('Runtime.enable');await c('Fetch.enable',{patterns:[{urlPattern:'*/src/main.js*',requestStage:'Response'}]});
  await c('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await c('Page.navigate',{url:'http://127.0.0.1:5188/tests/wardrobe-finishes-preview.html'});
  await ready(`document.body.dataset.ready==='true'`);
  await evaluate(`localStorage.setItem('preciseFloorplan',JSON.stringify({units:'m',rooms:[{id:'r',type:'bedroom',points:[{x:-3,y:-1},{x:3,y:-1},{x:3,y:5},{x:-3,y:5}]}],walls:[{id:'back-wall',start:{x:-3,y:-1},end:{x:3,y:-1},thickness:.2,height:3}],objects:[{id:'wardrobe-test',class:'wardrobe-2-loft',source:'catalog',bbox:{x1:-.6,y1:0,x2:.6,y2:.6},rotationY:0,wardrobeFinishes:{'door-1':{laminateId:'gl-175-arn'}}},{id:'other',class:'wardrobe-1',source:'catalog',bbox:{x1:1.5,y1:0,x2:2.1,y2:.6},rotationY:0}]}));`);
  await c('Page.navigate',{url:'http://127.0.0.1:5188/index.html'});
  await ready(`window.__structureTest?.selectableMeshes.length===2&&window.__structureTest.viewerControls`);
  const setup=`(()=>{
    const v=window.__structureTest,root=v.selectableMeshes.find(n=>n.userData.layoutId==='wardrobe-test');
    v.selectObject(root);document.querySelector('#wardrobe-structure-button').click();
    window.structureRoot=root;
    window.fieldChange=(name,value)=>{const field=document.querySelector('#wardrobe-structure-editor [data-field="'+name+'"]');if(!field)throw new Error('Missing field '+name);field.value=String(value);field.dispatchEvent(new Event('change'));const status=document.querySelector('#wardrobe-structure-editor [role="status"]').textContent;if(status&&!status.toLowerCase().includes('saved'))throw new Error(status);};
    window.structureAction=name=>document.querySelector('#wardrobe-structure-editor [data-action="'+name+'"]').click();
    window.surface=id=>{let mesh;root.traverse(n=>{if(n.userData.wardrobeSurface?.id===id)mesh=n;});return mesh;};
  })()`;
  await evaluate(setup);
  console.log(await evaluate(`(()=>{
    const root=window.structureRoot,other=window.__structureTest.selectableMeshes.find(n=>n.userData.layoutId==='other');
    const otherBefore=JSON.stringify(other.toJSON());
    fieldChange('drawer-handles','false');
    if(surface('drawer-1').parent.getObjectByName('drawer-handle'))throw new Error('Drawer handle was not removed');
    structureAction('remove-drawers');
    if(surface('drawer-1')||surface('drawer-2')||surface('door-1').userData.panelSize[1]<1.9)throw new Error('Removing drawers did not extend the door');
    fieldChange('section-width',80);fieldChange('depth',70);fieldChange('height',230);fieldChange('elevation',12);
    fieldChange('loft-width',180);fieldChange('loft-height',65);fieldChange('loft-depth',80);
    if(Math.abs(root.userData.wardrobeConfig.width-1.4)>1e-8||root.userData.wardrobeConfig.loft.width!==1.8)throw new Error('Independent dimensions failed');
    fieldChange('mirror-mode','fit');if(!surface('door-1').parent.getObjectByName('door-mirror'))throw new Error('Fit mirror missing');
    fieldChange('mirror-mode','custom');fieldChange('mirror-width',40);fieldChange('mirror-height',150);
    const mirror=surface('door-1').parent.getObjectByName('door-mirror');
    if(mirror.userData.panelSize[0]!==.4||mirror.userData.panelSize[1]!==1.5)throw new Error('Measured mirror dimensions wrong');
    fieldChange('door-handle','false');
    if(surface('door-1').parent.getObjectByName('door-handle'))throw new Error('Door handle was not removed');
    structureAction('undo');
    if(!surface('door-1').parent.getObjectByName('door-handle'))throw new Error('Undo did not restore handle');
    fieldChange('door-handle','false');fieldChange('loft-handles','false');
    if(!surface('door-2').parent.getObjectByName('door-handle')||surface('loft-1').parent.getObjectByName('door-handle'))throw new Error('Handle scope was not respected');
    fieldChange('section','2');structureAction('replace-door');fieldChange('drawer-count',4);
    if(surface('door-2'))throw new Error('Door survived drawer replacement');
    fieldChange('wall','back-wall');fieldChange('depth',85);
    if(Math.abs(root.position.z-.85/2-(-.9))>1e-8)throw new Error('Back does not stay against wall after depth change');
    if(JSON.stringify(other.toJSON())!==otherBefore)throw new Error('Neighbour wardrobe changed');
    structureAction('undo');if(root.userData.wardrobeConfig.depth!==.7)throw new Error('Undo failed');
    fieldChange('section','1');
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}));
    if(!window.__structureTest.selectableMeshes.includes(root))throw new Error('Delete removed wardrobe while editing');
    return {removeDrawers:'extended door',replaceDoor:'four drawers',dimensions:'body and loft independent',mirror:'40 × 150 cm',attachment:'flush after resizing',undo:true};
  })()`));
  console.log(await evaluate(`(()=>{
    const {THREE,scene,camera,renderer}=window.__structureTest;
    const mirror=surface('door-1').parent.getObjectByName('door-mirror');
    if(!mirror.isReflector)throw new Error('Door has no live mirror reflection');
    scene.updateMatrixWorld(true);
    const point=mirror.getWorldPosition(new THREE.Vector3()),normal=new THREE.Vector3(0,0,1).applyQuaternion(mirror.getWorldQuaternion(new THREE.Quaternion()));
    const position=camera.position.clone(),rotation=camera.quaternion.clone();
    const marker=new THREE.Mesh(new THREE.PlaneGeometry(.2,.3),new THREE.MeshBasicMaterial({color:0xff0000,side:THREE.DoubleSide}));
    marker.position.copy(point).addScaledVector(normal,2);marker.quaternion.copy(mirror.getWorldQuaternion(new THREE.Quaternion()));scene.add(marker);
    camera.position.copy(point).addScaledVector(normal,.9);camera.lookAt(point);camera.updateMatrixWorld(true);
    const target=mirror.getRenderTarget(),before=new Uint8Array(target.width*target.height*4),after=new Uint8Array(before.length);
    try{
      renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,before);
      marker.material.color.set(0x0000ff);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,after);
      if(before.every((n,i)=>n===after[i]))throw new Error('Mirror did not reflect the changing scene');
      return {mirrorReflection:'updates with scene behind the camera'};
    }finally{scene.remove(marker);marker.geometry.dispose();marker.material.dispose();camera.position.copy(position);camera.quaternion.copy(rotation);}
  })()`));
  await evaluate(`(()=>{const v=window.__structureTest;v.camera.position.set(3,2.6,4);v.controls.target.set(0,1.5,0);v.controls.update();document.querySelector('[data-field="section"]').scrollIntoView({block:'start'});})()`);
  await pause(300);await screenshot('wardrobe-structure-desktop');
  // Reload the actual project and continue editing, including laminates.
  await c('Page.reload');await ready(`window.__structureTest?.selectableMeshes.length===2&&window.__structureTest.viewerControls`);
  await evaluate(setup);
  console.log(await evaluate(`(()=>{
    const root=structureRoot,c=root.userData.wardrobeConfig;
    if(c.sections[0].front!=='door'||c.sections[1].front!=='drawers'||c.sections[1].drawerCount!==4||c.sections[0].mirror.height!==1.5||c.attachment.wallId!=='back-wall')throw new Error('Configuration did not survive reload');
    if(c.sections[0].doorHandle!==false||c.sections[0].drawerHandles!==false||c.loft.handles!==false||surface('door-1').parent.getObjectByName('door-handle'))throw new Error('Handle settings did not survive reload');
    fieldChange('door-handle','true');
    if(!surface('door-1').parent.getObjectByName('door-handle'))throw new Error('Cannot restore handle after reload');
    structureAction('add-section');if(root.userData.wardrobeConfig.sections.length!==3)throw new Error('Add section failed');
    fieldChange('mirror-mode','fit');window.__structureTest.renderer.render(window.__structureTest.scene,window.__structureTest.camera);
    structureAction('remove-section');if(root.userData.wardrobeConfig.sections.length!==2)throw new Error('Remove section failed');
    structureAction('finishes');const editor=document.querySelector('#wardrobe-finish-editor');
    editor.querySelector('[data-laminate-id="gl-5649-arn"]').click();
    if(surface('door-1').material[4].userData.laminateId!=='gl-5649-arn')throw new Error('Laminate editing broke after rebuild');
    editor.querySelector('[data-action="structure"]').click();
    if(!document.querySelector('#wardrobe-structure-editor'))throw new Error('Cannot reach layout controls from laminate panel');
    return {reload:'restored structure, mirror and wall attachment',sections:'add/remove works',laminates:'still editable'};
  })()`));
  await evaluate(`document.querySelector('#viewer-render-mode').click()`);await pause(500);
  await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('3D Model'));if(button)button.click();})()`);
  await c('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await pause(300);
  if(!await evaluate(`(()=>{const r=document.querySelector('#wardrobe-structure-editor').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})()`))throw new Error('Mobile editor overflows');
  await screenshot('wardrobe-structure-mobile');
  // Catalogue events use the same placement solver for the ghost and the click.
  await c('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(`(async()=>{
    const {defaultWardrobeConfig}=await import('/src/generators/wardrobeConfig.js');
    const config=defaultWardrobeConfig('wardrobe-1',1,.9);config.height=2.6;
    localStorage.setItem('preciseFloorplan',JSON.stringify({units:'m',rooms:[{id:'r',type:'bedroom',points:[{x:-4,y:0},{x:4,y:0},{x:4,y:5},{x:-4,y:5}]}],walls:[{id:'back',start:{x:-4,y:0},end:{x:4,y:0},thickness:.2,height:3},{id:'left',start:{x:-4,y:0},end:{x:-4,y:5},thickness:.2,height:3}],objects:[{id:'neighbour',class:'wardrobe-1',source:'catalog',bbox:{x1:-1.5,x2:-.5,y1:.1,y2:1},wardrobeConfig:config,rotationY:0}]}));
  })()`);
  await c('Page.reload');await ready(`window.__structureTest?.selectableMeshes.length===1&&window.__structureTest.viewerControls`);
  console.log(await evaluate(`(()=>{
    const v=window.__structureTest,other=v.selectableMeshes[0],before=JSON.stringify(other.toJSON());
    v.camera.position.set(0,7,7);v.controls.target.set(0,0,1);v.controls.update();v.camera.updateMatrixWorld(true);
    const choose=id=>{const search=document.querySelector('#catalog-panel input[type="search"]');search.value=id;search.dispatchEvent(new Event('input'));document.querySelector('[data-item-id="'+id+'"]').click();};
    const pointer=(x,y,z,type)=>{const p=new v.THREE.Vector3(x,y,z).project(v.camera);v.renderer.domElement.dispatchEvent(new MouseEvent(type,{clientX:(p.x+1)*innerWidth/2,clientY:(1-p.y)*innerHeight/2,bubbles:true}));};
    document.querySelector('#catalog-toggle-btn').click();choose('wardrobe-1');
    pointer(-.15,0,.15,'mousemove');
    const ghost=v.scene.children.find(n=>n.userData.cabinetPlacement);
    if(!ghost||!ghost.userData.cabinetPlacement.valid||Math.abs(ghost.position.x+.2)>1e-7)throw new Error('Preview did not snap to neighbour');
    pointer(-.15,0,.15,'click');
    const placed=v.selectableMeshes.at(-1);
    if(v.selectableMeshes.length!==2||Math.abs(placed.position.x+.2)>1e-7||Math.abs(placed.position.z-.4)>1e-7||placed.position.y!==0)throw new Error('Cabinet placement differs from preview');
    if(placed.userData.wardrobeAttachment?.wallId!=='back')throw new Error('Automatic wall attachment missing');
    pointer(-.2,0,.15,'click');if(v.selectableMeshes.length!==2)throw new Error('Overlapping placement was accepted');
    pointer(-3.8,0,.1,'mousemove');pointer(-3.8,0,.1,'click');
    if(v.selectableMeshes.length!==3||Math.abs(v.selectableMeshes.at(-1).position.x+3.6)>1e-7)throw new Error('Corner fitting failed');
    choose('loft-teal-oak-1');
    if(!document.querySelector('#loft-wall-snap').checked)throw new Error('Loft wall detection is not automatic');
    pointer(.5,2.2,.15,'mousemove');pointer(.5,2.2,.15,'click');
    const loft=v.selectableMeshes.at(-1);
    if(v.selectableMeshes.length!==4||Math.abs(loft.position.x-.4)>1e-7||Math.abs(loft.position.y-2.2)>1e-7)throw new Error('Loft placement changed its height or left a side gap');
    if(JSON.stringify(other.toJSON())!==before)throw new Error('Placing cabinets altered existing dimensions');
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
    document.querySelector('#catalog-toggle-btn').click();
    return {cataloguePlacement:'preview equals click',corner:'flush with both walls',adjacent:'exact edge, unequal height/depth preserved',overlap:'rejected',loft:'requested base height retained'};
  })()`));
  await screenshot('wardrobe-placement');
  await c('Page.reload');await ready(`window.__structureTest?.selectableMeshes.length===4&&window.__structureTest.viewerControls`);
  if(!await evaluate(`window.__structureTest.selectableMeshes.filter(n=>n.userData.wardrobeAttachment?.wallId==='back').length===3`))throw new Error('Automatic attachments did not survive reload');
  console.log('Browser exceptions:',JSON.stringify(errors));if(errors.length)process.exitCode=1;
  console.log('PASS: real viewer structural edits, mirrors, catalogue wall/corner/adjacent placement, reload, laminates, isolation and mobile layout.');
}finally{ws?.close();chrome.kill();server.kill();clearTimeout(deadline);}
