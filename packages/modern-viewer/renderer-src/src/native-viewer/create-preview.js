import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { NativeAssetReader, NativeModelLoader } from './model-loader.js'
import { createKineticActor } from './create-kinetics.js'

const element = id => document.getElementById(id)
let renderer, loader
async function start () {
  const [manifest, capture] = await Promise.all(['/manifest.json', '/capture.json'].map(async url => {
    const response = await fetch(url)
    if (!response.ok) throw Error(`NATIVE_INPUT_UNAVAILABLE:${response.status}`)
    return response.json()
  }))
  if (capture.errors?.length || capture.registrySha256 !== manifest.registryHashes['block-states.jsonl'] || capture.mode !== 'recorded_same_player_connection') throw Error('NATIVE_CAPTURE_INVALID')
  const reader = new NativeAssetReader(manifest, async path => {
    const response = await fetch(`/${path}`)
    if (!response.ok) throw Error(`NATIVE_ASSET_UNAVAILABLE:${path}`)
    return response.arrayBuffer()
  })
  loader = new NativeModelLoader(reader)
  const actors = new Map()
  for (const node of capture.nodes) actors.set(`${node.position.x},${node.position.y},${node.position.z}`, await createKineticActor(loader, node.state, node.position))
  if (!actors.size) throw Error('NATIVE_CREATE_NODES_MISSING')
  const first = Math.min(...capture.updates.map(u => u.atMs))
  const updates = capture.updates.map(u => ({ ...u, atMs: u.atMs - first })).sort((a, b) => a.atMs - b.atMs)
  const duration = capture.durationMs - first
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120000) throw Error('NATIVE_CAPTURE_DURATION_INVALID')
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#111820')
  const center = new THREE.Vector3()
  for (const actor of actors.values()) { scene.add(actor.root); center.add(actor.root.position) }
  center.divideScalar(actors.size)
  const ambient = new THREE.AmbientLight(0xffffff, 1.3)
  const light = new THREE.DirectionalLight(0xffffff, 2.4)
  light.position.copy(center).add(new THREE.Vector3(3, 6, 4))
  scene.add(ambient, light)
  const camera = new THREE.PerspectiveCamera(43, 1, 0.05, 80)
  camera.position.copy(center).add(new THREE.Vector3(3.2, 2.6, 4.0))
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.domElement.setAttribute('aria-label', 'Create 曲柄和传动轴的原始模型')
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  element('viewport').append(renderer.domElement)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(center); controls.enableDamping = true; controls.minDistance = 1.4; controls.maxDistance = 12; controls.update()
  const resize = () => {
    const host = element('viewport')
    renderer.setSize(host.clientWidth, host.clientHeight)
    camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize); observer.observe(element('viewport')); resize()
  let elapsed = 0, cursor = 0, ticks = 0, last = performance.now(), frames = 0, playing = true, visibleAt = 0
  const applyThrough = ms => {
    while (cursor < updates.length && updates[cursor].atMs <= ms) {
      const update = updates[cursor++]
      const actor = actors.get(update.key)
      if (!actor) throw Error('NATIVE_CREATE_UPDATE_IDENTITY_INVALID')
      actor.setSpeed(update.speed)
    }
  }
  const reset = () => {
    cursor = 0; ticks = 0; elapsed = 0
    for (const [key, actor] of actors) { actor.reset(); actor.setSpeed(capture.nodes.find(n => `${n.position.x},${n.position.y},${n.position.z}` === key).initialSpeed) }
    applyThrough(0)
  }
  const advance = ms => {
    while ((ticks + 1) * 50 <= ms) {
      applyThrough((ticks + 1) * 50)
      for (const actor of actors.values()) actor.tick()
      ticks++
    }
    applyThrough(ms)
    for (const actor of actors.values()) actor.frame(ms / 50, ms / 50 - ticks)
  }
  const seek = time => { reset(); elapsed = Math.max(0, Math.min(duration, time)); advance(elapsed); last = performance.now() }
  const positive = updates.find(u => u.speed > 0)
  const negative = updates.find(u => u.speed < 0)
  const stop = [...updates].reverse().find(u => u.speed === 0)
  element('positive').onclick = () => seek(positive.atMs + 150)
  element('negative').onclick = () => seek(negative.atMs + 150)
  element('stopped').onclick = () => seek(stop.atMs + 300)
  element('pause').onclick = () => { playing = !playing; element('pause').textContent = playing ? '暂停' : '继续' }
  element('restart').onclick = () => { playing = true; element('pause').textContent = '暂停'; seek(0) }
  for (const id of ['positive', 'negative', 'stopped', 'pause', 'restart']) element(id).disabled = false
  element('status').textContent = '原始资源核对通过 · 动画由实测状态驱动'
  const faceCount = [...actors.values()].reduce((sum, actor) => { actor.root.traverse(o => { if (o.isMesh) sum++ }); return sum }, 0)
  element('source').textContent = `当前 ${actors.size} 件真实方块、${faceCount} 个原始模型面。转速包含正转、反转和停止；握柄保留原生减速插值。`
  reset()
  renderer.setAnimationLoop(now => {
    try {
      const delta = Math.max(0, now - last); last = now
      if (playing) elapsed += delta
      if (elapsed > duration) seek(0)
      advance(elapsed); controls.update(); renderer.render(scene, camera); frames++
      if (now - visibleAt > 120) {
        visibleAt = now
        for (const [key, actor] of actors) {
          const latest = [...updates.slice(0, cursor)].reverse().find(u => u.key === key)
          element(actor.state.name === 'create:shaft' ? 'shaft-speed' : 'crank-speed').textContent = `${latest?.speed ?? capture.nodes.find(n => `${n.position.x},${n.position.y},${n.position.z}` === key).initialSpeed} RPM`
          if (actor.motion) element('handle-angle').textContent = `${((actor.motion.radians(elapsed / 50 - ticks) * 180 / Math.PI) % 360).toFixed(1)}°`
        }
        element('frames').textContent = String(frames)
        element('progress').textContent = `实测记录 ${(elapsed / 1000).toFixed(1)} / ${(duration / 1000).toFixed(1)} 秒`
      }
    } catch (error) { fail(error) }
  })
  addEventListener('pagehide', () => { renderer.setAnimationLoop(null); observer.disconnect(); controls.dispose(); loader.dispose(); renderer.dispose() }, { once: true })
}
function fail (error) {
  renderer?.setAnimationLoop(null)
  if (renderer) { renderer.domElement.remove(); renderer.dispose() }
  loader?.dispose()
  element('status').textContent = '原生模型画面不可用'
  element('error').textContent = error.message
  for (const id of ['positive', 'negative', 'stopped', 'pause', 'restart']) element(id).disabled = true
}
start().catch(fail)
