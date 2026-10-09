import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import * as THREE from 'three'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { defaultPlayerSkin, createNativePlayerActor, PLAYER_CLIENT_JAR_SHA256 } from '../../src/native-viewer/native-player.js'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const nil = '00000000-0000-0000-0000-000000000000'
const wide = '00000000-0000-0000-0000-000000000009'

// Synthetic test image, not a shipped skin/resource. The complete PNG is
// generated here so hash/decoder/dimension tests need no runtime assets.
function png (width = 64, height = 64) {
  const crc32 = bytes => {
    let crc = 0xffffffff
    for (const byte of bytes) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)) }
    return (crc ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), output = Buffer.alloc(data.length + 12)
    output.writeUInt32BE(data.length); body.copy(output, 4); output.writeUInt32BE(crc32(body), output.length - 4)
    return output
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6
  // Fixed bounded pixels; malformed IHDR sizes never cause a large allocation.
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc(64 * (64 * 4 + 1)))), chunk('IEND', Buffer.alloc(0))])
}

function fixture (uuid = nil, bytes = png(), overrides = {}) {
  const path = defaultPlayerSkin(uuid).path
  const entry = { sha256: sha(bytes), bytes: bytes.length, source: 'minecraft-1.21.1-client.jar', variants: [] }
  const manifest = { minecraftVersion: '1.21.1', assetIntegrityVerified: true, clientJarSha256: PLAYER_CLIENT_JAR_SHA256,
    assets: { [path]: entry }, ...overrides }
  return { path, bytes, entry, reader: new NativeAssetReader(manifest, async () => bytes) }
}

function textureDecoder (width = 64, height = 64) {
  let calls = 0
  const texture = new THREE.Texture({ width, height })
  return { texture, get calls () { return calls }, load: async () => { calls++; return texture } }
}

test('all 18 defaults preserve bytecode order and explicit slim/wide models', () => {
  const names = ['alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'steve', 'sunny', 'zuri']
  for (let index = 0; index < 18; index++) {
    const selected = defaultPlayerSkin(`00000000-0000-0000-0000-${index.toString(16).padStart(12, '0')}`)
    assert.equal(selected.index, index)
    assert.equal(selected.model, index < 9 ? 'slim' : 'wide')
    assert.equal(selected.name, names[index % 9])
    assert.equal(selected.path, `assets/minecraft/textures/entity/player/${selected.model}/${selected.name}.png`)
  }
})

test('UUID signed hash and floorMod match independent Java 21 fixtures', () => {
  // java.util.UUID.hashCode + Math.floorMod(hash,18), run independently in Java.
  for (const [uuid, hash, index] of [
    ['e371227c-09fa-3722-84f4-f3228a552c3c', -466957760, 4],
    ['ffffffff-0000-0000-0000-000000000000', -1, 17],
    ['80000000-0000-0000-0000-000000000000', -2147483648, 16],
    ['12345678-9abc-def0-fedc-ba9876543210', 0, 0]
  ]) {
    const selected = defaultPlayerSkin(uuid.toUpperCase())
    assert.equal(selected.uuid, uuid); assert.equal(selected.uuidHash, hash); assert.equal(selected.index, index)
  }
  for (const uuid of [null, '', 'MawExplorer', '0'.repeat(32), `${nil}/../steve`]) assert.throws(() => defaultPlayerSkin(uuid), /UUID_INVALID/)
})

test('actor uses verified native bytes, exact model widths, original layer UVs and standing dimensions', async () => {
  for (const [uuid, armWidth] of [[nil, 3], [wide, 4]]) {
    const source = fixture(uuid), decoder = textureDecoder()
    const actor = await createNativePlayerActor(source.reader, { uuid, loadTexture: decoder.load })
    const skin = actor.playerObject.skin
    assert.deepEqual(skin.getBodyParts().map(part => part.name), ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'])
    assert.equal(skin.rightArm.innerLayer.scale.x, armWidth); assert.equal(skin.leftArm.innerLayer.scale.x, armWidth)
    assert.equal(skin.rightArm.outerLayer.scale.x, armWidth + 0.5)
    assert.equal(actor.root.visible, false); assert.equal(decoder.calls, 1)
    assert.equal(skin.map, decoder.texture); assert.equal(skin.map.flipY, true)
    assert.equal(skin.map.colorSpace, THREE.SRGBColorSpace); assert.equal(skin.map.magFilter, THREE.NearestFilter)
    // Front quad in standard BoxGeometry: authentic 64x64 head and hat regions.
    assert.deepEqual(Array.from(skin.head.innerLayer.geometry.attributes.uv.array.slice(32, 40)), [0.125, 0.875, 0.25, 0.875, 0.125, 0.75, 0.25, 0.75])
    assert.deepEqual(Array.from(skin.head.outerLayer.geometry.attributes.uv.array.slice(32, 40)), [0.625, 0.875, 0.75, 0.875, 0.625, 0.75, 0.75, 0.75])
    assert.ok(skin.getBodyParts().every(part => part.outerLayer.visible))
    actor.applyPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }); actor.root.updateMatrixWorld(true)
    const bounds = new THREE.Box3()
    for (const part of skin.getBodyParts()) bounds.expandByObject(part.innerLayer)
    assert.ok(Math.abs(bounds.min.y) < 1e-9); assert.ok(Math.abs(bounds.max.y - 1.875) < 1e-9)
    assert.equal(actor.playerObject.cape.visible, false); assert.equal(actor.playerObject.elytra.visible, false); assert.equal(actor.playerObject.ears.visible, false)
    assert.equal(actor.assetInfo.sha256, source.entry.sha256); assert.equal(actor.assetInfo.source, source.entry.source)
    assert.equal(actor.assetInfo.path, source.path); assert.equal(actor.assetInfo.animationParityVerified, false)
    assert.match(actor.assetInfo.geometrySource, /skinview3d@3.4.2/)
    actor.dispose()
  }
})

