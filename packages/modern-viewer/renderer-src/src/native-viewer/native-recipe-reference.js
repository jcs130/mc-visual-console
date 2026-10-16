import { verifyNativeStaticItemEvidence, nativeStaticItemState,STATIC_ITEM_SOURCES } from './native-static-item-providers.js'
import {nativePotionItemEligible,validateNativePotionItem} from './native-potion-items.js'
import {nativeClientSourceVerified} from './native-client-source.js'
import {parseNativeItemStack} from './native-item-stack.js'

export const NATIVE_RECIPE_REFERENCE_LABEL='原版1.21.1配方目录 · 默认外观参考 · 尚未执行合成'

// A separate positive contract, never a repair for an incomplete observed stack.
// The static provider's locked Items/ItemColors/ItemProperties constructor audit
// establishes default appearance. Dynamic/unknown defaults remain unavailable.
export function nativeRecipeReferenceItem(reader,value,registry) {
  const r=value?.reference
  if(r?.schemaVersion!==1||r.source!=='vanilla_recipe_catalog'||r.minecraftVersion!=='1.21.1'||
    r.appearance!=='original_default'||r.id!==value?.name||!value.name.startsWith('minecraft:')||
    !Number.isSafeInteger(value.count)||value.count<1||value.count>2147483647||
    Object.hasOwn(value,'snbt')||Object.hasOwn(value,'components'))throw Error('NATIVE_RECIPE_REFERENCE_INVALID')
  const registration=registry?.items?.find(row=>row.id===r.registryId&&row.name===r.id)
  if(!Number.isSafeInteger(r.registryId)||registry?.source!=='original_BuiltInRegistries_and_PotionContents_getColor'||!registration)throw Error('NATIVE_RECIPE_REFERENCE_REGISTRY_MISMATCH')
  const item={name:value.name,count:value.count,snbt:`{id:${JSON.stringify(value.name)},count:${value.count}}`}
  if(nativePotionItemEligible(value.name)){
    if(!nativeClientSourceVerified(reader?.manifest,STATIC_ITEM_SOURCES.minecraft.sha256))throw Error('NATIVE_RECIPE_REFERENCE_CLIENT_UNVERIFIED')
    validateNativePotionItem(parseNativeItemStack(item))
    return {item,provenance:{...r,sourceJar:STATIC_ITEM_SOURCES.minecraft,defaultRule:'original_PotionContents_EMPTY'}}
  }
  const evidence=verifyNativeStaticItemEvidence(reader,value.name)
  if(evidence.itemClass!==registration.itemClass)throw Error('NATIVE_RECIPE_REFERENCE_CLASS_MISMATCH')
  nativeStaticItemState(item)
  return {item,provenance:{...r,sourceJar:evidence.source,defaultRule:'locked_static_item_constructor'}}
}
