import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import * as THREE from 'three'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { parseNativeItemStack, nativeNumericValue } from '../../src/native-viewer/native-item-stack.js'
import { resolveNativeItemAppearance, NATIVE_ITEM_APPEARANCE_CONTEXTS } from '../../src/native-viewer/native-item-appearance.js'
import { NativeItemIcons } from '../../src/native-viewer/native-item-icons.js'
import { prepareNativeHeldItem, buildNativeHeldItemObject, disposeNativeHeldItemObject } from '../../src/native-viewer/native-held-items.js'
import { createNativeDroppedItemActor } from '../../src/native-viewer/native-dropped-items.js'
import { createNativeDroppedItemMotion } from '../../src/native-viewer/native-entity-motion.js'
import { vanillaItemStack } from '../../host/vanilla-item-stack.mjs'
import { pngRgba } from './fixtures/png-rgba.mjs'

const vanillaRoot = new URL('../../../asset-packs/vanilla-1.21.1/', import.meta.url)
const modRoot = new URL('../../../asset-packs/native-1.21.1/', import.meta.url)
async function originalReader(root = vanillaRoot, mutate = () => {}) {
  const manifest = JSON.parse(await fs.readFile(new URL('native-assets.json', root), 'utf8'))
  mutate(manifest)
  return new NativeAssetReader(manifest, path => fs.readFile(new URL(path, root)))
}
const raw = (name, components = '') => ({ name, count: 1, snbt: `{id:"${name}",count:1${components ? `,components:{${components}}` : ''}}` })
const decode = async bytes => pngRgba(bytes)
const texture = async bytes => { const {width,height} = pngRgba(bytes); return new THREE.Texture({width,height}) }
const settle = async icons => { while (icons.active || icons.queue.length) await new Promise(resolve => setImmediate(resolve)) }

test('original enchanted-book model uses its registered default glint and respects explicit removals',async()=>{
  const {nativeStaticItemState}=await import('../../src/native-viewer/native-static-item-providers.js')
  const make=extra=>parseNativeItemStack(raw('minecraft:enchanted_book','"minecraft:stored_enchantments":{levels:{"minecraft:sharpness":3}}'+extra))
  assert.equal(nativeStaticItemState(make(''),{allowPartialGlint:true}).foil,true)
  assert.equal(nativeStaticItemState(make(',"minecraft:enchantment_glint_override":0b'),{allowPartialGlint:true}).foil,false)
  assert.equal(nativeStaticItemState(make(',"!minecraft:enchantment_glint_override":{}'),{allowPartialGlint:true}).foil,false)
})

