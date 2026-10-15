import * as THREE from 'three'
import { createNativeEntityActor } from './native-entity-dispatch.js'
import { nativeContraptionGeometryKey } from './native-contraption.js'
import { NativeEntityPresentation } from './native-entity-presentation.js'
const identityKey=entity=>entity?.uuid??`native-id-spawn:${entity?.spawnedAt}`

// One connection, one epoch, actual entity IDs. Rendering work may complete
// after a disconnect; generation checks discard it instead of resurrecting it.
export class NativeEntityLayer {
  constructor(reader,{createActor=createNativeEntityActor,onChange=()=>{},now=()=>Date.now()}={}) {
    this.reader=reader;this.createActor=createActor;this.onChange=onChange;this.root=new THREE.Group()
    this.actors=new Map();this.failures=new Map();this.data=new Map();this.generation=0;this.pending=null;this.running=false;this.disposed=false;this.streamReason=null
    this.pickups=new Map();this.pickupSeen=new Set();this.collected=new Map();this.clock=null
    this.now=now;this.presentations=new Map()
  }
  stage(state,{selfEntityId,playerUuid}={}) {
    if(this.disposed)return
    if(!state?.available){this.reset();this.streamReason=state?.reason??'NATIVE_ENTITY_STREAM_UNAVAILABLE';this.onChange();return}
    const registries=state.renderRegistries?.playerUuid===playerUuid&&state.renderRegistries?.source==='server_builtin_registries'?state.renderRegistries:null
    this.streamReason=null
    const entities=state.entities.filter(entity=>entity.entityId!==selfEntityId)
    this.data=new Map(entities.map(entity=>[entity.entityId,entity]))
    const receivedAt=this.now()
    for(const [id,row]of this.presentations)if(!this.data.has(id)||identityKey(this.data.get(id))!==row.identity)this.presentations.delete(id)
    for(const entity of entities)if(entity.motion?.walk){
      let row=this.presentations.get(entity.entityId)
      if(!row){row={identity:identityKey(entity),buffer:new NativeEntityPresentation()};this.presentations.set(entity.entityId,row)}
      row.buffer.push(entity,receivedAt)
    }
    for(const [id,identity]of this.collected)if(!this.data.has(id)||identityKey(this.data.get(id))!==identity)this.collected.delete(id)
    this.pending={entities,registries,generation:this.generation};void this.drain()
  }
  signature(entity,registries) {
    return JSON.stringify([identityKey(entity),entity.name,entity.experienceValue,entity.objectData,entity.metadata,entity.equipment,Boolean(entity.motion),entity.name==='minecraft:villager'?registries:null,
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
    if(this.disposed||value.source!=='received_native_collect_packet'||!Number.isSafeInteger(value.tick)||!Number.isSafeInteger(value.count)||value.count<0)return
    const key=`${value.epoch}:${value.sequence}`,entity=value.entity,observed=entity?.itemState?.item,orb=entity?.name==='minecraft:experience_orb'
    if(this.pickupSeen.has(key)||entity?.entityId!==value.collectedEntityId||(!orb&&(!observed?.snbt||value.count<=0||value.count>observed.count)))return
    this.pickupSeen.add(key);if(this.pickupSeen.size>48)this.pickupSeen.delete(this.pickupSeen.values().next().value)
    if(orb||value.count===observed.count)this.collected.set(entity.entityId,identityKey(entity))
    if(!value.target||!['x','y','z'].every(k=>Number.isFinite(value.target[k])))return
    while(this.pickups.size>=16){const first=this.pickups.keys().next().value;this.pickups.get(first).actor?.dispose();this.pickups.delete(first)}
    const generation=this.generation,item=orb?null:{...observed,count:value.count,snbt:observed.snbt.replace(/,count:\d+/,`,count:${value.count}`)}
    const row={actor:null,entity:orb?entity:{...entity,itemState:{...entity.itemState,item}},startTick:value.tick,start:{...entity.position},target:{...value.target},collectorEntityId:value.collectorEntityId,lastTargetTick:value.tick,oldTarget:{...value.target}}
    this.pickups.set(key,row)
    try {
      const actor=await this.createActor(this.reader,row.entity)
      if(this.disposed||generation!==this.generation||this.pickups.get(key)!==row){actor.dispose();return}
      row.actor=actor;this.root.add(actor.root)
    }catch{if(this.pickups.get(key)===row)this.pickups.delete(key)}
  }
  frame(now,clock=null,self=null,camera=null) {
    if(this.disposed)return
    this.clock=clock
    for(const [key,row]of this.pickups) {
      if(!Number.isSafeInteger(clock?.tick)||!Number.isFinite(clock.sampledAt)||now-clock.sampledAt>1000){if(row.actor)row.actor.root.visible=false;continue}
      const partial=Math.max(0,Math.min(1,(now-clock.sampledAt)/50)),time=(clock.tick-row.startTick+partial)/3
      if(time>=1){row.actor?.dispose();this.pickups.delete(key);continue}
      if(row.lastTargetTick!==clock.tick){
        const p=self&&self.entityId===row.collectorEntityId?self.position:null
        if(p&&['x','y','z','eyeHeight'].every(k=>Number.isFinite(p[k]))){row.oldTarget=row.target;row.target={x:p.x,y:p.y+p.eyeHeight/2,z:p.z}}
        row.lastTargetTick=clock.tick
      }
      if(row.actor){const t=Math.max(0,time)**2;row.actor.root.visible=true;row.actor.root.position.set(...['x','y','z'].map(k=>{
        const target=row.oldTarget[k]+(row.target[k]-row.oldTarget[k])*partial;return row.start[k]+(target-row.start[k])*t
      }))}
    }
    for(const [id,row] of this.actors){
      const entity=this.data.get(id)
      if(!entity){row.actor.root.visible=false;continue}
      try {row.actor.update(this.presentations.get(id)?.buffer.sample(entity,now)??entity,now,{self,entities:this.data,camera});if(this.collected.get(id)===identityKey(entity))row.actor.root.visible=false} catch(error){
        row.actor.dispose();this.actors.delete(id);this.failures.set(id,{key:row.key,name:entity.name,reason:error.message});this.onChange()
      }
    }
  }
  diagnostics() {
    const motionIssues=[...this.actors.values()].flatMap(row=>[row.actor.root.userData.nativeContraption?.reason,...(row.actor.root.userData.nativeLiving?.issues??[]),...(row.actor.root.userData.nativeProjectile?.issues??[])]).filter(Boolean)
    return {received:this.data.size,rendered:this.actors.size,droppedItems:[...this.actors.values()].map(row=>row.actor.root.userData.nativeDroppedItem).filter(Boolean),pickupAnimations:this.pickups.size,
      issues:[...(this.streamReason?[this.streamReason]:[]),...motionIssues,...this.failures.values()].map(row=>typeof row==='string'?row:`${row.name}：${row.reason}`),completeEntityParityVerified:false}
  }
  reset() {
    this.generation++;this.pending=null;for(const row of this.actors.values())row.actor.dispose();this.actors.clear();this.failures.clear();this.data.clear();this.root.clear();this.streamReason=null
    for(const row of this.pickups.values())row.actor?.dispose();this.pickups.clear();this.pickupSeen.clear();this.collected.clear();this.presentations.clear();this.clock=null
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.reset();this.root.removeFromParent()}
}
