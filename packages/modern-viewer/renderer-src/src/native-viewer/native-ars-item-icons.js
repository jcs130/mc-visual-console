import * as THREE from 'three'
import { nativeGuiItemTransform, BLOCK_ICON_CLIENT_SHA256 } from './native-block-item-icons.js'
import { parseNativeItemStack, nativeNumericValue } from './native-item-stack.js'

// Ported from locked Ars 5.13.2 SpellBookRenderer/TatteredTomeRenderer and
// GeckoLib 4.9.3 BakedModelFactory, GeoQuad, RenderUtil, GeoItemRenderer.
// GUI uses the closed original mesh. Both items register zero controllers;
// animations/empty.json contains unrelated gem_float, not a book animation.
export const ARS_ITEM_SOURCE_HASHES = Object.freeze({
  'ars_nouveau-1.21.1-5.13.2.jar': '787b5e2ed6b0e5004285b27ab6c51f8b43edab6cb44c6eccf09452c4b3870dce',
  'geckolib-neoforge-1.21.1-4.9.3.jar': '20a1995e4074f387ff549e2c57ea79dd7d41ee83c6afb9dd6a6e840e592d1c47'
})
export const ARS_ITEM_ASSET_HASHES = Object.freeze({
  'assets/ars_nouveau/geo/spellbook_closed.geo.json': 'da91cd2ea5c937e82e86bfc0c668e5a3d956681b874e9f0029684a95b6da773c',
  'assets/ars_nouveau/animations/empty.json': 'd28d5a21992436fdc31b21961f4dbc0b6b638b9ed622aaf270f528b1c27036a1',
  'assets/ars_nouveau/models/item/worn_notebook.json': '3cdc6422923bd2fcefd4044b4e7a68524f863382829d8d5a8c1d20680694fac5',
  'assets/minecraft/shaders/include/light.glsl': '0fdb0d7a1bc8223cd8232af7d7df84ac33463a183c8378127669a6f295e7466b',
  'assets/minecraft/shaders/core/rendertype_entity_translucent.vsh': 'dca1070a742c07fd94fd56f620cccc0bd820694743f53b30cbedca9c4e34a284',
  'assets/minecraft/shaders/core/rendertype_entity_translucent.fsh': '6319a09f7bf8322d0ec8dff7d24a24ac5f6bc10f04cda7d1a18cc4b1453b881d'
})
export const ARS_BOOK_TEXTURE_HASHES = Object.freeze({
  light_gray: 'bdd38c9a1f0cd766c026309a5ab062fd3cc864988e1db970e082267d98febbda',
  light_blue: '8dd74acf8356454c7d8efb926a1deedb96444234e4bd215a67354bcd9cb5b30d',
  lime: 'd9c48e16f48d21e43702e2ce8ec85d7105f76b83df81f26058625a3a0f036666',
  purple: '87e1f9ba42c301354fdd18cf57c84df3969928a143a95d0fe5c59a38e0b3e30f',
  magenta: '89227351920ed2adbd91a9ef652a4a7cd2deca7bf62f5dbcb58cc7e2a84986bd',
  brown: '8deb2b106c987026fcdb6c7b4ea734687f44ee25ab4153e4c26bd99325301a0b',
  orange: 'e897dda4efce2d7bbe5045ca8bd23ec5030ae8d23f6685b96da0eaa75de11658',
  red: '3064cf6e4e259f0592682e36fe6d3a9425d0cf6d06a20e1b20d98a9f53a00325',
  blue: 'b24c5a992e76f3b1444ceb6e59bcf451d00432e468c1b6812268da66f850c962',
  cyan: '21da1c33575f7800872724aff9ccd413c9ffe73e0548dc5969279b1c044202ba',
  white: '45ec40bbd7ea4276d62f4b7048ae8842e0ba65744808f4875245b6785df7f6aa',
  gray: '59e3cda19eaf66cad0ddbf2def185828b3bdf350f6dc5370d4e0a69ebfe76757',
  green: '2cef31d70a27790056ab86ae7b4b81fb39d217d1c8588767811352ce92264697',
  black: 'e83596a3cf1d82777471530c45ed64f3751c5dfabfae6781c32eaf19a4822e48',
  yellow: 'd8a4aeb633201ceef48e0dfc5501c9755c2ca14de1a04498f60354e4f7343e59',
  pink: 'c99b49f0333122c0e017ffd8616811fd07144f74018a75533915fc93cf5dd51d'
})
const ITEMS = Object.freeze({ worn_notebook: 1, novice_spell_book: 1, apprentice_spell_book: 2, archmage_spell_book: 3 })
const record = value => value && typeof value === 'object' && !Array.isArray(value)
export const nativeArsItemEligible = name => typeof name === 'string' && name.startsWith('ars_nouveau:') && Object.hasOwn(ITEMS, name.slice(12))

