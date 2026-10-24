import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { FurnitureContactPass, FurnitureAntialiasPass } from './furnitureContactPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

let modelGlow = null;
const modelGlowSize = new THREE.Vector2();
const ceilingBloom = () => new UnrealBloomPass(new THREE.Vector2(256,256), .22, .3, 1.6);

export function renderModelWithCeilingGlow(scene, renderer, camera) {
  let active = false, furniture = false;
  scene.traverseVisible(object => {
    if(object.userData.sofaDesign) furniture = true;
    if (object.isLight && object.intensity > 0 && (object.userData.isCeilingIllumination || object.userData.ceilingLightId)) active = true;
  });
  if (!active && !furniture) { renderer.render(scene, camera); return; }
  if (!modelGlow) {
    modelGlow = new EffectComposer(renderer);
    modelGlow.setPixelRatio(Math.min(renderer.getPixelRatio(), 1.5));
    modelGlow.addPass(new RenderPass(scene, camera));
    modelGlow.addPass(new FurnitureContactPass(scene,camera,256,256));
    modelGlow.addPass(ceilingBloom());
    modelGlow.addPass(new OutputPass());
    modelGlow.addPass(new FurnitureAntialiasPass());
  }
  const size = renderer.getSize(new THREE.Vector2());
  if (!modelGlowSize.equals(size)) { modelGlow.setSize(size.x,size.y); modelGlowSize.copy(size); }
  const [beauty,contact,bloom]=modelGlow.passes;
  beauty.scene=contact.scene=scene;beauty.camera=contact.camera=camera;
  beauty.enabled=true;contact.enabled=furniture;bloom.enabled=active;
  modelGlow.render();
}

let composer = null;
let saved = null;
let environmentTarget = null;
let lights = [];

export function getComposer() { return composer; }
export function onRenderResize(width, height) { composer?.setSize(width, height); }

// Render supplies a different sun/sky rig, but room fixtures belong to the
// project. Exclude them from both the temporary hide and the restore snapshot:
// users can add, replace, dim or switch them off while Render is active.
export function suspendDefaultLights(scene) {
  const snapshot = [];
  scene.traverse(light => {
    if (!light.isLight || light.userData.isAuthoredLight === true) return;
    snapshot.push({ light, visible: light.visible });
    light.visible = false;
  });
  return () => {
    for (const { light, visible } of snapshot) {
      if (light.userData.isAuthoredLight !== true) light.visible = visible;
    }
    snapshot.length = 0;
  };
}

export function getPlanBounds(scene) {
  const bounds = new THREE.Box3();
  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    if (obj.isMesh && ['floor', 'wall'].includes(obj.userData.type)) bounds.expandByObject(obj);
  });
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
  return bounds;
}

// Keep IBL as a soft fill rather than the dominant light. This preserves
// surface colours while allowing directional light and contact shadows to read.
export function softenRenderEnvironment(scene) {
  const original=new Map();
  scene.traverse(object=>{
    for(const material of (Array.isArray(object.material)?object.material:[object.material])){
      if(!material?.isMeshStandardMaterial||original.has(material))continue;
      original.set(material,material.envMapIntensity);
      material.envMapIntensity*=.38;
    }
  });
  return ()=>{for(const [material,intensity] of original)material.envMapIntensity=intensity;original.clear();};
}

export function enterRenderMode(scene, renderer, camera) {
  if (saved) return;
  saved = {
    background: scene.background, fog: scene.fog, environment: scene.environment,
    exposure: renderer.toneMappingExposure, toneMapping: renderer.toneMapping,
    shadowEnabled: renderer.shadowMap.enabled, restoreLights: null, restoreMaterials: null,
  };
  try {
    saved.restoreLights = suspendDefaultLights(scene);
    saved.restoreMaterials = softenRenderEnvironment(scene);
    scene.background = new THREE.Color(0xe7e3dc);
    scene.fog = null;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.shadowMap.enabled = true;

    // Local image-based lighting. Keep the render target, not just its texture,
    // so all framebuffer resources can be released when leaving render mode.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment(renderer);
    try {
      environmentTarget = pmrem.fromScene(room, 0.04);
      scene.environment = environmentTarget.texture;
    } finally {
      room.dispose();
      pmrem.dispose();
    }

    const bounds = getPlanBounds(scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z, 5);
    const sun = new THREE.DirectionalLight(0xfff0db, 1.65);
    sun.position.set(center.x - radius * 0.6, bounds.max.y + radius, center.z + radius * 0.5);
    sun.target.position.set(center.x, 0, center.z);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -radius, right: radius, top: radius, bottom: -radius,
      near: 0.1, far: radius * 4 + size.y,
    });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.003;
    sun.shadow.radius = 3;
    const sky = new THREE.HemisphereLight(0xe7f0ff, 0x9a8065, 0.22);
    lights = [sun, sun.target, sky];
    scene.add(...lights);

    // Preserve actual floors, ceilings and each authored material. Contact
    // shading separates cushions and furniture from the ground without mirrors
    // or a grid of glowing fixtures unrelated to the floor plan.
    const sizePx = renderer.getSize(new THREE.Vector2());
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 2));
    composer.setSize(sizePx.x, sizePx.y);
    composer.addPass(new RenderPass(scene,camera));
    const ao = new FurnitureContactPass(scene, camera, sizePx.x, sizePx.y);
    // Keep contact shading local: a broad kernel creates halos on nearby walls.
    ao.kernelRadius=.08;
    ao.contactDistance=.12;
    ao.contactStrength=.5;
    composer.addPass(ao);
    // No full-frame bloom in Render mode: bright trim must remain crisp.
    composer.addPass(new OutputPass());
    composer.addPass(new FurnitureAntialiasPass());
  } catch (error) {
    exitRenderMode(scene, renderer);
    throw error;
  }
}

export function exitRenderMode(scene, renderer) {
  if (!saved) return;
  scene.background = saved.background;
  scene.fog = saved.fog;
  scene.environment = saved.environment;
  renderer.toneMappingExposure = saved.exposure;
  renderer.toneMapping = saved.toneMapping;
  renderer.shadowMap.enabled = saved.shadowEnabled;
  saved.restoreLights?.();
  saved.restoreMaterials?.();
  lights.forEach((light) => {
    scene.remove(light);
    light.shadow?.dispose();
  });
  lights = [];
  if (composer) {
    for (const pass of composer.passes) {
      pass.dispose?.();
      // Three r160 SSAOPass.dispose omits these two owned resources.
      if (pass instanceof SSAOPass) {
        pass.noiseTexture?.dispose();
        pass.ssaoMaterial?.dispose();
      }
    }
    composer.dispose();
    composer = null;
  }
  environmentTarget?.dispose();
  environmentTarget = null;
  saved = null;
}
