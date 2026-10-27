import { Vector3 } from 'three';

const displayCameraPosition = new Vector3();
/** The renderer anchor can differ from the rendered eye during interpolation. */
export function displayCameraWorldPosition(world, camera = world?.camera) {
  const origin = world?.sceneOrigin;
  if (!camera?.getWorldPosition || !origin?.toWorldX || !origin?.toWorldY || !origin?.toWorldZ) return null;
  camera.parent?.updateMatrixWorld?.(true);
  camera.updateMatrixWorld?.(true);
  camera.getWorldPosition(displayCameraPosition);
  return { x: origin.toWorldX(displayCameraPosition.x), y: origin.toWorldY(displayCameraPosition.y), z: origin.toWorldZ(displayCameraPosition.z) };
}

// Reuse the pinned renderer's section-connectivity graph from the *display*
// camera. While a roof is cut, retain the observed room as a second seed.
// This only removes draw spans; it never changes the world or Agent perception.
export function installObserverSectionCulling(manager, getRoomSeed) {
  const cull = manager?.sectionOcclusionCull;
  if (!cull?.update || !cull.hasRegisteredSection) return null;
  const originals = new Map();
  let revision = 0, signature = '', visible = null, lastSeed = '';
  let lastCameraSignature = '';
  const diagnostics = { mode: 'camera', rebuilds: 0, visibleSections: 0 };
  const key = (p, h = 16) => `${Math.floor(p.x / 16) * 16},${Math.floor(p.y / h) * h},${Math.floor(p.z / 16) * 16}`;
  const seed = () => {
    const p = getRoomSeed?.();
    return p && [p.x, p.y, p.z].every(Number.isFinite) ? p : null;
  };
  function displayPosition(camera = manager.worldRenderer?.camera) {
    return displayCameraWorldPosition(manager.worldRenderer, camera);
  }
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
    const camera = args[0], display = displayPosition(camera);
    if (display) {
      const pose = [display.x, display.y, display.z, ...(camera.projectionMatrix?.elements ?? [])].join(',');
      if (pose !== lastCameraSignature) { lastCameraSignature = pose; manager.markCullDirty(); }
    }
    return original.apply(this, args);
  });
  wrap(cull, 'update', original => function (params) {
    // These arguments are the renderer's floating shader origin, not the
    // offset observer. Change the graph seed only; the frustum's section boxes
    // and GPU position uniforms must retain their original coordinate frame.
    const display = displayPosition();
    if (display) params = { ...params, cameraWorldX: display.x, cameraWorldY: display.y, cameraWorldZ: display.z };
    const p = seed(), h = params.sectionHeight;
    const cameraKey = key({ x: params.cameraWorldX, y: params.cameraWorldY, z: params.cameraWorldZ }, h);
    diagnostics.cameraSection = cameraKey;
    if (display && !this.hasRegisteredSection(cameraKey)) {
      visible = null; signature = ''; diagnostics.mode = 'unreceived-observer';
      const result = original.call(this, { ...params, smartCull: false });
      diagnostics.visibleSections = result.size;
      // Upstream's disabled path replaces its set without invalidating the BFS.
      // Re-entering received terrain must rebuild rather than reuse that set.
      this.invalidate();
      return result;
    }
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
