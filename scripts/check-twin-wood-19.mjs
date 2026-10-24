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

  await c('Emulation.setDeviceMetricsOverride',{width:1350,height:1000,deviceScaleFactor:1,mobile:false});
  await c('Page.navigate',{url:origin+'/tests/twin-wood-19-preview.html'});
  let ready=false;
  for(let i=0;i<150;i++){if(await evaluate("document.body.dataset.ready==='true'")){ready=true;break;}await pause(200);}
  if(!ready)throw new Error('No. 19 review did not render');
  const metrics=await evaluate('window.no19Metrics');
  metrics.orbit=await evaluate('window.checkFullOrbit()');
  for(const [i,n] of [2.794,.8382,2.794].entries())if(Math.abs(metrics.size[i]-n)>1e-5)throw new Error('Incorrect measured envelope');
  for(const angle of ['catalogue','front','rear','left','right','top']){
    const data=await evaluate(`window.no19Images['${angle}']`);
    await writeFile('docs/sofa-no19/'+angle+'.png',Buffer.from(data.split(',')[1],'base64'));
  }
  const data=await evaluate('window.exportNo19()');
  await writeFile('apps/frontend/public/catalog/sofa-factory/twin-wood-handle-19.glb',Buffer.from(data,'base64'));
  const glbImage=await evaluate('window.no19GlbImage');
  await writeFile('docs/sofa-no19/glb-roundtrip.png',Buffer.from(glbImage.split(',')[1],'base64'));
  await writeFile('docs/sofa-no19/validation.json',JSON.stringify(metrics,null,2));
  if(errors.length)throw new Error(JSON.stringify(errors));
  console.log('PASS: six views, precise envelope and GLB roundtrip',metrics);
} finally {ws?.close();chrome.kill();clearTimeout(deadline);}