// These components are read for labels/gameplay, not this renderer's mesh or
// material. Keep their complete values in the caller's cache key and receipt.
const NON_VISUAL = new Set(['ars_nouveau:spell_caster', 'geckolib:animatable_id', 'minecraft:custom_name',
  'minecraft:item_name', 'minecraft:lore', 'minecraft:rarity', 'minecraft:repair_cost', 'minecraft:unbreakable',
  'minecraft:hide_additional_tooltip', 'minecraft:hide_tooltip'])
const KNOWN = new Set([...NON_VISUAL, 'minecraft:base_color', 'minecraft:enchantment_glint_override', 'minecraft:enchantments', 'minecraft:stored_enchantments'])

export function nativeArsItemState(input) {
  const stack = input?.id ? input : parseNativeItemStack(input)
  if (!nativeArsItemEligible(stack.id) || !Number.isSafeInteger(stack.count) || stack.count <= 0 || !record(stack.components)) throw Error('NATIVE_ARS_ITEM_IDENTITY_INVALID')
  const components = stack.components
  for (const [key, value] of Object.entries(components)) {
    const name = key.startsWith('!') ? key.slice(1) : key
    if (!KNOWN.has(name)) throw Error(`NATIVE_ARS_ITEM_COMPONENT_UNSUPPORTED:${key}`)
    if (key.startsWith('!') && (!record(value) || Object.keys(value).length || Object.hasOwn(components, name))) throw Error('NATIVE_ARS_ITEM_COMPONENT_PATCH_INVALID')
  }
  let foil = null
  if (Object.hasOwn(components, 'minecraft:enchantment_glint_override')) {
    const value = components['minecraft:enchantment_glint_override'], n = nativeNumericValue(value)
    if (value === true || n === 1) foil = true
    else if (value === false || n === 0) foil = false
    else throw Error('NATIVE_ARS_ITEM_GLINT_STATE_INVALID')
  }
  if (foil === true) throw Error('NATIVE_ARS_ITEM_GLINT_UNSUPPORTED')
  for (const key of ['minecraft:enchantments', 'minecraft:stored_enchantments']) {
    if (!Object.hasOwn(components, key)) continue
    const value = components[key]
    if (!record(value) || Object.keys(value).some(name => !['levels', 'show_in_tooltip'].includes(name)) ||
      (value.levels !== undefined && !record(value.levels))) throw Error('NATIVE_ARS_ITEM_ENCHANTMENTS_INVALID')
    if (Object.keys(value.levels ?? {}).length && foil !== false) throw Error('NATIVE_ARS_ITEM_GLINT_UNSUPPORTED')
  }
  const leaf = stack.id.slice(12), tier = ITEMS[leaf]
  // SpellBook ctor has BASE_COLOR=PURPLE. Explicit removal also yields the
  // renderer's null -> purple branch. TatteredTomeRenderer never reads color.
  const color = components['minecraft:base_color'] ?? 'purple'
  if (typeof color !== 'string' || !Object.hasOwn(ARS_BOOK_TEXTURE_HASHES, color)) throw Error('NATIVE_ARS_ITEM_COLOR_UNSUPPORTED')
  return { stack, leaf, tier, color, texturePath: `assets/ars_nouveau/textures/item/${leaf === 'worn_notebook' ? 'tattered_tome' : `spellbook_${color}`}.png` }
}

