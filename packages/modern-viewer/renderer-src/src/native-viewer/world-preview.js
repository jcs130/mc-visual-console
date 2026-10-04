import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { NativeAssetReader, NativeModelLoader, selectBlockVariants, resourcePath } from './model-loader.js'
import { createKineticActor } from './create-kinetics.js'
import { blockTint, blendedBiomeColor, modelOffset } from './native-environment.js'
import { waterGeometry } from './native-fluid.js'

const el = id => document.getElementById(id)
const pointKey = p => `${p.x},${p.y},${p.z}`
let renderer, loader, events, current, pending = null, rebuilding = false, epoch = null, player = null, generation = 0
const templates = new Map(), actors = new Map()
let statics, worldRoot, camera, controls, following = false, lastGroupSignature = null, unknown = [], drawn = 0, tickAge = null
let colormaps, textureStart = performance.now()

async function start () {
  const response = await fetch('/manifest.json')
  if (!response.ok) throw Error('NATIVE_WORLD_MANIFEST_UNAVAILABLE')
  const manifest = await response.json()
  const reader = new NativeAssetReader(manifest, async path => {
    const result = await fetch(`/${path}`)
    if (!result.ok) throw Error(`NATIVE_ASSET_UNAVAILABLE:${path}`)
    return result.arrayBuffer()
  })
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
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.domElement.setAttribute('aria-label', '实时原生区块与 Create 动力画面')
  el('viewport').append(renderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxDistance = 50
  const resize = () => { const host = el('viewport'); renderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix() }
  const observer = new ResizeObserver(resize); observer.observe(el('viewport')); resize()
  el('orbit').onclick = () => { following = false; controls.enabled = true; orbitPosition() }
  el('follow').onclick = () => { following = true; controls.enabled = false }
  renderer.setAnimationLoop(now => {
    try {
      loader.animateTextures((now - textureStart) / 50)
      if (current?.pose) {
        if (following) {
          const p = current.pose
          camera.position.set(p.x, p.y + p.eyeHeight, p.z)
          camera.quaternion.setFromEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'))
        } else controls.update()
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
    } catch (error) { fail(error) }
  })
  events = new EventSource('/events')
  events.onmessage = message => {
    try {
      const value = JSON.parse(message.data)
      if (value.type === 'identity') {
        if (value.registrySha256 !== manifest.registryHashes['block-states.jsonl'] || value.mode !== 'live_same_player_connection') throw Error('NATIVE_WORLD_IDENTITY_MISMATCH')
        player = value.player; el('player').textContent = player; return
      }
      if (value.type === 'unavailable') { clearScene(); el('status').textContent = '原生连接不可用'; el('error').textContent = value.reason; return }
      if (value.type === 'waiting') {
        if (epoch !== value.epoch) { clearScene(); epoch = value.epoch; tickAge = null }
        el('status').textContent = '等待玩家与区块'; return
      }
      if (!player) throw Error('NATIVE_WORLD_IDENTITY_MISSING')
      if (value.type === 'snapshot') {
        if (value.registrySha256 !== manifest.registryHashes['block-states.jsonl'] || value.mode !== 'live_same_player_connection') throw Error('NATIVE_WORLD_SNAPSHOT_MISMATCH')
        if (epoch !== value.epoch) { clearScene(); epoch = value.epoch; tickAge = null }
        current = value; pending = value; void rebuildLatest()
      } else if (value.type === 'frame' && current && value.epoch === epoch) { current.pose = value.pose; current.time = value.time; current.packetSequence = value.packetSequence }
      if (current) {
        const p = current.pose
        el('position').textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`
        el('sequence').textContent = String(current.packetSequence)
        el('clock').textContent = current.time ? `${current.time.age} tick` : '时钟未同步（动画暂停）'
      }
    } catch (error) { fail(error) }
  }
  events.onerror = () => { clearScene(); el('status').textContent = '世界流已断开，等待重新连接'; for (const button of [el('orbit'), el('follow')]) button.disabled = true }
  addEventListener('pagehide', () => { events.close(); observer.disconnect(); controls.dispose(); clearScene(); loader.dispose(); renderer.dispose() }, { once: true })
}
function orbitPosition () {
  if (!current?.pose) return
  const p = current.pose
  controls.target.set(p.x - 2, p.y + 1, p.z + 1)
  camera.position.set(p.x + 10, p.y + 12, p.z + 14); controls.update()
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
  drawn = 0; unknown = []; tickAge = null
  for (const id of ['blocks', 'drawn', 'sequence']) el(id).textContent = '0'
  for (const id of ['position', 'kinetics', 'clock', 'environment']) el(id).textContent = '等待新状态'
  el('coverage').textContent = '等待新区域状态'; el('issues').replaceChildren()
  for (const button of [el('orbit'), el('follow')]) button.disabled = true
  camera?.position.set(0, 0, 0)
}
function removeActor (actor) {
  worldRoot.remove(actor.root); loader.releaseModel(actor.root)
}
async function template (state, variants) {
  const key = `${state.stateId}:${JSON.stringify(variants)}`
  if (!templates.has(key)) templates.set(key, (async () => {
    if (state.hasBlockEntity || state.renderShape !== 'MODEL') throw Error('原生实体方块渲染未适配')
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
      const signature = JSON.stringify([snapshot.groups, snapshot.neighbors, snapshot.biomeGrid?.ids, snapshot.biomes, snapshot.biomeSeed])
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
        for (const group of snapshot.groups) {
          const state = definitions.get(group.stateId)
          if (['create:shaft', 'create:hand_crank'].includes(state.name)) continue
          if (state.name === 'minecraft:water') {
            const result = await waterMeshes(snapshot, group, definitions)
            if (run !== generation) { for (const mesh of result.meshes) mesh.geometry.dispose(); break }
            next.add(...result.meshes); count += result.count; nextIssues.push(...result.issues); continue
          }
          if (state.fluid && !state.fluid.empty) nextIssues.push(`${state.name}：${state.fluid.name === 'minecraft:water' || state.fluid.name === 'minecraft:flowing_water' ? '原生含水方块的液体面未适配' : '原生液体渲染提供器未适配'}`)
          try {
            const blockstate = await loader.blockstate(state.name)
            const subgroups = new Map()
            for (let i = 0; i < group.positions.length; i += 3) {
              const position = { x: group.positions[i], y: group.positions[i + 1], z: group.positions[i + 2] }
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
              next.add(...meshes)
              count += instanceCount
            }
          } catch (error) { nextIssues.push(`${state.name}：${error.message}`) }
        }
        if (run !== generation) { for (const mesh of next.children) { mesh.dispose?.(); if (mesh.userData.nativeFluid) mesh.geometry.dispose() } continue }
        clearStatics(); statics.add(...[...next.children]); drawn = count; lastGroupSignature = signature; unknown = nextIssues
      } else nextIssues.push(...unknown.filter(x => !x.includes('原生转速')))
      if (run !== generation) continue
      if (!current) continue
      const total = snapshot.groups.reduce((sum, g) => sum + g.positions.length / 3, 0)
      el('blocks').textContent = String(total)
      el('drawn').textContent = String(drawn + actors.size)
      el('kinetics').textContent = snapshot.kinetic.map(n => `${n.speed ?? '?'} RPM`).join(' / ') || '区域内无已适配机械'
      el('environment').textContent = `${snapshot.biomes?.map(b => b.name).join(' / ') || '群系未收到'} · 染色混合半径 2`
      el('coverage').textContent = `${nextIssues.length} 项模型/材质缺口，${snapshot.missingColumns.length} 个区块未收到；实体和光照尚未验收。`
      el('issues').replaceChildren(...nextIssues.slice(0, 12).map(text => { const li = document.createElement('li'); li.textContent = text; return li }))
      el('status').textContent = '实时状态已接入 · 画面适配进行中'
      el('error').textContent = ''; el('orbit').disabled = false; el('follow').disabled = false
      if (camera.position.lengthSq() === 0) orbitPosition()
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
  el('status').textContent = '原生世界画面不可用'; el('error').textContent = error.message
}
start().catch(fail)
