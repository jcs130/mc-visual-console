// Explicit 1.21.1 wire-component to ItemStack codec subset. Missing/unsupported
// patches stay unavailable; never turn an unknown item into a default icon.
import {componentSnbt,enchantmentSnbt} from './vanilla-component-nbt.mjs';
const INTEGER = new Set(['max_stack_size', 'max_damage', 'damage', 'repair_cost', 'custom_model_data']);
const UNIT = new Set(['hide_additional_tooltip', 'hide_tooltip', 'fire_resistant', 'intangible_projectile']);
const quote = value => JSON.stringify(value);
const componentName = type => typeof type === 'string' && /^[a-z0-9_]+$/.test(type) ? 'minecraft:' + type : null;
const registries=new WeakMap();
const effectName=name=>'minecraft:'+name.replace(/[A-Z]/g,(c,i)=>(i?'_':'')+c.toLowerCase());

// Explicitly supplied, hash-checked original registry data. Compare every
// actual Item/effect ID before resolving potion component registry IDs.
export function configureVanillaItemRegistries(registry,data){
  if(!registry||registry.version?.minecraftVersion!=='1.21.1'||data?.source!=='original_BuiltInRegistries_and_PotionContents_getColor'||
    data.items?.length!==1333||data.effects?.length!==39||data.potions?.length!==46)throw Error('VANILLA_ITEM_COLOR_REGISTRY_INVALID');
  if(data.items.some(row=>registry.items?.[row.id]?.name!==row.name.slice('minecraft:'.length))||
    data.effects.some(row=>!registry.effects?.[row.id]?.name||effectName(registry.effects[row.id].name)!==row.name))throw Error('VANILLA_ITEM_COLOR_REGISTRY_MISMATCH');
  registries.set(registry,{potions:new Map(data.potions.map(row=>[row.id,row.name])),effects:new Map(data.effects.map(row=>[row.id,row.name]))});
}

function potionComponent(data,registry){
  const source=registries.get(registry);
  if(!source)throw Error('VANILLA_POTION_REGISTRY_UNAVAILABLE');
  if(!data||typeof data!=='object'||Object.keys(data).some(k=>!['potionId','customColor','customEffects','customName'].includes(k))||data.customName!=null||
    !Array.isArray(data.customEffects)||data.customEffects.length>256)throw Error('VANILLA_POTION_COMPONENT_INVALID');
  const fields=[];
  if(data.potionId!=null){const name=source.potions.get(data.potionId);if(!name)throw Error('VANILLA_POTION_REGISTRY_UNAVAILABLE');fields.push('potion:'+quote(name));}
  if(data.customColor!=null){if(!Number.isInteger(data.customColor)||data.customColor < -2147483648||data.customColor>2147483647)throw Error('VANILLA_POTION_COMPONENT_INVALID');fields.push('custom_color:'+data.customColor);}
  const details=(value,name,depth=0)=>{
    if(depth>8||!value||typeof value!=='object'||Object.keys(value).some(k=>!['amplifier','duration','ambient','showParticles','showIcon','hiddenEffect'].includes(k))||
      !Number.isInteger(value.amplifier)||value.amplifier<0||value.amplifier>255||!Number.isInteger(value.duration)||value.duration < -2147483648||value.duration>2147483647||
      !['ambient','showParticles','showIcon'].every(k=>typeof value[k]==='boolean'))throw Error('VANILLA_POTION_EFFECT_INVALID');
    return '{id:'+quote(name)+',amplifier:'+value.amplifier+',duration:'+value.duration+',ambient:'+(value.ambient?'1b':'0b')+
      ',show_particles:'+(value.showParticles?'1b':'0b')+',show_icon:'+(value.showIcon?'1b':'0b')+
      (value.hiddenEffect==null?'':',hidden_effect:'+details(value.hiddenEffect,name,depth+1))+'}';
  };
  fields.push('custom_effects:['+data.customEffects.map(row=>{
    const name=source.effects.get(row?.id);if(!name)throw Error('VANILLA_POTION_EFFECT_REGISTRY_UNAVAILABLE');return details(row.details,name);
  }).join(',')+']');
  return '{'+fields.join(',')+'}';
}

