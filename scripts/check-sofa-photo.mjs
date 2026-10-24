// Requires the local frontend. Uses an isolated Chrome profile.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';

const origin = process.env.CHECK_ORIGIN || 'http://localhost:5173';
await mkdir('docs/sofa-catalogue/upload', {recursive:true});
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

  await c('Emulation.setDeviceMetricsOverride',{width:1500,height:1120,deviceScaleFactor:1,mobile:false});
  const fixture={units:'m',metersPerUnit:1,calibration:{status:'confirmed'},rooms:[{id:'room',name:'Sofa upload check',points:[{x:0,y:0},{x:7,y:0},{x:7,y:7},{x:0,y:7}],height:3}],walls:[{id:'rear',start:{x:0,y:0},end:{x:7,y:0},height:3,thickness:.15}],objects:[{id:'anchor',class:'sofa-2',source:'catalog',bbox:{x1:.1,y1:.1,x2:1.7,y2:.98}}]};
  await c('Page.addScriptToEvaluateOnNewDocument',{source:`
    if(!localStorage.getItem('photoTestInitialized')){localStorage.setItem('preciseFloorplan',JSON.stringify(${JSON.stringify(fixture)}));localStorage.setItem('photoTestInitialized','1');}
    window.__THREE_DEVTOOLS__=new EventTarget();window.__THREE_DEVTOOLS__.addEventListener('observe',event=>{const renderer=event.detail;if(typeof renderer.render!=='function')return;const original=renderer.render;renderer.render=function(scene,camera){if(scene.children.some(c=>c.userData.layoutId==='anchor')){window.__roomScene=scene;window.__roomCamera=camera;window.__roomCanvas=this.domElement;}return original.call(this,scene,camera);};});
  `});
  await c('Page.navigate',{url:origin+'/index.html'});
  async function until(expression){for(let i=0;i<300;i++){if(await evaluate(expression))return;await pause(100);}throw new Error('Timed out: '+expression);}
  await until('!!window.__roomScene');
  await evaluate(`document.getElementById('catalog-toggle-btn').click();document.getElementById('upload-sofa-photo').click();`);
  await until(`!!document.getElementById('sofa-photo-dialog')`);
  await evaluate(`(()=>{const f=document.getElementById('sofa-photo-file'),dt=new DataTransfer();dt.items.add(new File(['bad'],'bad.txt',{type:'text/plain'}));f.files=dt.files;f.dispatchEvent(new Event('change'));})()`);
  await until(`document.getElementById('sofa-photo-status').textContent.includes('JPEG')`);
  await evaluate(`(async()=>{const blob=await fetch('/catalog/sofa-factory/sf-sofa-beds-p39-01.webp').then(r=>r.blob()),file=new File([blob],'reference-sofa.webp',{type:'image/webp'}),dt=new DataTransfer();dt.items.add(file);const f=document.getElementById('sofa-photo-file');f.files=dt.files;f.dispatchEvent(new Event('change'));})()`);
  await until(`document.getElementById('sofa-photo-status').textContent.startsWith('Photo read.')`);
  const match=await evaluate(`document.getElementById('sofa-photo-reference').value`);
  if(match!=='sf-sofa-beds-p39-01')throw new Error('Exact catalogue photo was not retrieved: '+match);
  await evaluate(`document.getElementById('sofa-photo-build').click()`);
  if(!await evaluate(`document.getElementById('sofa-photo-place').disabled`))throw new Error('Unmeasured model allowed placement');
  await evaluate(`document.getElementById('sofa-photo-dimensions').click();document.getElementById('sofa-photo-build').click();`);
  await until(`!document.getElementById('sofa-photo-place').disabled`);
  const previewShot=await c('Page.captureScreenshot',{format:'png'});await writeFile('docs/sofa-catalogue/upload/editor.png',Buffer.from(previewShot.data,'base64'));
  await evaluate(`(()=>{const unit=document.getElementById('sofa-photo-unit');unit.value='0.001';unit.dispatchEvent(new Event('change'));if(Math.abs(Number(document.getElementById('sofa-photo-width').value)-2743.2)>.01)throw new Error('mm conversion');document.getElementById('sofa-photo-build').click();})()`);
  // Change the photo draft into a genuine two-wing corner, with explicit user
  // dimensions, to test the editable path rather than only catalogue retrieval.
  await evaluate(`(()=>{const el=k=>document.getElementById('sofa-photo-'+k);el('layout').value='corner';el('width').value=2800;el('depth').value=2700;el('height').value=900;el('seatingDepth').value=850;el('mainSeats').value=3;el('wingSeats').value=2;el('mainBacks').value=3;el('wingBacks').value=2;el('build').click();})()`);
  await until(`!document.getElementById('sofa-photo-place').disabled`);
  // Exercise the export code and reload the embedded textures and mesh data.
  const glb=await evaluate(`(async()=>{const {createPhotoSofa,exportFurnitureGLB,GLTFLoader,THREE:T}=await import('/tests/sofa-photo-helpers.js');const model=createPhotoSofa({version:1,referenceId:'sf-sofa-beds-p39-01',layout:'corner',width:2.8,depth:2.7,height:.9,seatingDepth:.85,mainSeats:3,wingSeats:2,mainBacks:3,wingBacks:2,seatColor:'#928679',frameColor:'#665b52'});const buffer=await exportFurnitureGLB(model),loaded=await new GLTFLoader().parseAsync(buffer,'');const size=new T.Box3().setFromObject(loaded.scene).getSize(new T.Vector3());if(Math.abs(size.x-2.8)>.0001||Math.abs(size.y-.9)>.0001||Math.abs(size.z-2.7)>.0001)throw new Error('GLB size changed');let str='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=32768)str+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(str);})()`);
  await writeFile('docs/sofa-catalogue/upload/photo-sofa.glb',Buffer.from(glb,'base64'));
  await evaluate(`document.getElementById('sofa-photo-place').click();window.__pose=setInterval(()=>{window.__roomCamera.position.set(7,7,10);window.__roomCamera.lookAt(3.5,0,3.5);window.__roomCamera.updateMatrixWorld();},10);`);
  await pause(500);
  const point=await evaluate(`(async()=>{const {THREE:T}=await import('/tests/sofa-photo-helpers.js'),p=new T.Vector3(3.6,0,3.4);p.project(window.__roomCamera);const r=window.__roomCanvas.getBoundingClientRect();return {x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};})()`);
  await c('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await pause(500);
  await c('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await c('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  await until(`JSON.parse(localStorage.getItem('preciseFloorplan')).objects.some(o=>o.class==='uploaded-sofa')`);
  const placed=await evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('preciseFloorplan')).objects.find(o=>o.class==='uploaded-sofa');const root=window.__roomScene.children.find(n=>n.userData.layoutId===p.id);if(!root?.getObjectByName('corner-return')?.getObjectByName('back-shell'))throw new Error('Missing return back');return {id:p.id,photoBytes:p.photoSofaSpec.photo.length,spec:p.photoSofaSpec};})()`);
  await c('Page.reload');await until(`!!window.__roomScene&&window.__roomScene.children.some(n=>n.userData.objectType==='uploaded-sofa')`);
  const checked=await evaluate(`(()=>{const root=window.__roomScene.children.find(n=>n.userData.objectType==='uploaded-sofa');if(root.userData.photoSofaSpec.mainSeats!==3)throw new Error('Editable config lost after reload');window.__pose=setInterval(()=>{window.__roomCamera.position.set(6.5,2.5,7);window.__roomCamera.lookAt(root.position.x,.5,root.position.z);window.__roomCamera.updateMatrixWorld();},10);return {layout:root.userData.sofaDesign.layout,id:root.userData.layoutId};})()`);
  await pause(700);const roomShot=await c('Page.captureScreenshot',{format:'png'});await writeFile('docs/sofa-catalogue/upload/placed-room.png',Buffer.from(roomShot.data,'base64'));
  if(errors.length)throw new Error(JSON.stringify(errors));
  await writeFile('docs/sofa-catalogue/upload/results.json',JSON.stringify({match,placed,checked,checks:['invalid file','required dimensions','metres to millimetres','editable corner mesh','GLB texture embedding and dimension roundtrip','ghost and click placement','project reload']},null,2));
  console.log('PASS: photo upload, reference retrieval, dimensions, editable geometry, GLB, room placement and saved-project reload');
}finally{ws?.close();chrome.kill();clearTimeout(deadline);}
