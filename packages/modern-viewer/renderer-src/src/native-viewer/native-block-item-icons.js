import * as THREE from 'three'
import { bakeFaces, resourcePath } from './model-loader.js'
import { NATIVE_STATIC_BLOCK_ITEM_NAMES, verifyNativeStaticItemEvidence } from './native-static-item-providers.js'

// Source: the locked 1.21.1 client, ItemTransform.apply/Deserializer,
// GuiGraphics.renderItem, Lighting.setupFor3DItems and
// GlStateManager.setupGui3DDiffuseLighting. The face geometry/UV baker is shared
// with the native world, not a hand-made replacement cube. Full pixel parity
// still needs a matched Java-client capture; source verification alone is not it.
export const BLOCK_ICON_CLIENT_SHA256 = '499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'
export const BLOCK_ICON_SHADER_HASHES = Object.freeze({
  'assets/minecraft/shaders/include/light.glsl': '0fdb0d7a1bc8223cd8232af7d7df84ac33463a183c8378127669a6f295e7466b',
  'assets/minecraft/shaders/core/rendertype_entity_cutout.vsh': 'dca1070a742c07fd94fd56f620cccc0bd820694743f53b30cbedca9c4e34a284',
  'assets/minecraft/shaders/core/rendertype_entity_cutout.fsh': '6319a09f7bf8322d0ec8dff7d24a24ac5f6bc10f04cda7d1a18cc4b1453b881d'
})
// Positive locked Item/BlockItem constructor evidence. This is a provider
// candidate list; original model/material/texture guards still decide support.
export const NATIVE_GUI_BLOCK_ITEMS = NATIVE_STATIC_BLOCK_ITEM_NAMES
const BLOCK_ITEMS = new Set(NATIVE_GUI_BLOCK_ITEMS)
export const nativeBlockItemEligible = name => BLOCK_ITEMS.has(name)
const record = value => value && typeof value === 'object' && !Array.isArray(value)

export async function resolveNativeBlockItemModel(reader, id, ancestry = []) {
  const path = resourcePath(id, 'models', '.json')
  if (ancestry.length >= 32 || ancestry.includes(path)) throw Error('NATIVE_BLOCK_ITEM_PARENT_CYCLE')
  const own = await reader.json(path)
  if (!record(own) || own.loader || own.overrides?.length ||
      (own.overrides !== undefined && !Array.isArray(own.overrides)) ||
      (own.parent && /^(?:minecraft:)?builtin\//.test(own.parent) && !/^(?:minecraft:)?builtin\/generated$/.test(own.parent))) throw Error('NATIVE_BLOCK_ITEM_DYNAMIC_MODEL_UNSUPPORTED')
  if (own.display !== undefined && !record(own.display)) throw Error('NATIVE_BLOCK_ITEM_DISPLAY_INVALID')
  if (own.textures !== undefined && !record(own.textures)) throw Error('NATIVE_BLOCK_ITEM_TEXTURES_INVALID')
  if (own.elements !== undefined && (!Array.isArray(own.elements) || own.elements.length > 128)) throw Error('NATIVE_BLOCK_ITEM_ELEMENT_LIMIT')
  const generated = /^(?:minecraft:)?builtin\/generated$/.test(own.parent ?? '')
  const parent = own.parent && !generated ? await resolveNativeBlockItemModel(reader, own.parent, [...ancestry, path]) : {}
  return { ...parent, ...own, textures: { ...parent.textures, ...own.textures },
    display: { ...parent.display, ...own.display }, elements: own.elements ?? parent.elements ?? [],
    nativeGenerated: generated || Boolean(parent.nativeGenerated),
    sourcePaths: [...(parent.sourcePaths || []), path] }
}

export function nativeGuiItemTransform(gui = {}) {
  if (!record(gui)) throw Error('NATIVE_BLOCK_ITEM_GUI_TRANSFORM_INVALID')
  const vector = (value, fallback) => {
    value ??= fallback
    if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw Error('NATIVE_BLOCK_ITEM_GUI_TRANSFORM_INVALID')
    return [...value]
  }
  const rotation = vector(gui.rotation, [0, 0, 0])
  // ItemTransform.Deserializer converts JSON translation to model units before
  // clamping it; scale is clamped separately. The GUI uses the right-hand form.
  const translation = vector(gui.translation, [0, 0, 0]).map(n => Math.max(-5, Math.min(5, n / 16)))
  const scale = vector(gui.scale, [1, 1, 1]).map(n => Math.max(-4, Math.min(4, n)))
  // Reflected/degenerate models need separately verified winding/material rules.
  if (scale.some(n => n <= 0)) throw Error('NATIVE_BLOCK_ITEM_REFLECTED_GUI_UNSUPPORTED')
  return { rotation, translation, scale }
}

const rotationYXZ = (y, x, z) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, 'YXZ'))
const lightMatrix = new THREE.Matrix4().makeScale(1, -1, 1)
  .multiply(rotationYXZ(1.0821041, 3.2375858, 0))
  .multiply(rotationYXZ(-0.3926991, 2.3561945, 0))
