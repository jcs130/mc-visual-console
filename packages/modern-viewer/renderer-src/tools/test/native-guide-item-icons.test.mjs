import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeGuideItemEligible, prepareNativeGuideItemIcon } from '../../src/native-viewer/native-guide-item-icons.js'

const maidSource = { name: 'touhoulittlemaid-1.5.3-neoforge+mc1.21.1.jar', sha256: 'f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27', explicitOverride: false }
const patchouliSource = { name: 'Patchouli-1.21.1-93-NEOFORGE.jar', sha256: '959af52ed6640c316c3a8469203420be4aeea11ad6603890ba83bf48f5d9f993', explicitOverride: false }
const book = { id: 'patchouli:guide_book', count: 1, components: { 'patchouli:book': 'touhou_little_maid:memorizable_gensokyo' } }
const slab = { id: 'touhou_little_maid:smart_slab_empty', count: 1, components: {} }
const bookPath = 'assets/touhou_little_maid/models/item/memorizable_gensokyo.json'
const slabPath = 'assets/touhou_little_maid/models/item/smart_slab_empty.json'
function reader () {
  return {
    manifest: { minecraftVersion: '1.21.1', assetIntegrityVerified: true,
      sources: [{ ...maidSource }, { ...patchouliSource }], assets: {
        [bookPath]: { source: maidSource.name, sha256: 'book-model', variants: [] },
        [slabPath]: { source: maidSource.name, sha256: 'slab-model', variants: [] }
      } },
    json: async path => {
      assert.ok(path === bookPath || path === slabPath)
      return { parent: 'item/generated', textures: { layer0: path === bookPath
        ? 'touhou_little_maid:item/memorizable_gensokyo' : 'touhou_little_maid:item/smart_slab_empty' } }
    }
  }
}

test('known book component selects the native maid manual model rather than the generic Patchouli book', async () => {
  assert.deepEqual(await prepareNativeGuideItemIcon(reader(), book), {
    kind: 'native-guide-flat', modelId: 'touhou_little_maid:item/memorizable_gensokyo',
    sourcePaths: [bookPath], bookId: 'touhou_little_maid:memorizable_gensokyo'
  })
  assert.equal(nativeGuideItemEligible(book.id), true)
})

test('only the plain EMPTY slab uses the verified non-glint static native model', async () => {
  assert.deepEqual(await prepareNativeGuideItemIcon(reader(), slab), {
    kind: 'native-guide-flat', modelId: 'touhou_little_maid:item/smart_slab_empty', sourcePaths: [slabPath]
  })
  for (const name of ['touhou_little_maid:smart_slab_init', 'touhou_little_maid:smart_slab_has_maid', 'other:smart_slab_empty']) {
    assert.equal(nativeGuideItemEligible(name), false)
    await assert.rejects(prepareNativeGuideItemIcon(reader(), { ...slab, id: name }), /ITEM_UNSUPPORTED/)
  }
})

test('unknown or missing book IDs and typed values cannot borrow the manual model', async () => {
  for (const components of [{}, { 'patchouli:book': 'other:book' }, { 'patchouli:book': { value: 'touhou_little_maid:memorizable_gensokyo' } }]) {
    await assert.rejects(prepareNativeGuideItemIcon(reader(), { ...book, components }), /COMPONENTS_UNSUPPORTED|BOOK_UNSUPPORTED/)
  }
})

test('complete components are retained: glint, custom models, profiles and unknown keys are refused', async () => {
  for (const key of ['minecraft:enchantments', 'minecraft:enchantment_glint_override', 'minecraft:custom_model_data', 'minecraft:profile', 'mod:unknown']) {
    await assert.rejects(prepareNativeGuideItemIcon(reader(), { ...book, components: { ...book.components, [key]: {} } }), /COMPONENTS_UNSUPPORTED/)
    await assert.rejects(prepareNativeGuideItemIcon(reader(), { ...slab, components: { [key]: {} } }), /COMPONENTS_UNSUPPORTED/)
  }
})

test('invalid stack or incomplete parse is rejected rather than treated as a plain mod item', async () => {
  for (const stack of [{ ...slab, count: 0 }, { ...slab, count: 1.2 }, { ...slab, count: 65 },
    { ...slab, components: null }, { ...slab, components: [] }, { id: slab.id, count: 1 }]) {
    await assert.rejects(prepareNativeGuideItemIcon(reader(), stack), /STACK_INVALID/)
  }
})

test('the audited model provider is bound to the locked mod jars and native asset manifest', async () => {
  for (const mutate of [r => { r.manifest.minecraftVersion = '1.20.6' },
    r => { r.manifest.assetIntegrityVerified = false }, r => { r.manifest.sources = [] },
    r => { r.manifest.sources[0].sha256 = 'changed' }, r => { r.manifest.sources[1].sha256 = 'changed' },
    r => { r.manifest.sources[0].explicitOverride = true }, r => { r.manifest.sources.push({ ...maidSource }) }]) {
    const source = reader(); mutate(source)
    await assert.rejects(prepareNativeGuideItemIcon(source, book), /PROVIDER_SOURCE_UNVERIFIED/)
  }
  const plainSource = reader(); plainSource.manifest.sources = [{ ...maidSource }]
  assert.equal((await prepareNativeGuideItemIcon(plainSource, slab)).modelId, 'touhou_little_maid:item/smart_slab_empty')
})

test('model overrides, resource ambiguity, changed layers and reader hash failures stay explicit', async () => {
  for (const mutate of [r => { delete r.manifest.assets[bookPath] },
    r => { r.manifest.assets[bookPath].source = 'external-pack.zip' },
    r => { r.manifest.assets[bookPath].variants = [{ sha256: 'different' }] }]) {
    const source = reader(); mutate(source)
    await assert.rejects(prepareNativeGuideItemIcon(source, book), /MODEL_SOURCE_UNVERIFIED/)
  }
  for (const model of [{ parent: 'builtin/entity' },
    { parent: 'item/generated', textures: { layer0: 'patchouli:item/book_brown' } },
    { parent: 'item/generated', textures: { layer0: 'touhou_little_maid:item/memorizable_gensokyo' }, loader: 'mod:renderer' },
    { parent: 'item/generated', textures: { layer0: 'touhou_little_maid:item/memorizable_gensokyo', layer1: 'mod:extra' } }]) {
    const source = reader(); source.json = async () => model
    await assert.rejects(prepareNativeGuideItemIcon(source, book), /MODEL_RULE_CHANGED/)
  }
  const source = reader(); source.json = async () => { throw Error('NATIVE_ASSET_HASH_MISMATCH') }
  await assert.rejects(prepareNativeGuideItemIcon(source, book), /NATIVE_ASSET_HASH_MISMATCH/)
})

test('private locked assets select both original models through actual SHA verification',
  { skip: !process.env.NATIVE_GUIDE_ASSET_DIR }, async () => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { NativeAssetReader } = await import('../../src/native-viewer/model-loader.js')
    const directory = process.env.NATIVE_GUIDE_ASSET_DIR
    const manifest = JSON.parse(await readFile(join(directory, 'native-assets.json'), 'utf8'))
    const source = new NativeAssetReader(manifest, path => readFile(join(directory, path)))
    for (const stack of [book, slab]) {
      const plan = await prepareNativeGuideItemIcon(source, stack)
      assert.equal(plan.kind, 'native-guide-flat')
      const model = await source.json(plan.sourcePaths[0])
      const [namespace, path] = model.textures.layer0.split(':')
      const bytes = await source.bytes(`assets/${namespace}/textures/${path}.png`)
      assert.ok(bytes.length > 0)
    }
  })
