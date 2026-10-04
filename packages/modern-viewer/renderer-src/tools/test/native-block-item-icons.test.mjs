import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { NativeItemIcons, nativeItemIconEligible } from '../../src/native-viewer/native-item-icons.js'
import { BLOCK_ICON_CLIENT_SHA256, BLOCK_ICON_SHADER_HASHES, NATIVE_GUI_BLOCK_ITEMS,
  NativeBlockItemIconRenderer, prepareNativeBlockItemIcon, nativeGuiItemTransform, nativeGuiLight,
  buildNativeBlockItemObject, disposeNativeBlockItemObject, resolveNativeBlockItemModel
} from '../../src/native-viewer/native-block-item-icons.js'

// These JSON shapes/UVs are from the locked minecraft-1.21.1-client.jar, not
// invented geometry. The production reader checks the actual exported hashes.
const gui = { rotation: [30, 225, 0], translation: [0, 0, 0], scale: [0.625, 0.625, 0.625] }
const faceNames = ['down', 'up', 'north', 'south', 'west', 'east']
const models = {
  'block/block': { gui_light: 'side', display: { gui, ground: { scale: [0.25, 0.25, 0.25] } } },
  'block/cube': { parent: 'block/block', elements: [{ from: [0, 0, 0], to: [16, 16, 16],
    faces: Object.fromEntries(faceNames.map(face => [face, { texture: `#${face}`, cullface: face }])) }] },
  'block/cube_all': { parent: 'block/cube', textures: Object.fromEntries(['particle', ...faceNames].map(face => [face, '#all'])) },
  'block/cube_column': { parent: 'block/cube', textures: Object.fromEntries(['particle', ...faceNames].map(face => [face, ['down', 'up'].includes(face) ? '#end' : '#side'])) },
  'block/dirt': { parent: 'minecraft:block/cube_all', textures: { all: 'minecraft:block/dirt' } },
  'block/cobblestone': { parent: 'minecraft:block/cube_all', textures: { all: 'minecraft:block/cobblestone' } },
  'block/oak_log': { parent: 'minecraft:block/cube_column', textures: { end: 'minecraft:block/oak_log_top', side: 'minecraft:block/oak_log' } }
}
for (const name of ['dirt', 'cobblestone', 'oak_log']) models[`item/${name}`] = { parent: `minecraft:block/${name}` }
const texturePaths = ['dirt', 'cobblestone', 'oak_log', 'oak_log_top'].map(name => `assets/minecraft/textures/block/${name}.png`)
function reader(patch = {}) {
  return { manifest: { clientJarSha256: BLOCK_ICON_CLIENT_SHA256, assets: {
    ...Object.fromEntries(Object.entries(BLOCK_ICON_SHADER_HASHES).map(([path, sha256]) => [path, { sha256, bytes: 1 }])),
    ...Object.fromEntries(texturePaths.map(path => [path, { bytes: 200 }]))
  } }, json: async path => {
    const key = path.replace('assets/minecraft/models/', '').replace('.json', '')
    if (!(key in models) && !(key in patch)) throw Error('NATIVE_ASSET_MISSING')
    return structuredClone(patch[key] ?? models[key])
  }, bytes: async () => new Uint8Array([1]) }
}
const stack = name => ({ name, count: 1, snbt: `{id:"${name}",count:1}` })
const settled = () => new Promise(resolve => setImmediate(resolve))
const imageBlob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
function testRendererOptions(observe = () => {}) {
  return {
    loadTexture: async () => new THREE.Texture({ width: 16, height: 16 }),
    createRenderer: () => ({ clear() {}, render(scene, camera) { observe(scene, camera) }, dispose() {} }),
    encode: async () => imageBlob()
  }
}

test('three audited BlockItems inherit actual six-face models, distinct log ends and original GUI transform', async () => {
  for (const name of NATIVE_GUI_BLOCK_ITEMS) {
    assert.equal(nativeItemIconEligible(stack(name)), true)
    const plan = await prepareNativeBlockItemIcon(reader(), name)
    assert.equal(plan.faces.length, 6); assert.deepEqual(plan.transform, { ...gui, translation: [0, 0, 0] })
    assert.ok(plan.sourcePaths.includes(`assets/minecraft/models/item/${name.split(':')[1]}.json`))
    for (const face of plan.faces) {
      assert.ok(face.position.every(n => Math.abs(n) === 0.5))
      assert.deepEqual(face.uv, [0, 1, 0, 0, 1, 0, 1, 1])
      assert.equal(face.texture, name === 'minecraft:oak_log'
        ? `minecraft:block/oak_log${['down', 'up'].includes(face.direction) ? '_top' : ''}`
        : `minecraft:block/${name.split(':')[1]}`)
    }
  }
})

