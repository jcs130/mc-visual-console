import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { observeTwilightWindow } from '../../host/native-twilight-window.mjs'

function setup () {
  class Window extends EventEmitter {
    constructor (...args) { super(); this.args=args; this.id=args[0] }
  }
  const bot=new EventEmitter(),events=new EventEmitter()
  bot.inventory=new Window(0);bot.closeWindow=window=>{if(bot.currentWindow===window)bot.currentWindow=null}
  const stop=observeTwilightWindow(bot,{events})
  const send=(name,params={})=>events.emit('packet',{name,params})
  send('native_registries',{registries:{'minecraft:menu':[{id:30,name:'twilightforest:uncrafting'}]}})
  return {bot,events,stop,send}
}
test('original 56-slot window opens only after same-window projected contents, then releases pending listeners',()=>{
  const {bot,send,stop,events}=setup();let opens=0;bot.on('windowOpen',()=>opens++)
  send('open_window',{inventoryType:30,windowId:7,windowTitle:'original title'})
  const first=bot.currentWindow
  assert.deepEqual(first.args,[7,'twilightforest:uncrafting','original title',56,{start:20,end:55},1,true])
  assert.equal(opens,0);bot.emit('setWindowItems:8');assert.equal(opens,0)
  bot.emit('setWindowItems:7');assert.equal(opens,1)
  assert.equal(first.nativeLayout.ghostSlots.length,9)
  send('open_window',{inventoryType:30,windowId:8,windowTitle:'second'})
  assert.equal(bot.listenerCount('setWindowItems:8'),1)
  send('respawn');assert.equal(bot.listenerCount('setWindowItems:8'),0)
  stop();stop();assert.equal(events.listenerCount('packet'),0)
})
test('foreign menus and replacement inventory are never disposed as owned Twilight state',()=>{
  const {bot,send,stop}=setup();send('open_window',{inventoryType:30,windowId:2})
  send('open_window',{inventoryType:0,windowId:3})
  assert.equal(bot.listenerCount('setWindowItems:2'),0)
  const replacement={id:3};bot.currentWindow=replacement;stop()
  assert.equal(bot.currentWindow,replacement)
})
