import * as THREE from 'three'
import { weightedModel, multipartMatches } from './model-selection.js'
import { lockedFaceUV } from './uv-lock.js'
import { animationFrames, applyFrame, enableInterpolation } from './texture-animation.js'

// Native assets only. A missing loader/model/texture is an error, never a cube
// or a vanilla replacement. Scene lighting and complete mod parity are separate
// acceptance steps; importing the original geometry is not a parity certificate.
const ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/
export function resourcePath (id, folder, extension) {
  if (typeof id !== 'string') throw Error('NATIVE_RESOURCE_ID_INVALID')
  id = id.includes(':') ? id : `minecraft:${id}`
  const [namespace, name] = id.split(':')
  if (!ID.test(id) || name.split('/').some(p => ['', '.', '..'].includes(p))) throw Error('NATIVE_RESOURCE_ID_INVALID')
  return `assets/${namespace}/${folder}/${name}${extension}`
}

export class NativeAssetReader {
  constructor (manifest, readBytes) {
    if (manifest.minecraftVersion !== '1.21.1' || !manifest.assetIntegrityVerified) throw Error('NATIVE_ASSET_MANIFEST_INVALID')
    this.manifest = manifest
    this.readBytes = readBytes
    this.cache = new Map()
  }

  async bytes (path) {
    const entry = this.manifest.assets[path]
    if (!entry) throw Error(`NATIVE_ASSET_MISSING:${path}`)
    if (entry.variants?.some(v => v.sha256 !== entry.sha256)) throw Error(`NATIVE_RESOURCE_PRIORITY_UNRESOLVED:${path}`)
    if (!this.cache.has(path)) {
      this.cache.set(path, (async () => {
        const bytes = new Uint8Array(await this.readBytes(path))
        const hash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
        if (bytes.length !== entry.bytes || hash !== entry.sha256) throw Error(`NATIVE_ASSET_HASH_MISMATCH:${path}`)
        return bytes
      })())
    }
    return this.cache.get(path)
  }

  async json (path) { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await this.bytes(path))) }
}

export async function resolveModel (reader, id, ancestry = []) {
  const path = resourcePath(id, 'models', '.json')
  if (ancestry.length >= 32 || ancestry.includes(path)) throw Error(`NATIVE_MODEL_PARENT_CYCLE:${path}`)
  const own = await reader.json(path)
  if (own.loader || own.parent?.startsWith('builtin/')) throw Error(`NATIVE_MODEL_LOADER_UNSUPPORTED:${path}`)
  const parent = own.parent ? await resolveModel(reader, own.parent, [...ancestry, path]) : {}
  return { ...parent, ...own, textures: { ...parent.textures, ...own.textures },
    elements: own.elements ?? parent.elements ?? [], sourcePaths: [...(parent.sourcePaths || []), path] }
}

export function textureId (model, reference) {
  const visited = new Set()
  while (reference?.startsWith('#')) {
    if (visited.has(reference)) throw Error('NATIVE_TEXTURE_REFERENCE_CYCLE')
    visited.add(reference)
    reference = model.textures[reference.slice(1)]
  }
  if (!reference) throw Error('NATIVE_MODEL_TEXTURE_MISSING')
  resourcePath(reference, 'textures', '.png')
  return reference.includes(':') ? reference : `minecraft:${reference}`
}

export function selectVariant (blockstate, properties, context = {}) {
  if (blockstate.multipart) throw Error('NATIVE_MULTIPART_MODEL_UNSUPPORTED')
  const matches = Object.entries(blockstate.variants || {}).filter(([key]) => !key || key.split(',').every(pair => {
    const [name, value] = pair.split('=')
    return value === String(properties[name])
  }))
  if (matches.length !== 1) throw Error('NATIVE_BLOCKSTATE_VARIANT_UNRESOLVED')
  let variant = matches[0][1]
  if (Array.isArray(variant)) {
    if (variant.length !== 1 && !context.defaultBlockSeedVerified) throw Error('NATIVE_WEIGHTED_BLOCK_SEED_UNVERIFIED')
    variant = variant.length === 1 ? variant[0] : weightedModel(variant, context.position)
  }
  return variant
}

