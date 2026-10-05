import test from 'node:test'
import assert from 'node:assert/strict'
import { NativeItemIcons, nativeItemIconEligible } from '../../src/native-viewer/native-item-icons.js'
import { STATIC_ITEM_SOURCES, nativeStaticItemEvidence, nativeStaticItemState, verifyNativeStaticItemEvidence } from '../../src/native-viewer/native-static-item-providers.js'
const item = { name: 'minecraft:wheat_seeds', count: 3, snbt: '{id:"minecraft:wheat_seeds",count:3}' }
const reader = (overrides = {}) => ({ manifest: { minecraftVersion:'1.21.1',assetIntegrityVerified:true,clientJarSha256:STATIC_ITEM_SOURCES.minecraft.sha256,
  sources:[STATIC_ITEM_SOURCES.minecraft], assets: {'assets/minecraft/textures/item/wheat_seeds.png':{bytes:3}} }, json: async path => {
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
  const result=icons.resolve(item)
  assert.equal(result.verified,true);assert.equal(result.url,'blob:verified-1');assert.equal(result.sourcePath,'assets/minecraft/textures/item/wheat_seeds.png')
  assert.equal(result.kind,'native-json-flat');assert.equal(result.pixelParityVerified,false)
  assert.equal(result.providerEvidence.itemClass,'net.minecraft.world.item.ItemNameBlockItem')
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

const raw=(name,components='')=>({name,count:1,snbt:`{id:"${name}",count:1${components?`,components:{${components}}`:''}}`})
function genericReader(name,leafModel={}) {
  const [namespace,leaf]=name.split(':'),png=`assets/${namespace}/textures/item/${leaf}.png`
  return {manifest:{minecraftVersion:'1.21.1',assetIntegrityVerified:true,clientJarSha256:STATIC_ITEM_SOURCES.minecraft.sha256,sources:Object.values(STATIC_ITEM_SOURCES),assets:{[png]:{bytes:3}}},
    json:async path=>{
      if(path===`assets/${namespace}/models/item/${leaf}.json`)return {parent:'minecraft:item/generated',textures:{layer0:`${namespace}:item/${leaf}`},...leafModel}
      if(path==='assets/minecraft/models/item/generated.json')return {parent:'builtin/generated',gui_light:'front'}
      throw Error('NATIVE_ASSET_MISSING')
    },bytes:async path=>{assert.equal(path,png);return new Uint8Array([1,2,3])}}
}

test('positive constructor/provider evidence expands ordinary vanilla and locked Farmer items without treating arbitrary JSON as safe',async()=>{
  const cases=[['minecraft:raw_iron','net.minecraft.world.item.Item'],['minecraft:iron_pickaxe','net.minecraft.world.item.PickaxeItem'],
    ['minecraft:carrot','net.minecraft.world.item.ItemNameBlockItem'],['farmersdelight:cabbage','net.minecraft.world.item.Item'],
    ['farmersdelight:straw','net.minecraft.world.item.Item'],['farmersdelight:carrot_crate','net.minecraft.world.item.BlockItem'],
    ['minecraft:cut_sandstone_slab','net.minecraft.world.item.BlockItem']]
  for(const [name,itemClass] of cases){const e=nativeStaticItemEvidence(name);assert.equal(e.itemClass,itemClass);assert.equal(nativeItemIconEligible(raw(name)),true)}
  for(const name of ['minecraft:potion','minecraft:grass_block','minecraft:bow','minecraft:cut_standstone_slab','farmersdelight:skillet','farmersdelight:cooking_pot','unknown:straw'])
    assert.equal(nativeStaticItemEvidence(name),null)
  let reads=0
  const unsafe=genericReader('unknown:straw'),read=unsafe.json;unsafe.json=async path=>{reads++;return read(path)}
  const icons=new NativeItemIcons(unsafe);assert.equal(icons.resolve(raw('unknown:straw')),null)
  assert.match(icons.reason(raw('unknown:straw')),/STATIC_PROVIDER_UNVERIFIED/);assert.equal(reads,0);icons.dispose()
  const fd=new NativeItemIcons(genericReader('farmersdelight:cabbage'),{createUrl:()=> 'blob:cabbage',revokeUrl:()=>{}})
  fd.resolve(raw('farmersdelight:cabbage'));await settled();const icon=fd.resolve(raw('farmersdelight:cabbage'))
  assert.equal(icon.sourcePath,'assets/farmersdelight/textures/item/cabbage.png');assert.equal(icon.providerEvidence.source.name,STATIC_ITEM_SOURCES.farmersdelight.name)
  assert.equal(fd.reason(raw('farmersdelight:cabbage')),null);fd.dispose()
})

test('static provider class rules are bound to unique exact locked client/mod JAR declarations',()=>{
  const name='farmersdelight:cabbage'
  for(const modify of [r=>r.manifest.clientJarSha256='wrong',r=>r.manifest.sources=[],
    r=>r.manifest.sources=[STATIC_ITEM_SOURCES.minecraft,{...STATIC_ITEM_SOURCES.farmersdelight,sha256:'wrong'}],
    r=>r.manifest.sources=[STATIC_ITEM_SOURCES.minecraft,{...STATIC_ITEM_SOURCES.farmersdelight,explicitOverride:true}],
    r=>r.manifest.sources=[...r.manifest.sources,{...STATIC_ITEM_SOURCES.farmersdelight}]]){
    const r=genericReader(name);modify(r);assert.throws(()=>verifyNativeStaticItemEvidence(r,name),/UNVERIFIED/)
  }
  assert.throws(()=>verifyNativeStaticItemEvidence(genericReader(name),'other:cabbage'),/PROVIDER_UNVERIFIED/)
})

test('complete SNBT permits proven nonvisual state and empty/removal patches while visual, foil and ambiguous states stay explicit',()=>{
  const source=raw('minecraft:iron_pickaxe','"minecraft:damage":7,"minecraft:custom_name":\'{"text":"Own Pick"}\',"minecraft:enchantment_glint_override":false,"minecraft:enchantments":{levels:{"minecraft:unbreaking":1}}')
  const state=nativeStaticItemState(source)
  assert.equal(state.stack.components['minecraft:damage'],7);assert.ok(state.stack.components['minecraft:enchantments'].levels)
  assert.equal(nativeItemIconEligible(source),true)
  assert.equal(nativeItemIconEligible(raw('minecraft:iron_pickaxe','"!minecraft:custom_name":{}')),true)
  for(const components of ['"minecraft:custom_model_data":1','"minecraft:dyed_color":{rgb:1}','"minecraft:profile":{}',
    '"minecraft:block_state":{lit:"true"}','"mod:unknown":{}','"minecraft:enchantment_glint_override":true',
    '"minecraft:enchantments":{levels:{"minecraft:unbreaking":1}}','"minecraft:enchantment_glint_override":{type:"byte",value:0}',
    '"minecraft:custom_name":"x","!minecraft:custom_name":{}']){
    assert.equal(nativeItemIconEligible(raw('minecraft:iron_pickaxe',components)),false)
  }
  for(const name of ['minecraft:written_book','minecraft:nether_star','minecraft:enchanted_golden_apple']){
    assert.equal(nativeItemIconEligible(raw(name)),false,'native default glint may not become a plain icon')
    assert.equal(nativeItemIconEligible(raw(name,'"minecraft:enchantment_glint_override":false')),true)
    assert.equal(nativeItemIconEligible(raw(name,'"!minecraft:enchantment_glint_override":{}')),true)
  }
})

test('all static icon caches retain full authoritative component text and typed tags instead of sharing by registry name',async()=>{
  let created=0;const released=[]
  const icons=new NativeItemIcons(genericReader('minecraft:iron_ingot'),{createUrl:()=>`blob:state-${++created}`,revokeUrl:url=>released.push(url)})
  const a=raw('minecraft:iron_ingot','"minecraft:custom_name":"one"'),b=raw('minecraft:iron_ingot','"minecraft:custom_name":"two"')
  icons.resolve(a);icons.resolve(b);icons.resolve(a);await settled()
  assert.equal(created,2);assert.notEqual(icons.resolve(a).url,icons.resolve(b).url)
  assert.equal(icons.entries.size,2);assert.equal(icons.reason({...a,components:{}}),'NATIVE_ITEM_STACK_COMPONENT_SOURCE_CONFLICT')
  assert.equal(icons.resolve({...a,displayName:'A different server label'}).url,icons.resolve(a).url)
  assert.equal(created,2,'displayName never selects a model or becomes an icon key')
  assert.equal(icons.resolve({...a,components:{}}),null);icons.dispose();assert.equal(released.length,2)
})

test('flat generated material, finite texture bounds and inherited dynamic state are checked before publishing an image URL',async()=>{
  for(const patch of [{gui_light:'side'},{overrides:{}},{textures:{layer0:'minecraft:item/wheat_seeds',layer00:'minecraft:item/wheat_seeds'}},
    {display:{gui:{rotation:[NaN,0,0]}}}]){
    const icons=new NativeItemIcons(reader(patch),{createUrl:()=>{assert.fail('unsupported leaf created a URL')}})
    icons.resolve(item);await settled();assert.equal(icons.resolve(item),null);assert.ok(icons.reason(item));icons.dispose()
  }
  for(const bytes of [-1,0,16777217]){
    const source=reader();source.manifest.assets['assets/minecraft/textures/item/wheat_seeds.png'].bytes=bytes
    const icons=new NativeItemIcons(source);icons.resolve(item);await settled();assert.match(icons.reason(item),/TEXTURE_LIMIT/);icons.dispose()
  }
})
