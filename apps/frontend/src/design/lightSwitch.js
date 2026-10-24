// Preserve authored settings, including fixtures rebuilt while a circuit is off.
export function createLightSwitch() {
  let enabled = true;
  const circuits = { ceiling: true, wall: true };
  const intensities = new WeakMap(), emissions = new WeakMap();
  return {
    setEnabled(value) { enabled = Boolean(value); },
    setCircuitEnabled(circuit, value) { if (circuit in circuits) circuits[circuit] = Boolean(value); },
    update(scene) {
      function visit(node, circuit = null) {
        const data = node.userData || {};
        if (data.isCeilingLight || data.isCeilingIllumination || data.category === 'ceiling' || data.ceilingType === 'reference') circuit = 'ceiling';
        if (data.isWallMural || ['wallPanel', 'tvPanel'].includes(data.category)) circuit = 'wall';
        const on = enabled && (!circuit || circuits[circuit]);
        if (node.isLight && data.isAuthoredLight) {
          if (!on) { if (!intensities.has(node)) intensities.set(node,node.intensity); node.intensity=0; }
          else if (intensities.has(node)) { node.intensity=intensities.get(node); intensities.delete(node); }
        }
        if (data.isWallMural && node.material?.muralLitMap) {
          node.material.map = on ? node.material.muralLitMap : node.material.muralUnlitMap;
        }
        if (circuit && node.material) for (const material of Array.isArray(node.material)?node.material:[node.material]) {
          if (!on) { if (!emissions.has(material)) emissions.set(material,material.emissiveIntensity); material.emissiveIntensity=0; }
          else if (emissions.has(material)) { material.emissiveIntensity=emissions.get(material); emissions.delete(material); }
        }
        node.children?.forEach(child=>visit(child,circuit));
      }
      visit(scene);
    },
  };
}
