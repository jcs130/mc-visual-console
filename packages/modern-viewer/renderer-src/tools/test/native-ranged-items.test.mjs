import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {parseNativeItemStack} from '../../src/native-viewer/native-item-stack.js'
import {prepareNativeRangedItem} from '../../src/native-viewer/native-ranged-items.js'
import {resolveNativeItemAppearance} from '../../src/native-viewer/native-item-appearance.js'
import {nativeHeldItemTransform,nativeModelPartHeldMountMatrix} from '../../src/native-viewer/native-held-items.js'
import {resolveNativeBlockItemModel} from '../../src/native-viewer/native-block-item-icons.js'
const base=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url)
const reader=new NativeAssetReader(JSON.parse(await fs.readFile(new URL('native-assets.json',base),'utf8')),name=>fs.readFile(new URL(name,base)))
const stack=(name,components='')=>parseNativeItemStack({name:'minecraft:'+name,count:1,snbt:`{id:"minecraft:${name}",count:1${components?',components:{'+components+'}':''}}`})
const observed={source:'same_connection_entity_metadata',entityId:42,usingItem:false}

test('inactive bows/crossbows retain original distinct left/right displays and select charged original textures',async()=>{
  for(const [name,components,texture]of [
    ['bow','','item/bow'],['crossbow','','item/crossbow_standby'],
    ['crossbow','"minecraft:charged_projectiles":[{id:"minecraft:arrow",count:1}]','item/crossbow_arrow'],
    ['crossbow','"minecraft:charged_projectiles":[{id:"minecraft:firework_rocket",count:1}]','item/crossbow_firework']]){
    for(const arm of ['left','right']){
      const appearance=await resolveNativeItemAppearance(reader,stack(name,components),{kind:`thirdperson_${arm}hand`,observed})
      assert.equal(appearance.family,'ranged');assert.equal(appearance.geometry,'generated')
      assert.equal(appearance.model.textures.layer0,texture)
      const original=await reader.json(`assets/minecraft/models/item/${name}.json`)
      assert.deepEqual(appearance.selectedDisplay,original.display[`thirdperson_${arm}hand`])
      assert.notDeepEqual(original.display.thirdperson_lefthand,original.display.thirdperson_righthand)
      assert.equal(appearance.prepared.activeUseAvailable,false)
      assert.ok(appearance.sourcePaths.includes(`assets/minecraft/models/item/${name}.json`))
    }
  }
})

test('missing/active use evidence, malformed projectiles and unrelated visual components stay unavailable',async()=>{
  for(const value of [null,{}, {...observed,source:'guessed'}, {...observed,usingItem:undefined}])await assert.rejects(prepareNativeRangedItem(reader,stack('bow'),value),/USE_STATE_UNAVAILABLE/)
  await assert.rejects(prepareNativeRangedItem(reader,stack('crossbow'),{...observed,usingItem:true}),/ACTIVE_USE_UNAVAILABLE/)
  await assert.rejects(prepareNativeRangedItem(reader,stack('crossbow','"minecraft:charged_projectiles":[{id:"invalid",count:1}]'),observed),/PROJECTILES_INVALID/)
  await assert.rejects(prepareNativeRangedItem(reader,stack('bow','"minecraft:custom_model_data":7'),observed),/VISUAL_COMPONENT_UNSUPPORTED/)
  await assert.rejects(resolveNativeItemAppearance(reader,stack('bow'),{kind:'gui'}),/STATIC_PROVIDER_UNVERIFIED/)
})

test('original bow/crossbow/tool mounts match locked Java JOML ItemInHandLayer matrices, including handedness',async()=>{
  // Generated independently with JOML 1.10.5 / Java21 using the locked Java
  // layer's pixel scale, Rx(-90), Ry(180), hand offset and ItemTransform.
  const cases=[
    ['crossbow','right',[-7.2,-12.470765,0,0,-12.470765,7.2,0,0,0,0,-14.4,0,-2.9999988,13,-2.1,1]],
    ['crossbow','left',[-12.470766,-7.1999984,0,0,-7.1999984,12.470766,0,0,0,0,-14.4,0,3.000001,13,-2.1,1]],
    ['bow','right',[1.9155171,-11.001941,-9.0911,0,1.6073114,9.280558,-10.892556,0,14.1812315,.4342119,2.4625428,0,0,7.5,0,1]],
    ['bow','left',[-1.9155229,-11.00194,-9.091099,0,-1.6073128,9.280559,-10.892555,0,14.181231,-.43421525,-2.4625473,0,0,7.5,0,1]],
    ['iron_sword','right',[0,-7.80064,-11.140469,0,0,11.140469,-7.80064,0,13.6,0,0,0,-.99999917,9.5,-6,1]]
  ]
  for(const [name,arm,expected]of cases){
    const model=await resolveNativeBlockItemModel(reader,`minecraft:item/${name}`,[],{generatedOnly:true,properties:{pulling:0,pull:0,charged:0,firework:0}})
    const transform=nativeHeldItemTransform(model.display[`thirdperson_${arm}hand`],arm)
    const actual=nativeModelPartHeldMountMatrix({arm,transform}).elements
    actual.forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<1e-5,`${name}/${arm}/${index}: ${value} != ${expected[index]}`))
  }
})

test('real inheritance cycles still fail after selecting an overridden model',async()=>{
  const models={'assets/minecraft/models/item/a.json':{parent:'item/b',overrides:[{predicate:{charged:1},model:'item/selected'}]},
    'assets/minecraft/models/item/selected.json':{parent:'item/a'},'assets/minecraft/models/item/b.json':{parent:'item/a'}}
  await assert.rejects(resolveNativeBlockItemModel({json:async path=>models[path]},'minecraft:item/a',[],{generatedOnly:true,properties:{charged:1}}),/PARENT_CYCLE/)
})
