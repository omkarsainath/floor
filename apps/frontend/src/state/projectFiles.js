import { projectStorage } from '../auth/storage.js';
import {parseLayout} from '../loaders/jsonLoader.js';
import {DRAFT_KEY,validatePlan} from '../builder/model.js';

export const PREVIOUS_PROJECT_KEY='previous3DProjectBackup';
const clone=value=>JSON.parse(JSON.stringify(value));

export function createProjectFile(layout,name='My home',storage=projectStorage){
 const project={format:'ai-3d-project',version:1,name:String(name).trim()||'My home',savedAt:new Date().toISOString(),layout:clone(layout)};
 // Carry the editable 2D source only when it belongs to this exact project.
 try{const draft=JSON.parse(storage?.getItem(DRAFT_KEY)||'null');if(draft?.id===layout.builder?.id&&draft?.revision===layout.builder?.revision)project.builderDraft=clone(validatePlan(draft));}catch{ /* The 3D backup remains usable without its 2D source. */ }
 return readProjectFile(project);
}
export function readProjectFile(value){
 const project=typeof value==='string'?JSON.parse(value):clone(value);
 if(!project||project.format!=='ai-3d-project'||project.version!==1||!project.layout||!['walls','rooms','objects'].every(key=>Array.isArray(project.layout[key])))throw Error('Choose a project backup downloaded using Save project.');
 project.layout=parseLayout(project.layout);
 project.name=typeof project.name==='string'?project.name.slice(0,160):'My home';
 project.layout.projectName=project.name;
 if(project.builderDraft){validatePlan(project.builderDraft);if(project.builderDraft.id!==project.layout.builder?.id||project.builderDraft.revision!==project.layout.builder?.revision)throw Error('The 2D plan does not match this project backup.');}
 else delete project.layout.builder;
 return project;
}
export function openProjectFile(project,currentProject,storage=projectStorage){
 const next=readProjectFile(project),previous=readProjectFile(currentProject);
 const writes=[[PREVIOUS_PROJECT_KEY,JSON.stringify(previous)],['preciseFloorplan',JSON.stringify(next.layout)],['floorplanTimestamp',String(Date.now())]];
 if(next.builderDraft)writes.push([DRAFT_KEY,JSON.stringify(next.builderDraft)]);
 const before=writes.map(([key])=>[key,storage.getItem(key)]);
 try{for(const [key,value] of writes)storage.setItem(key,value);}catch(error){
  for(const [key,value] of before){try{if(value===null)storage.removeItem(key);else storage.setItem(key,value);}catch{ /* Preserve the original storage error. */ }}
  throw Error('Could not open the project because browser storage is full or unavailable. Download your current project first.');
 }
 return next;
}
export function projectFilename(name){return `${String(name).normalize('NFKC').replace(/[^\p{L}\p{N} _-]/gu,'').trim().replace(/\s+/g,'-').slice(0,80)||'my-home'}.project.json`;}
