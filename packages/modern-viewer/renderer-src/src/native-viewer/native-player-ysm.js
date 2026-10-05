import * as THREE from 'three'
import { NativeAssetReader } from './model-loader.js'
import { PLAYER_CLIENT_JAR_SHA256 } from './native-player.js'
import { createNativeBedrockModel } from './native-entity-model-bedrock.js'
import { nativeSelfPlayerBinding, NATIVE_YSM_VERSION, NATIVE_YSM_JAR_SHA256, NATIVE_YSM_MODEL_ID, NATIVE_YSM_NOTICE } from './native-ysm-state.js'
import { createNativeYsmAnimation, NATIVE_YSM_ANIMATION_SUPPORT } from './native-ysm-animation.js'

const PREFIX = 'assets/yes_steve_model/builtin/misc/3_default_boy/'
export const NATIVE_YSM_ASSETS = Object.freeze({ definition: PREFIX + 'ysm.json', model: PREFIX + 'models/main.json',
  animation: PREFIX + 'animations/main.animation.json', blue: PREFIX + 'textures/blue.png', red: PREFIX + 'textures/red.png' })
export const NATIVE_YSM_ASSET_HASHES = Object.freeze({
  definition: 'dfd4fae1b37261bf41ca9fbb6c35cc78adfb0b5baea0b2c73b76c86fe812f907',
  model: '28ee6898bfef37fa3cf4a6e4f34bafe721782a4cff2b2cfd66dfb0b97963b34a',
  animation: '5542bec68f8d35d14120cae85e96785708623e8b315dca550e95025c6084f0dc',
  blue: 'ff7872dfbdd72d2453fec5ad1903272a119ec0c2b9b28482c1bb27787972a4c0',
  red: '5a667b5fae29820c86646e01d7197b0db99c491ce7127ce0bcbe082fef28f4d6'
})

// The original idle is the reset pose used while verified motion is absent.
// The bounded animation port below consumes original clips and live inputs;
// neither it nor the raw geometry establishes full YSM client parity.
export function applyNativeYsmStaticIdle (model, animation) {
  const idle = animation?.animations?.idle
  if (animation?.format_version !== '1.8.0' || idle?.animation_length !== 0.375 ||
      !idle.bones || Object.keys(idle.bones).length !== 15) throw Error('NATIVE_YSM_IDLE_SOURCE_UNSUPPORTED')
  for (const [name, channels] of Object.entries(idle.bones)) {
    if (!model.bones.has(name) || !channels || typeof channels !== 'object' || Array.isArray(channels)) throw Error('NATIVE_YSM_IDLE_SOURCE_UNSUPPORTED')
    for (const [channel, value] of Object.entries(channels)) {
      if (!['rotation', 'position', 'scale'].includes(channel) || !Array.isArray(value) || value.length !== 3 ||
          !value.every(number => number === (channel === 'scale' ? 1 : 0))) throw Error('NATIVE_YSM_IDLE_SOURCE_UNSUPPORTED')
    }
  }
  model.reset()
}

async function loadPng (bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
  try { return await new THREE.TextureLoader().loadAsync(url) } finally { URL.revokeObjectURL(url) }
}

