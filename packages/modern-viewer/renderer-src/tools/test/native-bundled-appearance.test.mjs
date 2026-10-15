import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { loadBundledAppearances } from '../../host/native-bundled-appearances.mjs'
import { BundledAppearanceReader } from '../../src/native-viewer/native-bundled-appearance.js'
import { BUNDLED_SCHEMA, BUNDLED_LIMITS } from '../../src/native-viewer/native-bundled-contract.js'
import { NativeSelfPlayerController } from '../../src/native-viewer/native-self-player.js'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { createNativePlayerActor, PLAYER_CLIENT_JAR_SHA256 } from '../../src/native-viewer/native-player.js'
import { createNativeBundledYsmPlayerActor } from '../../src/native-viewer/native-player-bundled-ysm.js'
import { compileBundledYsmAnimations, sampleNativeYsmClip, applyNativeYsmBonePose } from '../../src/native-viewer/native-ysm-animation.js'
import { createNativeBedrockModel } from '../../src/native-viewer/native-entity-model-bedrock.js'

const UUID = '01234567-89ab-cdef-0123-456789abcdef', OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const settle = () => new Promise(resolve => setImmediate(resolve))
const self = uuid => ({ uuid, entityId: 42, skin: { kind: 'default', assetPath: 'vanilla.png', sha256: 'original' } })
const fake = info => ({ assetInfo: info, disposed: 0, dispose () { this.disposed++ } })
async function removeTemporary (root, prefix) {
  const resolved = await fs.realpath(root), parent = await fs.realpath(os.tmpdir())
  assert.equal(path.dirname(resolved), parent); assert.ok(path.basename(resolved).startsWith(prefix))
  await fs.rm(resolved, { recursive: true, force: true })
}
async function fixture (t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bundled-appearance-'))
  t.after(() => removeTemporary(root, 'bundled-appearance-'))
  const bytes = Buffer.from('test fixture only')
  const catalog = { schema: BUNDLED_SCHEMA, source: 'plugin_bundled', assets: { 'skin.png': { bytes: bytes.length, sha256: sha(bytes) } },
    appearances: [{ id: 'test', kind: 'skin', label: 'Test original', path: 'skin.png', model: 'slim', provenance: 'Synthetic transport fixture; never shipped as a skin' }] }
  const file = path.join(root, 'catalog.json')
  await fs.writeFile(path.join(root, 'skin.png'), bytes)
  const write = () => fs.writeFile(file, JSON.stringify(catalog))
  await write()
  return { root, file, bytes, catalog, write }
}

test('verified local catalog snapshots only listed bytes and carries changes in digest', async t => {
  const f = await fixture(t), bundle = await loadBundledAppearances(f.file)
  assert.equal(bundle.metadata.available, true); assert.deepEqual(bundle.read('skin.png'), f.bytes)
  assert.equal(bundle.read('../catalog.json'), null); assert.equal(bundle.read('catalog.json'), null)
  const snapshot = bundle.read('skin.png'); snapshot.fill(0)
  await fs.writeFile(path.join(f.root, 'skin.png'), 'changed')
  assert.deepEqual(bundle.read('skin.png'), f.bytes)
  assert.equal((await loadBundledAppearances(f.file)).metadata.reason, 'BUNDLED_ASSET_HASH_MISMATCH')
  f.catalog.assets['skin.png'] = { bytes: 7, sha256: sha('changed') }; await f.write()
  assert.notEqual((await loadBundledAppearances(f.file)).sha256, bundle.sha256)
  assert.equal((await loadBundledAppearances()).metadata.appearances.length, 0)
})

test('traversal, absolute paths, hashes, declared/actual oversize and malformed optional catalogs fail closed', async t => {
  const f = await fixture(t)
  for (const name of ['../skin.png', '/skin.png', 'C:/skin.png', 'sub\\skin.png', 'a/./skin.png', 'a//skin.png', 'https://remote/skin.png']) {
    const invalid = structuredClone(f.catalog); invalid.assets = { [name]: invalid.assets['skin.png'] }; invalid.appearances[0].path = name
    await fs.writeFile(f.file, JSON.stringify(invalid))
    assert.equal((await loadBundledAppearances(f.file)).metadata.available, false, name)
  }
  f.catalog.assets['skin.png'].bytes = BUNDLED_LIMITS.file + 1; await f.write()
  assert.equal((await loadBundledAppearances(f.file)).metadata.available, false)
  f.catalog.assets['skin.png'].bytes = f.bytes.length; await f.write()
  await fs.writeFile(path.join(f.root, 'skin.png'), Buffer.alloc(BUNDLED_LIMITS.file + 1))
  assert.equal((await loadBundledAppearances(f.file)).metadata.reason, 'BUNDLED_ASSET_TOO_LARGE')
  await fs.writeFile(f.file, '{ malformed')
  assert.equal((await loadBundledAppearances(f.file)).metadata.available, false)
})

