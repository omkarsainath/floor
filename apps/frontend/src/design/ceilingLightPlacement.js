import * as THREE from 'three';
import { ceilingLightFootprint, ceilingLightDepth } from './ceilingLights.js';

// Pick only a visible fixture in front of the other visible scene geometry.
// Raycaster itself does not exclude invisible meshes or invisible ancestors.
export function pickCeilingLight(raycaster, roots) {
  const meshes = [];
  for (const root of roots) root.traverseVisible(node => {
    if (node.isMesh) meshes.push(node);
  });
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if (!hit) return null;
  for (let node = hit.object; node; node = node.parent) {
    if (node.userData.isCeilingLight && node.userData.ceilingLightId != null && node.userData.roomId != null) {
      return { roomId: node.userData.roomId, lightId: node.userData.ceilingLightId };
    }
  }
  return null;
}

export function ceilingSurfaceMeshes(group) {
  const meshes = [];
  group?.traverse(node => {
    if (!node.isMesh || node.userData.type !== 'ceiling') return;
    for (let parent = node; parent; parent = parent.parent) if (parent.userData.isCeilingLight) return;
    meshes.push(node);
  });
  return meshes;
}

export function fitsRoomFootprint(room, x, z, radius = 0) {
  const points = room?.points || room?.polygon;
  if (!Array.isArray(points) || points.length < 3 || ![x, z, radius].every(Number.isFinite)) return false;
  let inside = false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b.x - a.x, dz = b.y - a.y, length2 = dx * dx + dz * dz;
    if (length2 < 1e-12) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.y) * dz) / length2));
    if (Math.hypot(x - a.x - dx * t, z - a.y - dz * t) < radius + 0.005) return false;
    if ((a.y > z) !== (b.y > z) && x < a.x + (z - a.y) * dx / dz) inside = !inside;
  }
  return inside;
}

/** Find the actual first ceiling underside above a point, even in cutaway view. */
export function ceilingAttachment(room, finishGroup, point) {
  if (!fitsRoomFootprint(room, point.x, point.z)) return null;
  finishGroup?.updateWorldMatrix(true, true);
  const meshes = ceilingSurfaceMeshes(finishGroup);
  if (!meshes.length) return { ceilingY: (room.height || 3) - 0.025, normal: new THREE.Vector3(0, -1, 0) };
  const ray = new THREE.Raycaster(new THREE.Vector3(point.x, 0.001, point.z), new THREE.Vector3(0, 1, 0));
  const hit = ray.intersectObjects(meshes, false)[0];
  if (!hit) return null;
  const normal = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
  if (normal.y > 0) normal.negate();
  return { ceilingY: hit.point.y, normal };
}

export function validateCeilingLight(room, group, placement, otherLights = []) {
  const radius = ceilingLightFootprint(placement);
  if (!fitsRoomFootprint(room, placement.x, placement.z, radius)) return { ok: false, message: 'Keep the whole light inside this room, away from the wall edges.' };
  const attachment = ceilingAttachment(room, group, placement);
  if (!attachment) return { ok: false, message: 'There is no ceiling surface at this point.' };
  if (attachment.ceilingY - ceilingLightDepth(placement) <= 0.1) return { ok: false, message: 'The light would reach the floor. Reduce its hanging length or choose a higher part of the ceiling.' };
  if (otherLights.some(other => other.id !== placement.id
    && Math.hypot(other.x - placement.x, other.z - placement.z) < radius + ceilingLightFootprint(other) + 0.02)) {
    return { ok: false, message: 'This position overlaps another ceiling light. Choose a separate position.' };
  }
  return { ok: true, ...attachment };
}

export function orientCeilingLight(group, placement, attachment) {
  // Pendants hang with gravity; surface-mounted fixtures follow the local slope.
  if (!['pendant', 'chandelier'].includes(placement.type)) {
    const mount = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), attachment.normal);
    group.quaternion.premultiply(mount);
    group.traverse(node => { if (node.isSpotLight) node.shadow.camera.up.applyQuaternion(mount); });
  }
  return group;
}
