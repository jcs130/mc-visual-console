import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { observeVanillaMenus } from '../../host/vanilla-menu-state.mjs'
import { vanillaPlayerPresentation } from '../../host/vanilla-native-stream.mjs'
import { nativeCraftingMenuLayout, nativeFurnaceProgress } from '../../src/native-viewer/native-ui-adapter.js'
import { AgentVisualState } from '../../src/modern-viewer/agent-visual-state.js'
import { createNativeAgentVisualization } from '../../host/native-agent-visual.mjs'

const uuid='01234567-89ab-cdef-0123-456789abcdef'
function fixture(type='minecraft:crafting',count=46) {
  const bot=new EventEmitter(),client=new EventEmitter()
  Object.assign(client,{uuid,state:'play',write(){}})
  Object.assign(bot,{version:'1.21.1',username:'Player',player:{uuid},_client:client,registry:{},quickBarSlot:0,
    entity:{id:7,uuid,position:{x:1,y:65,z:3}},game:{gameMode:'survival'},
    inventory:{slots:Array(46).fill(null)},currentWindow:{id:1,type,slots:Array(count).fill(null),selectedItem:null}})
  return bot
}
const packet=(bot,name,value)=>bot._client.emit('packet',value,{name,state:'play'})
test('real window state restores crafting grid, original inventory layout and cursor stack', async () => {
  const bot=fixture(), changes=[], menus=observeVanillaMenus(bot,{onChange:()=>changes.push(true)})
  assert.equal(menus.snapshot(),null)
  packet(bot,'window_items',{windowId:1,stateId:3,items:Array(46).fill(null)})
  bot.currentWindow.slots[1]={name:'oak_planks',count:2,components:[],removedComponents:[]}
  bot.currentWindow.selectedItem={name:'stick',count:4,components:[],removedComponents:[]}
  const view=vanillaPlayerPresentation(bot,null,menus.snapshot())
  assert.equal(view.inventory.inventoryStart,9)
  assert.equal(view.nativeMenu.stateId,3)
  assert.equal(nativeCraftingMenuLayout(view.nativeMenu,uuid)[1].role,'crafting')
  assert.equal(view.nativeMenu.slots[1].item.name,'minecraft:oak_planks')
  assert.equal(view.nativeMenu.carried.name,'minecraft:stick')
  await new Promise(resolve=>queueMicrotask(resolve));assert.equal(changes.length,1)
  packet(bot,'open_window',{windowId:1});assert.equal(menus.snapshot(),null,'reused IDs cannot borrow old state')
  menus.close();assert.equal(bot._client.listenerCount('packet'),0)
})
test('furnace progress requires all four real properties and tracks actual state ID', () => {
  const bot=fixture('minecraft:furnace',39), menus=observeVanillaMenus(bot)
  packet(bot,'window_items',{windowId:1,stateId:5,items:Array(39).fill(null)})
  assert.equal(menus.snapshot().dataValues,null)
  for(const [property,value] of [100,200,50,200].entries()) packet(bot,'craft_progress_bar',{windowId:1,property,value})
  const menu=vanillaPlayerPresentation(bot,null,menus.snapshot()).nativeMenu
  assert.equal(nativeFurnaceProgress(menu,uuid).available,true)
  packet(bot,'set_slot',{windowId:1,stateId:6,slot:2,item:null})
  assert.equal(menus.snapshot().stateId,6)
  bot.currentWindow=null;assert.equal(menus.snapshot(),null);menus.close()
})

test('non-furnace data exposes only received bounded properties and clears reused windows',()=>{
  const bot=fixture('minecraft:anvil',39),menus=observeVanillaMenus(bot)
  packet(bot,'window_items',{windowId:1,stateId:5,items:Array(39).fill(null)})
  assert.deepEqual(menus.snapshot().properties,[])
  packet(bot,'craft_progress_bar',{windowId:1,property:0,value:7})
  packet(bot,'craft_progress_bar',{windowId:1,property:50,value:777})
  assert.deepEqual(vanillaPlayerPresentation(bot,null,menus.snapshot()).nativeMenu.properties,[{id:0,value:7}])
  packet(bot,'open_window',{windowId:1})
  packet(bot,'window_items',{windowId:1,stateId:0,items:Array(39).fill(null)})
  assert.deepEqual(menus.snapshot().properties,[]);menus.close()
})
test('real slot clicks keep window identity through SSE and shared visual-state normalization', () => {
  const bot=fixture(),frames=[],bridge=createNativeAgentVisualization(bot,{timers:false})
  bridge.subscribe(frame=>frames.push(frame))
  bot._client.write('window_click',{windowId:1,slot:9,mouseButton:0});bridge.flush()
  const state=new AgentVisualState();assert.equal(state.accept(frames.at(-1).value),true)
  const operation=state.snapshot().input.operations.at(-1)
  assert.equal(operation.slot,9);assert.equal(operation.windowId,1)
  bridge.dispose()
})
