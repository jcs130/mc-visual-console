import {nativeItemComponentState,STATIC_ITEM_SOURCES} from './native-static-item-providers.js';
import {resolveNativeBlockItemModel,nativeGuiItemTransform} from './native-block-item-icons.js';
export const nativeDynamicGuiEligible=id=>['minecraft:compass','minecraft:crossbow'].includes(id);
const mod=value=>(value%1+1)%1;
const modFloat=value=>Math.fround(Math.fround(Math.fround(value)%1+1)%1);
const updateWobble=(state,tick,target)=>{
  if(tick!==state.tick){state.tick=tick;state.delta=(state.delta+(mod(target-state.rotation+.5)-.5)*.1)*.8;state.rotation=mod(state.rotation+state.delta);}
  return state.rotation;
};
// Direct 1.21.1 CompassItemPropertyFunction.CompassWobble (gpr$b).
export class NativeCompassWobble {
  constructor({random=Math.random}={}){this.rotation=0;this.delta=0;this.tick=0;this.random=random;this.spinning={rotation:0,delta:0,tick:0};}
  update(tick,target){return updateWobble(this,tick,target);}
  spin(tick,seed=0){
    if(!Number.isSafeInteger(tick)||!Number.isInteger(seed)||seed< -2147483648||seed>2147483647)throw Error('NATIVE_COMPASS_RANDOM_CONTEXT_INVALID');
    if(tick!==this.spinning.tick){const target=this.random();if(!Number.isFinite(target)||target<0||target>=1)throw Error('NATIVE_COMPASS_RANDOM_SOURCE_INVALID');updateWobble(this.spinning,tick,target);}
    // Original gpr.hash(int), Java int overflow and float conversion/division.
    const offset=Math.fround(Math.fround(Math.imul(seed,1327217883))/2147483648);
    return modFloat(this.spinning.rotation+offset);
  }
}
// Locked gps ItemProperties and gpr/csy/ctc. GUI only: no held-model fallback.
export function nativeDynamicGuiState(stack,view,wobble){
  if(!nativeDynamicGuiEligible(stack.id))throw Error('NATIVE_DYNAMIC_GUI_PROVIDER_UNAVAILABLE');
  const components=nativeItemComponentState(stack,{allowPartialGlint:true});
  if(!view?.available||view.playerUuid!==view.self?.uuid)throw Error('NATIVE_ITEM_PLAYER_CONTEXT_UNAVAILABLE');
  if(stack.id==='minecraft:crossbow'){
    // Received non-use state plus the original empty ChargedProjectiles default.
    // Unknown/charged/active component patches stay unavailable, never guessed.
    if(typeof view.self.usingItem!=='boolean')throw Error('NATIVE_ITEM_PLAYER_CONTEXT_UNAVAILABLE');
    if(view.self.usingItem)throw Error('NATIVE_CROSSBOW_ACTIVE_USE_UNAVAILABLE');
    return {...components,properties:{pulling:0,pull:0,charged:0,firework:0},variant:'uncharged'};
  }
  const context=view.itemProperties,position=view.self.position,target=context?.spawn,tick=view.time?.age;
  if(context?.source!=='same_player_spawn_position'||context.playerUuid!==view.playerUuid||!Number.isInteger(context.entityId)||context.entityId!==view.self.entityId||
    !['overworld','minecraft:overworld','the_nether','minecraft:the_nether','the_end','minecraft:the_end'].includes(context.dimension)||
    !Number.isSafeInteger(tick))throw Error('NATIVE_COMPASS_TARGET_UNAVAILABLE');
  const random=()=>{const angle=wobble.spin(tick);return {...components,mode:'random',properties:{angle},variant:'frame-'+(Math.floor(angle*32+.5)%32)};};
  if(!['overworld','minecraft:overworld'].includes(context.dimension))return random();
  if(!target||!position||![target.x,target.y,target.z,position.x,position.y,position.z,view.self.yaw].every(Number.isFinite))throw Error('NATIVE_COMPASS_TARGET_UNAVAILABLE');
  // BlockPos.getCenter, Mineflayer -> Minecraft yaw, native float TWO_PI.
  const dx=target.x+.5-position.x,dy=target.y+.5-position.y,dz=target.z+.5-position.z;
  if(dx*dx+dy*dy+dz*dz<9.999999747378752e-6)return random();
  const rotation=mod((Math.PI-view.self.yaw)/(Math.PI*2));
  const angle=modFloat(Math.atan2(dz,dx)/6.2831854820251465+wobble.update(tick,.5-(rotation-.25)));
  return {...components,mode:'target',properties:{angle},variant:'frame-'+(Math.floor(angle*32+.5)%32)};
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
