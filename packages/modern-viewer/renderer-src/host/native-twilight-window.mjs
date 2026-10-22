// No synthetic chest/open-screen packet: construct the exact original 56-slot
// window before Mineflayer receives the projected contents of that SAME menu.
// Existing Mineflayer click/transfer/state-ID logic remains in charge.
export function observeTwilightWindow(bot,stream){
  let menuTypes=new Map(),owned=null,pending=null,disposed=false
  const clearPending=()=>{if(pending){bot.off(pending.event,pending.listener);pending=null}}
  const receive=body=>{
    if(disposed)return
    if(body.name==='native_registries')menuTypes=new Map((body.params.registries['minecraft:menu']??[]).map(row=>[row.id,row.name]))
    if(['respawn','login','close_window'].includes(body.name)){clearPending();owned=null;return}
    if(body.name!=='open_window')return
    clearPending();owned=null
    const packet=body.params
    if(menuTypes.get(packet.inventoryType)!=='twilightforest:uncrafting')return
    if(!Number.isInteger(packet.windowId)||packet.windowId<1||packet.windowId>255)throw Error('NATIVE_TWILIGHT_WINDOW_ID_INVALID')
    const Window=bot.inventory?.constructor
    if(typeof Window!=='function'||Window===Object)throw Error('NATIVE_TWILIGHT_INVENTORY_CLASS_UNAVAILABLE')
    const window=new Window(packet.windowId,'twilightforest:uncrafting',packet.windowTitle,56,{start:20,end:55},1,true)
    window.nativeLayout={source:'original_Twilight_UncraftingMenu_1.21.1',ghostSlots:[2,3,4,5,6,7,8,9,10],assemblySlots:[11,12,13,14,15,16,17,18,19],inputSlot:0,resultSlot:1}
    window.close=()=>{bot.closeWindow(window);window.emit('close')}
    owned=window;bot.currentWindow=window
    const event=`setWindowItems:${window.id}`,listener=()=>{pending=null;if(!disposed&&owned===window&&bot.currentWindow===window)bot.emit('windowOpen',window)}
    pending={event,listener};bot.once(event,listener)
  }
  stream.events.on('packet',receive)
  return ()=>{if(disposed)return;disposed=true;clearPending();stream.events.off('packet',receive);if(bot.currentWindow===owned)bot.currentWindow=null;owned=null;menuTypes.clear()}
}
