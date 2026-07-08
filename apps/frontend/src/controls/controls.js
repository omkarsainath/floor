import * as THREE from 'three';

/**
 * Viewer controls: orbit/walk modes, reset view, toggle ceiling visibility.
 * Uses existing OrbitControls instance; "walk" is simulated by limiting polar angles and lowering camera height.
 */
export function setupViewerControls({
  camera,
  controls,
  ceilingMesh = null,
  initialCameraPosition = { x: 12, y: 16, z: 12 },
  initialTarget = { x: 0, y: 1, z: 0 },
}) {
  if (!camera || !controls) return;

  // Start with ceiling hidden for a dollhouse/isometric cutaway view.
  let ceilingVisible = false;
  if (ceilingMesh) ceilingMesh.visible = false;
  let walkMode = false;
  const walkSpeed = 0.2;

  // Person height drives walk-mode eye level for a "real feel" sense of scale.
  // Eye height is approximated as ~93% of standing height (typical human proportion).
  let personHeightM = 1.7;
  const eyeHeight = () => personHeightM * 0.93;

  const setPersonHeight = (heightM) => {
    if (!Number.isFinite(heightM) || heightM <= 0) return;
    personHeightM = heightM;
    if (walkMode) {
      camera.position.y = eyeHeight();
      controls.target.y = eyeHeight();
      controls.update();
    }
  };

  const setOrbitMode = () => {
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = Math.PI / 1.2;
    walkMode = false;
  };

  const setWalkMode = () => {
    // Simulated walk: lower camera to eye height, restrict polar to near-horizontal, disable panning.
    controls.enablePan = false;
    controls.enableRotate = true;
    controls.minPolarAngle = Math.PI / 2.6;
    controls.maxPolarAngle = Math.PI / 1.9;
    camera.position.y = eyeHeight();
    controls.target.y = eyeHeight();
    walkMode = true;
  };

  const resetView = () => {
    camera.position.set(initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z);
    controls.target.set(initialTarget.x, initialTarget.y, initialTarget.z);
    controls.update();
  };

  const toggleCeiling = () => {
    if (!ceilingMesh) return;
    ceilingVisible = !ceilingVisible;
    ceilingMesh.visible = ceilingVisible;
  };

  // Rotate view around current camera position without moving the camera (look around in place)
  const rotateView = ({ yaw = 0, pitch = 0 }) => {
    const offset = new THREE.Vector3().subVectors(controls.target, camera.position);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += yaw; // yaw around Y
    spherical.phi += pitch; // pitch
    // Clamp pitch to avoid flipping
    const eps = 0.001;
    spherical.phi = Math.min(Math.max(spherical.phi, eps), Math.PI - eps);
    offset.setFromSpherical(spherical);
    controls.target.copy(camera.position).add(offset);
    controls.update();
  };

  // Smooth look animation queue
  let animating = false;
  const pending = { yaw: 0, pitch: 0 };

  const enqueueLook = ({ yaw = 0, pitch = 0 }) => {
    pending.yaw += yaw;
    pending.pitch += pitch;
    if (!animating) runLookAnimation();
  };

  const runLookAnimation = () => {
    animating = true;
    const stepYaw = Math.sign(pending.yaw) * 0.02;
    const stepPitch = Math.sign(pending.pitch) * 0.015;

    const applyStep = () => {
      const yawStep = Math.abs(pending.yaw) < Math.abs(stepYaw) ? pending.yaw : stepYaw;
      const pitchStep = Math.abs(pending.pitch) < Math.abs(stepPitch) ? pending.pitch : stepPitch;

      if (yawStep === 0 && pitchStep === 0) {
        animating = false;
        pending.yaw = 0;
        pending.pitch = 0;
        return;
      }

      rotateView({ yaw: yawStep, pitch: pitchStep });
      pending.yaw -= yawStep;
      pending.pitch -= pitchStep;
      requestAnimationFrame(applyStep);
    };

    requestAnimationFrame(applyStep);
  };

  // Arrow-key walk movement (XZ plane), relative to camera facing
  const handleKeyDown = (e) => {
    const key = e.key.toLowerCase();
    const presetMap = {
      t: { yaw: 0, pitch: -0.25 }, // look up slightly
      b: { yaw: 0, pitch: 0.25 },  // look down slightly
      l: { yaw: 0.25, pitch: 0 },
      r: { yaw: -0.25, pitch: 0 },
    };
    if (presetMap[key]) {
      enqueueLook(presetMap[key]);
      return;
    }

    if (!walkMode) return;
    const isMove = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key);
    const isLook = ['a', 'd', 'q', 'e'].includes(key);
    if (!isMove && !isLook) return;

    // Yaw look (A/D or Q/E)
    if (isLook) {
      const yawStep = key === 'a' || key === 'q' ? 0.05 : -0.05;
      const offset = new THREE.Vector3().subVectors(controls.target, camera.position);
      const rotMat = new THREE.Matrix4().makeRotationY(yawStep);
      offset.applyMatrix4(rotMat);
      controls.target.copy(camera.position).add(offset);
      controls.update();
      return;
    }

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir); // forward
    dir.y = 0;
    dir.normalize();

    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

    const move = new THREE.Vector3();
    if (key === 'arrowup') move.add(dir);
    if (key === 'arrowdown') move.sub(dir);
    if (key === 'arrowleft') move.sub(right);
    if (key === 'arrowright') move.add(right);

    move.normalize().multiplyScalar(walkSpeed);

    camera.position.add(move);
    controls.target.add(move);
    controls.update();
  };

  // UI overlay
  const panel = document.createElement('div');
  panel.style.position = 'fixed';
  panel.style.top = '12px';
  panel.style.left = '12px';
  panel.style.display = 'flex';
  panel.style.gap = '8px';
  panel.style.padding = '8px 10px';
  panel.style.background = 'rgba(16,16,24,0.7)';
  panel.style.border = '1px solid rgba(255,255,255,0.08)';
  panel.style.borderRadius = '10px';
  panel.style.fontFamily = 'Inter, system-ui, sans-serif';
  panel.style.color = '#e5e7eb';
  panel.style.zIndex = '10';
  panel.style.backdropFilter = 'blur(6px)';

  const makeBtn = (label, onClick) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.padding = '6px 10px';
    btn.style.borderRadius = '8px';
    btn.style.border = '1px solid rgba(255,255,255,0.12)';
    btn.style.background = 'rgba(255,255,255,0.06)';
    btn.style.color = '#f8fafc';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '13px';
    btn.onmouseenter = () => (btn.style.background = 'rgba(255,255,255,0.12)');
    btn.onmouseleave = () => (btn.style.background = 'rgba(255,255,255,0.06)');
    btn.onclick = onClick;
    return btn;
  };

  const orbitBtn = makeBtn('Orbit', () => {
    setOrbitMode();
  });
  const walkBtn = makeBtn('Walk', () => {
    setWalkMode();
  });
  const resetBtn = makeBtn('Reset View', () => {
    resetView();
  });
  const ceilingBtn = makeBtn('Toggle Ceiling', () => {
    toggleCeiling();
  });

  const heightWrap = document.createElement('label');
  heightWrap.style.display = 'flex';
  heightWrap.style.alignItems = 'center';
  heightWrap.style.gap = '4px';
  heightWrap.style.fontSize = '12px';
  heightWrap.textContent = 'Height (cm)';
  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.min = '50';
  heightInput.max = '250';
  heightInput.value = '170';
  heightInput.style.width = '56px';
  heightInput.style.borderRadius = '6px';
  heightInput.style.border = '1px solid rgba(255,255,255,0.12)';
  heightInput.style.background = 'rgba(255,255,255,0.06)';
  heightInput.style.color = '#f8fafc';
  heightInput.style.padding = '4px';
  heightInput.addEventListener('change', () => {
    const cm = parseFloat(heightInput.value);
    if (Number.isFinite(cm) && cm > 0) setPersonHeight(cm / 100);
  });
  heightWrap.appendChild(heightInput);

  panel.append(orbitBtn, walkBtn, resetBtn, ceilingBtn, heightWrap);
  document.body.appendChild(panel);

  // Default mode
  setOrbitMode();
  resetView();

  window.addEventListener('keydown', handleKeyDown);

  return {
    setOrbitMode,
    setWalkMode,
    resetView,
    toggleCeiling,
    setPersonHeight,
    destroy: () => {
      if (panel.parentElement) panel.parentElement.removeChild(panel);
      window.removeEventListener('keydown', handleKeyDown);
    },
  };
}
