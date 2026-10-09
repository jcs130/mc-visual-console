import * as THREE from 'three'
import { NativeAssetReader, bakeFaces, resourcePath, textureId } from './model-loader.js'
import { parseNativeItemStack, nativeNumericValue } from './native-item-stack.js'
import { nativeArsItemEligible, prepareNativeArsItemIcon, bakeNativeArsGeoFaces } from './native-ars-item-icons.js'
import { nativeGuideItemEligible, prepareNativeGuideItemIcon } from './native-guide-item-icons.js'
import { verifyNativeStaticItemEvidence, nativeStaticItemState } from './native-static-item-providers.js'
import { nativeHumanoidWalkAngles, nativePlayerCos, nativePlayerSin, toSkinviewLimbRotation } from './native-player-motion.js'

// Locked 1.21.1 ItemModelGenerator / ItemInHandLayer / ItemTransform and
// PlayerModel.translateToHand; Ars 5.13.2 SpellBookModel/TatteredTomeModel and
// GeckoLib 4.9.3 GeoItemRenderer. No GUI image is pasted onto a player's hand.
export const HELD_ITEM_CLIENT_SHA256 = '499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'
export const ARS_OPEN_MODEL_SHA256 = '38d9ad24e4b8fe06dd36bccb6f618fb9998a13218341e8e4ca320f298f6f673e'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOOL = /^minecraft:(wooden|stone|iron|golden|diamond|netherite)_(sword|pickaxe|axe|shovel|hoe)$/
const record = value => value && typeof value === 'object' && !Array.isArray(value)
const F = Math.fround
const mul = (a, b) => F(F(a) * F(b)), add = (a, b) => F(F(a) + F(b))
const MAX_PIXELS = 262144
const NON_VISUAL = new Set(['minecraft:damage', 'minecraft:custom_name', 'minecraft:item_name', 'minecraft:lore',
  'minecraft:rarity', 'minecraft:repair_cost', 'minecraft:unbreakable', 'minecraft:hide_additional_tooltip', 'minecraft:hide_tooltip'])

function normalizeUuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw Error('NATIVE_HELD_PLAYER_UUID_INVALID')
  return value.toLowerCase()
}

// Empty rows are authoritative only in a complete inventory-0 snapshot. A
// foreign player's equipment, translated item ID, or container layout cannot
// supply this actor's held items. Null is known empty; absence is unknown.
export function selectNativeHeldItems(frame, boundUuid) {
  const uuid = normalizeUuid(boundUuid)
  if (normalizeUuid(frame?.playerUuid) !== uuid || normalizeUuid(frame?.self?.uuid) !== uuid ||
      normalizeUuid(frame?.inventory?.playerUuid) !== uuid) throw Error('NATIVE_HELD_PLAYER_BINDING_MISMATCH')
  const inventory = frame.inventory
  if (inventory.windowId !== 0 || inventory.hotbarStart !== 36 || inventory.offhandSlot !== 45 ||
      !Array.isArray(inventory.slots) || inventory.slots.length !== 46) throw Error('NATIVE_HELD_INVENTORY_UNAVAILABLE')
  const slots = new Map()
  for (const row of inventory.slots) {
    if (!record(row) || !Number.isInteger(row.slot) || row.slot < 0 || row.slot > 45 || slots.has(row.slot) ||
        !Object.hasOwn(row, 'item') || row.item === undefined) throw Error('NATIVE_HELD_INVENTORY_INVALID')
    slots.set(row.slot, row.item)
  }
  const selected = inventory.selectedHotbarSlot
  if (!Number.isInteger(selected) || selected < 0 || selected > 8 ||
      (frame.self.quickBarSlot !== undefined && frame.self.quickBarSlot !== null && frame.self.quickBarSlot !== selected)) throw Error('NATIVE_HELD_SELECTED_SLOT_UNKNOWN')
  if (!['left', 'right'].includes(frame.self.mainArm)) throw Error('NATIVE_HELD_MAIN_ARM_UNKNOWN')
  const mainArm = frame.self.mainArm, offArm = mainArm === 'right' ? 'left' : 'right'
  return { playerUuid: uuid, mainArm, self: frame.self,
    hands: { [mainArm]: { slot: 36 + selected, raw: slots.get(36 + selected) }, [offArm]: { slot: 45, raw: slots.get(45) } } }
}

