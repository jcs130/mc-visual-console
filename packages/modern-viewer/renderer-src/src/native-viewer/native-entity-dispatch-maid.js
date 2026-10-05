import * as THREE from 'three'
import { NativeAssetReader } from './model-loader.js'
import { ENTITY_MODEL_CLIENT_SHA256 } from './native-entity-model.js'
import { createNativeBedrockModel } from './native-entity-model-bedrock.js'
import { NATIVE_MOB_MOTION_SOURCE } from './native-entity-motion.js'

export const NATIVE_MAID_MODEL_ID = 'touhou_little_maid:hakurei_reimu_type_b_1720614ea46709023787aae005df1134'
export const NATIVE_MAID_JAR_SHA256 = 'f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27'
const PREFIX = 'assets/touhou_little_maid/tlm_custom_pack/touhou_little_maid-1.0.0/assets/touhou_little_maid/'
export const NATIVE_MAID_ASSETS = Object.freeze({
  definition: PREFIX + 'maid_model.json', model: PREFIX + 'models/entity/hakurei_reimu_type_b.json', texture: PREFIX + 'textures/entity/hakurei_reimu_vengeful.png'
})
const HASHES = { definition: '611335f5f83fa314393a0c59f2c2d2d873e232a6e3fd77fb2d0915f7009269bc',
  model: '1aac31d5759bc75d728a855bd366b1689800e747478179ec1fb8b1f255a8aa18', texture: '992c4642a89d65577f24549c9fd71cce1c5fbc4e65f90506ade4b4db89626a48' }
export const NATIVE_MAID_ANIMATIONS = Object.freeze(['maid/default/head/default', 'maid/default/head/beg', 'maid/default/head/music_shake',
  'maid/default/head/blink', 'maid/default/head/hurt', 'maid/default/tail/default', 'maid/default/arm/default', 'maid/default/arm/swing',
  'maid/default/leg/default', 'maid/default/sit/default', 'maid/default/sit/skirt_rotation', 'maid/default/task/danmaku_attack',
  'base/rotation/y_high_speed', 'base/float/default', 'base/rotation/z_normal_speed'].map(path => `touhou_little_maid:animation/${path}.js`))
const TYPES = { byte: 0, string: 4, boolean: 8, float: 3, pose: 21, item_stack: 7 }
const F = Math.fround, RAD = F(Math.PI / 180), wrap = value => ((value + 180) % 360 + 360) % 360 - 180
const lerp = (a, b, partial) => a + (b - a) * partial, angle = (a, b, partial) => a + wrap(b - a) * partial
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const RESOURCE = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/

function emptyItem (item) {
  // Native 1.21.1 Slot encodes empty as { itemCount: 0 }. A missing or
  // malformed stack is not evidence that an original render layer is empty.
  return item !== null && typeof item === 'object' && !Array.isArray(item) && item.itemCount === 0
}

function metadata (entity, key, type, defaultValue) {
  const entry = entity.metadata.find(entry => entry.key === key)
  if (!entry) return defaultValue // Exact locked defineSynchedData value.
  if (entry.type !== type && entry.type !== TYPES[type]) throw Error(`NATIVE_TLM_METADATA_SERIALIZER_UNSUPPORTED:${key}`)
  if (type === 'boolean' && typeof entry.value !== 'boolean' || type === 'string' && typeof entry.value !== 'string' ||
      type === 'float' && !Number.isFinite(entry.value) || ['byte', 'pose'].includes(type) && !Number.isInteger(entry.value) ||
      type === 'byte' && (entry.value < -128 || entry.value > 127)) throw Error(`NATIVE_TLM_METADATA_VALUE_INVALID:${key}`)
  return entry.value
}

