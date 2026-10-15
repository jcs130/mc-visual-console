import { EqualDepth, NormalBlending } from 'three';
import { CUTAWAY_MATERIAL_VERSION } from './room-visibility.js';

// Reuse the renderer's uploaded geometry and visible multi-draw spans. Only
// occluding fragments participate. A colourless nearest-surface pass avoids
// opacity accumulating through unsorted rock layers; the colour pass blends
// that original surface over the already-rendered room/actor. No remeshing.
export function createObserverTransparency(world, uniforms) {
  const records = new Map();
  let updates = 0;
  const diagnostics = { mode: 'alpha-blend', opacity: uniforms.u_lanternObstructionOpacity.value, surfaces: 0, updates: 0 };
  function release(record) {
    for (const mesh of [record.depth, record.colour]) {
      mesh.removeFromParent();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
    }
    // Geometry, textures and native GPU buffers belong to the original mesh.
  }
  function clonePass(source, depthOnly) {
    const mesh = source.clone(false);
    const clone = material => {
      const result = material.clone();
      result.onBeforeCompile = material.onBeforeCompile;
      result.customProgramCacheKey = material.customProgramCacheKey;
      if (material.uniforms) result.uniforms = { ...material.uniforms, u_lanternTransparencyPass: { value: 1 } };
      result.userData.lanternTransparencyPass = 1;
      result.transparent = true;
      result.blending = NormalBlending;
      result.depthTest = true;
      result.depthWrite = depthOnly;
      result.colorWrite = !depthOnly;
      if (!depthOnly) result.depthFunc = EqualDepth;
      result.forceSinglePass = true;
      return result;
    };
    mesh.material = Array.isArray(source.material) ? source.material.map(clone) : clone(source.material);
    mesh.name = `observer-obstruction-${depthOnly ? 'depth' : 'colour'}`;
    mesh.userData.lanternTransparencyOverlay = true;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = source.frustumCulled;
    mesh.renderOrder = depthOnly ? 1000 : 1001;
    // Global buffer callbacks retain the original span lists, upload epochs
    // and Tier A/B/C draw implementations. Do not copy their geometry arrays.
    mesh.onAfterRender = source.onAfterRender;
    mesh.onBeforeRender = source.onBeforeRender;
    world.scene.add(mesh);
    return mesh;
  }
  function sync(record) {
    const { source } = record;
    for (const mesh of [record.depth, record.colour]) {
      mesh.geometry = source.geometry;
      mesh.matrix.copy(source.matrixWorld);
      mesh.matrixWorld.copy(source.matrixWorld);
      mesh.matrixWorldNeedsUpdate = false;
      let visible = source.visible;
      let parent = source.parent;
      for (; parent && parent !== world.scene; parent = parent.parent) visible &&= parent.visible;
      visible &&= parent === world.scene;
      mesh.visible = visible && uniforms.u_lanternReveal.value > 0;
    }
  }
  return {
    diagnostics,
    update() {
      const active = new Set();
      function visit(node) {
        if (node.userData?.lanternTransparencyOverlay || node.userData?.lanternCutawayCap) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        if (node.isMesh && !node.isSkinnedMesh && materials.length && materials.every(m => m?.userData?.lanternVisibilityVersion === CUTAWAY_MATERIAL_VERSION)) {
          active.add(node);
          let record = records.get(node);
          if (record && record.material !== node.material) { release(record); records.delete(node); record = null; }
          if (!record) records.set(node, record = { source: node, material: node.material, depth: clonePass(node, true), colour: clonePass(node, false) });
          sync(record);
        }
        // Snapshot: clonePass appends observer meshes to this scene.
        for (const child of [...node.children]) visit(child);
      }
      visit(world.scene);
      for (const [source, record] of records) if (!active.has(source)) { release(record); records.delete(source); }
      diagnostics.surfaces = records.size;
      diagnostics.updates = ++updates;
    },
    sync() { for (const record of records.values()) sync(record); },
    dispose() { for (const record of records.values()) release(record); records.clear(); diagnostics.surfaces = 0; },
  };
}