// ItemTransform.Deserializer: float values, translation /16 then +/-5 clamp,
// scale +/-4 clamp. apply(left) negates X translation and Y/Z rotation.
export function nativeHeldItemTransform(display = {}, arm = 'right', context = 'thirdperson') {
  if (!record(display) || !['left', 'right'].includes(arm) || !['firstperson', 'thirdperson'].includes(context)) throw Error('NATIVE_HELD_TRANSFORM_INVALID')
  const vector = (value, fallback) => {
    value ??= fallback
    if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw Error('NATIVE_HELD_TRANSFORM_INVALID')
    return value.map(F)
  }
  const rotation = vector(display.rotation, [0, 0, 0])
  const translation = vector(display.translation, [0, 0, 0]).map(value => Math.max(-5, Math.min(5, mul(value, 0.0625))))
  const scale = vector(display.scale, [1, 1, 1]).map(value => Math.max(-4, Math.min(4, value)))
  if (scale.some(value => value <= 0)) throw Error('NATIVE_HELD_REFLECTED_TRANSFORM_UNSUPPORTED')
  if (arm === 'left') { translation[0] = -translation[0]; rotation[1] = -rotation[1]; rotation[2] = -rotation[2] }
  const radians = rotation.map(value => mul(value, F(F(Math.PI) / 180)))
  return { rotation, radians, translation, scale, context: `${context}_${arm}hand` }
}

function transformMatrix(transform) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...transform.translation),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.radians, 'XYZ')), new THREE.Vector3(...transform.scale))
}

// ItemInHandLayer relative to an arm ModelPart; PlayerModel's slim +/-.5 X
// occurs BEFORE the arm rotation, so compensate in the arm-local frame rather
// than making the held object orbit the wrong pivot. Java model coordinates
// -> skinview3d coordinates are Rx(PI); actor pixels are scaled by 16 here.
export function nativeHeldArmMountMatrix({ arm, slim = false, rotation = new THREE.Euler(0, 0, 0, 'ZYX'), transform } = {}) {
  if (!['left', 'right'].includes(arm) || typeof slim !== 'boolean' || !rotation?.isEuler ||
      ![rotation.x, rotation.y, rotation.z].every(Number.isFinite) || !transform) throw Error('NATIVE_HELD_ARM_MOUNT_INVALID')
  const inverse = new THREE.Quaternion().setFromEuler(rotation).invert()
  const offset = new THREE.Vector3(slim ? (arm === 'right' ? 0.5 : -0.5) : 0, 0, 0).applyQuaternion(inverse)
  const layer = new THREE.Matrix4().makeRotationX(-Math.PI / 2)
    .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
    .multiply(new THREE.Matrix4().makeTranslation(arm === 'left' ? -1 / 16 : 1 / 16, 0.125, -0.625))
  return new THREE.Matrix4().makeTranslation(...offset.toArray())
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI))
    .multiply(new THREE.Matrix4().makeScale(16, 16, 16)).multiply(layer).multiply(transformMatrix(transform))
}

// Locked ItemInHandRenderer.renderArmWithItem ordinary idle branch:
// applyItemArmTransform(fully-equipped endpoint=0) then the item's FIRSTPERSON
// display. At swing=0 the native +45/-45 attack rotations cancel. This is an
// explicitly scoped steady endpoint, not a fabricated equip/swing tracker.
export function nativeFirstPersonIdleMountMatrix({ arm, transform } = {}) {
  if (!['left', 'right'].includes(arm) || transform?.context !== `firstperson_${arm}hand`) throw Error('NATIVE_FIRST_PERSON_TRANSFORM_INVALID')
  return new THREE.Matrix4().makeTranslation(mul(arm === 'right' ? 1 : -1, F(0.56)), F(-0.52), F(-0.72))
    .multiply(transformMatrix(transform))
}

function alphaSilhouette(decoded) {
  const runs = []
  for (let y = 0; y < decoded.height; y++) {
    let start = null
    for (let x = 0; x <= decoded.width; x++) {
      const opaque = x < decoded.width && decoded.pixels[(y * decoded.width + x) * 4 + 3] >= 26
      if (opaque && start === null) start = x
      if (!opaque && start !== null) { runs.push([y, start, x]); start = null }
    }
  }
  return { width: decoded.width, height: decoded.height, runs }
}

function projectedArea(points) {
  let area = 0
  for (let n = 0; n < points.length; n++) {
    const a = points[n], b = points[(n + 1) % points.length]
    if (!(a.w > 0 && b.w > 0)) return 0
    area += a.x / a.w * b.y / b.w - b.x / b.w * a.y / a.w
  }
  return Math.abs(area) / 2
}
function clippedArea(points) {
  // Homogeneous OpenGL clip space, including near/far and points behind the
  // eye. Clip actual polygons rather than declaring a transparent PNG's
  // full generated slab to be a visible item.
  for (const plane of [p => p.w + p.x, p => p.w - p.x, p => p.w + p.y,
    p => p.w - p.y, p => p.w + p.z, p => p.w - p.z]) {
    const next = []
    for (let n = 0; n < points.length; n++) {
      const a = points[n], b = points[(n + 1) % points.length], da = plane(a), db = plane(b)
      if (da >= 0) next.push(a)
      if ((da >= 0) !== (db >= 0)) next.push(a.clone().lerp(b, da / (da - db)))
    }
    points = next
    if (points.length < 3) return 0
  }
  return projectedArea(points)
}

