import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { createNativeEntityActor, NATIVE_ENTITY_RENDER_TYPES } from '../../src/native-viewer/native-entity-dispatch.js'
import { nativeMaidRenderState, applyNativeMaidAnimation, NATIVE_MAID_MODEL_ID, NATIVE_MAID_ASSETS, NATIVE_MAID_ANIMATIONS } from '../../src/native-viewer/native-entity-dispatch-maid.js'
import { createNativeBedrockModel } from '../../src/native-viewer/native-entity-model-bedrock.js'
import { createNativeEntityMotion } from '../../src/native-viewer/native-entity-motion.js'

const maid = () => {
  const entity = { entityId: 12, uuid: '00000000-0000-0000-0000-000000000000', name: 'touhou_little_maid:maid', position: { x: 10, y: 64, z: 12 },
    yaw: 0, pitch: 0, headYaw: 0, spawnedAt: 1000, metadata: [{ key: 23, type: 'string', value: NATIVE_MAID_MODEL_ID }], equipment: [], cues: [] }
  entity.maidRenderState = { source: 'same_player_tracked_entity', playerUuid: '12345678-1234-5678-1234-567812345678', entityId: entity.entityId, uuid: entity.uuid,
    dimension: 'minecraft:overworld', passenger: false, inSwimFluid: false, swimAmount: 0, backpackType: 'touhou_little_maid:empty', backItem: null, bannerItem: null }
  entity.motion = createNativeEntityMotion(entity).current()
  return entity
}

test('TLM selects only the received type-B vengeful ID and original synchronized defaults', () => {
  const entity = maid(), state = nativeMaidRenderState(entity)
  assert.equal(state.modelId, NATIVE_MAID_MODEL_ID)
  assert.ok(NATIVE_ENTITY_RENDER_TYPES.includes(entity.name))
  assert.equal(state.task, 'touhou_little_maid:idle'); assert.equal(state.begging, false); assert.equal(state.sitting, false)
  assert.throws(() => nativeMaidRenderState({ ...entity, metadata: [] }), /MODEL_VARIANT_UNSUPPORTED/)
  assert.throws(() => nativeMaidRenderState({ ...entity, metadata: [{ key: 23, type: 'string', value: 'touhou_little_maid:hakurei_reimu_type_b' }] }), /MODEL_VARIANT_UNSUPPORTED/)
  assert.throws(() => nativeMaidRenderState({ ...entity, metadata: [{ key: 23, type: 'int', value: 23 }] }), /SERIALIZER_UNSUPPORTED/)
})

test('TLM tracked bridge identity, real nonempty layers and unsupported poses fail closed', () => {
  const entity = maid()
  assert.throws(() => nativeMaidRenderState({ ...entity, maidRenderState: null }), /TRACKED_RENDER_STATE_UNAVAILABLE/)
  for (const patch of [{ source: 'proxy' }, { entityId: 99 }, { uuid: '12345678-1234-5678-1234-567812345678' }])
    assert.throws(() => nativeMaidRenderState({ ...entity, maidRenderState: { ...entity.maidRenderState, ...patch } }), /TRACKED_RENDER_STATE_UNAVAILABLE/)
  for (const [patch, reason] of [[{ passenger: true }, /PASSENGER/], [{ swimAmount: .1 }, /SWIM/], [{ inSwimFluid: true }, /SWIM/],
    [{ backItem: { itemId: 'minecraft:diamond_sword', count: 1 } }, /BACK_ITEM/], [{ bannerItem: {} }, /BANNER/], [{ backpackType: 'mod:pack' }, /MISMATCH/]])
    assert.throws(() => nativeMaidRenderState({ ...entity, maidRenderState: { ...entity.maidRenderState, ...patch } }), reason)
  const missing = { ...entity.maidRenderState }; delete missing.backItem
  assert.throws(() => nativeMaidRenderState({ ...entity, maidRenderState: missing }), /INCOMPLETE/)
  for (const entry of [{ key: 6, type: 'pose', value: 2 }, { key: 19, type: 'boolean', value: true }, { key: 8, type: 'byte', value: 1 }, { key: 16, type: 'boolean', value: true }])
    assert.throws(() => nativeMaidRenderState({ ...entity, metadata: [...entity.metadata, entry] }), /UNSUPPORTED/)
  assert.throws(() => nativeMaidRenderState({ ...entity, equipment: [{ slot: 0, item: { itemCount: 1, itemId: 7 } }] }), /EQUIPMENT_LAYER/)
  assert.doesNotThrow(() => nativeMaidRenderState({ ...entity, equipment: [{ slot: 0, item: { itemCount: 0 } }] }))
  for (const item of [null, undefined, {}, { count: 0 }, { itemCount: -1 }])
    assert.throws(() => nativeMaidRenderState({ ...entity, equipment: [{ slot: 0, item }] }), /EQUIPMENT_LAYER/)
  assert.throws(() => nativeMaidRenderState({ ...entity, metadata: [...entity.metadata, { key: 39, type: 'item_stack', value: null }] }), /BACKPACK_LAYER/)
})

