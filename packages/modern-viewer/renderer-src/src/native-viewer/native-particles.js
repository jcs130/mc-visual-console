import * as THREE from 'three'
import {resourcePath} from './model-loader.js'
import {nativeClientSourceVerified} from './native-client-source.js'
import {ENTITY_MODEL_CLIENT_SHA256} from './native-entity-model.js'
import {createHiddenSolidLookup} from './native-hidden-solids.js'
import {NativeParticleRandom,NATIVE_PARTICLE_TYPES,expandNativeParticlePacket,createNativeParticle,tickNativeParticle,nativeParticleFrame,collideNativeParticleShapes} from './native-particle-state.js'
const key=(x,y,z)=>`${x},${y},${z}`
async function texture(bytes){const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));try{return await new THREE.TextureLoader().loadAsync(url)}finally{URL.revokeObjectURL(url)}}

export function createNativeParticleCollision(snapshot){
  if(snapshot?.particleCollisions?.available!==true)throw Error('NATIVE_PARTICLE_COLLISION_TABLE_UNAVAILABLE')
  const states=new Map(snapshot.states.map(s=>[s.stateId,s])),cells=new Map(),received=new Set(snapshot.viewCoverage?.receivedColumns??[])
  for(const g of snapshot.groups)for(let i=0;i<g.positions.length;i+=3)cells.set(key(...g.positions.slice(i,i+3)),states.get(g.stateId))
  const bounds=snapshot.bounds,hidden=createHiddenSolidLookup(snapshot)
  return(box,v)=>{
    const shapes=[],sweep=box.map((n,i)=>n+(i<3?Math.min:Math.max)(0,v[['x','y','z'][i%3]])),epsilon=1e-7
    const lo=[0,1,2].map(i=>Math.floor(sweep[i]-epsilon)-1)
    const hi=[0,1,2].map(i=>Math.floor(sweep[i+3]+epsilon)+1)
    if((hi[0]-lo[0]+1)*(hi[1]-lo[1]+1)*(hi[2]-lo[2]+1)>512)throw Error('NATIVE_PARTICLE_COLLISION_BUDGET_EXCEEDED')
    for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
      if(x<bounds.minX||x>bounds.maxX||y<bounds.minY||y>bounds.maxY||z<bounds.minZ||z>bounds.maxZ||!received.has(`${Math.floor(x/16)},${Math.floor(z/16)}`))throw Error('NATIVE_PARTICLE_COLLISION_WORLD_UNRECEIVED')
      const state=cells.get(key(x,y,z))??hidden(x,y,z);if(!state)continue // Hidden solids remain real collision data.
      const padding=[x===lo[0]||x===hi[0],y===lo[1]||y===hi[1],z===lo[2]||z===hi[2]].filter(Boolean).length
      if(padding===3||padding===1&&!state.collisionLarge||padding===2&&state.name!=='minecraft:moving_piston')continue
      if(!Array.isArray(state.collisionBoxes)||!state.collisionVoxel)throw Error('NATIVE_PARTICLE_DYNAMIC_COLLISION_UNAVAILABLE')
      const tolerance=state.collisionFullBlock?0:epsilon
      if(state.collisionBoxes.some(b=>[0,1,2].every(i=>sweep[i+3]>b[i]+[x,y,z][i]+tolerance&&sweep[i]<b[i+3]+[x,y,z][i]-tolerance)))shapes.push({voxel:state.collisionVoxel,position:[x,y,z]})
    }
    return collideNativeParticleShapes(box,v,shapes)
  }
}