export function nativeFirstPersonSilhouetteProjection(plan, viewport, arm = plan?.arm) {
  if (!viewport || ![viewport.fov, viewport.aspect, viewport.near, viewport.far].every(Number.isFinite) ||
      viewport.fov <= 0 || viewport.fov >= 180 || viewport.aspect <= 0 || viewport.near <= 0 || viewport.far <= viewport.near) {
    return { available: false, reason: 'NATIVE_FIRST_PERSON_VIEWPORT_UNKNOWN' }
  }
  const camera = new THREE.PerspectiveCamera(viewport.fov, viewport.aspect, viewport.near, viewport.far)
  const matrix = camera.projectionMatrix.clone().multiply(nativeFirstPersonIdleMountMatrix({ arm, transform: plan.firstPersonTransform }))
  let area = 0, unclippedArea = 0, checkedPolygons = 0
  const polygon = positions => {
    const points = positions.map(p => new THREE.Vector4(...p, 1).applyMatrix4(matrix))
    unclippedArea += projectedArea(points)
    return clippedArea(points)
  }
  if (plan.alphaSilhouette) {
    const { width, height, runs } = plan.alphaSilhouette
    for (const [y, start, end] of runs) for (const z of [-.03125, .03125]) {
      area += polygon([[start / width - .5, .5 - y / height, z], [end / width - .5, .5 - y / height, z],
        [end / width - .5, .5 - (y + 1) / height, z], [start / width - .5, .5 - (y + 1) / height, z]])
      checkedPolygons++
    }
  } else for (const face of plan.faces) {
    const positions = Array.from({ length: 4 }, (_unused, n) => [face.position[n * 3], face.position[n * 3 + 1] + plan.geoOffsetY, face.position[n * 3 + 2]])
    area += polygon(positions); checkedPolygons++
  }
  const visibleFraction = unclippedArea > 1e-10 ? Math.min(1, area / unclippedArea) : null
  return { available: area > 1e-10, reason: area > 1e-10 ? null : 'NATIVE_FIRST_PERSON_VIEWPORT_CLIPPED',
    visibility: area <= 1e-10 ? 'clipped' : visibleFraction !== null && visibleFraction < .999999 ? 'partially_clipped' : 'in_view',
    warning: area > 1e-10 && visibleFraction !== null && visibleFraction < .01 ? 'NATIVE_FIRST_PERSON_VIEWPORT_MOSTLY_CLIPPED' : null,
    source: plan.alphaSilhouette ? 'original_png_alpha_texel_quads' : 'original_geometry_frustum',
    alphaSilhouetteVerified: !!plan.alphaSilhouette, projectedAreaNdc: area, visibleFraction, checkedPolygons,
    viewport: { fov: viewport.fov, aspect: viewport.aspect, near: viewport.near, far: viewport.far }, pixelParityVerified: false }
}

function thirdPersonPoseReason(self) {
  if (!self || self.usingItem !== false) return self?.usingItem === true ? 'NATIVE_HELD_ACTIVE_USE_POSE_UNSUPPORTED' : 'NATIVE_HELD_USE_STATE_UNKNOWN'
  if (self.swinging !== false || self.attackAnim !== 0) return self.swinging === true || self.attackAnim > 0 ? 'NATIVE_HELD_SWING_POSE_UNSUPPORTED' : 'NATIVE_HELD_SWING_STATE_UNKNOWN'
  const spinAttack = self.spinAttack ?? self.autoSpinAttack
  if (spinAttack !== false) return spinAttack === true ? 'NATIVE_HELD_SPIN_ATTACK_UNSUPPORTED' : 'NATIVE_HELD_SPIN_STATE_UNKNOWN'
  return null
}
function firstPersonPoseReason(self) {
  if (!self || self.usingItem !== false) return self?.usingItem === true ? 'NATIVE_FIRST_PERSON_ACTIVE_USE_UNSUPPORTED' : 'NATIVE_FIRST_PERSON_USE_STATE_UNKNOWN'
  if (self.swinging !== false || self.attackAnim !== 0) return self.swinging === true || self.attackAnim > 0 ? 'NATIVE_FIRST_PERSON_SWING_UNSUPPORTED' : 'NATIVE_FIRST_PERSON_SWING_STATE_UNKNOWN'
  const spinAttack = self.spinAttack ?? self.autoSpinAttack
  if (spinAttack !== false) return spinAttack === true ? 'NATIVE_FIRST_PERSON_SPIN_ATTACK_UNSUPPORTED' : 'NATIVE_FIRST_PERSON_SPIN_STATE_UNKNOWN'
  if (self.attackStrengthScale !== 1) return Number.isFinite(self.attackStrengthScale) ? 'NATIVE_FIRST_PERSON_ATTACK_COOLDOWN_UNSUPPORTED' : 'NATIVE_FIRST_PERSON_ATTACK_COOLDOWN_UNKNOWN'
  if (self.onGround !== true || !self.velocity || self.velocity.x !== 0 || self.velocity.z !== 0 ||
      (self.crouching !== false && self.sneaking !== false)) return 'NATIVE_FIRST_PERSON_STATIONARY_POSE_UNAVAILABLE'
  return null
}

