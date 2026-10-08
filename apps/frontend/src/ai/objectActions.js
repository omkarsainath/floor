import { createObject } from '../generators/object.js';
import { persistLayout } from '../state/projectPersistence.js';

// One record and ID drive both the scene and the saved project.
export function addAIObject(action, { scene, layout, selectableMeshes, storage }) {
  if (!layout) return null;
  const { x = 0, z = 0, width = 1, depth = 1 } = action;
  if (![x, z, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) return null;
  const object = {
    id: `ai-${crypto.randomUUID()}`,
    class: action.object_type || 'default',
    source: 'ai',
    bbox: { x1: x - width / 2, y1: z - depth / 2, x2: x + width / 2, y2: z + depth / 2 },
  };
  const mesh = createObject({ ...object, layoutCenter: { x: 0, y: 0 }, walls: layout.walls || [] });
  if (!mesh) return null;
  Object.assign(mesh.userData, { aiPlaced: true, isSelectable: true,
    objectType: object.class, layoutId: object.id });
  scene.add(mesh);
  selectableMeshes.push(mesh);
  (layout.objects ??= []).push(object);
  persistLayout(layout, storage);
  return mesh;
}

export function removeAIObjects(action, { scene, layout, selectableMeshes, storage }) {
  if (!layout) return 0;
  const type = (action.object_type || '').toLowerCase();
  const nearby = Number.isFinite(action.near_x) && Number.isFinite(action.near_z);
  const removedIds = new Set((layout.objects || []).filter(object => {
    if (object.source !== 'ai' || (object.class || '').toLowerCase() !== type) return false;
    if (!nearby) return true;
    const b = object.bbox;
    return b && Math.hypot((b.x1 + b.x2) / 2 - action.near_x,
      (b.y1 + b.y2) / 2 - action.near_z) <= 3;
  }).map(object => object.id));
  if (!removedIds.size) return 0;
  const meshes = scene.children.filter(child => removedIds.has(child.userData.layoutId));
  for (const mesh of meshes) {
    scene.remove(mesh);
    mesh.traverse(child => {
      child.geometry?.dispose();
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) material?.dispose();
    });
    const index = selectableMeshes.indexOf(mesh);
    if (index >= 0) selectableMeshes.splice(index, 1);
  }
  layout.objects = layout.objects.filter(object => !removedIds.has(object.id));
  persistLayout(layout, storage);
  return removedIds.size;
}