export class NativeParticleLayer {
  constructor(reader,{loadTexture=texture,onChange=()=>{},seed=Date.now()}={}){
    this.reader=reader;this.loadTexture=loadTexture;this.onChange=onChange;this.root=new THREE.Group();this.root.name='received-native-particles'
    this.templates=new Map();this.live=new Set();this.seen=new Set();this.issues=new Set();this.generation=0;this.serial=0;this.pending=0;this.collisionCache=null;this.disposed=false
    this.packetRandom=new NativeParticleRandom(seed);this.mathRandom=new NativeParticleRandom(BigInt(seed)+1n);this.worldRandom=new NativeParticleRandom(BigInt(seed)+2n)
    this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([1,-1,0,1,1,0,-1,1,0,-1,-1,0],3))
    this.geometry.setAttribute('uv',new THREE.Float32BufferAttribute([1,0,1,1,0,1,0,0],2));this.geometry.setIndex([0,1,2,0,2,3])
  }
  diagnostics(){return{active:this.live.size,pending:this.pending,issues:[...this.issues],randomPhase:'observer_local_not_server_seed',completeParticleParityVerified:false}}
  collisionFor(snapshot){
    const inputs=[snapshot?.groups,snapshot?.states,snapshot?.bounds,snapshot?.viewCoverage?.receivedColumns,snapshot?.particleCollisions]
    if(!this.collisionCache||inputs.some((input,i)=>input!==this.collisionCache.inputs[i]))this.collisionCache={inputs,collide:createNativeParticleCollision(snapshot)}
    return this.collisionCache.collide
  }
  async template(name){
    if(!nativeClientSourceVerified(this.reader.manifest,ENTITY_MODEL_CLIENT_SHA256))throw Error('NATIVE_PARTICLE_ORIGINAL_SOURCE_UNVERIFIED')
    if(!this.templates.has(name))this.templates.set(name,(async()=>{
      const definition=await this.reader.json(resourcePath(name,'particles','.json'))
      if(!Array.isArray(definition.textures)||!definition.textures.length||definition.textures.length>32)throw Error('NATIVE_PARTICLE_SPRITES_INVALID')
      const maps=[]
      try{for(const id of definition.textures){const map=await this.loadTexture(await this.reader.bytes(resourcePath(id,'textures/particle','.png')));map.colorSpace=THREE.SRGBColorSpace;map.magFilter=map.minFilter=THREE.NearestFilter;maps.push(map)}return maps}
      catch(error){for(const map of maps)map.dispose();throw error}
    })())
    return this.templates.get(name)
  }
  async event(message,clock){
    const value=message.effect?.value,id=`${message.epoch}:${message.sequence}`
    if(this.disposed||!NATIVE_PARTICLE_TYPES.includes(value?.name)||this.seen.has(id))return
    this.seen.add(id);if(this.seen.size>256)this.seen.delete(this.seen.values().next().value)
    const count=value.count===0?1:value.count
    if(!Number.isInteger(count)||count<1||count>256||this.live.size+this.pending+count>2048){this.issues.add('NATIVE_PARTICLE_REQUEST_EXCEEDS_VIEWER_BUDGET');this.onChange();return}
    const generation=this.generation
    this.pending+=count
    try{
      const maps=await this.template(value.name)
      if(this.disposed||generation!==this.generation||Date.now()-message.observedAt>3000)return
      const start=message.tick
      if(!Number.isSafeInteger(start))throw Error('NATIVE_PARTICLE_CONNECTION_CLOCK_UNAVAILABLE')
      for(const sample of expandNativeParticlePacket(value,this.packetRandom)){
        if(!Object.values(sample.position).every(Number.isFinite)||!Object.values(sample.velocity).every(Number.isFinite))continue
        const state=createNativeParticle(value.name,sample.position,sample.velocity,{particle:new NativeParticleRandom(BigInt(message.sequence)+BigInt(++this.serial)*25214903917n),math:this.mathRandom,world:this.worldRandom})
        if(!Object.values(state.position).every(Number.isFinite)||!Object.values(state.velocity).every(Number.isFinite))continue
        const material=new THREE.MeshBasicMaterial({map:maps[0],alphaTest:.1,transparent:false,depthWrite:true,toneMapped:false})
        const mesh=new THREE.Mesh(this.geometry,material);this.root.add(mesh);this.live.add({state,mesh,maps,tick:start})
      }
      if(!['explosion','sweep_attack'].includes(value.name))this.issues.add('NATIVE_PARTICLE_LIGHTMAP_UNAVAILABLE')
      this.onChange()
    }catch(error){if(!this.disposed&&generation===this.generation){this.issues.add(error.message);this.onChange()}}
    finally{if(generation===this.generation)this.pending-=count}
  }
  frame(now,clock,camera,snapshot){
    if(this.disposed||!Number.isSafeInteger(clock?.tick)||!Number.isFinite(clock?.sampledAt))return
    const tick=clock.tick,partial=Math.max(0,Math.min(1,(now-clock.sampledAt)/50))
    let collide=null
    for(const row of [...this.live])try{
      if(tick-row.tick>100){this.remove(row);continue}
      while(row.tick<tick&&!row.state.removed){
        if(row.state.physics&&!['flame','small_flame'].includes(row.state.name))collide??=this.collisionFor(snapshot)
        tickNativeParticle(row.state,collide);row.tick++
      }
      const frame=nativeParticleFrame(row.state,partial,row.maps.length)
      if(!frame){this.remove(row);continue}
      row.mesh.position.set(frame.position.x,frame.position.y,frame.position.z);row.mesh.quaternion.copy(camera.quaternion);row.mesh.scale.setScalar(frame.size)
      row.mesh.material.map=row.maps[frame.sprite];row.mesh.material.color.setRGB(...frame.color)
    }catch(error){this.issues.add(error.message);this.remove(row);this.onChange()}
  }
  remove(row){if(!this.live.delete(row))return;row.mesh.removeFromParent();row.mesh.material.dispose()}
  reset(){this.generation++;for(const row of [...this.live])this.remove(row);this.seen.clear();this.issues.clear();this.pending=0;this.collisionCache=null}
  dispose(){if(this.disposed)return;this.disposed=true;this.reset();this.geometry.dispose();for(const promise of this.templates.values())void promise.then(maps=>{for(const map of maps)map.dispose()},()=>{});this.templates.clear();this.root.removeFromParent()}
}
