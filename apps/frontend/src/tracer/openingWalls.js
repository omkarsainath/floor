import { openingWallSpans } from '../measurements/modelMeasurements.js';
import { buildMetricLayout } from './planMeasurements.js';

// Convert through the export transform: geometry tolerances are in metres,
// while the tracer canvas and detection boxes are in original-image pixels.
export function openingWallsForPlan({ walls = [], doors = [], objects = [], ...options }) {
  if (!walls.length) return [];
  const openings = objects.filter(object => /door|window|glass/i.test(object.class || ''));
  if (!doors.length && !openings.length) return [];
  const layout = buildMetricLayout({ ...options, walls, doors, objects: openings });
  const { center_px: center, meters_per_pixel: scale } = layout.image_transform;
  const pixel = point => ({ x: point.x / scale + center.x, y: point.y / scale + center.y });
  return openingWallSpans(layout.walls, layout.objects).map(wall => ({
    start: pixel(wall.start), end: pixel(wall.end), thickness_px: wall.thickness / scale,
  }));
}
