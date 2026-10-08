import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

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

export function enterRenderMode(scene, renderer, camera) {
  if (saved) return;
  saved = {
    background: scene.background, fog: scene.fog, environment: scene.environment,
    exposure: renderer.toneMappingExposure, toneMapping: renderer.toneMapping,
    shadowEnabled: renderer.shadowMap.enabled, restoreLights: null,
  };
  try {
    saved.restoreLights = suspendDefaultLights(scene);
    scene.background = new THREE.Color(0xe7e3dc);
    scene.fog = null;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
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
    const sun = new THREE.DirectionalLight(0xfff0db, 2.3);
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
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 3;
    const sky = new THREE.HemisphereLight(0xe7f0ff, 0x9a8065, 0.45);
    lights = [sun, sun.target, sky];
    scene.add(...lights);

    // Preserve actual floors, ceilings and each authored material. Contact
    // shading separates cushions and furniture from the ground without mirrors
    // or a grid of glowing fixtures unrelated to the floor plan.
    const sizePx = renderer.getSize(new THREE.Vector2());
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1.5));
    composer.setSize(sizePx.x, sizePx.y);
    composer.addPass(new RenderPass(scene, camera));
    const ao = new SSAOPass(scene, camera, sizePx.x, sizePx.y, 16);
    ao.kernelRadius = 0.35;
    ao.minDistance = 0.001;
    ao.maxDistance = 0.06;
    composer.addPass(ao);
    composer.addPass(new OutputPass());
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
