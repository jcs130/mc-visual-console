// Presentation aliases never change wire IDs, components, counts or item.name.
// Pair an authoritative native window with the matching projected stateId.
export const NATIVE_ITEM_IDENTITY=Symbol.for('mcviewer.native_item.v1');
export function nativeItemIdentity(item){return item?.[NATIVE_ITEM_IDENTITY]??null;}
export function observeNativeItemAliases(bot,stream){
  const tagged=new Set();let disposed=false;
  const clear=()=>{for(const item of tagged)delete item[NATIVE_ITEM_IDENTITY];tagged.clear();};
  const front=packet=>{
    // Cursor updates do not replace any inventory slot. Unknown negative
    // windows must not be mistaken for a player's current container either.
    if(packet.windowId<0&&packet.windowId!==-2)return;
    clear();
    queueMicrotask(()=>{
      if(disposed||!stream.health().available)return;
      const value=stream.inventory(),window=packet.windowId===0||packet.windowId===-2?bot.inventory:bot.currentWindow;
      const original=packet.windowId===0||packet.windowId===-2?value.inventory:value.menu;
      if(!window||!original||original.stateId!==packet.stateId||!Array.isArray(window.slots))return;
      for(const row of original.slots){
        const item=window.slots[row.slot];if(!item||!row.item||item.count!==row.item.count)continue;
        const identity=Object.freeze({name:row.item.name,nativeId:row.item.nativeId,count:item.count,playerUuid:value.playerUuid,
          registrySha256:stream.health().registrySha256,source:'same_connection_original_before_projection'});
        Object.defineProperty(item,NATIVE_ITEM_IDENTITY,{value:identity,configurable:true});tagged.add(item);
      }
    });
  };
  const native=body=>{if(['login','respawn','open_window','close_window'].includes(body.name))clear();};
  bot._client.on('window_items',front);bot._client.on('set_slot',front);stream.events.on('unavailable',clear);
  stream.events.on('packet',native);
  return ()=>{disposed=true;clear();bot._client.off('window_items',front);bot._client.off('set_slot',front);stream.events.off('unavailable',clear);stream.events.off('packet',native);};
}
