import * as THREE from 'three';
import { STONE_BY_ID, stoneMaterial } from '../materials/stone.js';

const clampPositive = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
};

// Classification supplies appearance/defaults only. It must never multiply
// measured dimensions (including the short pieces above/below an opening).
const WALL_TYPE_PROPS = {
  exterior: { height: 3, color: 0xd9d2c5 },
  interior: { height: 3, color: 0xf5f2ed },
  half: { height: 1.05, color: 0xcfc9bd },
};

// Create a fresh owned material so _ensureOwnMaterial never needs to clone it.
const _mkMat = (col) => {
  const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.0 });
  m.userData._ownedByMesh = true;
  return m;
};

export function createWall({ start, end, height, thickness = 0.15, color, wall_type, yOffset = 0, skirting = {} }) {
  if (!start || !end) throw new Error('Wall requires start and end points');

  const x1 = start.x;
  const z1 = start.y;
  const x2 = end.x;
  const z2 = end.y;

  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  if (!Number.isFinite(length) || length === 0) throw new Error('Wall endpoints must be finite and different');

  const centerX = (x1 + x2) / 2;
  const centerZ = (z1 + z2) / 2;

  const typeProps = WALL_TYPE_PROPS[wall_type] || WALL_TYPE_PROPS.interior;
  const wallHeight = clampPositive(height, typeProps.height);
  const wallThickness = clampPositive(thickness, 0.15);

  const geometry = new THREE.BoxGeometry(length, wallHeight, wallThickness);

  // Six separate material instances, one per BoxGeometry face group:
  //   0=+X (right end)  1=-X (left end)  2=+Y (top)  3=-Y (bottom)
  //   4=+Z (broad face A — tagged as inside/outside by rebuildWalls)
  //   5=-Z (broad face B — tagged as inside/outside by rebuildWalls)
  const baseColor = (color !== undefined && color !== 0x888888) ? color : typeProps.color;
  const materials = Array.from({ length: 6 }, () => _mkMat(baseColor));

  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = 'wall';

  mesh.position.set(centerX, yOffset + wallHeight / 2, centerZ);

  const angle = Math.atan2(dz, dx);
  mesh.rotation.y = -angle;

  if(yOffset!==0||skirting?.enabled===false)return mesh;

  // Separate skirting on both sides of floor-level wall segments
  const baseboardH = Math.min(clampPositive(skirting?.height,0.08),.5,wallHeight);
  const baseboardD = Math.min(clampPositive(skirting?.depth,0.02),.1);
  const baseboardMat = new THREE.MeshStandardMaterial({
    color: /^#[0-9a-f]{6}$/i.test(skirting?.color||'')?skirting.color:0xebe7e0, roughness: 0.6, metalness: 0.0,
  });
  baseboardMat.userData._ownedByMesh = true;
  const baseboardGeo = new THREE.BoxGeometry(length, baseboardH, baseboardD);
  const tiled=STONE_BY_ID.has(skirting?.tileId);
  const tileWidth=Math.max(.1,Math.min(2,clampPositive(skirting?.tileWidth,.6)));
  const tileMat=tiled?stoneMaterial(skirting.tileId):null;
  if(tileMat){tileMat.userData._ownedByMesh=true;tileMat.addEventListener('dispose',()=>tileMat.map?.dispose());baseboardMat.color.set('#c9c6c0');}
  (yOffset === 0 && skirting?.enabled!==false ? [-1, 1] : []).forEach((side) => {
    const baseboard = new THREE.Mesh(baseboardGeo, baseboardMat);
    baseboard.name='wall-skirting';
    baseboard.userData.isSkirting=true;
    baseboard.userData.kitchenObstacleLabel = 'wall skirting at floor level';
    baseboard.position.set(0, -wallHeight / 2 + baseboardH / 2, side * (wallThickness / 2 + baseboardD / 2));
    baseboard.castShadow = true;
    baseboard.receiveShadow = true;
    if(tiled){
      // The backing is grout; tiles sit in front of it, with real 2 mm joints.
      const count=Math.min(1000,Math.ceil(length/tileWidth)),pitch=Math.max(tileWidth,length/1000),joint=.002;
      for(let i=0;i<count;i++){
        const span=Math.min(pitch,length-i*pitch);
        const w=Math.max(.001,span-joint),h=Math.max(.001,baseboardH-joint);
        const geometry=new THREE.BoxGeometry(w,h,.001);
        const uv=geometry.attributes.uv;
        for(let j=0;j<uv.count;j++)uv.setXY(j,uv.getX(j)*w/tileWidth,uv.getY(j)*h/(tileWidth/1.8));
        const tile=new THREE.Mesh(geometry,tileMat);tile.name='skirting-tile';
        tile.position.set(-length/2+i*pitch+span/2,0,side*(baseboardD/2+.0005));
        tile.castShadow=true;tile.receiveShadow=true;baseboard.add(tile);
      }
    }
    mesh.add(baseboard);
  });

  return mesh;
}
