// Matched vanilla 1.21.1 SynchedEntityData, not proxy or mod defaults.
export const NATIVE_HOSTILE_TYPES=Object.freeze(['minecraft:zombie','minecraft:husk','minecraft:drowned','minecraft:zombie_villager',
  'minecraft:skeleton','minecraft:stray','minecraft:wither_skeleton','minecraft:bogged','minecraft:creeper','minecraft:spider',
  'minecraft:cave_spider','minecraft:enderman','minecraft:witch','minecraft:iron_golem'])
export const nativeHostileType=name=>NATIVE_HOSTILE_TYPES.includes(name)
const SERIALIZER={byte:0,int:1,float:3,boolean:8,pose:21,optional_component:6,optional_block_state:15,villager_data:19}
export function nativeLivingMeta(entity,key,type,defaultValue) {
  const row=entity.metadata?.get?.(key)??entity.metadata?.find?.(entry=>entry.key===key)
  if(!row)return defaultValue
  if(row.type!==type&&row.type!==SERIALIZER[type])throw Error(`NATIVE_LIVING_METADATA_SERIALIZER_UNSUPPORTED:${key}`)
  const value=row.value
  if((type==='boolean'&&typeof value!=='boolean')||(['int','byte','pose'].includes(type)&&!Number.isInteger(value))||
    (type==='byte'&&(value < -128 || value > 127))||(type==='float'&&!Number.isFinite(value))||
    (type==='optional_block_state'&&value!==null&&(!Number.isSafeInteger(value)||value<0)))throw Error(`NATIVE_LIVING_METADATA_INVALID:${key}`)
  return value
}
export function nativeHostileState(entity) {
  if(!nativeHostileType(entity?.name)||!Number.isSafeInteger(entity.entityId)||typeof entity.uuid!=='string'||!Array.isArray(entity.metadata)||
    !entity.position||![entity.position.x,entity.position.y,entity.position.z,entity.yaw,entity.pitch,entity.headYaw].every(Number.isFinite))throw Error('NATIVE_LIVING_STATE_INVALID')
  const read=(key,type,value)=>nativeLivingMeta(entity,key,type,value),flags=read(0,'byte',0),mob=read(15,'byte',0)
  const state={name:entity.name,invisible:!!(flags&32),fire:!!(flags&1),outline:!!(flags&64),crouching:!!(flags&2),swimming:!!(flags&16),
    pose:read(6,'pose',0),health:read(9,'float',1),mainArm:mob&2?'left':'right',aggressive:!!(mob&4),baby:false,
    defaultsSource:'Minecraft_1.21.1_defineSynchedData',equipment:entity.equipment??[]}
  if(['minecraft:zombie','minecraft:husk','minecraft:drowned','minecraft:zombie_villager'].includes(entity.name))state.baby=read(16,'boolean',false)
  if(entity.name==='minecraft:creeper'){state.swellDirection=read(16,'int',-1);state.powered=read(17,'boolean',false);state.ignited=read(18,'boolean',false)}
  if(entity.name==='minecraft:bogged')state.sheared=read(16,'boolean',false)
  if(entity.name==='minecraft:enderman'){const wire=read(16,'optional_block_state',null);state.carriedBlock=wire===null||wire===0?null:wire-1;state.creepy=read(17,'boolean',false);state.stared=read(18,'boolean',false)}
  if(entity.name==='minecraft:witch')state.usingItem=read(17,'boolean',false)
  return state
}

// Original LivingEntity client counters. Only real received cues and connection
// ticks advance them; a renderer frame never invents a hurt, swing or death.
export function createNativeLivingAnimation(entity) {
  let hurtTime=0,deathTime=0,dead=false,lastCue=0,swinging=false,swingTime=0,attackAnim=0,attackAnimOld=0,attackHand='mainhand'
  let attackTimer=0,flowerTimer=0,swell=0,oldSwell=0
  const effects=new Map()
  const duration=()=>effects.has('minecraft:haste')?6-(1+effects.get('minecraft:haste').amplifier):
    effects.has('minecraft:mining_fatigue')?6+(1+effects.get('minecraft:mining_fatigue').amplifier)*2:6
  const observe=(next,kind)=>{
    if(['entity_effect','spawn'].includes(kind))for(const effect of next.effects??[])if(effect?.name)effects.set(effect.name,{...effect})
    if(kind==='remove_entity_effect')for(const name of effects.keys())if(!(next.effects??[]).some(e=>e.name===name))effects.delete(name)
    const health=next.metadata?.get?.(9)?.value??next.metadata?.find?.(row=>row.key===9)?.value
    if(Number.isFinite(health)&&health<=0)dead=true
    for(const cue of next.cues??[]) {
      if(cue.sequence<=lastCue)continue
      if(cue.kind==='hurt_animation')hurtTime=10
      if(cue.kind==='entity_status'&&cue.code===3)dead=true
      if(cue.kind==='animation'&&[0,3].includes(cue.code)&&(!swinging||swingTime>=duration()/2||swingTime<0)){
        swinging=true;swingTime=-1;attackHand=cue.code===3?'offhand':'mainhand'
      }
      if(next.name==='minecraft:iron_golem'&&cue.kind==='entity_status'){
        if(cue.code===4)attackTimer=10
        if(cue.code===11)flowerTimer=400
        if(cue.code===34)flowerTimer=0
      }
      lastCue=Math.max(lastCue,cue.sequence)
    }
  }
  const snapshot=()=>({hurtTime,deathTime,dead,attackAnim,attackAnimOld,attackHand,attackTimer,flowerTimer,swell,oldSwell,
    source:'Minecraft_1.21.1_client_constructor_and_received_cues'})
  observe(entity,'spawn')
  return {observe,current:snapshot,tick(next){
    observe(next,'tick');hurtTime=Math.max(0,hurtTime-1);if(dead)deathTime++
    attackAnimOld=attackAnim
    const ticks=duration()
    if(swinging){swingTime++;if(swingTime>=ticks){swingTime=0;swinging=false}}else swingTime=0
    attackAnim=ticks>0?Math.fround(swingTime/ticks):0
    attackTimer=Math.max(0,attackTimer-1);flowerTimer=Math.max(0,flowerTimer-1)
    for(const [name,effect]of effects)if(effect.duration!==-1&&--effect.duration<=0)effects.delete(name)
    if(next.name==='minecraft:creeper'){
      const direction=nativeLivingMeta(next,18,'boolean',false)?1:nativeLivingMeta(next,16,'int',-1)
      oldSwell=swell;swell=Math.max(0,Math.min(30,swell+direction))
    }
    return snapshot()
  }}
}
