// Locked 1.21.1: LivingEntity/WalkAnimationState, BodyRotationControl,
// Chicken.aiStep, Sheep.handleEntityEvent/aiStep and Slime.tick. Runs only on
// the action connection's actual physicsTick; browser time never creates ticks.
const F=Math.fround, clamp=(v,a,b)=>Math.max(a,Math.min(b,v))
const wrap=v=>((v+180)%360+360)%360-180
const relative=(a,b,max)=>F(b-clamp(wrap(b-a),-max,max))
export const NATIVE_MOB_MOTION_SOURCE='same_connection_entity_ticks'
export const NATIVE_MOB_TYPES=Object.freeze(['minecraft:pig','minecraft:cow','minecraft:chicken','minecraft:sheep','minecraft:slime','minecraft:villager'])
const types=new Set(NATIVE_MOB_TYPES)

export function createNativeEntityMotion(entity) {
  if(!types.has(entity?.name))return null
  let position={...entity.position},yaw=entity.yaw,pitch=entity.pitch,headYaw=entity.headYaw,bodyYaw=yaw
  let target={...position},targetYaw=yaw,targetPitch=pitch,targetHead=headYaw,lerpSteps=0,headSteps=0
  let walk={speedOld:0,speed:0,position:0},ticks=0,headStable=0,lastStableHead=headYaw,lastCue=0
  let squish=0,oSquish=0,targetSquish=0,wasOnGround=false,flap=0,oFlap=0,flapSpeed=0,oFlapSpeed=0,flapVelocity=1,eatCounter=0
  let sampledAt=entity.spawnedAt,previous={position:{...position},yaw,pitch,headYaw,bodyYaw}
  function snapshot(){return {source:NATIVE_MOB_MOTION_SOURCE,tickMs:50,tick:ticks,sampledAt,position:{...position},yaw,pitch,headYaw,bodyYaw,
    previous:{...previous,position:{...previous.position}},walk:{...walk},slime:{squish,oSquish,targetSquish},chicken:{flap,oFlap,flapSpeed,oFlapSpeed},eatCounter,
    initialDefaultsSource:'Minecraft_1.21.1_client_constructor',animationParityVerified:false}}
  return {
    observe(next,kind){
      if(['rel_entity_move','entity_move_look','entity_look','entity_teleport'].includes(kind)){
        target={...next.position};targetYaw=next.yaw;targetPitch=next.pitch;lerpSteps=3
      }
      if(kind==='entity_head_rotation'){targetHead=next.headYaw;headSteps=3}
    },
    tick(next,now){
      if(!Number.isFinite(now)||now<sampledAt)throw Error('NATIVE_ENTITY_MOTION_CLOCK_INVALID')
      previous={position:{...position},yaw,pitch,headYaw,bodyYaw};sampledAt=now;ticks++
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
