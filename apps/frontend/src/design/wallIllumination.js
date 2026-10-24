import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

// A concealed broad wall washer sits in front of the relief and faces it.
// Area emitters face local -Z. They approximate diffuse illumination, not shadows.
export function addWallIllumination(group, spans, bounds, side, frontDepth) {
  RectAreaLightUniformsLib.init();
  for (const span of spans) {
    const left = Math.max(span.lo, bounds.left), right = Math.min(span.hi, bounds.right);
    const bottom = Math.max(span.bottom, bounds.bottom), top = Math.min(span.top, bounds.top);
    if (right - left <= .001 || top - bottom <= .001) continue;
    const width = right - left, height = top - bottom;
    const light = new THREE.RectAreaLight(0xffdfad, .9, width * .9, height * .8);
    light.position.set((left + right) / 2, (bottom + top) / 2 + height * .08,
      side * (frontDepth + Math.max(.25, Math.min(.65, height * .2))));
    if (side < 0) light.rotation.y = Math.PI;
    light.userData = { isAuthoredLight: true, category: 'wallPanel', isWallWasher: true };
    group.add(light);
  }
}