test('original source models drive all six contexts and real held geometry without losing typed removals or slot identity', async () => {
  const reader = await originalReader()
  const item = raw('minecraft:oak_planks', '"minecraft:damage":2s,"!minecraft:custom_name":{}')
  const stack = parseNativeItemStack(item)
  for (const kind of NATIVE_ITEM_APPEARANCE_CONTEXTS) {
    const observed = { owner: { uuid: 'owner-a', epoch: 2 }, slot: 36, use: { available: false } }
    const selection = await resolveNativeItemAppearance(reader, stack, {kind, observed})
    observed.owner.uuid = 'owner-b'; observed.slot = 45
    assert.equal(selection.context.observed.owner.uuid, 'owner-a')
    assert.equal(selection.context.observed.slot, 36)
    assert.equal(selection.stack, stack)
    assert.equal(nativeNumericValue(selection.stack.components['minecraft:damage']), 2)
    assert.deepEqual(selection.stack.components['!minecraft:custom_name'], {})
    assert.equal(selection.family, 'static'); assert.equal(selection.geometry, 'block')
    assert.equal(selection.modelId, 'minecraft:item/oak_planks')
    assert(selection.sourcePaths.includes('assets/minecraft/models/block/cube_all.json'))
    const sibling = await resolveNativeItemAppearance(reader, stack, {kind, observed})
    assert.notEqual(selection, sibling); assert.equal(sibling.context.observed.owner.uuid, 'owner-b')
    assert.equal(sibling.context.observed.slot, 45)
    assert.equal(selection.requirements.propertyEvaluation, 'not_implemented')
    assert.equal(Object.hasOwn(selection, 'activeItem'), false)
    if (kind === 'gui') {
      assert.deepEqual(selection.prepared.transform.rotation, [30,225,0])
      assert.deepEqual(selection.prepared.transform.scale, [.625,.625,.625])
    } else {
      const arm = kind.endsWith('lefthand') ? 'left' : 'right'
      const plan = await prepareNativeHeldItem(reader, item, arm, {readPixels: decode, contextInput: {kind}})
      assert.equal(plan.appearance.context.kind, kind)
      assert.equal(plan.kind, 'native-block-held'); assert.equal(plan.faces.length, 6)
      const textures = new Map(await Promise.all([...plan.textureLayers].map(async ([path,row]) => [path,await texture(row.bytes)])))
      const mesh = buildNativeHeldItemObject(plan, textures)
      assert.equal(mesh.children.length, 6)
      assert.equal(mesh.children[0].material.side, THREE.FrontSide)
      if (kind === 'ground') {
        assert.deepEqual(plan.groundTransform.scale, [.25,.25,.25])
        assert.deepEqual(plan.groundTransform.translation, [0,.1875,0])
      } else if (kind.startsWith('firstperson')) {
        assert.deepEqual(plan.firstPersonTransform.rotation, arm === 'left' ? [0,-225,-0] : [0,45,0])
      } else {
        assert.deepEqual(plan.transform.rotation, arm === 'left' ? [75,-45,-0] : [75,45,0])
      }
      disposeNativeHeldItemObject(mesh); for (const t of textures.values()) t.dispose()
    }
  }
})

test('real menu loader uses shared prepared chest/plank plans and original generated/potion pixels after serializer identity', async () => {
  const reader = await originalReader(), renders = [], released = [], encoded = []
  let urls = 0
  const rendererOptions = {
    preparePlan: () => assert.fail('menu must consume the shared selected plan rather than dispatch/select again'),
    loadTexture: texture,
    createRenderer: () => ({clear(){}, render(scene){ renders.push(scene.children[0].userData.nativeItem) }, dispose(){}}),
    encode: async () => new Blob([new Uint8Array([1])], {type:'image/png'})
  }
  const icons = new NativeItemIcons(reader, {createUrl: () => `blob:original-${++urls}`, revokeUrl: url => released.push(url),
    blockRendererOptions: rendererOptions, chestRendererOptions: rendererOptions,
    potionIconOptions: {readPixels: decode, encodePixels: async pixels => {encoded.push(pixels);return new Blob([pixels.pixels])}}})
  try {
    const items = ['chest','oak_planks','stick','potion'].map(name => {
      const result = vanillaItemStack({name,count:1,components:[],removedComponents:[]})
      assert.equal(result.reason, null); assert.equal(parseNativeItemStack(result.item).id, 'minecraft:'+name)
      icons.resolve(result.item); return result.item
    })
    await settle(icons)
    for (const item of items) assert.equal(icons.resolve(item)?.verified, true, icons.reason(item))
    assert.deepEqual(renders.sort(), ['minecraft:chest','minecraft:oak_planks'])
    assert.equal(icons.resolve(items[0]).kind, 'native-builtin-chest-gui')
    assert.equal(icons.resolve(items[1]).kind, 'native-block-gui')
    assert.equal(icons.resolve(items[2]).sourcePath, 'assets/minecraft/textures/item/stick.png')
    assert.equal(icons.resolve(items[3]).tintColor, (-13083194)>>>0)
    assert.equal(encoded[0].width, 16); assert(encoded[0].pixels.some((n,i) => i%4===3&&n===255))
  } finally { icons.dispose() }
  assert.equal(urls,4);assert.equal(released.length,4)
})

