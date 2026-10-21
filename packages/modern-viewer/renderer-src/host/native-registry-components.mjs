// Names in these maps came from the action connection's original configuration
// and NeoForge registry sync. Never interpret a native numeric ID as vanilla.
import {potionComponentSnbt} from './vanilla-item-stack.mjs';
const RESOURCE=/^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const lookup=(registries,registry,id)=>{
  const name=Number.isInteger(id)&&id>=0?registries?.get(registry)?.get(id):null;
  if(!RESOURCE.test(name??''))throw Error('NATIVE_COMPONENT_REGISTRY_UNAVAILABLE:'+registry);
  return name;
};
export function nativeRegistryComponent(type,data,registries){
  if(type==='enchantments'||type==='stored_enchantments'){
    const tooltip=type==='stored_enchantments'?'showInTooltip':'showTooltip';
    if(!data||typeof data!=='object'||Object.keys(data).some(k=>!['enchantments',tooltip].includes(k))||
      !Array.isArray(data.enchantments)||data.enchantments.length>256||typeof data[tooltip]!=='boolean')throw Error('NATIVE_ENCHANTMENTS_INVALID');
    const seen=new Set(),levels=[],summary=[];
    for(const row of data.enchantments){
      const name=lookup(registries,'minecraft:enchantment',row?.id);
      if(seen.has(name)||!Number.isInteger(row.level)||row.level<0||row.level>255)throw Error('NATIVE_ENCHANTMENTS_INVALID');
      seen.add(name);levels.push(JSON.stringify(name)+':'+row.level);summary.push({id:name,level:row.level});
    }
    return {snbt:'{levels:{'+levels.join(',')+'},show_in_tooltip:'+(data[tooltip]?'1b':'0b')+'}',summary};
  }
  if(type==='potion_contents'){
    const source={potions:registries?.get('minecraft:potion'),effects:registries?.get('minecraft:mob_effect')};
    if(data?.potionId!=null)lookup(registries,'minecraft:potion',data.potionId);
    if(Array.isArray(data?.customEffects))for(const row of data.customEffects)lookup(registries,'minecraft:mob_effect',row?.id);
    const snbt=potionComponentSnbt(data,source);
    return {snbt,summary:{id:data.potionId==null?null:lookup(registries,'minecraft:potion',data.potionId),
      customColor:data.customColor??null,effects:data.customEffects.map(row=>({id:lookup(registries,'minecraft:mob_effect',row.id),...structuredClone(row.details)}))}};
  }
  return null;
}
