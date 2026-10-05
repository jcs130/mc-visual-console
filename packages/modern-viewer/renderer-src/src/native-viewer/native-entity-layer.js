import * as THREE from 'three'
import { createNativeEntityActor } from './native-entity-dispatch.js'

// One connection, one epoch, actual entity IDs. Rendering work may complete
// after a disconnect; generation checks discard it instead of resurrecting it.
export class NativeEntityLayer {
  constructor(reader,{createActor=createNativeEntityActor,onChange=()=>{}}={}) {
    this.reader=reader;this.createActor=createActor;this.onChange=onChange;this.root=new THREE.Group()
    this.actors=new Map();this.failures=new Map();this.data=new Map();this.generation=0;this.pending=null;this.running=false;this.disposed=false;this.streamReason=null
  }
  stage(state,{selfEntityId,playerUuid}={}) {
    if(this.disposed)return
    if(!state?.available){this.reset();this.streamReason=state?.reason??'NATIVE_ENTITY_STREAM_UNAVAILABLE';this.onChange();return}
    const registries=state.renderRegistries?.playerUuid===playerUuid&&state.renderRegistries?.source==='server_builtin_registries'?state.renderRegistries:null
    this.streamReason=null
    const entities=state.entities.filter(entity=>entity.entityId!==selfEntityId)
    this.data=new Map(entities.map(entity=>[entity.entityId,entity]))
    this.pending={entities,registries,generation:this.generation};void this.drain()
  }
  signature(entity,registries) {
    return JSON.stringify([entity.uuid,entity.name,entity.metadata,entity.equipment,Boolean(entity.motion),entity.name==='minecraft:villager'?registries:null])
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
  frame(now) {
    if(this.disposed)return
    for(const [id,row] of this.actors){
      const entity=this.data.get(id)
      if(!entity){row.actor.root.visible=false;continue}
      try {row.actor.update(entity,now)} catch(error){
        row.actor.dispose();this.actors.delete(id);this.failures.set(id,{key:row.key,name:entity.name,reason:error.message});this.onChange()
      }
    }
  }
  diagnostics() {
    return {received:this.data.size,rendered:this.actors.size,issues:[...(this.streamReason?[this.streamReason]:[]),...this.failures.values()].map(row=>typeof row==='string'?row:`${row.name}：${row.reason}`),completeEntityParityVerified:false}
  }
  reset() {
    this.generation++;this.pending=null;for(const row of this.actors.values())row.actor.dispose();this.actors.clear();this.failures.clear();this.data.clear();this.root.clear();this.streamReason=null
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.reset();this.root.removeFromParent()}
}
