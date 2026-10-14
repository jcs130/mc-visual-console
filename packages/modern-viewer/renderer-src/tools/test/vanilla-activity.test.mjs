import { EventEmitter } from 'node:events'
import test from 'node:test'
import assert from 'node:assert/strict'
import { observeVanillaActivity } from '../../host/vanilla-activity.mjs'

const uuid = '6e8b395e-4349-3d44-99f5-b7488825e426'
const stack = (id, count) => ({itemId:id,itemCount:count,components:[],removeComponents:[]})
const inventory = (slot = 36, count = 8) => Array.from({length:46},(_,n)=>n===slot?stack(1,count):{itemCount:0})
function fixture() {
  const bot = new EventEmitter(), client = new EventEmitter()
  Object.assign(client,{uuid,state:'play',write(){}})
  Object.assign(bot,{version:'1.21.1',_client:client,username:'Player',entity:{id:7,position:{x:1,y:64,z:2}},
    game:{dimension:'overworld'},inventory:{slots:Array(46).fill(null)},registry:{
      items:{1:{id:1,name:'oak_planks',displayName:'Oak Planks'},2:{id:2,name:'stick',displayName:'Stick'},3:{id:3,name:'emerald',displayName:'Emerald'}},
      itemsByName:{oak_planks:{id:1}},recipes:{2:[{inShape:[[1],[1]],result:{id:2,count:4}}]}}})
  let time=1000
  const activity=observeVanillaActivity(bot,{now:()=>time})
  return {bot,client,activity,tick:()=>{time+=100},packet:(name,value)=>client.emit('packet',value,{name,state:'play'})}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve))

test('server inventory initial sync and own slot/cursor moves do not invent income; real change is component-bound',async()=>{
  const f=fixture(); f.packet('window_items',{windowId:0,stateId:1,items:inventory(),carriedItem:{itemCount:0}});await settle()
  assert.equal(f.activity.snapshot().items.length,0)
  f.packet('window_items',{windowId:0,stateId:2,items:inventory(37),carriedItem:{itemCount:0}});await settle()
  assert.equal(f.activity.snapshot().items.length,0)
  f.packet('window_items',{windowId:0,stateId:3,items:inventory(37,6),carriedItem:stack(1,2)});await settle()
  assert.equal(f.activity.snapshot().items.length,0)
  f.tick();f.packet('window_items',{windowId:0,stateId:4,items:inventory(37,10),carriedItem:{itemCount:0}});await settle()
  assert.equal(f.activity.snapshot().items.at(-1).delta,2)
  assert.equal(f.activity.snapshot().items.at(-1).source,'server_inventory_reconciliation')
  f.bot.emit('respawn');assert.equal(f.activity.snapshot().items.length,0);f.activity.close()
})

test('operations, survival, digging and navigation failures expose evidence without chat/command text',async()=>{
  const f=fixture();f.bot.health=20;f.bot.food=20;f.bot.emit('health');f.tick();f.bot.health=17;f.bot.food=18;f.bot.emit('health')
  f.client.write('window_click',{windowId:0,slot:36,mouseButton:1,mode:0})
  f.client.write('chat_command',{command:'login private-key'})
  f.bot.emit('diggingAborted',{name:'stone',position:{x:1,y:63,z:2}})
  f.bot.emit('path_update',{status:'noPath',path:[]})
  const s=f.activity.snapshot();assert.equal(s.events.find(e=>e.kind==='health').delta,-3)
  assert.equal(s.events.find(e=>e.kind==='slot_click').slot,36)
  assert.ok(s.events.some(e=>e.kind==='dig_aborted'));assert.ok(s.events.some(e=>e.kind==='path_blocked'))
  assert.ok(!JSON.stringify(s).includes('private-key'));f.activity.close();assert.equal(f.client.listenerCount('packet'),0)
})

test('merchant offers only bind the actual active window and reset when that window closes',async()=>{
  const f=fixture();f.bot.currentWindow={id:2,type:'minecraft:merchant',slots:Array(39).fill(null),inventoryStart:3,inventoryEnd:39}
  const trade={inputItem1:stack(3,4),outputItem:stack(1,8),inputItem2:{itemCount:0},tradeDisabled:false,nbTradeUses:1,maximumNbTradeUses:8,specialPrice:-1,demand:2,priceMultiplier:.05}
  f.packet('trade_list',{windowId:9,trades:[trade]});assert.equal(f.activity.snapshot().merchant,null)
  f.packet('trade_list',{windowId:2,trades:[trade]});assert.equal(f.activity.snapshot().merchant.offers[0].price,3)
  f.client.write('select_trade',{slot:0});assert.equal(f.activity.snapshot().merchant.selected,0)
  f.packet('close_window',{windowId:2});assert.equal(f.activity.snapshot().merchant,null);f.activity.close()
})

test('recipe preview reports existing materials/missing counts and table need without dispatching craft',async()=>{
  const f=fixture();f.packet('window_items',{windowId:0,stateId:1,items:inventory(36,1),carriedItem:{itemCount:0}});await settle()
  const recipe=f.activity.snapshot().recipes.find(r=>r.output.name==='minecraft:stick')
  assert.equal(recipe.missing[0].count,1);assert.equal(recipe.craftable,false);assert.equal(recipe.requiresTable,false)
  f.packet('window_items',{windowId:0,stateId:2,items:inventory(36,2),carriedItem:{itemCount:0}});await settle()
  assert.equal(f.activity.snapshot().recipes.find(r=>r.output.name==='minecraft:stick').craftable,true);f.activity.close()
})

