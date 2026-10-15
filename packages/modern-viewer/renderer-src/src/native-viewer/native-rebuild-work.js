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

// The actual scene orchestration: one active job and one latest pending snapshot.
export class NativeTerrainQueue {
  constructor () { this.revision=0;this.pending=null;this.key=null;this.running=false;this.stats={requested:0,committed:0,retiredWorkCount:0,discardedBuildMs:0,lastBuildMs:0} }
  request(snapshot) {
    const key=typeof snapshot.terrainSignature==='string'&&/^[a-f0-9]{64}$/.test(snapshot.terrainSignature)
      ?snapshot.epoch+':'+snapshot.terrainSignature:JSON.stringify([snapshot.epoch,snapshot.bounds,snapshot.states,nativeStaticSignature(snapshot),snapshot.kinetic,snapshot.missingColumns])
    if(key===this.key)return false
    this.key=key;this.pending=snapshot;this.revision++;this.stats.requested++;return true
  }
  reset(){this.revision++;this.pending=null;this.key=null}
  async run(build,now=()=>performance.now()){
    if(this.running)return
    this.running=true
    try{while(this.pending){
      const snapshot=this.pending,revision=this.revision,started=now();this.pending=null
      const isCurrent=()=>revision===this.revision
      try{await build(snapshot,isCurrent);if(isCurrent())this.stats.committed++}
      catch(error){if(!isNativeRebuildRetired(error))throw error}
      finally{const elapsed=now()-started;this.stats.lastBuildMs=elapsed;if(!isCurrent()){this.stats.retiredWorkCount++;this.stats.discardedBuildMs+=elapsed}}
    }}finally{this.running=false}
  }
}
