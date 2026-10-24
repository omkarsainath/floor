// Requires the local frontend. Uses an isolated Chrome profile.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';

const origin = process.env.CHECK_ORIGIN || 'http://localhost:5173';
await mkdir('/private/tmp/sofa-review', {recursive:true});
const profile = await mkdtemp('/private/tmp/backend-browser-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--disable-background-networking', '--disable-extensions',
  '--disable-sync', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
]);
let ws;
const deadline = setTimeout(() => { chrome.kill(); process.exit(2); }, 600000);
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    chrome.stderr.on('data', b => {
      output += b;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) resolve(match[1]);
    });
    chrome.on('error', reject);
    chrome.on('exit', code => reject(new Error(`Chrome exited ${code}`)));
  });
  ws = new WebSocket(endpoint);
  await new Promise(resolve => { ws.onopen = resolve; });
  let sequence = 0;
  const pending = new Map(), errors = [], responses = [];
  ws.onmessage = ({ data }) => {
    const event = JSON.parse(data);
    if (event.id) {
      const request = pending.get(event.id); pending.delete(event.id);
      event.error ? request.reject(new Error(JSON.stringify(event.error))) : request.resolve(event.result);
    } else if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails);
    else if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') errors.push(event.params.args.map(a=>a.value||a.description));
    else if (event.method === 'Network.responseReceived' && event.params.response.url.includes('/api/')) {
      responses.push({ url: event.params.response.url, status: event.params.response.status });
    }
  };
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const c = (method, params = {}) => call(method, params, sessionId);
  const evaluate = async expression => {
    const result = await c('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  await c('Page.enable'); await c('Runtime.enable'); await c('Network.enable');

  await c('Emulation.setDeviceMetricsOverride',{width:1500,height:1150,deviceScaleFactor:1,mobile:false});
  if(process.argv.includes('--viewer')){
    const no19=process.argv.includes('--no19');
    const fixture={units:'m',metersPerUnit:1,calibration:{status:'confirmed'},
      rooms:[{id:'room',name:'Sofa review',points:[{x:0,y:0},{x:5,y:0},{x:5,y:5},{x:0,y:5}],height:3}],
      walls:[{id:'rear',start:{x:0,y:0},end:{x:5,y:0},height:3,thickness:.15},
        {id:'left',start:{x:0,y:0},end:{x:0,y:5},height:3,thickness:.15}],
      objects:[{id:'sofa-review',class:'sf-sofa-beds-p39-01',source:'catalog',bbox:{x1:1,y1:.2,x2:3.7432,y2:2.0288},rotationY:0}]};
    if(no19)Object.assign(fixture.objects[0],{class:'sf-sofas-p18-19',bbox:{x1:1,y1:.2,x2:3.794,y2:2.994}});
    await c('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.setItem('preciseFloorplan',JSON.stringify(${JSON.stringify(fixture)}));
      window.__THREE_DEVTOOLS__=new EventTarget();
      window.__THREE_DEVTOOLS__.addEventListener('observe',event=>{
        const renderer=event.detail;if(typeof renderer.render!=='function')return;
        const original=renderer.render;
        renderer.render=function(scene,camera){
          if(scene.children.some(c=>c.userData.layoutId==='sofa-review')){
            window.__sofaScene=scene;window.__sofaCamera=camera;
          }
          return original.call(this,scene,camera);
        };
      });
    `});
    await c('Page.navigate',{url:origin+'/index.html'});
    let ready=false;
    for(let i=0;i<150;i++){
      if(await evaluate('!!window.__sofaScene')){ready=true;break;}
      await pause(200);
    }
    if(!ready)throw new Error('Sofa did not load in the actual viewer');
    console.log(await evaluate(`(()=>{
      const scene=window.__sofaScene,sofa=scene.children.find(c=>c.userData.layoutId==='sofa-review');
      const parts={};sofa.traverse(n=>{if(n.name)parts[n.name]=(parts[n.name]||0)+1;});
      const detailed=${no19}?parts['loose-back-cushion']===7&&parts['square-end-arm']===2:parts['adjustable-headrest']===4&&parts['arm-shelf-interior']===1;
      if(!scene.environment||!detailed)throw new Error('Missing room-view sofa detail');
      const render=document.getElementById('viewer-render-mode'),rect=render.getBoundingClientRect();
      if(!render.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)))throw new Error('Render control is covered');
      // Keep the scene camera in a fixed inspection pose in this isolated profile.
      const camera=window.__sofaCamera;
      window.__sofaPose=setInterval(()=>{camera.position.set(4.8,1.9,5.2);camera.lookAt(2.35,.57,1.05);camera.updateMatrixWorld();},10);
      return {environment:!!scene.environment,parts,renderButtonVisible:true};
    })()`));
    await pause(1000);
    for(const mode of ['model','render']){
      if(mode==='render'){await evaluate("document.getElementById('viewer-render-mode').click()");await pause(1800);}
      const shot=await c('Page.captureScreenshot',{format:'png'});
      await writeFile((no19?'docs/sofa-no19/viewer-':'/private/tmp/sofa-review/viewer-')+mode+'.png',Buffer.from(shot.data,'base64'));
    }
    if(no19){
      const point=await evaluate(`(()=>{
        const root=window.__sofaScene.children.find(c=>c.userData.layoutId==='sofa-review');
        const seat=root.getObjectByName('seat-x-wing'),p=seat.getWorldPosition(seat.position.clone());
        p.y+=.12;p.project(window.__sofaCamera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
      })()`);
      await c('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await c('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
      await pause(200);
      await evaluate(`(()=>{
        const root=window.__sofaScene.children.find(c=>c.userData.layoutId==='sofa-review');
        const x=root.position.x,yaw=root.rotation.y;
        const click=title=>{const b=[...document.querySelectorAll('button')].find(b=>b.title===title);if(!b)throw new Error('Selection control missing: '+title);b.click();};
        click('Move right (ArrowRight)');if(Math.abs(root.position.x-x-.1)>.00001)throw new Error('Move failed');
        click('Rotate CW 45° (])');if(Math.abs(root.rotation.y-yaw-Math.PI/4)>.00001)throw new Error('Rotation failed');
        click('Move left (ArrowLeft)');click('Rotate CCW 45° ([)');
      })()`);
      console.log('PASS: raycast selection, movement and rotation through existing controls');
      await evaluate(`clearInterval(window.__sofaPose);[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Walk').click()`);
      await evaluate(`document.activeElement?.blur();document.querySelector('canvas').focus()`);
      await pause(500);
      const before=await evaluate(`window.__sofaCamera.quaternion.toArray()`);
      await c('Input.dispatchKeyEvent',{type:'keyDown',key:'e',code:'KeyE'});await pause(600);
      await c('Input.dispatchKeyEvent',{type:'keyUp',key:'e',code:'KeyE'});
      const after=await evaluate(`window.__sofaCamera.quaternion.toArray()`);
      if(before.every((v,i)=>Math.abs(v-after[i])<.001))throw new Error('Walk turning did not respond');
      const walk=await c('Page.captureScreenshot',{format:'png'});await writeFile('docs/sofa-no19/viewer-walk.png',Buffer.from(walk.data,'base64'));
      console.log('PASS: actual viewer Walk mode and continuous camera turning');
    }
    if(errors.length)throw new Error(JSON.stringify(errors));
    console.log('PASS: actual viewer loads the sofa and its detail; Model and Render views work');
  }else{
  const audit=process.argv.includes('--audit');if(audit)await mkdir('docs/sofa-catalogue/after',{recursive:true});
  const pages=process.argv.includes('--all')?[1,2,3,4,5]:[0],results=[];
  for(const page of pages){
    await c('Page.navigate',{url:`${origin}/tests/sofa-upholstery-preview.html?page=${page}${audit?'&allviews=1':''}`});
    let ready=false;
    for(let i=0;i<900;i++){
      try{if(await evaluate(`document.body.dataset.ready==='true'`)){ready=true;break;}}catch{}
      await pause(200);
    }
    if(!ready)throw new Error('Sofa gallery failed to render page '+page);
    const metrics=await evaluate(`window.sofaPreviewResults`);results.push(...metrics);
    if(page&&metrics.length!==15)throw new Error('Missing catalogue products on page '+page);
    const lounger=metrics.find(m=>m.id==='sf-sofa-beds-p39-01');
    if(lounger&&(!lounger.parts['arm-shelf-interior']||lounger.parts['adjustable-headrest']!==4||!lounger.sources.includes(lounger.id)))throw new Error('Lounger construction or its original upholstery is missing');
    if(audit){const views=await evaluate('window.sofaAuditViews');for(const [id,data] of Object.entries(views))await writeFile('docs/sofa-catalogue/after/'+id+'.png',Buffer.from(data.split(',')[1],'base64'));}
    const screenshot=await c('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    const path=page?`/private/tmp/sofa-review/models-${page}.png`:'/private/tmp/sofa-appearance.png';
    await writeFile(path,Buffer.from(screenshot.data,'base64'));
    if(audit)await writeFile(`docs/sofa-catalogue/after/models-${page}.png`,Buffer.from(screenshot.data,'base64'));
    console.log(`Page ${page}: ${metrics.length} products rendered; ${path}`);
  }
  if(errors.length)throw new Error(JSON.stringify(errors));
  await writeFile('/private/tmp/sofa-review/render-results.json',JSON.stringify(results,null,2));
  if(audit)await writeFile('docs/sofa-catalogue/after/render-results.json',JSON.stringify(results,null,2));
  console.log(`PASS: ${results.length} sofa models render without browser errors`);
  }
} finally {
  ws?.close();chrome.kill();clearTimeout(deadline);
}
