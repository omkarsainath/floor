// Keep the tracer/viewer handoff format, including calibration and catalog data.
export function persistLayout(layout, storage) {
  try {
    storage ??= globalThis.localStorage;
    storage.setItem('preciseFloorplan', JSON.stringify(layout));
    storage.setItem('floorplanTimestamp', String(Date.now()));
    return true;
  } catch (error) {
    console.warn('Could not save project locally:', error);
    return false;
  }
}