export function nativeMaidRenderState (entity) {
  if (entity?.name !== 'touhou_little_maid:maid' || !Number.isSafeInteger(entity.entityId) || !UUID.test(entity.uuid ?? '') || !Array.isArray(entity.metadata) ||
      !entity.position || ![entity.position.x, entity.position.y, entity.position.z, entity.yaw, entity.pitch, entity.headYaw].every(Number.isFinite)) throw Error('NATIVE_TLM_ENTITY_STATE_INVALID')
  const modelId = metadata(entity, 23, 'string', null)
  if (modelId !== NATIVE_MAID_MODEL_ID) throw Error(`NATIVE_TLM_MODEL_VARIANT_UNSUPPORTED:${modelId}`)
  if (metadata(entity, 19, 'boolean', false)) throw Error('NATIVE_TLM_YSM_RENDERER_UNSUPPORTED')
  const flags = metadata(entity, 0, 'byte', 0), pose = metadata(entity, 6, 'pose', 0)
  if (pose !== 0 || flags & 16) throw Error(`NATIVE_TLM_POSE_UNSUPPORTED:${pose}`)
  if (flags & 1) throw Error('NATIVE_TLM_FIRE_LAYER_UNSUPPORTED')
  if (flags & 64) throw Error('NATIVE_TLM_OUTLINE_UNSUPPORTED')
  if (metadata(entity, 16, 'boolean', false)) throw Error('NATIVE_TLM_BABY_MODEL_UNSUPPORTED')
  if (metadata(entity, 8, 'byte', 0) & 1) throw Error('NATIVE_TLM_ITEM_USE_UNSUPPORTED')
  if (!Array.isArray(entity.equipment) || entity.equipment.some(entry => !emptyItem(entry?.item))) throw Error('NATIVE_TLM_EQUIPMENT_LAYER_UNSUPPORTED')
  const backpackType = metadata(entity, 38, 'string', 'touhou_little_maid:empty')
  const showItem = metadata(entity, 39, 'item_stack', { itemCount: 0 })
  if (backpackType !== 'touhou_little_maid:empty' || !emptyItem(showItem)) throw Error('NATIVE_TLM_BACKPACK_LAYER_UNSUPPORTED')
  const tracked = entity.maidRenderState
  if (!tracked || tracked.source !== 'same_player_tracked_entity' || tracked.entityId !== entity.entityId || tracked.uuid !== entity.uuid ||
      !UUID.test(tracked.playerUuid ?? '') || !RESOURCE.test(tracked.dimension ?? '')) throw Error('NATIVE_TLM_TRACKED_RENDER_STATE_UNAVAILABLE')
  if (typeof tracked.passenger !== 'boolean' || typeof tracked.inSwimFluid !== 'boolean' || !Number.isFinite(tracked.swimAmount) ||
      !Object.hasOwn(tracked, 'backItem') || !Object.hasOwn(tracked, 'bannerItem') || typeof tracked.backpackType !== 'string') throw Error('NATIVE_TLM_TRACKED_RENDER_STATE_INCOMPLETE')
  if (tracked.passenger) throw Error('NATIVE_TLM_PASSENGER_POSE_UNSUPPORTED')
  if (tracked.inSwimFluid || tracked.swimAmount !== 0) throw Error('NATIVE_TLM_SWIM_POSE_UNSUPPORTED')
  if (tracked.backItem !== null) throw Error('NATIVE_TLM_BACK_ITEM_LAYER_UNSUPPORTED')
  if (tracked.bannerItem !== null) throw Error('NATIVE_TLM_BANNER_LAYER_UNSUPPORTED')
  if (tracked.backpackType !== backpackType) throw Error('NATIVE_TLM_TRACKED_METADATA_MISMATCH')
  const health = metadata(entity, 9, 'float', 1)
  if (health <= 0) throw Error('NATIVE_TLM_DEATH_POSE_UNSUPPORTED')
  return { name: entity.name, modelId, invisible: Boolean(flags & 32), alive: true, health,
    sitting: Boolean(metadata(entity, 17, 'byte', 0) & 1), begging: metadata(entity, 26, 'boolean', false),
    armRise: metadata(entity, 33, 'boolean', false), task: metadata(entity, 25, 'string', 'touhou_little_maid:idle'),
    defaultsSource: 'TouhouLittleMaid_1.5.3_and_Minecraft_1.21.1_defineSynchedData' }
}