function componentValue(type, data, registry) {
  if(['custom_name','item_name','custom_data'].includes(type))return componentSnbt(data);
  if(type==='lore'){
    if(!Array.isArray(data)||data.length>256)throw Error('VANILLA_NBT_LIMIT');
    return '['+data.map(row=>componentSnbt(row)).join(',')+']';
  }
  if(['enchantments','stored_enchantments'].includes(type))return enchantmentSnbt(data,registry);
  if(type==='potion_contents')return potionComponent(data,registry);
  if (INTEGER.has(type)) {
    if (!Number.isSafeInteger(data) || data < -2147483648 || data > 2147483647 ||
        (type !== 'custom_model_data' && data < 0) ||
        (['max_damage', 'max_stack_size'].includes(type) && data === 0)) throw Error('VANILLA_COMPONENT_INVALID:' + type);
    return String(data);
  }
  if (type === 'enchantment_glint_override' && typeof data === 'boolean') return data ? '1b' : '0b';
  if (type === 'unbreakable' && typeof data === 'boolean') return '{show_in_tooltip:' + (data ? '1b' : '0b') + '}';
  if (type === 'rarity' && ['common', 'uncommon', 'rare', 'epic'].includes(data)) return quote(data);
  if (UNIT.has(type) && data === undefined) return '{}';
  throw Error('VANILLA_COMPONENT_UNSUPPORTED:' + String(type).slice(0, 80));
}

export function vanillaItemStack(item, registry) {
  const name = typeof item.name === 'string' && /^[a-z0-9_]+$/.test(item.name) ? 'minecraft:' + item.name : item.name;
  const base = { name, count: item.count };
  try {
    if (!/^minecraft:[a-z0-9_]+$/.test(name) || !Number.isSafeInteger(item.count) || item.count <= 0 ||
        !Array.isArray(item.components) || !Array.isArray(item.removedComponents))
      throw Error('VANILLA_ITEM_COMPONENTS_NOT_OBSERVED');
    if (item.nbt != null) {
      // Prismarine Item.fromNotch can synthesize legacy Damage=0 in its
      // constructor. Only its matching modern wire codec can establish that
      // the observed component patch, rather than that compatibility NBT, is
      // authoritative. Plain/mixed-source NBT still fails closed.
      const wire = item.constructor?.toNotch?.(item);
      if (!wire || wire.itemId !== item.type || wire.itemCount !== item.count ||
          wire.components !== item.components || wire.removeComponents !== item.removedComponents ||
          Object.hasOwn(wire, 'nbtData') || registry?.items?.[item.type]?.name !== item.name)
        throw Error('VANILLA_ITEM_LEGACY_NBT_UNVERIFIED');
    }
    const patch = new Map();
    if (item.components.length + item.removedComponents.length > 128) throw Error('VANILLA_COMPONENT_PATCH_TOO_LARGE');
    for (const component of item.components) {
      const key = componentName(component?.type);
      if (!key || patch.has(key)) throw Error('VANILLA_COMPONENT_PATCH_INVALID');
      patch.set(key, componentValue(component.type, component.data, registry));
    }
    for (const component of item.removedComponents) {
      // Protocol 767 uses removeComponents:[{type}], while the public item
      // projection may retain a string name. Never discard a removal patch.
      const type=typeof component==='string'?component:component&&Object.keys(component).length===1?component.type:null;
      const key = componentName(type);
      if (!key || patch.has(key) || patch.has('!' + key)) throw Error('VANILLA_COMPONENT_PATCH_INVALID');
      patch.set('!' + key, '{}');
    }
    const components = [...patch].map(([key, value]) => quote(key) + ':' + value).join(',');
    const snbt = `{id:${quote(name)},count:${item.count}${components ? ',components:{' + components + '}' : ''}}`;
    if(Buffer.byteLength(snbt)>65536)throw Error('VANILLA_NBT_LIMIT');
    const leaf = name.slice('minecraft:'.length);
    const descriptionId = (registry?.blocksByName?.[leaf] ? 'block.' : 'item.') + 'minecraft.' + leaf;
    return { item: { ...base, snbt, descriptionId,
      ...(typeof item.displayName === 'string' ? { displayName: item.displayName } : {}) }, reason: null };
  } catch (error) { return { item: base, reason: error.message }; }
}