// Original ItemModelGenerator merges all edge pixels at the same anchor into
// one span, including gaps. Its LEFT sprite edge uses EAST; RIGHT uses WEST.
// Alpha == 0 (not the render alpha-test threshold) is the native transparency
// test. Only the observed single static PNG frame is supported here.
export function nativeGeneratedItemElements({ width, height, pixels } = {}) {
  if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 512) ||
      width * height > MAX_PIXELS || !(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) ||
      pixels.length !== width * height * 4) throw Error('NATIVE_HELD_SPRITE_INVALID')
  const spans = [], byAnchor = new Map()
  const facings = [ ['up', 0, -1, true], ['down', 0, 1, true], ['east', -1, 0, false], ['west', 1, 0, false] ]
  const transparent = (x, y) => x < 0 || y < 0 || x >= width || y >= height || pixels[(y * width + x) * 4 + 3] === 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (transparent(x, y)) continue
    for (const [direction, dx, dy, horizontal] of facings) {
      if (!transparent(x + dx, y + dy)) continue
      const anchor = horizontal ? y : x, coord = horizontal ? x : y, key = `${direction}:${anchor}`
      if (!byAnchor.has(key)) { const span = { direction, anchor, min: coord, max: coord }; byAnchor.set(key, span); spans.push(span) }
      else { const span = byAnchor.get(key); span.min = Math.min(span.min, coord); span.max = Math.max(span.max, coord) }
    }
  }
  const face = uv => ({ texture: '#layer0', uv, tintindex: 0 })
  const elements = [{ from: [0, 0, 7.5], to: [16, 16, 8.5], faces: { south: face([0, 0, 16, 16]), north: face([16, 0, 0, 16]) } }]
  const sx = F(16 / width), sy = F(16 / height)
  for (const { direction, anchor: a, min, max } of spans) {
    let x0, x1, y0, y1, uv
    if (direction === 'up' || direction === 'down') {
      x0 = mul(min, sx); x1 = mul(max + 1, sx)
      y0 = y1 = F(16 - mul(a + (direction === 'down' ? 1 : 0), sy))
      uv = [x0, mul(a, sy), x1, mul(a + 1, sy)]
    } else {
      x0 = x1 = mul(a + (direction === 'west' ? 1 : 0), sx)
      y0 = F(16 - mul(min, sy)); y1 = F(16 - mul(max + 1, sy))
      uv = [mul(a, sx), mul(max + 1, sy), mul(a + 1, sx), mul(min, sy)]
    }
    elements.push({ from: [x0, y0, 7.5], to: [x1, y1, 8.5], faces: { [direction]: face(uv) } })
  }
  return elements
}

async function generatedModel(reader, id, ancestry = []) {
  const path = resourcePath(id, 'models', '.json')
  if (ancestry.length >= 32 || ancestry.includes(path)) throw Error('NATIVE_HELD_PARENT_CYCLE')
  const own = await reader.json(path)
  if (!record(own) || own.loader || own.elements?.length || own.overrides?.length ||
      (own.overrides !== undefined && !Array.isArray(own.overrides)) ||
      (own.elements !== undefined && !Array.isArray(own.elements)) || !record(own.textures ?? {}) ||
      !record(own.display ?? {})) throw Error('NATIVE_HELD_DYNAMIC_MODEL_UNSUPPORTED')
  const generated = /^(?:minecraft:)?builtin\/generated$/.test(own.parent)
  if (!own.parent) throw Error('NATIVE_HELD_GENERATED_PARENT_REQUIRED')
  const parent = generated ? { textures: {}, display: {}, sourcePaths: [] } : await generatedModel(reader, own.parent, [...ancestry, path])
  return { ...parent, ...own, textures: { ...parent.textures, ...own.textures }, display: { ...parent.display, ...own.display },
    sourcePaths: [...parent.sourcePaths, path] }
}

function validateStaticStack(stack) {
  if (!TOOL.test(stack.id) && stack.id !== 'minecraft:stick') throw Error('NATIVE_HELD_ITEM_PROVIDER_UNSUPPORTED')
  for (const [key, value] of Object.entries(stack.components)) {
    if (!NON_VISUAL.has(key)) throw Error(`NATIVE_HELD_ITEM_COMPONENT_UNSUPPORTED:${key}`)
    if (key === 'minecraft:damage') {
      const damage = nativeNumericValue(value)
      if (!Number.isSafeInteger(damage) || damage < 0 || damage > 2147483647) throw Error('NATIVE_HELD_DAMAGE_INVALID')
    }
  }
}

