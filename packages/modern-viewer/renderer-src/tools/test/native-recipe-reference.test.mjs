import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {EventEmitter} from 'node:events'
import * as THREE from 'three'
import minecraftData from 'minecraft-data'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {NativeItemIcons} from '../../src/native-viewer/native-item-icons.js'
import {loadOriginalItemColors} from '../../src/native-viewer/native-potion-items.js'
import {nativeRecipeReferenceItem,NATIVE_RECIPE_REFERENCE_LABEL} from '../../src/native-viewer/native-recipe-reference.js'
import {NATIVE_STATIC_ITEM_NAMES} from '../../src/native-viewer/native-static-item-providers.js'
import {parseNativeItemStack} from '../../src/native-viewer/native-item-stack.js'
import {createNativeInterface} from '../../src/native-viewer/native-ui-adapter.js'
import {createNativeActivityUi} from '../../src/native-viewer/native-activity-ui.js'
import {observeVanillaActivity,vanillaWireItem} from '../../host/vanilla-activity.mjs'
import {shell} from './fixtures/native-console-dom.mjs'
import {pngRgba} from './fixtures/png-rgba.mjs'

const directory=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url)
const manifest=JSON.parse(await readFile(new URL('native-assets.json',directory),'utf8'))
const reader=()=>new NativeAssetReader(manifest,p=>readFile(new URL(p,directory)))
const original=await loadOriginalItemColors(reader())
const byName=new Map(original.items.map(row=>[row.name,row]))
const ref=(name,count=2)=>({name,count,reference:{schemaVersion:1,source:'vanilla_recipe_catalog',minecraftVersion:'1.21.1',
  appearance:'original_default',id:name,registryId:byName.get(name)?.id}})
const settle=()=>new Promise(resolve=>setImmediate(resolve))
const uuid='6e8b395e-4349-3d44-99f5-b7488825e426'

test('reference defaults validate the original registry and every admitted static family without relaxing observed stack parsing',()=>{
  let admitted=0,unavailable=0
  for(const name of NATIVE_STATIC_ITEM_NAMES.filter(name=>name.startsWith('minecraft:'))){
    try{const result=nativeRecipeReferenceItem(reader(),ref(name),original);assert.equal(parseNativeItemStack(result.item).id,name);admitted++}
    catch(error){assert.equal(error.message,'NATIVE_ITEM_GLINT_UNSUPPORTED');unavailable++}
  }
  // Same-connection banner providers added sixteen colours plus the shield.
  // Keep this witness in step with the admitted families, not an older release.
  assert.equal(admitted,994);assert.equal(unavailable,3)
  assert.equal(admitted+unavailable,NATIVE_STATIC_ITEM_NAMES.filter(name=>name.startsWith('minecraft:')).length)
  console.log('catalogue default contract',JSON.stringify({registered:original.items.length,static:admitted+unavailable,admitted,defaultGlintUnavailable:unavailable}))
  for(const value of [{name:'minecraft:chest',count:1},{...ref('minecraft:chest'),components:{}},{...ref('minecraft:chest'),snbt:'{}'},
    ref('minecraft:chest',0),ref('unknown:item'),{...ref('minecraft:chest'),reference:{...ref('minecraft:chest').reference,minecraftVersion:'1.20.6'}},
    {...ref('minecraft:chest'),reference:{...ref('minecraft:chest').reference,source:'observed'}},
    {...ref('minecraft:chest'),reference:{...ref('minecraft:chest').reference,registryId:36}}])
    assert.throws(()=>nativeRecipeReferenceItem(reader(),value,original),/REFERENCE_/)
  for(const name of ['minecraft:potion','minecraft:splash_potion','minecraft:lingering_potion','minecraft:tipped_arrow'])
    assert.equal(nativeRecipeReferenceItem(reader(),ref(name),original).provenance.defaultRule,'original_PotionContents_EMPTY')
  for(const name of ['minecraft:bow','minecraft:player_head','minecraft:filled_map'])
    assert.throws(()=>nativeRecipeReferenceItem(reader(),ref(name),original),/STATIC_PROVIDER_UNVERIFIED/)
  assert.throws(()=>parseNativeItemStack({name:'minecraft:chest',count:1}),/STACK_UNKNOWN/)
  const bad=reader();bad.manifest={...manifest,clientJarSha256:'wrong'}
  assert.throws(()=>nativeRecipeReferenceItem(bad,ref('minecraft:chest'),original),/CLIENT_UNVERIFIED/)
})

