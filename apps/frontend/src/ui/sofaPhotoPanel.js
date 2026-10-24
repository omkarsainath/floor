import * as T from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FurnitureContactPass, FurnitureAntialiasPass } from './furnitureContactPass.js';
import { SOFA_FACTORY_CATALOG } from '../generators/sofaFactory.js';
import { sofaDesign } from '../generators/sofaDesigns.js';
import { PHOTO_SOFA_CLASS, createPhotoSofa, validatePhotoSofaSpec } from '../generators/photoSofa.js';
import { analyseSofaPhoto } from './sofaPhotoAnalysis.js';
import { exportFurnitureGLB, downloadFurnitureGLB } from './furnitureExport.js';

export function openSofaPhotoPanel({onPlace}){
  if(document.getElementById('sofa-photo-dialog'))return;
  const previousFocus=document.activeElement,dialog=document.createElement('dialog');dialog.id='sofa-photo-dialog';
  dialog.style.cssText='width:min(1100px,94vw);max-height:92vh;padding:20px;border:1px solid #687382;border-radius:14px;background:#202631;color:#f1f5f9;font:14px system-ui;z-index:1000';
  dialog.innerHTML=`<style>#sofa-photo-dialog::backdrop{background:#0009}#sofa-photo-dialog label{display:block;margin:9px 0}#sofa-photo-dialog input,#sofa-photo-dialog select,#sofa-photo-dialog button{font:inherit;padding:7px;border-radius:5px;border:1px solid #8792a0}#sofa-photo-dialog input[type=number]{width:100px}#sofa-photo-dialog button{cursor:pointer}#sofa-photo-dialog .columns{display:grid;grid-template-columns:minmax(260px,360px) minmax(300px,1fr);gap:20px}#sofa-photo-dialog p{line-height:1.5}#sofa-photo-dialog .dimensions{display:flex;gap:10px;flex-wrap:wrap}#sofa-photo-dialog .photo{max-width:100%;height:140px;object-fit:contain;background:#fff}#sofa-photo-preview{height:430px;min-width:0}#sofa-photo-preview canvas{display:block;width:100%;height:100%}@media(max-width:750px){#sofa-photo-dialog .columns{display:block}}</style>
    <button type="button" id="sofa-photo-close" style="float:right" aria-label="Close sofa photo editor">Close</button>
    <h2 style="margin-top:0">Create a sofa from a photo</h2>
    <p>Upload a clear sofa photo. Compare the suggested catalogue styles, check the layout and enter the real dimensions. The result is editable 3D geometry; unseen construction and fabric details are approximations.</p>
    <div class="columns"><div><label>Photo (JPEG, PNG or WebP, up to 15 MB)<input id="sofa-photo-file" type="file" accept="image/jpeg,image/png,image/webp"></label>
    <img class="photo" id="sofa-photo-source" alt="Uploaded sofa reference" hidden>
    <p id="sofa-photo-match-note">Your photo is processed locally.</p>
    <label>Construction reference<select id="sofa-photo-reference" style="width:100%"></select></label>
    <img class="photo" id="sofa-photo-catalogue" alt="Selected catalogue product">
    <p id="sofa-photo-reference-note"></p>
    <label><input id="sofa-photo-catalogue-mode" type="checkbox"> Use this catalogue model unchanged</label>
    <p>Leave unchecked to edit the layout, cushion divisions and colours. A visually similar suggestion does not identify the photographed product.</p>
    </div><div><div id="sofa-photo-preview" aria-label="360 degree sofa preview"></div><p>Drag to orbit 360°; scroll to zoom. Inspect the rear and both seating wings.</p>
    <div id="sofa-photo-edit-controls"><label>Layout <select id="sofa-photo-layout"><option value="straight">Straight sofa</option><option value="corner">Corner · both wings have backrests</option><option value="chaise">Chaise sectional</option><option value="set">Separate sofa set</option><option value="recliner">Single recliner</option><option value="daybed">Backless diwan</option></select></label>
    <label>Return / chaise side <select id="sofa-photo-side"><option value="left">Left</option><option value="right">Right</option></select></label>
    <div class="dimensions"><label>Main seat pads <input id="sofa-photo-mainSeats" type="number" min="1" max="6" step="1"></label><label>Return seat pads <input id="sofa-photo-wingSeats" type="number" min="1" max="6" step="1"></label><label>Main back pads <input id="sofa-photo-mainBacks" type="number" min="1" max="6" step="1"></label><label>Return back pads <input id="sofa-photo-wingBacks" type="number" min="1" max="6" step="1"></label></div>
    <label>Seat fabric <input id="sofa-photo-seatColor" type="color"> Frame fabric <input id="sofa-photo-frameColor" type="color"></label>
    <label><input id="sofa-photo-fabric" type="checkbox"> Use selected catalogue fabric pattern (approximate)</label></div>
    <fieldset><legend>Real dimensions</legend><label>Units <select id="sofa-photo-unit"><option value="1">Metres</option><option value="0.01">Centimetres</option><option value="0.001">Millimetres</option><option value="0.0254">Inches</option></select></label>
    <div class="dimensions"><label>Overall width <input id="sofa-photo-width" type="number" min="0.001" step="any" required></label><label>Overall depth <input id="sofa-photo-depth" type="number" min="0.001" step="any" required></label><label>Height <input id="sofa-photo-height" type="number" min="0.001" step="any" required></label><label>Seating depth <input id="sofa-photo-seatingDepth" type="number" min="0.001" step="any" required></label></div>
    <button type="button" id="sofa-photo-dimensions">Use selected catalogue dimensions</button><p>For an L shape, overall dimensions include the shared corner once. For a set, width/depth cover the arranged group; custom component sizes remain inferred.</p></fieldset>
    <button type="button" id="sofa-photo-build">Update 3D preview</button><button type="button" id="sofa-photo-place" disabled>Place in room</button><button type="button" id="sofa-photo-export" disabled>Download GLB</button>
    <p id="sofa-photo-status" role="status">Upload a photo to begin.</p></div></div>`;
  document.body.append(dialog);dialog.showModal();
  const el=name=>dialog.querySelector('#sofa-photo-'+name),products=SOFA_FACTORY_CATALOG.filter(p=>sofaDesign(p.id));
  for(const p of products){const option=document.createElement('option');option.value=p.id;option.textContent=`${p.label} · PDF ${p.page}`;el('reference').append(option);}
  let analysis=null,model=null,spec=null,closed=false,revision=0,unit=1;
  const scene=new T.Scene();scene.background=new T.Color('#e8e3dc');
  const renderer=new T.WebGLRenderer({antialias:true});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;el('preview').append(renderer.domElement);
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xffffff,0x8d8174,.55));
  const light=new T.DirectionalLight(0xfff5e8,2);light.position.set(-4,7,5);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:25});light.shadow.normalBias=.002;scene.add(light);
  const floor=new T.Mesh(new T.PlaneGeometry(40,40),new T.MeshStandardMaterial({color:'#d8d1c6',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.002;floor.receiveShadow=true;scene.add(floor);
  const camera=new T.PerspectiveCamera(38,1,.01,80),controls=new OrbitControls(camera,renderer.domElement);camera.position.set(3,2,4);controls.target.set(0,.4,0);controls.enableDamping=true;
  const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));composer.addPass(new FurnitureContactPass(scene,camera,600,430));composer.addPass(new OutputPass());composer.addPass(new FurnitureAntialiasPass());
  const resize=new ResizeObserver(()=>{const w=el('preview').clientWidth,h=430;renderer.setSize(w,h);composer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});resize.observe(el('preview'));
  renderer.setAnimationLoop(()=>{controls.update();composer.render();});
  function disposeModel(){if(!model)return;scene.remove(model);const geometry=new Set(),materials=new Set();model.traverse(n=>{if(n.geometry)geometry.add(n.geometry);if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])materials.add(m);});geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());model=null;}
  function invalidate(){spec=null;el('place').disabled=el('export').disabled=true;el('status').textContent='Update the preview to apply these changes.';}
  function referenceChanged(){
    const product=products.find(p=>p.id===el('reference').value),p=sofaDesign(product.id);
    el('catalogue').src=product.image;el('reference-note').textContent=product.note;
    el('layout').value=p.layout==='straight'&&p.recliner?'recliner':p.layout;el('side').value=p.chaiseSide||p.cornerSide||'left';
    for(const key of ['mainSeats','wingSeats'])el(key).value=Math.max(1,p[key]||1);
    el('mainBacks').value=p.mainBacks||p.backPanels||p.mainSeats||1;el('wingBacks').value=p.wingBacks||p.wingSeats||1;
    el('seatColor').value=analysis?.color||p.seatColor;el('frameColor').value=analysis?.color||p.frameColor;invalidate();
  }
  el('reference').onchange=referenceChanged;referenceChanged();el('status').textContent='Upload a photo to begin.';
  el('file').onchange=async()=>{
    const token=++revision;invalidate();el('build').disabled=true;el('status').textContent='Reading photo and comparing catalogue styles…';
    try{const result=await analyseSofaPhoto(el('file').files[0],products);if(closed||token!==revision)return;
      analysis=result;el('source').src=result.photo;el('source').hidden=false;el('reference').value=result.matches[0].id;referenceChanged();
      const labels=result.matches.slice(0,3).map(m=>products.find(p=>p.id===m.id).label);
      el('match-note').textContent='Closest visual suggestions: '+labels.join('; ')+'. Check the construction reference below.';
      el('status').textContent='Photo read. Enter your dimensions, or explicitly use the selected catalogue dimensions, then update the preview.';
    }catch(error){if(!closed&&token===revision){analysis=null;el('status').textContent=error.message;}}
    finally{if(!closed&&token===revision)el('build').disabled=false;}
  };
  el('dimensions').onclick=()=>{
    const p=products.find(p=>p.id===el('reference').value);
    for(const [key,value] of Object.entries({width:p.w,depth:p.d,height:p.h,seatingDepth:p.seatingDepth||p.productDepth}))el(key).value=Number((value/unit).toFixed(6));invalidate();
  };
  el('unit').onchange=()=>{const next=Number(el('unit').value);for(const key of ['width','depth','height','seatingDepth'])if(el(key).value)el(key).value=Number((Number(el(key).value)*unit/next).toFixed(6));unit=next;invalidate();};
  el('catalogue-mode').onchange=()=>{el('edit-controls').style.opacity=el('catalogue-mode').checked?'.55':'1';for(const field of el('edit-controls').querySelectorAll('input,select'))field.disabled=el('catalogue-mode').checked;invalidate();};
  for(const field of dialog.querySelectorAll('#sofa-photo-edit-controls input,#sofa-photo-edit-controls select,input[type=number]'))field.addEventListener('change',invalidate);
  el('build').onclick=()=>{
    try{
      if(!analysis)throw new Error('Upload a sofa photo first.');
      const values={version:1,referenceId:el('reference').value,photo:analysis.photo,layout:el('layout').value,side:el('side').value,useCatalogueModel:el('catalogue-mode').checked,useCatalogueFabric:el('fabric').checked};
      for(const key of ['width','depth','height','seatingDepth'])values[key]=Number(el(key).value)*unit;
      for(const key of ['mainSeats','wingSeats','mainBacks','wingBacks','seatColor','frameColor'])values[key]=el(key).value;
      const next=validatePhotoSofaSpec(values),built=createPhotoSofa(next);disposeModel();model=built;spec=next;scene.add(model);
      controls.target.set(0,spec.height*.45,0);camera.position.copy(controls.target).add(new T.Vector3(1,.7,1.4).normalize().multiplyScalar(Math.max(spec.width,spec.depth)*2.5));controls.update();
      el('place').disabled=el('export').disabled=false;el('status').textContent=`Preview: ${spec.width.toFixed(3)} × ${spec.depth.toFixed(3)} × ${spec.height.toFixed(3)} m. ${spec.provenance}`;
    }catch(error){invalidate();el('status').textContent=error.message;}
  };
  el('export').onclick=async()=>{const snapshot=model,token=spec;el('export').disabled=true;try{const bytes=await exportFurnitureGLB(snapshot);if(!closed)downloadFurnitureGLB(bytes,'photo-sofa.glb');}catch(error){if(!closed)el('status').textContent='Export failed: '+error.message;}finally{if(!closed&&token===spec)el('export').disabled=false;}};
  el('place').onclick=()=>{if(!spec)return;const item={id:PHOTO_SOFA_CLASS,label:'Photo sofa',icon:'🛋️',w:spec.width,d:spec.depth,h:spec.height,photoSofaSpec:spec};close();onPlace(item);};
  function close(){if(closed)return;closed=true;revision++;renderer.setAnimationLoop(null);resize.disconnect();controls.dispose();disposeModel();composer.passes.forEach(p=>p.dispose?.());composer.dispose();floor.geometry.dispose();floor.material.dispose();light.shadow.map?.dispose();environment.dispose();renderer.dispose();renderer.forceContextLoss();dialog.close();dialog.remove();previousFocus?.focus();}
  el('close').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
}
