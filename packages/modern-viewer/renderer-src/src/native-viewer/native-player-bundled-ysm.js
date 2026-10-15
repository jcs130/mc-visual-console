import * as THREE from 'three'
import { BundledAppearanceReader } from './native-bundled-appearance.js'
import { bundledPath } from './native-bundled-contract.js'
import { createNativeBedrockModel } from './native-entity-model-bedrock.js'
import { createNativeYsmAnimation, compileBundledYsmAnimations, sampleNativeYsmClip, applyNativeYsmBonePose } from './native-ysm-animation.js'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const notice = '自带 YSM 原几何与原关键帧：站立/行走/跑步/跳跃；装备、第一人称和其他动作未接入，客户端一致性未验'
async function loadPng (bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
  try { return await new THREE.TextureLoader().loadAsync(url) } finally { URL.revokeObjectURL(url) }
}

// This path is deliberately independent of native-player-ysm's strict official
// YSM 2.6.5 JAR profiles. No server attachment row is created or modified.
export async function createNativeBundledYsmPlayerActor (_nativeReader, { uuid, bundledAppearance, loadTexture = loadPng } = {}) {
  if (!UUID.test(uuid ?? '') || !(bundledAppearance?.reader instanceof BundledAppearanceReader)) throw Error('BUNDLED_APPEARANCE_IDENTITY_INVALID')
  uuid = uuid.toLowerCase()
  const reader = bundledAppearance.reader, choice = reader.get(bundledAppearance.id)
  if (choice.kind !== 'ysm') throw Error('BUNDLED_YSM_INVALID')
  const files = choice.files, definition = await reader.json(files.definition)
  const prefix = files.definition.slice(0, files.definition.lastIndexOf('/') + 1)
  const resolve = path => {
    if (!bundledPath(path) || !reader.catalog.assets[prefix + path]) throw Error('BUNDLED_YSM_DEFINITION_INVALID')
    return prefix + path
  }
  const player = definition.files?.player, width = definition.properties?.width_scale, height = definition.properties?.height_scale
  if (definition.spec !== 2 || definition.properties?.free !== true || !definition.metadata?.license?.type ||
      ![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 4) ||
      definition.properties.default_texture !== choice.texture || !player ||
      resolve(player.model?.main) !== files.model || resolve(player.model?.arm) !== files.armModel ||
      resolve(player.animation?.main) !== files.animation || resolve(player.animation?.arm) !== files.armAnimation ||
      resolve(player.animation?.extra) !== files.extraAnimation ||
      !Array.isArray(player.texture) || player.texture.length !== 1 || resolve(player.texture[0]) !== files.texture) throw Error('BUNDLED_YSM_DEFINITION_INVALID')
  // Verify every declared source, including currently unsupported arms/extra.
  await Promise.all(Object.values(files).map(path => reader.bytes(path)))
  const geometry = await reader.json(files.model), animation = await reader.json(files.animation)
  const bytes = await reader.bytes(files.texture), data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) throw Error('BUNDLED_YSM_TEXTURE_INVALID')
  const dimensions = geometry['minecraft:geometry']?.[0]?.description
  const tw = data.getUint32(16), th = data.getUint32(20)
  if (tw !== dimensions?.texture_width || th !== dimensions?.texture_height || tw < 1 || th < 1 || tw > 4096 || th > 4096) throw Error('BUNDLED_YSM_TEXTURE_INVALID')
  let texture, material, model, disposed = false
  const root = new THREE.Group(), orientation = new THREE.Group(), content = new THREE.Group()
  root.name = 'native-own-bundled-ysm-player'; root.visible = false
  root.add(orientation); orientation.add(content); orientation.scale.set(-1, -1, 1)
  orientation.position.y = Math.fround(.01); content.position.y = -1.5
  root.scale.set(width, height, width)
  try {
    texture = await loadTexture(bytes)
    if (!texture?.isTexture || texture.image?.width !== tw || texture.image?.height !== th) throw Error('BUNDLED_YSM_TEXTURE_DECODE_INVALID')
    texture.flipY = true; texture.colorSpace = THREE.SRGBColorSpace
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true
    material = new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide, alphaTest: .1, depthWrite: true })
    model = createNativeBedrockModel(geometry, material)
    const clips = compileBundledYsmAnimations(animation, model.bones.keys())
    for (const clip of ['idle', 'walk', 'run', 'jump']) if (!clips.has(clip)) throw Error('BUNDLED_YSM_MAIN_CLIP_MISSING')
    // Show the original idle baseline while waiting for same-player motion.
    applyNativeYsmBonePose(model, [sampleNativeYsmClip(clips, 'idle', 0)])
    content.add(model.root)
    const controller = createNativeYsmAnimation(model, animation, uuid, { bundledOriginal: true })
    const support = Object.freeze({ scope: 'plugin_bundled_original_numeric_main_clips', mainClips: ['idle', 'walk', 'run', 'jump'], notice,
      sourceRules: 'bounded_browser_same_player_motion_policy', equipmentRenderingAvailable: false,
      firstPersonRenderingAvailable: false, extraActionsRenderingAvailable: false, animationParityVerified: false, completeEntityParityVerified: false })
    const assetInfo = Object.freeze({ kind: 'ysm', uuid, name: choice.label, modelId: choice.modelId, texture: choice.texture,
      source: 'plugin_bundled', selectionSource: 'web_viewer_override', provenance: choice.provenance,
      ysmVersion: choice.ysmVersion, license: structuredClone(definition.metadata.license), authors: structuredClone(definition.metadata.authors ?? []),
      sourcePaths: Object.values(files), sourceHashes: Object.fromEntries(Object.entries(files).map(([kind, path]) => [kind, reader.catalog.assets[path].sha256])),
      scale: { width, height }, boneCount: model.bones.size, cubeCount: model.cubeCount, faceCount: model.faceCount,
      geometrySource: 'plugin_bundled_original_Bedrock', poseSource: 'original_numeric_animation_keyframes_bounded_browser_port',
      support, notice, headPoseRenderingAvailable: true, eyesRenderingAvailable: false, animationRenderingAvailable: true,
      equipmentRenderingAvailable: false, firstPersonRenderingAvailable: false, inventoryPreviewAvailable: true,
      geometryParityVerified: false, channelTransformParityVerified: false, rendererParityVerified: false,
      animationParityVerified: false, completeEntityParityVerified: false })
    root.userData = { playerUuid: uuid, assetInfo, motion: controller.current() }
    const guard = () => { if (disposed) throw Error('BUNDLED_YSM_ACTOR_DISPOSED') }
    const unavailable = reason => ({ available: false, reason, scope: 'plugin_bundled_original_model', animationParityVerified: false })
    return { root, model, assetInfo,
      applyPose (pose) {
        guard()
        if (!pose || ![pose.x, pose.y, pose.z, pose.yaw, pose.pitch].every(Number.isFinite)) throw Error('BUNDLED_YSM_POSE_UNAVAILABLE')
        root.position.set(pose.x, pose.y, pose.z); root.visible = true
      },
      applyMotion (input) {
        guard(); root.userData.motion = controller.apply(input)
        if (Number.isFinite(root.userData.motion.bodyRotationRadians)) root.rotation.y = root.userData.motion.bodyRotationRadians
        return root.userData.motion
      },
      motionState: () => root.userData.motion,
      applyHeldItems () { guard(); return unavailable('BUNDLED_YSM_EQUIPMENT_UNSUPPORTED') },
      heldItemsState: () => unavailable('BUNDLED_YSM_EQUIPMENT_UNSUPPORTED'),
      firstPersonItemsState: () => unavailable('BUNDLED_YSM_FIRST_PERSON_UNSUPPORTED'),
      dispose () {
        if (disposed) return
        disposed = true; root.visible = false; root.removeFromParent(); model.dispose(); material.dispose(); texture.dispose(); texture.image?.close?.(); root.clear()
      }
    }
  } catch (error) { model?.dispose(); material?.dispose(); texture?.dispose(); texture?.image?.close?.(); root.clear(); throw error }
}
