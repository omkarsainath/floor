import { createObject } from '../generators/object.js';
import { attachModelThumbnail } from './modelThumbnail.js';

// Shared by placement and replacement so each product uses the same preview.
export function createProductThumbnail(item) {
  const img = document.createElement('img');
  img.alt = item.label;
  img.loading = 'lazy';
  img.style.cssText = 'width:100%;height:100px;object-fit:contain;background:#f3f0eb;border-radius:6px';
  if (item.image) img.src = item.image;
  else attachModelThumbnail(img, `object:${item.id}`, () => createObject({
    class:item.id, source:'catalog',
    bbox:{x1:-item.w/2,y1:-item.d/2,x2:item.w/2,y2:item.d/2},
  }));
  return img;
}
