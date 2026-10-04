import * as THREE from 'three'
import { PlayerObject } from 'skinview3d/libs/model.js'
import { NativeAssetReader } from './model-loader.js'

// Minecraft 1.21.1 client JAR, official client mappings: DefaultPlayerSkin
// (grd.get(UUID): UUID.hashCode -> Math.floorMod(...,18)), PlayerRenderer
// (gpo.scale: 0.9375f). Verified directly against the locked client bytecode.
// Body geometry/UVs are the installed skinview3d 3.4.2 PlayerObject (MIT),
// also used by the original viewer. No authored skin, VRoid or cube substitute.
export const PLAYER_CLIENT_JAR_SHA256 = '499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'
const NAMES = ['alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'steve', 'sunny', 'zuri']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SKIN_PATH = /^assets\/minecraft\/textures\/entity\/player\/(slim|wide)\/(alex|ari|efe|kai|makena|noor|steve|sunny|zuri)\.png$/
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

export function defaultPlayerSkin (uuid) {
  if (typeof uuid !== 'string' || !UUID.test(uuid)) throw Error('NATIVE_PLAYER_UUID_INVALID')
  const hex = uuid.replaceAll('-', '')
  // Java UUID.hashCode XORs both long halves, then their high/low int words.
  let hash = 0
  for (let i = 0; i < 32; i += 8) hash ^= Number.parseInt(hex.slice(i, i + 8), 16)
  const index = ((hash % 18) + 18) % 18
  const model = index < 9 ? 'slim' : 'wide', name = NAMES[index % 9]
  const resourceId = `minecraft:entity/player/${model}/${name}`
  return Object.freeze({ uuid: uuid.toLowerCase(), index, uuidHash: hash, model, name, resourceId,
    path: `assets/minecraft/textures/entity/player/${model}/${name}.png` })
}

function selectedSkin (uuid, override) {
  const selected = defaultPlayerSkin(uuid)
  if (override === undefined || override === null) return selected
  const match = typeof override?.path === 'string' && SKIN_PATH.exec(override.path)
  if (!match || override.model !== match[1]) throw Error('NATIVE_PLAYER_SKIN_INVALID')
  // Explicit overrides must still refer to an original, manifest-verified
  // Minecraft skin. The caller is responsible for its actual profile binding.
  return Object.freeze({ uuid: selected.uuid, index: null, uuidHash: selected.uuidHash,
    model: match[1], name: match[2], path: override.path,
    resourceId: `minecraft:entity/player/${match[1]}/${match[2]}` })
}

function pngDimensions (bytes) {
  if (bytes.length < 33 || PNG_SIGNATURE.some((value, i) => bytes[i] !== value)) throw Error('NATIVE_PLAYER_SKIN_PNG_INVALID')
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (data.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw Error('NATIVE_PLAYER_SKIN_PNG_INVALID')
  const width = data.getUint32(16), height = data.getUint32(20)
  // The eighteen locked vanilla sheets use the complete 64x64 layout. Do not
  // reinterpret a legacy/HD or malformed sheet with different UV semantics.
  if (width !== 64 || height !== 64) throw Error('NATIVE_PLAYER_SKIN_DIMENSIONS_UNSUPPORTED')
  return { width, height }
}

async function nativeSkinTexture (bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
  try { return await new THREE.TextureLoader().loadAsync(url) } finally { URL.revokeObjectURL(url) }
}

// loadTexture is an optional decoder shared with NativeModelLoader/test code;
// its newly created texture belongs to this actor and is disposed with it.
export async function createNativePlayerActor (reader, { uuid, skin, loadTexture = nativeSkinTexture } = {}) {
  if (!(reader instanceof NativeAssetReader) || reader.manifest.clientJarSha256 !== PLAYER_CLIENT_JAR_SHA256) throw Error('NATIVE_PLAYER_SOURCE_UNSUPPORTED')
  if (typeof loadTexture !== 'function') throw Error('NATIVE_PLAYER_TEXTURE_LOADER_INVALID')
  const selected = selectedSkin(uuid, skin)
  const bytes = await reader.bytes(selected.path) // Hash + priority verified before image decoding.
  const dimensions = pngDimensions(bytes)
  const texture = await loadTexture(bytes)
  if (!texture?.isTexture || texture.image?.width !== dimensions.width || texture.image?.height !== dimensions.height) {
    texture?.dispose?.()
    throw Error('NATIVE_PLAYER_SKIN_DECODE_INVALID')
  }
  // UVs in PlayerObject are bottom-origin; TextureLoader performs the upload
  // flip for the original top-origin PNG. No recoloring/resampling/skin lookup.
  texture.flipY = true
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false; texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true
  const root = new THREE.Group(), playerObject = new PlayerObject()
  root.name = 'native-own-player'; root.visible = false
  const body = new THREE.Group()
  body.scale.setScalar(0.9375 / 16)
  playerObject.position.y = 16; playerObject.rotation.y = Math.PI
  playerObject.skin.modelType = selected.model === 'slim' ? 'slim' : 'default'
  playerObject.skin.map = texture
  playerObject.backEquipment = null; playerObject.ears.visible = false
  body.add(playerObject); root.add(body)
  const entry = reader.manifest.assets[selected.path]
  const assetInfo = Object.freeze({ ...selected, ...dimensions, sha256: entry.sha256, bytes: entry.bytes,
    source: entry.source, clientJarSha256: reader.manifest.clientJarSha256,
    geometrySource: 'skinview3d@3.4.2 PlayerObject (MIT)',
    selectionSource: skin ? 'caller_profile_binding' : 'Minecraft 1.21.1 DefaultPlayerSkin.get(UUID)',
    standingScale: 0.9375, animationParityVerified: false, equipmentRenderingAvailable: false })
  root.userData = { playerUuid: selected.uuid, assetInfo }
  let disposed = false
  return {
    root, playerObject, assetInfo,
    applyPose (pose) {
      if (disposed) throw Error('NATIVE_PLAYER_ACTOR_DISPOSED')
      if (!pose || ![pose.x, pose.y, pose.z, pose.yaw, pose.pitch].every(Number.isFinite)) throw Error('NATIVE_PLAYER_POSE_UNAVAILABLE')
      root.position.set(pose.x, pose.y, pose.z); root.rotation.y = pose.yaw
      // Mineflayer/native camera looks along -Z. PlayerObject's skin front is
      // +Z, so the body turns PI; pitch sign is converted in that local frame.
      playerObject.skin.head.rotation.x = -pose.pitch
      root.visible = true
    },
    dispose () {
      if (disposed) return
      disposed = true; root.visible = false; root.removeFromParent()
      const geometries = new Set(), materials = new Set()
      root.traverse(part => {
        if (part.geometry) geometries.add(part.geometry)
        for (const material of Array.isArray(part.material) ? part.material : part.material ? [part.material] : []) materials.add(material)
      })
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      texture.dispose(); texture.image?.close?.(); root.clear()
    }
  }
}