export const NATIVE_GUI_LIGHT_DIRECTIONS = Object.freeze([
  new THREE.Vector3(0.2, 1, -0.7).normalize().transformDirection(lightMatrix).toArray(),
  new THREE.Vector3(-0.2, 1, 0.7).normalize().transformDirection(lightMatrix).toArray()
].map(value => Object.freeze(value)))

// Port of the original light.glsl formula, with native GuiGraphics' Y reflection
// in the normal. The offscreen orthographic canvas itself already has Y-up.
export function nativeGuiLight(normal, transform) {
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...transform.translation),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad), 'XYZ')),
    new THREE.Vector3(...transform.scale))
  const n = new THREE.Vector3(...normal).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix)); n.y = -n.y
  return Math.min(1, NATIVE_GUI_LIGHT_DIRECTIONS.reduce((sum, direction) => sum + Math.max(0, n.dot(new THREE.Vector3(...direction))), 0) * 0.6 + 0.4)
}

// GUI draw only: fixed orthographic camera looking -Z, positive ItemTransform
// scale, FrontSide triangles. GuiGraphics' negative Y and its screen projection
// negative Y cancel for raster winding; this offscreen camera uses Y-up. Cull
// only a clearly negative transformed triangle normal, retaining near-edge-on
// faces so float rounding cannot silently drop a possibly visible resource.
// This proof cannot be reused for first/third person, a mirrored scale, another
// camera or a DoubleSide/translucent renderer.
export function nativeGuiFaceCulling(faces, transform) {
  if(transform.scale.some(n=>!Number.isFinite(n)||n<=0))throw Error('NATIVE_BLOCK_ITEM_REFLECTED_GUI_UNSUPPORTED')
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...transform.translation),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad),'XYZ')),
    new THREE.Vector3(...transform.scale))
  const visible=[],culled=[]
  for(const [faceIndex,face] of faces.entries()) {
    const points=[0,3,6].map(offset=>new THREE.Vector3(...face.position.slice(offset,offset+3).map(Math.fround)).applyMatrix4(matrix))
    const normal=new THREE.Vector3().subVectors(points[1],points[0]).cross(new THREE.Vector3().subVectors(points[2],points[0])).normalize()
    if(normal.z < -1e-5)culled.push({faceIndex,direction:face.direction,resourcePath:resourcePath(face.texture,'textures','.png'),
      normalZ:normal.z,reason:'native_gui_frontside_backface',resourceRequested:false,resourceVerified:false})
    else visible.push(face)
  }
  return {visible,culled,context:'GUI',projection:'orthographic',cameraForward:[0,0,-1],materialSide:'FrontSide',transform}
}

export async function prepareNativeBlockItemIcon(reader, name) {
  if (!nativeBlockItemEligible(name)) throw Error('NATIVE_BLOCK_ITEM_PROVIDER_UNSUPPORTED')
  const evidence = verifyNativeStaticItemEvidence(reader, name)
  const [namespace, leaf] = name.split(':')
  const model = await resolveNativeBlockItemModel(reader, `${namespace}:item/${leaf}`)
  return prepareNativeBlockGuiPlan(reader, { name, model, evidence })
}

