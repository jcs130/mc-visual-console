import test from 'node:test'
import assert from 'node:assert/strict'
import { NativeItemIcons } from '../../src/native-viewer/native-item-icons.js'

const source = () => ({ manifest: { minecraftVersion: '1.21.1', assetIntegrityVerified: true,
  sources: [
    { name: 'Patchouli-1.21.1-93-NEOFORGE.jar', sha256: '959af52ed6640c316c3a8469203420be4aeea11ad6603890ba83bf48f5d9f993' },
    { name: 'touhoulittlemaid-1.5.3-neoforge+mc1.21.1.jar', sha256: 'f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27' }
  ], assets: Object.fromEntries(['memorizable_gensokyo', 'smart_slab_empty'].map(name =>
    [`assets/touhou_little_maid/models/item/${name}.json`, { source: 'touhoulittlemaid-1.5.3-neoforge+mc1.21.1.jar', sha256: 'fixture', variants: [] }])) },
  json: async path => {
    if (path === 'assets/minecraft/models/item/generated.json') return { parent: 'builtin/generated', gui_light: 'front' }
    const name = /^assets\/touhou_little_maid\/models\/item\/(memorizable_gensokyo|smart_slab_empty)\.json$/.exec(path)?.[1]
    if (name) return { parent: 'minecraft:item/generated', textures: { layer0: `touhou_little_maid:item/${name}` } }
    throw Error('NATIVE_ASSET_MISSING')
  }, bytes: async path => {
    assert.match(path, /^assets\/touhou_little_maid\/textures\/item\/(memorizable_gensokyo|smart_slab_empty)\.png$/)
    return new Uint8Array([1, 2, 3])
  } })
const guide = { name: 'patchouli:guide_book', count: 1,
  snbt: '{components:{"patchouli:book":"touhou_little_maid:memorizable_gensokyo"},count:1,id:"patchouli:guide_book"}' }
const settled = () => new Promise(resolve => setImmediate(resolve))

test('the complete native guide component chooses the actual maid cover and never the generic book icon', async () => {
  let creates = 0, changed = 0; const revoked = []
  const icons = new NativeItemIcons(source(), { createUrl: () => `blob:book-${++creates}`,
    revokeUrl: url => revoked.push(url), onChange: () => changed++ })
  icons.resolve(guide); icons.resolve(guide); await settled()
  const result = icons.resolve(guide)
  assert.equal(result.kind, 'native-guide-flat'); assert.equal(result.bookId, 'touhou_little_maid:memorizable_gensokyo')
  assert.equal(result.sourcePath, 'assets/touhou_little_maid/textures/item/memorizable_gensokyo.png')
  assert.equal(result.pixelParityVerified, false); assert.equal(creates, 1); assert.equal(changed, 1)
  // Same registry name, different component: no reuse of the previous cover.
  const other = { ...guide, snbt: guide.snbt.replace('memorizable_gensokyo', 'unknown_book') }
  assert.equal(icons.resolve(other), null); await settled(); assert.equal(icons.resolve(other), null)
  assert.equal(creates, 1); assert.equal(icons.resolve(guide).url, 'blob:book-1')
  // Malformed or conflicting full-stack input cannot select a trusted provider.
  assert.equal(icons.resolve({ ...guide, snbt: guide.snbt.replace('count:1', 'count:2') }), null)
  assert.equal(icons.resolve({ ...guide, components: { 'patchouli:book': 'other:book' } }), null)
  icons.dispose(); icons.dispose(); assert.deepEqual(revoked, ['blob:book-1'])
})

test('closing while a special item loads creates no stale URL or change notification', async () => {
  let finish, created = 0, changed = 0; const reader = source()
  reader.bytes = () => new Promise(resolve => { finish = resolve })
  const icons = new NativeItemIcons(reader, { createUrl: () => { created++; return 'blob:stale' }, onChange: () => changed++ })
  icons.resolve(guide); await settled(); assert.equal(typeof finish, 'function')
  icons.dispose(); finish(new Uint8Array([1, 2, 3])); await settled()
  assert.equal(created, 0); assert.equal(changed, 0); assert.equal(icons.resolve(guide), null)
})
