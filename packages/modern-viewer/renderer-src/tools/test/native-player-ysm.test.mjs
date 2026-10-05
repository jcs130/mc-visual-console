import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { nativeSelfPlayerBinding, projectNativeYsmState, NATIVE_YSM_SOURCE, NATIVE_YSM_JAR_SHA256, NATIVE_YSM_NOTICE } from '../../src/native-viewer/native-ysm-state.js'
import { createNativeYsmPlayerActor, NATIVE_YSM_ASSETS } from '../../src/native-viewer/native-player-ysm.js'
import { NativeSelfPlayerController } from '../../src/native-viewer/native-self-player.js'

const UUID = '01234567-89ab-cdef-0123-456789abcdef'
const foreign = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const ysm = patch => ({ available: true, installed: true, source: NATIVE_YSM_SOURCE, playerUuid: UUID,
  modelId: 'misc/3_default_boy', texture: 'blue', enabled: true, mandatory: true, ysmVersion: '2.6.5', jarSha256: NATIVE_YSM_JAR_SHA256, ...patch })
const self = () => ({ uuid: UUID, skin: { kind: 'default', model: 'wide', assetPath: 'native/test/skin.png', sha256: 'original-skin-hash' } })
const fakeActor = assetInfo => {
  const root = new THREE.Group(); let disposals = 0
  return { root, assetInfo, dispose () { disposals++; root.removeFromParent() }, get disposals () { return disposals } }
}
const mockReader = present => ({ manifest: { assets: {}, sources: present ? [{ name: 'ysm-2.6.5-neoforge+mc1.21.1-release.jar' }] : [] } })

test('same-player attachment controls exact YSM identity independently of a default skin', () => {
  assert.equal(nativeSelfPlayerBinding({ ...self(), skin: { kind: 'unavailable' } }, UUID, ysm()).kind, 'ysm')
  assert.equal(nativeSelfPlayerBinding(self(), UUID).kind, 'minecraft')
  assert.equal(nativeSelfPlayerBinding(self(), UUID, { available: true, installed: false, enabled: false, source: NATIVE_YSM_SOURCE, playerUuid: UUID }, { ysmAssetsPresent: true }).kind, 'minecraft')
  for (const [patch, error] of [[{ playerUuid: foreign }, /IDENTITY/], [{ source: 'proxy' }, /IDENTITY/],
    [{ available: false, installed: true, reason: 'missing_attachment' }, /UNAVAILABLE/], [{ enabled: 'true' }, /INVALID/],
    [{ mandatory: undefined }, /INVALID/], [{ modelId: 'default' }, /MODEL_UNSUPPORTED/],
    [{ texture: '-' }, /TEXTURE_UNSUPPORTED/], [{ texture: '../red' }, /TEXTURE_UNSUPPORTED/],
    [{ ysmVersion: '2.6.6' }, /VERSION_UNSUPPORTED/], [{ jarSha256: '0'.repeat(64) }, /VERSION_UNSUPPORTED/]]) {
    assert.throws(() => nativeSelfPlayerBinding(self(), UUID, ysm(patch)), error)
  }
  assert.throws(() => nativeSelfPlayerBinding(self(), foreign, ysm()), /IDENTITY/)
  assert.throws(() => nativeSelfPlayerBinding(self(), UUID, undefined, { ysmAssetsPresent: true }), /ATTACHMENT_WAITING/)
  assert.equal(projectNativeYsmState({ ...ysm(), privateAuth: 'excluded' }, UUID).privateAuth, undefined)
  assert.equal(projectNativeYsmState({ ...ysm(), modelId: 'x'.repeat(257) }, UUID).available, false)
})