test('actual catalogue to original providers to inspector shows reference outputs/materials and patches delayed icons in place',async()=>{
  const source=reader(),document=shell(),client=new EventEmitter(),bot=new EventEmitter()
  Object.assign(client,{uuid,state:'play',write(){}})
  const data=minecraftData('1.21.1')
  for(const row of original.items)assert.equal(data.items[row.id].name,row.name.slice(10),'independent original registry witness')
  const registry={...data,recipes:{}}
  const cases=['chest','oak_planks','birch_slab','iron_pickaxe','bread','torch','stone_slab']
  for(const name of cases){const output=byName.get('minecraft:'+name);assert.ok(data.recipes[output.id]);registry.recipes[output.id]=data.recipes[output.id]}
  Object.assign(bot,{_client:client,version:'1.21.1',entity:{id:7},game:{dimension:'overworld'},registry})
  const activity=observeVanillaActivity(bot),rows=Array.from({length:46},()=>({itemCount:0}))
  const slab=byName.get('minecraft:birch_slab').id
  client.emit('packet',{windowId:0,items:rows,carriedItem:{itemCount:0}},{name:'window_items',state:'play'});await settle()
  const materials=[['oak_planks',8],['birch_slab',2],['oak_log',2],['birch_planks',3],['stick',3],['iron_ingot',3],['wheat',3],['coal',1],['stone',3]]
  for(const [index,[name,count]]of materials.entries())rows[36+index]={itemId:byName.get('minecraft:'+name).id,itemCount:count,components:[],removeComponents:[]}
  client.emit('packet',{windowId:0,items:rows,carriedItem:{itemCount:0}},{name:'window_items',state:'play'});await settle()
  let revision=0,renders=0,disposed=0,release
  const gate=new Promise(resolve=>{release=resolve})
  const read=source.bytes.bind(source);source.bytes=async path=>{if(path.endsWith('.png'))await gate;return read(path)}
  const options={loadTexture:async bytes=>{assert.deepEqual([...bytes.slice(0,4)],[137,80,78,71]);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return new THREE.Texture({width:view.getUint32(16),height:view.getUint32(20)})},
    createRenderer:()=>({clear(){},render(scene){renders++;assert.ok(scene.children[0].children.length>0)},dispose(){disposed++}}),encode:async()=>new Blob(['GPU encoding test boundary'],{type:'image/png'})}
  const icons=new NativeItemIcons(source,{onChange:()=>revision++,blockRendererOptions:options,chestRendererOptions:options})
  const ui=createNativeInterface({document,resolveItemIcon:item=>icons.resolve(item),resolveItemIconReason:item=>icons.reason(item)})
  // UI assets prepare independently, so the icon gate only delays provider readiness.
  await ui.setAssets(reader())
  const inspector=createNativeActivityUi({document,itemName:item=>item?.name,
    renderItem:(target,item,options)=>ui.renderObservedItem(target,item,options),
    renderReferenceItem:(target,item,options)=>ui.renderReferenceItem(target,item,options)})
  inspector.setIdentity({confirmed:true,playerUuid:uuid,entityId:7})
  const state={epoch:1,presentation:{available:true,playerUuid:uuid,activity:activity.snapshot()}}
  assert.deepEqual(new Set(state.presentation.activity.recipes.map(row=>row.output.name)),new Set(cases.map(name=>'minecraft:'+name)))
  inspector.update(state,{iconRevision:revision})
  const slots=inspector.root.querySelectorAll('.corti-menu-slot'),reference=slots.find(slot=>slot.dataset.itemContext==='catalogue-default-reference')
  assert.equal(reference.dataset.modelState,'loading');assert.match(reference.title,/默认外观参考.*尚未执行合成/)
  const sample=slots.find(slot=>!slot.dataset.itemContext&&slot.dataset.itemName==='minecraft:birch_slab')
  assert.ok(sample);assert.equal(sample.querySelector('.corti-slot-count'),null);assert.match(sample.title,/历史观察样本/)
  const originalWire=vanillaWireItem(rows[37],registry);assert.equal(parseNativeItemStack(originalWire).count,2)
  release();for(let n=0;n<400&&(icons.active||icons.queue.length);n++)await new Promise(resolve=>setTimeout(resolve,5))
  assert.equal(icons.active,0);inspector.update(state,{iconRevision:revision})
  assert.equal(inspector.root.querySelectorAll('.corti-menu-slot')[0],slots[0],'no new snapshot or row rebuild')
  for(const slot of slots){assert.equal(slot.dataset.modelState,'verified',slot.title);assert.ok(slot.querySelector('img'))}
  assert.match(inspector.root.textContent,/birch_slab.*\+2/);assert.ok(renders>=4)
  const image=reference.querySelector('img');image.dispatch('error');assert.equal(reference.dataset.modelReason,'NATIVE_ITEM_ICON_IMAGE_DECODE_FAILED')
  inspector.update(state,{iconRevision:++revision});assert.equal(reference.querySelector('img'),null,'unrelated completion does not revive a failed decode')
  const old=slots[0],next={...state,epoch:2};inspector.update(next,{iconRevision:revision});image.dispatch('error')
  assert.notEqual(inspector.root.querySelectorAll('.corti-menu-slot')[0],old)
  assert.equal(inspector.root.querySelectorAll('.corti-menu-slot')[0].dataset.modelState,'verified')
  inspector.dispose();ui.dispose();icons.dispose();activity.close();assert.ok(disposed>=1)
})

test('all four original potion-family default references reuse real original color/layer rendering',async()=>{
  const icons=new NativeItemIcons(reader(),{potionIconOptions:{readPixels:async bytes=>pngRgba(bytes),encodePixels:async output=>new Blob([output.pixels],{type:'image/png'})}})
  const stacks=['potion','splash_potion','lingering_potion','tipped_arrow'].map(name=>nativeRecipeReferenceItem(reader(),ref('minecraft:'+name),original).item)
  for(const item of stacks)icons.resolve(item)
  for(let n=0;n<400&&(icons.active||icons.queue.length);n++)await new Promise(resolve=>setTimeout(resolve,5))
  for(const item of stacks){const icon=icons.resolve(item);assert.equal(icon?.verified,true,icons.reason(item));assert.equal(icon.tintColor,original.emptyPotionColor>>>0);assert.equal(icon.pixelParityVerified,false)}
  icons.dispose()
})
