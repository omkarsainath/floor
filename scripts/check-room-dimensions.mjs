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
  await c('Page.navigate', { url: `${origin}/tracer.html` });
  for (let i = 0; i < 50 && !await evaluate(`typeof autoDetectWalls === 'function'`); i++) await pause(200);
  console.log(await evaluate(`(async()=>{
    document.querySelector('#scanOnUpload').checked=false;
    const image=document.createElement('canvas'); image.width=500; image.height=300;
    const ctx=image.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,500,300);
    const blob=await new Promise(r=>image.toBlob(r));
    handleImageUpload({target:{files:[new File([blob],'room-size-test.png',{type:'image/png'})],value:''}});
    return 'Loaded isolated test plan';
  })()`));
  for(let i=0;i<30;i++){if(await evaluate(`document.querySelector('#status').textContent.startsWith('Image loaded')`))break;await pause(100);}
  console.log(await evaluate(`(async()=>{
    const testCutout=${process.argv.includes('--cutout')};
    const testPassage=${process.argv.includes('--passage')};
    document.querySelector('#defaultWallThickness').value='.329';
    const canvas=document.querySelector('canvas');
    const click=async(x,y)=>{const r=canvas.getBoundingClientRect();canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:r.left+x*r.width/canvas.width,clientY:r.top+y*r.height/canvas.height}));await new Promise(r=>setTimeout(r,0));};
    if(testPassage){
      setMode('wall');
      for(const [a,b] of [[[10,10],[230,10]],[[10,10],[10,230]],[[10,230],[230,230]],[[230,10],[230,160]]]){await click(...a);await click(...b);}
    }
    document.querySelector('#manualRoomShape').value='rectangle';setMode('room');
    document.querySelector('#manualRoomName').value='Hall';
    document.querySelector('#manualRoomWidth').value='invalid';document.querySelector('#manualRoomDepth').value='4.995 m';
    // Deliberately offset the trace three source-image pixels from the faces.
    await click(23,23);await click(223,223);await finishRoom();
    if(!document.querySelector('#status').textContent.includes('Invalid room width'))throw new Error('Invalid width accepted');
    document.querySelector('#manualRoomWidth').value='3.29 m';
    if(testCutout){
      document.querySelector('#manualCutoutEnabled').checked=true;
      document.querySelector('#manualCutoutCorner').value='top-left';
      document.querySelector('#manualCutoutWidth').value='1 m';
      document.querySelector('#manualCutoutDepth').value='2 m';
    }
    await finishRoom();
    if(!document.querySelector('#roomMeasurements').textContent.includes('exact width 3.29 m'))throw new Error('Width not saved');
    const first=await generateJSON();
    if(!first||JSON.parse(first).walls.length!==(testCutout?6:4))throw new Error('Room without scanned walls did not create its own boundary');
    if(testPassage){
      const data=JSON.parse(first),room=data.rooms[0],maxX=Math.max(...room.points.map(p=>p.x)),minY=Math.min(...room.points.map(p=>p.y));
      const right=data.walls.filter(w=>Math.abs(w.start.x-maxX-.329/2)<1e-6&&Math.abs(w.end.x-maxX-.329/2)<1e-6);
      if(right.length!==1||Math.abs(Math.max(right[0].start.y,right[0].end.y)-(minY+(160-23)/200*4.995))>1e-6)throw new Error('Hall kitchen passage was closed or shifted');
      if(!document.querySelector('#constraintResult').textContent.includes('open passage'))throw new Error('Preserved opening not reported');
    }
    if(testCutout){
      const data=JSON.parse(first);
      if(Math.abs(data.dimension_constraint_report.cutouts[0].area_m2-(3.29*4.995-2))>1e-6)throw new Error('Bathroom area was not subtracted');
      if(!data.suppress_bounding_floor)throw new Error('Bounding floor still fills cut-out');
      if(!document.querySelector('#constraintResult').textContent.includes('bathroom cut-out'))throw new Error('Area subtraction not shown');
      // Exercise saved-room editing, removal, and undo through the real UI.
      const editor=document.querySelector('#roomMeasurements details');
      const fields=editor.querySelectorAll('input');fields[0].checked=false;
      editor.querySelector('button').click();await new Promise(r=>setTimeout(r,30));
      const removed=JSON.parse(await generateJSON());
      if(removed.rooms[0].points.length!==4)throw new Error('Removing cut-out did not restore rectangle');
      undo();await new Promise(r=>setTimeout(r,30));
      const restored=JSON.parse(await generateJSON());
      if(restored.rooms[0].points.length!==6||!restored.rooms[0].cutout)throw new Error('Undo did not restore cut-out');
    }
    document.querySelector('#manualRoomName').value='Bedroom';
    document.querySelector('#manualRoomWidth').value='3.5 m';document.querySelector('#manualRoomDepth').value='3 m';
    await click(243,23);await click(443,223);await finishRoom();
    const json=await generateJSON();if(!json)throw new Error(document.querySelector('#constraintResult').textContent);
    const data=JSON.parse(json),room=data.rooms[0],xs=room.points.map(p=>p.x),ys=room.points.map(p=>p.y);
    if(Math.abs(Math.max(...xs)-Math.min(...xs)-3.29)>1e-6||Math.abs(Math.max(...ys)-Math.min(...ys)-4.995)>1e-6)throw new Error('Exported dimensions wrong');
    if(!data.walls.length||data.walls.some(w=>w.source!=='marked-room'))throw new Error('Marked room walls missing');
    if(data.rooms.length!==2||data.dimension_constraints.length!==4)throw new Error('Both room sizes were not exported');
    const xs2=data.rooms[1].points.map(p=>p.x),ys2=data.rooms[1].points.map(p=>p.y);
    if(Math.abs(Math.max(...xs2)-Math.min(...xs2)-3.5)>1e-6||Math.abs(Math.max(...ys2)-Math.min(...ys2)-3)>1e-6)throw new Error('Second room geometry wrong');
    if(!document.querySelector('#constraintResult').textContent.includes('Hall depth'))throw new Error('Result labels missing');
    if(!document.querySelector('#constraintResult').textContent.includes('marked rooms define'))throw new Error('Direct room sizing was not used');
    document.querySelector('#manualRoomControls').scrollIntoView();
    return {hall:'3.29 × 4.995 m',bedroom:'3.5 × 3 m',scannedWalls:testPassage?4:0,export:'both rooms and four targets'};
  })()`));
  const button=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('onclick')==='view3D()');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await c('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...button});
  await c('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...button});
  let viewer;
  for(let i=0;i<60;i++){
    const {targetInfos}=await call('Target.getTargets');viewer=targetInfos.find(t=>t.url===`${origin}/index.html`);
    if(viewer)break;await pause(200);
  }
  if(!viewer)throw new Error('View in 3D did not open the viewer');
  const {sessionId:viewerSession}=await call('Target.attachToTarget',{targetId:viewer.targetId,flatten:true});
  let loaded=false;
  for(let i=0;i<80;i++){
    const result=await call('Runtime.evaluate',{expression:`document.body.innerText.includes('source: tracer, rooms: 2')`,returnByValue:true},viewerSession);
    if(result.result?.value){loaded=true;break;}await pause(200);
  }
  if(!loaded)throw new Error('Viewer did not load the two saved rooms');
  console.log('View in 3D opened the actual viewer with both rooms.');
  // Exercise the blocked-popup fallback in this isolated profile as well.
  const navigationError=error=>/Inspected target navigated or closed|Execution context was destroyed|Cannot find context/.test(error.message);
  try { await evaluate(`window.open=()=>null;document.querySelector('button[onclick="view3D()"]').click();`); }
  catch(error){if(!navigationError(error))throw error;}
  for(let i=0;i<60;i++){
    try {if(await evaluate(`location.pathname==='/index.html' && document.readyState==='complete'`))break;}
    catch(error){if(!navigationError(error))throw error;}
    await pause(200);
  }
  if(!await evaluate(`location.pathname==='/index.html'`))throw new Error('Blocked-popup fallback did not navigate');
  if(errors.length)throw new Error(JSON.stringify(errors));
  const screenshot = await c('Page.captureScreenshot', { format: 'png' });
  await writeFile('/private/tmp/room-size-controls.png', Buffer.from(screenshot.data, 'base64'));
  console.log('PASS: two marked rooms with different depths, exact export, actual viewer opening and blocked-popup fallback.');
  if(process.argv.includes('--cutout')) console.log('PASS: bathroom cut-out area, six-corner geometry, removal and undo.');
  if(process.argv.includes('--passage')) console.log('PASS: Hall kitchen passage preserved after marking and resizing.');
} finally {
  ws?.close(); chrome.kill(); clearTimeout(deadline);
}
