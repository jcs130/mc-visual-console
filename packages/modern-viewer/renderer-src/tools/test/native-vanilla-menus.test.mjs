import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { NATIVE_VANILLA_GUIS, nativeVanillaMenuLayout, NativeUiAssets, createNativeInterface } from '../../src/native-viewer/native-ui-adapter.js'
import { vanillaMenuPropertyLabels } from '../../src/native-viewer/native-vanilla-menus.js'
import { nativeClientSourceVerified } from '../../src/native-viewer/native-client-source.js'
import { shell } from './fixtures/native-console-dom.mjs'
const UUID='e371227c-09fa-3722-84f4-f3228a552c3c', sha=Object.values(NATIVE_VANILLA_GUIS)[0].clientJarSha256
function menu(type) {return {playerUuid:UUID,menuType:type,windowId:5,stateId:9,slots:Array.from({length:NATIVE_VANILLA_GUIS[type].slots.length+36},(_,slot)=>({slot,item:null}))}}
function reader() {return {manifest:{minecraftVersion:'1.21.1',assetIntegrityVerified:true,clientJarSha256:sha,sources:[{name:'1.21.1.jar',sha256:sha}],
  assets:Object.fromEntries(Object.values(NATIVE_VANILLA_GUIS).map(info=>[info.path,{sha256:info.sha256,bytes:info.bytes}]))},bytes:async()=>new Uint8Array([137,80,78,71])}}

test('standard menus require the exact complete native window; hopper and merchant keep nonstandard original inventory positions',()=>{
  for(const type of Object.keys(NATIVE_VANILLA_GUIS)) {
    const m=menu(type),layout=nativeVanillaMenuLayout(m,UUID)
    assert.equal(layout.slots.length,m.slots.length)
    assert.equal(layout.slots.at(-1).role,'hotbar')
    assert.throws(()=>nativeVanillaMenuLayout({...m,playerUuid:'00000000-0000-0000-0000-000000000000'},UUID),/IDENTITY/)
    assert.throws(()=>nativeVanillaMenuLayout({...m,slots:m.slots.slice(1)},UUID),/SLOTS/)
    assert.throws(()=>nativeVanillaMenuLayout({...m,stateId:null},UUID),/STATE/)
  }
  const hopper=nativeVanillaMenuLayout(menu('minecraft:hopper'),UUID)
  assert.equal(hopper.height,133);assert.deepEqual([hopper.slots[5].x,hopper.slots[5].y,hopper.slots[32].y],[8,51,109])
  const trade=nativeVanillaMenuLayout(menu('minecraft:merchant'),UUID)
  assert.deepEqual(trade.slots.slice(0,3).map(s=>[s.x,s.y]),[[136,37],[162,37],[220,37]])
  assert.deepEqual([trade.width,trade.info.textureWidth,trade.slots[3].x,trade.slots[3].y],[276,512,108,84])
  const loom=nativeVanillaMenuLayout(menu('minecraft:loom'),UUID);assert.equal(loom.slots[3].y,57)
})

test('merchant original background uses its true 512px texture width, actual stack and readonly full window',async()=>{
  const document=shell(),seen=[],ui=createNativeInterface({document,resolveItemIcon:item=>{seen.push(item);return {verified:true,url:'blob:real-item'}}})
  ui.setIdentity({confirmed:true,playerUuid:UUID});await ui.setAssets(reader())
  const m=menu('minecraft:merchant'),item={name:'minecraft:emerald',count:3,snbt:'{id:"minecraft:emerald",count:3}'};m.slots[0].item=item
  ui.update({epoch:1,presentation:{schemaVersion:1,source:'same_player_connection',playerUuid:UUID,available:true,nativeMenu:m}})
  const panel=document.querySelector('.native-menu-standard');assert.ok(panel)
  assert.equal(panel.style.width,'552px');assert.equal(panel.querySelector('.native-menu-background-blit').style.backgroundSize,'1024px 512px')
  assert.equal(panel.querySelectorAll('.corti-menu-slot').length,39);assert.ok(seen.includes(item))
  assert.equal(panel.querySelectorAll('.corti-menu-slot')[0].dataset.nativeSlotX,'136')
  assert.ok(panel.querySelectorAll('.corti-menu-slot').every(s=>s.listeners.size===0))
  ui.update({epoch:2,presentation:null});assert.equal(document.getElementById('corti-menu').hidden,true);ui.dispose()
})

test('received properties omit unknown fields; hash alias still rejects canonical conflicts, duplicates and overrides',async()=>{
  const m=menu('minecraft:enchantment');m.properties=[{id:0,value:3},{id:2,value:30},{id:3,value:999},{id:2,value:999}]
  assert.deepEqual(vanillaMenuPropertyLabels(m),['第一栏等级费用：3','第三栏等级费用：30'])
  assert.deepEqual(vanillaMenuPropertyLabels(menu('minecraft:anvil')),[])
  const r=reader();assert.equal(nativeClientSourceVerified(r.manifest,sha),true)
  const assets=new NativeUiAssets(r);await assets.prepare();assert.ok([...assets.standardReasons.values()].every(v=>v===null));assets.dispose()
  for(const sources of [[{name:'minecraft-1.21.1-client.jar',sha256:'0'.repeat(64)},...r.manifest.sources],
    [...r.manifest.sources,...r.manifest.sources],[{name:'1.21.1.jar',sha256:sha,explicitOverride:true}]])
    assert.equal(nativeClientSourceVerified({...r.manifest,sources},sha),false)
})

test('all original standard menu crops are verified against the actual exported client textures',{skip:!process.env.NATIVE_GUIDE_ASSET_DIR},async()=>{
  const {NativeAssetReader}=await import('../../src/native-viewer/model-loader.js')
  const directory=process.env.NATIVE_GUIDE_ASSET_DIR,manifest=JSON.parse(await fs.readFile(path.join(directory,'native-assets.json'),'utf8'))
  const assets=new NativeUiAssets(new NativeAssetReader(manifest,p=>fs.readFile(path.join(directory,p))))
  await assets.prepare();for(const [type,reason] of assets.standardReasons) assert.equal(reason,null,type)
  assets.dispose()
})
