// All original 1.21.1 EntityRenderers registrations using ThrownItemRenderer
// (gmv). Missing DATA_ITEM_STACK retains the verified constructor default;
// an explicitly received empty Slot is never replaced by that default.
export const NATIVE_THROWN_ITEM_DEFINITIONS=Object.freeze(Object.fromEntries([
  ['egg','egg',1,false],['ender_pearl','ender_pearl',1,false],['experience_bottle','experience_bottle',1,false],
  ['potion','splash_potion',1,false],['snowball','snowball',1,false],['eye_of_ender','ender_eye',1,true],
  ['fireball','fire_charge',3,true],['small_fireball','fire_charge',.75,true]
].map(([entity,item,scale,fullBright])=>['minecraft:'+entity,Object.freeze({item:'minecraft:'+item,scale,fullBright})])))
export const NATIVE_THROWN_ITEM_TYPES=Object.freeze(Object.keys(NATIVE_THROWN_ITEM_DEFINITIONS))
export const nativeThrownItemType=name=>Object.hasOwn(NATIVE_THROWN_ITEM_DEFINITIONS,name??'')
export function nativeThrownItemState(entity,resolveItemStack){
  const definition=NATIVE_THROWN_ITEM_DEFINITIONS[entity.name]
  if(!definition)throw Error('NATIVE_THROWN_ITEM_TYPE_UNSUPPORTED')
  const row=entity.metadata instanceof Map?entity.metadata.get(8):entity.metadata?.find(value=>value.key===8)
  if(!row)return {available:true,empty:false,source:'original_1.21.1_entity_constructor',minecraftVersion:'1.21.1',
    item:{name:definition.item,count:1,snbt:`{id:"${definition.item}",count:1}`}}
  if(!['item_stack',7].includes(row.type)||!row.value||!Number.isInteger(row.value.itemCount)||row.value.itemCount<0)return {available:false,reason:'NATIVE_THROWN_ITEM_SLOT_INVALID'}
  if(row.value.itemCount===0)return {available:true,empty:true,source:'received_native_empty_slot',minecraftVersion:'1.21.1',item:null}
  if(typeof resolveItemStack!=='function')return {available:false,reason:'NATIVE_THROWN_ITEM_REGISTRY_UNAVAILABLE'}
  try {return {...resolveItemStack(row.value),empty:false}}catch{return {available:false,reason:'NATIVE_THROWN_ITEM_COMPONENTS_UNAVAILABLE'}}
}