// Shared original JSON geometry, GUI transform, shaders and bounded resource
// validation. Dynamic providers must resolve and audit their native model first.
export async function prepareNativeBlockGuiPlan(reader, { name, model, evidence, sourcePaths = [] }) {
  if (reader.manifest.clientJarSha256 !== BLOCK_ICON_CLIENT_SHA256) throw Error('NATIVE_BLOCK_ITEM_CLIENT_UNVERIFIED')
  for (const [path, hash] of Object.entries(BLOCK_ICON_SHADER_HASHES)) {
    if (reader.manifest.assets[path]?.sha256 !== hash) throw Error(`NATIVE_BLOCK_ITEM_SHADER_UNSUPPORTED:${path}`)
    await reader.bytes(path) // Also enforces the manifest SHA and resource priority.
  }
  if (model.nativeGenerated) throw Error('NATIVE_BLOCK_ITEM_GENERATED_PROVIDER_REQUIRED')
  if (!model.elements.length || model.elements.length > 128) throw Error('NATIVE_BLOCK_ITEM_ELEMENT_LIMIT')
  if ((model.gui_light ?? 'side') !== 'side') throw Error('NATIVE_BLOCK_ITEM_FRONT_LIGHT_UNSUPPORTED')
  if (model.render_type !== undefined && !['solid','minecraft:solid'].includes(model.render_type)) throw Error('NATIVE_BLOCK_ITEM_RENDER_TYPE_UNSUPPORTED')
  if (model.elements.some(element => !record(element) || !record(element.faces) || Object.keys(element.faces).length > 6)) throw Error('NATIVE_BLOCK_ITEM_FACES_INVALID')
  for (const element of model.elements) {
    // BlockElement.Deserializer's original coordinate/rotation limits also
    // prevent valid-looking doubles from overflowing GPU float attributes.
    for (const bounds of [element.from, element.to]) if (!Array.isArray(bounds) || bounds.length !== 3 ||
      !bounds.every(n => Number.isFinite(n) && n >= -16 && n <= 32)) throw Error('NATIVE_BLOCK_ITEM_BOUNDS_INVALID')
    if (element.rotation && (![-45, -22.5, 0, 22.5, 45].includes(element.rotation.angle) ||
      !Array.isArray(element.rotation.origin) || element.rotation.origin.length !== 3 ||
      !element.rotation.origin.every(n => Number.isFinite(n) && Math.abs(n) <= 32))) throw Error('NATIVE_BLOCK_ITEM_ROTATION_UNSUPPORTED')
  }
  const faces = bakeFaces(model)
  if (!faces.length || faces.length > 768) throw Error('NATIVE_BLOCK_ITEM_FACE_LIMIT')
  const transform=nativeGuiItemTransform(model.display.gui)
  const culling=nativeGuiFaceCulling(faces,transform)
  const texturePaths = [...new Set(culling.visible.map(face => resourcePath(face.texture, 'textures', '.png')))]
  if (texturePaths.length > 32) throw Error('NATIVE_BLOCK_ITEM_TEXTURE_LIMIT')
  for (const path of texturePaths) {
    if (reader.manifest.assets[`${path}.mcmeta`]) throw Error('NATIVE_BLOCK_ITEM_ANIMATION_UNSUPPORTED')
    const size = reader.manifest.assets[path]?.bytes
    if (!Number.isSafeInteger(size) || size <= 0 || size > 16777216) throw Error('NATIVE_BLOCK_ITEM_TEXTURE_LIMIT')
  }
  return { name, model, faces, renderFaces:culling.visible, culling, transform, texturePaths, evidence,
    sourcePaths: [...new Set([...sourcePaths, ...model.sourcePaths, ...texturePaths, ...Object.keys(BLOCK_ICON_SHADER_HASHES)])] }
}

function material(texture) {
  return new THREE.ShaderMaterial({ uniforms: {
    iconTexture: { value: texture }, light0: { value: new THREE.Vector3(...NATIVE_GUI_LIGHT_DIRECTIONS[0]) },
    light1: { value: new THREE.Vector3(...NATIVE_GUI_LIGHT_DIRECTIONS[1]) }
  }, vertexShader: `varying vec2 nativeUV; varying float nativeLight;
    uniform vec3 light0; uniform vec3 light1;
    void main() {
      vec3 n = normalize(normalMatrix * normal); n.y = -n.y;
      nativeLight = min(1.0, (max(0.0, dot(light0,n)) + max(0.0, dot(light1,n))) * 0.6 + 0.4);
      nativeUV = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }`, fragmentShader: `uniform sampler2D iconTexture; varying vec2 nativeUV; varying float nativeLight;
    void main() {
      vec4 color = texture2D(iconTexture, nativeUV); if (color.a < 0.1) discard;
      gl_FragColor = vec4(color.rgb * nativeLight, color.a);
    }`, toneMapped: false, side: THREE.FrontSide })
}

export function buildNativeBlockItemObject(plan, textures) {
  const group = new THREE.Group(), materials = new Map()
  try {
    for (const face of plan.renderFaces ?? plan.faces) {
      const path = resourcePath(face.texture, 'textures', '.png')
      if (!textures.has(path)) throw Error('NATIVE_BLOCK_ITEM_TEXTURE_MISSING')
      if (!materials.has(path)) materials.set(path, material(textures.get(path)))
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(face.position, 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(face.uv, 2))
      geometry.setIndex(face.indices); geometry.computeVertexNormals()
      const mesh = new THREE.Mesh(geometry, materials.get(path)); mesh.userData = { ...face, sourcePath: path }
      group.add(mesh)
    }
    group.position.fromArray(plan.transform.translation)
    group.rotation.set(...plan.transform.rotation.map(THREE.MathUtils.degToRad), 'XYZ')
    group.scale.fromArray(plan.transform.scale)
    group.userData = { sourcePaths: plan.sourcePaths, nativeItem: plan.name, guiTransform: plan.transform }
    return group
  } catch (error) { disposeNativeBlockItemObject(group); for (const value of materials.values()) value.dispose(); throw error }
}