test('controller waits for a native attachment, rejects unknown YSM and restores an explicitly disabled body', async () => {
  const calls = [], changes = []
  const controller = new NativeSelfPlayerController(mockReader(true), {
    minecraftFactory: async () => { const actor = fakeActor({ path: self().skin.assetPath, sha256: self().skin.sha256 }); calls.push(['minecraft', actor]); return actor },
    ysmFactory: async (reader, options) => { const actor = fakeActor({ kind: 'ysm', texture: options.ysm.texture }); calls.push(['ysm', actor]); return actor },
    onChange: (actor, status) => changes.push({ actor, status }) })
  await controller.update(self(), UUID)
  assert.equal(calls.length, 0); assert.match(changes.at(-1).status, /WAITING/)
  const blue = await controller.update(self(), UUID, ysm())
  assert.equal(calls.at(-1)[0], 'ysm'); assert.equal(changes.at(-1).status, NATIVE_YSM_NOTICE)
  const red = await controller.update(self(), UUID, ysm({ texture: 'red' }))
  assert.equal(blue.disposals, 1); assert.equal(red.assetInfo.texture, 'red')
  await controller.update(self(), UUID, ysm({ modelId: 'unported/character' }))
  assert.equal(red.disposals, 1); assert.equal(controller.actor, null); assert.equal(calls.length, 2)
  assert.match(changes.at(-1).status, /MODEL_UNSUPPORTED/)
  const original = await controller.update(self(), UUID, ysm({ enabled: false }))
  assert.equal(calls.at(-1)[0], 'minecraft'); assert.equal(controller.actor, original)
  await controller.update(self(), UUID, ysm({ available: false, reason: 'attachment_missing' }))
  assert.equal(original.disposals, 1); assert.equal(controller.actor, null)
  controller.dispose()
})

test('asynchronous blue-red-blue loads cannot resurrect an old appearance or survive disconnect', async () => {
  const loads = [], actors = []
  const controller = new NativeSelfPlayerController(mockReader(true), { ysmFactory: (reader, options) => new Promise(resolve => {
    const actor = fakeActor({ kind: 'ysm', texture: options.ysm.texture }); actors.push(actor); loads.push(() => resolve(actor))
  }) })
  const first = controller.update(self(), UUID, ysm())
  const second = controller.update(self(), UUID, ysm({ texture: 'red' }))
  const third = controller.update(self(), UUID, ysm())
  loads[2](); await third; assert.equal(controller.actor, actors[2])
  loads[0](); await first; loads[1](); await second
  assert.equal(controller.actor, actors[2]); assert.equal(actors[0].disposals, 1); assert.equal(actors[1].disposals, 1)
  const pending = controller.update(self(), UUID, ysm({ texture: 'red' }))
  assert.equal(actors[2].disposals, 1); controller.clear('connection_ended'); loads[3](); await pending
  assert.equal(actors[3].disposals, 1); assert.equal(controller.actor, null)
  controller.dispose()
})

test('YSM factory failure stays unavailable and does not call the Minecraft provider', async () => {
  let minecraftCalls = 0, reason
  const controller = new NativeSelfPlayerController(mockReader(true), {
    minecraftFactory: async () => { minecraftCalls++; return fakeActor({}) },
    ysmFactory: async () => { throw Error('NATIVE_YSM_ASSET_HASH_MISMATCH') },
    onChange: (actor, status) => { reason = status } })
  await controller.update(self(), UUID, ysm())
  assert.equal(controller.actor, null); assert.equal(minecraftCalls, 0); assert.match(reason, /HASH_MISMATCH/)
  controller.dispose()
})

async function actualReader () {
  const directory = process.env.NATIVE_YSM_ASSET_DIR
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'native-assets.json'), 'utf8'))
  return new NativeAssetReader(manifest, filename => fs.readFile(path.join(directory, filename)))
}
const actual = { skip: !process.env.NATIVE_YSM_ASSET_DIR }
const decode = async bytes => {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return new THREE.Texture({ width: data.getUint32(16), height: data.getUint32(20) })
}

