import * as THREE from 'three';

// Dimensions are metres. These locally generated fixtures need no downloads.
export const CEILING_LIGHT_TYPES = Object.freeze([
  Object.freeze({ id: 'downlight', label: 'Recessed downlight' }),
  Object.freeze({ id: 'surface-spot', label: 'Surface spotlight' }),
  Object.freeze({ id: 'pendant', label: 'Pendant light' }),
  Object.freeze({ id: 'chandelier', label: 'Chandelier' }),
  Object.freeze({ id: 'linear-led', label: 'Linear LED' }),
]);

const typeIds = new Set(CEILING_LIGHT_TYPES.map(type => type.id));
const hanging = type => type === 'pendant' || type === 'chandelier';
const bounded = (value, low, high, fallback) => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(low, Math.min(high, value)) : fallback;
const finiteCoordinate = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10000;
const normalizeRotation = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const turn = Math.PI * 2;
  return ((value % turn) + 3 * Math.PI) % turn - Math.PI;
};

export function normalizeCeilingLights(value) {
  if (!Array.isArray(value)) return [];
  const result = [], used = new Set();
  for (const source of value) {
    if (!source || typeof source !== 'object' || Array.isArray(source)
      || !typeIds.has(source.type) || !finiteCoordinate(source.x) || !finiteCoordinate(source.z)) continue;
    const requestedId = typeof source.id === 'string' && source.id.trim() ? source.id.trim().slice(0, 96) : `light-${result.length + 1}`;
    let id = requestedId, suffix = 2;
    while (used.has(id)) id = `${requestedId.slice(0, 85)}-${suffix++}`;
    used.add(id);
    result.push({
      id, type: source.type, x: source.x, z: source.z,
      lumens: bounded(source.lumens, 50, 5000, 600),
      temperatureK: bounded(source.temperatureK, 2200, 6500, 2700),
      dropM: hanging(source.type) ? bounded(source.dropM, 0.1, 1.5, 0.45) : 0,
      rotation: normalizeRotation(source.rotation), enabled: source.enabled !== false,
    });
    if (result.length === 16) break;
  }
  return result;
}

// Surface fixtures use a mount-centered sphere projected as a circle, so even
// a fixture tilted onto a vault fits. Hanging fixtures remain vertical. The
// placement controller checks this conservative circle against the room walls.
export function ceilingLightFootprint(placement) {
  switch (placement?.type) {
    case 'downlight': return Math.hypot(0.09, 0.027);
    case 'surface-spot': return Math.hypot(0.08, 0.17);
    case 'pendant': return 0.23;
    case 'chandelier': return 0.41;
    case 'linear-led': return Math.hypot(0.6, 0.04, 0.065);
    default: return 0;
  }
}

export function ceilingLightDepth(placement) {
  if (hanging(placement?.type)) return bounded(placement.dropM, 0.1, 1.5, 0.45);
  if (placement?.type === 'downlight') return 0.027;
  if (placement?.type === 'surface-spot') return 0.17;
  if (placement?.type === 'linear-led') return 0.065;
  return 0;
}

// Compact black-body colour approximation for the range offered in the UI.
function temperatureColor(kelvin) {
  const t = kelvin / 100, byte = value => Math.max(0, Math.min(255, value)) / 255;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return new THREE.Color().setRGB(byte(r), byte(g), byte(b), THREE.SRGBColorSpace);
}

