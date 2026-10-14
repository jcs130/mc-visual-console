import { vanillaItemStack } from './vanilla-item-stack.mjs'
import { observeSentPackets } from './viewer-agent.mjs'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const finite=value=>typeof value==='number'&&Number.isFinite(value)
const point=value=>value&&['x','y','z'].every(key=>finite(value[key]))?Object.fromEntries(['x','y','z'].map(key=>[key,value[key]])):null
const text=(value,limit=160)=>{try{return String(value??'').replace(/§[0-9a-fk-or]/gi,'').slice(0,limit)}catch{return ''}}

// A wire Slot is not a predicted Mineflayer Window slot. Preserve its complete
// component patch; the original item renderer decides which visuals it knows.
export function vanillaWireItem(slot,registry) {
  if(!slot||slot.itemCount===0)return null
  const entry=registry?.items?.[slot.itemId]
  if(!entry||!Number.isSafeInteger(slot.itemCount)||slot.itemCount<1||!Array.isArray(slot.components))return null
  return vanillaItemStack({name:entry.name,count:slot.itemCount,displayName:entry.displayName,
    components:slot.components,removedComponents:slot.removeComponents??[]},registry).item
}

/** Read-only, bounded telemetry for the same action connection. Histories are
 * observations, never instructions, model reasoning or proof of goal success. */