export async function createNativeYsmPlayerActor (reader, { uuid, ysm, loadTexture = loadPng } = {}) {
  const binding = nativeSelfPlayerBinding({ uuid, ysm }, uuid)
  if (binding.kind !== 'ysm') throw Error('NATIVE_YSM_MODEL_NOT_ENABLED')
  if (!(reader instanceof NativeAssetReader) || reader.manifest.clientJarSha256 !== PLAYER_CLIENT_JAR_SHA256) throw Error('NATIVE_YSM_CLIENT_SOURCE_UNSUPPORTED')
  const sources = reader.manifest.sources?.filter(source => /^ysm-2\.6\.5-neoforge\+mc1\.21\.1(?:-release)?\.jar$/.test(source.name ?? ''))
  if (sources?.length !== 1 || sources[0].sha256 !== NATIVE_YSM_JAR_SHA256 || sources[0].explicitOverride) throw Error('NATIVE_YSM_JAR_SOURCE_UNSUPPORTED')
  const paths = ['definition', 'model', 'animation', binding.ysm.texture]
  for (const kind of paths) {
    const entry = reader.manifest.assets[NATIVE_YSM_ASSETS[kind]]
    if (entry?.sha256 !== NATIVE_YSM_ASSET_HASHES[kind] || entry.source !== sources[0].name || entry.overriddenSources?.length ||
        entry.variants?.some(variant => variant.sha256 !== entry.sha256)) throw Error(`NATIVE_YSM_ASSET_SOURCE_UNSUPPORTED:${kind}`)
  }
  const definition = await reader.json(NATIVE_YSM_ASSETS.definition)
  if (definition.spec !== 2 || definition.metadata?.license?.type !== 'CC 0' || definition.properties?.free !== true ||
      definition.files?.player?.model?.main !== 'models/main.json' || definition.files.player.animation?.main !== 'animations/main.animation.json' ||
      JSON.stringify(definition.files.player.texture) !== JSON.stringify(['textures/blue.png', 'textures/red.png'])) throw Error('NATIVE_YSM_DEFINITION_UNSUPPORTED')
  const animation = await reader.json(NATIVE_YSM_ASSETS.animation)
  const root = new THREE.Group(), orientation = new THREE.Group(), content = new THREE.Group()
  root.name = 'native-own-ysm-player'; root.visible = false
  // Undo the helper's 24-pixel root origin in its documented Bedrock frame.
  // Keep every original bone, cube, UV, pivot and rotation, without fit-to-body
  // scaling. Java-client geometry/material parity has not been accepted.
  root.add(orientation); orientation.add(content); orientation.scale.set(-1, -1, 1); content.position.y = -1.5
  // Locked YSM OO0OOoo0ooooOoO0O0o00Ooo ordinary renderer translate(0,.01f,0).
  orientation.position.y = Math.fround(.01)
  let texture, material, model, disposed = false
  try {
    const bytes = await reader.bytes(NATIVE_YSM_ASSETS[binding.ysm.texture])
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte) ||
        data.getUint32(16) !== 128 || data.getUint32(20) !== 128) throw Error('NATIVE_YSM_TEXTURE_INVALID')
    texture = await loadTexture(bytes)
    if (!texture?.isTexture || texture.image?.width !== 128 || texture.image?.height !== 128) throw Error('NATIVE_YSM_TEXTURE_DECODE_INVALID')
    texture.flipY = true; texture.colorSpace = THREE.SRGBColorSpace
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true
    material = new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide, alphaTest: .1, depthWrite: true })
    model = createNativeBedrockModel(await reader.json(NATIVE_YSM_ASSETS.model), material)
    if (model.bones.size !== 58 || model.cubeCount !== 156 || model.faceCount !== 936) throw Error('NATIVE_YSM_GEOMETRY_SOURCE_MISMATCH')
    applyNativeYsmStaticIdle(model, animation); content.add(model.root)
    const animationController = createNativeYsmAnimation(model, animation, binding.uuid)
    const assetInfo = Object.freeze({ kind: 'ysm', uuid: binding.uuid, name: 'Default Boy', modelId: NATIVE_YSM_MODEL_ID, texture: binding.ysm.texture,
      ysmVersion: NATIVE_YSM_VERSION, modJarSha256: NATIVE_YSM_JAR_SHA256, clientJarSha256: reader.manifest.clientJarSha256,
      source: binding.ysm.source, selectionSource: 'same_player_native_attachment', sourcePaths: paths.map(kind => NATIVE_YSM_ASSETS[kind]),
      sourceHashes: Object.fromEntries(paths.map(kind => [kind, NATIVE_YSM_ASSET_HASHES[kind]])),
      boneCount: model.bones.size, cubeCount: model.cubeCount, faceCount: model.faceCount, notice: NATIVE_YSM_ANIMATION_SUPPORT.notice,
      support: NATIVE_YSM_ANIMATION_SUPPORT,
      geometrySource: 'YSM_2.6.5_original_misc_3_default_boy_Bedrock', poseSource: 'original_main_animation_keyframes_bounded_browser_port',
      eyesRenderingAvailable: true, headPoseRenderingAvailable: true, animationRenderingAvailable: true, equipmentRenderingAvailable: false,
      firstPersonRenderingAvailable: false, inventoryPreviewAvailable: true, geometryParityVerified: false, channelTransformParityVerified: false,
      rendererParityVerified: false, animationParityVerified: false, completeEntityParityVerified: false })
    const unavailable = reason => ({ available: false, reason, scope: 'ysm_original_model', animationParityVerified: false })
    root.userData = { playerUuid: binding.uuid, assetInfo, motion: animationController.current() }
    const guard = () => { if (disposed) throw Error('NATIVE_YSM_ACTOR_DISPOSED') }
    return { root, model, assetInfo,
      applyPose (pose) {
        guard()
        if (!pose || ![pose.x, pose.y, pose.z, pose.yaw, pose.pitch].every(Number.isFinite)) throw Error('NATIVE_YSM_POSE_UNAVAILABLE')
        // Camera/entity yaw is the head direction, not the body's rotation.
        // The original renderer's Ry(180-bodyYaw) is applied only from verified
        // own motion below. Unknown motion keeps the last observed body pose.
        root.position.set(pose.x, pose.y, pose.z); root.visible = true
      },
      applyMotion (input) {
        guard(); root.userData.motion = animationController.apply(input)
        if (Number.isFinite(root.userData.motion.bodyRotationRadians)) root.rotation.y = root.userData.motion.bodyRotationRadians
        return root.userData.motion
      },
      motionState: () => root.userData.motion,
      applyHeldItems () { guard(); return unavailable('NATIVE_YSM_EQUIPMENT_UNSUPPORTED') },
      heldItemsState: () => unavailable('NATIVE_YSM_EQUIPMENT_UNSUPPORTED'),
      firstPersonItemsState: () => unavailable('NATIVE_YSM_FIRST_PERSON_UNSUPPORTED'),
      dispose () {
        if (disposed) return
        disposed = true; root.visible = false; root.removeFromParent(); model.dispose(); material.dispose(); texture.dispose(); texture.image?.close?.(); root.clear()
      }
    }
  } catch (error) { model?.dispose(); material?.dispose(); texture?.dispose?.(); root.clear(); throw error }
}
