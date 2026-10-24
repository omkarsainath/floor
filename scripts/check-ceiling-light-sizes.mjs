// Real viewer controls in an isolated browser profile. Frontend must run on 5173.
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
const profile=await mkdtemp('/private/tmp/light-size-browser-');
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank']);
const deadline=setTimeout(()=>{chrome.kill();process.exit(2);},120000);let ws;
try{
  const endpoint=await new Promise((resolve,reject)=>{let output='';chrome.stderr.on('data',b=>{output+=b;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.on('error',reject);});
  ws=new WebSocket(endpoint);await new Promise(resolve=>ws.onopen=resolve);
  let sequence=0;const pending=new Map(),errors=[];
  ws.onmessage=({data})=>{const e=JSON.parse(data);if(e.id){const p=pending.get(e.id);pending.delete(e.id);e.error?p.reject(new Error(JSON.stringify(e.error))):p.resolve(e.result);}else if(e.method==='Runtime.exceptionThrown')errors.push(e.params.exceptionDetails);};
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
  const {targetId}=await call('Target.createTarget',{url:'about:blank'}),{sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const c=(method,params={})=>call(method,params,sessionId);
  const evaluate=async expression=>{const r=await c('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const ready=async()=>{for(let i=0;i<100;i++){if(await evaluate('!!window.__lightSizeTest?.controller'))return;await new Promise(r=>setTimeout(r,150));}throw new Error('Viewer not ready');};
  ws.addEventListener('message',async({data})=>{
    const e=JSON.parse(data);if(e.method!=='Fetch.requestPaused')return;
    const {requestId}=e.params;
    try{const response=await c('Fetch.getResponseBody',{requestId});const source=response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body;
      const hook='\nwindow.__lightSizeTest={THREE,camera,renderer,get controller(){return roomDesignController;}};';
      await c('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(source+hook).toString('base64')});
    }catch(error){errors.push(String(error));await c('Fetch.continueRequest',{requestId});}
  });
  await c('Page.enable');await c('Runtime.enable');await c('Fetch.enable',{patterns:[{urlPattern:'*/src/main.js*',requestStage:'Response'}]});
  await c('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await c('Page.navigate',{url:'http://localhost:5173/tracer.html'});
  await new Promise(r=>setTimeout(r,500));
  await evaluate(`localStorage.setItem('preciseFloorplan',JSON.stringify({units:'m',rooms:[{id:'room',name:'Living Room',height:3,points:[{x:0,y:0},{x:6,y:0},{x:6,y:6},{x:0,y:6}],design:{roomType:'living',ceilingLights:[{id:'a',type:'linear-led',x:2,z:2},{id:'b',type:'pendant',x:4,z:4}]}}],walls:[],objects:[]}))`);
  await c('Page.navigate',{url:'http://localhost:5173/index.html'});await ready();
  const setup=`(()=>{
    if(document.getElementById('room-finishes-panel').hidden)document.getElementById('room-finishes-toggle').click();
    window.field=(id,value)=>{const e=document.getElementById(id);if(!e)throw new Error('Missing '+id);e.value=String(value);e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input'));};
    window.savedLights=()=>JSON.parse(localStorage.getItem('preciseFloorplan')).rooms[0].design.ceilingLights;
    window.fixtureSize=id=>{const v=__lightSizeTest,root=v.controller.getGroup('room').getObjectByName('ceiling-light:'+id);return root?new v.THREE.Box3().setFromObject(root.getObjectByName('fixture-body')).getSize(new v.THREE.Vector3()).toArray():null;};
    window.clickFixture=id=>{
      const v=__lightSizeTest,root=v.controller.getGroup('room').getObjectByName('ceiling-light:'+id);
      root.updateWorldMatrix(true,true);
      const part=root.getObjectByName('fixture-body').children.at(-1),point=part.getWorldPosition(new v.THREE.Vector3());
      v.camera.position.copy(point).add(new v.THREE.Vector3(0,-1,1));v.camera.lookAt(point);v.camera.updateMatrixWorld(true);
      point.project(v.camera);
      v.renderer.domElement.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:(point.x+1)*innerWidth/2,clientY:(1-point.y)*innerHeight/2}));
    };
  })()`;
  await evaluate(setup);
  console.log(await evaluate(`(()=>{
    if(!document.getElementById('finish-remove-light').disabled)throw new Error('New light deletion must be disabled');
    clickFixture('b');
    if(document.getElementById('finish-light-selection').value!=='b')throw new Error('Orbit click did not open the individual light');
    [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Walk').click();
    clickFixture('a');
    if(document.getElementById('finish-light-selection').value!=='a')throw new Error('Walk click did not open the individual light');
    document.querySelector('[data-edit-light-id="b"]').click();
    if(document.getElementById('finish-light-selection').value!=='b'||document.getElementById('finish-light-width').valueAsNumber!==46)throw new Error('Individual Edit button selected the wrong light');
    field('finish-light-drop',60);
    if(savedLights().find(l=>l.id==='b').dropM!==.6)throw new Error('Hanging length did not update live');
    document.querySelector('[data-edit-light-id="a"]').click();
    const neighbour=__lightSizeTest.controller.getGroup('room').getObjectByName('ceiling-light:b');
    const widthField=document.getElementById('finish-light-width');widthField.focus();
    field('finish-light-width',180);field('finish-light-depth',24);
    if(document.activeElement!==widthField||document.getElementById('finish-light-width')!==widthField)throw new Error('Live editing interrupted typing');
    field('finish-light-lumens',1200);field('finish-light-temperature',4000);field('finish-light-rotation',30);
    let live=__lightSizeTest.controller.getGroup('room').getObjectByName('ceiling-light:a');
    if(live.userData.placement.lumens!==1200||live.userData.placement.temperatureK!==4000||Math.abs(live.rotation.y-Math.PI/6)>1e-6)throw new Error('Light settings did not update live');
    document.getElementById('finish-light-enabled').click();
    live=__lightSizeTest.controller.getGroup('room').getObjectByName('ceiling-light:a');
    if(live.children.find(n=>n.isLight).intensity!==0)throw new Error('On/off did not update live');
    document.getElementById('finish-light-enabled').click();field('finish-light-rotation',0);
    field('finish-light-type','downlight');
    if(savedLights()[0].type!=='downlight')throw new Error('Light type did not update live');
    field('finish-light-type','linear-led');field('finish-light-width',180);field('finish-light-depth',24);
    if(__lightSizeTest.controller.getGroup('room').getObjectByName('ceiling-light:b')!==neighbour)throw new Error('Live editing rebuilt the other light');
    const size=fixtureSize('a'),lights=savedLights();
    if(Math.abs(size[0]-1.8)>1e-5||Math.abs(size[2]-.24)>1e-5)throw new Error('Fixture did not resize');
    if(lights[0].widthM!==1.8||lights[0].depthM!==.24||lights[1].widthM!==.46)throw new Error('Saved sizes or neighbour changed');
    document.getElementById('finish-light-selection').scrollIntoView({block:'start'});
    return {edit:'per-light buttons and Orbit/Walk clicks',resize:'180 × 24 cm',neighbour:'unchanged'};
  })()`));
  console.log(await evaluate(`(()=>{
    field('finish-light-type','downlight');field('finish-light-width',180);field('finish-light-depth',24);
    field('finish-light-position-x',250);field('finish-light-position-z',150);
    field('finish-light-beam-width',120);field('finish-light-beam-height',40);field('finish-light-aim-tilt',60);field('finish-light-aim-direction',180);
    const light=__lightSizeTest.controller.getGroup('room').getObjectByName('ceiling-light:a'),emitter=light.children.find(n=>n.isSpotLight),saved=savedLights()[0];
    if(light.position.x!==2.5||light.position.z!==1.5||saved.x!==2.5||saved.z!==1.5)throw new Error('Position fields did not move and save the light');
    if(saved.beamWidthM!==1.2||saved.beamHeightM!==.4||saved.aimTiltDegrees!==60||saved.aimDirectionDegrees!==180||!emitter.map)throw new Error('Beam width, height or aiming failed');
    return {position:'250 × 150 cm',beam:'120 × 40 cm at 1 m',aim:'60 degree tilt / 180 degree direction'};
  })()`));
  const beamViews=await evaluate(`(async()=>{const {renderBeam}=await import('/tests/ceiling-beam-render.js');return {wide:renderBeam(1.2,.4),narrow:renderBeam(.4,.4),tall:renderBeam(.4,.8)};})()`);
  if(beamViews.wide.peak<20||beamViews.wide.widthPx<beamViews.narrow.widthPx*1.5||beamViews.tall.heightPx<beamViews.narrow.heightPx*1.3)throw new Error('Rendered wall illumination did not change with beam dimensions: '+JSON.stringify(Object.fromEntries(Object.entries(beamViews).map(([k,{image,...v}])=>[k,v]))));
  for(const [name,{image,...metrics}] of Object.entries(beamViews)){await writeFile('/private/tmp/light-beam-'+name+'.png',Buffer.from(image.split(',')[1],'base64'));console.log('Wall beam '+name,metrics);}
  const shot=await c('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/ceiling-light-sizes.png',Buffer.from(shot.data,'base64'));
  await c('Page.reload');await ready();await evaluate(setup);
  console.log(await evaluate(`(()=>{
    field('finish-light-selection','a');
    if(document.getElementById('finish-light-width').valueAsNumber!==180||document.getElementById('finish-light-depth').valueAsNumber!==24)throw new Error('Size fields did not survive reload');
    if(document.getElementById('finish-light-position-x').valueAsNumber!==250||document.getElementById('finish-light-position-z').valueAsNumber!==150||document.getElementById('finish-light-beam-width').valueAsNumber!==120||document.getElementById('finish-light-beam-height').valueAsNumber!==40||document.getElementById('finish-light-aim-tilt').valueAsNumber!==60)throw new Error('Position and beam did not survive reload');
    field('finish-light-width','');
    if(savedLights()[0].widthM!==1.8||Math.abs(fixtureSize('a')[0]-1.8)>1e-5)throw new Error('Incomplete input damaged the saved light');
    document.getElementById('finish-remove-light').click();
    if(fixtureSize('a')||savedLights().length!==1||savedLights()[0].id!=='b')throw new Error('Deletion failed or removed neighbour');
    return {reload:'dimensions restored',delete:'works even with invalid unsaved size'};
  })()`));
  await c('Page.reload');await ready();await evaluate(setup);
  if(!await evaluate(`savedLights().length===1&&savedLights()[0].id==='b'&&!fixtureSize('a')&&!!fixtureSize('b')`))throw new Error('Deletion did not persist');
  if(errors.length)throw new Error(JSON.stringify(errors));
  console.log('PASS: real viewer size controls, geometry, isolated deletion and project reload.');
}finally{ws?.close();chrome.kill();clearTimeout(deadline);}
