// Dimensions are metres in saved layouts and centimetres in the editor.
export const WARDROBE_FRONTS = {
  door: 'Full-height door', mixed: 'Door above drawers', drawers: 'Drawers only',
  open: 'Open shelves', dressing: 'Dressing mirror above drawers', shelves: 'Shelves above drawers',
};
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const bounded=(value,min,max,label)=>{
  if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${label} must be between ${Math.round(min*1000)/10} and ${Math.round(max*1000)/10} cm.`);
  return value;
};

export function defaultWardrobeConfig(type,width,depth) {
  const standalone=type.startsWith('loft-'),loft=!standalone&&type.includes('loft');
  const explicit=Number(type.match(/(?:wardrobe-(?:sliding-)?|loft-.*-)([123])(?:-loft)?$/)?.[1]);
  const sliding=type.includes('sliding');
  const count=explicit||(sliding?3:loft?4:5);
  let drawerIndex=0;
  const sections=Array.from({length:count},(_,i)=>{
    const front=standalone?'door':explicit?'mixed':sliding?(i===2?'shelves':'door'):loft?(i===3?'dressing':'door'):(i===2?'mixed':'door');
    const drawerCount=['mixed','shelves','dressing'].includes(front)?(!explicit&&(sliding||!loft)?3:2):0;
    const fraction=!explicit&&sliding?(i===2?.28:.36):1/count;
    return {id:String(i+1),width:width*fraction,front,drawerCount:drawerCount||2,
      drawerHeight:explicit?.49:loft?.72:.74,
      drawerIds:Array.from({length:drawerCount},()=>`drawer-${++drawerIndex}`),
      hinge:i===count-1&&count>1?'right':'left',doorHandle:true,drawerHandles:true,mirror:{mode:'none'}};
  });
  return {version:1,standalone,width,depth,height:standalone?.6:loft?2.12:2.2,
    opening:sliding?'sliding':'hinged',sections,
    loft:{enabled:loft,width,depth,height:.58,alignment:'center',count:explicit||4,handles:true},
    attachment:{wallId:null,side:1}};
}

export function normalizeWardrobeConfig(input) {
  const c=structuredClone(input);
  c.version=1;c.standalone=Boolean(c.standalone);
  c.width=bounded(Number(c.width),.3,8,'Cabinet width');
  c.depth=bounded(Number(c.depth),.2,1.5,'Cabinet depth');
  c.height=bounded(Number(c.height),c.standalone?.2:.6,4,'Cabinet height');
  c.opening=c.opening==='sliding'?'sliding':'hinged';
  if(!Array.isArray(c.sections)||!c.sections.length||c.sections.length>12)throw new Error('Use between 1 and 12 sections.');
  const ids=new Set(),drawerIds=new Set();
  for(const s of c.sections){
    s.id=String(s.id);
    if(!/^[\w-]+$/.test(s.id)||ids.has(s.id))throw new Error('Each section needs a unique ID.');
    ids.add(s.id);
    s.width=bounded(Number(s.width),.2,3,'Section width');
    s.front=Object.hasOwn(WARDROBE_FRONTS,s.front)?s.front:'door';
    s.drawerCount=Math.round(finite(s.drawerCount,2));
    if(s.drawerCount<1||s.drawerCount>12)throw new Error('Use between 1 and 12 drawers per section.');
    s.drawerHeight=bounded(finite(s.drawerHeight,.49),.12,3,'Drawer stack height');
    s.hinge=s.hinge==='right'?'right':'left';
    // Older saved layouts retain their handles unless explicitly removed.
    s.doorHandle=s.doorHandle!==false;s.drawerHandles=s.drawerHandles!==false;
    for(const prefix of ['door','drawer']){
      if(s[prefix+'HandleLength']!=null)s[prefix+'HandleLength']=bounded(Number(s[prefix+'HandleLength']),.03,2,'Handle length');
      s[prefix+'HandleThickness']=bounded(finite(s[prefix+'HandleThickness'],.016),.005,.06,'Handle thickness');
      s[prefix+'HandleOffsetY']=bounded(finite(s[prefix+'HandleOffsetY'],0),-4,4,'Handle vertical offset');
      s[prefix+'HandleDepth']=bounded(finite(s[prefix+'HandleDepth'],prefix==='door'?.032:.034),.01,.12,'Handle projection');
    }
    s.drawerIds=Array.isArray(s.drawerIds)?s.drawerIds.map(String):[];
    while(s.drawerIds.length<s.drawerCount)s.drawerIds.push(`drawer-section-${s.id}-${s.drawerIds.length+1}`);
    for(const id of s.drawerIds){
      if(!/^drawer-[\w-]+$/.test(id)||drawerIds.has(id))throw new Error('Each drawer needs a unique ID.');
      drawerIds.add(id);
    }
    const available=c.height-(c.standalone?.04:.12);
    if(['mixed','dressing','shelves'].includes(s.front)&&s.drawerHeight>available-.25)throw new Error('Leave at least 25 cm above the drawer stack.');
    const stack=s.front==='drawers'?available:s.drawerHeight;
    if(['drawers','mixed','dressing','shelves'].includes(s.front)&&stack/s.drawerCount<.12)throw new Error('Each drawer needs at least 12 cm of height.');
    const m=s.mirror||{mode:'none'};
    s.mirror={mode:['none','fit','custom'].includes(m.mode)?m.mode:'none'};
    if(s.mirror.mode==='custom'){
      const size=wardrobeDoorSize(c,s);
      s.mirror.width=bounded(Number(m.width),.05,size.width,'Mirror width');
      s.mirror.height=bounded(Number(m.height),.05,size.height,'Mirror height');
    }
  }
  if(Math.abs(c.sections.reduce((sum,s)=>sum+s.width,0)-c.width)>.001)throw new Error('Section widths must add up to the cabinet width.');
  const l=c.loft||{};
  c.loft={enabled:!c.standalone&&Boolean(l.enabled),width:finite(l.width,c.width),height:finite(l.height,.58),depth:finite(l.depth,c.depth),
    alignment:['left','center','right'].includes(l.alignment)?l.alignment:'center',count:Math.round(finite(l.count,c.sections.length)),handles:l.handles!==false,handleOffsetY:bounded(finite(l.handleOffsetY,0),-4,4,'Loft handle vertical offset'),handleLength:l.handleLength==null?undefined:bounded(Number(l.handleLength),.03,2,'Loft handle length'),handleThickness:bounded(finite(l.handleThickness,.016),.005,.06,'Loft handle thickness'),handleDepth:bounded(finite(l.handleDepth,.032),.01,.12,'Loft handle projection')};
  if(c.loft.enabled){
    bounded(c.loft.width,.3,8,'Loft width');bounded(c.loft.height,.2,2,'Loft height');bounded(c.loft.depth,.2,1.5,'Loft depth');
    if(c.loft.count<1||c.loft.count>12||c.loft.width/c.loft.count<.2)throw new Error('Each loft door needs at least 20 cm of width (1–12 doors).');
  }
  c.attachment={wallId:c.attachment?.wallId==null?null:String(c.attachment.wallId),side:c.attachment?.side===-1?-1:1};
  return c;
}

export function wardrobeDoorSize(config,section) {
  const bottom=config.standalone?.022:.08;
  const drawerHeight=section.front==='mixed'?section.drawerHeight+.003:0;
  return {width:Math.max(.05,section.width-.088),height:Math.max(.05,config.height-bottom-.088-drawerHeight)};
}

export function wardrobeConfigFromRoot(root) {
  const data=root.userData;
  let c=data.wardrobeConfig?structuredClone(data.wardrobeConfig):null;
  if(!c){
    const back=root.getObjectByName(data.isStandaloneLoft?'loft-back':'back');
    const [width,,depth]=back?.userData.panelSize||[1,1,.02];
    const top=root.getObjectByName(data.isStandaloneLoft?'loft-top':'top');
    c=defaultWardrobeConfig(data.wardrobeVariant,top?.userData.panelSize[0]||width,top?.userData.panelSize[2]||depth);
    if(data.wardrobeAttachment)c.attachment={...data.wardrobeAttachment};
  }
  c.width*=root.scale.x;c.depth*=root.scale.z;c.height*=root.scale.y;
  for(const s of c.sections){
    s.width*=root.scale.x;s.drawerHeight*=root.scale.y;
    if(s.mirror.mode==='custom'){s.mirror.width*=root.scale.x;s.mirror.height*=root.scale.y;}
  }
  c.loft.width*=root.scale.x;c.loft.depth*=root.scale.z;c.loft.height*=root.scale.y;
  return c;
}

// Keep widths of the other sections unchanged when editing just one section.
export function resizeWardrobeSection(config,id,width) {
  const next=structuredClone(config),s=next.sections.find(s=>s.id===id);
  if(!s)throw new Error('Select a section first.');
  next.width+=width-s.width;s.width=width;return next;
}

export function resizeWardrobeWidth(config,width) {
  const next=structuredClone(config),ratio=width/next.width;
  next.sections.forEach(s=>s.width*=ratio);next.width=width;return next;
}

export function wardrobeWallPlacement(config,position,walls) {
  const a=config.attachment;if(!a.wallId)return {x:position.x,z:position.z,rotation:null};
  const wall=walls.find(w=>String(w.id)===a.wallId);
  if(!wall)throw new Error('The attached wall is unavailable. Choose another wall or detach.');
  const dx=wall.end.x-wall.start.x,dz=wall.end.y-wall.start.y,length=Math.hypot(dx,dz);
  const width=Math.max(config.width,config.loft.enabled?config.loft.width:0);
  if(length<width)throw new Error('This wall is shorter than the cabinet or loft. Choose a longer wall.');
  const tx=dx/length,tz=dz/length,nx=-tz*a.side,nz=tx*a.side;
  const loftOffset=config.loft.enabled?(config.loft.alignment==='left'?(config.loft.width-config.width)/2:config.loft.alignment==='right'?(config.width-config.loft.width)/2:0):0;
  const rotation=Math.atan2(nx,nz),localXAlong=Math.cos(rotation)*tx-Math.sin(rotation)*tz;
  const offset=loftOffset*localXAlong;
  const minAlong=Math.max(config.width/2,config.loft.enabled?config.loft.width/2-offset:0);
  const maxAlong=length-Math.max(config.width/2,config.loft.enabled?config.loft.width/2+offset:0);
  if(minAlong>maxAlong)throw new Error('The cabinet and offset loft do not fit along this wall.');
  const along=Math.max(minAlong,Math.min(maxAlong,(position.x-wall.start.x)*tx+(position.z-wall.start.y)*tz));
  const clearance=config.depth/2+(Number(wall.thickness)||.15)/2;
  return {x:wall.start.x+tx*along+nx*clearance,z:wall.start.y+tz*along+nz*clearance,rotation};
}
