import {nativeNumericValue} from './native-item-stack.js'
import {resourcePath} from './model-loader.js'
import {resolveNativeBlockItemModel} from './native-block-item-icons.js'
import {verifyTwilightItemSource,twilightItemComponentState} from './native-twilight-ore-meter.js'

const PREFIX='twilightforest:',RESOURCE=/^[a-z0-9_.-]+:[a-z0-9_./-]+$/
const DEFAULTS=Object.freeze({goggles:{durability:132,components:['travellers_armor','zoom_ability_modifier']},
  vest:{durability:192,components:['travellers_armor','has_travellers_chestplate','swift_swim']},
  wings:{durability:180,components:['travellers_armor','has_travellers_wings','high_jump_amplifier']},
  boots:{durability:156,components:['travellers_armor','has_travellers_boots','high_step']},
  gloves:{durability:0,components:['travellers_armor','has_travellers_gloves']},
  belt:{durability:0,components:['travellers_armor','has_travellers_belt','swap_hotbar_ability']}})
const COMPONENTS=new Set(('travellers_armor has_travellers_chestplate has_travellers_gloves has_travellers_belt has_travellers_wings has_travellers_boots red_thread_vision stealth_crouching arrow_magnetism swap_hotbar_ability swap_hotbar_modifier double_jump water_walk all_night_goggles unrestrained swift_swim high_step aquatic_agility auto_repair_probability zoom_ability_modifier efficient_eater perfect_dodge_probability gradually_gliding_multiplier agile_ranger_modifier slimy_soles_coefficient haste_amplifier high_jump_amplifier straight_ahead_multiplier sidestep_cooldown stored_broken_attributes item_display').split(' ').map(k=>PREFIX+k))
const record=v=>v&&typeof v==='object'&&!Array.isArray(v)
export const nativeTwilightTravellerEligible=id=>Object.hasOwn(DEFAULTS,id?.replace(/^twilightforest:travellers_/,''))&&id.startsWith(PREFIX+'travellers_')

// Preserve actual server registry order and datapack component predicates.
// Descriptions/attribute magnitudes do not affect this item-model selection;
// retain their full originals in the host presentation, not in an icon key.
export function twilightTravellerContext(view){
  const raw=view?.twilightTravellerRegistry
  if(!raw?.available||raw.source!=='same_connection_configuration_registry_data'||raw.playerUuid?.toLowerCase()!==view?.playerUuid?.toLowerCase()||!Array.isArray(raw.entries)||raw.entries.length>64)return null
  const entries=raw.entries.map(({id,key,value:v})=>{
    let components=[],ability=false
    if(v?.type===PREFIX+'component'&&record(v.component))components=Object.keys(v.component)
    else if(v?.type===PREFIX+'attribute'&&typeof v.component==='string'){components=[v.component];ability=v.builtin_modifier===true||v.builtin_modifier===1}
    else if(v?.type===PREFIX+'transferable_component'&&typeof v.component==='string'&&record(v.transferable_components))components=[v.component,...Object.keys(v.transferable_components)]
    else if(v?.type===PREFIX+'builtin')ability=true
    else throw Error('NATIVE_TWILIGHT_TRAVELLER_PREDICATE_UNSUPPORTED')
    if(!ability&&(!components.length||components.some(c=>!RESOURCE.test(c))))throw Error('NATIVE_TWILIGHT_TRAVELLER_PREDICATE_INVALID')
    return {id,key,components,ability}
  })
  return {playerUuid:view.playerUuid,twilightTravellerRegistry:{available:true,registry:raw.registry,source:raw.source,
    sha256:raw.sha256,playerUuid:raw.playerUuid,entries}}
}
function integer(value,fallback){
  const n=value===undefined?fallback:nativeNumericValue(value)
  if(!Number.isInteger(n)||n<0||n>2147483647)throw Error('NATIVE_TWILIGHT_TRAVELLER_DAMAGE_INVALID')
  return n
}
export function nativeTwilightTravellerState(stack,observed){
  if(!nativeTwilightTravellerEligible(stack?.id))throw Error('NATIVE_TWILIGHT_TRAVELLER_ITEM_UNSUPPORTED')
  // A component-only container is relevant to the hotbar-swap modifier and
  // remains full SNBT. It is not a replacement icon or a different inventory.
  const allowed=new Set([...COMPONENTS,'minecraft:container'])
  const {foil}=twilightItemComponentState(stack,allowed),leaf=stack.id.slice((PREFIX+'travellers_').length),defaults=DEFAULTS[leaf],c=stack.components
  const present=name=>!Object.hasOwn(c,'!'+name)&&(Object.hasOwn(c,name)||defaults.components.some(k=>PREFIX+k===name))
  const max=Object.hasOwn(c,'!minecraft:max_damage')?0:integer(c['minecraft:max_damage'],defaults.durability)
  const damage=Object.hasOwn(c,'!minecraft:damage')?0:integer(c['minecraft:damage'],0)
  const damageable=max>0&&(defaults.durability>0||Object.hasOwn(c,'minecraft:damage'))&&!Object.hasOwn(c,'!minecraft:damage')&&!Object.hasOwn(c,'minecraft:unbreakable')
  const broken=present(PREFIX+'travellers_armor')&&damageable&&max-1<=damage,gloves=present(PREFIX+'has_travellers_gloves')
  // Gloves/belt are ordinary generated models: no modifier overlays or broken
  // icon in their original JSON. Their actual gameplay components stay intact.
  if(['gloves','belt'].includes(leaf))return {leaf,broken,gloves,modifiers:[],foil,variant:leaf,registrySha256:null}
  const registry=observed?.twilightTravellerRegistry
  if(!observed?.playerUuid||registry?.playerUuid?.toLowerCase()!==observed.playerUuid.toLowerCase()||registry?.source!=='same_connection_configuration_registry_data'||registry?.available!==true||!/^[a-f0-9]{64}$/.test(registry.sha256??'')||!Array.isArray(registry.entries)||registry.entries.length>64)throw Error('NATIVE_TWILIGHT_TRAVELLER_REGISTRY_UNAVAILABLE')
  const seen=new Set(),modifiers=[]
  registry.entries.forEach((entry,i)=>{
    if(entry?.id!==i||!RESOURCE.test(entry.key??'')||seen.has(entry.key)||typeof entry.ability!=='boolean'||!Array.isArray(entry.components)||entry.components.some(k=>!RESOURCE.test(k)))throw Error('NATIVE_TWILIGHT_TRAVELLER_REGISTRY_INVALID')
    seen.add(entry.key)
    if(!entry.ability&&entry.components.length&&entry.components.every(present))modifiers.push(entry.key)
  })
  if(modifiers.length>24)throw Error('NATIVE_TWILIGHT_TRAVELLER_LAYER_LIMIT')
  return {leaf,broken,gloves,modifiers,foil,registrySha256:registry.sha256,variant:JSON.stringify([registry.sha256,broken,gloves,modifiers])}
}