test('original TLM ordered animations preserve blink boundaries, initial tail tilt, sitting and task visibility', { skip: !process.env.NATIVE_ENTITY_ASSET_DIR }, async () => {
  const entity = maid(), definition = JSON.parse(await fs.readFile(path.join(process.env.NATIVE_ENTITY_ASSET_DIR, NATIVE_MAID_ASSETS.model), 'utf8'))
  const material = new THREE.MeshBasicMaterial(), model = createNativeBedrockModel(definition, material), state = nativeMaidRenderState(entity)
  applyNativeMaidAnimation(model, state, entity.motion, entity.uuid, 0)
  assert.equal(model.bones.get('blink').visible, false); assert.equal(model.bones.get('begShow').visible, false)
  assert.equal(model.bones.get('hurtBlink').visible, false); assert.equal(model.bones.get('danmakuAttackShow').visible, false)
  assert.equal(model.bones.get('tail').rotation.x, model.initial.get('tail').rotation.x)
  assert.equal(model.bones.get('tail').rotation.z, Math.fround(.1))
  assert.equal(model.bones.get('armLeft').rotation.z, Math.fround(.05 + model.initial.get('armLeft').rotation.z))
  for (const [tick, partial, visible] of [[55, 0, false], [55, .1, true], [59, .9, true], [60, 0, false]]) {
    applyNativeMaidAnimation(model, state, { ...entity.motion, tick }, entity.uuid, partial)
    assert.equal(model.bones.get('blink').visible, visible, `original open interval blink at ${tick}+${partial}`)
  }
  const animation = applyNativeMaidAnimation(model, { ...state, sitting: true, begging: true, task: 'touhou_little_maid:danmaku_attack' }, entity.motion, entity.uuid, 0)
  assert.equal(model.bones.get('head').rotation.z, Math.fround(.139)); assert.equal(model.bones.get('begShow').visible, true)
  assert.equal(model.bones.get('sittingRotationSkirt').rotation.x, Math.fround(-.567))
  assert.equal(model.bones.get('legLeft').rotation.x, Math.fround(-1.134)); assert.equal(model.bones.get('armRight').rotation.z, Math.fround(-.274))
  assert.equal(animation.translateY, .3); assert.equal(model.bones.get('danmakuAttackShow').visible, true)
  applyNativeMaidAnimation(model, state, entity.motion, entity.uuid, 0)
  assert.equal(model.bones.get('head').rotation.z, model.initial.get('head').rotation.z); assert.equal(model.bones.get('sittingRotationSkirt').rotation.x, 0)
  model.dispose(); material.dispose()
})

test('TLM original unsupported hurt overlay, missing hurt event, swing duration and swim history are explicit', { skip: !process.env.NATIVE_ENTITY_ASSET_DIR }, async () => {
  const entity = maid(), definition = JSON.parse(await fs.readFile(path.join(process.env.NATIVE_ENTITY_ASSET_DIR, NATIVE_MAID_ASSETS.model), 'utf8'))
  const material = new THREE.MeshBasicMaterial(), model = createNativeBedrockModel(definition, material), state = nativeMaidRenderState(entity)
  for (const [patch, reason] of [[{ hurtTime: 10 }, /HURT_OVERLAY/], [{ hurtPending: true }, /HURT_EVENT/], [{ swingPending: true }, /SWING_DURATION/],
    [{ attackAnim: .5 }, /SWING_DURATION/], [{ swimAmountOld: .09 }, /SWIM_POSE/], [{ animationId: 1 }, /SPECIAL_ANIMATION/],
    [{ hurtPending: undefined }, /MOTION_UNAVAILABLE/], [{ swingPending: undefined }, /MOTION_UNAVAILABLE/], [{ hurtTime: -1 }, /MOTION_UNAVAILABLE/]])
    assert.throws(() => applyNativeMaidAnimation(model, state, { ...entity.motion, maid: { ...entity.motion.maid, ...patch } }, entity.uuid, 0), reason)
  model.dispose(); material.dispose()
})

test('factory creates the original 73-bone nearby maid with exact nested source paths and disposes it', { skip: !process.env.NATIVE_ENTITY_ASSET_DIR }, async () => {
  const directory = process.env.NATIVE_ENTITY_ASSET_DIR, manifest = JSON.parse(await fs.readFile(path.join(directory, 'native-assets.json'), 'utf8'))
  const reader = new NativeAssetReader(manifest, filename => fs.readFile(path.join(directory, filename)))
  const decode = async bytes => { const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); return new THREE.Texture({ width: view.getUint32(16), height: view.getUint32(20) }) }
  const entity = maid(), actor = await createNativeEntityActor(reader, entity, { loadTexture: decode })
  assert.equal(actor.root.visible, true); assert.equal(actor.assetInfo.boneCount, 73); assert.equal(actor.assetInfo.cubeCount, 63)
  assert.equal(actor.assetInfo.zeroThicknessCubes, 28)
  assert.deepEqual(actor.assetInfo.sourcePaths, Object.values(NATIVE_MAID_ASSETS))
  assert.deepEqual(actor.assetInfo.animationOrder, NATIVE_MAID_ANIMATIONS)
  assert.equal(actor.assetInfo.activeJavaClientPackPriorityVerified, false); assert.equal(actor.assetInfo.completeEntityParityVerified, false)
  actor.update(entity, 1000); assert.deepEqual(actor.root.position.toArray(), [10, 64, 12])
  const sitting = { ...entity, metadata: [...entity.metadata, { key: 17, type: 'byte', value: 1 }] }
  actor.update(sitting, 1000); assert.equal(actor.root.children[0].children[0].position.y, -1.501 + .3)
  assert.throws(() => actor.update({ ...entity, uuid: '12345678-1234-5678-1234-567812345678' }, 1000), /IDENTITY_MISMATCH/)
  let disposed = 0; actor.root.traverse(object => { if (object.isMesh) object.geometry.addEventListener('dispose', () => disposed++) })
  actor.dispose(); actor.dispose(); assert.equal(disposed, 378); assert.equal(actor.root.children.length, 0)
  const changed = structuredClone(manifest); changed.assets[NATIVE_MAID_ASSETS.texture].sha256 = '0'.repeat(64)
  await assert.rejects(() => createNativeEntityActor(new NativeAssetReader(changed, filename => fs.readFile(path.join(directory, filename))), entity, { loadTexture: decode }), /ASSET_SOURCE_UNSUPPORTED/)
})