const DIRECTIONS = ['west', 'east', 'north', 'south', 'up', 'down']
const NORMALS = { west: [-1,0,0], east: [1,0,0], north: [0,0,-1], south: [0,0,1], up: [0,1,0], down: [0,-1,0] }
const VECTOR = value => Array.isArray(value) && value.length === 3 && value.every(n => Number.isFinite(n) && Math.abs(n) <= 128)
const FACE_VERTICES = { west: [3,2,0,1], east: [4,5,7,6], north: [2,4,6,0], south: [5,3,1,7], up: [3,5,4,2], down: [0,6,7,1] }

export function bakeNativeArsGeoFaces(document, tier) {
  if (document?.format_version !== '1.12.0' || document['minecraft:geometry']?.length !== 1 || ![1,2,3].includes(tier)) throw Error('NATIVE_ARS_ITEM_GEO_UNSUPPORTED')
  const geo = document['minecraft:geometry'][0], bones = geo.bones
  if (geo.description?.texture_width !== 128 || geo.description?.texture_height !== 128 || !Array.isArray(bones) || !bones.length || bones.length > 64) throw Error('NATIVE_ARS_ITEM_GEO_LIMIT')
  const byName = new Map(), matrices = new Map(), selected = new Map(); let cubes = 0
  for (const bone of bones) {
    if (!record(bone) || typeof bone.name !== 'string' || byName.has(bone.name) || !VECTOR(bone.pivot) ||
      (bone.rotation !== undefined && !VECTOR(bone.rotation)) || !Array.isArray(bone.cubes) || (cubes += bone.cubes.length) > 128 ||
      Object.keys(bone).some(key => !['name','parent','pivot','rotation','cubes'].includes(key))) throw Error('NATIVE_ARS_ITEM_BONE_UNSUPPORTED')
    byName.set(bone.name, bone)
  }
  const boneState = (name, ancestry = []) => {
    if (matrices.has(name)) return
    if (ancestry.length >= 32 || ancestry.includes(name) || !byName.has(name)) throw Error('NATIVE_ARS_ITEM_BONE_PARENT_INVALID')
    const bone = byName.get(name)
    if (bone.parent) boneState(bone.parent, [...ancestry, name])
    else if (!['tier1','tier2','tier3'].includes(name)) throw Error('NATIVE_ARS_ITEM_BONE_ROOT_UNSUPPORTED')
    const pivot = new THREE.Vector3(-bone.pivot[0]/16, bone.pivot[1]/16, bone.pivot[2]/16)
    const angles = (bone.rotation ?? [0,0,0]).map(THREE.MathUtils.degToRad)
    const transform = new THREE.Matrix4().makeTranslation(...pivot.toArray())
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-angles[0], -angles[1], angles[2], 'ZYX')))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
    matrices.set(name, (bone.parent ? matrices.get(bone.parent).clone() : new THREE.Matrix4()).multiply(transform))
    selected.set(name, bone.parent ? selected.get(bone.parent) : name === `tier${tier}`)
  }
  for (const name of byName.keys()) boneState(name)
  const faces = []
  for (const bone of bones) {
    if (!selected.get(bone.name)) continue // setHidden also hides children.
    const matrix = matrices.get(bone.name), normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix)
    for (const cube of bone.cubes) {
      if (!record(cube) || !VECTOR(cube.origin) || !VECTOR(cube.size) || cube.size.some(n => n <= 0) || !record(cube.uv) ||
        Object.keys(cube).some(key => !['origin','size','uv'].includes(key))) throw Error('NATIVE_ARS_ITEM_CUBE_UNSUPPORTED')
      const [x,y,z] = [-(cube.origin[0]+cube.size[0])/16, cube.origin[1]/16, cube.origin[2]/16]
      const [sx,sy,sz] = cube.size.map(n => n/16)
      const vertices = [[x,y,z],[x,y,z+sz],[x,y+sy,z],[x,y+sy,z+sz],
        [x+sx,y+sy,z],[x+sx,y+sy,z+sz],[x+sx,y,z],[x+sx,y,z+sz]]
      for (const direction of DIRECTIONS) {
        const face = cube.uv[direction]
        if (!face) continue
        if (!record(face) || Object.keys(face).some(key => !['uv','uv_size'].includes(key)) ||
          ![face.uv,face.uv_size].every(value => Array.isArray(value) && value.length === 2 && value.every(n => Number.isFinite(n) && Math.abs(n) <= 256))) throw Error('NATIVE_ARS_ITEM_UV_UNSUPPORTED')
        // GeoQuad.build swaps U endpoints for mirror=false. Signed uv_size is
        // deliberately retained; tier1's right cover has negative U and V.
        const [u,v] = face.uv, [du,dv] = face.uv_size
        const uv = [(u+du)/128,1-v/128,u/128,1-v/128,u/128,1-(v+dv)/128,(u+du)/128,1-(v+dv)/128]
        const position = FACE_VERTICES[direction].flatMap(index => new THREE.Vector3(...vertices[index]).applyMatrix4(matrix).toArray())
        const normal = new THREE.Vector3(...NORMALS[direction]).applyNormalMatrix(normalMatrix).toArray()
        faces.push({ bone: bone.name, direction, position, normal, uv, indices: [0,1,2,0,2,3] })
      }
    }
  }
  if (!faces.length || faces.length > 768) throw Error('NATIVE_ARS_ITEM_FACE_LIMIT')
  return faces
}

