import { NativeSelfDisplayPose, NativeFrameGaps, writeChanged } from './native-display-performance.js'
import * as THREE from 'three'
import { nativeViewerUrl } from './native-url.js'
import {createNativeAudio} from './native-audio.js'
import {NativeParticleLayer} from './native-particles.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { NativeAssetReader, NativeModelLoader, selectBlockVariants, resourcePath } from './model-loader.js'
import { createKineticActor } from './create-kinetics.js'
import { WINDMILL_BEARING_ID, verifyNativeWindmillBearing } from './native-windmill-bearing.js'
import { createNativeEnvironment, modelOffset } from './native-environment.js'
import { nativeFluidFamily } from './native-fluid.js'
import { buildNativeFluidMeshes, createNativeFluidStateReader } from './native-fluid-meshes.js'
import { NativeTerrainQueue, createNativeRebuildWork, NativeStaticStage, disposeNativeStaticMeshes, isNativeRebuildRetired, nativeStaticSignature } from './native-rebuild-work.js'
import { CUTTING_BOARD_ID, cuttingBoardStaticModelStatus } from './cutting-board.js'
import { NativeSelfPlayerController, applyNativeSelfPlayerMotion } from './native-self-player.js'
import {BundledAppearanceReader} from './native-bundled-appearance.js'
import { playerCamera } from './player-camera.js'
import { createNativeSession } from './native-session.js'
import { createNativeBedTemplate, nativeBedState } from './native-bed.js'
import { NativeEntityLayer } from './native-entity-layer.js'
import {loadOriginalModelLayers,ORIGINAL_MODEL_LAYERS_PATH,originalBlockModelContract} from './native-original-model-layers.js'
import { MILLSTONE_ID, prepareNativeMillstoneModel, NativeKineticRenderClock, nativeKineticTimeStatus } from './native-millstone.js'
import { stageNativeKineticActors } from './native-kinetic-layer.js'
import { nativeColonyHutEligible, prepareNativeColonyHutModel } from './native-colony-huts.js'
import { installAgentVisualization } from '../modern-viewer/agent-visual-overlay.js'
import { createAgentWorldProjector } from '../modern-viewer/agent-visual-projection.js'
import { createNativeMiniMap } from './native-mini-map.js'
import { normalizeCameraSettings } from '../modern-viewer/camera-preferences.js'
import { NativeOrbitCameraAnchor, nativeCameraTarget, nativeCameraCollisionDistance } from './native-camera.js'
import { createNativeTerrainRaycast } from './native-terrain-raycast.js'
import { pickEntity } from '../modern-viewer/entity-picker.js'
import { createNativeRoomVisibility } from './native-room-visibility.js'
import { nativeStaticBatches, nativeInstanceTints } from './native-static-batch.js'
import { createNativeAssetCache } from './native-asset-cache.js'
import { nativeFaceVisibility } from './native-face-visibility.js'