// Original TravellersGearItemModel / Overrides SHA256 9516f982e4751ca20c8f454e888e1d6da83a40a4c0e7aedb1dacebb1298ddd37 /
// a096091f31d9d551eb2248528a9b697f478cc557a03e4b4ecbc2911fbb94153f.
// Each present sprite grows by Java float32 0.001 around the model centre.
export async function prepareNativeTwilightTraveller(reader,stack,observed){
  verifyTwilightItemSource(reader)
  const state=nativeTwilightTravellerState(stack,observed),id=stack.id.replace(':',':item/'),path=resourcePath(id,'models','.json')
  if(['gloves','belt'].includes(state.leaf))return {state,model:await resolveNativeBlockItemModel(reader,id),sourcePaths:[path]}
  const own=await reader.json(path)
  if(!record(own)||own.loader!==PREFIX+'travellers_gear'||own.parent!=='neoforge:item/default'||own.overrides?.length||own.elements?.length||!record(own.textures)||!RESOURCE.test(own.textures.base)||typeof own.modifier_directory!=='string'||typeof own.broken_modifier_directory!=='string'||!/^[a-z0-9_/-]+\/$/.test(own.modifier_directory)||!/^[a-z0-9_/-]+\/$/.test(own.broken_modifier_directory))throw Error('NATIVE_TWILIGHT_TRAVELLER_MODEL_UNSUPPORTED')
  const parent=await resolveNativeBlockItemModel(reader,own.parent),directory=state.broken?own.broken_modifier_directory:own.modifier_directory
  const textures={layer0:state.broken?(own.textures.broken??own.textures.base):own.textures.base},scales=[1],skipped=[]
  const overlay=texture=>{
    const png=resourcePath(texture,'textures','.png')
    if(!reader.manifest.assets[png]){skipped.push(png);return}
    const i=scales.length;textures['layer'+i]=texture;scales.push(Math.fround(1+Math.fround(i*Math.fround(.001))))
  }
  for(const modifier of state.modifiers){const [namespace,leaf]=modifier.split(':');overlay(`${namespace}:item/${directory}${leaf}`)}
  if(state.gloves)overlay(PREFIX+'item/'+directory+'gloves')
  return {state,sourcePaths:[...parent.sourcePaths,path],skippedMissingSprites:skipped,
    model:{...parent,nativeGenerated:true,elements:[],gui_light:'front',textures,sourcePaths:[...parent.sourcePaths,path],
      twilightTravellerLayerScales:scales}}
}