export async function prepareNativeArsItemIcon(reader, input) {
  const state = nativeArsItemState(input)
  if (reader.manifest.clientJarSha256 !== BLOCK_ICON_CLIENT_SHA256) throw Error('NATIVE_ARS_ITEM_CLIENT_UNVERIFIED')
  for (const [name, sha256] of Object.entries(ARS_ITEM_SOURCE_HASHES)) {
    const sources = reader.manifest.sources?.filter(source => source.name === name) ?? []
    if (sources.length !== 1 || sources[0].sha256 !== sha256 || sources[0].explicitOverride) throw Error(`NATIVE_ARS_ITEM_SOURCE_UNVERIFIED:${name}`)
  }
  const itemPath = `assets/ars_nouveau/models/item/${state.leaf}.json`
  const textureHash = state.leaf === 'worn_notebook' ? 'c04de9e156e65848f88f305a0d4171391f39a3f14002bae6ce6fd8db913a7f2f' : ARS_BOOK_TEXTURE_HASHES[state.color]
  const hashes = { ...ARS_ITEM_ASSET_HASHES, [itemPath]: state.leaf === 'worn_notebook' ? ARS_ITEM_ASSET_HASHES[itemPath] : '3a2c58c551cb5b7bd7bd4b8278f2ea3d5a2be71e5166676977bfbc5cc9335bd5', [state.texturePath]: textureHash }
  if (state.leaf !== 'worn_notebook') delete hashes['assets/ars_nouveau/models/item/worn_notebook.json']
  for (const [path, hash] of Object.entries(hashes)) {
    if (reader.manifest.assets[path]?.sha256 !== hash) throw Error(`NATIVE_ARS_ITEM_ASSET_UNSUPPORTED:${path}`)
    await reader.bytes(path) // Original SHA/length and priority guard, never a proxy.
  }
  if (reader.manifest.assets[`${state.texturePath}.mcmeta`]) throw Error('NATIVE_ARS_ITEM_TEXTURE_ANIMATION_UNSUPPORTED')
  const model = await reader.json(itemPath)
  if (model.parent !== 'builtin/entity' || model.loader || model.elements?.length || model.overrides?.length) throw Error('NATIVE_ARS_ITEM_MODEL_UNSUPPORTED')
  const faces = bakeNativeArsGeoFaces(await reader.json('assets/ars_nouveau/geo/spellbook_closed.geo.json'), state.tier)
  return { ...state, faces, guiTransform: nativeGuiItemTransform(model.display?.gui), sourcePaths: Object.keys(hashes),
    animationControllerCount: 0, originalMaterial: 'entityTranslucent', geometry: 'ars_nouveau:spellbook_closed' }
}

