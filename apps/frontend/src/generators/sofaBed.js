import * as THREE from 'three';
import { sofaCushionGeometry } from './sofaSurface.js';

// An illustrative two-stage pull-out mechanism. The catalogue only depicts
// closed sofas, so this must not be presented as manufacturer engineering.
export function addSofaBedMechanism(root, width, depth, height, material) {
  const deckDepth=depth*.74, deckWidth=Math.max(.4,width-.28);
  const seatTop=Math.min(.46,height*.55), pad=.14;
  const metal=new THREE.MeshStandardMaterial({color:0x34383b,metalness:.7,roughness:.4});
  const stages=[];
  for(let i=0;i<2;i++){
    const stage=new THREE.Group();stage.name=`sofa-bed-extension-${i+1}`;
    const mattress=new THREE.Mesh(sofaCushionGeometry(deckWidth,pad,deckDepth,{seat:true,radius:.035}),material);
    mattress.position.y=seatTop-pad/2; mattress.castShadow=true;mattress.receiveShadow=true;stage.add(mattress);
    for(const x of [-deckWidth*.43,deckWidth*.43]){
      const rail=new THREE.Mesh(new THREE.BoxGeometry(.035,.04,deckDepth),metal);rail.position.set(x,seatTop-pad-.025,0);stage.add(rail);
      for(const z of [-deckDepth*.36,deckDepth*.36]){
        const leg=new THREE.Mesh(new THREE.BoxGeometry(.035,seatTop-pad-.04,.035),metal);
        leg.position.set(x,(seatTop-pad-.04)/2,z);leg.castShadow=true;stage.add(leg);
      }
    }
    root.add(stage);stages.push(stage);
  }
  root.userData.isSofaBed=true;root.userData.isInteractiveFurniture=true;
  Object.assign(root.userData,{_animType:'sofaBed',_animProp:'bed',_closedState:0,_openState:1,_animOpen:false,furniturePart:'bed',bedProgress:0});
  root.userData.setBedProgress=value=>{
    const progress=Math.max(0,Math.min(1,Number(value)||0));root.userData.bedProgress=progress;
    stages.forEach((stage,i)=>{
      stage.visible=progress>.001;
      stage.position.z=depth*.065+deckDepth*(i+1)*progress;
      stage.position.y=0;
    });
  };
  root.userData.setBedProgress(0);
}
export function restoreSofaBed(root, expanded) {
  if(!root?.userData.isSofaBed)return;
  root.userData._animOpen=expanded===true;
  root.userData.setBedProgress(expanded===true?1:0);
}