test('pose uses real world feet position and native camera yaw/pitch without a new body identity', async () => {
  const source = fixture(), decoder = textureDecoder(), actor = await createNativePlayerActor(source.reader, { uuid: nil, loadTexture: decoder.load })
  const pose = { x: -432.5, y: 66, z: 400.5, yaw: 1.1, pitch: -0.3 }
  actor.applyPose(pose); actor.root.updateMatrixWorld(true)
  assert.deepEqual(actor.root.position.toArray(), [pose.x, pose.y, pose.z]); assert.equal(actor.root.rotation.y, pose.yaw)
  assert.equal(actor.playerObject.skin.head.rotation.x, -pose.pitch); assert.equal(actor.root.userData.playerUuid, nil)
  const front = new THREE.Vector3(0, 0, 1).transformDirection(actor.playerObject.skin.head.matrixWorld)
  const camera = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pose.pitch, pose.yaw, 0, 'YXZ'))
  assert.ok(front.distanceTo(camera) < 1e-9)
  assert.throws(() => actor.applyPose({ ...pose, y: NaN }), /POSE_UNAVAILABLE/)
  assert.deepEqual(actor.root.position.toArray(), [pose.x, pose.y, pose.z])
  actor.dispose()
})

test('verified walk angles reach the real skin limbs while identity/feet stay unchanged and missing motion clears stale arms', async () => {
  const source = fixture(), decoder = textureDecoder(), actor = await createNativePlayerActor(source.reader, { uuid: nil, loadTexture: decoder.load })
  actor.applyPose({ x: -432, y: 72, z: 400, yaw: 0.5, pitch: 0.2 })
  const value = actor.applyMotion({ schemaVersion: 1, source: 'same_player_physics_tick', tickMs: 50, epoch: 1, tick: 2,
    sampledAt: 1000, available: true, walk: { speedOld: 0, speed: 0.4, position: 0.4 }, ageInTicks: null }, 1050)
  assert.equal(value.available, true)
  for (const [name, rotation] of Object.entries(value.skinview)) {
    assert.equal(actor.playerObject.skin[name].rotation.x, rotation.x)
    assert.equal(actor.playerObject.skin[name].rotation.y, rotation.y)
    assert.equal(actor.playerObject.skin[name].rotation.z, rotation.z)
    assert.equal(actor.playerObject.skin[name].rotation.order, 'ZYX')
  }
  assert.deepEqual(actor.root.position.toArray(), [-432, 72, 400]); assert.equal(actor.root.userData.playerUuid, nil)
  assert.equal(actor.root.userData.motion.animationParityVerified, false)
  actor.applyMotion(null, 1100)
  assert.equal(actor.playerObject.skin.rightArm.rotation.x, 0)
  assert.equal(actor.root.userData.motion.available, false)
  actor.dispose()
})