// Lighting.setupForFlatItems -> GlStateManager's Ry(-22.5)*Rx(135) transform.
const flatMatrix = new THREE.Matrix4().makeRotationY(-0.3926991).multiply(new THREE.Matrix4().makeRotationX(2.3561945))
export const ARS_GUI_LIGHT_DIRECTIONS = Object.freeze([
  new THREE.Vector3(0.2,1,-0.7).normalize().transformDirection(flatMatrix).toArray(),
  new THREE.Vector3(-0.2,1,0.7).normalize().transformDirection(flatMatrix).toArray()
].map(value => Object.freeze(value)))

export function buildNativeArsItemObject(plan, texture) {
  const material = new THREE.ShaderMaterial({ uniforms: { iconTexture: { value: texture },
    light0: { value: new THREE.Vector3(...ARS_GUI_LIGHT_DIRECTIONS[0]) }, light1: { value: new THREE.Vector3(...ARS_GUI_LIGHT_DIRECTIONS[1]) } },
  vertexShader: `varying vec2 nativeUV; varying float nativeLight; uniform vec3 light0; uniform vec3 light1;
    void main(){ vec3 n=normalize(normalMatrix*normal); n.y=-n.y;
      nativeLight=min(1.0,(max(0.0,dot(light0,n))+max(0.0,dot(light1,n)))*0.6+0.4);
      nativeUV=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D iconTexture; varying vec2 nativeUV; varying float nativeLight;
    void main(){vec4 c=texture2D(iconTexture,nativeUV);if(c.a<0.1)discard;gl_FragColor=vec4(c.rgb*nativeLight,c.a);}`,
  transparent: true, depthWrite: true, side: THREE.DoubleSide, toneMapped: false, forceSinglePass: true })
  const root = new THREE.Group(), content = new THREE.Group(); root.add(content)
  // ItemRenderer T(-.5) plus GeoItemRenderer T(.5,.51,.5): retain net +.01 Y.
  content.position.y = Math.fround(0.51) - 0.5
  try {
    for (const face of plan.faces) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(face.position, 3))
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array(4).fill(face.normal).flat(), 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(face.uv, 2)); geometry.setIndex(face.indices)
      const mesh = new THREE.Mesh(geometry, material); mesh.userData = face; content.add(mesh)
    }
    root.position.fromArray(plan.guiTransform.translation)
    root.rotation.set(...plan.guiTransform.rotation.map(THREE.MathUtils.degToRad), 'XYZ')
    root.scale.fromArray(plan.guiTransform.scale); root.updateMatrixWorld(true)
    // Minecraft GUI VertexSorting.ORTHOGRAPHIC_Z sorts by descending(-z),
    // hence smaller projected Z first. Three mesh origins all coincide here.
    const ordered = content.children.map((mesh, index) => ({ mesh, index, z: new THREE.Vector3(
      (mesh.userData.position[0]+mesh.userData.position[6])/2,
      (mesh.userData.position[1]+mesh.userData.position[7])/2,
      (mesh.userData.position[2]+mesh.userData.position[8])/2).applyMatrix4(mesh.matrixWorld).z }))
      .sort((a,b) => a.z-b.z || a.index-b.index)
    ordered.forEach(({mesh}, index) => { mesh.renderOrder = index })
    root.userData = { nativeItem: plan.stack.id, tier: plan.tier, color: plan.color, sourcePaths: plan.sourcePaths }
    return root
  } catch(error) { disposeNativeArsItemObject(root); if (!content.children.length) material.dispose(); throw error }
}