test('package directory junctions are refused before reading assets', async t => {
  const f = await fixture(t), outside = await fs.mkdtemp(path.join(os.tmpdir(), 'bundled-outside-'))
  t.after(() => removeTemporary(outside, 'bundled-outside-'))
  await fs.writeFile(path.join(outside, 'skin.png'), f.bytes)
  await fs.symlink(outside, path.join(f.root, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
  f.catalog.assets = { 'link/skin.png': f.catalog.assets['skin.png'] }; f.catalog.appearances[0].path = 'link/skin.png'; await f.write()
  assert.equal((await loadBundledAppearances(f.file)).metadata.reason, 'BUNDLED_ASSET_LINK_UNSUPPORTED')
})

test('browser reader keeps scoped endpoint and verifies asset bytes', async t => {
  const f = await fixture(t), bundle = await loadBundledAppearances(f.file), urls = []
  const reader = await BundledAppearanceReader.load('https://local/body/actual/api/bundled-appearances', async url => {
    urls.push(url)
    return url.endsWith('skin.png') ? new Response(f.bytes) : new Response(JSON.stringify(bundle.metadata))
  })
  assert.deepEqual(await reader.bytes('skin.png'), new Uint8Array(f.bytes))
  assert.equal(urls[1], 'https://local/body/actual/api/bundled-appearances/assets/skin.png')
  const corrupt = new BundledAppearanceReader(bundle.metadata, async () => Buffer.alloc(f.bytes.length))
  await assert.rejects(corrupt.bytes('skin.png'), /HASH_MISMATCH/)
  assert.deepEqual((await BundledAppearanceReader.load('missing', async () => { throw Error('offline') })).choices(), [])
})

test('default stays server; explicit choice binds actual UUID; account/reset/switch cancel stale loads', async t => {
  const f = await fixture(t), bundle = await loadBundledAppearances(f.file)
  const reader = new BundledAppearanceReader(bundle.metadata, async p => bundle.read(p)), pending = [], calls = []
  const controller = new NativeSelfPlayerController({ manifest: {} }, { bundledAppearanceReader: reader,
    minecraftFactory: async (_r, options) => {
      calls.push(options)
      if (options.bundledAppearance) return new Promise(resolve => pending.push(() => { const actor = fake({ uuid: options.uuid, source: 'plugin_bundled' }); resolve(actor); return actor }))
      return fake({ path: 'vanilla.png', sha256: 'original' })
    } })
  await controller.update(self(UUID), UUID)
  assert.equal(controller.appearance().selected, 'server'); assert.equal(calls[0].bundledAppearance, undefined)
  assert.equal(controller.selectAppearance('bundled:unknown'), false)
  assert.equal(controller.selectAppearance('bundled:test'), true)
  assert.equal(calls.at(-1).uuid, UUID); assert.equal(calls.at(-1).ysm, undefined)
  await controller.update(self(OTHER), OTHER)
  const stale = pending[0](); await settle()
  assert.equal(stale.disposed, 1); assert.equal(controller.appearance().selected, 'server')
  controller.selectAppearance('bundled:test'); controller.clear('disconnect')
  const disconnected = pending[1](); await settle(); assert.equal(disconnected.disposed, 1)
  assert.equal(controller.actor, null); assert.equal(controller.appearance().selected, 'bundled:test')
  const reconnect = controller.update(self(OTHER), OTHER); pending[2](); await reconnect
  assert.equal(controller.appearance().selected, 'bundled:test', 'the same account restores its own explicit choice after reconnect')
  const previousAccount = controller.update(self(UUID), UUID); pending[3](); await previousAccount
  assert.equal(controller.appearance().selected, 'bundled:test', 'each previously selected account restores only its own choice')
  controller.dispose()
})

test('explicit corrupt bundled appearance reports unavailable and restores actual server appearance', async t => {
  const f = await fixture(t), bundle = await loadBundledAppearances(f.file)
  const reader = new BundledAppearanceReader(bundle.metadata, async p => bundle.read(p))
  const controller = new NativeSelfPlayerController({ manifest: {} }, { bundledAppearanceReader: reader,
    minecraftFactory: async (_r, options) => {
      if (options.bundledAppearance) throw Error('BUNDLED_ASSET_HASH_MISMATCH')
      return fake({ path: 'vanilla.png', sha256: 'original' })
    } })
  await controller.update(self(UUID), UUID); controller.selectAppearance('bundled:test'); await settle()
  assert.equal(controller.appearance().selected, 'server'); assert.ok(controller.actor)
  assert.match(controller.status, /自带外观不可用.*HASH_MISMATCH.*已恢复服务器外观/)
  controller.dispose()
})

test('transient bundled failure retries saved choice only after full same-account connection clear', async t => {
  const f = await fixture(t), bundle = await loadBundledAppearances(f.file)
  const reader = new BundledAppearanceReader(bundle.metadata, async p => bundle.read(p))
  let attempts = 0
  const controller = new NativeSelfPlayerController({ manifest: {} }, { bundledAppearanceReader: reader,
    minecraftFactory: async (_r, options) => {
      if (options.bundledAppearance) {
        attempts++
        if (attempts === 1) throw Error('BUNDLED_ASSET_TRANSIENT_FETCH_FAILURE')
        return fake({ uuid: options.uuid, source: 'plugin_bundled' })
      }
      return fake({ path: 'vanilla.png', sha256: 'original' })
    } })
  await controller.update(self(UUID), UUID)
  controller.selectAppearance('bundled:test'); await settle()
  assert.equal(attempts, 1); assert.equal(controller.appearance().selected, 'server')
  assert.equal(controller.selections.get(UUID), 'bundled:test')
  await controller.update(self(UUID), UUID)
  controller.clear('same_lifecycle_render_error', true)
  await controller.update(self(UUID), UUID)
  assert.equal(attempts, 1, 'same-lifecycle fallback must not repeatedly retry')
  controller.clear('connection_ended')
  await controller.update(self(UUID), UUID)
  assert.equal(attempts, 2); assert.equal(controller.appearance().selected, 'bundled:test')
  assert.equal(controller.actor.assetInfo.source, 'plugin_bundled')
  controller.selectAppearance('server'); await settle(); controller.clear('connection_ended')
  await controller.update(self(UUID), UUID)
  assert.equal(attempts, 2); assert.equal(controller.appearance().selected, 'server', 'explicit server choice still wins')
  controller.dispose()
})

test('a successful explicit slim choice remains Web-only and rejects a foreign actor binding', async t => {
  const f = await fixture(t), bundle = await loadBundledAppearances(f.file)
  const reader = new BundledAppearanceReader(bundle.metadata, async p => bundle.read(p))
  let foreign = false
  const controller = new NativeSelfPlayerController({ manifest: {} }, { bundledAppearanceReader: reader,
    minecraftFactory: async (_r, options) => options.bundledAppearance
      ? fake({ uuid: foreign ? OTHER : options.uuid, source: 'plugin_bundled', model: 'slim' })
      : fake({ path: 'vanilla.png', sha256: 'original' }) })
  await controller.update(self(UUID), UUID); controller.selectAppearance('bundled:test'); await settle()
  assert.equal(controller.appearance().selected, 'bundled:test'); assert.equal(controller.actor.assetInfo.uuid, UUID)
  assert.equal(controller.lastInput[0].ysm, undefined)
  controller.selectAppearance('server'); await settle(); foreign = true
  controller.selectAppearance('bundled:test'); await settle()
  assert.equal(controller.appearance().selected, 'server'); assert.match(controller.status, /BINDING_MISMATCH/)
  controller.dispose()
})

const original = process.env.NATIVE_BUNDLED_APPEARANCE_CATALOG
test('original YUI PNG and all seven files construct authentic slim and scaled YSM actors', { skip: !original }, async () => {
  const bundle = await loadBundledAppearances(original)
  assert.equal(bundle.metadata.available, true)
  const reader = new BundledAppearanceReader(bundle.metadata, async p => bundle.read(p))
  assert.equal(sha(await reader.bytes('skins/yui-lolita-slim.png')), 'f8ed6510dec8647895fb633dde7cad0d3338fe7b39f78e2566d389e4ec33709f')
  const native = new NativeAssetReader({ minecraftVersion: '1.21.1', assetIntegrityVerified: true, clientJarSha256: PLAYER_CLIENT_JAR_SHA256, assets: {} }, async () => { throw Error('no substituted original resource') })
  const decode = async bytes => { const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); return new THREE.Texture({ width: data.getUint32(16), height: data.getUint32(20) }) }
  const skin = await createNativePlayerActor(native, { uuid: UUID, bundledAppearance: { reader, id: 'bundled:yui-slim' }, loadTexture: decode })
  assert.equal(skin.assetInfo.model, 'slim'); assert.equal(skin.assetInfo.source, 'plugin_bundled')
  assert.equal(skin.assetInfo.selectionSource, 'web_viewer_override'); assert.ok(skin.playerObject)
  assert.ok(skin.firstPersonRoot); skin.dispose()
  const actor = await createNativeBundledYsmPlayerActor(native, { uuid: UUID, bundledAppearance: { reader, id: 'bundled:yui-ysm' }, loadTexture: decode })
  assert.equal(actor.assetInfo.modelId, 'neko_yui'); assert.equal(actor.assetInfo.ysmVersion, '2.4.1')
  assert.equal(actor.assetInfo.license.type, 'Custom'); assert.equal(actor.assetInfo.source, 'plugin_bundled')
  assert.equal(actor.assetInfo.boneCount, 49); assert.equal(actor.assetInfo.cubeCount, 168)
  assert.deepEqual(actor.root.scale.toArray(), [.9, .9, .9]); assert.equal(actor.assetInfo.authors[0].name, 'jcs130')
  assert.equal(actor.assetInfo.firstPersonRenderingAvailable, false); assert.equal(actor.assetInfo.completeEntityParityVerified, false)
  actor.dispose()
  const observed = self(UUID)
  let ready
  const controller = new NativeSelfPlayerController(native, { bundledAppearanceReader: reader,
    minecraftFactory: (r, options) => options.bundledAppearance ? createNativePlayerActor(r, { ...options, loadTexture: decode }) : fake({ path: 'vanilla.png', sha256: 'original' }),
    bundledYsmFactory: (r, options) => createNativeBundledYsmPlayerActor(r, { ...options, loadTexture: decode }),
    onChange: actor => { if (actor?.assetInfo.source === 'plugin_bundled') ready?.(actor) } })
  await controller.update(observed, UUID)
  const loadedYsm = new Promise(resolve => { ready = resolve })
  assert.equal(controller.selectAppearance('bundled:yui-ysm'), true)
  const selectedYsm = await loadedYsm
  assert.equal(selectedYsm.assetInfo.uuid, UUID); assert.equal(observed.ysm, undefined)
  assert.equal(controller.appearance().selected, 'bundled:yui-ysm')
  const loadedSkin = new Promise(resolve => { ready = resolve })
  assert.equal(controller.selectAppearance('bundled:yui-slim'), true)
  assert.equal((await loadedSkin).assetInfo.uuid, UUID)
  await controller.update(self(OTHER), OTHER)
  assert.equal(controller.appearance().selected, 'server'); controller.dispose()
})

test('original YUI animation samples use real compiler and unchanged bone/UV geometry', { skip: !original }, async () => {
  const bundle = await loadBundledAppearances(original), reader = new BundledAppearanceReader(bundle.metadata, async p => bundle.read(p))
  const geometry = await reader.json('ysm/neko_yui/models/main.json'), animation = await reader.json('ysm/neko_yui/animations/main.animation.json')
  const material = new THREE.MeshBasicMaterial(), model = createNativeBedrockModel(geometry, material)
  assert.deepEqual([...model.bones.keys()], geometry['minecraft:geometry'][0].bones.map(row => row.name))
  const clips = compileBundledYsmAnimations(animation, model.bones.keys()); assert.equal(clips.size, 31)
  const walk = sampleNativeYsmClip(clips, 'walk', .45)
  assert.equal(walk.bones.RightLeg.rotation[0], -22)
  assert.equal(sampleNativeYsmClip(clips, 'idle', 1.5).bones.Tail.rotation[1], 6)
  for (const clip of clips.values()) for (const fraction of [0, .25, .5, .75, 1]) {
    applyNativeYsmBonePose(model, [sampleNativeYsmClip(clips, clip.name, clip.length * fraction)])
    model.root.updateMatrixWorld(true)
    for (const bone of model.bones.values()) assert.ok(bone.matrixWorld.elements.every(Number.isFinite))
  }
  for (const [file, expected] of [['arm', 14], ['extra', 3]]) {
    const source = await reader.json(`ysm/neko_yui/animations/${file}.animation.json`)
    const originalClips = compileBundledYsmAnimations(source, model.bones.keys())
    assert.equal(originalClips.size, expected)
    for (const clip of originalClips.values()) for (const fraction of [0, .25, .5, .75, 1]) {
      applyNativeYsmBonePose(model, [sampleNativeYsmClip(originalClips, clip.name, clip.length * fraction)])
      model.root.updateMatrixWorld(true)
      for (const bone of model.bones.values()) assert.ok(bone.matrixWorld.elements.every(Number.isFinite))
    }
  }
  const armModel = createNativeBedrockModel(await reader.json('ysm/neko_yui/models/arm.json'), material)
  assert.equal(armModel.bones.size, 8); assert.equal(armModel.cubeCount, 16); armModel.dispose()
  const invalid = structuredClone(animation); invalid.animations.idle.bones.Tail.rotation = ['query.fake', 0, 0]
  assert.throws(() => compileBundledYsmAnimations(invalid, model.bones.keys()), /NUMERIC_REQUIRED/)
  model.dispose(); material.dispose()
})
