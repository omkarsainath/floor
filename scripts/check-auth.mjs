// Real browser + real account APIs, isolated from user accounts and browser data.
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const temp=await mkdtemp('/private/tmp/ai3d-auth-'),origin='http://127.0.0.1:5189';
const env={...process.env,AUTH_DB_PATH:`${temp}/accounts.sqlite3`,APP_ORIGIN:origin,GOOGLE_CLIENT_ID:'',API_PROXY_TARGET:'http://127.0.0.1:5069'};
const password='Browser-test-password-23';
const children=[];
const start=(cmd,args,options={})=>{const child=spawn(cmd,args,{env,stdio:['ignore','pipe','pipe'],...options});children.push(child);return child;};
const waitOutput=(child,pattern)=>new Promise((resolve,reject)=>{
 let output='';const timer=setTimeout(()=>reject(Error(`Startup timeout: ${output.slice(-2000)}`)),30000);
 const read=data=>{output+=data;const match=output.match(pattern);if(match){clearTimeout(timer);resolve(match);}};
 child.stdout.on('data',read);child.stderr.on('data',read);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(Error(`Process exited ${code}: ${output.slice(-2000)}`));});
});
let ws;
const deadline=setTimeout(()=>{for(const child of children)child.kill('SIGTERM');process.exit(2);},180000);
try{
 const seed=start('.venv311/bin/python',['-c',`import sys;sys.path.insert(0,'apps/backend/src');from auth import AuthStore;s=AuthStore();s.register('admin@example.com',${JSON.stringify(password)},'Administrator');s.promote('admin@example.com');print('seeded',flush=True)`]);
 await waitOutput(seed,/seeded/);
 const backend=start('.venv311/bin/python',['-u','apps/backend/src/auth_server.py','--port','5069']);await waitOutput(backend,/Account server running/);
 const vite=start(process.execPath,['node_modules/vite/bin/vite.js','apps/frontend','--host','127.0.0.1','--port','5189','--strictPort']);await waitOutput(vite,/5189/);
 const chrome=start('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync','--remote-debugging-port=0',`--user-data-dir=${temp}/chrome`,'about:blank']);
 const endpoint=(await waitOutput(chrome,/DevTools listening on (ws:\/\/[^\s]+)/))[1];
 ws=new WebSocket(endpoint);await new Promise(resolve=>ws.onopen=resolve);
 let seq=0;const pending=new Map(),errors=[];
 ws.onmessage=({data})=>{const message=JSON.parse(data);if(message.id){const task=pending.get(message.id);pending.delete(message.id);message.error?task.reject(Error(JSON.stringify(message.error))):task.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);};
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await call('Target.createTarget',{url:'about:blank'}),{sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
 const c=(method,params={})=>call(method,params,sessionId);
 const evaluate=async expression=>{const result=await c('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const ready=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(150);}throw Error(`Timed out: ${expression}`);};
 const navigate=path=>c('Page.navigate',{url:origin+path});
 const screenshot=async name=>{const {data}=await c('Page.captureScreenshot',{format:'png'});await writeFile(`${temp}/${name}.png`,Buffer.from(data,'base64'));};
 const login=async email=>{
  await ready(`!!document.querySelector('#auth-form')?.onsubmit`);
  await evaluate(`(()=>{document.querySelector('#email').value=${JSON.stringify(email)};document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#auth-form').requestSubmit();})()`);
 };
 await c('Page.enable');await c('Runtime.enable');await c('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await navigate('/builder.html');await ready(`location.pathname==='/login.html'&&!!document.querySelector('#auth-form')?.onsubmit`);
 await ready(`document.querySelector('#google-status')?.textContent.includes('not configured')`);
 await screenshot('login');
 // Reproduce the JSON cookie installed by Google Identity Services before login.
 await evaluate(`document.cookie='g_state={"i_l":0}; Path=/; SameSite=Lax'`);
 await evaluate(`(async()=>{const response=await fetch('/api/admin/users');if(response.status!==401)throw Error('Anonymous admin API access');localStorage.setItem('easy2DPlanDraft',JSON.stringify({version:1,id:'legacy',name:'Legacy home',units:'ft',revision:0,rooms:[],objects:[]}));document.querySelector('#register-tab').click();document.querySelector('#name').value='Regular User';document.querySelector('#email').value='user@example.com';document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#auth-form').requestSubmit();})()`);
 await ready(`!!document.querySelector('#show3d')?.onclick`);
 await evaluate(`(async()=>{if(document.querySelector('#account-menu a[href="/admin.html"]'))throw Error('User sees admin link');const response=await fetch('/api/admin/users');if(response.status!==403)throw Error('Regular user admin access');const {projectStorage}=await import('/src/auth/storage.js');if(projectStorage.getItem('easy2DPlanDraft')?.includes('legacy'))throw Error('Legacy plans leaked to regular user');document.querySelector('[data-room="0"]').click();})()`);
 await evaluate(`document.querySelector('#show3d').click()`);
 await ready(`!!document.querySelector('#return-to-builder')&&!!document.querySelector('#save-project-toggle')`);
 await evaluate(`document.querySelector('#return-to-builder').click()`);
 await ready(`document.querySelectorAll('#canvas .room').length===1`);
 const userId=await evaluate(`sessionStorage.getItem('ai3d:signed-in-user')`);
 await navigate('/admin.html');await ready(`document.body.textContent.includes('This page is for administrators')`);
 await navigate('/builder.html');await ready(`!!document.querySelector('#account-logout')`);
 await evaluate(`document.querySelector('#account-logout').click()`);
 await ready(`location.pathname==='/login.html'&&!!document.querySelector('#auth-form')?.onsubmit`);
 await evaluate(`(async()=>{if((await fetch('/api/auth/me')).status!==401)throw Error('Logout did not revoke session');})()`);
 await login('admin@example.com');await ready(`!!document.querySelector('#saved-files-toggle')?.onclick`);
 await evaluate(`(async()=>{const {projectStorage}=await import('/src/auth/storage.js');if(!projectStorage.getItem('easy2DPlanDraft')?.includes('legacy'))throw Error('Admin legacy migration missing');if(projectStorage.getItem('preciseFloorplan'))throw Error('Other user plan leaked');})()`);
 await navigate('/admin.html');await ready(`document.querySelector('#total-users')?.textContent==='2'`);
 await screenshot('admin');
 await evaluate(`(()=>{if(document.querySelectorAll('#users-table tr').length!==2)throw Error('User list missing');if(!document.querySelector('#users-table').textContent.includes('user@example.com'))throw Error('User email missing');if(document.querySelector('#active-now').textContent!=='1')throw Error('Active count includes logged-out session');})()`);
 // A fresh tab has no per-tab login marker, even though the session cookie exists.
 const newTab=await call('Target.createTarget',{url:origin+'/tracer.html'});
 await pause(1200);
 const info=await call('Target.getTargetInfo',{targetId:newTab.targetId});
 if(!info.targetInfo.url.includes('/login.html'))throw Error('Fresh tab bypassed login');
 await call('Target.closeTarget',{targetId:newTab.targetId});
 await c('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await evaluate(`(()=>{if(document.documentElement.scrollWidth>innerWidth+1)throw Error('Admin mobile overflow');})()`);
 await screenshot('admin-mobile');
 await evaluate(`document.querySelector('#account-logout').click()`);await ready(`location.pathname==='/login.html'`);
 await ready(`!!document.querySelector('#auth-form')?.onsubmit`);
 await evaluate(`(()=>{if(document.documentElement.scrollWidth>innerWidth+1)throw Error('Login mobile overflow');})()`);await screenshot('login-mobile');
 await login('user@example.com');await ready(`!!document.querySelector('#saved-files-toggle')?.onclick`);
 await evaluate(`(async()=>{const {projectStorage}=await import('/src/auth/storage.js');const archive=JSON.parse(projectStorage.getItem('easy2DSavedPlans')||'[]');if(!archive.some(e=>e.plan.rooms.length===1))throw Error('Account switch lost saved plan');if(sessionStorage.getItem('ai3d:signed-in-user')!==${JSON.stringify(userId)})throw Error('Wrong account');})()`);
 if(errors.length)throw Error(JSON.stringify(errors));
 console.log('Auth browser checks passed: login gate, registration, role enforcement, 2D/3D round trip, logout, new-tab login, account isolation, legacy migration, admin metrics, mobile layout. Artifacts:',temp);
}finally{
 clearTimeout(deadline);ws?.close();for(const child of children)child.kill('SIGTERM');
}
