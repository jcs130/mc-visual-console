// Locked 1.21.1: LivingEntity/WalkAnimationState, BodyRotationControl,
// Chicken.aiStep, Sheep.handleEntityEvent/aiStep and Slime.tick. Runs only on
// the action connection's actual physicsTick; browser time never creates ticks.
import { NATIVE_HOSTILE_TYPES, createNativeLivingAnimation } from './native-living-state.js'
import { nativeProjectileType } from './native-projectile-state.js'
import {nativeThrownItemType} from './native-thrown-item-state.js'
const F=Math.fround, clamp=(v,a,b)=>Math.max(a,Math.min(b,v))
const wrap=v=>((v+180)%360+360)%360-180
const relative=(a,b,max)=>F(b-clamp(wrap(b-a),-max,max))
export const NATIVE_MOB_MOTION_SOURCE='same_connection_entity_ticks'
export const NATIVE_MOB_TYPES=Object.freeze(['minecraft:pig','minecraft:cow','minecraft:chicken','minecraft:sheep','minecraft:slime','minecraft:villager','touhou_little_maid:maid','wandscape:wandscape_npc',...NATIVE_HOSTILE_TYPES])
const types=new Set(NATIVE_MOB_TYPES)

export function createNativeEntityMotion(entity) {
  if(entity?.name==='minecraft:item')return createNativeDroppedItemMotion(entity)
  if(nativeProjectileType(entity?.name)||nativeThrownItemType(entity?.name))return createNativeProjectileMotion(entity)
  if(!types.has(entity?.name))return null
  let position={...entity.position},yaw=entity.yaw,pitch=entity.pitch,headYaw=entity.headYaw,bodyYaw=yaw
  let target={...position},targetYaw=yaw,targetPitch=pitch,targetHead=headYaw,lerpSteps=0,headSteps=0
  let walk={speedOld:0,speed:0,position:0},ticks=0,headStable=0,lastStableHead=headYaw,lastCue=0
  let squish=0,oSquish=0,targetSquish=0,wasOnGround=false,flap=0,oFlap=0,flapSpeed=0,oFlapSpeed=0,flapVelocity=1,eatCounter=0
  let sampledAt=entity.spawnedAt,previous={position:{...position},yaw,pitch,headYaw,bodyYaw}
  const isMaid=entity.name==='touhou_little_maid:maid'
  const living=createNativeLivingAnimation(entity)
  let hurtTime=0,hurtPending=false,health=null,swingPending=false,maidCue=0,swimAmount=0,swimAmountOld=0,maidAnimationId=0
  const observeMaid=(next,kind)=>{
    if(!isMaid)return
    // 1.21.1 ClientboundHurtAnimationPacket calls animateHurt; legacy status 2
    // is not a substitute for this packet in the locked client.
    if(kind==='hurt_animation'){hurtTime=10;hurtPending=false}
    if(kind==='entity_metadata'){
      const current=next.metadata?.get?.(9)?.value??next.metadata?.find?.(entry=>entry.key===9)?.value
      if(Number.isFinite(current)){if(health!==null&&current<health&&hurtTime===0)hurtPending=true;health=current}
    }
    for(const cue of next.cues||[]){
      if(cue.sequence<=maidCue)continue
      if(cue.kind==='hurt_animation'){hurtTime=10;hurtPending=false}
      if(cue.kind==='maid_animation')maidAnimationId=cue.code
      if(cue.kind==='animation'&&[0,3].includes(cue.code))swingPending=true
      maidCue=Math.max(maidCue,cue.sequence)
    }
  }
  function snapshot(){return {source:NATIVE_MOB_MOTION_SOURCE,tickMs:50,tick:ticks,sampledAt,position:{...position},yaw,pitch,headYaw,bodyYaw,
    previous:{...previous,position:{...previous.position}},walk:{...walk},slime:{squish,oSquish,targetSquish},chicken:{flap,oFlap,flapSpeed,oFlapSpeed},eatCounter,
    ...(isMaid?{maid:{hurtTime,hurtPending,swingPending,attackAnim:0,swingTime:0,swimAmount,swimAmountOld,animationId:maidAnimationId,source:'Minecraft_1.21.1_client_constructor_and_received_cues'}}:{}),
    living:living.current(),initialDefaultsSource:'Minecraft_1.21.1_client_constructor',animationParityVerified:false}}
  return {
    observe(next,kind){
      living.observe(next,kind)
      observeMaid(next,kind)
      if(['rel_entity_move','entity_move_look','entity_look','entity_teleport'].includes(kind)){
        target={...next.position};targetYaw=next.yaw;targetPitch=next.pitch;lerpSteps=3
      }
      if(kind==='entity_head_rotation'){targetHead=next.headYaw;headSteps=3}
    },
    tick(next,now){
      if(!Number.isFinite(now)||now<sampledAt)throw Error('NATIVE_ENTITY_MOTION_CLOCK_INVALID')
      previous={position:{...position},yaw,pitch,headYaw,bodyYaw};sampledAt=now;ticks++
      living.tick(next)
      if(isMaid){
        observeMaid(next,'tick');hurtTime=Math.max(0,hurtTime-1);swimAmountOld=swimAmount
        const flags=next.metadata?.get?.(0)?.value??next.metadata?.find?.(entry=>entry.key===0)?.value??0
        swimAmount=flags&16?Math.min(1,F(swimAmount+F(.09))):Math.max(0,F(swimAmount-F(.09)))
      }
      if(lerpSteps>0){for(const axis of ['x','y','z'])position[axis]+=(target[axis]-position[axis])/lerpSteps;yaw=F(yaw+wrap(targetYaw-yaw)/lerpSteps);pitch=F(pitch+(targetPitch-pitch)/lerpSteps);lerpSteps--}
      if(headSteps>0){headYaw=F(headYaw+wrap(targetHead-headYaw)/headSteps);headSteps--}
      const dx=position.x-previous.position.x,dz=position.z-previous.position.z
      const distance=F(Math.sqrt(dx*dx+dz*dz)),speedTarget=Math.min(F(distance*4),1)
      walk={speedOld:walk.speed,speed:F(walk.speed+F(F(speedTarget-walk.speed)*F(.4))),position:walk.position}
      walk.position=F(walk.position+walk.speed)
      if(dx*dx+dz*dz>2.500000277905201e-7){bodyYaw=yaw;headYaw=relative(headYaw,bodyYaw,75);lastStableHead=headYaw;headStable=0}
      else if(Math.abs(headYaw-lastStableHead)>15){headStable=0;lastStableHead=headYaw;bodyYaw=relative(bodyYaw,headYaw,75)}
      else {headStable++;if(headStable>10)bodyYaw=relative(bodyYaw,headYaw,75*(1-clamp((headStable-10)/10,0,1)))}
      const ground=next.onGround===true // Entity constructor's original default is false.
      for(const cue of next.cues||[]){if(cue.sequence<=lastCue)continue;if(next.name==='minecraft:sheep'&&cue.kind==='entity_status'&&cue.code===10)eatCounter=40;lastCue=Math.max(lastCue,cue.sequence)}
      if(next.name==='minecraft:sheep')eatCounter=Math.max(0,eatCounter-1)
      if(next.name==='minecraft:slime'){squish=F(squish+F(F(targetSquish-squish)*F(.5)));oSquish=squish;if(ground&&!wasOnGround)targetSquish=F(-.5);else if(!ground&&wasOnGround)targetSquish=1;wasOnGround=ground;targetSquish=F(targetSquish*F(.6))}
      if(next.name==='minecraft:chicken'){oFlap=flap;oFlapSpeed=flapSpeed;flapSpeed=clamp(F(flapSpeed+F((ground?-1:4)*F(.3))),0,1);if(!ground&&flapVelocity<1)flapVelocity=1;flapVelocity=F(flapVelocity*F(.9));flap=F(flap+F(flapVelocity*2))}
      return snapshot()
    },current:snapshot
  }
}

