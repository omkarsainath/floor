import * as THREE from 'three';
import { summarizeMeasurements, formatLength, SQFT_PER_SQM } from '../measurements/modelMeasurements.js';

// Visible geometry only: invisible selection boxes are not physical dimensions.
export function renderedObjectBounds(root) {
  const bounds = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry) return;
    for (let node = mesh; node; node = node.parent) if (!node.visible || node.userData.isHelper) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some(m => m && m.visible !== false && !(m.transparent && m.opacity <= 0.001))) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  });
  return bounds.isEmpty() ? null : bounds.getSize(new THREE.Vector3());
}

export function setupMeasurementPanel({ getLayout, camera, getObjectMeshes = () => [] }) {
  const toggle = document.createElement('button'); toggle.id = 'measurements-toggle'; toggle.textContent = 'Measurements';
  toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'measurements-panel');
  toggle.style.cssText = 'position:fixed;right:14px;top:56px;z-index:40;padding:9px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#172033;cursor:pointer';
  const panel = document.createElement('section'); panel.id = 'measurements-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Model measurements');
  panel.style.cssText = 'position:fixed;right:14px;top:101px;z-index:40;width:min(410px,85vw);max-height:70vh;overflow:auto;box-sizing:border-box;padding:16px;border-radius:12px;background:rgba(255,255,255,.97);box-shadow:0 4px 20px #0003;color:#172033;font:13px/1.5 system-ui';
  const text = (tag, value, parent = panel) => { const el = document.createElement(tag); el.textContent = value; parent.append(el); return el; };
  const check = document.createElement('input'); check.type = 'checkbox'; check.id = 'show-model-measurements';
  const labelSetting = document.createElement('label'); labelSetting.append(check, ' Show measurements on the model');
  const labels = [];
  function addLabel(value, midpoint, height) {
    if (!midpoint) return;
    const label = document.createElement('div'); label.textContent = value; label.hidden = true;
    label.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:15;white-space:nowrap;padding:3px 6px;border-radius:4px;background:#102132df;color:#fff;font:11px system-ui';
    document.body.append(label); labels.push({ label, point: new THREE.Vector3(midpoint.x, height, midpoint.y) });
  }
  const format = (value, area = false) => !Number.isFinite(value) ? 'unavailable' : area
    ? `${value.toFixed(3)} m² (${(value * SQFT_PER_SQM).toFixed(2)} sq ft)` : `${value.toFixed(3)} m`;
  function refresh() {
    const scroll = panel.scrollTop;
    labels.splice(0).forEach(({ label }) => label.remove()); panel.replaceChildren();
    const layout = getLayout(), measurements = summarizeMeasurements(layout);
    text('strong', 'Check the plan against the 3D geometry');
    const messages = {
      confirmed: 'Scale calibrated to the selected reference. Check the original drawing and its endpoints.',
      automatic: 'Scale fitted from scanned measurements. Check the OCR text and reference endpoints against the drawing.',
      estimated: 'Estimated scale — verify a printed dimension in the tracer before relying on these numbers.',
      unscaled: 'Preview scale only — use a printed dimension in the tracer for real measurements.',
    };
    const status = text('p', messages[measurements.status] || messages.unscaled);
    status.dataset.measurementStatus = measurements.status;
    if (measurements.status !== 'confirmed') status.style.color = '#9a4b00';
    text('p', '1 model unit = 1 metre. Model and Render share the same geometry. A match verifies the saved model against a target, not the accuracy of OCR or the actual building.');
    const sourceName = layout.source_image?.name || layout.source_image?.filename || layout.source_filename;
    if (sourceName) text('p', `Drawing: ${sourceName}`);
    const reference = layout.calibration?.reference;
    if (Number.isFinite(reference?.meters)) text('p', `Scale reference: ${reference.text || formatLength(reference.meters)}`);
    if (Number.isFinite(reference?.area_m2)) text('p', `Scale reference: ${format(reference.area_m2, true)} inside the room outline.`);
    if (layout.automatic_scan?.unresolved?.length) {
      text('h3', 'Scanned readings needing review');
      layout.automatic_scan.unresolved.forEach(item => text('p', `${item.text || item.id || 'Boundary'}: ${item.reason}`));
    }
    panel.append(labelSetting);
    text('h3', 'Applied plan dimensions');
    const applied = text('p', !measurements.constraints.length ? 'No measurement targets applied. These model dimensions are not verified against printed values.'
      : measurements.constraint_status === 'satisfied' ? 'All applied targets match the current model within 0.000001 m or m².' : 'Some targets are missing or differ from this model. Review their references in the tracer.');
    applied.dataset.constraintStatus = measurements.constraint_status;
    applied.style.color = measurements.constraint_status === 'satisfied' ? '#166534' : '#9a4b00';
    measurements.constraints.forEach(dimension => {
      const area = dimension.unit === 'm2';
      const item = text('p', `${dimension.label}: target ${format(dimension.target, area)}; model ${format(dimension.actual, area)}. `);
      item.dataset.dimensionId = dimension.id; item.dataset.dimensionStatus = dimension.status;
      const difference = dimension.error === null ? 'Reference or room boundary is missing.'
        : `Difference ${dimension.error >= 0 ? '+' : ''}${area ? `${dimension.error.toFixed(6)} m²` : `${(dimension.error * 1000).toFixed(3)} mm`}.`;
      text('strong', `${dimension.status === 'satisfied' ? 'Matched' : dimension.status === 'mismatch' ? 'Mismatch' : 'Unverified'}. ${difference}`, item)
        .style.color = dimension.status === 'satisfied' ? '#166534' : '#9a4b00';
      if (!area && dimension.actual !== null) addLabel(`${dimension.label}: ${format(dimension.actual)}`, dimension.midpoint, 0.16);
    });
    text('p', 'Compare the same references: printed spans can run between inner faces, outer faces or wall centrelines. Wall centreline lengths below are not automatically the printed clear widths.');
    text('h3', 'Room floor areas');
    if (!measurements.rooms.length) text('p', 'No inside room outlines available. A room label or detection rectangle cannot verify floor area. Correct the detected boundary or trace the inside faces in the tracer.');
    measurements.rooms.forEach(room => {
      const row = text('p', `${room.name}: ${format(room.area_m2, true)}.`); row.dataset.roomId = room.id;
      if (room.declared_area_m2 !== null) {
        const error = room.area_m2 - room.declared_area_m2, matched = Math.abs(error) <= 1e-6;
        row.dataset.areaStatus = matched ? 'satisfied' : 'mismatch';
        text('span', ` Printed: ${format(room.declared_area_m2, true)}. ${matched ? 'Matched' : 'Mismatch'}; difference ${error >= 0 ? '+' : ''}${error.toFixed(6)} m².`, row)
          .style.color = matched ? '#166534' : '#9a4b00';
      } else { row.dataset.areaStatus = 'unverified'; text('span', ' No printed area target — unverified.', row); }
      addLabel(`${room.name}: ${format(room.area_m2, true)}`, room.midpoint, 0.06);
    });
    text('p', 'Area follows the supplied inside-boundary polygon, including its corners. Check that outline against the plan; an outer bounding rectangle is not the room area.');
    text('h3', 'Walls: centreline length and height');
    const table = document.createElement('table'); table.style.cssText = 'width:100%;text-align:left;font-size:12px';
    const header = document.createElement('tr'); ['Wall', 'Length', 'Height'].forEach(s => text('th', s, header)); table.append(header);
    measurements.walls.forEach((wall, i) => {
      const row = document.createElement('tr'); const name = `W${i + 1}`;
      text('td', name, row).title = wall.id; text('td', formatLength(wall.length_m), row); text('td', format(wall.height), row); table.append(row);
      addLabel(`${name}: ${formatLength(wall.length_m)}`, wall.midpoint, wall.height + 0.08);
    });
    panel.append(table);
    text('h3', 'Rendered objects');
    text('p', 'Dimensions below are the visible model bounds (X × depth Z × height), including frames/handles and the current rotation or open-door pose. They are not verified product sizes or clear doorway widths.');
    getObjectMeshes().forEach((mesh, index) => {
      const size = renderedObjectBounds(mesh); if (!size) return;
      const obj = (layout.objects || []).find(o => o.id === mesh.userData.layoutId);
      const name = obj?.class || mesh.userData.objectType || `Object ${index + 1}`;
      text('p', `${name}: ${size.x.toFixed(3)} × ${size.z.toFixed(3)} × ${size.y.toFixed(3)} m.`);
    });
    text('p', 'Top-down images usually do not specify wall, door, window or furniture heights. Supplied values or defaults are used. Verify these heights before judging headroom. Walk settings change your viewpoint and body clearance, never the building size.');
    panel.scrollTop = scroll;
  }
  let refreshedAt = 0;
  const projected = new THREE.Vector3();
  function update() {
    // Also covers catalog/chat edits without coupling every editor to this UI.
    if (!panel.hidden && performance.now() - refreshedAt > 1000) { refresh(); refreshedAt = performance.now(); }
    labels.forEach(({ label, point }) => {
      if (panel.hidden || !check.checked) { label.hidden = true; return; }
      projected.copy(point).project(camera);
      label.hidden = projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      if (!label.hidden) label.style.transform = `translate(${(projected.x + 1) * window.innerWidth / 2}px, ${(1 - projected.y) * window.innerHeight / 2}px) translate(-50%, -50%)`;
    });
  }
  toggle.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) { refresh(); refreshedAt = performance.now(); } toggle.setAttribute('aria-expanded', String(!panel.hidden)); };
  document.body.append(toggle, panel);
  return { update, refresh, destroy() { toggle.remove(); panel.remove(); labels.forEach(({ label }) => label.remove()); } };
}
