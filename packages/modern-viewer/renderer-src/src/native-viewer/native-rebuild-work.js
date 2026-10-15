import * as THREE from 'three'

const retired = () => Object.assign(Error('NATIVE_SCENE_REBUILD_RETIRED'), { code: 'NATIVE_SCENE_REBUILD_RETIRED' })
export const isNativeRebuildRetired = error => error?.code === 'NATIVE_SCENE_REBUILD_RETIRED'

export const nativeStaticSignature = snapshot => JSON.stringify([snapshot.groups, snapshot.occludedSolidRuns,
  snapshot.neighbors, snapshot.biomeGrid, snapshot.biomes, snapshot.biomeSeed, snapshot.cuttingBoards])

// Check at each costly unit, rather than after a fixed number of biome tints.
// Return null on the fast path so callers do not create per-block microtasks.
export function createNativeRebuildWork ({ isCurrent, budgetMs = 4, now = () => performance.now(),
  yieldTask = () => new Promise(resolve => requestAnimationFrame(resolve)) }) {
  let started = now()
  const check = () => { if (!isCurrent()) throw retired() }
  return { check,
    checkpoint () {
      check()
      if (now() - started < budgetMs) return null
      return (async () => { await yieldTask(); check(); started = now() })()
    } }
}

export function disposeNativeStaticMeshes (root) {
  for (const mesh of root.children) {
    mesh.dispose?.()
    if (mesh.userData.nativeFluid) mesh.geometry.dispose()
  }
  root.clear()
}

// Templates/materials are shared; only instance state and fluid geometry belong
// to a stage. Until its synchronous commit, the active complete scene survives.
export class NativeStaticStage {
  constructor () { this.root = new THREE.Group() }
  add (mesh) { this.root.add(mesh) }
  dispose () { disposeNativeStaticMeshes(this.root) }
  commit (target, isCurrent) {
    if (!isCurrent()) throw retired()
    disposeNativeStaticMeshes(target)
    for (const mesh of [...this.root.children]) target.add(mesh)
  }
}
