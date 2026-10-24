import { parseLength } from './planMeasurements.js';

export const CUTOUT_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export function validateRoomCutout(room) {
  const cut = room.cutout;
  if (!cut) return;
  const width = room.declared_width_m, depth = room.declared_depth_m;
  if (!(width > 0 && depth > 0 && Number.isFinite(width) && Number.isFinite(depth))) {
    throw new Error('Enter the overall room width and depth to use a bathroom cut-out.');
  }
  if (!CUTOUT_CORNERS.includes(cut.corner)) throw new Error('Choose the bathroom cut-out corner.');
  if (!(cut.width_m > 0 && cut.depth_m > 0 && Number.isFinite(cut.width_m) && Number.isFinite(cut.depth_m))) {
    throw new Error('Enter a positive bathroom cut-out width and depth, with units such as m or ft.');
  }
  if (cut.width_m >= width || cut.depth_m >= depth) {
    throw new Error('The bathroom cut-out width and depth must each be smaller than the overall room dimensions.');
  }
}

export function parseRoomCutout(enabled, corner, widthText, depthText, room) {
  if (!enabled) return null;
  const cutout = { corner, width_m: parseLength(widthText), depth_m: parseLength(depthText),
    width_text: widthText.trim(), depth_text: depthText.trim() };
  validateRoomCutout({ ...room, cutout });
  return cutout;
}

// The input is the overall rectangle (or the bounds of an existing trace).
// Ratios give the identical L outline in source pixels and in final metres.
export function roomCutoutOutline(points, room) {
  if (!room.cutout) return points;
  validateRoomCutout(room);
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  const width = Math.max(...points.map(p => p.x)) - x, depth = Math.max(...points.map(p => p.y)) - y;
  const cw = room.cutout.width_m / room.declared_width_m * width;
  const cd = room.cutout.depth_m / room.declared_depth_m * depth;
  // Start with top-left removed, then reflect for the chosen corner.
  let outline = [{x:cw,y:0},{x:width,y:0},{x:width,y:depth},{x:0,y:depth},{x:0,y:cd},{x:cw,y:cd}];
  const right = room.cutout.corner.endsWith('right'), bottom = room.cutout.corner.startsWith('bottom');
  outline = outline.map(p => ({x:x+(right?width-p.x:p.x),y:y+(bottom?depth-p.y:p.y)}));
  if (right !== bottom) outline.reverse();
  return outline;
}
