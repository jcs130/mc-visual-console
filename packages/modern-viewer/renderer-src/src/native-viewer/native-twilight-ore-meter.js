import {nativeNumericValue,nativeLongValue,parseNativeItemStack} from './native-item-stack.js'
import {nativeItemComponentState,STATIC_ITEM_SOURCES} from './native-static-item-providers.js'
import {resolveNativeBlockItemModel} from './native-block-item-icons.js'

const PREFIX='twilightforest:',ID=PREFIX+'ore_meter'
const COMPONENTS=new Set(['ore_loading','ore_range','ore_data','ore_scanner','ore_filter'].map(k=>PREFIX+k))
const record=v=>v&&typeof v==='object'&&!Array.isArray(v)
export const nativeTwilightOreMeterEligible=id=>id===ID
export function verifyTwilightItemSource(reader){
  const expected=STATIC_ITEM_SOURCES.twilightforest,rows=reader.manifest.sources?.filter(s=>s.name===expected.name||s.sha256===expected.sha256)
  if(rows?.length!==1||rows[0].sha256!==expected.sha256||rows[0].explicitOverride)throw Error('NATIVE_TWILIGHT_ITEM_SOURCE_UNVERIFIED')
}
export function twilightItemComponentState(stack,allowed){
  const components={}
  for(const [key,value]of Object.entries(stack.components)){
    const name=key.replace(/^!/,'')
    if(!allowed.has(name)){components[key]=value;continue}
    if(key.startsWith('!')&&(!record(value)||Object.keys(value).length||Object.hasOwn(stack.components,name)))throw Error('NATIVE_ITEM_COMPONENT_PATCH_INVALID')
  }
  return nativeItemComponentState({...stack,components},{allowPartialGlint:true})
}
const int=(v,fallback)=>{
  const n=v===undefined?fallback:nativeNumericValue(v)
  if(!Number.isInteger(n)||n<0||n>2147483647)throw Error('NATIVE_TWILIGHT_ORE_COMPONENT_INVALID')
  return n
}

// Pinned OreMeterItem/OverlayHandler/ItemProperties rules. Counts are block
// DESCRIPTION KEYS, not item IDs. The server supplies a chunk and totals only;
// no per-ore coordinates, locations in unloaded chunks or invented scan data.
export function nativeTwilightOreMeterState(stack,{random=Math.random}={}){
  if(!nativeTwilightOreMeterEligible(stack?.id))throw Error('NATIVE_TWILIGHT_ORE_ITEM_UNSUPPORTED')
  const {foil}=twilightItemComponentState(stack,COMPONENTS),c=stack.components,range=int(c[PREFIX+'ore_range'],1)
  const loading=Object.hasOwn(c,PREFIX+'ore_loading'),progress=loading?int(c[PREFIX+'ore_loading']):null,totalLoadTime=50+range*25
  let scan=null
  if(Object.hasOwn(c,PREFIX+'ore_data')){
    const d=c[PREFIX+'ore_data'],chunk=record(d)?nativeLongValue(d.scanned_chunk):null,uid=record(d)?nativeLongValue(d.universal_id):null
    if(!record(d)||!record(d.counts)||chunk===null||uid===null||Object.keys(d).some(k=>!['counts','scanned_chunk','scanned_block_count','universal_id'].includes(k))||Object.keys(d.counts).length>4096)throw Error('NATIVE_TWILIGHT_ORE_COMPONENT_INVALID')
    const total=int(d.scanned_block_count),x=Number(BigInt.asIntN(32,chunk)),z=Number(BigInt.asIntN(32,chunk>>32n))
    const counts=Object.entries(d.counts).map(([key,count])=>{
      if(!key.length||key.length>32767)throw Error('NATIVE_TWILIGHT_ORE_COMPONENT_INVALID')
      return {translationKey:key,count:int(count),percentage:total?Math.fround(Math.fround(Math.fround(int(count))*100)/Math.fround(total)):null}
    }).sort((a,b)=>a.count-b.count)
    scan={identifier:uid.toString(),chunk:{x,z},totalScannedBlocks:total,counts,
      blockBounds:{minX:(x-range)*16,maxX:(x+range)*16+15,minZ:(z-range)*16,maxZ:(z+range)*16+15},
      individualOrePositionsAvailable:false}
  }
  // Java's callback chooses a threshold of 2 or 3. Callers cache one sample
  // per received loading-progress update, not per draw or inferred wall clock.
  const active=loading?progress%5>=2+Math.floor(random()*2)&&progress<=totalLoadTime-15:Object.hasOwn(c,PREFIX+'ore_data')
  return {range,loading,progress,totalLoadTime,dots:loading?(Math.floor(progress/5)%3)+1:0,scan,active:!!active,foil,variant:active?'active':'idle'}
}
export async function prepareNativeTwilightOreMeter(reader,stack,state=nativeTwilightOreMeterState(stack)){
  verifyTwilightItemSource(reader)
  const model=await resolveNativeBlockItemModel(reader,ID.replace(':',':item/'),[],{properties:{'twilightforest:active':state.active?1:0}})
  return {model,state,sourcePaths:model.sourcePaths}
}
export function heldTwilightOreMeter(view){
  const inventory=view?.available?view.inventory:null
  if(!inventory||inventory.playerUuid?.toLowerCase()!==view.playerUuid?.toLowerCase())return null
  const selected=inventory.selectedHotbarSlot,slots=new Map(inventory.slots?.map(s=>[s.slot,s.item]))
  const main=Number.isInteger(selected)&&selected>=0&&selected<9?slots.get(inventory.hotbarStart+selected):null
  const item=main?.name===ID?main:slots.get(inventory.offhandSlot)
  return item?.name===ID?nativeTwilightOreMeterState(parseNativeItemStack(item),{random:()=>0}):null
}

export function twilightOreMeterLines(state,translate){
  const tr=(key,args=[])=>translate(key,args.map(String))??key
  if(state?.loading)return [tr('misc.twilightforest.ore_meter_loading')+'.'.repeat(state.dots)]
  const scan=state?.scan;if(!scan||scan.identifier==='0')return []
  return [tr('misc.twilightforest.ore_meter_range',[state.range,scan.chunk.x,scan.chunk.z]),
    tr('misc.twilightforest.ore_meter_total',[scan.totalScannedBlocks]),
    ...scan.counts.map(row=>`${tr(row.translationKey)} ${tr('misc.twilightforest.ore_meter_separator')} ${row.count} ${tr('misc.twilightforest.ore_meter_ratio',[twilightOreRatioText(row.percentage)])}`)]
}
// DecimalFormat("0.000") defaults to HALF_EVEN. JS toFixed uses a different
// tie rule (e.g. the exact float32 value .0625 must display .062, not .063).
export function twilightOreRatioText(value){
  if(value===null)return 'NaN'
  const scaled=value*1000,low=Math.floor(scaled),fraction=scaled-low
  const rounded=fraction===.5?(low%2?low+1:low):Math.round(scaled)
  return Math.floor(rounded/1000)+'.'+String(rounded%1000).padStart(3,'0')
}