export function selectBlockVariants (blockstate, state, position) {
  // These vanilla blocks use the bytecode-verified default BlockBehaviour seed.
  // A mod override of getSeed must be ported explicitly, never silently guessed.
  const context = { position, defaultBlockSeedVerified: ['minecraft:stone', 'minecraft:sand'].includes(state.name) }
  if (!blockstate.multipart) return [selectVariant(blockstate, state.properties, context)]
  const parts = blockstate.multipart.filter(part => multipartMatches(part.when, state.properties)).map(part => {
    let model = part.apply
    if (Array.isArray(model)) {
      if (model.length !== 1) throw Error('NATIVE_MULTIPART_WEIGHTED_RANDOM_UNSUPPORTED')
      model = model[0]
    }
    return model
  })
  if (!parts.length) throw Error('NATIVE_MULTIPART_MODEL_UNRESOLVED')
  return parts
}

// FaceInfo vertex order, and BlockFaceUV's rotated UV indices, in Minecraft
// coordinates (+X east, +Y up, +Z south). No remeshing or guessed UVs.
const CORNERS = {
  down: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
  up: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  north: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]],
  south: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]],
  west: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]],
  east: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]]
}
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }
const defaultUV = (direction, a, b) => ({
  down: [a[0], 16 - b[2], b[0], 16 - a[2]], up: [a[0], a[2], b[0], b[2]],
  north: [16 - b[0], 16 - b[1], 16 - a[0], 16 - a[1]], south: [a[0], 16 - b[1], b[0], 16 - a[1]],
  west: [a[2], 16 - b[1], b[2], 16 - a[1]], east: [16 - b[2], 16 - b[1], 16 - a[2], 16 - a[1]]
})[direction]

export function bakeFaces (model, variant = {}, { allowTint = false } = {}) {
  const faces = []
  for (const element of model.elements) {
    const a = element.from, b = element.to
    if (!a?.every(Number.isFinite) || !b?.every(Number.isFinite) || a.length !== 3 || b.length !== 3) throw Error('NATIVE_ELEMENT_BOUNDS_INVALID')
    for (const [direction, face] of Object.entries(element.faces || {})) {
      if (!CORNERS[direction]) throw Error('NATIVE_FACE_DIRECTION_INVALID')
      if (!allowTint && face.tintindex !== undefined && face.tintindex !== -1) throw Error('NATIVE_BLOCK_TINT_UNAVAILABLE')
      if (face.neoforge_data && Object.keys(face.neoforge_data).length) throw Error('NATIVE_FACE_EXTENSION_UNSUPPORTED')
      const extensionKeys = Object.keys(element.neoforge_data || {})
      if (extensionKeys.some(k => k !== 'calculate_normals')) throw Error('NATIVE_ELEMENT_EXTENSION_UNSUPPORTED')
      let rect = face.uv || defaultUV(direction, a, b)
      let rotation = face.rotation || 0
      if (![0, 90, 180, 270].includes(rotation) || rect.length !== 4 || !rect.every(Number.isFinite)) throw Error('NATIVE_FACE_UV_INVALID')
      if (variant.uvlock) ({ rectangle: rect, rotation } = lockedFaceUV(rect, rotation, direction, variant))
      const position = [], uv = []
      const r = element.rotation
      if (r && (!AXES[r.axis] || !Number.isFinite(r.angle) || !r.origin?.every(Number.isFinite))) throw Error('NATIVE_ELEMENT_ROTATION_INVALID')
      for (let i = 0; i < 4; i++) {
        const point = new THREE.Vector3(...CORNERS[direction][i].map((v, j) => (v ? b[j] : a[j])))
        if (r) {
          const origin = new THREE.Vector3(...r.origin)
          point.sub(origin).applyAxisAngle(AXES[r.axis], THREE.MathUtils.degToRad(r.angle))
          if (r.rescale) {
            const factor = 1 / Math.cos(THREE.MathUtils.degToRad(r.angle))
            for (const axis of ['x', 'y', 'z']) if (axis !== r.axis) point[axis] *= factor
          }
          point.add(origin)
        }
        point.divideScalar(16).subScalar(0.5)
        position.push(...point.toArray())
        const index = (i + rotation / 90) % 4
        uv.push(rect[index === 0 || index === 1 ? 0 : 2] / 16, 1 - rect[index === 0 || index === 3 ? 1 : 3] / 16)
      }
      faces.push({ texture: textureId(model, face.texture), direction, position, uv, indices: [0, 1, 2, 0, 2, 3],
        cullface: face.cullface ?? null, shade: element.shade !== false, tintIndex: face.tintindex ?? -1 })
    }
  }
  return faces
}

