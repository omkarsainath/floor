import * as THREE from 'three';

// Resize vertically while keeping the physical bottom at its current elevation.
export function setObjectHeight(object, heightM) {
  if (!Number.isFinite(heightM) || heightM < .1 || heightM > 10) return false;
  object.updateMatrixWorld(true);
  const before = new THREE.Box3().setFromObject(object);
  const height = before.max.y-before.min.y;
  if (!Number.isFinite(height) || height < 1e-6) return false;
  object.scale.y *= heightM/height;
  object.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(object);
  object.position.y += before.min.y-after.min.y;
  object.updateMatrixWorld(true);
  return true;
}
