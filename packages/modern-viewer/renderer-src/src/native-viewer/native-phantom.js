import * as THREE from 'three'
import {nativeLivingMeta} from './native-living-state.js'
import {nativePlayerCos as cos} from './native-player-motion.js'
import {loadOriginalModelLayers,createOriginalModelLayer,ORIGINAL_MODEL_LAYERS_PATH} from './native-original-model-layers.js'
import {ENTITY_MODEL_CLIENT_SHA256} from './native-entity-model.js'
import {nativeLivingOverlay} from './native-hostile-actors.js'

const F=Math.fround,RAD=F(Math.PI/180),mix=(a,b,t)=>a+(b-a)*t,wrap=v=>((v+180)%360+360)%360-180
export function nativePhantomState(entity){
 if(entity?.name!=='minecraft:phantom'||!Number.isSafeInteger(entity.entityId)||typeof entity.uuid!=='string'||!Array.isArray(entity.metadata)||
   !entity.position||![entity.position.x,entity.position.y,entity.position.z,entity.yaw,entity.pitch,entity.headYaw].every(Number.isFinite))throw Error('NATIVE_PHANTOM_STATE_INVALID')
 const flags=nativeLivingMeta(entity,0,'byte',0),size=nativeLivingMeta(entity,16,'int',0)
 if(size<0||size>64)throw Error('NATIVE_PHANTOM_SIZE_INVALID')
 return {size,invisible:!!(flags&32),fire:!!(flags&1),outline:!!(flags&64),health:nativeLivingMeta(entity,9,'float',1),pose:nativeLivingMeta(entity,6,'pose',0)}
}
// Locked original fwl.setupAnim and ckf.getUniqueFlapTickOffset (entity ID * 3).
// The native tick counter is the observed client constructor's age, not wall time.
export function animateNativePhantom(model,entityId,age){
 if(!Number.isSafeInteger(entityId)||!Number.isFinite(age))throw Error('NATIVE_PHANTOM_ANIMATION_INVALID')
 for(const part of model.definition.parts){const bone=model.bones.get(part.path);bone.position.fromArray(part.pivot);bone.rotation.set(...part.rotationZYX,'ZYX')}
 const phase=F(F(F(F(Math.imul(entityId,3))+F(age))*F(7.448451))*RAD)
 const wing=F(F(cos(phase)*F(16))*RAD),tail=F(-F(F(5)+F(cos(F(phase*F(2)))*F(5)))*RAD)
 for(const name of ['left_wing_base','left_wing_tip'])model.bones.get(name).rotation.z=wing
 for(const name of ['right_wing_base','right_wing_tip'])model.bones.get(name).rotation.z=-wing
 for(const name of ['tail_base','tail_tip'])model.bones.get(name).rotation.x=tail
 return {phase,wing,tail}
}
export async function createNativePhantomActor(reader,entity,{loadTexture}={}){
 nativePhantomState(entity)
 const original=await loadOriginalModelLayers(reader),root=new THREE.Group(),death=new THREE.Group(),flight=new THREE.Group(),flip=new THREE.Group(),content=new THREE.Group()
 root.add(death);death.add(flight);flight.add(flip);flip.add(content);content.position.set(0,F(1.3125)-F(1.501),F(.1875))
 const resources=[],layers=[],sourcePaths=[ORIGINAL_MODEL_LAYERS_PATH];let disposed=false
 try{
  for(const eyes of [false,true]){
   const path=`assets/minecraft/textures/entity/phantom${eyes?'_eyes':''}.png`,texture=await loadTexture(await reader.bytes(path));resources.push(texture)
   if(!texture?.isTexture||texture.image?.width!==64||texture.image?.height!==64)throw Error('NATIVE_PHANTOM_TEXTURE_DIMENSIONS_INVALID')
   texture.flipY=true;texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true
   const material=eyes?new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}):new THREE.MeshLambertMaterial({map:texture,side:THREE.DoubleSide,alphaTest:.1})
   resources.push(material);const model=createOriginalModelLayer(original,'minecraft:phantom#main',material);content.add(model.root)
   layers.push({eyes,model,overlay:eyes?null:nativeLivingOverlay(material)});sourcePaths.push(path)
  }
  const assetInfo={type:entity.name,clientJarSha256:ENTITY_MODEL_CLIENT_SHA256,sourcePaths,geometrySource:'original_LayerDefinition_bakeRoot',animationParityVerified:false,completeEntityParityVerified:false}
  const actor={root,assetInfo,update(next,now=Date.now()){
   if(disposed)throw Error('NATIVE_ENTITY_ACTOR_DISPOSED')
   if(next.entityId!==entity.entityId||next.uuid!==entity.uuid||next.name!==entity.name)throw Error('NATIVE_ENTITY_ACTOR_IDENTITY_MISMATCH')
   const state=nativePhantomState(next),m=next.motion,living=m?.living
   if(m?.source!=='same_connection_entity_ticks'||m.tickMs!==50||!Number.isSafeInteger(m.tick)||!living||
      ![m.sampledAt,m.bodyYaw,m.pitch,m.previous?.bodyYaw,m.previous?.pitch,living.hurtTime,living.deathTime,...['x','y','z'].flatMap(a=>[m.position?.[a],m.previous?.position?.[a]])].every(Number.isFinite))throw Error('NATIVE_ENTITY_MOTION_UNAVAILABLE')
   const partial=Math.max(0,Math.min(1,(now-m.sampledAt)/50)),yaw=m.previous.bodyYaw+wrap(m.bodyYaw-m.previous.bodyYaw)*partial,scale=F(F(1)+F(F(.15)*state.size))
   root.position.set(...['x','y','z'].map(a=>mix(m.previous.position[a],m.position[a],partial)));root.rotation.y=Math.PI-yaw*RAD
   death.rotation.z=living.deathTime>0?Math.min(1,Math.sqrt(Math.max(0,((living.deathTime+partial-1)/20)*1.6)))*Math.PI/2:0
   flight.rotation.x=m.pitch*RAD;flip.scale.set(-scale,-scale,scale)
   for(const layer of layers){layer.model.root.visible=layer.eyes||!state.invisible;layer.overlay?.set(living.hurtTime>0||living.deathTime>0);animateNativePhantom(layer.model,next.entityId,F(m.tick+partial))}
   const issues=['NATIVE_PHANTOM_ORIGINAL_LIGHTMAP_UNAVAILABLE']
   if(state.fire)issues.push('NATIVE_ENTITY_FIRE_LAYER_UNAVAILABLE');if(state.outline)issues.push('NATIVE_ENTITY_OUTLINE_LAYER_UNAVAILABLE');if(state.pose!==0)issues.push('NATIVE_ENTITY_POSE_UNAVAILABLE:'+state.pose)
   root.userData.nativeLiving={type:next.name,entityId:next.entityId,uuid:next.uuid,size:state.size,health:state.health,tick:m.tick,hurtTime:living.hurtTime,deathTime:living.deathTime,issues}
   return actor
  },dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const layer of layers)layer.model.dispose();for(const resource of resources)resource.dispose();root.clear()}}
  actor.update(entity,entity.motion?.sampledAt);return actor
 }catch(error){for(const layer of layers)layer.model.dispose();for(const resource of resources)resource.dispose();root.clear();throw error}
}
