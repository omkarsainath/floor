import { laminateSelection } from './laminateSelection.js';
import { GREENLAM_CATALOG, GREENLAM_BY_ID, GREENLAM_FINISHES, GREENLAM_SOURCE, laminateSheetNote, cacheLaminateImage, preloadLaminateImage, normalizeLaminateChoice } from '../materials/greenlam.js';
import { wardrobeSurfaceMeshes } from '../generators/wardrobeFinishes.js';

export function showWardrobeFinishEditor({root,surfaceId,onChange,onHighlight,onToggle,onInspect,onStructure,onClose}) {
  document.getElementById('wardrobe-finish-editor')?.remove();
  const panel=document.createElement('section');panel.id='wardrobe-finish-editor';panel.setAttribute('aria-label','Wardrobe laminate editor');
  const style=document.createElement('style');style.textContent=`
    #wardrobe-finish-editor{position:fixed;right:18px;top:82px;width:360px;max-width:calc(100vw - 36px);max-height:calc(100dvh - 110px);overflow:auto;z-index:42;background:#17212a;color:#edf1ed;border:1px solid #53646b;border-radius:14px;box-shadow:0 14px 50px #0006;font:13px system-ui;padding:18px;box-sizing:border-box}
    #wardrobe-finish-editor h3{margin:0;font-size:20px}#wardrobe-finish-editor p{line-height:1.5;margin:10px 0;color:#bdcccd}
    #wardrobe-finish-editor label{display:block;margin:10px 0 5px;font-size:12px;color:#c6d3d2}
    #wardrobe-finish-editor select,#wardrobe-finish-editor input{width:100%;box-sizing:border-box;background:#24323d;color:#fff;border:1px solid #63747c;border-radius:7px;padding:9px;font:inherit}
    #wardrobe-finish-editor button{font:inherit;cursor:pointer;color:inherit;background:#293c45;border:1px solid #63747c;border-radius:7px;padding:8px}
    #wardrobe-finish-editor button:focus-visible,#wardrobe-finish-editor a:focus-visible{outline:2px solid #c5e6c3;outline-offset:2px}
    #wardrobe-finish-editor button:disabled{opacity:.4;cursor:default}#wardrobe-finish-editor a{color:#bcdec8}
    #wardrobe-finish-editor .laminate-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px;max-height:310px;overflow:auto;padding:3px}
    #wardrobe-finish-editor .laminate-card{padding:4px;text-align:left;background:#23313a;border-color:#52636c;overflow:hidden}
    #wardrobe-finish-editor .laminate-card[aria-pressed=true]{border:2px solid #b9ddb2;padding:3px;background:#3c5148}
    #wardrobe-finish-editor .laminate-card img{display:block;width:100%;height:70px;object-fit:cover;border-radius:4px}
    #wardrobe-finish-editor .laminate-card span{display:block;font-size:10px;line-height:1.35;margin-top:4px}
    #wardrobe-finish-editor .laminate-row{display:flex;gap:8px;align-items:center}#wardrobe-finish-editor .laminate-row>*{flex:1;min-width:0}
    #wardrobe-finish-editor .laminate-details{padding:10px;border:1px solid #51645e;border-radius:8px;background:#1e302e;margin-top:12px;font-size:12px;line-height:1.5}
    #wardrobe-finish-editor .laminate-status{min-height:2em;font-size:12px;color:#d9e9d1}
    @media(max-width:600px){#wardrobe-finish-editor{top:70px;right:8px;max-height:calc(100dvh - 85px);max-width:calc(100vw - 16px)}#wardrobe-finish-editor .laminate-grid{max-height:210px}}
  `;panel.append(style);
  const make=(tag,text,parent=panel)=>{const el=document.createElement(tag);if(text)el.textContent=text;parent.append(el);return el;};
  const row=make('div');row.className='laminate-row';make('h3','Wardrobe finishes',row);
  const done=make('button','Done',row);done.dataset.action='close';done.style.flex='0 0 auto';done.onclick=()=>{panel.remove();onClose();};
  make('p','Select a part here or click it in the scene. Choose a swatch to apply and save its finish.');
  if(onStructure){const structure=make('button','Edit dimensions, handles & mirrors');structure.dataset.action='structure';structure.onclick=()=>{panel.remove();onStructure();};}
  if(onInspect){const inspect=make('button','Inspect close-up · render lighting');inspect.dataset.action='inspect';inspect.onclick=()=>onInspect();}
  const field=(text,name,options)=>{const label=make('label',text),select=make('select','',label);select.dataset.field=name;for(const [id,title] of options)select.add(new Option(title,id));return select;};
  const parts=root.userData.wardrobeSurfaces||[];
  let selected=surfaceId||parts.find(p=>p.group==='Main doors')?.id||parts[0]?.id;
  const part=field('Selected part','part',[]);
  const scope=field('Apply swatches to','scope',[['multiple','Choose multiple parts'],['selected','Only this part'],['doors','All main doors'],['loft','All loft doors'],['sides','Both sides'],['all','All exterior panels']].filter(([id])=>id==='multiple'||id==='selected'||id==='all'||parts.some(p=>id==='doors'?p.group==='Main doors':id==='loft'?p.group==='Loft doors':p.id.startsWith('side-'))));
  scope.value='selected';
  const multi=laminateSelection(panel,()=>parts.map(p=>({key:p.id,label:`${p.group} · ${p.label}`})),()=>renderGrid());
  multi.box.hidden=true;
  const actions=make('div');actions.className='laminate-row';
  const open=make('button','Open / close this part',actions);open.dataset.action='toggle';
  const undo=make('button','Undo',actions);undo.dataset.action='undo';
  const reset=make('button','Reset finish');reset.dataset.action='reset';reset.style.marginTop='8px';
  const uploadLabel=make('label','Upload your laminate image');
  const upload=make('input','',uploadLabel);upload.type='file';upload.accept='image/jpeg,image/png,image/webp';upload.dataset.field='laminate-upload';
  make('p','Choose a JPG, PNG or WebP swatch. It will be saved with the selected parts.').style.fontSize='11px';
  const searchLabel=make('label','Search code or design');const search=make('input','',searchLabel);search.type='search';search.placeholder='Oak, 5106, marble, mermaid…';search.dataset.field='search';
  const family=field('Collection / texture','family',[['all','All collections'],...Object.entries(GREENLAM_FINISHES).map(([id,s])=>[id,s.label])]);
  const tally=make('p');tally.style.fontSize='11px';
  const grid=make('div');grid.className='laminate-grid';grid.setAttribute('aria-label','Greenlam designs');
  const rotation=field('Grain / pattern direction','rotation',[['0','Vertical · original'],['90','Horizontal · rotated 90°']]);
  const sizeLabel=make('label','Pattern scale (visual)');const scale=make('input','',sizeLabel);scale.type='range';scale.min='50';scale.max='200';scale.step='10';scale.dataset.field='scale';
  const details=make('div');details.className='laminate-details';
  const textureStatus=make('p');textureStatus.dataset.textureStatus='';textureStatus.style.fontSize='11px';textureStatus.setAttribute('role','status');
  const status=make('p');status.className='laminate-status';status.setAttribute('role','status');
  const note=make('p','PDF swatches are visual references. Colour, gloss and pattern size are approximate; compare a physical sample. Use 3D Render for reflections and richer lighting.');note.style.fontSize='11px';
  const source=make('a','Open full Greenlam catalogue · 2025–2027');source.href=GREENLAM_SOURCE;source.target='_blank';source.rel='noopener';
  make('p',`${GREENLAM_CATALOG.length} curated designs from your PDF. The file name says 2023–2025; its cover says 2025–2027.`).style.fontSize='11px';
  const history=[];
  const snapshot=()=>structuredClone(root.userData.wardrobeFinishes||{});
  const current=()=>root.userData.wardrobeFinishes?.[selected]||{laminateId:parts.find(p=>p.id===selected)?.defaultFinish,rotation:0,scale:1};
  const targets=()=>parts.filter(p=>scope.value==='multiple'&&multi.chosen.has(p.id)||scope.value==='all'||scope.value==='selected'&&p.id===selected||scope.value==='doors'&&p.group==='Main doors'||scope.value==='loft'&&p.group==='Loft doors'||scope.value==='sides'&&p.id.startsWith('side-'));
  function commit(next,message){
    const before=snapshot();
    try{const saved=onChange(next);history.push(before);if(history.length>30)history.shift();refresh();status.textContent=saved===false?'Applied, but local saving failed. Export the project before leaving.':message+' Saved locally.';}
    catch(e){status.textContent=e.message;}
  }
  function apply(laminateId){
    const next=snapshot(),selection=targets();
    if(!selection.length){status.textContent='Select at least one part first.';return;}
    for(const p of selection)next[p.id]={...(current().laminateId===laminateId&&current().custom?{custom:current().custom}:{}),laminateId,rotation:Number(rotation.value),scale:Number(scale.value)/100};
    commit(next,`${GREENLAM_BY_ID.get(laminateId).name} applied to ${selection.length} ${selection.length===1?'part':'parts'}.`);
  }
  function renderGrid(){
    const q=search.value.trim().toLowerCase();
    const found=GREENLAM_CATALOG.filter(s=>(family.value==='all'||family.value===s.finish)&&`${s.code} ${s.name} ${s.finish} ${s.kind}`.toLowerCase().includes(q));
    tally.textContent=`${found.length} designs · click to apply to ${targets().length} ${targets().length===1?'part':'parts'}`;
    const filterKey=JSON.stringify([family.value,q]);
    if(grid.dataset.filterKey===filterKey){
      for(const button of grid.querySelectorAll('[data-laminate-id]'))button.setAttribute('aria-pressed',String(current().laminateId===button.dataset.laminateId));
      return;
    }
    grid.dataset.filterKey=filterKey;grid.replaceChildren();
    if(!found.length)make('p','No matching designs. Try a name or code.',grid);
    for(const swatch of found){
      const b=make('button','',grid);b.className='laminate-card';b.dataset.laminateId=swatch.id;b.setAttribute('aria-pressed',String(current().laminateId===swatch.id));
      b.title=`${swatch.code} ${swatch.finish} · ${swatch.name}`;b.setAttribute('aria-label',b.title);
      const img=make('img','',b);img.alt='';img.loading='lazy';
      img.onload=()=>cacheLaminateImage(swatch.id,img);img.src=swatch.image;
      b.onpointerenter=b.onfocus=()=>preloadLaminateImage(swatch.id);
      make('span',`${swatch.code} ${swatch.finish}\n${swatch.name}`,b);
      b.onclick=()=>{cacheLaminateImage(swatch.id,img);apply(swatch.id);};
    }
  }
  function refresh(){
    multi.box.hidden=scope.value!=='multiple';multi.render();
    part.replaceChildren();
    for(const group of [...new Set(parts.map(p=>p.group))]){
      const opt=document.createElement('optgroup');opt.label=group;part.append(opt);
      for(const p of parts.filter(p=>p.group===group)){
        const s=GREENLAM_BY_ID.get(root.userData.wardrobeFinishes?.[p.id]?.laminateId||p.defaultFinish);
        opt.append(new Option(`${p.label} · ${s.code} ${s.name}`,p.id));
      }
    }
    part.value=selected;const choice=current();rotation.value=String(choice.rotation);scale.value=String(choice.scale*100);
    const surface=parts.find(p=>p.id===selected),swatch=GREENLAM_BY_ID.get(choice.laminateId),finish=GREENLAM_FINISHES[swatch.finish];
    details.replaceChildren();make('strong',choice.custom?swatch.name:`${swatch.code} ${swatch.finish} · ${swatch.name}`,details);
    make('div',`${surface.label} · ${choice.custom?'Uploaded image · matte preview':finish.label}`,details);
    if(!choice.custom){make('div',`${finish.application}. ${swatch.finish==='AFX'?'1.0 mm and above':'1.0 mm'} laminate.`,details);
    make('div',`Listed sheets: ${finish.sheets.map(([w,h])=>`${w*1000} × ${h*1000} mm`).join(' / ')}`,details);
    const width=surface.width*(surface.face<2?root.scale.z:root.scale.x),height=surface.height*(surface.face===2?root.scale.z:root.scale.y);
    const sheetNote=laminateSheetNote(choice,width,height);if(sheetNote)make('p',sheetNote,details).style.color='#ffda9e';
    const link=make('a',`PDF page ${swatch.pdfPage} · printed page ${swatch.printedPage}`,details);link.href=`${GREENLAM_SOURCE}#page=${swatch.pdfPage}`;link.target='_blank';link.rel='noopener';
    const spec=make('a',' · Application notes',details);spec.href=`${GREENLAM_SOURCE}#page=${finish.page}`;spec.target='_blank';spec.rel='noopener';
    }
    const mesh=wardrobeSurfaceMeshes(root,selected)[0];
    open.disabled=!mesh?.parent.userData._animType;undo.disabled=!history.length;
    reset.textContent=scope.value==='selected'?'Reset this part to its default':`Reset ${targets().length} parts to defaults`;
    onHighlight(selected);renderGrid();
  }
  panel.selectSurface=id=>{if(parts.some(p=>p.id===id)){selected=id;if(scope.value==='multiple'){multi.chosen.has(id)?multi.chosen.delete(id):multi.chosen.add(id);}else scope.value='selected';status.textContent='';refresh();}};
  upload.onchange=async()=>{
    const file=upload.files[0];if(!file)return;
    const selection=targets().map(p=>p.id);
    try{
      if(!selection.length)throw Error('Select at least one part first.');
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a JPG, PNG or WebP image smaller than 10 MB.');
      const bitmap=await createImageBitmap(file);
      const canvas=document.createElement('canvas'),ratio=Math.min(1,768/Math.max(bitmap.width,bitmap.height));
      canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const choice=normalizeLaminateChoice({laminateId:'custom-'+crypto.randomUUID(),custom:{name:file.name,image:canvas.toDataURL('image/jpeg',.8),sampleAspect:canvas.width/canvas.height},rotation:Number(rotation.value),scale:Number(scale.value)/100});
      if(!choice)throw Error('This image is too detailed to save. Try a smaller swatch.');
      if(!panel.isConnected)return;
      const next=snapshot();for(const id of selection)next[id]=choice;
      commit(next,'Uploaded laminate applied.');
    }catch(error){status.textContent=error.message;}finally{upload.value='';}
  };
  part.onchange=()=>panel.selectSurface(part.value);scope.onchange=refresh;
  family.onchange=renderGrid;search.oninput=renderGrid;
  rotation.onchange=()=>apply(current().laminateId);scale.onchange=()=>apply(current().laminateId);
  reset.onclick=()=>{if(!targets().length){status.textContent='Select at least one part first.';return;}const next=snapshot();for(const p of targets())delete next[p.id];commit(next,'Default finish restored.');};
  undo.onclick=()=>{try{const saved=onChange(history.at(-1));history.pop();refresh();status.textContent=saved===false?'Undone, but local saving failed.':'Finish change undone and saved.';}catch(e){status.textContent=e.message;}};
  open.onclick=()=>onToggle(wardrobeSurfaceMeshes(root,selected)[0]?.parent);
  panel.addEventListener('keydown',e=>{if(e.key!=='Escape')e.stopPropagation();});
  document.body.append(panel);refresh();
  function checkTexture(){
    if(!panel.isConnected)return;
    const mesh=wardrobeSurfaceMeshes(root,selected)[0],state=mesh?.material[mesh.userData.wardrobeSurface.face]?.userData.textureStatus;
    textureStatus.textContent=state==='loaded'?'Laminate texture loaded.':state==='error'?'Texture unavailable — showing the sampled colour.':'Loading catalogue texture…';
    setTimeout(checkTexture,500);
  }
  checkTexture();return panel;
}
