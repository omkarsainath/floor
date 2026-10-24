// Requires the local frontend and backend. Uses an isolated Chrome profile.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';

const origin = process.env.CHECK_ORIGIN || 'http://localhost:5173';
const profile = await mkdtemp('/private/tmp/backend-browser-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--disable-background-networking', '--disable-extensions',
  '--disable-sync', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
]);
let ws;
const deadline = setTimeout(() => { chrome.kill(); process.exit(2); }, 240000);
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

  const fixture={units:'m',metersPerUnit:1,calibration:{status:'confirmed'},rooms:[{id:'room',name:'Jamb test',points:[{x:0,y:0},{x:5,y:0},{x:5,y:3},{x:0,y:3}],height:3}],
    walls:[{id:'left',start:{x:0,y:0},end:{x:2,y:0},height:3,thickness:.15},
      {id:'right',start:{x:3.07,y:0},end:{x:5,y:0},height:3,thickness:.15}],
    objects:[{id:'door-test',class:'door',swingDir:'left-inside',bbox:{x1:2.04,y1:-.1,x2:2.94,y2:.1}}]};
  await c('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.setItem('preciseFloorplan',JSON.stringify(${JSON.stringify(fixture)}));
    window.__THREE_DEVTOOLS__=new EventTarget();
    window.__THREE_DEVTOOLS__.addEventListener('observe',event=>{
      const renderer=event.detail;
      if(typeof renderer.render!=='function')return;
      const original=renderer.render;
      renderer.render=function(scene,camera){
        const main=scene.children.some(c=>c.userData.layoutId==='door-test');
        if(main){window.__jambScene=scene;window.__jambOriginalCamera=camera;}
        return original.call(this,scene,main&&window.__jambCamera?window.__jambCamera:camera);
      };
    });
  `});
  await c('Page.navigate',{url:`${origin}/index.html`});
  let ready=false;
  for(let i=0;i<100;i++){
    if(await evaluate(`!!window.__jambScene`)){ready=true;break;}
    await pause(200);
  }
  if(!ready)throw new Error('Actual viewer door did not load');
  console.log(await evaluate(`(async()=>{
    const door=window.__jambScene.children.find(c=>c.userData.layoutId==='door-test');
    door.updateMatrixWorld(true);let bounds;
    door.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      if(materials.every(m=>m.transparent&&m.opacity===0))return;
      mesh.geometry.computeBoundingBox();
      bounds ||= new mesh.geometry.boundingBox.constructor();
      bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    });
    if(Math.abs(bounds.min.x-2)>1e-6||Math.abs(bounds.max.x-3.07)>1e-6)throw new Error('Actual viewer door misses physical jambs: '+bounds.min.x+', '+bounds.max.x);
    const camera=window.__jambOriginalCamera.clone();camera.fov=42;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
    camera.position.set(2.1,1.6,-3.8);camera.lookAt(2.5,1.25,0);window.__jambCamera=camera;
    return {actualDoorLeft:bounds.min.x,actualDoorRight:bounds.max.x,wallJambs:[2,3.07],pass:true};
  })()`));
  await pause(500);
  const screenshot=await c('Page.captureScreenshot',{format:'png'});
  await writeFile('/private/tmp/door-jamb-check.png',Buffer.from(screenshot.data,'base64'));
  if(errors.length)throw new Error(JSON.stringify(errors));
  console.log('PASS: actual viewer door and wall jambs meet; screenshot /private/tmp/door-jamb-check.png');
} finally {
  ws?.close();chrome.kill();clearTimeout(deadline);
}
