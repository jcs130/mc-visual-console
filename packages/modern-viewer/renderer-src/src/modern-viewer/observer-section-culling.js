// Reuse the pinned renderer's section-connectivity graph from the *display*
// camera. While a roof is cut, retain the observed room as a second seed.
// This only removes draw spans; it never changes the world or Agent perception.
export function installObserverSectionCulling(manager, getRoomSeed) {
  const cull = manager?.sectionOcclusionCull;
  if (!cull?.update || !cull.hasRegisteredSection) return null;
  const originals = new Map();
  let revision = 0, signature = '', visible = null, lastSeed = '';
  const diagnostics = { mode: 'camera', rebuilds: 0, visibleSections: 0 };
  const key = (p, h = 16) => `${Math.floor(p.x / 16) * 16},${Math.floor(p.y / h) * h},${Math.floor(p.z / 16) * 16}`;
  const seed = () => {
    const p = getRoomSeed?.();
    return p && [p.x, p.y, p.z].every(Number.isFinite) ? p : null;
  };
  const wrap = (object, name, factory) => {
    if (typeof object[name] !== 'function') return;
    const original = object[name], wrapped = factory(original);
    originals.set(name, { object, original, wrapped }); object[name] = wrapped;
  };
  for (const method of ['registerSection', 'unregisterSection', 'invalidate']) {
    wrap(cull, method, original => function (...args) {
      revision++; signature = ''; visible = null;
      return original.apply(this, args);
    });
  }
  wrap(manager, 'updateCullDirtyFromCamera', original => function (...args) {
    const p = seed(), next = p ? key(p, manager.worldRenderer?.getSectionHeight?.() ?? 16) : '';
    if (next !== lastSeed) { lastSeed = next; manager.markCullDirty(); }
    return original.apply(this, args);
  });
  wrap(cull, 'update', original => function (params) {
    const p = seed(), h = params.sectionHeight;
    const cameraKey = key({ x: params.cameraWorldX, y: params.cameraWorldY, z: params.cameraWorldZ }, h);
    const roomKey = p ? key(p, h) : '';
    if (!params.smartCull || !p || roomKey === cameraKey || !this.hasRegisteredSection(roomKey)) {
      visible = null; signature = ''; diagnostics.mode = 'camera';
      const result = original.call(this, params); diagnostics.visibleSections = result.size;
      return result;
    }
    const next = [revision, cameraKey, roomKey, params.viewDistance, h, params.worldMinY, params.worldMaxY].join('|');
    if (next !== signature) {
      // Snapshot before the second update: the upstream graph replaces its set.
      const cameraVisible = original.call(this, params);
      const roomVisible = original.call(this, { ...params, cameraWorldX: p.x, cameraWorldY: p.y, cameraWorldZ: p.z });
      visible = new Set([...cameraVisible, ...roomVisible]); signature = next;
      diagnostics.rebuilds++;
    }
    diagnostics.mode = 'camera-and-room'; diagnostics.visibleSections = visible.size;
    return visible;
  });
  wrap(cull, 'isSectionVisible', original => function (section) {
    return visible ? !this.hasRegisteredSection(section) || visible.has(section) : original.call(this, section);
  });
  wrap(cull, 'getVisibleKeys', original => function () { return visible ?? original.call(this); });
  return { diagnostics, dispose() {
    for (const [name, { object, original, wrapped }] of originals) if (object[name] === wrapped) object[name] = original;
    manager.markCullDirty?.(); cull.invalidate?.();
  } };
}
