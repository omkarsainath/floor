import * as THREE from 'three';

// This is a configurable estimate, not a measurement of the user's eye level.
const ESTIMATED_EYE_RATIO = 0.93;
const MAX_PITCH = Math.PI / 2 - 0.01;
const validPersonHeight = value => Number.isFinite(value) && value >= 0.5 && value <= 2.5;
const validEyeHeight = (value, bodyHeight) => Number.isFinite(value) && value > 0.1 && value < bodyHeight;

/**
 * First-person camera in metres. Looking changes orientation, never position.
 * The helper starts detached so creating it cannot disturb the orbit view.
 * Call attach() when entering Walk and detach() before returning to Orbit.
 * Positive yaw looks left; positive pitch looks up. Neither FOV nor model scale
 * is changed. A measured eye height takes precedence over the estimate.
 */
export function createWalkCamera(camera, { personHeightM = 1.75, eyeHeightM = null, floorY = 0 } = {}) {
  if (!camera?.isCamera) throw new TypeError('A Three.js camera is required.');
  if (!validPersonHeight(personHeightM)) throw new RangeError('Person height must be between 0.5 and 2.5 metres.');
  if (eyeHeightM !== null && !validEyeHeight(eyeHeightM, personHeightM)) {
    throw new RangeError('Eye height must be above 0.1 metres and below person height.');
  }
  if (!Number.isFinite(floorY)) throw new RangeError('Floor elevation must be finite.');

  let active = false;
  let measuredEyeHeightM = eyeHeightM;
  let yaw = 0;
  let pitch = 0;
  const worldPosition = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const parentOrientation = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const eyeHeight = () => measuredEyeHeightM ?? personHeightM * ESTIMATED_EYE_RATIO;

  function readDirection() {
    camera.getWorldDirection(direction);
    // Near vertical, a direction alone has no meaningful horizontal heading.
    if (Math.hypot(direction.x, direction.z) > 1e-8) {
      yaw = Math.atan2(-direction.x, -direction.z);
    }
    pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)), -MAX_PITCH, MAX_PITCH);
  }

  function setWorldPosition(x, z) {
    worldPosition.set(x, floorY + eyeHeight(), z);
    if (camera.parent) camera.parent.worldToLocal(worldPosition);
    camera.position.copy(worldPosition);
    camera.updateMatrixWorld(true);
  }

  function alignHeight() {
    camera.getWorldPosition(worldPosition);
    setWorldPosition(worldPosition.x, worldPosition.z);
  }

  function applyLook() {
    orientation.setFromEuler(euler.set(pitch, yaw, 0, 'YXZ'));
    if (camera.parent) {
      camera.parent.getWorldQuaternion(parentOrientation);
      orientation.premultiply(parentOrientation.invert());
    }
    camera.quaternion.copy(orientation);
    camera.updateMatrixWorld(true);
  }

  readDirection();

  const getState = () => {
    camera.getWorldPosition(worldPosition);
    return {
      active, personHeightM, eyeHeightM: eyeHeight(),
      eyeHeightSource: measuredEyeHeightM === null ? 'estimated' : 'measured',
      floorY, yaw, pitch,
      position: { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z },
    };
  };

  const setPersonHeight = value => {
    if (!validPersonHeight(value)) return false;
    personHeightM = value;
    if (measuredEyeHeightM !== null && !validEyeHeight(measuredEyeHeightM, personHeightM)) {
      measuredEyeHeightM = null;
    }
    if (active) alignHeight();
    return true;
  };

  const setEyeHeight = value => {
    if (value !== null && !validEyeHeight(value, personHeightM)) return false;
    measuredEyeHeightM = value;
    if (active) alignHeight();
    return true;
  };

  const look = (yawDelta = 0, pitchDelta = 0) => {
    if (!active || !Number.isFinite(yawDelta) || !Number.isFinite(pitchDelta)) return false;
    // Keep repeated full turns bounded without changing the direction of view.
    yaw = Math.atan2(Math.sin(yaw + yawDelta), Math.cos(yaw + yawDelta));
    pitch = THREE.MathUtils.clamp(pitch + pitchDelta, -MAX_PITCH, MAX_PITCH);
    applyLook();
    return true;
  };

  const setPosition = position => {
    if (!active || !Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return false;
    setWorldPosition(position.x, position.z);
    return true;
  };

  return {
    getState, setPersonHeight, setEyeHeight, look, setPosition, moveTo: setPosition,
    attach() {
      readDirection();
      active = true;
      alignHeight();
      applyLook();
      return true;
    },
    detach() { active = false; return true; },
    resetLook() {
      if (!active) return false;
      pitch = 0;
      applyLook();
      return true;
    },
    syncTarget(target, distance = 1) {
      if (!target?.isVector3 || !Number.isFinite(distance) || distance <= 0) return false;
      camera.getWorldPosition(worldPosition);
      camera.getWorldDirection(direction);
      target.copy(worldPosition).addScaledVector(direction, distance);
      return true;
    },
  };
}