export function disposeNativeArsItemObject(root) {
  const materials = new Set()
  root.traverse(part => { if(part.isMesh) { part.geometry.dispose(); materials.add(part.material) } })
  for (const material of materials) material.dispose()
}

async function decodeTexture(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], {type:'image/png'})); let texture
  try {
    texture = await new THREE.TextureLoader().loadAsync(url)
    if (texture.image.width !== 128 || texture.image.height !== 128) throw Error('NATIVE_ARS_ITEM_TEXTURE_SIZE_INVALID')
    texture.colorSpace = THREE.NoColorSpace; texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false
    return texture
  } catch(error) { texture?.dispose(); throw error } finally { URL.revokeObjectURL(url) }
}
const rendererFactory = () => {
  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:false, preserveDrawingBuffer:true })
  renderer.setPixelRatio(1); renderer.setSize(64,64,false); renderer.setClearColor(0,0); renderer.toneMapping = THREE.NoToneMapping
  return renderer
}
const encodeCanvas = renderer => new Promise((resolve,reject) => renderer.domElement.toBlob(blob => blob ? resolve(blob) : reject(Error('NATIVE_ARS_ITEM_PNG_FAILED')), 'image/png'))

export class NativeArsItemIconRenderer {
  constructor(reader, options={}) {
    this.reader=reader; this.loadTexture=options.loadTexture??decodeTexture; this.createRenderer=options.createRenderer??rendererFactory
    this.encode=options.encode??encodeCanvas; this.renderer=null; this.disposed=false; this.pending=Promise.resolve()
  }
  render(stack) {
    const result=this.pending.then(()=>this.renderOne(stack)); this.pending=result.catch(()=>{}); return result
  }
  async renderOne(stack) {
    let object, texture
    const ensureOpen=()=>{if(this.disposed)throw Error('NATIVE_ARS_ITEM_DISPOSED')}
    try {
      ensureOpen(); const plan=await prepareNativeArsItemIcon(this.reader,stack); ensureOpen()
      const bytes=await this.reader.bytes(plan.texturePath); ensureOpen()
      texture=await this.loadTexture(bytes); ensureOpen()
      if (texture.image?.width!==128 || texture.image?.height!==128) throw Error('NATIVE_ARS_ITEM_TEXTURE_SIZE_INVALID')
      object=buildNativeArsItemObject(plan,texture); this.renderer??=this.createRenderer()
      const scene=new THREE.Scene(); scene.add(object)
      const camera=new THREE.OrthographicCamera(-.5,.5,.5,-.5,.01,100); camera.position.z=10; camera.updateMatrixWorld()
      this.renderer.clear(); this.renderer.render(scene,camera)
      const blob=await this.encode(this.renderer); ensureOpen()
      if (!(blob instanceof Blob)||blob.type!=='image/png') throw Error('NATIVE_ARS_ITEM_PNG_FAILED')
      return {blob,sourcePaths:plan.sourcePaths,guiTransform:plan.guiTransform,kind:'native-ars-gui',pixelParityVerified:false,
        tier:plan.tier,color:plan.color,animationControllerCount:0,originalMaterial:plan.originalMaterial}
    } finally { if(object)disposeNativeArsItemObject(object);texture?.dispose() }
  }
  dispose() { if(this.disposed)return;this.disposed=true;this.renderer?.dispose();this.renderer?.forceContextLoss?.();this.renderer=null }
}