test('existing original guide and Ars selection preserves mod source, selected model and GUI versus held geometry', async () => {
  const reader = await originalReader(modRoot)
  const guide = raw('patchouli:guide_book','"patchouli:book":"touhou_little_maid:memorizable_gensokyo"')
  const book = raw('ars_nouveau:novice_spell_book','"minecraft:base_color":"red"')
  const selections = []
  for (const item of [guide,book]) for (const kind of ['gui','thirdperson_lefthand']) {
    const selected = await resolveNativeItemAppearance(reader,parseNativeItemStack(item),{kind})
    selections.push(selected)
    if (item===guide) assert.equal(selected.modelId,'touhou_little_maid:item/memorizable_gensokyo')
    else {assert.equal(selected.prepared.color,'red');assert.equal(selected.geometryId,kind==='gui'?'ars_nouveau:spellbook_closed':'ars_nouveau:spellbook_open')}
    const held = await prepareNativeHeldItem(reader,item,'left',{readPixels:decode,contextInput:{kind:'thirdperson_lefthand'}})
    if (item===guide) assert.equal(held.kind,'native-generated-held')
    else {assert.equal(held.geometry,'ars_nouveau:spellbook_open');assert.equal(held.material,'entityTranslucent')}
  }
  let renders=0
  const icons=new NativeItemIcons(reader,{createUrl:()=> 'blob:original-mod',revokeUrl:()=>{},arsRendererOptions:{loadTexture:texture,
    createRenderer:()=>({clear(){},render(){renders++},dispose(){}}),encode:async()=>new Blob([new Uint8Array([1])],{type:'image/png'})}})
  icons.resolve(guide);icons.resolve(book);await settle(icons)
  assert.equal(icons.resolve(guide)?.bookId,'touhou_little_maid:memorizable_gensokyo')
  assert.equal(icons.resolve(book)?.kind,'native-ars-gui');assert.equal(renders,1);icons.dispose()
  assert(selections.every(s=>s.sourceVerification==='provider_source_and_asset_reader'))
})

test('original dropped chest and generated meshes consume ground selection while retaining real actor identity and disposal', async () => {
  const reader=await originalReader(),registry=JSON.parse(await fs.readFile(new URL('assets/minecraft/native/client-item-colors.json',vanillaRoot),'utf8'))
  for(const leaf of ['chest','oak_planks','stick','potion']) {
    const entity={name:'minecraft:item',entityId:7,uuid:'12345678-1234-5678-1234-567812345678',spawnedAt:1000,position:{x:0,y:64,z:0}}
    entity.itemState={available:true,source:'same_player_vanilla_item_registry',minecraftVersion:'1.21.1',registryId:registry.items.find(x=>x.name==='minecraft:'+leaf).id,item:raw('minecraft:'+leaf)}
    entity.motion=createNativeDroppedItemMotion(entity,{random:()=>0}).current()
    let disposed=0
    const actor=await createNativeDroppedItemActor(reader,entity,{readPixels:decode,loadTexture:async bytes=>{
      const result=await texture(bytes);result.addEventListener('dispose',()=>disposed++);return result
    }})
    assert.equal(actor.assetInfo.itemContext,'ground')
    const mesh=actor.root.children[0].children[0].children[0]
    assert(mesh.children.length>0)
    assert.equal(mesh.userData.kind,['chest','oak_planks'].includes(leaf)?'native-block-held':'native-generated-held')
    assert.throws(()=>actor.update({...entity,uuid:'different'},1000),/BINDING_MISMATCH/)
    actor.dispose();actor.dispose();assert.equal(actor.root.children.length,0);assert(disposed>0)
  }
})

