import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { NativeAssetReader, bakeFaces } from '../../src/native-viewer/model-loader.js'
import { NativeItemIcons } from '../../src/native-viewer/native-item-icons.js'
import { resolveNativeBlockItemModel } from '../../src/native-viewer/native-block-item-icons.js'
import { nativeDomumItemState, prepareNativeDomumItemIcon, DOMUM_PANEL_TYPES } from '../../src/native-viewer/native-domum-item-icons.js'

const item = (type = 'full', material = 'minecraft:cobblestone', extra = '') => ({ name: 'domum_ornamentum:panel', count: 4,
  snbt: `{id:"domum_ornamentum:panel",count:4,components:{"minecraft:block_state":{type:"${type}"},"domum_ornamentum:texture_data":{"minecraft:block/oak_planks":"${material}"}${extra}}}` })
async function originals () {
  const directory = process.env.NATIVE_GUIDE_ASSET_DIR
  assert.ok(directory, 'Set NATIVE_GUIDE_ASSET_DIR to the locked original export')
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'native-assets.json'), 'utf8'))
  return new NativeAssetReader(manifest, filename => fs.readFile(path.join(directory, filename)))
}

test('all fifteen original Panel variants preserve every original vertex and UV with the actual uniform material sprite', async () => {
  const reader = await originals()
  for (const type of DOMUM_PANEL_TYPES) {
    const original = await resolveNativeBlockItemModel(reader, `domum_ornamentum:block/panel/panel_${type}_spec`)
    const faces = bakeFaces(original), plan = await prepareNativeDomumItemIcon(reader, item(type))
    assert.deepEqual(plan.faces.map(({ position, uv, indices, direction }) => ({ position, uv, indices, direction })),
      faces.map(({ position, uv, indices, direction }) => ({ position, uv, indices, direction })))
    assert.ok(plan.faces.length > 0)
    assert.ok(plan.faces.every(face => face.texture === 'minecraft:block/cobblestone'))
    assert.equal(plan.kind, 'native-domum-panel-gui'); assert.equal(plan.evidence.type, type)
    assert.equal(plan.evidence.materialId, 'minecraft:cobblestone')
    // The original outer baked model supplies the camera transform before its
    // render passes select a child. Child geometry without a display must not
    // become an edge-on, full-size GUI icon.
    assert.deepEqual(plan.transform, { rotation: [30, 225, 0], translation: [0, 0, 0], scale: [.625, .625, .625] })
    assert.ok(plan.sourcePaths.includes('assets/domum_ornamentum/models/item/panel.json'))
    assert.ok(plan.sourcePaths.includes('assets/minecraft/blockstates/cobblestone.json'))
    await reader.bytes(plan.texturePaths[0])
  }
})

test('different original materials and types cannot alias, and the native missing type defaults to FULL', async () => {
  const reader = await originals(), cobble = await prepareNativeDomumItemIcon(reader, item()), stone = await prepareNativeDomumItemIcon(reader, item('full', 'minecraft:stone'))
  assert.notDeepEqual(cobble.texturePaths, stone.texturePaths)
  assert.equal(nativeDomumItemState(item('FULL')).ordinal, 2)
  const absent = item(); absent.snbt = absent.snbt.replace('"minecraft:block_state":{type:"full"},', '')
  assert.equal(nativeDomumItemState(absent).type, 'full')
})

test('random, tinted, translucent, unknown variant and unsupported visual components remain unavailable', () => {
  for (const value of [item('unknown'), item('full', 'minecraft:grass_block'), item('full', 'minecraft:glass'),
    item('full', 'minecraft:oak_log'), item('full', 'minecraft:cobblestone', ',"minecraft:enchantment_glint_override":1b'),
    item('full', 'minecraft:cobblestone', ',"other:visual":{}')]) assert.throws(() => nativeDomumItemState(value), /UNSUPPORTED/)
  const random = item(); random.snbt = '{id:"domum_ornamentum:panel",count:4}'
  assert.throws(() => nativeDomumItemState(random), /MATERIAL_UNSUPPORTED/)
})

test('wrong native source and changed override rules cannot become a valid panel', async () => {
  const reader = await originals(), wrong = Object.create(reader)
  wrong.manifest = structuredClone(reader.manifest)
  wrong.manifest.sources.find(source => source.name.startsWith('domum-')).sha256 = '0'.repeat(64)
  await assert.rejects(prepareNativeDomumItemIcon(wrong, item()), /SOURCE_UNVERIFIED/)
  const changed = Object.create(reader)
  changed.json = async filename => {
    const value = structuredClone(await reader.json(filename))
    if (filename.endsWith('/item/panel_spec.json')) value.overrides[2].predicate['domum_ornamentum:trapdoor_type'] = 99
    return value
  }
  await assert.rejects(prepareNativeDomumItemIcon(changed, item()), /OVERRIDES_UNSUPPORTED/)
})

test('resource priority conflicts stay explicit even for a valid original panel', async () => {
  const reader = await originals(), plan = await prepareNativeDomumItemIcon(reader, item('full', 'minecraft:oak_planks'))
  await assert.rejects(reader.bytes(plan.texturePaths[0]), /RESOURCE_PRIORITY_UNRESOLVED/)
})

test('production icon queue keys complete native components and cleans its own rendering resources', async () => {
  const reader = await originals(), released = [], scenes = []
  let serial = 0
  const icons = new NativeItemIcons(reader, { createUrl: () => `blob:panel-${++serial}`, revokeUrl: value => released.push(value),
    domumRendererOptions: { loadTexture: async () => new THREE.Texture({ width: 16, height: 16 }),
      createRenderer: () => ({ clear () {}, render (scene) { scenes.push(scene.children[0].children.length) }, dispose () {} }),
      encode: async () => new Blob([new Uint8Array([1])], { type: 'image/png' }) } })
  const a = item(), b = item('waffle', 'minecraft:stone')
  try {
    icons.resolve(a); icons.resolve(b)
    for (let n = 0; n < 200 && (!icons.resolve(a) || !icons.resolve(b)); n++) await new Promise(resolve => setTimeout(resolve, 5))
    const first = icons.resolve(a), second = icons.resolve(b)
    assert.ok(first && second, `${icons.reason(a)} / ${icons.reason(b)}`)
    assert.notEqual(first.url, second.url); assert.equal(first.kind, 'native-domum-panel-gui')
    assert.equal(first.pixelParityVerified, false); assert.equal(second.pixelParityVerified, false)
    assert.equal(scenes.length, 2); assert.ok(scenes[1] > scenes[0])
  } finally { icons.dispose() }
  assert.equal(released.length, 2)
})