export class NativeModelLoader {
  constructor (reader, loadTexture) {
    this.reader = reader
    this.loadTexture = loadTexture || (async bytes => {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
      try { return await new THREE.TextureLoader().loadAsync(url) } finally { URL.revokeObjectURL(url) }
    })
    this.textures = new Map()
    this.materials = new Map()
    this.geometries = new Set()
    this.blockstates = new Map()
    this.animations = new Map()
  }

  async material (id) {
    if (!this.materials.has(id)) this.materials.set(id, (async () => {
      const path = resourcePath(id, 'textures', '.png')
      const meta = this.reader.manifest.assets[`${path}.mcmeta`]
      const animationMeta = meta ? (await this.reader.json(`${path}.mcmeta`)).animation : null
      const texture = await this.loadTexture(await this.reader.bytes(path))
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestMipmapLinearFilter
      texture.colorSpace = THREE.SRGBColorSpace
      texture.generateMipmaps = true
      this.textures.set(id, texture)
      const material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.1 })
      if (animationMeta) {
        const animation = animationFrames({ animation: animationMeta }, texture.image.width, texture.image.height)
        if (animation.interpolate) enableInterpolation(material, THREE)
        this.animations.set(id, { texture, material, animation }); applyFrame(texture, material, animation, 0)
      }
      return material
    })())
    return this.materials.get(id)
  }

  async fluidMaterial (id) {
    const key = `native-fluid:${id}`
    if (!this.materials.has(key)) this.materials.set(key, (async () => {
      const material = (await this.material(id)).clone()
      material.transparent = true; material.vertexColors = true
      const original = this.animations.get(id)
      if (original) {
        if (original.animation.interpolate) enableInterpolation(material, THREE)
        this.animations.set(key, { ...original, material })
        applyFrame(original.texture, material, original.animation, 0)
      }
      return material
    })())
    return this.materials.get(key)
  }

  async model (id, variant = {}, context = {}) {
    const model = await resolveModel(this.reader, id)
    const faces = bakeFaces(model, variant, context)
    const materials = new Map(await Promise.all([...new Set(faces.map(f => f.texture))].map(async texture => [texture, await this.material(texture)])))
    const group = new THREE.Group()
    group.userData = { nativeModel: id, sourcePaths: model.sourcePaths, faceCount: faces.length }
    group.rotation.set(-THREE.MathUtils.degToRad(variant.x || 0), -THREE.MathUtils.degToRad(variant.y || 0), 0, 'YXZ')
    for (const face of faces) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(face.position, 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(face.uv, 2))
      geometry.setIndex(face.indices)
      geometry.computeVertexNormals()
      this.geometries.add(geometry)
      const mesh = new THREE.Mesh(geometry, materials.get(face.texture))
      mesh.userData = { direction: face.direction, originalTexture: face.texture, originalUV: face.uv, cullface: face.cullface, shade: face.shade, tintIndex: face.tintIndex }
      group.add(mesh)
    }
    return group
  }

  async blockstate (name) {
    if (!this.blockstates.has(name)) this.blockstates.set(name, this.reader.json(resourcePath(name, 'blockstates', '.json')))
    return this.blockstates.get(name)
  }

  async variantsAt (nativeState, position) {
    return selectBlockVariants(await this.blockstate(nativeState.name), nativeState, position)
  }

  async models (variants, context = {}) {
    const group = new THREE.Group()
    for (const variant of variants) group.add(await this.model(variant.model, variant, context))
    return group
  }

  async block (nativeState, position) {
    return this.models(await this.variantsAt(nativeState, position))
  }

  releaseModel (model) {
    // Each call to model() owns its geometry; textures/materials are shared.
    model.traverse(part => {
      if (part.isMesh && this.geometries.delete(part.geometry)) part.geometry.dispose()
    })
  }

  animateTextures (ticks) {
    for (const { texture, material, animation } of this.animations.values()) applyFrame(texture, material, animation, ticks)
  }

  async dispose () {
    for (const geometry of this.geometries) geometry.dispose()
    for (const promise of this.materials.values()) { try { (await promise).dispose() } catch {} }
    for (const texture of this.textures.values()) texture.dispose()
    this.geometries.clear(); this.materials.clear(); this.textures.clear(); this.animations.clear()
  }
}
