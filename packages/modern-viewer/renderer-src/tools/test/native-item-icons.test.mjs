import test from 'node:test'
import assert from 'node:assert/strict'
import { NativeItemIcons, nativeItemIconEligible } from '../../src/native-viewer/native-item-icons.js'
const item = { name: 'minecraft:wheat_seeds', count: 3, snbt: '{id:"minecraft:wheat_seeds",count:3}' }
const reader = (overrides = {}) => ({ manifest: { assets: {} }, json: async path => {
  if (path.endsWith('/item/wheat_seeds.json')) return { parent: 'minecraft:item/generated', textures: { layer0: 'minecraft:item/wheat_seeds' }, ...overrides }
  if (path.endsWith('/item/generated.json')) return { parent: 'builtin/generated', gui_light: 'front' }
  throw Error('NATIVE_ASSET_MISSING')
}, bytes: async path => { assert.equal(path, 'assets/minecraft/textures/item/wheat_seeds.png'); return new Uint8Array([1,2,3]) } })
const settled = () => new Promise(resolve => setImmediate(resolve))
test('flat icons retain native namespace and decline custom components and unknown mod providers', () => {
  assert.equal(nativeItemIconEligible(item), true)
  assert.equal(nativeItemIconEligible({ name: item.name, count: item.count }), false, 'unknown components cannot become a plain item')
  for (const candidate of [{ ...item, name: 'mod:wheat_seeds' }, { ...item, name: 'minecraft:potion' },
    { ...item, components: { 'minecraft:custom_model_data': 3 } }, { ...item, snbt: '{components:{"minecraft:enchantments":{}}}' }]) assert.equal(nativeItemIconEligible(candidate), false)
})
test('original inherited item model drives the PNG, dedupes requests and releases URL exactly once', async () => {
  let changes = 0, creates = 0; const released = []
  const icons = new NativeItemIcons(reader(), { onChange: () => changes++, createUrl: () => `blob:verified-${++creates}`, revokeUrl: url => released.push(url) })
  assert.equal(icons.resolve(item), null); icons.resolve(item); await settled()
  assert.deepEqual(icons.resolve(item), { verified: true, url: 'blob:verified-1', sourcePath: 'assets/minecraft/textures/item/wheat_seeds.png' })
  assert.equal(changes, 1); assert.equal(creates, 1)
  icons.dispose(); icons.dispose(); assert.deepEqual(released, ['blob:verified-1'])
})
test('runtime model overrides, GUI transforms, multiple layers and tampered sources never borrow a fallback PNG', async () => {
  for (const bad of [{ overrides: [{}] }, { loader: 'mod:custom' }, { display: { gui: { rotation: [30,0,0] } } },
    { textures: { layer0: 'minecraft:item/wheat_seeds', layer1: 'minecraft:item/iron_ingot' } }]) {
    let creates = 0; const icons = new NativeItemIcons(reader(bad), { createUrl: () => { creates++; return 'blob:bad' } })
    icons.resolve(item); await settled(); assert.equal(icons.resolve(item), null); assert.equal(creates, 0); icons.dispose()
  }
  const source = reader(); source.bytes = async () => { throw Error('NATIVE_ASSET_HASH_MISMATCH') }
  const icons = new NativeItemIcons(source); icons.resolve(item); await settled(); assert.equal(icons.resolve(item), null); icons.dispose()
})
test('closing during decoding cannot leak an object URL or update a new scene', async () => {
  let finish, changes = 0, creates = 0; const source = reader()
  source.bytes = () => new Promise(resolve => { finish = resolve })
  const icons = new NativeItemIcons(source, { createUrl: () => { creates++; return 'blob:bad' }, onChange: () => changes++ })
  icons.resolve(item); await settled(); icons.dispose(); finish(new Uint8Array([1])); await settled()
  assert.equal(creates, 0); assert.equal(changes, 0)
})
