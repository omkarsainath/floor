const property = {bed:['userData','bedProgress'],px:['position','x'],pz:['position','z'],ry:['rotation','y'],rx:['rotation','x']};

export function queueObjectAnimations(root, queue, part = null) {
  const nodes=[];
  root.traverse(node => {
    if (node.userData._animType && property[node.userData._animProp]
      && (!part || node.userData.wardrobePart===part || node.userData.furniturePart===part)) nodes.push(node);
  });
  if (!nodes.length) return false;
  // A mixed selection opens the remaining fronts; the next press closes all.
  const close=nodes.every(node=>node.userData._animOpen);
  for(const node of nodes) {
    const data=node.userData, prop=data._animProp, [object,key]=property[prop];
    data._animOpen=!close;
    const index=queue.findIndex(a=>a.node===node);
    if(index!==-1) queue.splice(index,1);
    const openState=nodes.length===1 ? (data._individualOpenState ?? data._openState) : data._openState;
    queue.push({node,prop,from:node[object][key],to:close?data._closedState:openState,t:0});
  }
  return true;
}

export function advanceObjectAnimations(queue, step=.055) {
  for(let i=queue.length-1;i>=0;i--) {
    const a=queue[i]; a.t=Math.min(a.t+step,1);
    const [object,key]=property[a.prop];
    a.node[object][key]=a.from+(a.to-a.from)*(1-Math.pow(1-a.t,3));
    if(a.prop==='bed') a.node.userData.setBedProgress(a.node.userData.bedProgress);
    if(a.t>=1) queue.splice(i,1);
  }
}
