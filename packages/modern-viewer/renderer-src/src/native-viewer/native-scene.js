import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { NativeAssetReader, NativeModelLoader, selectBlockVariants, resourcePath } from './model-loader.js'
import { createKineticActor } from './create-kinetics.js'
import { blockTint, blendedBiomeColor, modelOffset } from './native-environment.js'
import { waterGeometry } from './native-fluid.js'
import { CUTTING_BOARD_ID, cuttingBoardStaticModelStatus } from './cutting-board.js'
import { createNativePlayerActor } from './native-player.js'
import { playerCamera } from './player-camera.js'
import { createNativeSession } from './native-session.js'

// Shared exact-resource scene used by the full console and diagnostic preview.
// UI, network presentation and quality policy belong to the console, not this backend.
export async function mountNativeWorld({viewport, mode='third', onIdentity=()=>{}, onState=()=>{},
  onUnavailable=()=>{}, onDiagnostics=()=>{}, onActor=()=>{}, onFrame=()=>{}, onMode=()=>{}} = {}) {
if (!viewport?.append || !['third', 'first', 'region', 'dungeon'].includes(mode)) throw Error('NATIVE_SCENE_OPTIONS_INVALID')
const pointKey = p => `${p.x},${p.y},${p.z}`
let renderer, loader, events, current, pending = null, rebuilding = false, epoch = null, player = null, generation = 0
const templates = new Map(), actors = new Map()
let statics, worldRoot, camera, controls, viewMode = mode, lastGroupSignature = null, unknown = [], drawn = 0, tickAge = null
let colormaps, textureStart = performance.now()
let disposed = false, skinState = null, observer, assetReader, playerUuid, selfActor = null, selfActorKey = null, cameraCollisionAt = 0, cameraDistance = null
const cameraRay = new THREE.Raycaster(), labelPoint = new THREE.Vector3()
async function start () {
  const response = await fetch('/manifest.json')
  if (!response.ok) throw Error('NATIVE_WORLD_MANIFEST_UNAVAILABLE')
  const manifest = await response.json()
  const reader = new NativeAssetReader(manifest, async path => {
    const result = await fetch(`/${path}`)
    if (!result.ok) throw Error(`NATIVE_ASSET_UNAVAILABLE:${path}`)
    return result.arrayBuffer()
  })
  assetReader = reader
  const session = createNativeSession(manifest.registryHashes['block-states.jsonl'])
  loader = new NativeModelLoader(reader)
  colormaps = {}
  for (const name of ['grass', 'foliage']) {
    const pixels = await reader.bytes(resourcePath(`minecraft:${name}`, 'textures/colormap', '.png'))
    const image = await createImageBitmap(new Blob([pixels], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
    const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(image, 0, 0); colormaps[name] = context.getImageData(0, 0, image.width, image.height).data; image.close()
  }
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#111820')
  worldRoot = new THREE.Group(); statics = new THREE.Group(); worldRoot.add(statics); scene.add(worldRoot)
  scene.add(new THREE.AmbientLight(0xffffff, 1.1))
  const light = new THREE.DirectionalLight(0xffffff, 2.2); light.position.set(35, 70, 15); scene.add(light)
  camera = new THREE.PerspectiveCamera(70, 1, 0.05, 150)
  renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.domElement.setAttribute('aria-label', 'Agent 本人及实时原生世界画面')
  viewport.append(renderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxDistance = 9; controls.enabled = false
  const resize = () => { const host = viewport; renderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix() }
  observer = new ResizeObserver(resize); observer.observe(viewport); resize()
  renderer.setAnimationLoop(now => {
    try {
      if (disposed || document.hidden) return
      loader.animateTextures((now - textureStart) / 50)
      if (current?.pose) {
        updatePlayerCamera(now)
        if (selfActor) {
          selfActor.applyPose(current.pose)
          selfActor.applyMotion(current.selfPlayer?.onGround === true && current.selfPlayer?.sneaking === false ? current.motion : null, Date.now())
          selfActor.root.visible = viewMode !== 'first' && (cameraDistance === null || cameraDistance > 0.9)
        }
        // The game's absolute clock supplies the shaft phase; crank chase is
        // integrated once per tick, independently of browser frame rate.
        if (current.time) {
          const renderTicks = current.time.age + Math.max(0, Date.now() - current.time.receivedAt) / 50
          const whole = Math.floor(renderTicks)
          if (tickAge === null || whole < tickAge || whole - tickAge > 100) tickAge = whole
          while (tickAge < whole) { for (const actor of actors.values()) actor.tick(); tickAge++ }
          for (const actor of actors.values()) actor.frame(renderTicks, renderTicks - whole)
        }
      }
      renderer.render(scene, camera)
      publishFrame(now)
    } catch (error) { fail(error) }
  })
  events = new EventSource('/events')
  events.onmessage = message => {
    try {
      const event = session.receive(JSON.parse(message.data)), value = event.value
      if (event.kind === 'ignored') return
      if (event.kind === 'identity') {
        if (event.reset) clearScene()
        player = value.player; playerUuid = value.playerUuid?.toLowerCase(); onIdentity(value); return
      }
      if (event.kind === 'unavailable') {
        if (event.reset) clearScene()
        epoch = value.epoch; onUnavailable(value.reason || 'NATIVE_WORLD_WAITING'); return
      }
      if (value.type === 'snapshot') {
        if (epoch !== value.epoch) { clearScene(); epoch = value.epoch }
        current = value; pending = value; void rebuildLatest()
      } else if (value.type === 'frame' && current && value.epoch === epoch) {
        current.pose = value.pose; current.selfPlayer = value.selfPlayer; current.motion = value.motion; current.time = value.time; current.packetSequence = value.packetSequence
      } else if (value.type === 'motion' && current && value.epoch === epoch) {
        current.pose = value.pose; current.motion = value.motion; return
      } else return
      onState(value); void ensureSelfActor(current.selfPlayer)
    } catch (error) { fail(error) }
  }
  events.onerror = () => { session.receive({type:'unavailable'}); clearScene(); onUnavailable('NATIVE_WORLD_STREAM_DISCONNECTED') }
}
function orbitPosition () {
  if (!current?.pose) return
  const view = playerCamera(current.pose, 'region')
  controls.target.fromArray(view.target); camera.position.fromArray(view.position); controls.update()
}
function setView (mode) {
  if (!['third', 'first', 'region', 'dungeon'].includes(mode) || disposed) return
  viewMode = mode; cameraDistance = null; cameraCollisionAt = 0
  camera.fov = mode === 'dungeon' ? 48 : 70; camera.updateProjectionMatrix()
  controls.enabled = mode === 'region'; if (controls.enabled) orbitPosition()
  viewport.dataset.view = mode; onMode(mode)
}
function updatePlayerCamera (now) {
  if (viewMode === 'region') { controls.update(); return }
  const view = playerCamera(current.pose, viewMode)
  const target = new THREE.Vector3().fromArray(view.target), desired = new THREE.Vector3().fromArray(view.position)
  if (viewMode === 'third') {
    const direction = desired.clone().sub(target), length = direction.length(); direction.normalize()
    if (now - cameraCollisionAt >= 100 || cameraDistance === null) {
      // Collide only against geometry actually rendered from received blocks.
      // Never reveal an unsupported block with an invented collision mesh.
      statics.updateMatrixWorld(true); cameraRay.set(target, direction); cameraRay.far = length
      const hit = cameraRay.intersectObjects(statics.children, true).find(hit => hit.distance > 0.05)
      cameraDistance = hit ? Math.max(0.1, hit.distance - 0.2) : length; cameraCollisionAt = now
    }
    desired.copy(target).addScaledVector(direction, Math.min(cameraDistance, length))
  } else cameraDistance = null
  camera.position.copy(desired); camera.lookAt(target)
}
async function ensureSelfActor (self) {
  if (!self || self.uuid !== playerUuid || self.skin?.kind !== 'default') {
    if (selfActor) { worldRoot.remove(selfActor.root); selfActor.dispose(); selfActor = null }
    selfActorKey = null; onActor(null)
    skinState = self?.skin?.reason || 'PLAYER_SKIN_PROFILE_UNAVAILABLE'; publishDiagnostics()
    return
  }
  const key = `${self.uuid}:${self.skin.assetPath}`
  if (key === selfActorKey) return
  const run = generation; selfActorKey = key
  try {
    const actor = await createNativePlayerActor(assetReader, { uuid: self.uuid })
    if (run !== generation || selfActorKey !== key) { actor.dispose(); return }
    if (actor.assetInfo.path !== self.skin.assetPath || actor.assetInfo.sha256 !== self.skin.sha256) {
      actor.dispose(); throw Error('NATIVE_PLAYER_SKIN_BINDING_MISMATCH')
    }
    if (selfActor) { worldRoot.remove(selfActor.root); selfActor.dispose() }
    selfActor = actor; worldRoot.add(actor.root)
    skinState = `1.21.1 ${actor.assetInfo.name || self.skin.model}; 已接本人步行动作，装备和完整动画未验收`; onActor(actor); publishDiagnostics()
  } catch (error) {
    if (run === generation) { skinState = error.message; onActor(null); publishDiagnostics() }
  }
}
function publishFrame(now) {
  const p = current?.pose
  let label = { visible: false, x: 0, y: 0, name: player }
  if (p && selfActor?.root.visible && viewMode !== 'first') {
    labelPoint.set(p.x, p.y + 2.1, p.z).project(camera)
    label = { visible: labelPoint.z >= -1 && labelPoint.z <= 1 && Math.abs(labelPoint.x) <= 1 && Math.abs(labelPoint.y) <= 1,
      x: (labelPoint.x + 1) * viewport.clientWidth / 2, y: (1 - labelPoint.y) * viewport.clientHeight / 2, name: player }
  }
  onFrame({ now, pose: p, selfPlayer: current?.selfPlayer, label })
}
function publishDiagnostics() {
  onDiagnostics({ total: current?.groups?.reduce((sum, g) => sum + g.positions.length / 3, 0) || 0,
    drawn: drawn + actors.size, issues: [...unknown], missingColumns: current?.missingColumns?.length || 0,
    kinetics: current?.kinetic?.map(n => n.speed) || [], environment: current?.biomes?.map(b => b.name) || [],
    skinState, bounds: current?.bounds ?? null, coverage: current?.viewCoverage ?? null, completeSceneParityVerified: false })
}
function clearStatics () {
  if (!statics) return
  for (const mesh of statics.children) { mesh.dispose?.(); if (mesh.userData.nativeFluid) mesh.geometry.dispose() } // fluid geometry is per-snapshot; model templates remain shared
  statics.clear()
}
function clearScene () {
  generation++; pending = null; current = null; lastGroupSignature = null; clearStatics()
  for (const actor of actors.values()) removeActor(actor)
  actors.clear()
  if (selfActor) { worldRoot.remove(selfActor.root); selfActor.dispose(); selfActor = null }
  selfActorKey = null; cameraDistance = null; skinState = null; drawn = 0; unknown = []; tickAge = null
  onActor(null); publishDiagnostics()
  camera?.position.set(0, 0, 0)
}
function removeActor (actor) {
  worldRoot.remove(actor.root); loader.releaseModel(actor.root)
}
async function template (state, variants) {
  const key = `${state.stateId}:${JSON.stringify(variants)}`
  if (!templates.has(key)) templates.set(key, (async () => {
    // The exact empty-board entity guard is checked per position before this
    // shared template is used. Other entity-backed blocks remain unsupported.
    if ((state.hasBlockEntity && state.name !== CUTTING_BOARD_ID) || state.renderShape !== 'MODEL') throw Error('原生实体方块渲染未适配')
    const model = await loader.models(variants, { allowTint: true })
    let faces = 0; model.traverse(part => { if (part.isMesh) faces++ })
    if (!faces) throw Error('原生模型无可绘制面')
    model.updateMatrixWorld(true)
    return model
  })())
  return templates.get(key)
}
async function rebuildLatest () {
  if (rebuilding) return
  rebuilding = true
  try {
    while (pending) {
      const snapshot = pending, run = generation; pending = null
      const definitions = new Map(snapshot.states.map(s => [s.stateId, s]))
      const cuttingBoards = new Map((snapshot.cuttingBoards || []).map(board => [pointKey(board.position), board]))
      const signature = JSON.stringify([snapshot.groups, snapshot.neighbors, snapshot.biomeGrid?.ids, snapshot.biomes, snapshot.biomeSeed, snapshot.cuttingBoards])
      const nextIssues = [], existing = new Set()
      for (const node of snapshot.kinetic) {
        const key = pointKey(node.position); existing.add(key)
        if (!Number.isFinite(node.speed)) {
          const stale = actors.get(key)
          if (stale) { removeActor(stale); actors.delete(key) }
          nextIssues.push(`${definitions.get(node.stateId)?.name} @ ${key}：未收到原生转速`); continue
        }
        let actor = actors.get(key)
        if (actor && actor.state.stateId !== node.stateId) { removeActor(actor); actors.delete(key); actor = null }
        if (!actor) {
          actor = await createKineticActor(loader, definitions.get(node.stateId), node.position)
          if (run !== generation) { loader.releaseModel(actor.root); break }
          actors.set(key, actor); worldRoot.add(actor.root)
        }
        actor.setSpeed(node.speed)
      }
      if (run !== generation) continue
      for (const [key, actor] of actors) if (!existing.has(key)) { removeActor(actor); actors.delete(key) }
      if (signature !== lastGroupSignature) {
        const next = new THREE.Group(), tintCache = new Map(); let count = 0
        let workStarted = performance.now()
        for (const group of snapshot.groups) {
          // A larger native volume must leave the controls/HUD responsive.
          // Only scheduling changes; no geometry, state or texture is omitted.
          if (performance.now() - workStarted > 8) {
            await new Promise(resolve => requestAnimationFrame(resolve)); workStarted = performance.now()
            if (run !== generation) break
          }
          const state = definitions.get(group.stateId)
          if (['create:shaft', 'create:hand_crank'].includes(state.name)) continue
          if (state.name === 'minecraft:water') {
            const result = await waterMeshes(snapshot, group, definitions)
            if (run !== generation) { for (const mesh of result.meshes) mesh.geometry.dispose(); break }
            for (const mesh of result.meshes) next.add(mesh)
            count += result.count; nextIssues.push(...result.issues); continue
          }
          if (state.fluid && !state.fluid.empty) nextIssues.push(`${state.name}：${state.fluid.name === 'minecraft:water' || state.fluid.name === 'minecraft:flowing_water' ? '原生含水方块的液体面未适配' : '原生液体渲染提供器未适配'}`)
          try {
            const positions = []
            for (let i = 0; i < group.positions.length; i += 3) {
              const position = { x: group.positions[i], y: group.positions[i + 1], z: group.positions[i + 2] }
              if (state.name === CUTTING_BOARD_ID) {
                const support = cuttingBoardStaticModelStatus(state, cuttingBoards.get(pointKey(position)), loader.reader.manifest)
                if (!support.available) {
                  nextIssues.push(`${state.name} @ ${pointKey(position)}：${support.reason}${support.storedItem ? ` (${support.storedItem.id} × ${support.storedItem.count})` : ''}`)
                  continue
                }
              }
              positions.push(position)
            }
            if (!positions.length) continue
            const blockstate = await loader.blockstate(state.name)
            const subgroups = new Map()
            for (const position of positions) {
              const variants = selectBlockVariants(blockstate, state, position), key = JSON.stringify(variants)
              if (!subgroups.has(key)) subgroups.set(key, { variants, positions: [] })
              subgroups.get(key).positions.push(position.x, position.y, position.z)
            }
            for (const subgroup of subgroups.values()) {
              const model = await template(state, subgroup.variants)
              if (run !== generation) break
              const instanceCount = subgroup.positions.length / 3
              const meshes = []
              try {
                model.traverse(part => {
                  if (!part.isMesh) return
                  const mesh = new THREE.InstancedMesh(part.geometry, part.material, instanceCount)
                  meshes.push(mesh)
                  const matrix = new THREE.Matrix4()
                  for (let i = 0; i < instanceCount; i++) {
                    const p = { x: subgroup.positions[i * 3], y: subgroup.positions[i * 3 + 1], z: subgroup.positions[i * 3 + 2] }, offset = modelOffset(state, p)
                    matrix.makeTranslation(p.x + 0.5 + offset[0], p.y + 0.5 + offset[1], p.z + 0.5 + offset[2]).multiply(part.matrixWorld)
                    mesh.setMatrixAt(i, matrix)
                    if (part.userData.tintIndex >= 0) {
                      const key = `${state.stateId}:${part.userData.tintIndex}:${pointKey(p)}`
                      if (!tintCache.has(key)) tintCache.set(key, new THREE.Color().setHex(blockTint(snapshot, state, p, part.userData.tintIndex, colormaps)))
                      mesh.setColorAt(i, tintCache.get(key))
                    }
                  }
                  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
                })
              } catch (error) { for (const mesh of meshes) mesh.dispose(); throw error }
              for (const mesh of meshes) next.add(mesh)
              count += instanceCount
            }
          } catch (error) { nextIssues.push(`${state.name}：${error.message}`) }
        }
        if (run !== generation) { for (const mesh of next.children) { mesh.dispose?.(); if (mesh.userData.nativeFluid) mesh.geometry.dispose() } continue }
        clearStatics(); for (const mesh of [...next.children]) statics.add(mesh)
        drawn = count; lastGroupSignature = signature; unknown = nextIssues
      } else nextIssues.push(...unknown.filter(x => !x.includes('原生转速')))
      if (run !== generation) continue
      if (!current) continue
      publishDiagnostics()
      if (camera.position.lengthSq() === 0 && viewMode === 'region') orbitPosition()
    }
  } catch (error) { fail(error) } finally { rebuilding = false }
}

async function waterMeshes (snapshot, group, definitions) {
  const neighbors = new Map(), data = new Map(), issues = new Set()
  for (let i = 0; i < (snapshot.neighbors || []).length; i += 4) neighbors.set(`${snapshot.neighbors[i]},${snapshot.neighbors[i + 1]},${snapshot.neighbors[i + 2]}`, definitions.get(snapshot.neighbors[i + 3]))
  const get = p => { const state = neighbors.get(pointKey(p)); if (!state) throw Error('NATIVE_FLUID_NEIGHBOR_NOT_RECEIVED'); return state }
  let count = 0
  for (let i = 0; i < group.positions.length; i += 3) {
    const p = { x: group.positions[i], y: group.positions[i + 1], z: group.positions[i + 2] }
    try {
      const result = waterGeometry(p, get), color = new THREE.Color().setHex(blendedBiomeColor(snapshot, p, 'water', colormaps))
      for (const quad of result.quads) {
        if (!data.has(quad.texture)) data.set(quad.texture, { positions: [], colors: [], uv: [], indices: [] })
        const batch = data.get(quad.texture), base = batch.positions.length / 3
        for (let j = 0; j < 4; j++) {
          batch.positions.push(quad.vertices[j * 3] + p.x, quad.vertices[j * 3 + 1] + p.y, quad.vertices[j * 3 + 2] + p.z)
          batch.colors.push(color.r * quad.shade, color.g * quad.shade, color.b * quad.shade)
          batch.uv.push(quad.uv[j * 2], 1 - quad.uv[j * 2 + 1])
        }
        batch.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
        if (quad.backwards) batch.indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
      }
      count++
    } catch (error) { issues.add(`minecraft:water：${error.message}`) }
  }
  const meshes = []
  try {
    for (const [texture, batch] of data) {
      const material = await loader.fluidMaterial(texture), geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3))
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(batch.colors, 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uv, 2))
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.positions.map((_, i) => i % 3 === 1 ? 1 : 0), 3))
      geometry.setIndex(batch.indices)
      const mesh = new THREE.Mesh(geometry, material); mesh.userData.nativeFluid = true; meshes.push(mesh)
    }
  } catch (error) { for (const mesh of meshes) mesh.geometry.dispose(); throw error }
  return { meshes, count, issues: [...issues] }
}
function fail (error) {
  events?.close(); clearScene(); renderer?.setAnimationLoop(null)
  onUnavailable(error.message)
}
function dispose () {
  if (disposed) return
  disposed = true; events?.close(); observer?.disconnect(); renderer?.setAnimationLoop(null)
  controls?.dispose(); clearScene(); loader?.dispose(); renderer?.dispose(); renderer?.domElement.remove()
}
try { await start(); setView(mode) } catch(error) { dispose(); throw error }
return { setView, dispose, renderer, camera, scene: worldRoot.parent, assetReader,
  get actor() { return selfActor }, get state() { return current } }
}
