import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { createNativeTransitionTiming } from '../../src/native-viewer/native-transition-timing.js'
import { NativeSelfDisplayPose, NativeFrameGaps, writeChanged } from '../../src/native-viewer/native-display-performance.js'
import { createNativeRoomVisibility } from '../../src/native-viewer/native-room-visibility.js'
import { nativeCameraTarget, nativeCameraCollisionDistance } from '../../src/native-viewer/native-camera.js'
import { normalizeCameraSettings } from '../../src/modern-viewer/camera-preferences.js'
import { playerCamera } from '../../src/native-viewer/player-camera.js'
import { NativeKineticRenderClock, nativeKineticTimeStatus } from '../../src/native-viewer/native-millstone.js'

test('production world RAF and camera callbacks measure real camera rays/room masks, keeping CPU draw and preceding gap separate', async () => {
  globalThis.DOMRect ??= class DOMRect { constructor(x=0,y=0,width=0,height=0) { Object.assign(this,{x,y,width,height}) } }
  const cameraBuild = await build({ entryPoints: [fileURLToPath(new URL('../../src/modern-viewer/camera-director.js', import.meta.url))],
    bundle: true, platform: 'node', format: 'esm', write: false })
  const { CameraDirector } = await import('data:text/javascript;base64,' + Buffer.from(cameraBuild.outputFiles[0].contents).toString('base64'))
  const source = await readFile(new URL('../../src/native-viewer/native-scene.js', import.meta.url), 'utf8')
  // Execute the owning production callbacks verbatim. Only GPU submission, empty
  // entity/audio/texture services and the browser scheduler are substituted.
  const loop = source.slice(source.indexOf('  renderer.setAnimationLoop(now => {'), source.indexOf('  events = createNativeEventStream'))
  const cameraCallback = source.slice(source.indexOf('function updatePlayerCamera (now)'), source.indexOf('function rememberPointer'))
  assert.ok(loop.startsWith('  renderer.setAnimationLoop')); assert.ok(cameraCallback.startsWith('function updatePlayerCamera'))
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 1, .05, 150), roomVisibility = createNativeRoomVisibility()
  const floor = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 16), new THREE.MeshBasicMaterial()); floor.position.set(7.5, 63.5, 7.5); scene.add(floor)
  const positions = []; for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) positions.push(x, 63, z)
  const current = { revision: 1, epoch: 1, pose: { x: 8, y: 64, z: 8, yaw: 0, pitch: 0 }, selfPlayer: { uuid: 'synthetic', entityId: 7 },
    bounds: { minX: 0, maxX: 15, minY: 60, maxY: 80, minZ: 0, maxZ: 15 },
    viewCoverage: { receivedColumns: ['0,0'] }, states: [{ stateId: 1, solid: true, blocksMotion: true }], groups: [{ stateId: 1, positions }] }
  roomVisibility.attach(scene); roomVisibility.stage(current)
  let clock = 10, renderCalls = 0, rays = 0, callback
  const viewport = { dataset: {} }, document = { hidden: false, addEventListener() {}, removeEventListener() {} }
  const timing = createNativeTransitionTiming({ viewport, document, now: () => clock,
    context: () => ({ view: scope.viewMode, snapshotRevision: current.revision, terrainRequested: 1, terrainCommitted: 1 }) })
  const scope = { THREE, document, performance: { now: () => ++clock }, disposed: false, transitionTiming: timing,
    frameGaps: new NativeFrameGaps(), selfDisplay: new NativeSelfDisplayPose(), current, displayPose: null, loader: { animateTextures() {} },
    lastPlayerFrameTime: null, selfActor: null, entityLayer: { frame() {}, data: new Map() }, camera, scene,
    audio: { frame() {}, observation() {} }, particles: { frame() {} }, roomVisibility, roomStatus: null,
    observerPose: null, observerTarget: null, viewMode: 'third', sceneOptions: { occlusion: true },
    selectedEntity: null, controls: { update() {} }, director: new CameraDirector(), cameraOptions: { ...normalizeCameraSettings(null), mode: 'follow' },
    cameraDistance: null, cameraFrame: null, lastCollision: null, dungeonCamera: { yaw: 0, pitch: -.8, distance: 8 },
    nativeCameraTarget, nativeCameraCollisionDistance, playerCamera,
    terrainRaycast(ray) { rays++; scene.updateMatrixWorld(true); return ray.intersectObject(scene, true) },
    nativeKineticTimeStatus, kineticClock: new NativeKineticRenderClock(), kineticClockState: {}, actors: new Map(), tickAge: null,
    textureStart: 0, firstTerrainRender: false, miniMap: { render: () => false, root: { dataset: {} } },
    agentVisual: { snapshot: () => null }, playerUuid: null, epoch: 1, lastCostAt: 0,
    publishFrame() {}, publishDiagnostics() {}, writeChanged, fail(error) { throw error },
    renderer: { domElement: { dataset: {} }, info: { render: { calls: 1, triangles: 12 } },
      setAnimationLoop(fn) { callback = fn }, render(actualScene, actualCamera) {
        assert.equal(actualScene, scene); assert.equal(actualCamera, camera); assert.ok(Number.isFinite(camera.position.x)); renderCalls++; clock += 9
      } } }
  // A mutable lexical scope also preserves the real callback's between-frame caches.
  new Function('scope', `with (scope) { ${cameraCallback}\n${loop} }`)(scope)
  const third = timing.begin('mode', 'click', 'third'); callback(100)
  assert.ok(rays >= 7); assert.equal(renderCalls, 1)
  scope.viewMode = '3dview'; const room = timing.begin('mode', 'click', '3dview'); callback(170)
  const value = JSON.parse(viewport.dataset.transitionTiming), slow = value.slowWorldFrames.at(-1)
  assert.equal(value.transitions.find(row => row.sequence === third.sequence).world.cameraMs, 1)
  assert.equal(value.transitions.find(row => row.sequence === room.sequence).world.roomMs, 1)
  assert.equal(slow.gapMs, 70); assert.equal(slow.mainCpuDrawMs, 10); assert.equal(slow.precedingWorld.mainCpuDrawMs, 10)
  assert.equal(scope.roomStatus.reason, 'received_room'); assert.ok(scope.roomStatus.openCells > 0)
  assert.equal(renderCalls, 2); scope.director.dispose(); roomVisibility.dispose(); timing.dispose(); floor.geometry.dispose(); floor.material.dispose()
})
