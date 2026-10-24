import { projectStorage } from '../auth/storage.js';
import {persistLayout} from '../state/projectPersistence.js';
import {createProjectFile,readProjectFile,openProjectFile,projectFilename,PREVIOUS_PROJECT_KEY} from '../state/projectFiles.js';

export function setupProjectPanel({getLayout,beforeSave=()=>{}}){
 const style=document.createElement('style');style.textContent=`
 #save-project-toggle{position:fixed;right:14px;top:102px;z-index:39;border:0;border-radius:9px;background:#4054d5;color:white;padding:10px 16px;font:14px system-ui;cursor:pointer}
 #project-dialog{width:min(430px,calc(100vw - 48px));max-height:80vh;overflow:auto;border:1px solid #d3dceb;border-radius:16px;padding:22px;background:#fff;color:#172033;box-shadow:0 15px 60px #0004;font:15px/1.5 system-ui}
 #project-dialog::backdrop{background:#11182770}#project-dialog h2{margin:0;font-size:22px}#project-dialog p{margin:12px 0}#project-dialog label{display:block;margin:12px 0}#project-dialog input{box-sizing:border-box;max-width:100%;width:100%;padding:10px;border:1px solid #bdc9db;border-radius:8px;font:inherit}
 #project-dialog button{border:1px solid #c2cddd;border-radius:9px;padding:10px 14px;min-height:44px;background:white;color:#243858;cursor:pointer;font:inherit}#project-dialog button.primary{background:#4054d5;color:white}#project-dialog button:disabled{opacity:.5;cursor:default}
 #project-dialog .actions{display:flex;gap:8px;flex-wrap:wrap}#project-dialog .heading{display:flex;align-items:center;justify-content:space-between;gap:10px}#project-dialog hr{border:0;border-top:1px solid #dce2ed;margin:20px 0}#project-status[data-error=true]{color:#a32828}#project-status{color:#176448}
 `;document.head.append(style);
 const button=document.createElement('button');button.id='save-project-toggle';button.textContent='Save project';button.setAttribute('aria-haspopup','dialog');
 const dialog=document.createElement('dialog');dialog.id='project-dialog';dialog.setAttribute('aria-labelledby','project-title');
 dialog.innerHTML=`<div class="heading"><h2 id="project-title">Save your project</h2><button id="project-close" aria-label="Close save project">Close</button></div><p>Keep your layout, furniture, sizes, colours and finishes so you can continue later.</p><label>Project name<input id="project-name" maxlength="160" value="My home"></label><div class="actions"><button id="project-save" class="primary">Save on this device</button><button id="project-download">Download backup</button></div><p>Your device keeps the current project. Download a backup to keep separate projects or move one to another computer.</p><hr><label>Open a saved project<input id="project-file" type="file" accept=".json,application/json"></label><button id="project-previous">Restore previous project</button><p id="project-preview" hidden></p><button id="project-open" class="primary" hidden>Open this project</button><p id="project-status" role="status" aria-live="polite"></p>`;
 document.body.append(button,dialog);const $=s=>dialog.querySelector(s);let pending=null;
 // The modal owns keyboard input; editing its name must not move the camera
 // or trigger model deletion/undo behind it. Escape still closes the dialog.
 for(const type of ['keydown','keyup'])dialog.addEventListener(type,event=>event.stopPropagation());
 const status=(message,error=false)=>{ $('#project-status').textContent=message;$('#project-status').dataset.error=String(error);};
 const snapshot=()=>{beforeSave();return createProjectFile(getLayout(),$('#project-name').value);};
 const showPending=p=>{pending=p;$('#project-preview').hidden=false;$('#project-preview').textContent=`${p.name}: ${p.layout.rooms.length} rooms, ${p.layout.walls.length} walls, ${p.layout.objects.length} items. Opening replaces the current view; your current project is kept under Restore previous project.`;$('#project-open').hidden=false;status('Backup checked. Click Open this project to continue.');};
 button.onclick=()=>{pending=null;$('#project-preview').hidden=true;$('#project-open').hidden=true;$('#project-file').value='';$('#project-name').value=getLayout().projectName||'My home';status('');try{$('#project-previous').disabled=!projectStorage.getItem(PREVIOUS_PROJECT_KEY);}catch{$('#project-previous').disabled=true;}dialog.showModal();};
 $('#project-close').onclick=()=>dialog.close();
 $('#project-save').onclick=()=>{try{beforeSave();const layout=getLayout();layout.projectName=$('#project-name').value.trim()||'My home';if(!persistLayout(layout))throw Error('Could not save on this device. Use Download backup to keep your work.');status('Saved on this device. You can close the page and return later.');}catch(e){status(e.message,true);}};
 $('#project-download').onclick=()=>{try{const project=snapshot();project.layout.projectName=project.name;const url=URL.createObjectURL(new Blob([JSON.stringify(project,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=projectFilename(project.name);document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);status('Backup download started. Keep the .project.json file to reopen this project later.');}catch(e){status(e.message,true);}};
 $('#project-file').onchange=async e=>{pending=null;$('#project-open').hidden=true;$('#project-preview').hidden=true;try{const file=e.target.files[0];if(!file)return;const project=readProjectFile(await file.text());showPending(project);}catch(e){status(`Could not open this backup: ${e.message}`,true);}};
 $('#project-previous').onclick=()=>{try{showPending(readProjectFile(projectStorage.getItem(PREVIOUS_PROJECT_KEY)));}catch(e){status(e.message,true);}};
 $('#project-open').onclick=()=>{if(!pending)return;try{openProjectFile(pending,snapshot());location.reload();}catch(e){status(e.message,true);}};
 return {button,dialog};
}
