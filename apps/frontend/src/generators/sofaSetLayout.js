// A set has no catalogue overall footprint. Arrange its individually measured
// pieces with explicit display spacing; never scale the set to a guessed box.
export function sofaSetLayout(product) {
  const rows=product.dimensionRows||[], gap=.24;
  const parts=rows.map((r,i)=>({width:r[0]*.0254,depth:r[1]*.0254,height:r[2]*.0254,
    x:0,z:0,yaw:0,index:i}));
  if(!parts.length)return {parts,width:product.w,depth:product.d};
  if(product.referenceAudit?.extraDiwanInches)parts.push({width:1.27,depth:.5842,height:.5842,index:parts.length,diwan:true,x:0,z:0,yaw:0});
  const main=parts[0];
  parts.slice(1).forEach((p,j)=>{
    const side=j%2?-1:1;
    p.yaw=-side*Math.PI/2;
    p.x=side*(main.width/2+gap+p.depth/2);
    p.z=main.depth/2+gap+p.width/2+(j>=2?parts[1].width+gap:0);
  });
  const xs=parts.flatMap(p=>[p.x-(p.yaw?p.depth:p.width)/2,p.x+(p.yaw?p.depth:p.width)/2]);
  const zs=parts.flatMap(p=>[p.z-(p.yaw?p.width:p.depth)/2,p.z+(p.yaw?p.width:p.depth)/2]);
  return {parts,width:Math.max(...xs)-Math.min(...xs),depth:Math.max(...zs)-Math.min(...zs)};
}
