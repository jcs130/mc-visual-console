import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {NATIVE_CRAFTER_GUI,nativeCrafterMenuLayout,nativeCrafterState,NativeUiAssets,createNativeInterface} from '../../src/native-viewer/native-ui-adapter.js'
import {shell} from './fixtures/native-console-dom.mjs'
import {pngRgba} from './fixtures/png-rgba.mjs'
const UUID='e371227c-09fa-3722-84f4-f3228a552c3c'
const directory=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url)
const manifest=JSON.parse(await fs.readFile(new URL('native-assets.json',directory),'utf8'))
const reader=()=>new NativeAssetReader(manifest,p=>fs.readFile(new URL(p,directory)))
const menu=()=>({playerUuid:UUID,menuType:'minecraft:crafter_3x3',windowId:3,stateId:16,
  slots:Array.from({length:46},(_,slot)=>({slot,item:null})),properties:Array.from({length:10},(_,id)=>({id,value:0}))})

test('CrafterMenu preserves all 46 authoritative slots and the final preview index',()=>{
  const m=menu(),layout=nativeCrafterMenuLayout(m,UUID)
  assert.deepEqual(layout.slots.slice(0,9).map(s=>[s.x,s.y]),[[26,17],[44,17],[62,17],[26,35],[44,35],[62,35],[26,53],[44,53],[62,53]])
  for(const [slot,x,y,role] of [[9,8,84,'inventory'],[35,152,120,'inventory'],[36,8,142,'hotbar'],[44,152,142,'hotbar'],[45,134,35,'result']]){
    const s=layout.slots[slot];assert.deepEqual([s.x,s.y,s.role],[x,y,role])
  }
  assert.throws(()=>nativeCrafterMenuLayout({...m,slots:m.slots.slice(0,45)},UUID),/SLOTS/)
  assert.throws(()=>nativeCrafterMenuLayout({...m,playerUuid:'00000000-0000-0000-0000-000000000000'},UUID),/IDENTITY/)
})

test('all 512 slot masks and both received power states use the original data slots',()=>{
  for(let mask=0;mask<512;mask++)for(const power of [0,1]){
    const m=menu();m.properties=m.properties.map(p=>({...p,value:p.id===9?power:(mask>>p.id)&1}))
    const state=nativeCrafterState(m,UUID);assert.equal(state.available,true);assert.equal(state.powered,power===1)
    assert.deepEqual(state.disabledSlots,Array.from({length:9},(_,i)=>i).filter(i=>(mask>>i)&1))
    assert.equal(state.redstone.path,(power?NATIVE_CRAFTER_GUI.powered:NATIVE_CRAFTER_GUI.unpowered).path)
    assert.deepEqual([state.redstone.x,state.redstone.y],[97,35])
    for(const crop of state.disabled)assert.deepEqual([crop.x,crop.y,crop.width,crop.height],[25+18*(crop.slot%3),16+18*Math.floor(crop.slot/3),18,18])
  }
  const m=menu();m.properties.pop();assert.equal(nativeCrafterState(m,UUID).available,false)
  m.properties.push({id:0,value:1});assert.match(nativeCrafterState(m,UUID).reason,/UNVERIFIED/)
  assert.equal(nativeCrafterState({...menu(),properties:undefined},UUID).available,false)
})

test('all four exact original crafter PNGs are verified without an optional local-asset skip',async()=>{
  const r=reader()
  for(const info of [NATIVE_CRAFTER_GUI,...['disabled','powered','unpowered'].map(k=>NATIVE_CRAFTER_GUI[k])]){
    assert.equal(r.manifest.assets[info.path].sha256,info.sha256);assert.equal(r.manifest.assets[info.path].bytes,info.bytes)
    const data=pngRgba(await r.bytes(info.path));assert.deepEqual([data.width,data.height],info===NATIVE_CRAFTER_GUI?[256,256]:[info.width,info.height])
    if(info===NATIVE_CRAFTER_GUI.disabled)assert(data.pixels.every((value,i)=>i%4!==3||value===255),'disabled overlay must completely cover the original slot rendering')
  }
})

test('read-only UI draws received disabled slots, power and actual recipe preview, then clears stale state',async()=>{
  const document=shell(),ui=createNativeInterface({document,resolveItemIcon:()=>({verified:true,url:'blob:actual-stack'})})
  ui.setIdentity({confirmed:true,playerUuid:UUID});await ui.setAssets(reader())
  const m=menu();m.properties[0].value=1;m.properties[8].value=1;m.properties[9].value=1
  m.slots[45].item={name:'minecraft:stick',count:4,snbt:'{id:"minecraft:stick",count:4}'}
  const update=(nativeMenu,epoch)=>ui.update({epoch,presentation:{schemaVersion:1,source:'same_player_connection',playerUuid:UUID,available:true,nativeMenu}})
  update(m,1)
  let panel=document.querySelector('.native-menu-crafter');assert(panel)
  assert.equal(document.querySelector('[data-menu-title]').textContent,'合成器')
  assert.equal(panel.dataset.powered,'true');assert.equal(panel.querySelectorAll('.corti-menu-slot').length,46)
  assert.equal(panel.querySelectorAll('.native-crafter-disabled-slot').length,2)
  assert(panel.querySelectorAll('.corti-menu-slot').filter(s=>s.dataset.disabled==='true').every(s=>s.listeners.size===0))
  assert.equal(panel.querySelectorAll('.corti-menu-slot')[45].dataset.slotRole,'result')
  assert.match(document.body.textContent,/产物槽是配方预览/)
  update({...m,properties:[]},2);panel=document.querySelector('.native-menu-crafter')
  assert.equal(panel.dataset.crafterState,'unknown');assert.equal(panel.querySelectorAll('.native-crafter-redstone').length,0)
  assert.equal(panel.querySelectorAll('.native-crafter-disabled-slot').length,0)
  ui.update({epoch:3,presentation:null});assert.equal(document.getElementById('corti-menu').hidden,true);ui.dispose()
})