test('strict parsed provenance refuses plain/tag-wrapper impostors and invalid contexts before asset selection', async () => {
  const reader=await originalReader(),stack=parseNativeItemStack(raw('minecraft:stick'))
  let jsonReads=0,byteReads=0,getterReads=0
  reader.json=async()=>{jsonReads++;assert.fail('invalid input must fail before reading JSON assets')}
  reader.bytes=async()=>{byteReads++;assert.fail('invalid input must fail before reading byte assets')}
  for(const fake of [{id:'minecraft:stick',count:1,components:{}},JSON.parse(JSON.stringify(stack)),
    {id:'minecraft:stick',count:1,components:{'minecraft:damage':{type:'short',value:2}}}])
    await assert.rejects(resolveNativeItemAppearance(reader,fake,{kind:'gui'}),/STACK_PARSED_REQUIRED/)
  const cyclic={};cyclic.owner=cyclic
  const accessorContexts=[]
  for(const field of ['kind','observed']) for(const throwing of [false,true]) {
    let calls=0
    accessorContexts.push(Object.defineProperty({kind:'gui'},field,{enumerable:true,get(){
      getterReads++;calls++
      if(throwing) throw Error('root context getter must never run')
      return field==='kind' ? calls===1?'gui':'not_a_context' : calls===1?{slot:36}:'replaced'
    }}))
  }
  for(const context of [null,{},'gui',{kind:'firstperson'},{kind:'gui',slot:36},{kind:'gui',observed:[]},
    {kind:'gui',observed:{slot:NaN}},{kind:'gui',observed:cyclic},{kind:'gui',observed:{use:()=>true}},
    ...accessorContexts,Object.create({kind:'gui'}),new(class {kind='gui'})(),
    {kind:'gui',[Symbol('extra')]:true},{kind:'gui',observed:{[Symbol('extra')]:true}}])
    await assert.rejects(resolveNativeItemAppearance(reader,stack,context),{message:'NATIVE_ITEM_APPEARANCE_CONTEXT_INVALID'})
  assert.equal(getterReads,0);assert.equal(jsonReads,0);assert.equal(byteReads,0)
  assert.throws(()=>{stack.components['minecraft:damage']={type:'short',value:2}},TypeError)
  const compound=parseNativeItemStack(raw('minecraft:stick','"minecraft:damage":{type:"short",value:2}'))
  await assert.rejects(resolveNativeItemAppearance(reader,compound,{kind:'thirdperson_righthand'}),/HELD_DAMAGE_INVALID/)
  assert.equal(jsonReads,0);assert.equal(byteReads,0)
})

test('shared production selection retains GUI-only families and refuses missing providers and conflicting original resources', async () => {
  const reader=await originalReader(modRoot),soul=raw('touhou_little_maid:smart_slab_init')
  const selected=await resolveNativeItemAppearance(reader,parseNativeItemStack(soul),{kind:'gui'})
  assert.equal(selected.family,'soul-slab');assert.equal(selected.prepared.animation.frameCount,7)
  assert.equal(selected.requirements.effectUnavailableReason,'NATIVE_GUI_GLINT_ATLAS_UV_UNAVAILABLE')
  assert.equal(Object.hasOwn(selected.prepared,'blob'),false,'selection does not create image output')
  await assert.rejects(prepareNativeHeldItem(reader,soul,'right',{readPixels:decode}),/STATIC_PROVIDER_UNVERIFIED/)
  await assert.rejects(resolveNativeItemAppearance(reader,parseNativeItemStack(raw('minecraft:bow')),{kind:'gui'}),/STATIC_PROVIDER_UNVERIFIED/)
  const item=raw('minecraft:oak_planks'),bad=await originalReader(vanillaRoot,manifest=>{
    const asset=manifest.assets['assets/minecraft/models/item/oak_planks.json'];asset.variants=[{sha256:'0'.repeat(64)}]
  })
  const icons=new NativeItemIcons(bad,{createUrl:()=>assert.fail('conflicting resources cannot produce an icon')})
  icons.resolve(item);await settle(icons);assert.match(icons.reason(item),/RESOURCE_PRIORITY_UNRESOLVED/);icons.dispose()
  await assert.rejects(prepareNativeHeldItem(bad,item,'right',{readPixels:decode}),/RESOURCE_PRIORITY_UNRESOLVED/)
})
