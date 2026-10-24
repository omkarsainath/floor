import { createLaminateMaterial, updateLaminateMaterial, normalizeLaminateChoice, GREENLAM_BY_ID } from '../materials/greenlam.js';

const resources=new WeakMap();
export function wardrobeSurfaceMeshes(root,id) {
  const found=[];root.traverse(n=>{if(n.isMesh&&n.userData.wardrobeSurface?.id===id)found.push(n);});return found;
}
export function wardrobeSurfaceFromHit(mesh,root) {
  for(let n=mesh;n&&n!==root;n=n.parent){
    if(n.userData.wardrobeSurface)return n.userData.wardrobeSurface.id;
    const front=n.children?.find(c=>c.userData.wardrobeSurface);
    if(front)return front.userData.wardrobeSurface.id;
  }
  return null;
}
export function initializeWardrobeFinishes(root,options={}) {
  const counts={};const surfaces=[];
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const name=mesh.name,parent=mesh.parent;
    let id,label,group,face=4;
    if(mesh.userData.wardrobeSurfaceSpec){
      ({id,label,group,face=4}=mesh.userData.wardrobeSurfaceSpec);
    }else if(root.userData.wardrobeConfig)return;
    else if(['door-front','sliding-front'].includes(name)){
      const loft=parent.userData.wardrobePart==='loft';
      const number=parent.name==='centre-leaf'?3:Number(parent.name.match(/(\d+)$/)?.[1]||1);
      id=`${loft?'loft':'door'}-${number}`;label=`${loft?'Loft door':'Door'} ${number}`;group=loft?'Loft doors':'Main doors';
    }else if(name==='drawer-front'){
      const n=counts.drawer=(counts.drawer||0)+1;id=`drawer-${n}`;label=`Drawer ${n}`;group='Drawer fronts';
    }else if(name==='side'||name==='loft-side'){
      const left=mesh.position.x<0;id=left?'side-left':'side-right';label=left?'Left side':'Right side';group='Carcass';face=left?1:0;
    }else if(name==='top'||name==='loft-top'){id='top';label='Top panel';group='Carcass';face=2;
    }else if(name==='back'||name==='loft-back'){id='back';label='Outside back';group='Carcass';face=5;
    }else if(name==='plinth'){id='plinth';label='Plinth';group='Carcass';
    }else if(name==='dressing-counter'){id='counter';label='Dressing counter';group='Dressing area';face=2;
    }else if(name==='mirror-frame'){id='mirror-frame';label='Mirror surround';group='Dressing area';
    }else return;
    const [w,h,d]=mesh.userData.panelSize;
    const width=face<2?d:w,height=face===2?d:h;
    const defaultFinish=mesh.userData.defaultLaminate;
    const info={id,label,group,face,width,height,defaultFinish};
    mesh.userData.wardrobeSurface=info;surfaces.push(info);
    resources.set(mesh,{base:mesh.material,owned:[]});
  });
  root.userData.wardrobeSurfaces=surfaces.sort((a,b)=>a.group.localeCompare(b.group)||a.id.localeCompare(b.id,undefined,{numeric:true}));
  root.userData.wardrobeFinishes={};
  updateWardrobeFinishes(root,options.wardrobeFinishes||{});
  return root;
}

// Only known part IDs and catalogue designs survive import. Invalid/stale
// entries gracefully fall back to that model's default without recolouring it all.
export function updateWardrobeFinishes(root,input={}) {
  const next={};
  for(const surface of root.userData.wardrobeSurfaces||[]){
    const normalized=normalizeLaminateChoice(input?.[surface.id]);if(normalized)next[surface.id]=normalized;
    const choice=normalized||{laminateId:surface.defaultFinish,rotation:0,scale:1};
    for(const mesh of wardrobeSurfaceMeshes(root,surface.id)){
      const state=resources.get(mesh);
      if(!state)throw new Error('This part is no longer connected to its finish editor. Reload the viewer and try again.');
      const signature=JSON.stringify(choice);if(state.signature===signature)continue;
      const face=state.owned[0]
        ? updateLaminateMaterial(state.owned[0],choice,surface.width,surface.height)
        : createLaminateMaterial(choice,surface.width,surface.height);
      const edge=state.owned[1]||face.clone();
      const hadClearcoat=edge.clearcoat>0;
      edge.roughness=face.roughness;edge.clearcoat=face.clearcoat;
      if(hadClearcoat!==(edge.clearcoat>0))edge.needsUpdate=true;
      edge.map=null;edge.bumpMap=null;
      edge.color.set(GREENLAM_BY_ID.get(choice.laminateId).color);edge.name='Matching edge band';
      const materials=Array(6).fill(edge);
      materials[surface.face]=face;
      // Both sides of a moving door follow its finish, including while open.
      // Carcass interiors and drawer linings retain their original materials.
      materials[surface.face^1]=surface.group==='Main doors'||surface.group==='Loft doors'?face:state.base;
      mesh.material=materials;state.owned=[face,edge];state.signature=signature;
      mesh.userData.laminateChoice={...choice};
    }
  }
  root.userData.wardrobeFinishes=next;
  return structuredClone(next);
}