export function disposeNativeBlockItemObject(group) {
  const materials = new Set()
  group.traverse(part => { if (part.isMesh) { part.geometry.dispose(); materials.add(part.material) } })
  for (const value of materials) value.dispose()
}

async function loadOpaqueTexture(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
  let texture
  try {
    texture = await new THREE.TextureLoader().loadAsync(url)
    const { width, height } = texture.image
    if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 2048)) throw Error('NATIVE_BLOCK_ITEM_TEXTURE_DIMENSIONS_UNSUPPORTED')
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw Error('NATIVE_BLOCK_ITEM_OPACITY_UNAVAILABLE')
    context.drawImage(texture.image, 0, 0)
    const pixels = context.getImageData(0, 0, width, height).data
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) throw Error('NATIVE_BLOCK_ITEM_TRANSLUCENT_TEXTURE_UNSUPPORTED')
    // Minecraft samples the PNG's stored RGB directly in light.glsl. A Three
    // sRGB-to-linear/tone-mapping round trip would change that GUI shade rule.
    texture.colorSpace = THREE.NoColorSpace; texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false
    return texture
  } catch (error) { texture?.dispose(); throw error } finally { URL.revokeObjectURL(url) }
}

const createRenderer = () => {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1); renderer.setSize(64, 64, false); renderer.setClearColor(0, 0)
  renderer.toneMapping = THREE.NoToneMapping
  return renderer
}
const encodeCanvas = renderer => new Promise((resolve, reject) => renderer.domElement.toBlob(
  blob => blob ? resolve(blob) : reject(Error('NATIVE_BLOCK_ITEM_PNG_ENCODE_FAILED')), 'image/png'))

export class NativeBlockItemIconRenderer {
  constructor(reader, options = {}) {
    this.reader = reader; this.createRenderer = options.createRenderer ?? createRenderer
    this.preparePlan = options.preparePlan ?? prepareNativeBlockItemIcon
    this.loadTexture = options.loadTexture ?? loadOpaqueTexture; this.encode = options.encode ?? encodeCanvas
    this.renderer = null; this.pending = Promise.resolve(); this.disposed = false
  }
  render(name) {
    // A single small context is reused; concurrent icon requests never race its
    // framebuffer or retain a scene/model after PNG encoding.
    const result = this.pending.then(() => this.renderOne(name))
    this.pending = result.catch(() => {})
    return result
  }
  async renderOne(name) {
    let object; const textures = new Map(); let pixels = 0
    const ensureOpen = () => { if (this.disposed) throw Error('NATIVE_BLOCK_ITEM_DISPOSED') }
    try {
      ensureOpen(); const plan = await this.preparePlan(this.reader, name); ensureOpen()
      for (const path of plan.texturePaths) {
        const bytes = await this.reader.bytes(path); ensureOpen()
        const texture = await this.loadTexture(bytes); textures.set(path, texture); ensureOpen()
        const { width, height } = texture.image ?? {}
        if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 2048)) throw Error('NATIVE_BLOCK_ITEM_TEXTURE_DIMENSIONS_UNSUPPORTED')
        pixels += width * height
        if (pixels > 4194304) throw Error('NATIVE_BLOCK_ITEM_TEXTURE_PIXEL_LIMIT')
      }
      object = buildNativeBlockItemObject(plan, textures)
      this.renderer ??= this.createRenderer()
      const scene = new THREE.Scene(); scene.add(object)
      // GuiGraphics has a fixed 16-GUI-unit slot. Its scale(16,-16,16) maps this
      // one-model-unit frame to it. No auto-fit/extra tilt changes the native GUI.
      const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 100)
      camera.position.z = 10; camera.updateMatrixWorld()
      this.renderer.clear(); this.renderer.render(scene, camera)
      const blob = await this.encode(this.renderer); ensureOpen()
      if (!(blob instanceof Blob) || blob.type !== 'image/png') throw Error('NATIVE_BLOCK_ITEM_PNG_ENCODE_FAILED')
      return { blob, sourcePaths: plan.sourcePaths, guiTransform: plan.transform, kind: plan.kind ?? 'native-block-gui', pixelParityVerified: false,
        providerEvidence: plan.evidence, guiCulling: { ...plan.culling, visible:undefined } }
    } finally {
      if (object) disposeNativeBlockItemObject(object)
      for (const texture of textures.values()) texture.dispose()
    }
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true; this.renderer?.dispose(); this.renderer?.forceContextLoss?.(); this.renderer = null
  }
}
