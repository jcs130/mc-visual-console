import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { NativeLanguage } from '../../src/native-viewer/native-language.js'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { renderNativeItemSlot } from '../../src/native-viewer/native-ui-adapter.js'
import { shell } from './fixtures/native-console-dom.mjs'
import {createHash} from 'node:crypto'

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

test('stacked partial mod languages preserve original keys, resolve only proven vanilla priority and retain mod conflicts',async()=>{
  const file='assets/minecraft/lang/en_us.json',base={'block.minecraft.dirt':'Dirt',shared:'Base'},a={pale:'Pale Oak',shared:'Mod A'},b={shared:'Mod B'}
  const inputs=[['client.jar',base],['a.jar',a],['b.jar',b]],bytes=new Map(),rows=inputs.map(([source,dict])=>{
    const data=Buffer.from(JSON.stringify(dict)),sha256=createHash('sha256').update(data).digest('hex');bytes.set(`asset-variants/${sha256}.bin`,data)
    return {source,sha256,bytes:data.length}
  })
  const manifest={minecraftVersion:'1.21.1',assetIntegrityVerified:true,clientJarSha256:'499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99',variantContentPath:'asset-variants/{sha256}.bin',
    sources:[{name:'client.jar',sha256:'499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'},
      {name:'neoforge-21.1.250-universal.jar',sha256:'1f9cc68fe9ec0416475d34ce76e95a696b9721d5d338168563dab0632c3d2956'},
      {name:'a.jar',sha256:'1'.repeat(64)},{name:'b.jar',sha256:'2'.repeat(64)}],assets:{[file]:{...rows[1],variants:rows.slice(0,2)}}}
  const reader=new NativeAssetReader(manifest,async p=>bytes.get(p)),language=await new NativeLanguage(reader).prepare()
  assert.equal(language.translate('block.minecraft.dirt'),'Dirt');assert.equal(language.translate('pale'),'Pale Oak');assert.equal(language.translate('shared'),'Mod A')
  await assert.rejects(reader.bytes(file),/RESOURCE_PRIORITY_UNRESOLVED/)
  const conflict=structuredClone(manifest);conflict.assets[file]={...rows[2],variants:rows}
  const other=await new NativeLanguage(new NativeAssetReader(conflict,async p=>bytes.get(p))).prepare()
  assert.equal(other.translate('block.minecraft.dirt'),'Dirt');assert.equal(other.translate('shared'),null)
  assert(other.errors.some(e=>e.key==='shared'&&e.reason==='NATIVE_LANGUAGE_KEY_PRIORITY_UNRESOLVED'))
  const corrupt=new NativeAssetReader(manifest,async()=>Buffer.from('{}')),failed=await new NativeLanguage(corrupt).prepare()
  assert.equal(failed.translate('block.minecraft.dirt'),null);assert(failed.errors.some(e=>e.reason==='NATIVE_LANGUAGE_VARIANT_HASH_MISMATCH'))
})