function textureDimensions(bytes) {
  if (bytes.length < 33 || [137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => bytes[i] !== v)) throw Error('NATIVE_HELD_TEXTURE_PNG_INVALID')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw Error('NATIVE_HELD_TEXTURE_PNG_INVALID')
  const width = view.getUint32(16), height = view.getUint32(20)
  if (![width, height].every(value => value > 0 && value <= 512) || width * height > MAX_PIXELS) throw Error('NATIVE_HELD_TEXTURE_LIMIT')
  return { width, height }
}

async function readPngPixels(bytes) {
  const dimensions = textureDimensions(bytes), bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
  try {
    if (bitmap.width !== dimensions.width || bitmap.height !== dimensions.height) throw Error('NATIVE_HELD_TEXTURE_DECODE_INVALID')
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw Error('NATIVE_HELD_PIXELS_UNAVAILABLE')
    context.drawImage(bitmap, 0, 0)
    return { ...dimensions, pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data }
  } finally { bitmap.close() }
}

export async function prepareNativeHeldItem(reader, input, arm, { readPixels = readPngPixels } = {}) {
  if (!(reader instanceof NativeAssetReader) || reader.manifest.clientJarSha256 !== HELD_ITEM_CLIENT_SHA256) throw Error('NATIVE_HELD_CLIENT_UNVERIFIED')
  if (!['left', 'right'].includes(arm)) throw Error('NATIVE_HELD_ARM_INVALID')
  const stack = input?.id ? input : parseNativeItemStack(input)
  if (!record(stack.components) || !Number.isSafeInteger(stack.count) || stack.count <= 0) throw Error('NATIVE_HELD_STACK_INVALID')
  if (nativeArsItemEligible(stack.id)) {
    // Shared provider validates complete components, source JARs, PNG/model
    // bytes and resource conflicts. GUI faces/transform are NOT used here.
    const checked = await prepareNativeArsItemIcon(reader, stack)
    const itemPath = resourcePath(`${stack.id.split(':')[0]}:item/${stack.id.split(':')[1]}`, 'models', '.json')
    const model = await reader.json(itemPath)
    const open = checked.leaf !== 'worn_notebook'
    const geoPath = `assets/ars_nouveau/geo/spellbook_${open ? 'open' : 'closed'}.geo.json`
    if (open && reader.manifest.assets[geoPath]?.sha256 !== ARS_OPEN_MODEL_SHA256) throw Error('NATIVE_HELD_ARS_OPEN_MODEL_UNVERIFIED')
    const faces = bakeNativeArsGeoFaces(await reader.json(geoPath), checked.tier)
    const display = model.display?.[`thirdperson_${arm}hand`] ?? model.display?.thirdperson_righthand ?? {}
    const firstDisplay = model.display?.[`firstperson_${arm}hand`] ?? model.display?.firstperson_righthand ?? {}
    const textureBytes = await reader.bytes(checked.texturePath), dimensions = textureDimensions(textureBytes)
    return { stack, arm, kind: 'native-ars-held', faces, texturePath: checked.texturePath, textureBytes, dimensions,
      transform: nativeHeldItemTransform(display, arm), firstPersonTransform: nativeHeldItemTransform(firstDisplay, arm, 'firstperson'),
      sourcePaths: [...new Set([...checked.sourcePaths, geoPath])],
      geometry: open ? 'ars_nouveau:spellbook_open' : 'ars_nouveau:spellbook_closed', tier: checked.tier, color: checked.color,
      geoOffsetY: F(0.51) - 0.5, material: 'entityTranslucent', animationControllerCount: 0,
      geometrySourceVerified: true, worldLightingParityVerified: false, pixelParityVerified: false }
  }
  let modelId = `${stack.id.split(':')[0]}:item/${stack.id.split(':')[1]}`, provider = null
  if (nativeGuideItemEligible(stack.id)) {
    provider = await prepareNativeGuideItemIcon(reader, stack)
    modelId = provider.modelId
  } else if (TOOL.test(stack.id) || stack.id === 'minecraft:stick') validateStaticStack(stack)
  else {
    // Registration/ItemColors/ItemProperties evidence is positive and bound
    // to the exact JARs, not inferred from a conveniently named JSON file.
    const checked = nativeStaticItemState(stack)
    verifyNativeStaticItemEvidence(reader, checked.stack.id)
  }
  const model = await generatedModel(reader, modelId)
  if (!model.textures.layer0 || Object.keys(model.textures).some(key => /^layer[1-9]/.test(key))) throw Error('NATIVE_HELD_LAYERS_UNSUPPORTED')
  const texturePath = resourcePath(textureId(model, model.textures.layer0), 'textures', '.png')
  if (reader.manifest.assets[`${texturePath}.mcmeta`]) throw Error('NATIVE_HELD_TEXTURE_ANIMATION_UNSUPPORTED')
  const textureBytes = await reader.bytes(texturePath), dimensions = textureDimensions(textureBytes)
  const decoded = await readPixels(textureBytes)
  if (decoded?.width !== dimensions.width || decoded?.height !== dimensions.height) throw Error('NATIVE_HELD_TEXTURE_DECODE_INVALID')
  const elements = nativeGeneratedItemElements(decoded)
  const faces = bakeFaces({ elements, textures: { layer0: textureId(model, model.textures.layer0) } }, {}, { allowTint: true })
  const display = model.display[`thirdperson_${arm}hand`] ?? model.display.thirdperson_righthand ?? {}
  const firstDisplay = model.display[`firstperson_${arm}hand`] ?? model.display.firstperson_righthand ?? {}
  return { stack, arm, kind: 'native-generated-held', faces, texturePath, textureBytes, dimensions,
    transform: nativeHeldItemTransform(display, arm), firstPersonTransform: nativeHeldItemTransform(firstDisplay, arm, 'firstperson'),
    sourcePaths: [...new Set([...(provider?.sourcePaths ?? []), ...model.sourcePaths, texturePath])],
    geometry: 'Minecraft 1.21.1 ItemModelGenerator', geoOffsetY: 0, material: 'entityCutout', alphaSilhouette: alphaSilhouette(decoded),
    geometrySourceVerified: true, atlasUvShrinkAvailable: false, worldLightingParityVerified: false, pixelParityVerified: false }
}

