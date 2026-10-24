import { laminateSelection } from './laminateSelection.js';
import * as THREE from 'three';
import {STONES,STONE_BY_ID} from '../materials/stone.js';
import { ACCESSORIES, PRODUCT_BY_ID, compatibility, mm } from '../kitchen/catalog.js';
import { cabinetList, kitchenState, applyKitchenState, resizeKitchenSection, addKitchenSection, deleteKitchenSection, kitchenStructureProblem, accessoryModel, newAccessory, motionProblem, operateAccessory, setKitchenCutaway, kitchenCutaway, kitchenErrors } from '../kitchen/system.js';
import { createAccessoryModel } from '../kitchen/models.js';
import { GREENLAM_CATALOG, GREENLAM_FINISHES, GREENLAM_BY_ID, cacheLaminateImage } from '../materials/greenlam.js';
import { attachModelThumbnail } from './modelThumbnail.js';

export function showKitchenAccessories({roots,root=roots[0],bayId,onSave=()=>true,onHighlight=()=>{},onInspect=()=>{},onRestoreCamera=()=>{},getObstacles=()=>[],onClose=()=>{}}) {
  document.getElementById('kitchen-accessories-panel')?.close();
  const panel=document.createElement('aside');panel.id='kitchen-accessories-panel';panel.setAttribute('aria-label','Kitchen Accessories');
  panel.style.cssText='position:fixed;right:16px;top:76px;bottom:75px;width:min(365px,calc(100vw - 32px));overflow:auto;z-index:130;background:#171c29f5;color:#e7edf6;padding:18px;border:1px solid #3a465e;border-radius:14px;box-sizing:border-box;box-shadow:0 14px 44px #0006;font:13px/1.5 Inter,system-ui';
  const style=document.createElement('style');style.textContent='#kitchen-accessories-panel button,#kitchen-accessories-panel select,#kitchen-accessories-panel input:not([type=checkbox]),#kitchen-accessories-panel textarea{box-sizing:border-box;background:#263145;color:#edf3fc;border:1px solid #485771;border-radius:7px;padding:8px;font:inherit;max-width:100%}#kitchen-accessories-panel button{cursor:pointer}#kitchen-accessories-panel button:disabled{opacity:.4;cursor:default}#kitchen-accessories-panel label{display:block;margin:9px 0}#kitchen-accessories-panel label>select,#kitchen-accessories-panel label>input:not([type=checkbox]),#kitchen-accessories-panel textarea{display:block;width:100%;margin-top:4px}#kitchen-accessories-panel p{color:#b4c4d7;margin:9px 0}#kitchen-accessories-panel h3{margin:17px 0 8px}#kitchen-accessories-panel .ka-row{display:flex;gap:6px;flex-wrap:wrap}#kitchen-accessories-panel .ka-swatches{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;max-height:220px;overflow:auto}#kitchen-accessories-panel .ka-swatches button{padding:4px;font-size:10px}#kitchen-accessories-panel .ka-swatches img{width:100%;height:45px;object-fit:cover}#kitchen-accessories-panel [aria-pressed=true]{outline:2px solid #7cdac7}';panel.append(style);
  const el=(tag,text='',parent=panel)=>{const n=document.createElement(tag);n.textContent=text;parent.append(n);return n;};
  const row=()=>{const n=el('div');n.className='ka-row';return n;};
  const button=(text,action,parent=panel)=>{const b=el('button',text,parent);b.dataset.action=action;return b;};
  const select=(label,field,options)=>{const l=el('label',label),s=el('select','',l);s.dataset.field=field;for(const [value,text] of options)s.add(new Option(text,value));return s;};
  const input=(label,field,type='number')=>{const l=el('label',label),i=el('input','',l);i.type=type;i.dataset.field=field;return i;};
  const heading=row();el('strong','Kitchen Accessories',heading).style.fontSize='18px';const close=button('Close','close',heading);
  if(!roots.length){
    el('p','No supported kitchen cabinets in this layout. Add a base cabinet, kitchen counter, sink or island from the existing furniture catalog, then reopen Kitchen Accessories.');
    panel.close=()=>{panel.remove();onClose();};close.onclick=panel.close;document.body.append(panel);return panel;
  }
  el('p','Fixed-size conceptual hardware · IVAS visual reference. Confirm measurements before installing.');
  const cabinet=select('Selected cabinet','cabinet',[]),summary=el('p');
  const view=row(),inspect=button('Inspect in 3D','inspect',view),home=button('Original camera','home',view),cutaway=button('Cutaway','cutaway',view);
  const materialNav=row();materialNav.setAttribute('aria-label','Choose material surface');
  const graniteTab=button('Granite / marble · Slab top','granite-tab',materialNav),laminateTab=button('Laminate · Cabinets','laminate-tab',materialNav);
  let materialSurface=cabinetList(root).some(c=>c.resizable)?'stone':'laminate';
  const details=el('details'),heading2=el('summary','Cabinet measurements & obstructions',details);
  heading2.style.cursor='pointer';const form=el('div','',details);
  const measurementHint=el('p','',form),measurementStatus=el('p','',form);measurementStatus.dataset.measurementStatus='';measurementStatus.setAttribute('aria-live','polite');
  const addSectionRow=row();const addSection=button('+ Add slab section','add-section',addSectionRow);const deleteSection=button('Delete selected section','delete-section',addSectionRow);const newSectionType=select('New section type','new-section-type',[['base','Base section'],['sink','Sink section']]);addSectionRow.append(newSectionType);addSectionRow.style.display='none';
  const numeric={};for(const [key,label] of [['width','Internal width'],['height','Internal height'],['depth','Usable depth'],['opening','Clear door opening'],['boardThickness','Board thickness']]){
    const l=el('label',`${label} (mm)`,form),i=el('input','',l);i.type='number';i.min=key==='boardThickness'?'6':'20';i.max=key==='boardThickness'?'40':'5000';i.step='1';i.dataset.field=key;numeric[key]=i;
  }
  const roleLabel=el('label','Cabinet type',form),role=el('select','',roleLabel);role.dataset.field='role';
  for(const v of ['base','narrow','corner','sink','drawer','tall','appliance','hob-adjacent'])role.add(new Option(v,v));
  const handLabel=el('label','Corner opening side',form),hand=el('select','',handLabel);hand.dataset.field='hand';for(const v of ['left','right'])hand.add(new Option(v,v));
  el('p','Obstruction boxes in metres: x/z from the cavity centre, y from its internal floor. Include shelves, partitions, sink bowl, trap, pipes and appliances.',form);
  const obstacles=el('textarea','',form);obstacles.dataset.field='obstructions';obstacles.rows=4;obstacles.setAttribute('aria-label','Measured obstruction boxes');obstacles.placeholder='[{"label":"pipe","x":0,"y":0.3,"z":-0.2,"w":0.08,"h":0.6,"d":0.08}]';
  const check=(text,field)=>{const l=el('label','',form),i=el('input','',l);i.type='checkbox';i.dataset.field=field;l.append(document.createTextNode(' '+text));return i;};
  const confirmed=check('I have checked these dimensions, board thickness and internal partitions.','confirmed'),plumbing=check('Sink bowl and plumbing are measured and included above.','plumbing');
  const measure=button('Apply measurements','measure',form);
  const stonePanel=el('section');stonePanel.setAttribute('aria-label','Granite and marble for slab tops');el('h3','Granite / marble — slab top',stonePanel);
  el('p','Lavina stone images for the countertop surface and edges.',stonePanel);
  const stoneInfo=el('p','Choose a named Lavina catalogue image. Image scale and polished finish are approximate.',stonePanel);
  const stoneSearch=el('input','',stonePanel);stoneSearch.type='search';stoneSearch.placeholder='Search stone name';stoneSearch.setAttribute('aria-label','Search countertop stone');
  const stoneScopeLabel=el('label','Apply stone to',stonePanel),stoneScope=el('select','',stoneScopeLabel);stoneScope.add(new Option('Entire slab top','all'));stoneScope.add(new Option('Selected section top','section'));
  const stoneGrid=el('div','',stonePanel);stoneGrid.className='ka-swatches';
  const clearStone=button('Restore original slab top','clear-stone',stonePanel);
  el('h3','Accessory library');
  const category=select('Category','category',[...new Map(ACCESSORIES.map(p=>[p.category,[p.category,p.name]])).values()]);
  const product=select('Configuration','product',[]),productInfo=el('p'),previewImage=el('img');previewImage.alt='3D accessory model preview';previewImage.style.cssText='width:100%;height:150px;object-fit:contain;background:#eeebe5;border-radius:8px';
  const fit=el('p');fit.dataset.fit='';
  const installRow=row(),preview=button('Preview in cabinet','preview',installRow),install=button('Install / replace','install',installRow),cancel=button('Cancel preview','cancel',installRow),remove=button('Remove','remove',installRow);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.color='#8ee5ce';
  el('h3','Operation');
  const tier=select('Operate','tier',[['all','Entire accessory']]);
  const travel=input('Opening · 0–100%','opening','range');travel.min='0';travel.max='100';travel.step='1';
  const opRow=row(),open=button('Open','open',opRow),shut=button('Close','shut',opRow);
  const laminateHeading=el('h3','Laminate — cabinet fronts & sides');
  el('p','Greenlam laminate for doors, drawer fronts and cabinet sides.');
  const mode=select('Pull-out laminate mode','mode',[['INHERIT','Match Kitchen Laminate'],['OVERRIDE','Choose Custom Laminate']]);
  const scope=select('Apply laminate to','scope',[['accessory','Selected pull-out front'],['multiple','Choose multiple cabinet sections'],['cabinet','Selected cabinet fronts & sides'],['all','All cabinet fronts & sides']]);
  scope.value='cabinet';
  const multi=laminateSelection(panel,()=>roots.flatMap((r,i)=>cabinetList(r).map(c=>({key:`${i}:${c.id}`,label:`Kitchen ${i+1} · ${c.label||c.id}`}))));
  multi.box.hidden=true;scope.onchange=()=>{multi.box.hidden=scope.value!=='multiple';multi.render();};
  const includesCabinet=(r,c)=>scope.value==='all'||(scope.value==='multiple'?multi.chosen.has(`${roots.indexOf(r)}:${c.id}`):r===selected&&c.id===selectedId);
  const search=input('Laminate colour / texture / code','search','search');
  const finish=select('Finish type','finish',[['all','All existing finishes'],...Object.entries(GREENLAM_FINISHES).map(([id,f])=>[id,f.label])]);
  const grain=select('Grain direction','grain',[['0','Vertical'],['90','Horizontal']]);
  const swatches=el('div');swatches.className='ka-swatches';const finishInfo=el('p');
  const reset=button('Reset to Kitchen Laminate','reset');
  const laminatePanel=document.createElement('section');laminatePanel.setAttribute('aria-label','Laminate for cabinet fronts and sides');
  for(let n=laminateHeading;n;){const next=n.nextSibling;laminatePanel.append(n);if(n===reset)break;n=next;}
  panel.insertBefore(stonePanel,details);panel.insertBefore(laminatePanel,details);
  for(const section of [stonePanel,laminatePanel])section.style.cssText='margin:12px 0;padding:10px;border:1px solid #485771;border-radius:9px';
  function showMaterialSurface(){stonePanel.hidden=materialSurface!=='stone';laminatePanel.hidden=materialSurface!=='laminate';graniteTab.setAttribute('aria-pressed',String(materialSurface==='stone'));laminateTab.setAttribute('aria-pressed',String(materialSurface==='laminate'));}
  graniteTab.onclick=()=>{materialSurface='stone';showMaterialSurface();};laminateTab.onclick=()=>{materialSurface='laminate';showMaterialSurface();};
  const historyRow=row(),undo=button('Undo','undo',historyRow),redo=button('Redo','redo',historyRow),save=button('Save configuration','save',historyRow);
  let selected=root,selectedId=bayId||cabinetList(root)[0]?.id,previewBefore=null,closed=false,lastEditKey=null;
  const history=[],future=[];
  const snapshot=()=>roots.map(r=>({root:r,state:kitchenState(r)}));
  const restore=s=>s.forEach(item=>applyKitchenState(item.root,item.state));
  const current=()=>cabinetList(selected).find(c=>c.id===selectedId);
  const syncOpening=()=>{const a=current()?.accessory;travel.value=Math.round((tier.value==='all'?a?.openingState||0:a?.tierStates?.[Number(tier.value)]||0)*100);};
  const message=(text,error=false)=>{
    status.textContent=text;status.style.color=error?'#ffb99e':'#8ee5ce';
    if(error){const a=status.getBoundingClientRect(),b=panel.getBoundingClientRect();if(a.top<b.top||a.bottom>b.bottom)status.scrollIntoView({block:'nearest'});}
  };
  const persist=()=>{const saved=onSave(roots);if(saved===false)message('Applied, but local saving failed. Export your project before leaving.',true);return saved;};
  function cancelPreview(){if(previewBefore){restore(previewBefore);previewBefore=null;}}
  function transact(edit,{validateMotion=false,preserveForm=false,historyKey=null,feedback=message,validateStructure=false}={}){
    cancelPreview();const before=snapshot();
    try{edit();let openingWarning=null;if(validateMotion){const obstacles=getObstacles();if(validateStructure){const reason=kitchenStructureProblem(selected,{obstacles});if(reason)throw new Error(reason);}for(const c of validateMotion==='all'?cabinetList(selected).filter(c=>c.accessory):[current()]){const reason=motionProblem(selected,c.id,0,{obstacles});if(reason)throw new Error(`${validateMotion==='all'?'Change not applied.':'Cannot install in the closed position.'} ${reason}`);openingWarning||=motionProblem(selected,c.id,1,{obstacles});}}
      if(historyKey===null||historyKey!==lastEditKey)history.push(before);lastEditKey=historyKey;if(history.length>40)history.shift();future.length=0;refresh({preserveForm});if(persist()!==false)feedback(openingWarning?`${validateMotion==='all'?'Saved.':'Installed and saved closed.'} Full opening is blocked: ${openingWarning}`:'Changes applied and saved locally.',!!openingWarning);return true;
    }catch(error){restore(before);refresh({preserveForm});feedback(error.message,true);return false;}
  }
  function changeRecord(edit,validateMotion=false){transact(()=>{const next=kitchenState(selected);next.cabinets[selectedId]||={};edit(next.cabinets[selectedId]);applyKitchenState(selected,next,{strict:true});},{validateMotion});}
  function populateProducts(){product.replaceChildren();for(const p of ACCESSORIES.filter(p=>p.category===category.value))product.add(new Option(p.variant,p.id));renderProduct();}
  function renderProduct(){
    const p=PRODUCT_BY_ID.get(product.value),c=current();if(!p)return;
    productInfo.textContent=`${mm(p.w)} × ${mm(p.h)} × ${mm(p.d)} mm hardware · ${mm(p.travel)} mm travel · IVAS p.${p.page}. Procedural model; manufacturer dimensions unverified.`;
    const check=compatibility(c,p);fit.textContent=check.ok?(c.modelledInterior?'Fits the 3D cabinet and modelled sink bowl. Unmodelled plumbing is not checked.':'Fits the entered dimensions.')+' Installation checks the closed position and opening clearance.':check.reasons.join(' ');
    fit.style.color=check.ok?'#8ee5ce':'#ffcfaa';install.disabled=preview.disabled=!check.ok;
    attachModelThumbnail(previewImage,`kitchen:${p.id}`,()=>createAccessoryModel(p));
  }
  function refresh({preserveForm=false}={}){
    multi.render();
    cabinet.replaceChildren();for(const [i,r] of roots.entries())for(const [j,c] of cabinetList(r).entries())cabinet.add(new Option(`Section ${j+1} · ${PRODUCT_BY_ID.get(c.accessory?.productModelId)?.name||c.type} — Kitchen ${i+1}`,`${i}:${c.id}`));
    cabinet.value=`${roots.indexOf(selected)}:${selectedId}`;
    const c=current();if(!c){message('No supported kitchen cabinets. Add a base cabinet, counter or island from the existing catalog.',true);return;}
    summary.textContent=`${mm(c.width)} W × ${mm(c.height)} H × ${mm(c.depth)} D mm · ${c.confirmed?'Measurements confirmed':'Dimensions need confirmation'} · Front faces local +Z.`;
    measurementHint.textContent=c.resizable?'Slab sections resize and save immediately. Accessories use the model dimensions and sink bowl for fitting. Measurement confirmation records physical checks; it is not required for this 3D model.':'Clearance measurements apply automatically within the existing cabinet. They do not resize its exterior.';
    addSectionRow.style.display=c.resizable?'':'none';addSection.disabled=!c.resizable;deleteSection.disabled=!c.resizable||cabinetList(selected).length<=1;
    graniteTab.disabled=!c.resizable;if(!c.resizable)materialSurface='laminate';showMaterialSurface();
    const selectedStone=kitchenState(selected).cabinets[selectedId]?.counterStone;
    stoneInfo.textContent=selectedStone?`${STONE_BY_ID.get(selectedStone)?.name} · Catalogue image; approximate scale and polished finish.`:'Choose a named Lavina catalogue image. Image scale and polished finish are approximate.';
    if(!preserveForm){for(const [key,i] of Object.entries(numeric))i.value=mm(c[key]);role.value=c.type;hand.value=c.hand;confirmed.checked=c.confirmed;plumbing.checked=c.plumbingConfirmed;obstacles.value=JSON.stringify(kitchenState(selected).cabinets[selectedId]?.profile?.obstructions||[],null,2);details.open=!c.confirmed;}
    const accessoryScope=[...scope.options].find(o=>o.value==='accessory');accessoryScope.disabled=!c.accessory;
    if(scope.value==='accessory'&&!c.accessory)scope.value='cabinet';
    remove.disabled=!c.accessory;cancel.disabled=!previewBefore;
    const a=c.accessory,p=PRODUCT_BY_ID.get(a?.productModelId);open.disabled=shut.disabled=travel.disabled=!accessoryModel(selected,selectedId);travel.value=Math.round((a?.openingState||0)*100);
    const selectedTier=tier.value;tier.replaceChildren();tier.add(new Option('Entire accessory','all'));if(p?.category==='wicker')for(let i=0;i<p.tiers;i++)tier.add(new Option(`Basket ${i+1}`,String(i)));
    if([...tier.options].some(o=>o.value===selectedTier))tier.value=selectedTier;syncOpening();
    mode.value=a?.laminateMode||'INHERIT';mode.disabled=reset.disabled=!a;cutaway.setAttribute('aria-pressed',String(kitchenCutaway(selected)));undo.disabled=!history.length;redo.disabled=!future.length;
    const choice=a?.laminateMode==='OVERRIDE'?a.laminate:c.finish,swatch=GREENLAM_BY_ID.get(choice?.laminateId);finishInfo.textContent=swatch?`${swatch.code} · ${swatch.name} · ${GREENLAM_FINISHES[swatch.finish].label}`:'Original cabinet finish retained.';
    renderProduct();onHighlight(selected,selectedId);if(kitchenErrors(selected).length)message(kitchenErrors(selected).join(' '),true);
  }
  const measurementMessage=(text,error=false)=>{measurementStatus.textContent=text;measurementStatus.style.color=error?'#ffb99e':'#8ee5ce';};
  function setStone(id){transact(()=>{const next=kitchenState(selected);for(const c of cabinetList(selected)){if(stoneScope.value==='section'&&c.id!==selectedId)continue;next.cabinets[c.id]||={};if(id)next.cabinets[c.id].counterStone=id;else delete next.cabinets[c.id].counterStone;}applyKitchenState(selected,next);});}
  function drawStones(){stoneGrid.replaceChildren();for(const s of STONES.filter(s=>`${s.name} ${s.kind}`.toLowerCase().includes(stoneSearch.value.toLowerCase()))){const b=el('button','',stoneGrid);b.dataset.stoneId=s.id;b.title=`${s.name} · ${s.kind}`;const img=el('img','',b);img.src=s.image;img.alt=s.name;img.loading='lazy';el('span',`${s.name} · ${s.kind}`,b);b.onclick=()=>setStone(s.id);}}
  stoneSearch.oninput=drawStones;clearStone.onclick=()=>setStone(null);drawStones();
  function applyDimension(key){
    const input=numeric[key],c=current();
    if(!input.value||!input.checkValidity()){measurementMessage('Enter a valid positive measurement to apply the change.',true);return;}
    let value=Number(input.value)/1000;
    if(Math.abs(value-c[key])<.0005){measurementMessage('Current size is applied.');return;}
    const ok=transact(()=>{
      if(c.resizable)resizeKitchenSection(selected,selectedId,key,value);
      else{if(value>c.envelope[key]+.0005)throw new Error(`Maximum ${key}: ${mm(c.envelope[key])} mm for this cabinet.`);value=Math.min(value,c.envelope[key]);const next=kitchenState(selected);next.cabinets[selectedId]||={profile:{}};next.cabinets[selectedId].profile[key]=value;applyKitchenState(selected,next,{strict:true});}
    // Resize the cabinet first. An existing pull-out may no longer fit after
    // the edit; keep the new cabinet size and show that fit problem in the
    // accessory area instead of rolling the cabinet edit back.
    },{validateMotion:false,validateStructure:c.resizable,preserveForm:true,historyKey:`dimension:${key}`,feedback:measurementMessage});
    if(ok){const updated=current();for(const [k,i] of Object.entries(numeric))if(k!==key)i.value=mm(updated[k]);}
  }
  for(const [key,input] of Object.entries(numeric)){input.oninput=()=>applyDimension(key);input.onchange=()=>applyDimension(key);input.onfocus=input.onblur=()=>{lastEditKey=null;};}
  const applyProfile=()=>{let boxes;try{boxes=JSON.parse(obstacles.value||'[]');}catch{measurementMessage('Finish entering valid obstruction JSON to apply it.',true);return;}
    transact(()=>{const next=kitchenState(selected);next.cabinets[selectedId]||={};next.cabinets[selectedId].profile={...next.cabinets[selectedId].profile,type:role.value,hand:hand.value,confirmed:confirmed.checked,plumbingConfirmed:plumbing.checked,obstructions:boxes};applyKitchenState(selected,next,{strict:true});},{validateMotion:'all',preserveForm:true,feedback:measurementMessage});
  };
  for(const field of [role,hand,confirmed,plumbing])field.onchange=applyProfile;obstacles.oninput=applyProfile;
  function drawSwatches(){
    swatches.replaceChildren();const q=search.value.toLowerCase();
    for(const s of GREENLAM_CATALOG.filter(s=>(finish.value==='all'||s.finish===finish.value)&&`${s.code} ${s.name} ${s.kind} ${s.color}`.toLowerCase().includes(q))){
      const b=el('button','',swatches);b.dataset.laminateId=s.id;b.title=`${s.code} ${s.name}`;const img=el('img','',b);img.alt=s.name;img.loading='lazy';img.onload=()=>cacheLaminateImage(s.id,img);img.src=s.image;el('span',`${s.code} ${s.name}`,b);
      b.onclick=()=>{cacheLaminateImage(s.id,img);const choice={laminateId:s.id,rotation:Number(grain.value),scale:1};
        if(scope.value==='accessory'&&!current().accessory){message('Install an accessory before applying a pull-out finish.',true);return;}
        if(scope.value==='multiple'&&!multi.chosen.size){message('Select at least one cabinet section first.',true);return;}
        transact(()=>{for(const r of scope.value==='all'||scope.value==='multiple'?roots:[selected]){const next=kitchenState(r);for(const c of cabinetList(r)){if(!includesCabinet(r,c))continue;next.cabinets[c.id]||={};if(scope.value==='accessory')Object.assign(next.cabinets[c.id].accessory,{laminateMode:'OVERRIDE',laminate:choice});else {next.cabinets[c.id].finish=choice;if(next.cabinets[c.id].accessory){next.cabinets[c.id].accessory.laminateMode='INHERIT';next.cabinets[c.id].accessory.laminate=null;}}}applyKitchenState(r,next);}});
      };
    }
  }
  measure.onclick=()=>{for(const key of Object.keys(numeric))applyDimension(key);applyProfile();};
  addSection.onclick=()=>transact(()=>{
    addKitchenSection(selected);
    const sections=kitchenState(selected),id=`bay-${sections.sectionSizes.length}`;
    sections.cabinets[id]||={profile:{}};
    if(newSectionType.value==='sink')sections.cabinets[id].profile={type:'sink',confirmed:true,plumbingConfirmed:false,obstructions:[]};
    applyKitchenState(selected,sections,{strict:false});
  },{preserveForm:false,feedback:measurementMessage});
  deleteSection.onclick=()=>transact(()=>deleteKitchenSection(selected,selectedId),{preserveForm:false,feedback:measurementMessage});
  const installEdit=()=>{const next=kitchenState(selected);next.cabinets[selectedId]||={};const previous=next.cabinets[selectedId].accessory;next.cabinets[selectedId].accessory={...newAccessory(product.value),laminateMode:previous?.laminateMode||'INHERIT',laminate:previous?.laminate};applyKitchenState(selected,next,{strict:true});};
  install.onclick=()=>transact(installEdit,{validateMotion:true});
  preview.onclick=()=>{cancelPreview();previewBefore=snapshot();try{installEdit();const obstacles=getObstacles(),reason=motionProblem(selected,selectedId,0,{obstacles});if(reason)throw new Error(`Cannot preview in the closed position. ${reason}`);const warning=motionProblem(selected,selectedId,1,{obstacles});refresh();message(warning?`Preview only; full opening blocked: ${warning}`:'Preview only. Install to save, or cancel to restore.',!!warning);}catch(error){cancelPreview();refresh();message(error.message,true);}};
  cancel.onclick=()=>{cancelPreview();refresh();message('Preview discarded.');};remove.onclick=()=>changeRecord(r=>{delete r.accessory;});
  function operate(value,{immediate=false}={}){if(previewBefore){try{operateAccessory(selected,selectedId,value,{immediate,obstacles:getObstacles(),tier:tier.value==='all'?null:Number(tier.value)});message('Operating preview; install to save.');}catch(e){message(e.message,true);}return;}
    transact(()=>operateAccessory(selected,selectedId,value,{immediate,obstacles:getObstacles(),tier:tier.value==='all'?null:Number(tier.value)}),{historyKey:immediate?'opening':null});
  }
  travel.oninput=()=>operate(Number(travel.value)/100,{immediate:true});travel.onchange=()=>{lastEditKey=null;};open.onclick=()=>operate(1);shut.onclick=()=>operate(0);
  tier.onchange=syncOpening;
  grain.onchange=()=>{
    const rotation=Number(grain.value),edits=[];
    for(const r of scope.value==='all'||scope.value==='multiple'?roots:[selected])for(const c of cabinetList(r)){
      if(!includesCabinet(r,c))continue;
      const choice=scope.value==='accessory'?(c.accessory?.laminateMode==='OVERRIDE'?c.accessory.laminate:c.finish):c.finish;
      if(choice&&(scope.value!=='accessory'||c.accessory))edits.push({root:r,id:c.id,choice:{...choice,rotation}});
    }
    if(!edits.length){message('Choose a laminate first to change its grain direction.');return;}
    transact(()=>{for(const r of new Set(edits.map(e=>e.root))){const next=kitchenState(r);for(const e of edits.filter(e=>e.root===r)){if(scope.value==='accessory')Object.assign(next.cabinets[e.id].accessory,{laminateMode:'OVERRIDE',laminate:e.choice});else next.cabinets[e.id].finish=e.choice;}applyKitchenState(r,next);}});
  };
  mode.onchange=()=>{if(mode.value==='INHERIT')changeRecord(r=>{r.accessory.laminateMode='INHERIT';r.accessory.laminate=null;});else {scope.value='accessory';message('Choose a Greenlam swatch to set the individual override.');}};
  reset.onclick=()=>changeRecord(r=>{r.accessory.laminateMode='INHERIT';r.accessory.laminate=null;});
  function applyProduct(){renderProduct();const check=compatibility(current(),PRODUCT_BY_ID.get(product.value));if(!check.ok){message(`Not changed. ${check.reasons.join(' ')}`);return;}if(current().accessory?.productModelId===product.value)return;transact(installEdit,{validateMotion:true});}
  search.oninput=finish.onchange=drawSwatches;category.onchange=()=>{populateProducts();applyProduct();};product.onchange=applyProduct;
  cabinet.onchange=()=>{const [i,id]=cabinet.value.split(':');panel.selectCabinet(roots[Number(i)],id);};
  cutaway.onclick=()=>{setKitchenCutaway(selected,!kitchenCutaway(selected));refresh();};inspect.onclick=()=>onInspect(selected,selectedId);home.onclick=onRestoreCamera;
  undo.onclick=()=>{lastEditKey=null;cancelPreview();if(!history.length)return;future.push(snapshot());restore(history.pop());refresh();persist();};redo.onclick=()=>{lastEditKey=null;cancelPreview();if(!future.length)return;history.push(snapshot());restore(future.pop());refresh();persist();};
  save.onclick=()=>{if(previewBefore){message('Install or cancel the preview before saving.',true);return;}if(persist()!==false)message('Configuration saved locally.');};
  panel.selectCabinet=(r,id)=>{lastEditKey=null;measurementStatus.textContent='';cancelPreview();const nextId=id||cabinetList(r)[0]?.id;if(selected!==r||selectedId!==nextId)tier.value='all';selected=r;selectedId=nextId;const a=current()?.accessory,p=PRODUCT_BY_ID.get(a?.productModelId);if(p){category.value=p.category;populateProducts();product.value=p.id;}refresh();};
  panel.close=()=>{if(closed)return;closed=true;cancelPreview();for(const r of roots)if(kitchenCutaway(r))setKitchenCutaway(r,false);panel.remove();onClose();};close.onclick=panel.close;
  panel.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='Escape'){panel.close();return;}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){
      e.preventDefault();
      if(e.shiftKey)redo.click();else undo.click();
    }else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='y'){
      e.preventDefault();redo.click();
    }
  });
  document.body.append(panel);populateProducts();drawSwatches();panel.selectCabinet(selected,selectedId);return panel;
}