export function applyNativeMaidAnimation (model, state, motion, uuid, partial) {
  if (motion?.source !== NATIVE_MOB_MOTION_SOURCE || motion.tickMs !== 50 || !Number.isSafeInteger(motion.tick) || motion.tick < 0 ||
      !Number.isFinite(motion.sampledAt) || !motion.position || !motion.previous?.position || !motion.walk || !motion.maid ||
      ![...['x', 'y', 'z'].map(axis => motion.position[axis]), ...['x', 'y', 'z'].map(axis => motion.previous.position[axis]),
        motion.bodyYaw, motion.headYaw, motion.pitch, motion.previous.bodyYaw, motion.previous.headYaw, motion.previous.pitch,
        motion.walk.speedOld, motion.walk.speed, motion.walk.position, motion.maid.hurtTime, motion.maid.attackAnim, motion.maid.swingTime,
        motion.maid.swimAmount, motion.maid.swimAmountOld, partial].every(Number.isFinite) || partial < 0 || partial > 1 ||
      !Number.isInteger(motion.maid.hurtTime) || motion.maid.hurtTime < 0 || motion.maid.hurtTime > 10 ||
      typeof motion.maid.hurtPending !== 'boolean' || typeof motion.maid.swingPending !== 'boolean' || !Number.isSafeInteger(motion.maid.animationId)) throw Error('NATIVE_TLM_MOTION_UNAVAILABLE')
  if (motion.maid.hurtPending) throw Error('NATIVE_TLM_HURT_EVENT_UNAVAILABLE')
  if (motion.maid.animationId !== 0) throw Error(`NATIVE_TLM_SPECIAL_ANIMATION_UNSUPPORTED:${motion.maid.animationId}`)
  if (motion.maid.hurtTime > 0) throw Error('NATIVE_TLM_HURT_OVERLAY_UNSUPPORTED')
  if (motion.maid.swingPending || motion.maid.attackAnim !== 0 || motion.maid.swingTime !== 0) throw Error('NATIVE_TLM_SWING_DURATION_UNAVAILABLE')
  if (motion.maid.swimAmount !== 0 || motion.maid.swimAmountOld !== 0) throw Error('NATIVE_TLM_SWIM_POSE_UNSUPPORTED')
  model.reset()
  const bones = model.bones, initial = model.initial
  const age = F(motion.tick + partial), speed = F(lerp(motion.walk.speedOld, motion.walk.speed, partial))
  const limb = F(motion.walk.position - F(motion.walk.speed * F(1 - partial)))
  const bodyYaw = angle(motion.previous.bodyYaw, motion.bodyYaw, partial), headYaw = angle(motion.previous.headYaw, motion.headYaw, partial)
  // Original ordered Java InnerAnimation list from the selected pack definition.
  bones.get('head').rotation.x = F(F(lerp(motion.previous.pitch, motion.pitch, partial)) * RAD)
  bones.get('head').rotation.y = F(F(wrap(headYaw - bodyYaw)) * RAD)
  bones.get('head').rotation.z = state.begging ? F(.139) : initial.get('head').rotation.z
  bones.get('begShow').visible = state.begging
  // MaidBaseAnimation.isPortableAudioPlay() is literal false in this JAR.
  const signed = BigInt.asIntN(64, BigInt('0x' + uuid.replaceAll('-', '').slice(16))), abs = signed === -(1n << 63n) ? signed : signed < 0 ? -signed : signed
  const remainder = F(F(age + Number(abs % 10n)) % 60)
  bones.get('blink').visible = remainder > 55 && remainder < 60
  bones.get('hurtBlink').visible = false // Hurt states reject above until the original overlay is ported.
  const tail = bones.get('tail')
  tail.rotation.x = F(F(Math.sin(age * .2) * .05) + initial.get('tail').rotation.x)
  tail.rotation.z = F(F(Math.cos(age * .2) * .1) + initial.get('tail').rotation.z)
  for (const [name, sign] of [['armLeft', -1], ['armRight', 1]]) {
    const arm = bones.get(name)
    arm.rotation.x = F(sign * Math.cos(limb * .67) * .7 * speed)
    arm.rotation.y = initial.get(name).rotation.y
    arm.rotation.z = F(-sign * Math.cos(age * .05) * .05 + initial.get(name).rotation.z)
  }
  // arm/swing requires a nonempty main hand; the supported range is empty.
  bones.get('legLeft').rotation.x = F(Math.cos(limb * .67) * .3 * speed)
  bones.get('legRight').rotation.x = F(-Math.cos(limb * .67) * .3 * speed)
  let translateY = 0
  if (state.sitting) {
    bones.get('armLeft').rotation.x = F(-.798); bones.get('armLeft').rotation.z = F(.274)
    bones.get('armRight').rotation.x = F(-.798); bones.get('armRight').rotation.z = F(-.274)
    bones.get('legLeft').rotation.x = F(-1.134); bones.get('legLeft').rotation.z = F(-.262)
    bones.get('legRight').rotation.x = F(-1.134); bones.get('legRight').rotation.z = F(.262)
    translateY = .3
  }
  bones.get('sittingRotationSkirt').rotation.x = state.sitting ? F(-.567) : initial.get('sittingRotationSkirt').rotation.x
  bones.get('danmakuAttackShow').visible = state.task.split(':')[1] === 'danmaku_attack'
  bones.get('yRotationHighA').rotation.y = F(F(F(age * 4) % 360) * .017453292)
  bones.get('sinFloat').position.y = initial.get('sinFloat').position.y + F(Math.sin(age * .1) * .05)
  bones.get('cosFloat').position.y = initial.get('cosFloat').position.y + F(Math.cos(age * .1) * .05)
  for (const name of ['zRotationNormalA', 'zRotationNormalB']) bones.get(name).rotation.z = F(F(age % 360) * .017453292)
  return { bodyYaw, translateY, age, limbSwing: limb, limbSwingAmount: speed }
}

