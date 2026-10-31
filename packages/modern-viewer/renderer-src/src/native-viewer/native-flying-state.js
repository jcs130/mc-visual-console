import {nativeLivingMeta} from './native-living-state.js'
import {nativePlayerCos as cos} from './native-player-motion.js'

// Original 1.21.1 fug/fxt models and gjf/gnd renderers. These are vanilla
// actors, also usable when a server explicitly projects a mod entity to them.
export const NATIVE_FLYING_TYPES=Object.freeze(['minecraft:allay','minecraft:vex'])
export const nativeFlyingType=name=>NATIVE_FLYING_TYPES.includes(name)
const F=Math.fround,RAD=F(Math.PI/180),PI=F(Math.PI),mix=(a,b,t)=>a+(b-a)*t,wrap=v=>((v+180)%360+360)%360-180
const held=(entity,slot)=>{
 const rows=entity.equipment instanceof Map?[...entity.equipment.values()]:Array.isArray(entity.equipment)?entity.equipment:[]
 return rows.some(row=>row.slot===slot&&(row.item?.itemCount>0||row.item?.count>0))
}
export function nativeFlyingState(entity){
 if(!nativeFlyingType(entity?.name)||!Number.isSafeInteger(entity.entityId)||typeof entity.uuid!=='string'||!Array.isArray(entity.metadata)||
   !entity.position||![entity.position.x,entity.position.y,entity.position.z,entity.yaw,entity.pitch,entity.headYaw].every(Number.isFinite))throw Error('NATIVE_FLYING_STATE_INVALID')
 const flags=nativeLivingMeta(entity,0,'byte',0),vex=entity.name==='minecraft:vex'
 return {name:entity.name,invisible:!!(flags&32),fire:!!(flags&1),outline:!!(flags&64),pose:nativeLivingMeta(entity,6,'pose',0),health:nativeLivingMeta(entity,9,'float',1),
   charging:vex&&!!(nativeLivingMeta(entity,16,'byte',0)&1),dancing:!vex&&nativeLivingMeta(entity,16,'boolean',false),main:held(entity,0),off:held(entity,1)}
}
export function createNativeFlyingAnimation(entity){
 let holding=0,previous=0
 return {current:()=>({holding,previous,source:'Minecraft_1.21.1_Allay_client_holding_counter'}),tick(next){
  previous=holding;holding=next.name==='minecraft:allay'?Math.max(0,Math.min(5,holding+(held(next,0)?1:-1))):0
 }}
}
export function animateNativeFlying(model,state,{age,walk=0,speed=0,pitch=0,headYaw=0,holding=0}={}){
 if(![age,walk,speed,pitch,headYaw,holding].every(Number.isFinite)||speed<0||holding<0||holding>1)throw Error('NATIVE_FLYING_ANIMATION_INVALID')
 const b=model.bones
 for(const part of model.definition.parts){const bone=b.get(part.path);bone.position.fromArray(part.pivot);bone.rotation.set(...part.rotationZYX,'ZYX')}
 const set=(name,axis,value)=>{b.get(name).rotation[axis]=F(value)}
 set('head','x',F(pitch*RAD));set('head','y',F(headYaw*RAD))
 if(state.name==='minecraft:vex'){
  const sway=F(cos(F(F(age*F(5.5))*RAD))*F(.1))
  set('right_arm','z',F(F(.62831855)+sway));set('left_arm','z',-F(F(.62831855)+sway));set('body','x',state.charging?0:F(.15707964))
  if(state.charging){
   for(const [arm,active,sign]of [['right_arm',state.main,1],['left_arm',state.off,-1]])if(active||!state.main&&!state.off){
    set(arm,'x',active?F(3.6651914):F(-1.2217305));set(arm,'y',F(.2617994)*sign);set(arm,'z',F(F(-.47123888)-sway)*sign)
   }
  }
  const wing=F(F(1.0995574)+F(F(cos(F(F(age*F(45.836624))*RAD))*RAD)*F(16.2)))
  set('left_wing','y',wing);set('right_wing','y',-wing)
  set('left_wing','x',F(.47123888));set('left_wing','z',F(-.47123888));set('right_wing','x',F(.47123888));set('right_wing','z',F(.47123888))
 }else{
  const phase=F(F(F(age*20)*RAD)+F(walk)),flap=F(F(F(cos(phase)*PI)*F(.15))+F(speed)),moving=Math.min(F(F(speed)/F(.3)),1),idle=F(1-moving),slowPhase=F(F(age*9)*RAD)
  set('right_wing','x',F(F(.43633232)*idle));set('left_wing','x',F(F(.43633232)*idle));set('right_wing','y',F(F(-.7853982)+flap));set('left_wing','y',F(F(.7853982)-flap))
  set('body','x',F(moving*F(.7853982)))
  const arm=F(F(holding)*F(F(-1.0471976)+F(moving*F(F(-1.134464)-F(-1.0471976)))))
  set('right_arm','x',arm);set('left_arm','x',arm)
  b.get('root/root').position.y=F(b.get('root/root').position.y+F(F(F(Math.cos(slowPhase))*F(.25))*idle))
  const spread=F(F(.43633232)-F(F(F(F(cos(F(slowPhase+F(4.712389)))*PI)*F(.075))*idle)*F(1-holding)))
  set('right_arm','z',spread);set('left_arm','z',-spread);set('right_arm','y',F(F(.27925268)*holding));set('left_arm','y',F(F(-.27925268)*holding))
 }
}
