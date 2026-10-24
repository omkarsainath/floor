import * as THREE from 'three';

const cache = new Map(), queue = [];
let renderer, busy = false;
function dispose(root) {
  root.traverse(node => {
    node.geometry?.dispose();
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) material?.dispose();
  });
}
async function drain() {
  if (busy) return; busy = true;
  while (queue.length) {
    const {img,key,build,front,ceiling} = queue.shift();
    if (!img.isConnected) continue;
    let object;
    try {
      if (!cache.has(key)) {
        renderer ||= new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
        renderer.setSize(240,180,false); renderer.setPixelRatio(1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        const scene = new THREE.Scene();scene.background = new THREE.Color('#eeeae3');
        scene.add(new THREE.HemisphereLight(0xffffff,0x8d8073,2));
        const light = new THREE.DirectionalLight(0xffffff,2.5);light.position.set(3,6,5);scene.add(light);
        object = build(); if (!object) throw new Error('Model unavailable');scene.add(object);
        // Uploaded relief depth and source textures may load asynchronously.
        const pending=[];object.traverse(node=>{if(node.geometry?.userData.depthReady)pending.push(node.geometry.userData.depthReady);});
        await Promise.all(pending);
        object.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
        const radius=Math.max(size.length()/2,.1),distance=radius/Math.sin(THREE.MathUtils.degToRad(18))*1.1;
        const camera=new THREE.PerspectiveCamera(36,4/3,.01,distance*10+100);
        const direction = ceiling ? new THREE.Vector3(.3,-1,.4) : front ? new THREE.Vector3(0,.05,1) : new THREE.Vector3(1,.65,1.5);
        camera.position.copy(center).addScaledVector(direction.normalize(),distance);camera.lookAt(center);
        renderer.render(scene,camera);cache.set(key,renderer.domElement.toDataURL('image/webp',.85));
        dispose(object);object=null;
      }
      if(img.isConnected) img.src=cache.get(key);
    } catch(error) {
      if(object)dispose(object);
      img.alt = `${img.alt} (preview unavailable)`;
      console.warn('Catalogue preview:',key,error.message);
    }
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  busy=false;
}
const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries=>{
  for(const entry of entries) if(entry.isIntersecting){
    observer.unobserve(entry.target);
    const job=jobs.get(entry.target);if(job){jobs.delete(entry.target);queue.push(job);drain();}
  }
},{rootMargin:'80px'});
const jobs = new WeakMap();
export function attachModelThumbnail(img,key,build,{front=false,ceiling=false}={}) {
  if(cache.has(key)){img.src=cache.get(key);return;}
  const job={img,key,build,front,ceiling};
  if(observer){jobs.set(img,job);observer.observe(img);}
  else {queue.push(job);setTimeout(drain,0);}
}