export function buildNativeHeldItemObject(plan, texture) {
  if (!texture?.isTexture || texture.image?.width !== plan.dimensions.width || texture.image?.height !== plan.dimensions.height) throw Error('NATIVE_HELD_TEXTURE_DECODE_INVALID')
  texture.colorSpace = THREE.NoColorSpace; texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false; texture.flipY = true; texture.needsUpdate = true
  const material = new THREE.ShaderMaterial({ uniforms: { nativeTexture: { value: texture } },
    vertexShader: 'varying vec2 nativeUV; void main(){ nativeUV=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D nativeTexture; varying vec2 nativeUV; void main(){ vec4 c=texture2D(nativeTexture,nativeUV); if(c.a<0.1)discard; gl_FragColor=c; }',
    side: THREE.DoubleSide, transparent: plan.material === 'entityTranslucent', depthWrite: true, toneMapped: false, forceSinglePass: true })
  const group = new THREE.Group(); group.position.y = plan.geoOffsetY
  try {
    for (const face of plan.faces) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(face.position, 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(face.uv, 2)); geometry.setIndex(face.indices)
      if (face.normal) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array(4).fill(face.normal).flat(), 3))
      else geometry.computeVertexNormals()
      const mesh = new THREE.Mesh(geometry, material); mesh.userData.nativeFace = face; group.add(mesh)
    }
    group.userData = { nativeItem: plan.stack.id, kind: plan.kind, geometry: plan.geometry, sourcePaths: plan.sourcePaths,
      worldLightingParityVerified: false, pixelParityVerified: false, atlasUvShrinkAvailable: plan.atlasUvShrinkAvailable ?? null }
    return group
  } catch (error) { disposeNativeHeldItemObject(group); if (!group.children.length) material.dispose(); throw error }
}

export function disposeNativeHeldItemObject(group) {
  const materials = new Set()
  group.traverse(part => { if (part.isMesh) { part.geometry.dispose(); materials.add(part.material) } })
  for (const material of materials) material.dispose()
  group.removeFromParent()
}

// ITEM arm pose is applied before AnimationUtils.bobModelPart, in float order.
export function nativeHeldArmRotations(value, motion, heldArms = []) {
  const available = value?.available === true
  const base = available ? nativeHumanoidWalkAngles({ position: value.position, speed: value.speed, ageInTicks: null }).limbs :
    { rightArm: { x: 0, y: 0, z: 0 }, leftArm: { x: 0, y: 0, z: 0 }, rightLeg: { x: 0, y: 0, z: 0 }, leftLeg: { x: 0, y: 0, z: 0 } }
  const limbs = Object.fromEntries(Object.entries(base).map(([key, entry]) => [key, { ...entry }]))
  for (const arm of heldArms) {
    if (!['left', 'right'].includes(arm)) throw Error('NATIVE_HELD_ARM_INVALID')
    limbs[`${arm}Arm`].x = F(mul(limbs[`${arm}Arm`].x, 0.5) - F(0.31415927)); limbs[`${arm}Arm`].y = 0
  }
  if (available && value.bobAvailable === true && Number.isInteger(motion?.ageInTicks)) {
    const age = add(motion.ageInTicks, value.partialTick)
    const z = add(mul(nativePlayerCos(mul(age, F(0.09))), F(0.05)), F(0.05))
    const x = mul(nativePlayerSin(mul(age, F(0.067))), F(0.05))
    limbs.rightArm.z = add(limbs.rightArm.z, z); limbs.leftArm.z = F(limbs.leftArm.z - z)
    limbs.rightArm.x = add(limbs.rightArm.x, x); limbs.leftArm.x = F(limbs.leftArm.x - x)
  }
  return Object.fromEntries(Object.entries(limbs).map(([name, angle]) => [name, toSkinviewLimbRotation(angle)]))
}