async function texture (bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
  try { return await new THREE.TextureLoader().loadAsync(url) } finally { URL.revokeObjectURL(url) }
}

export async function createNativeMaidActor (reader, entity, { loadTexture = texture } = {}) {
  if (!(reader instanceof NativeAssetReader) || reader.manifest.clientJarSha256 !== ENTITY_MODEL_CLIENT_SHA256) throw Error('NATIVE_TLM_CLIENT_SOURCE_UNSUPPORTED')
  const sources = reader.manifest.sources?.filter(source => source.name === 'touhoulittlemaid-1.5.3-neoforge+mc1.21.1.jar')
  if (sources?.length !== 1 || sources[0].sha256 !== NATIVE_MAID_JAR_SHA256 || sources[0].explicitOverride) throw Error('NATIVE_TLM_JAR_SOURCE_UNSUPPORTED')
  for (const [kind, path] of Object.entries(NATIVE_MAID_ASSETS)) {
    const entry = reader.manifest.assets[path]
    if (entry?.sha256 !== HASHES[kind] || entry.source !== sources[0].name || entry.overriddenSources?.length || entry.variants?.some(variant => variant.sha256 !== entry.sha256)) throw Error(`NATIVE_TLM_ASSET_SOURCE_UNSUPPORTED:${kind}`)
  }
  const state = nativeMaidRenderState(entity), pack = await reader.json(NATIVE_MAID_ASSETS.definition)
  const definition = pack.model_list?.filter(model => model.model_id === 'touhou_little_maid:hakurei_reimu_type_b')
  if (definition?.length !== 1 || definition[0].model !== 'touhou_little_maid:models/entity/hakurei_reimu_type_b.json' ||
      !definition[0].extra_textures?.includes('touhou_little_maid:textures/entity/hakurei_reimu_vengeful.png') || JSON.stringify(definition[0].animation) !== JSON.stringify(NATIVE_MAID_ANIMATIONS) ||
      definition[0].render_entity_scale !== undefined && definition[0].render_entity_scale !== 1) throw Error('NATIVE_TLM_MODEL_DEFINITION_UNSUPPORTED')
  const root = new THREE.Group(), orientation = new THREE.Group(), content = new THREE.Group()
  root.add(orientation); orientation.add(content); orientation.scale.set(-1, -1, 1); content.position.y = -1.501
  let tex, material, model, disposed = false
  try {
    tex = await loadTexture(await reader.bytes(NATIVE_MAID_ASSETS.texture))
    if (!tex?.isTexture || tex.image?.width !== 128 || tex.image?.height !== 128 || reader.manifest.assets[NATIVE_MAID_ASSETS.texture + '.mcmeta']) throw Error('NATIVE_TLM_TEXTURE_UNSUPPORTED')
    tex.flipY = true; tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true
    material = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, alphaTest: .1, depthWrite: true })
    model = createNativeBedrockModel(await reader.json(NATIVE_MAID_ASSETS.model), material)
    if (model.bones.size !== 73 || model.cubeCount !== 63 || model.zeroThicknessCubes !== 28) throw Error('NATIVE_TLM_GEOMETRY_SOURCE_MISMATCH')
    content.add(model.root)
    const assetInfo = { type: state.name, modelId: state.modelId, clientJarSha256: ENTITY_MODEL_CLIENT_SHA256, modJarSha256: NATIVE_MAID_JAR_SHA256,
      sourcePaths: Object.values(NATIVE_MAID_ASSETS), sourceHashes: { ...HASHES }, boneCount: model.bones.size, cubeCount: model.cubeCount, zeroThicknessCubes: model.zeroThicknessCubes,
      geometrySource: 'TouhouLittleMaid_1.5.3_original_SimpleBedrockModel', animationSource: 'TouhouLittleMaid_1.5.3_original_ordered_InnerAnimation',
      animationOrder: [...NATIVE_MAID_ANIMATIONS], metadataDefaultsSource: state.defaultsSource, activeJavaClientPackPriorityVerified: false,
      extensionParityVerified: false, lightingParityVerified: false, animationParityVerified: false, completeEntityParityVerified: false }
    const actor = { root, assetInfo, update (next, now = Date.now()) {
      if (disposed) throw Error('NATIVE_ENTITY_ACTOR_DISPOSED')
      if (next.entityId !== entity.entityId || next.uuid !== entity.uuid || next.name !== entity.name) throw Error('NATIVE_ENTITY_ACTOR_IDENTITY_MISMATCH')
      const current = nativeMaidRenderState(next), motion = next.motion
      const partial = Math.max(0, Math.min(1, (now - (motion?.sampledAt ?? now)) / 50))
      const animation = applyNativeMaidAnimation(model, current, motion, next.uuid, partial)
      root.position.set(...['x', 'y', 'z'].map(axis => lerp(motion.previous.position[axis], motion.position[axis], partial)))
      root.rotation.y = Math.PI - animation.bodyYaw * Math.PI / 180; root.visible = !current.invisible
      content.position.y = -1.501 + animation.translateY
      assetInfo.motionSource = motion.source; assetInfo.motionTick = motion.tick
      return actor
    }, dispose () { if (disposed) return; disposed = true; root.visible = false; root.removeFromParent(); model.dispose(); material.dispose(); tex.dispose(); root.clear() } }
    actor.update(entity, Date.now()); return actor
  } catch (error) { model?.dispose(); material?.dispose(); tex?.dispose(); root.clear(); throw error }
}