export function buildCeilingLight({ placement, ceilingY, roomId }) {
  const light = normalizeCeilingLights([placement])[0];
  if (!light || typeof ceilingY !== 'number' || !Number.isFinite(ceilingY)) throw new Error('A ceiling light needs a valid placement and ceiling height.');
  const depth = ceilingLightDepth(light), color = temperatureColor(light.temperatureK);
  const group = new THREE.Group();
  group.name = `ceiling-light:${light.id}`;
  group.position.set(light.x, ceilingY, light.z);
  group.rotation.y = light.rotation;
  group.userData = { type: 'ceilingLight', isCeilingLight: true, ceilingLightId: light.id, roomId, lightType: light.type, ceilingY, depthM: depth, placement: { ...light } };
  const white = new THREE.MeshStandardMaterial({ color: '#eceae5', roughness: 0.48, metalness: 0.16 });
  const dark = new THREE.MeshStandardMaterial({ color: '#25292d', roughness: 0.45, metalness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({ color: '#ad8850', roughness: 0.32, metalness: 0.72 });
  const diffuser = new THREE.MeshStandardMaterial({ color: '#fff5dc', emissive: color, emissiveIntensity: light.enabled ? 2.4 : 0, roughness: 0.4 });
  const materials = [white, dark, brass, diffuser];
  const usedMaterials = new Set();
  const mesh = (geometry, material, x, y, z) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = material !== diffuser;
    object.receiveShadow = true;
    object.userData = { type: 'ceiling', isCeilingLight: true, ceilingLightId: light.id, roomId };
    group.add(object); usedMaterials.add(material);
    return object;
  };
  const cylinder = (radiusTop, radiusBottom, height, material, y, x = 0, z = 0) => mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 32), material, x, y, z);
  const box = (width, height, length, material, x, y, z) => mesh(new THREE.BoxGeometry(width, height, length), material, x, y, z);
  const sphere = (radius, material, x, y, z) => mesh(new THREE.SphereGeometry(radius, 16, 10), material, x, y, z);
  const rod = (a, b, radius, material) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const middle = start.clone().add(end).multiplyScalar(0.5);
    const object = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 12), material, middle.x, middle.y, middle.z);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return object;
  };

  switch (light.type) {
    case 'downlight':
      cylinder(0.09, 0.09, 0.021, white, -0.0105);
      cylinder(0.071, 0.071, 0.008, dark, -0.021);
      cylinder(0.061, 0.061, 0.004, diffuser, -0.025);
      break;
    case 'surface-spot':
      cylinder(0.08, 0.08, 0.02, white, -0.01);
      cylinder(0.063, 0.063, 0.14, dark, -0.085);
      cylinder(0.052, 0.052, 0.01, diffuser, -0.165);
      break;
    case 'pendant': {
      const shadeHeight = Math.min(0.23, depth * 0.65), cableBottom = depth - shadeHeight;
      cylinder(0.067, 0.067, 0.022, dark, -0.011);
      cylinder(0.004, 0.004, cableBottom - 0.022, dark, -(cableBottom + 0.022) / 2);
      cylinder(0.052, 0.23, shadeHeight - 0.006, brass, -cableBottom - (shadeHeight - 0.006) / 2);
      cylinder(0.218, 0.218, 0.006, diffuser, -depth + 0.003);
      break;
    }
    case 'chandelier': {
      const bulbRadius = Math.min(0.046, depth * 0.18), armY = -depth + bulbRadius * 2.7;
      cylinder(0.072, 0.072, 0.022, brass, -0.011);
      rod([0, -0.022, 0], [0, armY, 0], 0.012, brass);
      sphere(0.04, brass, 0, armY, 0);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3, x = Math.cos(angle) * 0.35, z = Math.sin(angle) * 0.35;
        rod([0, armY, 0], [x, armY, z], 0.013, brass);
        cylinder(0.025, 0.025, bulbRadius * 1.2, brass, armY - bulbRadius * 0.6, x, z);
        sphere(bulbRadius, diffuser, x, -depth + bulbRadius, z);
      }
      break;
    }
    case 'linear-led':
      box(1.2, 0.025, 0.08, dark, 0, -0.0125, 0);
      box(1.18, 0.034, 0.066, white, 0, -0.042, 0);
      box(1.17, 0.006, 0.055, diffuser, 0, -0.062, 0);
      break;
  }
  // Only downward fixtures are directional. Pendant/chandelier/linear styles
  // approximate a diffuse luminaire with one point emitter to bound GPU cost.
  const directional = light.type === 'downlight' || light.type === 'surface-spot';
  const angle = light.type === 'surface-spot' ? Math.PI / 6 : Math.PI / 3;
  const solidAngle = directional ? 2 * Math.PI * (1 - Math.cos(angle)) : 4 * Math.PI;
  const intensity = light.enabled ? light.lumens / solidAngle : 0;
  const emitter = directional
    ? new THREE.SpotLight(color, intensity, 10, angle, 0.5, 2)
    : new THREE.PointLight(color, intensity, 10, 2);
  emitter.position.y = -depth - 0.012;
  emitter.castShadow = false;
  emitter.userData = { isAuthoredLight: true, ceilingLightId: light.id, roomId, lumens: light.lumens, temperatureK: light.temperatureK };
  group.add(emitter);
  if (directional) {
    const target = new THREE.Object3D();
    target.position.y = emitter.position.y - 1;
    group.add(target); emitter.target = target;
  }
  // No materials are shared between fixtures, and unused alternatives need not
  // remain allocated until the fixture is removed.
  for (const material of materials) if (!usedMaterials.has(material)) material.dispose();
  return group;
}

export function disposeCeilingLight(group) {
  if (!group) return;
  const geometries = new Set(), materials = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materials.add(material);
    if (object.isLight) object.dispose?.();
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  group.removeFromParent(); group.clear();
}