async function loadTexture(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
  try { return await new THREE.TextureLoader().loadAsync(url) } finally { URL.revokeObjectURL(url) }
}

export class NativeHeldItems {
  constructor(reader, { uuid, playerObject, slim = false, readPixels, loadHeldTexture = loadTexture, onChange = () => {} } = {}) {
    this.reader = reader; this.uuid = normalizeUuid(uuid); this.player = playerObject; this.slim = slim
    if (!playerObject?.skin?.rightArm?.isObject3D || !playerObject?.skin?.leftArm?.isObject3D) throw Error('NATIVE_HELD_PLAYER_MODEL_INVALID')
    this.readPixels = readPixels; this.loadTexture = loadHeldTexture; this.onChange = onChange; this.disposed = false
    this.hands = new Map(); this.selection = null; this.reason = 'NATIVE_HELD_INVENTORY_UNAVAILABLE'; this.firstViewport = null
    this.firstPersonRoot = new THREE.Group(); this.firstPersonRoot.name = 'native-own-first-person-items'
    this.firstPersonRoot.visible = false; this.firstPersonRoot.userData.playerUuid = this.uuid
  }
  state() {
    const available = ['right', 'left'].some(arm => this.hands.get(arm)?.status === 'ready' && this.hands.get(arm)?.mount?.visible)
    return { playerUuid: this.uuid, available, reason: available ? null : this.unavailableReason('thirdperson'), context: 'thirdperson',
      hands: Object.fromEntries(['right', 'left'].map(arm => {
        const value = this.hands.get(arm)
        return [arm, value ? { slot: value.slot, name: value.raw?.name ?? null, status: value.status, reason: value.reason ?? null,
          geometry: value.plan?.geometry ?? null, componentSource: value.componentSource ?? null, visible: value.mount?.visible ?? false,
          armPoseAvailable: !thirdPersonPoseReason(this.selection?.self) } : { status: 'unknown', reason: this.reason }]
      })), equipmentRenderingAvailable: false, worldLightingParityVerified: false, pixelParityVerified: false }
  }
  firstPersonState() {
    const available = ['right', 'left'].some(arm => this.hands.get(arm)?.status === 'ready' && this.hands.get(arm)?.firstMount?.visible)
    const reason = available ? null : this.unavailableReason('firstperson')
    return { playerUuid: this.uuid, available, reason, context: 'firstperson', poseScope: 'stationary_no_use_or_swing_equipped_endpoint',
      equipmentTransitionAvailable: false, cameraLagAnimationAvailable: false, viewBobbingAnimationAvailable: false, emptyHandArmRenderingAvailable: false,
      hands: Object.fromEntries(['right','left'].map(arm => [arm, { status: this.hands.get(arm)?.status ?? 'unknown',
        visible: this.hands.get(arm)?.firstMount?.visible ?? false, name: this.hands.get(arm)?.raw?.name ?? null,
        reason: this.hands.get(arm)?.status === 'unsupported' ? this.hands.get(arm)?.reason : this.hands.get(arm)?.firstReason ?? null,
        projection: this.hands.get(arm)?.firstProjection ?? null }])),
      worldLightingParityVerified: false, pixelParityVerified: false }
  }
  unavailableReason(context) {
    if (this.reason) return this.reason
    const pose = context === 'firstperson' ? firstPersonPoseReason(this.selection?.self) : thirdPersonPoseReason(this.selection?.self)
    if (pose) return pose
    const entries = [...this.hands.values()]
    if (entries.some(entry => entry.status === 'loading')) return 'NATIVE_HELD_ITEMS_LOADING'
    const unsupported = entries.find(entry => entry.status === 'unsupported')
    if (unsupported) return unsupported.reason
    if (entries.length && entries.every(entry => entry.status === 'empty')) return 'NATIVE_HELD_HANDS_EMPTY'
    return context === 'firstperson' ? entries.find(entry => entry.firstReason)?.firstReason ?? 'NATIVE_FIRST_PERSON_VIEWPORT_UNKNOWN' : 'NATIVE_HELD_ITEMS_UNAVAILABLE'
  }
  setFirstPersonViewport(viewport) {
    this.firstViewport = { fov: viewport?.fov, aspect: viewport?.aspect, near: viewport?.near, far: viewport?.far }
    this.refreshPose(); this.onChange(this.state()); return this.firstPersonState()
  }
  retire(arm) {
    const value = this.hands.get(arm)
    if (!value) return
    value.cancelled = true
    if (value.object) disposeNativeHeldItemObject(value.object)
    if (value.firstObject) disposeNativeHeldItemObject(value.firstObject)
    value.mount?.removeFromParent(); value.firstMount?.removeFromParent(); value.texture?.dispose(); value.texture?.image?.close?.()
    this.hands.delete(arm)
  }
  apply(frame) {
    if (this.disposed) throw Error('NATIVE_HELD_DISPOSED')
    try { this.selection = selectNativeHeldItems(frame, this.uuid); this.reason = null } catch (error) {
      this.selection = null; this.reason = error.message
      for (const arm of ['right', 'left']) this.retire(arm)
      this.onChange(this.state()); return this.state()
    }
    for (const arm of ['right', 'left']) {
      const { slot, raw } = this.selection.hands[arm]
      // Validate BEFORE cache reuse; structured component input must never
      // smuggle a changed stack behind the same previously accepted SNBT key.
      if (raw !== null) {
        try { parseNativeItemStack(raw) } catch (error) {
          this.retire(arm)
          this.hands.set(arm, { slot, raw, key: null, status: 'unsupported', reason: error.message, cancelled: false, componentSource: null })
          continue
        }
      }
      const key = raw === null ? 'empty' : `${raw?.name}#${raw?.count}#${raw?.snbt}`
      if (this.hands.get(arm)?.key === key) { Object.assign(this.hands.get(arm), { slot, raw }); continue }
      this.retire(arm)
      const entry = { slot, raw, key, status: raw === null ? 'empty' : 'loading', cancelled: false,
        componentSource: raw === null ? null : 'complete_native_snbt' }
      this.hands.set(arm, entry)
      if (raw !== null) void this.load(arm, entry)
    }
    this.refreshPose(); this.onChange(this.state()); return this.state()
  }
  async load(arm, entry) {
    let texture, object, firstObject
    const current = () => !this.disposed && !entry.cancelled && this.hands.get(arm) === entry
    try {
      const stack = parseNativeItemStack(entry.raw)
      const plan = await prepareNativeHeldItem(this.reader, stack, arm, { readPixels: this.readPixels })
      if (!current()) return
      texture = await this.loadTexture(plan.textureBytes)
      if (!current()) { texture?.dispose(); texture?.image?.close?.(); return }
      object = buildNativeHeldItemObject(plan, texture)
      firstObject = buildNativeHeldItemObject(plan, texture)
      const mount = new THREE.Group(); mount.name = `native-held-${arm}`; mount.matrixAutoUpdate = false; mount.add(object)
      const firstMount = new THREE.Group(); firstMount.name = `native-first-held-${arm}`; firstMount.matrixAutoUpdate = false; firstMount.add(firstObject)
      firstMount.matrix.copy(nativeFirstPersonIdleMountMatrix({ arm, transform: plan.firstPersonTransform }))
      this.firstPersonRoot.add(firstMount)
      this.player.skin[`${arm}Arm`].add(mount)
      Object.assign(entry, { plan, texture, object, mount, firstObject, firstMount, status: 'ready', reason: null })
      this.refreshPose(); this.onChange(this.state())
    } catch (error) {
      if (object) disposeNativeHeldItemObject(object)
      if (firstObject) disposeNativeHeldItemObject(firstObject)
      texture?.dispose(); texture?.image?.close?.()
      if (current()) { entry.status = 'unsupported'; entry.reason = error.message; this.onChange(this.state()) }
    }
  }
  armRotations(value, motion) {
    if (!this.selection || thirdPersonPoseReason(this.selection.self)) return value?.skinview ?? null
    const arms = ['right', 'left'].filter(arm => this.hands.get(arm)?.status === 'ready')
    return nativeHeldArmRotations(value, motion, arms)
  }
  refreshPose() {
    for (const [arm, entry] of this.hands) if (entry.mount) {
      const poseReason = thirdPersonPoseReason(this.selection?.self)
      entry.mount.visible = !poseReason
      entry.reason = poseReason
      entry.mount.matrix.copy(nativeHeldArmMountMatrix({ arm, slim: this.slim,
        rotation: this.player.skin[`${arm}Arm`].rotation, transform: entry.plan.transform })); entry.mount.matrixWorldNeedsUpdate = true
      const projectionKey = JSON.stringify(this.firstViewport)
      if (entry.firstProjectionKey !== projectionKey) {
        entry.firstProjection = nativeFirstPersonSilhouetteProjection(entry.plan, this.firstViewport, arm)
        entry.firstProjectionKey = projectionKey
      }
      entry.firstReason = firstPersonPoseReason(this.selection?.self) || entry.firstProjection.reason
      entry.firstMount.visible = !entry.firstReason
    }
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const arm of ['right', 'left']) this.retire(arm)
    this.firstPersonRoot.visible = false; this.firstPersonRoot.removeFromParent(); this.firstPersonRoot.clear()
    this.selection = null
  }
}