// Received projectile positions/angles are retained exactly; this interpolation
// never extrapolates a server flight, impact or an in-ground/shake state.
function createNativeProjectileMotion(entity) {
  let position={...entity.position},yaw=entity.yaw,pitch=entity.pitch,tick=0,sampledAt=entity.spawnedAt
  let previous={position:{...position},yaw,pitch}
  const current=()=>({source:NATIVE_MOB_MOTION_SOURCE,tickMs:50,tick,sampledAt,position:{...position},yaw,pitch,previous:{...previous,position:{...previous.position}},
    ageSource:'viewer_client_lifetime_not_server_age',flightPrediction:false})
  return {observe(){},current,tick(next,now){if(!Number.isFinite(now)||now<sampledAt)throw Error('NATIVE_PROJECTILE_MOTION_CLOCK_INVALID')
    previous={position:{...position},yaw,pitch};position={...next.position};yaw=next.yaw;pitch=next.pitch;sampledAt=now;tick++;return current()}}
}

// Item age/bobOffs are client fields, not synchronized server despawn age.
// Advance only from this action connection's actual physics ticks. Received
// positions remain authoritative; no client gravity or extra physics is added.
export function createNativeDroppedItemMotion(entity,{random=Math.random}={}) {
  let position={...entity.position},previous={position:{...position}},ticks=0,sampledAt=entity.spawnedAt
  const bobOffset=Math.fround(random()*Math.fround(Math.PI*2))
  const snapshot=()=>({source:NATIVE_MOB_MOTION_SOURCE,tickMs:50,tick:ticks,sampledAt,position:{...position},previous:{position:{...previous.position}},
    item:{clientLifetimeTicks:ticks,bobOffset,ageSource:'viewer_client_lifetime_not_server_despawn_age'}})
  return {observe(){},current:snapshot,tick(next,now){
    if(!Number.isFinite(now)||now<sampledAt)throw Error('NATIVE_ENTITY_MOTION_CLOCK_INVALID')
    previous={position:{...position}};position={...next.position};sampledAt=now;ticks++;return snapshot()
  }}
}
