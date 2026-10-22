import {componentValue} from './vanilla-item-stack.mjs';
import {nativeRegistryComponent} from './native-registry-components.mjs';

export const TWILIGHT_1211_JAR='twilightforest-1.21.1-4.8.3345-universal.jar';
export const TWILIGHT_1211_SHA='493da16d10210f9f53a3c33b3d8fcb4ae9b14016ee420d753c894562bd9aba35';
const UNIT=new Set('emperors_cloth infinite_glass_sword translatable_book travellers_armor has_travellers_chestplate has_travellers_gloves has_travellers_belt has_travellers_wings has_travellers_boots red_thread_vision stealth_crouching arrow_magnetism swap_hotbar_ability swap_hotbar_modifier double_jump water_walk all_night_goggles unrestrained swift_swim high_step aquatic_agility'.split(' '));
const FLOAT=new Set('auto_repair_probability zoom_ability_modifier efficient_eater perfect_dodge_probability gradually_gliding_multiplier agile_ranger_modifier slimy_soles_coefficient'.split(' '));
const INT=new Set('casket_damage haste_amplifier high_jump_amplifier ore_loading ore_range'.split(' '));
const NBT=new Set('candelabra_data jar_lid ore_scanner'.split(' '));
const SPECIAL=new Set('e115_variant thrown_projectile straight_ahead_multiplier sidestep_cooldown flask_contents skull_candles ore_data'.split(' '));
const RESOURCE=/^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const DYES='white orange magenta light_blue yellow lime pink gray light_gray cyan purple blue brown green red black'.split(' ');
const invalid=()=>{throw Error('NATIVE_TWILIGHT_COMPONENT_INVALID');};
const integer=v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647?v:invalid();
const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:invalid();
function long(v){
  if(!Array.isArray(v)||v.length!==2||!Number.isInteger(v[0])||v[0]<-2147483648||v[0]>2147483647||!Number.isInteger(v[1])||v[1]<0||v[1]>4294967295)invalid();
  return (BigInt(v[0])<<32n)|BigInt(v[1]);
}
export function knownTwilightComponent(type){
  if(typeof type!=='string'||!type.startsWith('twilightforest:'))return false;
  const name=type.slice('twilightforest:'.length);
  return UNIT.has(name)||FLOAT.has(name)||INT.has(name)||NBT.has(name)||SPECIAL.has(name);
}
// Wire field names follow the pinned original Java records. This converts only
// audited components to their ORIGINAL persistent codec representation. Four
// registry/recursive codecs remain explicit unavailable, never guessed IDs.
export function twilightComponentSnbt(type,data,{registries,vanillaRegistry}={}){
  if(!knownTwilightComponent(type))return null;
  const name=type.slice('twilightforest:'.length);
  if(UNIT.has(name)){if(data!==undefined&&data!==null)invalid();return '{}';}
  if(FLOAT.has(name))return String(finite(data))+'f';
  if(INT.has(name))return String(integer(data));
  if(NBT.has(name))return componentValue('custom_data',data,vanillaRegistry);
  if(name==='straight_ahead_multiplier')return String(finite(data))+'d';
  if(name==='sidestep_cooldown')return String(long(data))+'L';
  if(name==='e115_variant'){if(typeof data!=='string'||data.length>1024)invalid();return JSON.stringify(data);}
  if(name==='thrown_projectile'){
    if(typeof data!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data))invalid();
    const b=Buffer.from(data.replaceAll('-',''),'hex');return '[I;'+[0,4,8,12].map(i=>b.readInt32BE(i)).join(',')+']';
  }
  if(name==='skull_candles'){
    if(!DYES[data?.color])invalid();return '{color:'+JSON.stringify(DYES[data.color])+',count:'+integer(data.count)+'}';
  }
  if(name==='flask_contents'){
    if(typeof data?.breakable!=='boolean')invalid();
    const potion=nativeRegistryComponent('potion_contents',data.potion,registries);
    return '{potion:'+potion.snbt+',doses:'+integer(data.doses)+',breakage:'+integer(data.breakage)+',breakable:'+(data.breakable?'1b':'0b')+'}';
  }
  if(name==='ore_data'){
    if(!Array.isArray(data?.counts)||data.counts.length>4096)invalid();
    const seen=new Set(),counts=data.counts.map(row=>{if(!RESOURCE.test(row?.name??'')||seen.has(row.name))invalid();seen.add(row.name);return JSON.stringify(row.name)+':'+integer(row.count);});
    const chunk=long(data.scannedChunk),x=Number(BigInt.asIntN(32,chunk)),z=Number(chunk>>32n);
    return '{counts:{'+counts.join(',')+'},scanned_chunk:[I;'+x+','+z+'],scanned_block_count:'+integer(data.scannedBlockCount)+',universal_id:'+long(data.universalId)+'L}';
  }
  return null;
}
