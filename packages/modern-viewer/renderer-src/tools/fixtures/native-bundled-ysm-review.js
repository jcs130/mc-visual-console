// Offline synthetic state review of the SAME production actor and dispatcher.
// No transport to a game, no alternate character geometry or animation engine.
import * as THREE from 'three'
import { BundledAppearanceReader } from '../../src/native-viewer/native-bundled-appearance.js'
import { createNativeBundledYsmPlayerActor } from '../../src/native-viewer/native-player-bundled-ysm.js'
import { applyNativeSelfPlayerMotion } from '../../src/native-viewer/native-self-player.js'
const uuid = '01234567-89ab-cdef-0123-456789abcdef'
const metadata = await (await fetch('./catalog.json')).json()
const reader = new BundledAppearanceReader(metadata, async path => (await fetch('./assets/' + path)).arrayBuffer())
const actor = await createNativeBundledYsmPlayerActor(null, { uuid, bundledAppearance: { reader, id: 'bundled:yui-ysm' } })
const scene = new THREE.Scene(); scene.background = new THREE.Color('#dfe8ef'); scene.add(actor.root)
scene.add(new THREE.AmbientLight(0xffffff, 1.1))
const light = new THREE.DirectionalLight(0xffffff, 2.2); light.position.set(35, 70, 15); scene.add(light)
const camera = new THREE.PerspectiveCamera(35, 1, .05, 100); camera.position.set(0, 1.5, 4); camera.lookAt(0, .8, 0)
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.setPixelRatio(1); renderer.setSize(720, 640); document.querySelector('main').append(renderer.domElement)
const status = document.querySelector('output'), selector = document.querySelector('select'), heading = document.querySelector('#heading'), time = document.querySelector('#time')
let start = performance.now(), selected = 'walk', epoch = 1
selector.onchange = () => { selected = selector.value; start = performance.now(); epoch++; frame() }
heading.onchange = () => { epoch++; start = performance.now(); frame() }
function frame() {
  const age = Number(time.value), now = 10000 + age * 1000, yaw = Number(heading.value)
  const self = { uuid, entityId: 42, health: selected === 'death' ? 0 : 20, onGround: !['swim', 'swim_stand', 'jump'].includes(selected),
    inWater: ['swim', 'swim_stand'].includes(selected), sneaking: selected === 'sneak', sprinting: selected === 'run',
    velocity: { x: ['walk', 'run', 'swim', 'sneak'].includes(selected) ? .15 : 0, y: 0, z: 0 },
    handAnimation: { source: 'same_player_vanilla_hand_packets', playerUuid: uuid, entityId: 42, sampledAt: now, mainArm: 'right',
      usingItem: selected === 'use', activeHand: 'mainhand', swing: selected === 'swing' ? { sequence: 1, hand: 'mainhand', startedAt: 10000 } : null } }
  const current = { epoch, pose: { x: 0, y: 0, z: 0, yaw, pitch: 0 }, selfPlayer: { uuid, entityId: 42 },
    motion: { schemaVersion: 1, source: 'same_player_physics_tick', tickMs: 50, epoch, tick: Math.floor(now / 50), sampledAt: now },
    presentation: { available: true, source: 'same_player_connection', playerUuid: uuid, sampledAt: now, self } }
  actor.applyPose(current.pose)
  // Prime at t=0 on each selection, so slider age is deterministic even death.
  if(frame.epoch !== epoch) {
    const baseline = structuredClone(current); baseline.presentation.sampledAt = baseline.motion.sampledAt = 10000
    actor.applyMotion({ current: baseline, now: 10000 }); frame.epoch = epoch
  }
  const state = applyNativeSelfPlayerMotion(actor, current, { now })
  status.textContent = JSON.stringify({ synthetic: true, clip: state.clip, source: state.source, reason: state.reason,
    originalModel: actor.assetInfo.modelId, originalHashes: actor.assetInfo.sourceHashes, bones: actor.assetInfo.boneCount, draws: 35, triangles: 2016,
    missingInputs: state.missingInputs, equipmentReason: state.equipmentReason, parityVerified: false }, null, 2)
  renderer.render(scene, camera)
}
time.oninput = () => { epoch++; frame() }; frame()
document.querySelector('#play').onclick = () => { document.querySelector('#play').dataset.play = document.querySelector('#play').dataset.play === 'yes' ? 'no' : 'yes'; start = performance.now() - Number(time.value) * 1000 }
renderer.setAnimationLoop(() => { if(document.querySelector('#play').dataset.play === 'yes'){time.value = Math.min(5, (performance.now() - start) / 1000); frame()} })
window.addEventListener('pagehide', () => { actor.dispose(); renderer.dispose() }, { once: true })