test('locked original YSM blue/red assets construct all bones/cubes and expose only static pose APIs', actual, async () => {
  for (const color of ['blue', 'red']) {
    const reader = await actualReader(), actor = await createNativeYsmPlayerActor(reader, { uuid: UUID, ysm: ysm({ texture: color }), loadTexture: decode })
    assert.equal(actor.assetInfo.kind, 'ysm'); assert.equal(actor.assetInfo.modelId, 'misc/3_default_boy')
    assert.equal(actor.assetInfo.texture, color); assert.equal(actor.assetInfo.modJarSha256, NATIVE_YSM_JAR_SHA256)
    assert.equal(actor.assetInfo.boneCount, 58); assert.equal(actor.assetInfo.cubeCount, 156); assert.equal(actor.assetInfo.faceCount, 936)
    assert.equal(actor.root.playerObject, undefined); assert.equal(actor.firstPersonRoot, undefined)
    assert.equal(actor.assetInfo.inventoryPreviewAvailable, false); assert.equal(actor.assetInfo.rendererParityVerified, false)
    const geometry = (await reader.json(NATIVE_YSM_ASSETS.model))['minecraft:geometry'][0]
    assert.deepEqual([...actor.model.bones.keys()], geometry.bones.map(bone => bone.name))
    actor.applyPose({ x: 4, y: 64, z: -8, yaw: .25, pitch: .5 })
    assert.deepEqual(actor.root.position.toArray(), [4, 64, -8]); assert.equal(actor.root.rotation.y, .25)
    const head = actor.model.bones.get('Head'), initial = actor.model.initial.get('Head').rotation.x
    head.rotation.x = 9; assert.equal(actor.applyMotion().available, false); assert.equal(head.rotation.x, initial)
    assert.equal(actor.applyHeldItems({}).available, false); assert.equal(actor.firstPersonItemsState().available, false)
    assert.throws(() => actor.applyPose({ x: 4, y: NaN, z: -8, yaw: .25, pitch: .5 }), /POSE_UNAVAILABLE/)
    let geometryDisposals = 0, materialDisposals = 0, textureDisposals = 0
    actor.root.traverse(node => { if (node.isMesh) node.geometry.addEventListener('dispose', () => geometryDisposals++) })
    const mesh = actor.root.getObjectByProperty('isMesh', true)
    mesh.material.addEventListener('dispose', () => materialDisposals++); mesh.material.map.addEventListener('dispose', () => textureDisposals++)
    actor.dispose(); actor.dispose()
    assert.equal(geometryDisposals, 936); assert.equal(materialDisposals, 1); assert.equal(textureDisposals, 1)
    assert.throws(() => actor.applyMotion(), /ACTOR_DISPOSED/)
  }
})

test('tampered provenance, bytes, overrides and decoder sizes cannot render a replacement', actual, async () => {
  const create = reader => createNativeYsmPlayerActor(reader, { uuid: UUID, ysm: ysm(), loadTexture: decode })
  let reader = await actualReader()
  reader.readBytes = async () => new Uint8Array([1, 2, 3])
  await assert.rejects(create(reader), /HASH_MISMATCH/)
  reader = await actualReader(); reader.manifest.assets[NATIVE_YSM_ASSETS.model].overriddenSources = ['client-local-unknown']
  await assert.rejects(create(reader), /ASSET_SOURCE_UNSUPPORTED/)
  reader = await actualReader(); reader.manifest.sources.find(source => source.name.startsWith('ysm-')).sha256 = '0'.repeat(64)
  await assert.rejects(create(reader), /JAR_SOURCE_UNSUPPORTED/)
  reader = await actualReader(); let released = 0
  const wrong = new THREE.Texture({ width: 64, height: 64 }); wrong.addEventListener('dispose', () => released++)
  await assert.rejects(createNativeYsmPlayerActor(reader, { uuid: UUID, ysm: ysm(), loadTexture: async () => wrong }), /DECODE_INVALID/)
  assert.equal(released, 1)
})
