import {DINING_CHAIR_STYLES} from '../generators/referenceFurniture.js';
import {REFERENCE_BY_ID} from '../generators/referenceFurnitureCatalog.js';

// Seat coordinates are local to the dining set, so rotating/moving the set keeps
// its arrangement intact. The table is never rebuilt or fitted around edits.
export function showDiningChairEditor({root,chairId,onChange,onHighlight,onClose}){
  document.getElementById('dining-chair-editor')?.remove();
  const panel=document.createElement('section');panel.id='dining-chair-editor';
  panel.setAttribute('aria-label','Dining chair editor');
  panel.style.cssText='position:fixed;right:18px;top:100px;width:310px;max-width:90vw;max-height:75vh;overflow:auto;z-index:40;background:#171c29;color:#f1f5f9;border:1px solid #657084;border-radius:12px;padding:16px;font:13px system-ui;box-shadow:0 6px 24px #0006';
  const heading=document.createElement('h3');heading.textContent='Edit dining chairs';heading.style.margin='0 0 10px';panel.append(heading);
  const help=document.createElement('p');help.textContent='Select a chair here or click one in the scene. Changes affect seats only. Close this editor to move or edit the whole table.';panel.append(help);
  let selected=chairId||root.userData.diningChairs[0]?.id||null;
  const history=[];
  const controls=document.createElement('div');panel.append(controls);
  const status=document.createElement('p');status.setAttribute('role','status');panel.append(status);
  const close=document.createElement('button');close.textContent='Done';close.dataset.action='close';
  close.onclick=()=>{panel.remove();onClose();};panel.append(close);
  const all=()=>root.userData.diningChairs.map(c=>({...c}));
  function commit(next,nextId=selected){
    try{
      const previous=all(),saved=onChange(next);history.push(previous);if(history.length>30)history.shift();
      selected=nextId;render();status.textContent=saved===false?'Updated, but local saving failed. Export the project before leaving.':'Chairs updated and saved locally.';
    }catch(error){status.textContent=error.message;}
  }
  function render(){
    controls.replaceChildren();const chairs=all();
    if(!chairs.some(c=>c.id===selected))selected=chairs[0]?.id||null;
    const current=chairs.find(c=>c.id===selected);
    const label=document.createElement('label');label.textContent=`Seat (${chairs.length} total)`;
    const picker=document.createElement('select');picker.dataset.field='seat';
    if(!chairs.length)picker.add(new Option('No chairs — add one below',''));
    chairs.forEach((c,i)=>picker.add(new Option(`${i+1}. ${DINING_CHAIR_STYLES.find(s=>s.id===c.style)?.label||c.style}`,c.id)));
    picker.value=selected||'';picker.onchange=()=>{selected=picker.value;render();};label.append(picker);controls.append(label);
    const styleLabel=document.createElement('label');styleLabel.textContent='Chair style';
    const style=document.createElement('select');style.dataset.field='style';
    DINING_CHAIR_STYLES.forEach(s=>style.add(new Option(s.label,s.id)));style.value=current?.style||'matching';
    styleLabel.append(style);controls.append(styleLabel);
    const fields={};
    for(const [key,text,min,max] of [['width','Width',.25,3],['depth','Depth',.25,2],['x','Local X',-20,20],['z','Local Z',-20,20],['angle','Rotation (degrees)',-360,360]]){
      const l=document.createElement('label');l.textContent=text;
      const input=document.createElement('input');input.type='number';input.min=min;input.max=max;input.step='any';input.dataset.field=key;
      input.value=(key==='angle'?(current?.yaw||0)*180/Math.PI:current?.[key]??(key==='width'?.48:key==='depth'?.5:0)).toFixed(3);
      l.append(input);controls.append(l);fields[key]=input;
    }
    const colLabel=document.createElement('label');colLabel.textContent='Seat colour';
    const color=document.createElement('input');color.type='color';color.dataset.field='color';
    const styleColor=id=>REFERENCE_BY_ID.get(id)?.upholstery||REFERENCE_BY_ID.get(id)?.color||REFERENCE_BY_ID.get(root.userData.referenceId).upholstery;
    color.value=current?.color||styleColor(current?.style);let customColor=!!current?.color;
    color.oninput=()=>{customColor=true;};colLabel.append(color);controls.append(colLabel);
    style.onchange=()=>{
      color.value=styleColor(style.value);customColor=false;
      fields.width.value=style.value==='bench'?1.4:style.value==='armchair'?.8:style.value.startsWith('chair-executive')?.7:.48;
      fields.depth.value=style.value==='bench'?.4:style.value==='armchair'?.8:style.value.startsWith('chair-executive')?.72:.5;
    };
    function edited(id){
      for(const input of Object.values(fields))if(!input.checkValidity()||input.value==='')throw new Error('Enter valid dimensions and position values.');
      return {id,style:style.value,width:Number(fields.width.value),depth:Number(fields.depth.value),x:Number(fields.x.value),z:Number(fields.z.value),yaw:Number(fields.angle.value)*Math.PI/180,...(customColor?{color:color.value}:{})};
    }
    function action(text,name,fn,disabled=false){const b=document.createElement('button');b.textContent=text;b.dataset.action=name;b.disabled=disabled;b.onclick=()=>{try{fn();}catch(e){status.textContent=e.message;}};controls.append(b);return b;}
    action('Apply to selected chair','apply',()=>commit(chairs.map(c=>c.id===selected?edited(c.id):c)),!current);
    action('Add chair with this style','add',()=>{
      const c=edited(`seat-${crypto.randomUUID()}`);
      if(!current){c.x=0;c.z=REFERENCE_BY_ID.get(root.userData.referenceId).td/2+.4;c.yaw=Math.PI;}
      // Start next to the selected seat, never directly on top of it. The user
      // can then position/rotate it; this is not an automatic room-clearance solver.
      const clearance=o=>Math.hypot(Math.max(c.width,c.depth),Math.max(o.width,o.depth))*.55+.12;
      while(chairs.some(o=>Math.hypot(o.x-c.x,o.z-c.z)<clearance(o)))c.x+=c.width+.16;
      commit([...chairs,c],c.id);
    },chairs.length>=32);
    action('Duplicate selected chair','duplicate',()=>{
      const c={...current,id:`seat-${crypto.randomUUID()}`};
      do{c.x+=Math.max(c.width,c.depth)+.16;}while(chairs.some(o=>Math.hypot(o.x-c.x,o.z-c.z)<Math.max(o.width,o.depth)+.12));
      commit([...chairs,c],c.id);
    },!current||chairs.length>=32);
    action('Delete selected chair','delete',()=>commit(chairs.filter(c=>c.id!==selected),null),!current);
    action('Undo chair edit','undo',()=>{
      const previous=history.at(-1);const saved=onChange(previous);history.pop();render();status.textContent=saved===false?'Undone; local saving failed.':'Chair edit undone and saved.';
    },history.length===0);
    const units=document.createElement('p');units.textContent='Sizes and X/Z are local metres before whole-set scaling. Check chair spacing after adding seats.';controls.append(units);
    controls.querySelectorAll('label').forEach(l=>{l.style.cssText='display:flex;justify-content:space-between;gap:8px;align-items:center;margin:8px 0';});
    controls.querySelectorAll('input,select').forEach(el=>{el.style.cssText='width:175px;box-sizing:border-box;padding:5px;background:#272f40;color:white;border:1px solid #667085;border-radius:4px';});
    panel.querySelectorAll('button').forEach(b=>{b.style.cssText='padding:8px;margin:4px 4px 4px 0;background:#354566;color:white;border:1px solid #64748b;border-radius:6px;cursor:pointer';b.style.opacity=b.disabled?'.4':'1';});
    onHighlight(selected);
  }
  panel.addEventListener('keydown',e=>{if(e.key!=='Escape')e.stopPropagation();});
  document.body.append(panel);render();return panel;
}