// Shared exact-resource scene used by the full console and diagnostic preview.
// UI, network presentation and quality policy belong to the console, not this backend.
export async function mountNativeWorld({viewport, transitionTiming, mode='third', onIdentity=()=>{}, onState=()=>{},onBuild=()=>false,
  onUnavailable=()=>{}, onDiagnostics=()=>{}, onActor=()=>{}, onFrame=()=>{}, onMode=()=>{},cameraSettings,onCameraManual=()=>{},onSelection=()=>{},
  defaultAppearance='server', selectionStorage, selectionScope} = {}) {
if (!viewport?.append || !['third', 'first', 'region', '3dview'].includes(mode)) throw Error('NATIVE_SCENE_OPTIONS_INVALID')
const pointKey = p => `${p.x},${p.y},${p.z}`
let renderer, loader, events, current, epoch = null, player = null, generation = 0
const templates = new Map(), actors = new Map(), bedTemplates = new Set()
const staticBatches=new Map()
let statics, worldRoot, camera, firstPersonScene, firstPersonCamera, controls, viewMode = mode, lastGroupSignature = null, unknown = [], staticIssues = [], drawn = 0, tickAge = null
let colormaps, originalModelLayers=null, vanillaRegistry=false, textureStart = performance.now()
let disposed = false, skinState = null, observer, assetReader, playerUuid, selfActor = null, selfController, cameraCollisionAt = 0, cameraDistance = null, entityLayer
let lastPlayerFrameTime = null, selfMotionState = null, selfMotionSignature = null, miniMap,audio,particles
let director, cameraOptions=normalizeCameraSettings(cameraSettings??{version:1,mode:'follow'}),cameraFrame=null
let terrainRaycast=()=>[],selectedEntity=null,pointerStart=null,lastCollision=null
const roomVisibility=createNativeRoomVisibility()
const orbitAnchor=new NativeOrbitCameraAnchor()
let roomStatus=null,sceneOptions={occlusion:true},dungeonCamera={yaw:Math.PI*.75,pitch:-.82,distance:16}
let observerPose=null,observerTarget=null
let frameCost=null,lastCostAt=0,displayPose=null
const terrainQueue=new NativeTerrainQueue(),terrainPhases={signatureMs:0,environmentMs:0,commitMs:0,indexMs:0,firstRenderMs:null}
let firstTerrainRender=false
const selfDisplay=new NativeSelfDisplayPose(),frameGaps=new NativeFrameGaps()
const receiveDisplay=()=>{
  const previous=selfDisplay.resetVersion
  const self=current?.presentation?.self,pose=current?.pose
  selfDisplay.receive(pose?{...pose,bodyYaw:pose.bodyYaw??self?.bodyYaw,headYaw:pose.headYaw??self?.headYaw}:pose,performance.now(),`${epoch}:${playerUuid}:${current?.selfPlayer?.entityId}:${current?.selfPlayer?.health===0}`,current?.motion)
  if(previous!==selfDisplay.resetVersion){director?.reset();cameraDistance=null;lastCollision=null}
}
const visualListeners = new Map()
let lastInventoryOperation = null, frameEntitiesData = null, frameEntitiesCount = -1, frameEntities = []
const visualPort = { on(event, callback) { if (!visualListeners.has(event)) visualListeners.set(event, new Set()); visualListeners.get(event).add(callback) },
  off(event, callback) { visualListeners.get(event)?.delete(callback) },
  emit(event, value) { for (const callback of visualListeners.get(event) || []) callback(value) } }
const agentVisual = installAgentVisualization({ socket: visualPort, document, window,
  position: () => current?.pose,
  project: createAgentWorldProjector(() => ({ camera }), () => ({ width: window.innerWidth, height: window.innerHeight })) })
const labelPoint = new THREE.Vector3()
const kineticClock = new NativeKineticRenderClock()
let kineticClockState = { available: false, reason: 'NATIVE_KINETIC_NATIVE_TIME_UNAVAILABLE' }
const kineticVisibility = () => {
  if (disposed) return
  frameGaps.resetWindow();if(renderer)renderer.domElement.dataset.frameGaps="null";selfDisplay.reset();displayPose=null
  if (document.hidden) {
    lastPlayerFrameTime = null
    kineticClock.pause(performance.now()); kineticClockState = { available: false, reason: 'NATIVE_KINETIC_RENDER_CLOCK_PAUSED' }
    for (const actor of actors.values()) actor.setClockAvailable?.(false, kineticClockState.reason)
  } else kineticClock.resume(performance.now())
  publishDiagnostics()
}
document.addEventListener('visibilitychange', kineticVisibility)
async function start () {
  const response = await fetch(nativeViewerUrl('manifest.json'))
  if (!response.ok) throw Error('NATIVE_WORLD_MANIFEST_UNAVAILABLE')
  const manifest = await response.json()
  const cachedAsset = createNativeAssetCache()
  const reader = new NativeAssetReader(manifest, async path => {
    return cachedAsset(path, manifest.assets[path], async () => {
      const result = await fetch(nativeViewerUrl(path))
      if (!result.ok) throw Error(`NATIVE_ASSET_UNAVAILABLE:${path}`)
      return result.arrayBuffer()
    })
  })
  assetReader = reader
  if(manifest.assets[ORIGINAL_MODEL_LAYERS_PATH])originalModelLayers=await loadOriginalModelLayers(reader)
  vanillaRegistry=manifest.registryHashes['block-states.jsonl']==='55893d269459e1e05387903c77b2db877d7cece875ed31a5a6a2f965822ea546'
  audio=createNativeAudio({onChange:publishDiagnostics});void audio.load()
  const session = createNativeSession(manifest.registryHashes['block-states.jsonl'], { entityRegistrySha256: manifest.registryHashes['entities.tsv'] ?? null })
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
  roomVisibility.attach(worldRoot)
  const bundledAppearanceReader=await BundledAppearanceReader.load(nativeViewerUrl('api/bundled-appearances'))
  if(selectionStorage===undefined){try{selectionStorage=window.localStorage}catch{selectionStorage=null}}
  selfController = new NativeSelfPlayerController(reader, { bundledAppearanceReader, defaultAppearance, selectionStorage,
    selectionScope: selectionScope ?? nativeViewerUrl('manifest.json'), onChange (actor, status) {
    selfActor = actor; skinState = status
    selfMotionState = null; selfMotionSignature = null; lastPlayerFrameTime = null
    if (actor) {
      worldRoot.add(actor.root)
      if (actor.firstPersonRoot) firstPersonScene.add(actor.firstPersonRoot)
      actor.setFirstPersonViewport?.(firstPersonCamera)
    }
    onActor(actor, status); publishDiagnostics()
  } })
  entityLayer = new NativeEntityLayer(reader,{onChange:publishDiagnostics});worldRoot.add(entityLayer.root)
  particles=new NativeParticleLayer(reader,{onChange:publishDiagnostics});worldRoot.add(particles.root)
  scene.add(new THREE.AmbientLight(0xffffff, 1.1))
  const light = new THREE.DirectionalLight(0xffffff, 2.2); light.position.set(35, 70, 15); scene.add(light)
  camera = new THREE.PerspectiveCamera(70, 1, 0.05, 150)
  firstPersonScene=new THREE.Scene();firstPersonCamera=new THREE.PerspectiveCamera(70,1,0.05,150)
  firstPersonScene.add(new THREE.AmbientLight(0xffffff,1.1))
  const handLight=new THREE.DirectionalLight(0xffffff,2.2);handLight.position.set(35,70,15);firstPersonScene.add(handLight)
  renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.domElement.setAttribute('aria-label', 'Agent 本人及实时原生世界画面')
  viewport.append(renderer.domElement)
  miniMap = createNativeMiniMap({document,renderer,scene})
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxDistance = 9; controls.enabled = false
  const {CameraDirector}=await import('../modern-viewer/camera-director.js')
  director=new CameraDirector()
  renderer.domElement.addEventListener('pointerdown',beginCameraPointer,true)
  renderer.domElement.addEventListener('pointermove',dragCameraPointer,true)
  renderer.domElement.addEventListener('wheel',manualCameraInput,true)
  renderer.domElement.addEventListener('pointerup',selectPointer)
  const resize = () => {
    const host = viewport
    frameGaps.resetWindow();renderer.domElement.dataset.frameGaps="null"
    renderer.setSize(host.clientWidth, host.clientHeight)
    camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix()
    firstPersonCamera.aspect = camera.aspect; firstPersonCamera.updateProjectionMatrix()
    selfActor?.setFirstPersonViewport?.(firstPersonCamera)
  }
  observer = new ResizeObserver(resize); observer.observe(viewport); resize()
  renderer.setAnimationLoop(now => {
    try {
      if (disposed || document.hidden) return
      const frameStarted=performance.now(), timingFrame=transitionTiming?.worldStart(now)
      let cameraMs=0,roomMs=0
      const gapStats=frameGaps.frame(now)
      if(gapStats)renderer.domElement.dataset.frameGaps=JSON.stringify(gapStats)
      displayPose=selfDisplay.sample(now)??current?.pose
      loader.animateTextures((now - textureStart) / 50)
      if (current?.pose) {
        const dt = lastPlayerFrameTime === null ? 0 : (now - lastPlayerFrameTime) / 1000
        lastPlayerFrameTime = now
        if (selfActor) {
          selfActor.applyPose(displayPose)
          selfMotionState = applyNativeSelfPlayerMotion(selfActor, current, { dt, now: Date.now(), displayPose })
          if (selfActor.assetInfo?.kind === 'ysm') {
            const signature = JSON.stringify([selfMotionState?.available, selfMotionState?.reason, selfMotionState?.clip, selfMotionState?.selectedNativeState,
              selfMotionState?.state, selfMotionState?.mode, selfMotionState?.notice])
            if (signature !== selfMotionSignature) { selfMotionSignature = signature; publishDiagnostics() }
          }
        }
        entityLayer.frame(Date.now(),current?.motion,current?.selfPlayer?.entityId===undefined?null:{...current.selfPlayer,position:current.pose},camera)
        const cameraStarted=timingFrame?performance.now():0
        updatePlayerCamera(now)
        cameraMs=timingFrame?performance.now()-cameraStarted:0
        audio.frame(camera,entityLayer.data,current?.selfPlayer?{...current.selfPlayer,position:current.pose}:null)
        audio.observation(current)
        particles.frame(Date.now(),current?.motion,camera,current)
        const roomStarted=timingFrame?performance.now():0
        roomStatus=roomVisibility.update({camera,pose:observerPose??current.pose,height:observerTarget?.height??1.8,mode:viewMode,enabled:sceneOptions.occlusion,raycast:terrainRaycast,now})
        roomMs=timingFrame?performance.now()-roomStarted:0
        if(selfActor)selfActor.root.visible=viewMode!=='first'&&(cameraDistance===null||cameraDistance>.9||selectedEntity!==null)
        // Create's AnimationTickHolder uses a CLIENT clock. Native server time
        // is a freshness guard, never substituted for its absolute phase.
        const timeStatus = nativeKineticTimeStatus(current.time, Date.now(), { paused: document.hidden })
        const clockNow = performance.now() // Never mix RAF's earlier timestamp with visibility-event timestamps.
        const oldReason = kineticClockState.reason
        if (!timeStatus.available) {
          kineticClock.pause(clockNow); kineticClockState = timeStatus
          for (const actor of actors.values()) actor.setClockAvailable?.(false, timeStatus.reason)
        } else {
          kineticClock.resume(clockNow)
          const clock = kineticClock.sample(clockNow), whole = clock.elapsedTicks
          kineticClockState = { available: true, ...clock }
          if (tickAge === null || whole < tickAge || whole - tickAge > 100) tickAge = whole
          while (tickAge < whole) { for (const actor of actors.values()) actor.tick(); tickAge++ }
          for (const actor of actors.values()) {
            try { actor.setContraptionEntities?.(current.entityState?.entities); actor.frame(clock.renderTicks, clock.partialTick); actor.setClockAvailable?.(true) }
            catch (error) { actor.setClockAvailable?.(false, error.message) }
          }
        }
        if (oldReason !== kineticClockState.reason) publishDiagnostics()
      }
      const beforeRender=performance.now()
      renderer.render(scene, camera)
      const afterRender=performance.now()
      if(firstTerrainRender){terrainPhases.firstRenderMs=afterRender-beforeRender;firstTerrainRender=false}
      const mainDraw={...renderer.info.render}
      if(selfActor?.firstPersonRoot){
        selfActor.firstPersonRoot.visible=viewMode==='first'
        const hands=selfActor.firstPersonItemsState?.()
        writeChanged(renderer.domElement.dataset,'firstPersonHands',JSON.stringify({ rendered:viewMode==='first',available:hands?.available===true,
          swing:hands?.swingAnimationAvailable===true,progress:hands?.swingProgress??null,
          right:hands?.hands?.right?.visible===true,left:hands?.hands?.left?.visible===true }))
        if(viewMode==='first'){
          renderer.clearDepth();renderer.autoClear=false
          try {renderer.render(firstPersonScene,firstPersonCamera)} finally {renderer.autoClear=true}
        }
      }
      const beforeMap=performance.now()
      const mapDrawn=miniMap.render({position:displayPose,playerUuid,entityId:current?.selfPlayer?.entityId,epoch,
        bounds:current?.bounds,visual:agentVisual.snapshot(),now})
      const afterMap=performance.now()
      publishFrame(now)
      const afterUi=timingFrame?performance.now():afterMap
      if(now-lastCostAt>=1000){
        frameCost={updateMs:beforeRender-frameStarted,mainMs:afterRender-beforeRender,handsMs:beforeMap-afterRender,mapMs:afterMap-beforeMap,
          uiMs:performance.now()-afterMap,mainCalls:mainDraw.calls,mainTriangles:mainDraw.triangles,
          mapCalls:mapDrawn?renderer.info.render.calls:0,mapTriangles:mapDrawn?renderer.info.render.triangles:0,
          mapReadback:miniMap.root.dataset.readback??null,room:roomStatus?.reason??null}
        lastCostAt=now;renderer.domElement.dataset.frameCost=JSON.stringify(frameCost);renderer.domElement.dataset.motionCadence=JSON.stringify(selfDisplay.status(now));publishDiagnostics()
        renderer.domElement.dataset.cameraTracking=JSON.stringify({view:viewMode,mode:cameraOptions.mode,
          camera:{x:camera.position.x,y:camera.position.y,z:camera.position.z},target:observerTarget?.position??null,
          actor:selfActor?{x:selfActor.root.position.x,y:selfActor.root.position.y,z:selfActor.root.position.z}:null,fov:camera.fov})
      }
      transitionTiming?.worldFinish(timingFrame,{cameraMs,roomMs,updateMs:beforeRender-frameStarted,
        mainCpuDrawMs:afterRender-beforeRender,handsMs:beforeMap-afterRender,mapMs:afterMap-beforeMap,
        uiMs:afterUi-afterMap,diagnosticsMs:performance.now()-afterUi})
    } catch (error) { fail(error) }
  })
  events = new EventSource(nativeViewerUrl('events'))
  events.onmessage = message => {
    try {
      const received=JSON.parse(message.data)
      // A resource/registry deployment can invalidate the old session reader.
      // Let the page reload its checked build before decoding that new epoch.
      if(received?.type==='identity'&&onBuild(received.viewerBuild)){events?.close();return}
      const event = session.receive(received), value = event.value
      if (event.kind === 'ignored') return
      if(event.kind==='entity_collect'){void entityLayer.collect(value);audio.collect(value);return}
      if(event.kind==='world_effect'){if(value.effect.kind==='particle')void particles.event(value,current?.motion);else audio.event(value);return}
      if (event.kind === 'agent_visual') {
        visualPort.emit(value.event, value.value)
        const operation = value.value?.input?.operations?.findLast(row => row.kind === 'inventory' && row.windowId === 0)
        const key = operation && `${value.value.epoch}:${operation.id}`
        if (key && key !== lastInventoryOperation) {
          lastInventoryOperation = key
          onState({ type: 'inventoryPreview', playerUuid: value.value.subject.playerUuid, open: true, ttlMs: 3200 })
        }
        return
      }
      if (event.kind === 'identity') {
        frameGaps.reset();renderer.domElement.dataset.frameGaps="null"
        if (event.reset) clearScene()
        visualPort.emit('viewerSession', { mode: 'self', attached: value.confirmed === true, playerUuid: value.playerUuid,
          playerName: value.player, entityId: value.entityId, worldUuid: String(value.epoch) })
        player = value.player; playerUuid = value.playerUuid?.toLowerCase(); onIdentity(value); return
      }
      if (event.kind === 'unavailable') {
        if (event.reset) clearScene()
        visualPort.emit('disconnect')
        epoch = value.epoch; onUnavailable(value.reason || 'NATIVE_WORLD_WAITING'); return
      }
      if (value.type === 'snapshot') {
        renderer.domElement.dataset.terrainTransport = JSON.stringify({ kind: received.type, sequence: value.terrainSequence ?? null, eventCharacters: message.data.length })
        if (epoch !== value.epoch) { clearScene(); epoch = value.epoch }
        current = value; receiveDisplay(); terrainQueue.request(value); void rebuildLatest()
        audio.connect(true)
      } else if (value.type === 'frame' && current && value.epoch === epoch) {
        current.pose = value.pose; current.selfPlayer = value.selfPlayer; current.motion = value.motion; current.time = value.time; current.packetSequence = value.packetSequence
        current.presentation = value.presentation; current.entityState = value.entityState; receiveDisplay()
      } else if (value.type === 'motion' && current && value.epoch === epoch) {
        if(value.selfPlayer)current.selfPlayer={...current.selfPlayer,...value.selfPlayer}
        selfActor?.applyHandAnimation?.(value.handAnimation)
        if(current.presentation?.self && value.handAnimation?.playerUuid===playerUuid && value.handAnimation.entityId===current.selfPlayer?.entityId)
          current.presentation.self.handAnimation=value.handAnimation
        current.pose = value.pose; current.motion = value.motion; receiveDisplay(); return
      } else if (value.type === 'presentation' && current && value.epoch === epoch) {
        current.presentation = value.presentation; selfActor?.applyHeldItems?.(value.presentation); onState(value); return
      } else return
      onState(value); void ensureSelfActor(current.selfPlayer)
      entityLayer.stage(current.entityState,{selfEntityId:current.selfPlayer?.entityId,playerUuid})
      const body = selfActor
      if (body?.applyHeldItems) void Promise.resolve(body.applyHeldItems(current.presentation)).catch(error => {
        if (selfActor !== body) return
        body.root.userData.heldItems = { available: false, reason: error.message }; publishDiagnostics()
      })
    } catch (error) { fail(error) }
  }
  events.onerror = () => { session.receive({type:'unavailable'}); clearScene(); onUnavailable('NATIVE_WORLD_STREAM_DISCONNECTED') }
}
function orbitPosition () {
  orbitAnchor.reset()
  orbitAnchor.initialize({pose:displayPose??current?.pose,mode:viewMode,camera,controls})
}
function setView (mode) {
  if (!['third', 'first', 'region', '3dview'].includes(mode) || disposed) return
  viewMode = mode; cameraDistance = null; cameraCollisionAt = 0
  if(mode==='first'&&selectedEntity)selectTarget(null)
  director?.reset();cameraFrame=null
  camera.fov = mode === '3dview' ? 48 : 70; camera.updateProjectionMatrix()
  controls.enabled = mode === 'region'||mode==='third'&&cameraOptions.mode==='manual'; if (controls.enabled) orbitPosition()
  viewport.dataset.view = mode; onMode(mode)
}
function updatePlayerCamera (now) {
  observerTarget=nativeCameraTarget({...current,pose:displayPose??current.pose},selfActor);observerPose=displayPose??current.pose
  if(selectedEntity){
    const entity=entityLayer.data.get(selectedEntity.id),actor=entityLayer.actors.get(selectedEntity.id)?.actor
    // Actor rebuilds are asynchronous. Keep selection through a metadata/skin
    // rebuild; only actual removal or a new UUID retires the selected target.
    if(entity?.uuid!==selectedEntity.uuid)selectTarget(null)
    else if(actor){
      const box=new THREE.Box3().setFromObject(actor.root),height=box.max.y-box.min.y,p=actor.root.position
      observerTarget={key:`${entity.uuid}:${entity.entityId}:${epoch}`,position:{x:p.x,y:p.y,z:p.z},yaw:Math.PI-(entity.motion?.bodyYaw??entity.yaw)*Math.PI/180,height:Number.isFinite(height)&&height>0?height:1.8}
      observerPose={...current.pose,...observerTarget.position,yaw:observerTarget.yaw}
    }
  }
  if (viewMode === 'region'||viewMode==='third'&&cameraOptions.mode==='manual'&&!director.shot) {
    orbitAnchor.initialize({pose:observerPose,mode:viewMode,camera,controls})
    orbitAnchor.follow({pose:observerPose,mode:viewMode,camera,controls})
    controls.enabled=true;controls.update();cameraFrame={mode:'manual'};return
  }
  controls.enabled=false
  if(viewMode==='third') {
    const pose=director.update(observerTarget,cameraOptions,now,{aspect:camera.aspect,
      collisionDistance:(focus,direction,distance,options)=>{
        const signature=JSON.stringify([focus.x,focus.y,focus.z,direction.x,direction.y,direction.z,distance,current.revision])
        if(!lastCollision||now-lastCollision.at>60||lastCollision.signature!==signature){
          lastCollision={at:now,signature,value:nativeCameraCollisionDistance(focus,direction,distance,{...options,
            bounds:current.bounds,receivedColumns:current.viewCoverage?.receivedColumns??[],raycast:terrainRaycast})}
        }
        return lastCollision.value
      }})
    if(pose){camera.position.copy(pose.position);camera.lookAt(pose.focus.x,pose.focus.y,pose.focus.z);camera.fov=pose.fov;camera.updateProjectionMatrix();cameraDistance=pose.distance;cameraFrame=pose;return}
  }
  const view = playerCamera(observerPose, viewMode)
  if(viewMode==='3dview'){
    const {yaw,pitch,distance}=dungeonCamera,p=observerPose
    view.position=[p.x+Math.sin(yaw)*Math.cos(pitch)*distance,p.y+1-Math.sin(pitch)*distance,p.z+Math.cos(yaw)*Math.cos(pitch)*distance]
  }
  const target = new THREE.Vector3().fromArray(view.target), desired = new THREE.Vector3().fromArray(view.position)
  cameraDistance=null;cameraFrame={mode:viewMode}
  camera.position.copy(desired); camera.lookAt(target)
}
function rememberPointer(event){pointerStart={x:event.clientX,y:event.clientY,id:event.pointerId}}
function beginCameraPointer(event) {
  // Let OrbitControls observe pointerdown, but a click/target selection alone
  // must not silently disable the director's selected follow mode.
  rememberPointer(event)
  if(viewMode==='third'&&current?.pose)controls.enabled=true
}
function dragCameraPointer(event) {
  if(pointerStart?.id===event.pointerId&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5)manualCameraInput()
}
function selectPointer(event){
  const start=pointerStart;pointerStart=null
  if(!start||start.id!==event.pointerId||Math.hypot(start.x-event.clientX,start.y-event.clientY)>5||!current)return
  const rect=renderer.domElement.getBoundingClientRect(),candidates=[...entityLayer.actors].map(([id,row])=>{
    const e=entityLayer.data.get(id);return {id,entity:{...e,metadata:Object.fromEntries((e.metadata??[]).map(m=>[m.key,m.value]))},root:row.actor.root}
  }),raycaster=new THREE.Raycaster()
  const hit=pickEntity({candidates,raycaster,camera,scene:worldRoot.parent,ndc:{x:(event.clientX-rect.left)/rect.width*2-1,y:1-(event.clientY-rect.top)/rect.height*2}})
  if(hit){raycaster.far=hit.distance;if(!(terrainRaycast(raycaster).some(h=>h.distance+.01<hit.distance)))selectTarget(hit.id)}
}
function selectTarget(id){
  const entity=id===null?null:entityLayer.data.get(Number(id)),actor=entity&&entityLayer.actors.get(entity.entityId)?.actor
  selectedEntity=entity&&actor?{id:entity.entityId,uuid:entity.uuid}:null
  director?.reset();lastCollision=null
  if(selectedEntity&&viewMode!=='third')setView('third')
  if(selectedEntity&&cameraOptions.mode==='manual'){cameraOptions={...cameraOptions,mode:'follow'};onCameraManual('follow')}
  onSelection(entity?{entityId:entity.entityId,name:entity.name,uuid:entity.uuid,position:{...entity.position},health:actor.root.userData.nativeLiving?.health??null}:null)
}
function setCameraSettings(value) {
  const previous=cameraOptions.mode;cameraOptions=normalizeCameraSettings(value)
  if(previous!==cameraOptions.mode){director?.reset();cameraDistance=null;if(cameraOptions.mode==='manual')orbitPosition()}
}
function manualCameraInput() {
  if(viewMode!=='third'||!current?.pose)return
  if(cameraOptions.mode!=='manual'||director.shot){const focus=director.lastPose?.focus??{x:current.pose.x,y:current.pose.y+1,z:current.pose.z};director.reset();cameraOptions={...cameraOptions,mode:'manual'};controls.target.copy(focus);orbitAnchor.rebase(observerPose??displayPose??current.pose);onCameraManual()}
  controls.enabled=true
}
async function ensureSelfActor (self) {
  const nativeSelf = current?.presentation?.self
  const ysm = nativeSelf && Object.hasOwn(nativeSelf, 'ysm') ? nativeSelf.ysm : self?.ysm
  const actor = await selfController?.update(self, playerUuid, ysm)
  if (actor && actor === selfActor && actor.applyHeldItems) {
    try { await actor.applyHeldItems(current?.presentation) } catch (error) {
      if (actor === selfActor) actor.root.userData.heldItems = { available: false, reason: error.message }
    }
  }
}
function publishFrame(now) {
  const p = displayPose??current?.pose
  let label = { visible: false, x: 0, y: 0, name: player }
  if (p && selfActor?.root.visible && viewMode !== 'first') {
    const point=selectedEntity?observerTarget?.position:p,height=selectedEntity?(observerTarget?.height??1.8)+.2:2.1
    if(selectedEntity)label.name=entityLayer.data.get(selectedEntity.id)?.name
    labelPoint.set(point.x, point.y + height, point.z).project(camera)
    label = { visible: labelPoint.z >= -1 && labelPoint.z <= 1 && Math.abs(labelPoint.x) <= 1 && Math.abs(labelPoint.y) <= 1,
      x: (labelPoint.x + 1) * viewport.clientWidth / 2, y: (1 - labelPoint.y) * viewport.clientHeight / 2, name: label.name }
  }
  if(frameEntitiesData!==entityLayer?.data||frameEntitiesCount!==entityLayer?.actors.size){
    frameEntitiesData=entityLayer?.data;frameEntitiesCount=entityLayer?.actors.size
    frameEntities=[...(entityLayer?.data.values()??[])].slice(0,64).map(e=>({id:e.entityId,uuid:e.uuid,name:e.name,rendered:entityLayer.actors.has(e.entityId)}))
  }
  onFrame({ now, pose: p, selfPlayer: current?.selfPlayer, label,camera:cameraFrame,room:roomStatus,selectedEntity,entities:frameEntities })
}
function publishDiagnostics() {
  onDiagnostics({ total: current?.groups?.reduce((sum, g) => sum + g.positions.length / 3, 0) || 0,
    drawn: drawn + [...actors.values()].filter(actor => !actor.staticBodyRenderedSeparately && actor.root.visible).length,
    issues: [...unknown, ...(actors.size && !kineticClockState.available ? [kineticClockState.reason] : []),
      ...[...actors.values()].flatMap(actor => [actor.root.userData.nativeClockReason, actor.root.userData.nativeBearing?.reason]).filter(Boolean), ...(entityLayer?.diagnostics().issues??[]),...(particles?.diagnostics().issues??[])], entities: entityLayer?.diagnostics()??null,
    appearance: selfController?.appearance(),particles:particles?.diagnostics(),
    audio:audio?.state(),
    selfModel: selfActor?.assetInfo?.kind === 'ysm' ? { kind: 'ysm', modelId: selfActor.assetInfo.modelId, texture: selfActor.assetInfo.texture, selectionSource: selfActor.assetInfo.selectionSource,
      support: selfActor.assetInfo.support ?? null, notice: selfActor.assetInfo.notice, motion: selfMotionState ?? selfActor.root.userData.motion ?? null } : null,
    heldItems: selfActor?.heldItemsState?.()??null, firstPersonItems:selfActor?.firstPersonItemsState?.()??null, missingColumns: current?.missingColumns?.length || 0,
    kinetics: current?.kinetic?.map(n => n.speed) || [], environment: current?.biomes?.map(b => b.name) || [],
    kineticClock: kineticClockState,
    deviceVisuals: [...actors.values()].filter(actor => actor.root.userData.nativeDevice).map(actor => ({ position: actor.position, stateId: actor.state.stateId, ...actor.root.userData.nativeDevice })),
    windmillVisuals: [...actors.values()].filter(actor => actor.root.userData.nativeBearing).map(actor => ({ position: actor.position, ...actor.root.userData.nativeBearing })),
    terrainWork:{...terrainQueue.diagnostics(),phases:{...terrainPhases}},frameCost,frameGaps:frameGaps.value,selfDisplay:{delayMs:selfDisplay.delayMs,stale:selfDisplay.stale},skinState, bounds: current?.bounds ?? null, coverage: current?.viewCoverage ?? null, completeSceneParityVerified: false })
}
function clearStatics () {
  if (!statics) return
  disposeNativeStaticMeshes(statics)
}
function clearScene () {
  orbitAnchor.reset()
  selfDisplay.reset();displayPose=null;frameGaps.reset();if(renderer)renderer.domElement.dataset.frameGaps="null"
  miniMap?.reset()
  audio?.connect(false)
  particles?.reset()
  generation++; terrainQueue.reset(); current = null; lastGroupSignature = null; clearStatics()
  for (const actor of actors.values()) removeActor(actor)
  actors.clear()
  entityLayer?.reset()
  selfController?.clear(); selfActor = null
  lastPlayerFrameTime = null; selfMotionState = null; selfMotionSignature = null
  cameraDistance = null; skinState = null; drawn = 0; unknown = []; staticIssues = []; tickAge = null
  director?.reset();cameraFrame=null
  selectedEntity=null;onSelection(null);terrainRaycast=()=>[];lastCollision=null
  roomVisibility.reset();roomStatus=null
  kineticClock.reset(); kineticClockState = { available: false, reason: 'NATIVE_KINETIC_NATIVE_TIME_UNAVAILABLE' }
  onActor(null); publishDiagnostics()
  camera?.position.set(0, 0, 0)
}
function removeActor (actor) {
  worldRoot.remove(actor.root); if (actor.dispose) actor.dispose(); else loader.releaseModel(actor.root)
}
async function template (state, variants) {
  const key = `${state.stateId}:${JSON.stringify(variants)}`
  if (!templates.has(key)) templates.set(key, (async () => {
    if (/^minecraft:[a-z_]+_bed$/.test(state.name)) {
      const bed = await createNativeBedTemplate(assetReader,state)
      if(disposed){bed.dispose();throw Error('NATIVE_SCENE_DISPOSED')}
      bedTemplates.add(bed); return bed.root
    }
    if (state.name === MILLSTONE_ID) {
      const plan = await prepareNativeMillstoneModel(assetReader, state, 'body')
      const model = await loader.model(plan.modelId)
      if (disposed) { loader.releaseModel(model); throw Error('NATIVE_SCENE_DISPOSED') }
      model.userData.nativeDevice = { part: 'body', sourcePaths: plan.sourcePaths, pixelParityVerified: false }
      model.updateMatrixWorld(true); return model
    }
    if (nativeColonyHutEligible(state)) {
      const plan = await prepareNativeColonyHutModel(assetReader, state)
      const model = await loader.models(plan.variants)
      if (disposed) { loader.releaseModel(model); throw Error('NATIVE_SCENE_DISPOSED') }
      model.userData.nativeColonyHut = { sourcePaths: plan.sourcePaths, blockClass: plan.blockClass,
        blockEntityRendererEmpty: true, blueprintPreviewAvailable: false, pixelParityVerified: false }
      model.updateMatrixWorld(true); return model
    }
    // BlockEntity presence does not replace the ordinary MODEL render path.
    // Additional renderers are tracked separately from the original base.
    if (state.name === WINDMILL_BEARING_ID) verifyNativeWindmillBearing(assetReader, state)
    const contract=originalBlockModelContract(state,originalModelLayers,{vanillaOnly:vanillaRegistry})
    if(!contract.renderBase)throw Error(contract.issue)
    const model = await loader.models(variants, { allowTint: true })
    if(disposed){loader.releaseModel(model);throw Error('NATIVE_SCENE_DISPOSED')}
    let faces = 0; model.traverse(part => { if (part.isMesh) faces++ })
    if (!faces) throw Error('原生模型无可绘制面')
    if(![CUTTING_BOARD_ID,WINDMILL_BEARING_ID].includes(state.name))model.userData.nativeBaseIssue=contract.issue
    model.updateMatrixWorld(true)
    return model
  })())
  return templates.get(key)
}
async function rebuildLatest () {
  try {
    await terrainQueue.run(async (snapshot, terrainCurrent) => {
      const run=generation;let staged=null
      const isCurrent=()=>run===generation&&!disposed&&terrainCurrent()
      try {
      const definitions = new Map(snapshot.states.map(s => [s.stateId, s]))
      await loader.prefetchBlockModels(snapshot.groups, definitions, { isCurrent })
      const cuttingBoards = new Map((snapshot.cuttingBoards || []).map(board => [pointKey(board.position), board]))
      const signatureStarted=performance.now()
      const signature = nativeStaticSignature(snapshot)
      terrainPhases.signatureMs=performance.now()-signatureStarted
      staged = await stageNativeKineticActors({nodes:snapshot.kinetic,definitions,actors,
        createActor:(state,position)=>createKineticActor(loader,state,position),attach:actor=>worldRoot.add(actor.root),remove:removeActor,
        isCurrent,deferCommit:true})
      if (!staged.current) return
      const nextIssues = staged.issues, nextStaticIssues = []
      let fluidStateAt=null
      if (signature !== lastGroupSignature) {
        const environmentStarted=performance.now()
        const next = new NativeStaticStage(), environment = createNativeEnvironment(snapshot, colormaps), tintColor = new THREE.Color()
        const faceVisibility=nativeFaceVisibility(snapshot)
        terrainPhases.environmentMs=performance.now()-environmentStarted
        const work = createNativeRebuildWork({ isCurrent })
        let count = 0
        try {
        for (const group of snapshot.groups) {
          // A larger native volume must leave the controls/HUD responsive.
          // Only scheduling changes; no geometry, state or texture is omitted.
          const pause = work.checkpoint(); if (pause) await pause
          const state = definitions.get(group.stateId)
          if (['create:shaft', 'create:hand_crank'].includes(state.name)) continue
          if (nativeFluidFamily(state)) {
            fluidStateAt ??= await createNativeFluidStateReader(snapshot, definitions, work)
            const result = await buildNativeFluidMeshes({ group, stateName: state.name, getState: fluidStateAt, environment, loader, work })
            for (const mesh of result.meshes) next.add(mesh)
            work.check()
            nextStaticIssues.push(...result.issues)
            if(state.renderShape==='INVISIBLE'){count+=result.count;continue}
          }
          else if (state.fluid && !state.fluid.empty) nextStaticIssues.push(`${state.name}：原生液体渲染提供器未适配 (${state.fluid.name})`)
          try {
            const positions = []
            for (let i = 0; i < group.positions.length; i += 3) {
              const pause = work.checkpoint(); if (pause) await pause
              const position = { x: group.positions[i], y: group.positions[i + 1], z: group.positions[i + 2] }
              if (state.name === CUTTING_BOARD_ID) {
                const support = cuttingBoardStaticModelStatus(state, cuttingBoards.get(pointKey(position)), loader.reader.manifest)
                if (!support.available) {
                  nextStaticIssues.push(`${state.name} @ ${pointKey(position)}：${support.reason}${support.storedItem ? ` (${support.storedItem.id} × ${support.storedItem.count})` : ''}`)
                  continue
                }
              }
              positions.push(position)
            }
            if (!positions.length) continue
            const isBed = /^minecraft:[a-z_]+_bed$/.test(state.name)
            if (isBed) nativeBedState(state)
            const blockstate = isBed ? null : await loader.blockstate(state.name)
            const subgroups = new Map()
            for (const position of positions) {
              const pause = work.checkpoint(); if (pause) await pause
              const variants = isBed ? [] : selectBlockVariants(blockstate, state, position), faceMask=faceVisibility(position.x,position.y,position.z),key = JSON.stringify([variants,faceMask])
              if (!subgroups.has(key)) subgroups.set(key, { variants, faceMask, positions: [] })
              subgroups.get(key).positions.push(position.x, position.y, position.z)
            }
            for (const subgroup of subgroups.values()) {
              const model = await template(state, subgroup.variants)
              if(model.userData.nativeBaseIssue)nextStaticIssues.push(`${state.name}：${model.userData.nativeBaseIssue}`)
              work.check()
              const meshes = []
              try {
                if(!staticBatches.has(model))staticBatches.set(model,new Map())
                const batches=staticBatches.get(model)
                if(!batches.has(subgroup.faceMask))batches.set(subgroup.faceMask,nativeStaticBatches(model,{faceMask:subgroup.faceMask}))
                const prepared=await nativeInstanceTints(state,subgroup.positions,batches.get(subgroup.faceMask).batches,environment,work,
                  error=>nextStaticIssues.push(`${state.name}（缺少数据的边缘格）：${error.message}`))
                const instanceCount=prepared.positions.length/3
                if(!instanceCount)continue
                for(const part of batches.get(subgroup.faceMask).batches){
                  const pause = work.checkpoint(); if (pause) await pause
                  for(const material of Array.isArray(part.material)?part.material:[part.material])roomVisibility.patch(material)
                  const mesh = new THREE.InstancedMesh(part.geometry, part.material, instanceCount)
                  mesh.userData.nativeBlockPositions=prepared.positions
                  meshes.push(mesh)
                  const matrix = new THREE.Matrix4()
                  for (let i = 0; i < instanceCount; i++) {
                    const pause = work.checkpoint(); if (pause) await pause
                    const p = { x: prepared.positions[i * 3], y: prepared.positions[i * 3 + 1], z: prepared.positions[i * 3 + 2] }, offset = modelOffset(state, p)
                    matrix.makeTranslation(p.x + 0.5 + offset[0], p.y + 0.5 + offset[1], p.z + 0.5 + offset[2]).multiply(part.matrixWorld)
                    mesh.setMatrixAt(i, matrix)
                    if (part.userData.tintIndex >= 0) {
                      mesh.setColorAt(i, tintColor.setHex(prepared.tints.get(part.userData.tintIndex)[i]))
                    }
                  }
                  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
                }
                count += instanceCount
              } catch (error) { for (const mesh of meshes) mesh.dispose(); throw error }
              for (const mesh of meshes) next.add(mesh)
            }
          } catch (error) {
            work.check()
            if (isNativeRebuildRetired(error)) throw error
            nextStaticIssues.push(`${state.name}：${error.message}`)
          }
        }
        const commitStarted=performance.now()
        next.commit(statics, isCurrent)
        terrainPhases.commitMs=performance.now()-commitStarted
        const indexStarted=performance.now()
        terrainRaycast=createNativeTerrainRaycast(statics);lastCollision=null
        terrainPhases.indexMs=performance.now()-indexStarted;firstTerrainRender=true
        drawn = count; lastGroupSignature = signature; staticIssues = nextStaticIssues
        } finally { next.dispose(); environment.clear() }
      }
      // Received bounds/states/columns can change without mesh arrays changing.
      // The room cache must use this snapshot, independently of mesh rebuilding.
      if(!isCurrent())return
      if(!staged.commit())return
      roomVisibility.stage(snapshot)
      unknown = [...nextIssues, ...staticIssues]
      if (!isCurrent()) return
      if (!current) return
      publishDiagnostics()
      if (camera.position.lengthSq() === 0 && viewMode === 'region') orbitPosition()
      } finally { staged?.dispose() }
    })
  } catch (error) { fail(error) }
}

function fail (error) {
  events?.close(); clearScene(); renderer?.setAnimationLoop(null)
  onUnavailable(error.message)
}
function dispose () {
  if (disposed) return
  disposed = true; audio?.dispose();particles?.dispose();miniMap?.dispose(); agentVisual.dispose(); visualListeners.clear(); events?.close(); observer?.disconnect(); renderer?.setAnimationLoop(null)
  document.removeEventListener('visibilitychange', kineticVisibility)
  renderer?.domElement.removeEventListener('pointerdown',beginCameraPointer,true);renderer?.domElement.removeEventListener('pointermove',dragCameraPointer,true);renderer?.domElement.removeEventListener('wheel',manualCameraInput,true);director?.dispose()
  renderer?.domElement.removeEventListener('pointerdown',rememberPointer);renderer?.domElement.removeEventListener('pointerup',selectPointer)
  controls?.dispose(); clearScene(); roomVisibility.dispose(); selfController?.dispose(); entityLayer?.dispose(); for(const masks of staticBatches.values())for(const batch of masks.values())batch.dispose();staticBatches.clear();loader?.dispose(); for (const bed of bedTemplates) bed.dispose(); bedTemplates.clear(); renderer?.dispose(); renderer?.domElement.remove()
}
try { await start(); setView(mode) } catch(error) { dispose(); throw error }
return { setView, dispose, renderer,
  timingContext:()=>({view:viewMode,snapshotRevision:current?.revision,terrainRequested:terrainQueue.stats.requested,
    terrainCommitted:terrainQueue.stats.committed,terrainBuilding:terrainQueue.running,terrainPending:!!terrainQueue.pending,terrainCommittedAt:terrainQueue.committedAt}), camera, scene: worldRoot.parent, assetReader,audio,
  setCameraSettings,selectTarget,startCameraShot:kind=>director?.startShot(kind,performance.now()),
  setSceneSettings:value=>{sceneOptions={...sceneOptions,...value}},getDungeonCamera:()=>({...dungeonCamera}),setDungeonCamera:value=>{dungeonCamera={...value}},
  selectAppearance: id => selfController?.selectAppearance(id),
  get actor() { return selfActor }, get state() { return current } }
}
