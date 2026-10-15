import {nativeNumericValue} from './native-item-stack.js'

export const ORIGINAL_ITEM_COLORS_PATH='assets/minecraft/native/client-item-colors.json'
export const ORIGINAL_ITEM_COLORS_SHA256='21c83de83b6f57d38f93c0881edaa98a2d2c06ec8c14eceb260a79c380f9e936'
const CLIENT='499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'
const POTIONS=new Set(['minecraft:potion','minecraft:splash_potion','minecraft:lingering_potion','minecraft:tipped_arrow'])
const NON_VISUAL=new Set(['minecraft:custom_name','minecraft:item_name','minecraft:lore','minecraft:rarity','minecraft:damage',
  'minecraft:max_damage','minecraft:max_stack_size','minecraft:unbreakable','minecraft:repair_cost','minecraft:hide_tooltip',
  'minecraft:hide_additional_tooltip','minecraft:food','minecraft:fire_resistant','minecraft:attribute_modifiers','minecraft:can_break','minecraft:can_place_on'])
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const caches=new WeakMap()
const int=(value,min,max)=>{const n=nativeNumericValue(value);if(!Number.isInteger(n)||n<min||n>max)throw Error('NATIVE_POTION_COMPONENT_INVALID');return n}
const bool=value=>{const n=nativeNumericValue(value);if(value===true||n===1)return true;if(value===false||n===0)return false;throw Error('NATIVE_POTION_COMPONENT_INVALID')}
export const nativePotionItemEligible=name=>POTIONS.has(name)

export async function loadOriginalItemColors(reader){
  if(reader.manifest?.clientJarSha256!==CLIENT||reader.manifest?.minecraftVersion!=='1.21.1'||reader.manifest?.assetIntegrityVerified!==true||
    reader.manifest.assets?.[ORIGINAL_ITEM_COLORS_PATH]?.sha256!==ORIGINAL_ITEM_COLORS_SHA256)throw Error('NATIVE_ITEM_COLORS_SOURCE_UNVERIFIED')
  if(!caches.has(reader))caches.set(reader,(async()=>{
    const data=await reader.json(ORIGINAL_ITEM_COLORS_PATH)
    if(data.source!=='original_BuiltInRegistries_and_PotionContents_getColor'||data.clientJarSha256!==CLIENT||
      data.effects?.length!==39||data.potions?.length!==46||data.items?.length!==1333||data.emptyPotionColor!==-13083194)throw Error('NATIVE_ITEM_COLORS_TABLE_INVALID')
    for(const rows of [data.effects,data.potions,data.items])if(new Set(rows.map(r=>r.name)).size!==rows.length||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('NATIVE_ITEM_COLORS_TABLE_INVALID')
    return data
  })())
  return caches.get(reader)
}

// PotionContents.getColor/getColorOptional and ItemColors' potion callback.
// An explicit custom color includes signed int32 0 and -1. Visibility and
// amplifier+1 weights, including Java int arithmetic, are not approximate RGB.
export function nativePotionColor(component,data){
  if(component===undefined)return data.emptyPotionColor>>>0
  if(!record(component)||Object.keys(component).some(k=>!['potion','custom_color','custom_effects'].includes(k)))throw Error('NATIVE_POTION_COMPONENT_INVALID')
  if(Object.hasOwn(component,'custom_color'))return (int(component.custom_color,-2147483648,2147483647)|0xff000000)>>>0
  let effects=[]
  if(Object.hasOwn(component,'potion')){
    const base=data.potions.find(row=>row.name===component.potion)
    if(!base)throw Error('NATIVE_POTION_REGISTRY_UNAVAILABLE')
    effects=[...base.effects]
  }
  const custom=component.custom_effects??[]
  if(!Array.isArray(custom)||custom.length>256)throw Error('NATIVE_POTION_COMPONENT_INVALID')
  for(const row of custom){
    if(!record(row)||Object.keys(row).some(k=>!['id','amplifier','duration','ambient','show_particles','show_icon','hidden_effect'].includes(k)))throw Error('NATIVE_POTION_COMPONENT_INVALID')
    effects.push({id:row.id,amplifier:row.amplifier===undefined?0:int(row.amplifier,0,255),showParticles:row.show_particles===undefined?true:bool(row.show_particles)})
  }
  let r=0,g=0,b=0,total=0
  for(const row of effects){
    const color=data.effects.find(e=>e.name===row.id)?.color
    if(!Number.isInteger(color))throw Error('NATIVE_POTION_EFFECT_REGISTRY_UNAVAILABLE')
    if(!row.showParticles)continue
    const weight=row.amplifier+1
    total=(total+weight)|0;r=(r+Math.imul((color>>>16)&255,weight))|0;g=(g+Math.imul((color>>>8)&255,weight))|0;b=(b+Math.imul(color&255,weight))|0
  }
  return total===0?data.emptyPotionColor>>>0:(0xff000000|(Math.trunc(r/total)<<16)|(Math.trunc(g/total)<<8)|Math.trunc(b/total))>>>0
}

export async function prepareNativePotionItem(reader,stack){
  if(!nativePotionItemEligible(stack?.id)||!record(stack.components)||!Number.isSafeInteger(stack.count)||stack.count<1)throw Error('NATIVE_POTION_ITEM_INVALID')
  for(const [key,value] of Object.entries(stack.components)){
    const name=key.startsWith('!')?key.slice(1):key
    if(key.startsWith('!')){
      if(!record(value)||Object.keys(value).length||Object.hasOwn(stack.components,name))throw Error('NATIVE_POTION_COMPONENT_INVALID')
    }
    if(NON_VISUAL.has(name)||name==='minecraft:potion_contents')continue
    if(name==='minecraft:enchantment_glint_override'&&(key.startsWith('!')||!bool(value)))continue
    // The original glint pass is separate; do not disguise it as a flat PNG.
    throw Error('NATIVE_POTION_ITEM_VISUAL_COMPONENT_UNSUPPORTED:'+key)
  }
  const data=await loadOriginalItemColors(reader)
  return {color:nativePotionColor(stack.components['minecraft:potion_contents'],data),sourcePaths:[ORIGINAL_ITEM_COLORS_PATH]}
}
