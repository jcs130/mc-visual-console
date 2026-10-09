import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { NativeLanguage } from '../../src/native-viewer/native-language.js'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { renderNativeItemSlot } from '../../src/native-viewer/native-ui-adapter.js'
import { shell } from './fixtures/native-console-dom.mjs'

const named = (component, extra = {}) => ({ name: 'minecraft:oak_planks', count: 2,
  snbt: '{id:"minecraft:oak_planks",count:2}', displayName: 'Oak Planks',
  descriptionId: 'block.minecraft.oak_planks', displayNameComponent: component, ...extra })
const originalReader = async () => {
  const dir = process.env.NATIVE_GUIDE_ASSET_DIR
  assert.ok(dir, 'Set NATIVE_GUIDE_ASSET_DIR to the exact export including Mojang zh_cn')
  return new NativeAssetReader(JSON.parse(await fs.readFile(path.join(dir, 'native-assets.json'), 'utf8')), filename => fs.readFile(path.join(dir, filename)))
}

test('actual Minecraft and mod language assets localize exact translatable names and nested material arguments', async () => {
  const language = await new NativeLanguage(await originalReader()).prepare()
  assert.equal(language.item(named({ translate: 'block.minecraft.oak_planks' })), '橡木木板')
  assert.equal(language.item(named({ translate: 'item.touhou_little_maid.smart_slab' })), '魂符')
  assert.equal(language.item(named({ translate: 'item.ars_nouveau.worn_notebook' })), '残破的宝典')
  assert.equal(language.item(named({ translate: 'domum_ornamentum.panel.name.format', with: [{ translate: 'block.minecraft.cobblestone' }] })), '圆石面板')
  assert.equal(language.translate('cuttergroup.domum_ornamentum.fpanel'), '装饰面板')
  const book = { name: 'patchouli:guide_book', count: 1, displayName: 'Memorizable Gensokyo',
    displayNameComponent: { translate: 'patchouli.touhou_little_maid.book.name' },
    snbt: '{id:"patchouli:guide_book",count:1,components:{"patchouli:book":"touhou_little_maid:memorizable_gensokyo"}}' }
  assert.equal(language.item(book), '记忆中的幻想乡')
  const legacyBook = { ...book }; delete legacyBook.displayNameComponent
  assert.equal(language.item(legacyBook), '记忆中的幻想乡')
  const custom = { ...book, displayNameComponent: { text: 'My Guide' },
    snbt: book.snbt.replace('"patchouli:book":', '"minecraft:custom_name":\'{"text":"My Guide"}\',"patchouli:book":') }
  assert.equal(language.item(custom), 'My Guide')
})
test('literal/custom names, namespaces, full stack components and tooltip identity survive localization', async () => {
  const language = await new NativeLanguage(await originalReader()).prepare()
  const item = named({ text: 'Corti’s Workshop', extra: [{ text: ' 甲' }] })
  const before = structuredClone(item)
  const document = shell(), slot = document.createElement('div')
  renderNativeItemSlot(document, slot, item, { resolveItemName: item => language.item(item) })
  assert.match(slot.textContent, /Corti’s Workshop 甲/)
  assert.match(slot.title, /minecraft:oak_planks/)
  assert.equal(slot.dataset.itemName, 'minecraft:oak_planks'); assert.deepEqual(item, before)
  const legacy = named(undefined, { snbt: `{id:"minecraft:oak_planks",count:2,components:{"minecraft:custom_name":'{"text":"My Planks"}'}}` })
  delete legacy.displayNameComponent
  assert.equal(language.item(legacy), 'My Planks')
})
test('unknown components, malformed placeholders and excessive trees preserve server text without evaluating actions', () => {
  const language = new NativeLanguage()
  for (const component of [{ translate: 'unknown:key' }, { selector: '@a' }, { nbt: 'inventory', entity: '@s' },
    { translate: 'domum_ornamentum.panel.name.format', with: [] }, Array.from({ length: 129 }, () => ({ text: 'x' }))]) {
    assert.equal(language.item(named(component)), 'Oak Planks')
  }
  language.words.set('format', '%2$s / %1$s %%')
  assert.equal(language.component({ translate: 'format', with: ['甲', { text: '乙' }] }), '乙 / 甲 %')
  assert.equal(language.component({ text: '<script>execute()</script>' }), '<script>execute()</script>')
})
test('locale conflicts, changed asset hashes and oversize dictionaries never become verified translations', async () => {
  const data = {
    'assets/a/lang/zh_cn.json': { same: '甲', local: '本地' },
    'assets/b/lang/zh_cn.json': { same: '乙' },
    'assets/a/lang/en_us.json': { same: 'English', only: 'Fallback' },
    'assets/c/lang/zh_cn.json': { hidden: '错误' }
  }
  const reader = { manifest: { assets: Object.fromEntries(Object.keys(data).map(key => [key, { bytes: 50 }])) },
    json: async key => { if (key.startsWith('assets/c/')) throw Error('NATIVE_ASSET_HASH_MISMATCH'); return data[key] } }
  const language = await new NativeLanguage(reader).prepare()
  assert.equal(language.translate('local'), '本地'); assert.equal(language.translate('same'), 'English')
  assert.equal(language.translate('hidden'), null)
  assert.ok(language.errors.some(error => error.reason === 'NATIVE_LANGUAGE_KEY_PRIORITY_UNRESOLVED'))
  assert.ok(language.errors.some(error => error.reason === 'NATIVE_ASSET_HASH_MISMATCH'))
})
test('common native menus have Chinese headings while a custom chest title remains untouched', () => {
  const language = new NativeLanguage()
  assert.equal(language.menu({ menuType: 'domum_ornamentum:architectscutter' }), '建筑切割台')
  assert.equal(language.menu({ menuType: 'curios:curios_container' }), '饰品栏')
  assert.equal(language.menu({ menuType: 'minecraft:generic_9x6' }), '大型箱子')
  assert.equal(language.menu({ menuType: 'minecraft:generic_9x6', title: 'Corti chest' }), 'Corti chest')
  assert.equal(language.menu({ menuType: 'unknown:screen' }), 'unknown:screen')
})