test('server panels are bounded and foreign identity cannot retain old history',()=>{
  const f=fixture();f.bot.scoreboard={sidebar:{title:'任务',items:[{displayName:{toString:()=>'<script>quest</script>'},value:2}]}}
  for(let n=0;n<200;n++)f.client.write('window_click',{windowId:0,slot:36,mouseButton:0,mode:0})
  const s=f.activity.snapshot();assert.ok(s.events.length<=48);assert.equal(s.server.sidebar.title,'任务')
  assert.ok(JSON.stringify(s).length<=49152)
  f.client.uuid='11111111-1111-1111-1111-111111111111';assert.equal(f.activity.snapshot().events.length,0);f.activity.close()
})

test('distant growth and same-block internal updates do not displace useful nearby operation history',()=>{
  const f=fixture();f.activity.snapshot()
  const old={name:'dirt',stateId:1}
  f.bot.emit('blockUpdate',old,{name:'grass_block',stateId:2,position:{x:100,y:64,z:2}})
  f.bot.emit('blockUpdate',{name:'oak_leaves',stateId:3},{name:'oak_leaves',stateId:4,position:{x:1,y:64,z:3}})
  assert.equal(f.activity.snapshot().events.length,0)
  f.bot.emit('blockUpdate',old,{name:'chest',stateId:5,position:{x:2,y:64,z:2}})
  assert.equal(f.activity.snapshot().events.at(-1).kind,'block_changed');f.activity.close()
})

test('late initial spawn preserves the received inventory baseline; a new entity still clears it',async()=>{
  const f=fixture();f.packet('window_items',{windowId:0,stateId:1,items:inventory(),carriedItem:{itemCount:0}});await settle()
  f.bot.emit('spawn');await settle();assert.equal(f.activity.snapshot().inventoryReady,true)
  f.packet('window_items',{windowId:0,stateId:2,items:inventory(36,6),carriedItem:{itemCount:0}});await settle()
  assert.equal(f.activity.snapshot().items.at(-1).delta,-2)
  f.bot.entity.id++;f.bot.emit('spawn');assert.equal(f.activity.snapshot().inventoryReady,false);assert.deepEqual(f.activity.snapshot().items,[]);f.activity.close()
})

test('unrelated distant mob damage does not flood the player operation list; self damage remains visible',()=>{
  const f=fixture();f.activity.snapshot()
  f.bot.emit('entityHurt',{id:8,name:'zombie',position:{x:100,y:64,z:2}})
  assert.equal(f.activity.snapshot().events.length,0)
  f.bot.emit('entityHurt',{id:7,name:'player',position:{x:1,y:64,z:2}})
  assert.equal(f.activity.snapshot().events.at(-1).entityId,7);f.activity.close()
})

test('workbench staging and cancelled transfers do not become income; close waits for a complete own inventory',async()=>{
  const f=fixture();f.packet('window_items',{windowId:0,items:inventory(),carriedItem:{itemCount:0}});await settle()
  const open=()=>{
    f.bot.currentWindow={id:1,type:'minecraft:crafting',inventoryStart:10,inventoryEnd:46}
    f.packet('open_window',{windowId:1});f.bot.emit('windowOpen',f.bot.currentWindow)
  }
  open()
  const staged=Array.from({length:46},()=>({itemCount:0}))
  staged[1]=stack(1,1);staged[37]=stack(1,7)
  f.packet('window_items',{windowId:1,items:staged,carriedItem:{itemCount:0}});await settle()
  assert.deepEqual(f.activity.snapshot().items,[],'placing a material still owns it')
  assert.equal(f.activity.snapshot().inventoryReconciling,true)
  assert.deepEqual(f.activity.snapshot().recipes,[],'do not advertise transient material deficits')
  f.bot.currentWindow=null;f.bot.emit('windowClose',{id:1});await settle()
  assert.deepEqual(f.activity.snapshot().items,[],'close alone is not an inventory receipt')
  f.packet('set_slot',{windowId:0,slot:36,item:stack(1,8)});await settle()
  assert.equal(f.activity.snapshot().inventoryReconciling,true)
  f.packet('window_items',{windowId:0,items:inventory(),carriedItem:{itemCount:0}});await settle()
  assert.equal(f.activity.snapshot().inventoryReconciling,false);assert.deepEqual(f.activity.snapshot().items,[])
  open();f.packet('window_items',{windowId:1,items:staged,carriedItem:{itemCount:0}});await settle()
  f.packet('window_items',{windowId:0,items:inventory(36,7),carriedItem:{itemCount:0}});await settle()
  assert.deepEqual(f.activity.snapshot().items,[],'an own snapshot while the table is open is not a terminal inventory')
  f.client.write('close_window',{windowId:1});f.bot.currentWindow=null;f.bot.emit('windowClose',{id:1});await settle()
  const completed=inventory(36,6);completed[37]=stack(2,4)
  f.packet('window_items',{windowId:0,items:completed,carriedItem:{itemCount:0}});await settle()
  assert.deepEqual(f.activity.snapshot().items.map(row=>[row.item.name,row.delta]),[['minecraft:oak_planks',-2],['minecraft:stick',4]])
  f.activity.close()
})
