import * as THREE from 'three'
import { createNativeEntityActor } from './native-entity-dispatch.js'
import { nativeContraptionGeometryKey } from './native-contraption.js'

// One connection, one epoch, actual entity IDs. Rendering work may complete
// after a disconnect; generation checks discard it instead of resurrecting it.
export class NativeEntityLayer {
  constructor(reader,{createActor=createNativeEntityActor,onChange=()=>{}}={}) {
    this.reader=reader;this.createActor=createActor;this.onChange=onChange;this.root=new THREE.Group()
    this.actors=new Map();this.failures=new Map();this.data=new Map();this.generation=0;this.pending=null;this.running=false;this.disposed=false;this.streamReason=null
    this.pickups=new Map();this.pickupSeen=new Set();this.collected=new Map();this.clock=null
  }
  stage(state,{selfEntityId,playerUuid}={}) {
    if(this.disposed)return
    if(!state?.available){this.reset();this.streamReason=state?.reason??'NATIVE_ENTITY_STREAM_UNAVAILABLE';this.onChange();return}
    const registries=state.renderRegistries?.playerUuid===playerUuid&&state.renderRegistries?.source==='server_builtin_registries'?state.renderRegistries:null
    this.streamReason=null
    const entities=state.entities.filter(entity=>entity.entityId!==selfEntityId)
    this.data=new Map(entities.map(entity=>[entity.entityId,entity]))
    for(const [id,uuid]of this.collected)if(this.data.get(id)?.uuid!==uuid)this.collected.delete(id)
    this.pending={entities,registries,generation:this.generation};void this.drain()
  }
  signature(entity,registries) {
    return JSON.stringify([entity.uuid,entity.name,entity.metadata,entity.equipment,Boolean(entity.motion),entity.name==='minecraft:villager'?registries:null,
      entity.name==='touhou_little_maid:maid'?[entity.maidRenderState,entity.motion?.maid?.hurtTime>0,entity.motion?.maid?.hurtPending,entity.motion?.maid?.swingPending,entity.motion?.maid?.animationId,entity.motion?.maid?.swimAmount>0||entity.motion?.maid?.swimAmountOld>0]:null,
      entity.name.startsWith('create:')?nativeContraptionGeometryKey(entity):null])
  }
  async drain() {
    if(this.running||this.disposed)return
    this.running=true
    try {
      while(this.pending&&!this.disposed){
        const {entities,registries,generation}=this.pending;this.pending=null
        const present=new Set(entities.map(entity=>entity.entityId))
        for(const [id,row] of this.actors)if(!present.has(id)){row.actor.dispose();this.actors.delete(id)}
        for(const id of this.failures.keys())if(!present.has(id))this.failures.delete(id)
        for(const entity of entities){
          if(generation!==this.generation||this.disposed)break
          const key=this.signature(entity,registries),old=this.actors.get(entity.entityId)
          if(old?.key===key)continue
          if(old){old.actor.dispose();this.actors.delete(entity.entityId)}
          if(this.failures.get(entity.entityId)?.key===key)continue
          try {
            const actor=await this.createActor(this.reader,entity,{registries})
            if(generation!==this.generation||this.disposed){actor.dispose();break}
            this.actors.set(entity.entityId,{key,actor});this.root.add(actor.root);this.failures.delete(entity.entityId)
          } catch(error) {
            if(generation===this.generation&&!this.disposed)this.failures.set(entity.entityId,{key,name:entity.name,reason:error.message})
          }
        }
        if(generation===this.generation&&!this.disposed)this.onChange()
      }
    } finally {this.running=false}
  }
  async collect(value) {
    if(this.disposed||value.source!=='received_native_collect_packet'||!Number.isSafeInteger(value.tick)||value.count<=0)return
    const key=`${value.epoch}:${value.sequence}`,entity=value.entity,observed=entity?.itemState?.item
    if(this.pickupSeen.has(key)||entity?.entityId!==value.collectedEntityId||!observed?.snbt||value.count>observed.count)return
    this.pickupSeen.add(key);if(this.pickupSeen.size>48)this.pickupSeen.delete(this.pickupSeen.values().next().value)
    if(value.count===observed.count)this.collected.set(entity.entityId,entity.uuid)
    if(!value.target||!['x','y','z'].every(k=>Number.isFinite(value.target[k])))return
    while(this.pickups.size>=16){const first=this.pickups.keys().next().value;this.pickups.get(first).actor?.dispose();this.pickups.delete(first)}
    const generation=this.generation,item={...observed,count:value.count,snbt:observed.snbt.replace(/,count:\d+/,`,count:${value.count}`)}
    const row={actor:null,entity:{...entity,itemState:{...entity.itemState,item}},startTick:value.tick,start:{...entity.position},target:{...value.target}}
    this.pickups.set(key,row)
    try {
      const actor=await this.createActor(this.reader,row.entity)
      if(this.disposed||generation!==this.generation||this.pickups.get(key)!==row){actor.dispose();return}
      row.actor=actor;this.root.add(actor.root)
    }catch{if(this.pickups.get(key)===row)this.pickups.delete(key)}
  }
  frame(now,clock=null) {
    if(this.disposed)return
    this.clock=clock
    for(const [key,row]of this.pickups) {
      if(!Number.isSafeInteger(clock?.tick)||!Number.isFinite(clock.sampledAt)||now-clock.sampledAt>1000){if(row.actor)row.actor.root.visible=false;continue}
      const partial=Math.max(0,Math.min(1,(now-clock.sampledAt)/50)),time=(clock.tick-row.startTick+partial)/3
      if(time>=1){row.actor?.dispose();this.pickups.delete(key);continue}
      if(row.actor){const t=Math.max(0,time)**2;row.actor.root.visible=true;row.actor.root.position.set(...['x','y','z'].map(k=>row.start[k]+(row.target[k]-row.start[k])*t))}
    }
    for(const [id,row] of this.actors){
      const entity=this.data.get(id)
      if(!entity){row.actor.root.visible=false;continue}
      try {row.actor.update(entity,now);if(this.collected.get(id)===entity.uuid)row.actor.root.visible=false} catch(error){
        row.actor.dispose();this.actors.delete(id);this.failures.set(id,{key:row.key,name:entity.name,reason:error.message});this.onChange()
      }
    }
  }
  diagnostics() {
    const motionIssues=[...this.actors.values()].map(row=>row.actor.root.userData.nativeContraption?.reason).filter(Boolean)
    return {received:this.data.size,rendered:this.actors.size,droppedItems:[...this.actors.values()].map(row=>row.actor.root.userData.nativeDroppedItem).filter(Boolean),pickupAnimations:this.pickups.size,
      issues:[...(this.streamReason?[this.streamReason]:[]),...motionIssues,...this.failures.values()].map(row=>typeof row==='string'?row:`${row.name}：${row.reason}`),completeEntityParityVerified:false}
  }
  reset() {
    this.generation++;this.pending=null;for(const row of this.actors.values())row.actor.dispose();this.actors.clear();this.failures.clear();this.data.clear();this.root.clear();this.streamReason=null
    for(const row of this.pickups.values())row.actor?.dispose();this.pickups.clear();this.pickupSeen.clear();this.collected.clear();this.clock=null
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.reset();this.root.removeFromParent()}
}