export function observeVanillaActivity(bot,{now=Date.now,onChange=()=>{}}={}) {
  const client=bot._client,hooks=[],slots=new Map()
  let binding=null,closed=false,pending=false,inventoryReady=false,baseline=null,cursor=null,awaitingOwnSnapshot=false
  let events=[],items=[],sequence=0,merchant=null,dig=null,vitals=null,revision=0,recipeKey=null,recipes=[]
  const reset=()=>{slots.clear();inventoryReady=false;baseline=null;cursor=null;awaitingOwnSnapshot=false;events=[];items=[];merchant=null;dig=null;vitals=null;recipes=[];recipeKey=null;revision++}
  const identity=()=>{
    const uuid=client?.uuid?.toLowerCase(),id=bot.entity?.id
    if(bot.version!=='1.21.1'||!UUID.test(uuid??'')||!Number.isSafeInteger(id))return null
    const key=`${uuid}:${id}:${bot.game?.dimension??''}`
    if(key!==binding){reset();binding=key}
    return {playerUuid:uuid,entityId:id}
  }
  const emit=(kind,data={},source='same_player_mineflayer_event')=>{
    if(!identity())return
    events.push({id:++sequence,at:now(),kind,source,...data});events=events.slice(-48);changed()
  }
  const totals=()=>{
    const result=new Map()
    // Slot 0 is a recipe preview, not an owned output. Ingredients and cursor
    // remain owned while being moved through a crafting grid.
    for(const item of [...slots].filter(([slot])=>slot>0&&slot<=45).map(([,item])=>item).concat(cursor?[cursor]:[])) {
      if(!item?.snbt)continue
      const key=item.snbt.replace(/,count:\d+/,',count:1')
      const row=result.get(key)??{item:{...item,count:1},count:0};row.count+=item.count;result.set(key,row)
    }
    return result
  }
  const reconcile=()=>{
    // A workbench/merchant input is still owned while staged. Container slot
    // packets cannot establish its final disposition; retain the pre-operation
    // baseline until close plus an authoritative, complete window-0 snapshot.
    if(!inventoryReady||awaitingOwnSnapshot||bot.currentWindow?.id>0)return
    const current=totals()
    if(baseline) {
      const names=new Map()
      for(const [key,row] of current){const delta=row.count-(baseline.get(key)?.count??0);if(delta)names.set(key,{...row,delta})}
      for(const [key,row] of baseline)if(!current.has(key))names.set(key,{...row,delta:-row.count})
      const netByName=new Map()
      for(const row of names.values())netByName.set(row.item.name,(netByName.get(row.item.name)??0)+row.delta)
      // A durability/component change is not a fabricated item gain plus loss.
      for(const row of names.values())if(netByName.get(row.item.name)!==0)
        items.push({id:++sequence,at:now(),item:row.item,delta:row.delta,source:'server_inventory_reconciliation'})
      items=items.slice(-24)
    }
    baseline=current
  }
  function changed() {
    if(pending||closed)return
    pending=true;queueMicrotask(()=>{pending=false;if(closed)return;reconcile();revision++;onChange()})
  }
  const on=(target,name,fn)=>{target?.on?.(name,fn);hooks.push([target,name,fn])}
  const decode=wire=>vanillaWireItem(wire,bot.registry)
  const recordSlots=(value,full)=>{
    const win=bot.currentWindow
    if(value.windowId===0) {
      if(full&&value.items?.length===46){for(let n=0;n<46;n++)slots.set(n,decode(value.items[n]));inventoryReady=true;cursor=decode(value.carriedItem);if(!(win?.id>0))awaitingOwnSnapshot=false}
      else if(!full&&Number.isInteger(value.slot)&&value.slot>=0&&value.slot<=45)slots.set(value.slot,decode(value.item))
    } else if([-1,255].includes(value.windowId)&&!full)cursor=decode(value.item)
    else if(win&&value.windowId===win.id&&Number.isInteger(win.inventoryStart)&&win.inventoryEnd-win.inventoryStart===36) {
      const rows=full?value.items?.map((item,slot)=>({slot,item})):[value]
      for(const row of rows??[])if(row.slot>=win.inventoryStart&&row.slot<win.inventoryEnd)
        slots.set(9+row.slot-win.inventoryStart,decode(row.item))
      if(full)cursor=decode(value.carriedItem)
    }
    if([...slots.values(),cursor].some(item=>item&&!item.snbt)){inventoryReady=false;baseline=null}
    changed()
  }
  const packet=(value,meta)=>{
    if(closed||meta?.state!=='play'||!identity())return
    if(meta.name==='window_items')recordSlots(value,true)
    else if(meta.name==='set_slot')recordSlots(value,false)
    else if(meta.name==='trade_list') {
      const window=bot.currentWindow
      if(!window||window.id!==value.windowId||!['minecraft:merchant','minecraft:villager'].includes(window.type))return
      merchant={windowId:window.id,selected:null,offers:(value.trades??[]).slice(0,24).map((trade,index)=>{
        const input=decode(trade.inputItem1),output=decode(trade.outputItem),second=decode(trade.inputItem2)
        const price=input&&[trade.specialPrice,trade.demand,trade.priceMultiplier].every(finite)
          ?Math.min(bot.registry.items[trade.inputItem1.itemId]?.stackSize??64,Math.max(1,input.count+trade.specialPrice+Math.max(0,Math.floor(input.count*trade.demand*trade.priceMultiplier)))):input?.count??null
        return {index,input,second,output,price,uses:trade.nbTradeUses??null,maxUses:trade.maximumNbTradeUses??null,disabled:trade.tradeDisabled===true}
      })};emit('trade_offers',{count:merchant.offers.length,windowId:window.id},'server_merchant_offers')
    } else if(['open_window','close_window','respawn'].includes(meta.name)) {
      if(meta.name==='respawn'){reset();changed()}
      else {if(value.windowId>0)awaitingOwnSnapshot=true;if(meta.name==='open_window'||merchant?.windowId===value.windowId)merchant=null;emit(meta.name,{windowId:value.windowId})}
    }
  }
  on(client,'packet',packet)
  const stopSent=observeSentPackets(client,(name,data)=>{
    if(!data||client.state!=='play'||!identity())return
    if(name==='window_click'){if(data.windowId>0)awaitingOwnSnapshot=true;emit('slot_click',{windowId:data.windowId,slot:data.slot,button:data.mouseButton,mode:data.mode},'sent_packet')}
    else if(name==='close_window'&&data.windowId>0){awaitingOwnSnapshot=true;changed()}
    else if(name==='select_trade'&&merchant){merchant.selected=Number.isInteger(data.slot)?data.slot:null;emit('trade_selected',{index:merchant.selected},'sent_packet')}
    else if(name==='block_dig'&&[0,1,2].includes(data.status)) {
      const location=point(data.location)
      if(data.status===0) {
        let durationMs=null,block=null
        try{block=bot.blockAt?.(data.location);const time=bot.digTime?.(block);if(finite(time)&&time>=0)durationMs=time}catch{}
        dig={position:location,name:text(block?.name),startedAt:now(),durationMs}
      } else dig=null
      emit(['dig_started','dig_cancel_sent','dig_finish_sent'][data.status],{position:location},'sent_packet')
    } else if(['block_place','use_item'].includes(name))emit('use',{position:point(data.location),hand:data.hand??null},'sent_packet')
    else if(name==='use_entity')emit(data.mouse===1?'attack':'interact',{entityId:data.target},'sent_packet')
    // Deliberately no chat, slash commands, sign/book contents or arbitrary NBT.
  })
  on(bot,'health',()=>{
    if(!identity())return
    const current={health:finite(bot.health)?bot.health:null,food:finite(bot.food)?bot.food:null,saturation:finite(bot.foodSaturation)?bot.foodSaturation:null}
    if(vitals)for(const key of ['health','food'])if(current[key]!==null&&vitals[key]!==null&&current[key]!==vitals[key])emit(key,{value:current[key],delta:current[key]-vitals[key]})
    vitals=current;changed()
  })
  for(const [event,kind] of [['diggingCompleted','dig_completed'],['diggingAborted','dig_aborted']])on(bot,event,block=>{dig=null;emit(kind,{name:text(block?.name),position:point(block?.position)})})
  on(bot,'blockUpdate',(old,block)=>{
    const at=point(block?.position),own=point(bot.entity?.position)
    // Loaded chunks also deliver distant grass growth, amethyst and leaf
    // distance updates. Keep the operation history about the player's vicinity;
    // the actual world renderer still receives every native block packet.
    if(old&&block&&old.name!==block.name&&old.stateId!==block.stateId&&at&&own&&Math.hypot(...['x','y','z'].map(k=>at[k]-own[k]))<=8)
      emit('block_changed',{from:text(old.name),to:text(block.name),position:at},'server_block_update')
  })
  on(bot,'path_update',value=>{if(['noPath','timeout'].includes(value?.status))emit('path_blocked',{reason:value.status,position:point(bot.entity?.position)})})
  on(bot,'path_reset',reason=>emit('path_reset',{reason:text(reason),position:point(bot.entity?.position)}))
  on(bot,'goal_reached',()=>emit('path_reached',{position:point(bot.entity?.position)}))
  on(bot,'death',()=>emit('death'))
  on(bot,'entityHurt',entity=>{
    const at=point(entity?.position),own=point(bot.entity?.position)
    if(entity?.id===bot.entity?.id || at&&own&&Math.hypot(...['x','y','z'].map(k=>at[k]-own[k]))<=12)
      emit('entity_hurt',{entityId:entity?.id,name:text(entity?.name),position:at})
  })
  for(const name of ['respawn','end'])on(bot,name,()=>{reset();binding=null;changed()})
  // Mineflayer can emit initial spawn AFTER the authoritative window-0 sync.
  // Identity() already resets a changed entity; do not discard the same body's
  // received inventory and invent a fresh baseline after its first craft.
  on(bot,'spawn',()=>{identity();changed()})
  for(const name of ['windowOpen','windowClose'])on(bot,name,window=>{if(window?.id>0)awaitingOwnSnapshot=true;changed()})
  for(const name of ['scoreUpdated','scoreRemoved','scoreboardPosition','scoreboardTitleChanged','playerJoined','playerLeft'])on(bot,name,()=>changed())
  function recipePreview() {
    if(!inventoryReady||awaitingOwnSnapshot||bot.currentWindow?.id>0)return []
    const counts=new Map();for(const row of totals().values())counts.set(row.item.name,(counts.get(row.item.name)??0)+row.count)
    const table=bot.currentWindow?.type==='minecraft:crafting',key=JSON.stringify([[...counts],table])
    if(key===recipeKey)return recipes
    recipeKey=key;const best=new Map()
    for(const variants of Object.values(bot.registry?.recipes??{}).slice(0,4096))for(const recipe of variants.slice(0,32)) {
      const source=recipe.ingredients??recipe.inShape?.flat(),needs=new Map()
      for(const ingredient of source??[]) {const id=typeof ingredient==='number'?ingredient:ingredient?.id;if(Number.isSafeInteger(id)&&id>=0)needs.set(id,(needs.get(id)??0)+1)}
      const output=bot.registry?.items?.[recipe.result?.id];if(!output||!needs.size)continue
      let matched=0,total=0;const missing=[]
      for(const [id,count]of needs){const item=bot.registry.items[id];if(!item){matched=0;break};const have=counts.get(`minecraft:${item.name}`)??0;matched+=Math.min(count,have);total+=count;if(have<count)missing.push({name:`minecraft:${item.name}`,count:count-have})}
      if(!matched)continue
      const requiresTable=recipe.inShape?recipe.inShape.length>2||recipe.inShape.some(row=>row.length>2):(source?.length??0)>4
      const row={output:{name:`minecraft:${output.name}`,count:recipe.result.count},missing,requiresTable,tableOpen:table,
        craftable:missing.length===0&&(!requiresTable||table),matched,total,source:'vanilla_recipe_catalog'}
      const old=best.get(row.output.name);if(!old||row.matched/row.total>old.matched/old.total)best.set(row.output.name,row)
    }
    recipes=[...best.values()].sort((a,b)=>Number(b.craftable)-Number(a.craftable)||b.matched/b.total-a.matched/a.total).slice(0,12);return recipes
  }
  return {
    snapshot() {
      const own=identity();if(!own||closed)return null
      const board=bot.scoreboard?.sidebar
      const result={schemaVersion:1,...own,revision,sampledAt:now(),events:[...events],items:[...items],inventoryReady,inventoryReconciling:awaitingOwnSnapshot||bot.currentWindow?.id>0,
        dig:dig?{...dig,elapsedMs:Math.max(0,now()-dig.startedAt)}:null,merchant:merchant&&bot.currentWindow?.id===merchant.windowId?{...merchant,offers:[...merchant.offers]}:null,
        recipes:recipePreview(),server:{sidebar:board?{title:text(board.title),rows:(board.items??[]).slice(0,15).map(row=>({text:text(row.displayName??row.name),value:finite(row.value)?row.value:null}))}:null,
          players:Object.values(bot.players??{}).slice(0,40).map(player=>({name:text(player.username,32),ping:finite(player.ping)?player.ping:null})),
          time:finite(bot.time?.timeOfDay)?bot.time.timeOfDay:null,raining:typeof bot.isRaining==='boolean'?bot.isRaining:null},
        entities:Object.values(bot.entities??{}).filter(e=>e.id!==bot.entity?.id&&point(e.position)).slice(0,32).map(e=>({id:e.id,name:text(e.name??e.username),position:point(e.position),distance:point(bot.entity?.position)?Math.hypot(...['x','y','z'].map(k=>e.position[k]-bot.entity.position[k])):null}))}
      while(Buffer.byteLength(JSON.stringify(result))>49152&&(result.items.length||result.events.length||result.recipes.length||result.merchant?.offers.length)) {
        if(result.items.length)result.items.shift();else if(result.events.length)result.events.shift();else if(result.recipes.length)result.recipes.pop();else result.merchant.offers.pop()
        result.truncated=true
      }
      return result
    },
    close(){closed=true;stopSent();for(const [target,name,fn]of hooks)target?.off?.(name,fn);reset()}
  }
}
