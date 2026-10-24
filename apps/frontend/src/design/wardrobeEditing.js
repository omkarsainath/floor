import { createObject } from '../generators/object.js';
import { normalizeWardrobeConfig, wardrobeWallPlacement } from '../generators/wardrobeConfig.js';

// Build and validate before touching the live object or saved record. Keep the
// outer group so selection, collision checks and catalogue references stay live.
export function applyWardrobeStructure(root,record,input,{walls=[],elevation=root.position.y,animations=[]}={}) {
  const config=normalizeWardrobeConfig(input);
  if(!Number.isFinite(elevation)||elevation<0||elevation>10)throw new Error('Base height must be between 0 and 1000 cm.');
  const position=wardrobeWallPlacement(config,root.position,walls);
  const finishes={},poses=new Map(),oldNodes=new Set();
  root.traverse(n=>{
    oldNodes.add(n);
    if(n.userData.wardrobeSurface)finishes[n.userData.wardrobeSurface.id]={...n.userData.laminateChoice};
    if(n.userData._animType){
      const id=n.children.find(c=>c.userData.wardrobeSurface)?.userData.wardrobeSurface.id;
      if(id)poses.set(id,n.userData._animOpen);
    }
  });
  const next={...record,source:'catalog',rotationY:position.rotation??root.rotation.y,elevation,
    bbox:{x1:position.x-config.width/2,x2:position.x+config.width/2,y1:position.z-config.depth/2,y2:position.z+config.depth/2},
    wardrobeConfig:config,wardrobeFinishes:{...finishes,...record.wardrobeFinishes,...root.userData.wardrobeFinishes}};
  delete next.objectHeightM;
  const replacement=createObject(next);
  if(!replacement?.userData.isWardrobe)throw new Error('Unable to build this wardrobe.');
  replacement.traverse(n=>{
    if(!n.userData._animType)return;
    const id=n.children.find(c=>c.userData.wardrobeSurface)?.userData.wardrobeSurface.id;
    if(!poses.get(id))return;
    n.userData._animOpen=true;
    const prop=n.userData._animProp,value=n.userData._individualOpenState??n.userData._openState;
    if(prop==='ry')n.rotation.y=value;else if(prop==='pz')n.position.z=value;else if(prop==='px')n.position.x=value;
  });
  const geometries=new Set(),materials=new Set();
  root.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])if(m)materials.add(m);});
  for(let i=animations.length-1;i>=0;i--)if(oldNodes.has(animations[i].node))animations.splice(i,1);
  root.clear();root.add(...replacement.children.slice());
  root.position.copy(replacement.position);root.rotation.copy(replacement.rotation);root.scale.copy(replacement.scale);
  Object.assign(root.userData,replacement.userData);
  root.updateMatrixWorld(true);
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  delete record.objectHeightM;Object.assign(record,next);
  return root;
}
