// Requires the local frontend and backend. Uses an isolated Chrome profile.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = process.env.CHECK_ORIGIN || 'http://localhost:5173';
const plan = resolve(process.argv[2] || 'Puli Floor plan_page-0001.jpg');
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
  console.log('Browser health:', await evaluate(`fetch('/api/health').then(async r => {
    const data = await r.json(); if (!r.ok || data.status !== 'running') throw new Error('Backend unavailable');
    return {status: data.status, detection: data.capabilities.object_detection, ocr: data.ocr.available};
  })`));
  const { root } = await c('DOM.getDocument');
  const { nodeId } = await c('DOM.querySelector', { nodeId: root.nodeId, selector: '#fileInput' });
  await c('DOM.setFileInputFiles', { nodeId, files: [plan] });
  let status = '', lastStatus = '';
  for (let i = 0; i < 210; i++) {
    const result = await evaluate(`({ status: document.querySelector('#status').textContent,
      error: document.querySelector('#scanBackendStatus').hidden ? '' : document.querySelector('#scanBackendStatus').textContent,
      busy: document.querySelector('#btnAutoDetect').disabled })`);
    if (result.error) throw new Error(result.error);
    status = result.status;
    if (status !== lastStatus) { console.log(status); lastStatus = status; }
    if (!result.busy && status.startsWith('Auto-detected')) break;
    await pause(1000);
  }
  if (!status.startsWith('Auto-detected')) throw new Error(`Scan did not complete: ${status}`);
  if (!responses.some(r => r.url === `${origin}/api/auto-detect` && r.status === 200)) throw new Error('No successful same-origin scan');
  if (responses.some(r => new URL(r.url).origin !== origin)) throw new Error('Cross-origin backend request');
  if (errors.length) throw new Error(JSON.stringify(errors));
  const screenshot = await c('Page.captureScreenshot', { format: 'png' });
  await writeFile('/private/tmp/backend-tracer-scan.png', Buffer.from(screenshot.data, 'base64'));
  console.log('PASS: browser health check, real image upload, automatic scan, and same-origin API responses.', responses);
} finally {
  ws?.close(); chrome.kill(); clearTimeout(deadline);
}
