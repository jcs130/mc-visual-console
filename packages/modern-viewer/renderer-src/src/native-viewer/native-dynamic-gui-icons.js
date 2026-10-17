import {nativeItemComponentState,STATIC_ITEM_SOURCES} from './native-static-item-providers.js';
import {resolveNativeBlockItemModel,nativeGuiItemTransform} from './native-block-item-icons.js';
export const nativeDynamicGuiEligible=id=>['minecraft:compass','minecraft:crossbow'].includes(id);
const mod=value=>(value%1+1)%1;
// Direct 1.21.1 CompassItemPropertyFunction.CompassWobble (gpr$b).
export class NativeCompassWobble {
  constructor(){this.rotation=0;this.delta=0;this.tick=0;}
  update(tick,target){if(tick!==this.tick){this.tick=tick;this.delta=(this.delta+(mod(target-this.rotation+.5)-.5)*.1)*.8;this.rotation=mod(this.rotation+this.delta);}return this.rotation;}
}
// Locked gps ItemProperties and gpr/csy/ctc. GUI only: no held-model fallback.
export function nativeDynamicGuiState(stack,view,wobble){
  if(!nativeDynamicGuiEligible(stack.id))throw Error('NATIVE_DYNAMIC_GUI_PROVIDER_UNAVAILABLE');
  const components=nativeItemComponentState(stack,{allowPartialGlint:true});
  if(!view?.available||view.playerUuid!==view.self?.uuid||typeof view.self.usingItem!=='boolean')throw Error('NATIVE_ITEM_PLAYER_CONTEXT_UNAVAILABLE');
  if(stack.id==='minecraft:crossbow'){
    // Received non-use state plus the original empty ChargedProjectiles default.
    // Unknown/charged/active component patches stay unavailable, never guessed.
    if(view.self.usingItem)throw Error('NATIVE_CROSSBOW_ACTIVE_USE_UNAVAILABLE');
    return {...components,properties:{pulling:0,pull:0,charged:0,firework:0},variant:'uncharged'};
  }
  const context=view.itemProperties,position=view.self.position,target=context?.spawn,tick=view.time?.age;
  if(context?.source!=='same_player_spawn_position'||context.playerUuid!==view.playerUuid||!Number.isInteger(context.entityId)||context.entityId!==view.self.entityId||
    !['overworld','minecraft:overworld'].includes(context.dimension)||!target||!position||
    ![target.x,target.z,position.x,position.z,view.self.yaw,tick].every(Number.isFinite)||!Number.isSafeInteger(tick))throw Error('NATIVE_COMPASS_TARGET_UNAVAILABLE');
  // BlockPos.getCenter, Mineflayer -> Minecraft yaw, native float TWO_PI.
  const dx=target.x+.5-position.x,dz=target.z+.5-position.z;
  if(dx*dx+dz*dz<9.999999747378752e-6)throw Error('NATIVE_COMPASS_RANDOM_TARGET_UNAVAILABLE');
  const rotation=mod((Math.PI-view.self.yaw)/(Math.PI*2));
  const angle=mod(Math.fround(Math.atan2(dz,dx)/6.2831854820251465+wobble.update(tick,.5-(rotation-.25))));
  return {...components,properties:{angle},variant:'frame-'+(Math.floor(angle*32+.5)%32)};
}
export async function prepareNativeDynamicGuiIcon(reader,state){
  if(reader.manifest?.minecraftVersion!=='1.21.1'||reader.manifest.assetIntegrityVerified!==true||reader.manifest.clientJarSha256!==STATIC_ITEM_SOURCES.minecraft.sha256)throw Error('NATIVE_DYNAMIC_GUI_SOURCE_UNVERIFIED');
  const model=await resolveNativeBlockItemModel(reader,state.stack.id.replace(':',':item/'),[],{properties:state.properties});
  const gui=nativeGuiItemTransform(model.display.gui);
  if(!model.nativeGenerated||model.elements.length||model.gui_light!=='front'||gui.rotation.some(v=>v!==0)||gui.translation.some(v=>v!==0)||gui.scale.some(v=>v!==1))throw Error('NATIVE_DYNAMIC_GUI_MODEL_UNSUPPORTED');
  return {family:'dynamic-gui',geometry:'generated',model,prepared:null,evidence:{source:STATIC_ITEM_SOURCES.minecraft,
    itemClass:state.stack.id==='minecraft:compass'?'net.minecraft.world.item.CompassItem':'net.minecraft.world.item.CrossbowItem',
    itemPropertiesClassSha256:'0d0e77d78780c9dfedf86514d29cfec312459062f5a90175dda479006aa32f24',properties:state.properties}};
}
