import {nativeItemComponentState} from './native-static-item-providers.js'
import {nativeNumericValue} from './native-item-stack.js'
import {resolveNativeBlockItemModel,BLOCK_ICON_CLIENT_SHA256} from './native-block-item-icons.js'

export const nativeRangedItemEligible=id=>id==='minecraft:bow'||id==='minecraft:crossbow'
// Locked 1.21.1 ItemProperties (gps), SHA256
// 0d0e77d78780c9dfedf86514d29cfec312459062f5a90175dda479006aa32f24:
// pulling/pull depend on the live entity; charged/firework on ChargedProjectiles.
// This bounded provider handles an observed inactive hand only. Never assume
// idle because an inventory snapshot lacks the living-entity use metadata.
export async function prepareNativeRangedItem(reader,stack,observed){
  if(reader?.manifest?.clientJarSha256!==BLOCK_ICON_CLIENT_SHA256||!nativeRangedItemEligible(stack.id))throw Error('NATIVE_RANGED_SOURCE_UNVERIFIED')
  if(observed?.source!=='same_connection_entity_metadata'||typeof observed.usingItem!=='boolean'||!Number.isSafeInteger(observed.entityId))throw Error('NATIVE_RANGED_USE_STATE_UNAVAILABLE')
  if(observed.usingItem)throw Error('NATIVE_RANGED_ACTIVE_USE_UNAVAILABLE')
  const components={...stack.components},projectiles=components['minecraft:charged_projectiles']??[]
  if(!Array.isArray(projectiles)||projectiles.length>3||stack.id==='minecraft:bow'&&Object.hasOwn(components,'minecraft:charged_projectiles')||projectiles.some(p=>
    !p||typeof p!=='object'||!/^minecraft:[a-z0-9_]+$/.test(p.id??'')||!Number.isInteger(nativeNumericValue(p.count??1))||nativeNumericValue(p.count??1)<1))throw Error('NATIVE_RANGED_PROJECTILES_INVALID')
  delete components['minecraft:charged_projectiles']
  const effect=nativeItemComponentState({...stack,components},{allowPartialGlint:true})
  const properties={pulling:0,pull:0,charged:Number(projectiles.length>0),firework:Number(projectiles.some(p=>p.id==='minecraft:firework_rocket'))}
  const model=await resolveNativeBlockItemModel(reader,stack.id.replace(':',':item/'),[],{generatedOnly:true,properties})
  return {model,effect,properties,sourcePaths:model.sourcePaths,geometrySource:'Minecraft_1.21.1_original_observed_ranged_item',activeUseAvailable:false}
}
