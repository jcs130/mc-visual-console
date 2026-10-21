import * as THREE from 'three'

const retired = () => Object.assign(Error('NATIVE_SCENE_REBUILD_RETIRED'), { code: 'NATIVE_SCENE_REBUILD_RETIRED' })
export const isNativeRebuildRetired = error => error?.code === 'NATIVE_SCENE_REBUILD_RETIRED'

export const nativeStaticSignature = snapshot => JSON.stringify([snapshot.groups, snapshot.occludedSolidRuns,
  snapshot.neighbors, snapshot.biomeGrid, snapshot.biomes, snapshot.biomeSeed, snapshot.cuttingBoards])

function yieldPreparationTask () {
  if (typeof globalThis.scheduler?.yield === 'function') return globalThis.scheduler.yield()
  if (typeof MessageChannel !== 'function') return new Promise(resolve => setTimeout(resolve, 0))
  return new Promise(resolve => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve() }
    channel.port2.postMessage(null)
  })
}

// Check at each costly unit, rather than after a fixed number of biome tints.
// Return null on the fast path so callers do not create per-block microtasks.
// CPU preparation must not wait for painting: Chromium can throttle an occluded
// window's RAF to 1 Hz even while document.visibilityState remains "visible".
export function createNativeRebuildWork ({ isCurrent, budgetMs = 4, now = () => performance.now(),
  yieldTask = yieldPreparationTask }) {
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

// One coherent active build finishes; only the latest pending snapshot is retained.
// Same-epoch arrivals must not starve commits. Epoch/session reset still retires work.
const terrainCoverage = snapshot => ({ epoch:snapshot.epoch,bounds:snapshot.bounds?Object.fromEntries(['minX','maxX','minY','maxY','minZ','maxZ'].map(key=>[key,snapshot.bounds[key]])):null,
  missingColumns:Array.isArray(snapshot.missingColumns)?snapshot.missingColumns.length:null,
  receivedColumns:snapshot.viewCoverage?.receivedColumns?.length??null,
  renderBlocks:snapshot.viewCoverage?.renderBlocks??null,
  horizontalRangeReduced:snapshot.viewCoverage?.horizontalRangeReduced??null })
export class NativeTerrainQueue {
  constructor () { this.revision=0;this.pending=null;this.key=null;this.running=false;this.epoch=null;this.received=null;this.committedCoverage=null;this.committedAt=null;this.stats={requested:0,committed:0,retiredWorkCount:0,discardedBuildMs:0,lastBuildMs:0} }
  request(snapshot) {
    if(this.epoch!==snapshot.epoch){this.reset();this.epoch=snapshot.epoch}
    this.received=terrainCoverage(snapshot)
    const key=typeof snapshot.terrainSignature==='string'&&/^[a-f0-9]{64}$/.test(snapshot.terrainSignature)
      ?snapshot.epoch+':'+snapshot.terrainSignature:JSON.stringify([snapshot.epoch,snapshot.bounds,snapshot.states,nativeStaticSignature(snapshot),snapshot.kinetic,snapshot.missingColumns])
    if(key===this.key)return false
    this.key=key;this.pending=snapshot;this.stats.requested++;return true
  }
  reset(){this.revision++;this.pending=null;this.key=null;this.epoch=null;this.received=null;this.committedCoverage=null;this.committedAt=null}
  diagnostics(now=performance.now()){return {...this.stats,building:this.running,pending:!!this.pending,received:this.received,committedCoverage:this.committedCoverage,commitAgeMs:this.committedAt===null?null:Math.round(Math.max(0,now-this.committedAt))}}
  async run(build,now=()=>performance.now()){
    if(this.running)return
    this.running=true
    try{while(this.pending){
      const snapshot=this.pending,revision=this.revision,started=now();this.pending=null
      const isCurrent=()=>revision===this.revision
      try{await build(snapshot,isCurrent);if(isCurrent()){this.stats.committed++;this.committedCoverage=terrainCoverage(snapshot);this.committedAt=now()}}
      catch(error){if(!isNativeRebuildRetired(error)){this.reset();throw error}}
      finally{const elapsed=now()-started;this.stats.lastBuildMs=elapsed;if(!isCurrent()){this.stats.retiredWorkCount++;this.stats.discardedBuildMs+=elapsed}}
    }}finally{this.running=false}
  }
}