test('missing, tampered or unresolved assets fail before decode without default substitutions', async () => {
  const source = fixture(), decoder = textureDecoder()
  delete source.reader.manifest.assets[source.path]
  await assert.rejects(createNativePlayerActor(source.reader, { uuid: nil, loadTexture: decoder.load }), /NATIVE_ASSET_MISSING/)
  const corrupt = fixture(); corrupt.reader.readBytes = async () => Buffer.concat([corrupt.bytes, Buffer.from([1])])
  await assert.rejects(createNativePlayerActor(corrupt.reader, { uuid: nil, loadTexture: decoder.load }), /HASH_MISMATCH/)
  const priority = fixture(); priority.entry.variants = [{ sha256: '0'.repeat(64) }]
  await assert.rejects(createNativePlayerActor(priority.reader, { uuid: nil, loadTexture: decoder.load }), /PRIORITY_UNRESOLVED/)
  await assert.rejects(createNativePlayerActor(fixture(nil, png(), { clientJarSha256: '0'.repeat(64) }).reader, { uuid: nil, loadTexture: decoder.load }), /SOURCE_UNSUPPORTED/)
  assert.equal(decoder.calls, 0)
})

test('PNG size and decoder size are bounded and validated before creating geometry', async () => {
  const decoder = textureDecoder()
  for (const bytes of [Buffer.from('not png'), png(0, 64), png(64, 32), png(128, 128), png(0xffffffff, 64)]) {
    await assert.rejects(createNativePlayerActor(fixture(nil, bytes).reader, { uuid: nil, loadTexture: decoder.load }), /PNG_INVALID|DIMENSIONS_UNSUPPORTED/)
  }
  assert.equal(decoder.calls, 0)
  const wrong = textureDecoder(128, 128); let disposed = 0
  wrong.texture.addEventListener('dispose', () => disposed++)
  await assert.rejects(createNativePlayerActor(fixture().reader, { uuid: nil, loadTexture: wrong.load }), /DECODE_INVALID/)
  assert.equal(disposed, 1)
})

test('explicit skin stays inside native Minecraft manifest paths and matching arm model', async () => {
  const source = fixture(wide), decoder = textureDecoder()
  const override = { path: source.path, model: 'wide' }
  const actor = await createNativePlayerActor(source.reader, { uuid: nil, skin: override, loadTexture: decoder.load })
  assert.equal(actor.assetInfo.index, null); assert.equal(actor.assetInfo.selectionSource, 'caller_profile_binding')
  assert.equal(actor.playerObject.skin.modelType, 'default'); actor.dispose()
  for (const skin of [{ path: 'https://skin.example/test.png', model: 'wide' }, { path: source.path, model: 'slim' },
    { path: 'assets/minecraft/textures/entity/player/wide/../steve.png', model: 'wide' }, { path: 'public/skins/lantern-warden.png', model: 'wide' }]) {
    await assert.rejects(createNativePlayerActor(source.reader, { uuid: nil, skin, loadTexture: decoder.load }), /SKIN_INVALID/)
  }
})

test('dispose removes the actor and releases each owned GPU resource once', async () => {
  const source = fixture(), decoder = textureDecoder(), actor = await createNativePlayerActor(source.reader, { uuid: nil, loadTexture: decoder.load })
  const parent = new THREE.Group(); parent.add(actor.root)
  const geometries = new Set(), materials = new Set(), events = new Map()
  actor.root.traverse(part => { if (part.geometry) geometries.add(part.geometry); if (part.material) materials.add(part.material) })
  for (const resource of [...geometries, ...materials, decoder.texture]) { events.set(resource, 0); resource.addEventListener('dispose', () => events.set(resource, events.get(resource) + 1)) }
  actor.dispose(); actor.dispose()
  assert.equal(parent.children.length, 0); assert.equal(actor.root.visible, false)
  assert.ok([...events.values()].every(value => value === 1))
  assert.throws(() => actor.applyPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }), /ACTOR_DISPOSED/)
})
