import {NATIVE_BANNER_COLORS,nativeBannerAsset} from '../src/native-viewer/native-banner-data.js';
import {snbtString} from './vanilla-component-nbt.mjs';
const registries=new WeakMap();
const colorNames=Object.keys(NATIVE_BANNER_COLORS);
const unavailable=()=>{throw Error('VANILLA_BANNER_PATTERN_REGISTRY_UNAVAILABLE');};
// Only actual data received on this action connection resolves numeric holders.
// A server override never borrows the similarly named original texture.
export function observeVanillaBannerRegistry(registry,packet){
 if(!registry||packet?.id!=='minecraft:banner_pattern')return;
 const map=new Map();registries.set(registry,map);
 if(!Array.isArray(packet.entries)||packet.entries.length>256)return;
 const seen=new Set();
 for(const [id,row] of packet.entries.entries()){
  if(!row||typeof row.key!=='string'||seen.has(row.key)){map.clear();return;}seen.add(row.key);
  const value=row.value?.type==='compound'?row.value.value:null;
  if(nativeBannerAsset(row.key)&&value?.asset_id?.type==='string'&&value.asset_id.value===row.key&&
   value.translation_key?.type==='string'&&value.translation_key.value==='block.minecraft.banner.'+row.key.slice(10))map.set(id,row.key);
 }
}
export const clearVanillaBannerRegistry=registry=>registry&&registries.delete(registry);
export function vanillaBannerPatternsSnbt(data,registry){
 if(!Array.isArray(data)||data.length>64)throw Error('VANILLA_BANNER_PATTERNS_INVALID');
 return '['+data.map(row=>{
  if(!row||Object.keys(row).some(k=>!['pattern','colorId'].includes(k))||!Number.isInteger(row.colorId)||!colorNames[row.colorId])throw Error('VANILLA_BANNER_PATTERNS_INVALID');
  const holder=row.pattern;let pattern;
  if(holder&&Object.keys(holder).length===1&&Number.isInteger(holder.patternId)&&holder.patternId>=0){
   const name=registries.get(registry)?.get(holder.patternId);if(!name)unavailable();pattern=snbtString(name);
  }else if(holder&&Object.keys(holder).length===1&&holder.data){
   const v=holder.data;
   if(Object.keys(v).some(k=>!['assetId','translationKey'].includes(k))||!nativeBannerAsset(v.assetId)||typeof v.translationKey!=='string'||v.translationKey.length>512)unavailable();
   pattern='{asset_id:'+snbtString(v.assetId)+',translation_key:'+snbtString(v.translationKey)+'}';
  }else unavailable();
  return '{pattern:'+pattern+',color:'+snbtString(colorNames[row.colorId])+'}';
 }).join(',')+']';
}
