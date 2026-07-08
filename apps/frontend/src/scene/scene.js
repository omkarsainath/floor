import * as THREE from 'three';

export function createBasicScene(domElement, OrbitControls) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f6f8);
  // Subtle horizon/ground fog for depth
  scene.fog = new THREE.Fog(0xf4f6f8, 35, 75);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  // Higher isometric-like top-down angle for a dollhouse view
  camera.position.set(14, 18, 14);

  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 1, 0);
  controls.maxPolarAngle = Math.PI / 2.05;

  // Hemisphere light for soft sky/ground fill
  const hemi = new THREE.HemisphereLight(0xffffff, 0xe8eaf0, 0.65);
  scene.add(hemi);

  // Soft ambient fill
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambient);

  // Main sun light with soft shadows
  const sun = new THREE.DirectionalLight(0xfff8f0, 1.05);
  sun.position.set(14, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 3;
  scene.add(sun);

  // Fill light from opposite side
  const fill = new THREE.DirectionalLight(0xe8f0ff, 0.45);
  fill.position.set(-10, 14, -8);
  scene.add(fill);

  // Rim/back light for depth
  const rim = new THREE.DirectionalLight(0xffeedd, 0.3);
  rim.position.set(-6, 10, 18);
  scene.add(rim);

  // Ground plane — very light gray
  const groundGeo = new THREE.PlaneGeometry(100, 100);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xe2e6eb, roughness: 0.95, metalness: 0.0
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  return { scene, camera, controls };
}
