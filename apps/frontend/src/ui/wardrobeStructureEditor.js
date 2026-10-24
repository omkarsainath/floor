import { WARDROBE_FRONTS, wardrobeConfigFromRoot, resizeWardrobeSection, resizeWardrobeWidth, wardrobeDoorSize } from '../generators/wardrobeConfig.js';

export function showWardrobeStructureEditor({root,walls=[],onChange,onHighlight,onClose,onFinishes}) {
  document.getElementById('wardrobe-structure-editor')?.remove();
  const panel=document.createElement('section');panel.id='wardrobe-structure-editor';panel.setAttribute('aria-label','Wardrobe layout and dimensions');
  panel.style.cssText='position:fixed;right:18px;top:82px;width:380px;max-width:calc(100vw - 36px);max-height:calc(100dvh - 110px);overflow:auto;z-index:42;padding:18px;box-sizing:border-box;border-radius:14px;background:#17212a;color:#edf1ed;border:1px solid #53646b;box-shadow:0 14px 50px #0006;font:13px system-ui';
  const style=document.createElement('style');style.textContent=`
    #wardrobe-structure-editor h3{margin:0 0 8px}#wardrobe-structure-editor h4{margin:18px 0 8px}
    #wardrobe-structure-editor label{display:block;margin:8px 0;color:#cfdbdd}
    #wardrobe-structure-editor input,#wardrobe-structure-editor select,#wardrobe-structure-editor button{box-sizing:border-box;width:100%;margin-top:4px;padding:8px;border:1px solid #627780;border-radius:6px;background:#24323d;color:white;font:inherit}
    #wardrobe-structure-editor input[type=checkbox]{width:auto;margin-right:8px}#wardrobe-structure-editor button{cursor:pointer}
    #wardrobe-structure-editor button:disabled{opacity:.4;cursor:default}#wardrobe-structure-editor p{line-height:1.45;color:#bdcccd}
    #wardrobe-structure-editor .dimension-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    #wardrobe-structure-editor [role=status]{min-height:2em;color:#d9e9d1}
    #wardrobe-structure-editor :focus-visible{outline:2px solid #b9ddb2;outline-offset:2px}
  `;panel.append(style);
  const content=document.createElement('div');panel.append(content);
  const status=document.createElement('p');status.setAttribute('role','status');status.hidden=true;
  status.style.cssText='position:sticky;top:0;z-index:3;padding:8px;background:#1e302e;border-radius:6px';panel.insertBefore(status,content);
  const setStatus=text=>{status.textContent=text;status.hidden=!text;};
  let config=wardrobeConfigFromRoot(root),selected=config.sections[0].id;
  const history=[];
  const make=(tag,text,parent=content)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
  const button=(label,action,fn,parent=content)=>{const b=make('button',label,parent);b.type='button';b.dataset.action=action;b.onclick=fn;return b;};
  function commit(next,elevation=root.position.y,message='Layout updated.'){
    const before={config:structuredClone(config),elevation:root.position.y};
    try{
      const saved=onChange(next,elevation);history.push(before);if(history.length>30)history.shift();
      config=wardrobeConfigFromRoot(root);render();setStatus(saved===false?'Applied, but local saving failed. Export the project before leaving.':message+' Saved locally.');
    }catch(error){render();setStatus(error.message);}
  }
  function number(label,key,value,min,max,change,parent=content,{cm=true,step=.1}={}){
    const l=make('label',label,parent),el=make('input','',l);el.type='number';el.dataset.field=key;
    el.min=String(min);el.max=String(max);el.step=String(step);el.required=true;
    el.value=String(Math.round(value*(cm?100:1)*100)/100);
    el.onchange=()=>{if(el.reportValidity())change(Number(el.value)/(cm?100:1));};return el;
  }
  function select(label,key,value,options,change){
    const l=make('label',label),el=make('select','',l);el.dataset.field=key;
    for(const [id,title] of options)el.add(new Option(title,id));el.value=String(value);el.onchange=()=>change(el.value);return el;
  }
  const change=(fn,message)=>{const next=structuredClone(config);fn(next);commit(next,root.position.y,message);};
  function highlight(){
    let target;
    root.traverse(n=>{
      if(!target&&(selected==='loft'?n.userData.wardrobeModule==='loft':n.userData.wardrobeSectionId===selected))target=n;
      if(!target&&n.userData.wardrobeSurface?.id===`${config.standalone?'loft':'door'}-${selected}`)target=n;
    });onHighlight(target||root);
  }
  function render(){
    content.replaceChildren();
    make('h3',config.standalone?'Edit loft':'Edit wardrobe');
    const done=button('Done','close',()=>{panel.remove();onClose();});done.style.cssText='position:sticky;top:48px;z-index:2';
    make('p','All measurements are in cm. Changes apply when you finish a field. Select a section here or click a front in the scene.');
    make('h4',config.standalone?'Loft dimensions':'Wardrobe body · excluding loft');
    const row=make('div','');row.className='dimension-row';
    number('Width','width',config.width,30,800,v=>commit(resizeWardrobeWidth(config,v)),row);
    number('Height','height',config.height,config.standalone?20:60,400,v=>change(c=>c.height=v),row);
    number('Depth','depth',config.depth,20,150,v=>change(c=>c.depth=v),row);
    number('Base above floor','elevation',root.position.y,0,1000,v=>commit(config,v));
    make('p',`Total height: ${Math.round((config.height+(config.loft.enabled?config.loft.height:0))*1000)/10} cm. Body depth excludes handles. Overall width resizes sections proportionally.`);
    if(!config.standalone){
      make('h4','Independent loft');
      select('Loft','loft-enabled',String(config.loft.enabled),[['true','Include loft'],['false','No loft']],v=>change(c=>c.loft.enabled=v==='true'));
      if(config.loft.enabled){
        const row=make('div','');row.className='dimension-row';
        for(const [key,label,min,max] of [['width','Width',30,800],['height','Height',20,200],['depth','Depth',20,150]])
          number(label,'loft-'+key,config.loft[key],min,max,v=>change(c=>c.loft[key]=v),row);
        select('Loft alignment','loft-alignment',config.loft.alignment,[['left','Left edges aligned'],['center','Centred'],['right','Right edges aligned']],v=>change(c=>c.loft.alignment=v));
        number('Number of loft doors','loft-count',config.loft.count,1,12,v=>change(c=>c.loft.count=v),content,{cm:false,step:1});
        select('Loft handles','loft-handles',String(config.loft.handles!==false),[['true','Show handles'],['false','No handles']],v=>change(c=>c.loft.handles=v==='true'));
        if(config.loft.handles!==false){for(const [key,label,value,min,max] of [['handleOffsetY','Handle up / down',config.loft.handleOffsetY??0,-400,400],['handleLength','Handle length',config.loft.handleLength??Math.min(.65,config.loft.height*.4),3,200],['handleThickness','Handle thickness',config.loft.handleThickness??.016,.5,6],['handleDepth','Handle projection',config.loft.handleDepth??.032,1,12]])number(label,'loft-'+key,value,min,max,v=>change(c=>c.loft[key]=v));}
        make('p','Loft dimensions are independent of the body. Their backs stay aligned.');
      }
    }
    make('p','Handle up / down: positive cm moves up, negative moves down, and 0 centres it. Movement stops at the panel edge.');
    make('h4','Sections and fronts');
    if(!config.sections.some(s=>s.id===selected))selected=config.sections[0].id;
    select('Selected section','section',selected,config.sections.map((s,i)=>[s.id,`Section ${i+1} · ${WARDROBE_FRONTS[s.front]}`]),v=>{selected=v;render();});
    const section=config.sections.find(s=>s.id===selected);
    const update=fn=>change(c=>fn(c.sections.find(s=>s.id===selected)));
    number('This section’s width','section-width',section.width,20,300,v=>commit(resizeWardrobeSection(config,selected,v)));
    make('p','Changing one section’s width keeps the other section widths unchanged.');
    select('Front layout','front',section.front,Object.entries(WARDROBE_FRONTS),v=>update(s=>{s.front=v;if(!['door','mixed'].includes(v))s.mirror={mode:'none'};}));
    if(['mixed','drawers','dressing','shelves'].includes(section.front)){
      number('Number of drawers','drawer-count',section.drawerCount,1,12,v=>update(s=>s.drawerCount=v),content,{cm:false,step:1});
      if(section.front!=='drawers')number('Drawer stack height','drawer-height',section.drawerHeight,12,300,v=>update(s=>s.drawerHeight=v));
      select('Drawer handles in this section','drawer-handles',String(section.drawerHandles!==false),[['true','Show handles'],['false','No handles']],v=>update(s=>s.drawerHandles=v==='true'));
      if(section.drawerHandles!==false){for(const [key,label,value,min,max] of [['drawerHandleOffsetY','Handle up / down',section.drawerHandleOffsetY??0,-400,400],['drawerHandleLength','Handle length',section.drawerHandleLength??section.width*.5,3,200],['drawerHandleThickness','Handle thickness',section.drawerHandleThickness??.016,.5,6],['drawerHandleDepth','Handle projection',section.drawerHandleDepth??.034,1,12]])number(label,key,value,min,max,v=>update(s=>s[key]=v));}
      button('Remove drawers · extend door to bottom','remove-drawers',()=>update(s=>s.front='door'));
    }
    if(['door','mixed'].includes(section.front)){
      button('Replace this door with drawers','replace-door',()=>update(s=>{s.front='drawers';s.drawerCount=Math.max(3,s.drawerCount);s.mirror={mode:'none'};}));
      select('Door opening','opening',config.opening,[['hinged','Hinged doors'],['sliding','Sliding doors (two or more sections)']],v=>change(c=>c.opening=v));
      if(config.opening==='hinged')select('Hinge side','hinge',section.hinge,[['left','Left'],['right','Right']],v=>update(s=>s.hinge=v));
      select('Handle on this door','door-handle',String(section.doorHandle!==false),[['true','Show handle'],['false','No handle']],v=>update(s=>s.doorHandle=v==='true'));
      if(section.doorHandle!==false){for(const [key,label,value,min,max] of [['doorHandleOffsetY','Handle up / down',section.doorHandleOffsetY??0,-400,400],['doorHandleLength','Handle length',section.doorHandleLength??Math.min(.65,wardrobeDoorSize(config,section).height*.4),3,200],['doorHandleThickness','Handle thickness',section.doorHandleThickness??.016,.5,6],['doorHandleDepth','Handle projection',section.doorHandleDepth??.032,1,12]])number(label,key,value,min,max,v=>update(s=>s[key]=v));make('p','Handle length is limited to the available door or drawer size.');}
      if(section.doorHandle===false)make('p','You can still click the door to open it. Choose Show handle to restore it.');
      make('h4','Mirror on this door');
      select('Mirror size','mirror-mode',section.mirror.mode,[['none','No mirror'],['fit','Fit to door with a border'],['custom','Custom measurements · centred']],v=>update(s=>{
        const size=wardrobeDoorSize(config,s);s.mirror=v==='custom'?{mode:v,width:Math.min(.4,size.width),height:Math.min(1.2,size.height)}:{mode:v};
      }));
      if(section.mirror.mode==='custom'){
        const size=wardrobeDoorSize(config,section);
        number('Mirror width','mirror-width',section.mirror.width,5,Math.floor(size.width*1000)/10,v=>update(s=>s.mirror.width=v));
        number('Mirror height','mirror-height',section.mirror.height,5,Math.floor(size.height*1000)/10,v=>update(s=>s.mirror.height=v));
      }
      if(section.mirror.mode!=='none')make('p','The mirror moves with the door. Fit-to-door mirrors resize automatically.');
    }
    button('Add section','add-section',()=>change(c=>{
      let id=1;while(c.sections.some(s=>s.id===String(id)))id++;
      const s={id:String(id),width:.6,front:'door',drawerCount:2,drawerHeight:.49,drawerIds:[],hinge:'left',mirror:{mode:'none'}};
      c.sections.push(s);c.width+=s.width;selected=s.id;
    })).disabled=config.sections.length>=12;
    button('Remove this section','remove-section',()=>change(c=>{const i=c.sections.findIndex(s=>s.id===selected);c.width-=c.sections[i].width;c.sections.splice(i,1);})).disabled=config.sections.length===1;
    make('h4','Wall attachment');
    const validWalls=walls.filter(w=>w.id!=null&&w.start&&w.end);
    select('Attach cabinet back to wall','wall',config.attachment.wallId||'',[['','Free standing'],...validWalls.map((w,i)=>[String(w.id),`Wall ${i+1} · ${Math.round(Math.hypot(w.end.x-w.start.x,w.end.y-w.start.y)*100)} cm`])],v=>change(c=>{
      c.attachment.wallId=v||null;
      const wall=validWalls.find(w=>String(w.id)===v);
      if(wall){const dx=wall.end.x-wall.start.x,dz=wall.end.y-wall.start.y;c.attachment.side=(-dz*(root.position.x-wall.start.x)+dx*(root.position.z-wall.start.y))<0?-1:1;}
    }));
    if(config.attachment.wallId){
      select('Wall side','wall-side',String(config.attachment.side),[['1','Side 1'],['-1','Side 2']],v=>change(c=>c.attachment.side=Number(v)));
      make('p','The back stays flush to the wall after changing depth. Detach before rotating freely.');
    }else if(!validWalls.length)make('p','Add walls to the floor plan to enable wall attachment.');
    button('Edit laminate colours','finishes',()=>{panel.remove();onFinishes();});
    const undo=button('Undo last layout change','undo',()=>{
      const previous=history.at(-1);if(!previous)return;
      try{const saved=onChange(previous.config,previous.elevation);history.pop();config=wardrobeConfigFromRoot(root);render();setStatus(saved===false?'Undone, but local saving failed.':'Layout change undone and saved.');}catch(e){setStatus(e.message);}
    });undo.disabled=!history.length;
    highlight();
  }
  panel.selectSection=id=>{if(config.sections.some(s=>s.id===id)){selected=id;render();}};
  panel.selectLoft=()=>{
    let target=root.getObjectByName('loft-module');
    if(!target)root.traverse(n=>{if(!target&&n.userData.wardrobeSurface?.group==='Loft doors')target=n;});
    onHighlight(target||root);content.querySelector('[data-field="loft-enabled"]')?.scrollIntoView({block:'nearest'});
  };
  panel.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();panel.remove();onClose();}});
  document.body.append(panel);render();return panel;
}