test('native GUI uses ItemTransform XYZ ordering and /16 translation clamp rather than world-block rotations or auto-fit', async () => {
  const transform = nativeGuiItemTransform({ rotation: [30, 225, 10], translation: [160, -160, 8], scale: [10, 0.5, 2] })
  assert.deepEqual(transform, { rotation: [30, 225, 10], translation: [5, -5, 0.5], scale: [4, 0.5, 2] })
  const plan = await prepareNativeBlockItemIcon(reader(), 'minecraft:dirt')
  const texture = new THREE.Texture(), object = buildNativeBlockItemObject(plan, new Map([[texturePaths[0], texture]]))
  object.updateMatrixWorld(true)
  const point = new THREE.Vector3(0.5, 0.5, 0.5).applyMatrix4(object.matrixWorld)
  // Ry(225) maps x+z to -sqrt(2); Rx(30) leaves x unchanged.
  assert.ok(Math.abs(point.x + 0.625 / Math.sqrt(2)) < 1e-7)
  assert.ok(Math.abs(point.y - 0.3125 * Math.cos(Math.PI / 6)) < 1e-7)
  assert.ok(Math.abs(point.z - 0.3125 * Math.sin(Math.PI / 6)) < 1e-7)
  assert.equal(object.children.length, 6)
  assert.equal(object.children[0].material.type, 'ShaderMaterial')
  assert.match(object.children[0].material.vertexShader, /n\.y = -n\.y/)
  const shades = faceNames.map(direction => nativeGuiLight(({ down: [0,-1,0], up: [0,1,0], north: [0,0,-1],
    south: [0,0,1], west: [-1,0,0], east: [1,0,0] })[direction], plan.transform))
  assert.ok(shades.every(value => value >= 0.4 && value <= 1)); assert.ok(new Set(shades).size > 3)
  assert.ok(shades[1] > shades[0], 'top and bottom retain distinct native GUI illumination')
  disposeNativeBlockItemObject(object); texture.dispose()
  for (const bad of [{ rotation: [1, 2] }, { translation: [NaN, 0, 0] }, { scale: [0, 1, 1] }, { scale: [-1, 1, 1] }])
    assert.throws(() => nativeGuiItemTransform(bad), /GUI_TRANSFORM_INVALID|REFLECTED_GUI_UNSUPPORTED/)
})

test('model display inheritance retains GUI when item overrides another context', async () => {
  const source = reader({ 'item/dirt': { parent: 'minecraft:block/dirt', display: { fixed: { scale: [1, 1, 1] } } } })
  const model = await resolveNativeBlockItemModel(source, 'minecraft:item/dirt')
  assert.deepEqual(model.display.gui, gui); assert.deepEqual(model.display.fixed.scale, [1, 1, 1])
})

test('dynamic, tinted, animated, foreign, excessive and unported shader sources explicitly reject without a guessed icon', async () => {
  const cases = [
    ['item/dirt', { parent: 'builtin/entity' }, /DYNAMIC_MODEL_UNSUPPORTED/],
    ['item/dirt', { parent: 'minecraft:builtin/entity' }, /DYNAMIC_MODEL_UNSUPPORTED/],
    ['item/dirt', { parent: 'minecraft:block/dirt', loader: 'mod:loader' }, /DYNAMIC_MODEL_UNSUPPORTED/],
    ['item/dirt', { parent: 'minecraft:block/dirt', overrides: [{}] }, /DYNAMIC_MODEL_UNSUPPORTED/],
    ['item/dirt', { parent: 'minecraft:block/dirt', gui_light: 'front' }, /FRONT_LIGHT_UNSUPPORTED/],
    ['item/dirt', { elements: Array(129).fill({}) }, /ELEMENT_LIMIT/],
    ['block/cube', { parent: 'block/block', elements: [{ ...models['block/cube'].elements[0], to: [1e100, 16, 16] }] }, /BOUNDS_INVALID/],
    ['block/cube', { parent: 'block/block', elements: [{ ...models['block/cube'].elements[0], faces: { up: { texture: '#up', tintindex: 0 } } }] }, /TINT_UNAVAILABLE/],
    ['item/dirt', { parent: 'minecraft:item/dirt' }, /PARENT_CYCLE/]
  ]
  for (const [path, value, pattern] of cases) await assert.rejects(prepareNativeBlockItemIcon(reader({ [path]: value }), 'minecraft:dirt'), pattern)
  const animated = reader(); animated.manifest.assets[`${texturePaths[0]}.mcmeta`] = { bytes: 1 }
  await assert.rejects(prepareNativeBlockItemIcon(animated, 'minecraft:dirt'), /ANIMATION_UNSUPPORTED/)
  const oversized = reader(); oversized.manifest.assets[texturePaths[0]].bytes = 16777217
  await assert.rejects(prepareNativeBlockItemIcon(oversized, 'minecraft:dirt'), /TEXTURE_LIMIT/)
  const negative = reader(); negative.manifest.assets[texturePaths[0]].bytes = -1
  await assert.rejects(prepareNativeBlockItemIcon(negative, 'minecraft:dirt'), /TEXTURE_LIMIT/)
  const shader = reader(); shader.manifest.assets[Object.keys(BLOCK_ICON_SHADER_HASHES)[0]].sha256 = 'another shader'
  await assert.rejects(prepareNativeBlockItemIcon(shader, 'minecraft:dirt'), /SHADER_UNSUPPORTED/)
  const otherClient = reader(); otherClient.manifest.clientJarSha256 = 'another client'
  await assert.rejects(prepareNativeBlockItemIcon(otherClient, 'minecraft:dirt'), /CLIENT_UNVERIFIED/)
  await assert.rejects(prepareNativeBlockItemIcon(reader(), 'ars_nouveau:novice_spell_book'), /PROVIDER_UNSUPPORTED/)
})

