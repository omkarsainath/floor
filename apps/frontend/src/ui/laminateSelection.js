// Shared checkbox selection; keys remain stable when the editor refreshes.
export function laminateSelection(parent, entries, onChange=()=>{}) {
  const box=document.createElement('fieldset');box.dataset.laminateSelection='';
  box.style.cssText='margin:10px 0;padding:10px;border:1px solid #63747c;border-radius:8px';
  const legend=document.createElement('legend');box.append(legend);
  const chosen=new Set();
  const list=document.createElement('div');list.style.cssText='max-height:200px;overflow:auto';
  const update=()=>{legend.textContent=`${chosen.size} parts selected`;onChange();};
  for(const [title,all] of [['Select all',true],['Clear selection',false]]){
    const b=document.createElement('button');b.type='button';b.textContent=title;b.onclick=()=>{chosen.clear();if(all)for(const e of entries())chosen.add(e.key);render();update();};box.append(b);
  }
  box.append(list);parent.append(box);
  function render(){
    const available=entries();for(const key of chosen)if(!available.some(e=>e.key===key))chosen.delete(key);
    list.replaceChildren();
    for(const e of available){const label=document.createElement('label');label.style.cssText='display:flex;align-items:center;gap:8px;margin:8px 0';
      const input=document.createElement('input');input.type='checkbox';input.dataset.laminateTarget=e.key;input.checked=chosen.has(e.key);input.style.cssText='width:auto;flex:none;margin:0';
      input.onchange=()=>{input.checked?chosen.add(e.key):chosen.delete(e.key);update();};label.append(input,document.createTextNode(e.label));list.append(label);
    }legend.textContent=`${chosen.size} parts selected`;
  }
  render();return {box,chosen,render};
}
