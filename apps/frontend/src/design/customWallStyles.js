const styles = new Map();
const imageData = value => typeof value === 'string' && value.length < 3_000_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value);
export function registerCustomWallStyle(value) {
  if (!value || !/^custom-wall-[a-zA-Z0-9-]{1,70}$/.test(value.id) || !imageData(value.image) || !imageData(value.depth)
    || !Number.isFinite(value.aspect) || value.aspect < .1 || value.aspect > 10) return null;
  const style = { id:value.id, label:String(value.label || 'Uploaded wall relief').slice(0,80),
    image:value.image, depth:value.depth, aspect:value.aspect,
    reliefM:Math.max(.01,Math.min(.25,Number(value.reliefM)||.10)),
    preserveAppearance:value.preserveAppearance !== false,
    roomType:'all',category:'wallPanel',pattern:'referenceMural',material:'Uploaded image · estimated raised relief · photographed lighting',
    color:'#e7dfcd',accentColor:'#d1bea0',depthM:.012,roughness:.88 };
  styles.set(style.id,style);return style;
}
export const customWallStyles = () => [...styles.values()];
export const getCustomWallStyle = id => styles.get(id);
export function customMuralAssets(style) {
  return {lit:style.image,unlit:style.image,depth:style.depth,aspect:style.aspect,reliefM:style.reliefM,preserveAppearance:style.preserveAppearance};
}