test('icon cache encodes a real six-mesh orthographic GUI render, verifies source provenance and serializes one reusable renderer', async () => {
  let renders = 0, changes = 0, creates = 0, encodings = 0, rendererCreates = 0
  const released = [], options = testRendererOptions((scene, camera) => {
    renders++; assert.equal(scene.children[0].children.length, 6)
    assert.deepEqual([camera.left, camera.right, camera.top, camera.bottom], [-0.5, 0.5, 0.5, -0.5])
    assert.equal(camera.position.z, 10)
  })
  const factory = options.createRenderer; options.createRenderer = () => { rendererCreates++; return factory() }
  options.encode = async () => { encodings++; await settled(); return imageBlob() }
  const icons = new NativeItemIcons(reader(), { blockRendererOptions: options, onChange: () => changes++,
    createUrl: () => `blob:cube-${++creates}`, revokeUrl: url => released.push(url) })
  for (const name of NATIVE_GUI_BLOCK_ITEMS) { icons.resolve(stack(name)); icons.resolve(stack(name)) }
  for (let i = 0; i < 8; i++) await settled()
  for (const name of NATIVE_GUI_BLOCK_ITEMS) {
    const icon = icons.resolve(stack(name)); assert.equal(icon.verified, true)
    assert.equal(icon.kind, 'native-block-gui'); assert.equal(icon.pixelParityVerified, false)
    assert.ok(icon.sourcePaths.includes(`assets/minecraft/models/item/${name.split(':')[1]}.json`))
    assert.ok(icon.sourcePaths.includes('assets/minecraft/shaders/include/light.glsl'))
  }
  assert.equal(renders, 3); assert.equal(encodings, 3); assert.equal(creates, 3); assert.equal(changes, 3); assert.equal(rendererCreates, 1)
  icons.dispose(); icons.dispose(); assert.deepEqual(released, ['blob:cube-1', 'blob:cube-2', 'blob:cube-3'])
})

test('source failure and reset during texture decoding create no URL, dispose late texture, and never use a flat substitute', async () => {
  const bad = reader(); bad.bytes = async path => { if (path.endsWith('.png')) throw Error('NATIVE_ASSET_HASH_MISMATCH'); return new Uint8Array([1]) }
  let created = 0, rendered = 0
  const icons = new NativeItemIcons(bad, { blockRendererOptions: testRendererOptions(() => rendered++), createUrl: () => { created++; return 'blob:wrong' } })
  icons.resolve(stack('minecraft:dirt')); await settled(); assert.equal(created, 0); assert.equal(rendered, 0)
  assert.match(icons.entries.get('minecraft:dirt').reason, /HASH_MISMATCH/); icons.dispose()
  let finish, disposed = 0
  const texture = new THREE.Texture({ width: 16, height: 16 }); texture.addEventListener('dispose', () => disposed++)
  const renderer = new NativeBlockItemIconRenderer(reader(), { ...testRendererOptions(() => rendered++), loadTexture: () => new Promise(resolve => { finish = resolve }) })
  const pending = renderer.render('minecraft:dirt'); await settled(); renderer.dispose(); finish(texture)
  await assert.rejects(pending, /DISPOSED/); assert.equal(disposed, 1); assert.equal(rendered, 0)
  await assert.rejects(renderer.render('minecraft:oak_log'), /DISPOSED/)
})

test('quoted or escaped components and mismatched identity cannot borrow generic block icons', () => {
  for (const snbt of ['{id:"minecraft:dirt",count:1,"components":{}}', '{id:"minecraft:dirt",count:1,\'components\':{}}',
    '{id:"minecraft:dirt",count:1,"\\u0063omponents":{}}', '{id:"minecraft:cobblestone",count:1}', '{id:"minecraft:dirt",count:2}'])
    assert.equal(nativeItemIconEligible({ ...stack('minecraft:dirt'), snbt }), false)
  assert.equal(nativeItemIconEligible({ ...stack('minecraft:dirt'), snbt: '{"count":1,"id":"minecraft:dirt"}' }), true)
  assert.equal(nativeItemIconEligible({ ...stack('minecraft:dirt'), components: { 'minecraft:custom_model_data': 7 } }), false)
  assert.equal(nativeItemIconEligible(stack('ars_nouveau:novice_spell_book')), false)
  assert.equal(nativeItemIconEligible(stack('minecraft:grass_block')), false, 'runtime biome tint is not guessed')
})
