import * as THREE from 'three'
import {nativeFlyingState,animateNativeFlying} from './native-flying-state.js'
import {loadOriginalModelLayers,createOriginalModelLayer,ORIGINAL_MODEL_LAYERS_PATH} from './native-original-model-layers.js'
import {ENTITY_MODEL_CLIENT_SHA256} from './native-entity-model.js'
import {nativeLivingOverlay} from './native-hostile-actors.js'
import {createNativeNameTag} from './native-name-tag.js'
const F=Math.fround,RAD=F(Math.PI/180),mix=(a,b,t)=>a+(b-a)*t,wrap=v=>((v+180)%360+360)%360-180

export async function createNativeFlyingActor(reader,entity,{loadTexture}={}){
 const initial=nativeFlyingState(entity),original=await loadOriginalModelLayers(reader),vex=entity.name==='minecraft:vex',resources=[],models=[],root=new THREE.Group(),orientation=new THREE.Group(),content=new THREE.Group()
 root.add(orientation);orientation.add(content);orientation.scale.set(-1,-1,1);content.position.y=-1.501
 const nameTag=createNativeNameTag(vex?.8:.6);root.add(nameTag.root)
 const paths=vex?['illager/vex','illager/vex_charging']:['allay/allay'];const layers=[];let disposed=false
 try{
  for(const path of paths){
   const source='assets/minecraft/textures/entity/'+path+'.png',tex=await loadTexture(await reader.bytes(source));resources.push(tex)
   if(!tex?.isTexture||tex.image?.width!==32||tex.image?.height!==32)throw Error('NATIVE_FLYING_TEXTURE_DIMENSIONS_INVALID')
   tex.flipY=true;tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.needsUpdate=true
   const material=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,alphaTest:.1,transparent:true});resources.push(material)
   const model=createOriginalModelLayer(original,entity.name+'#main',material);models.push(model);content.add(model.root);layers.push({model,overlay:nativeLivingOverlay(material),charging:path.endsWith('_charging')})
  }
  const assetInfo={type:entity.name,sourcePaths:[ORIGINAL_MODEL_LAYERS_PATH,...paths.map(p=>'assets/minecraft/textures/entity/'+p+'.png')],clientJarSha256:ENTITY_MODEL_CLIENT_SHA256,
   geometrySource:'original_LayerDefinition_bakeRoot',animationParityVerified:false,completeEntityParityVerified:false}
  const actor={root,assetInfo,update(next,now=Date.now()){
   if(disposed)throw Error('NATIVE_ENTITY_ACTOR_DISPOSED')
   if(next.entityId!==entity.entityId||next.uuid!==entity.uuid||next.name!==entity.name)throw Error('NATIVE_ENTITY_ACTOR_IDENTITY_MISMATCH')
   const state=nativeFlyingState(next),m=next.motion,living=m?.living
   if(m?.source!=='same_connection_entity_ticks'||m.tickMs!==50||!Number.isSafeInteger(m.tick)||!m.flying||!living||
     ![m.sampledAt,m.bodyYaw,m.headYaw,m.pitch,m.previous?.bodyYaw,m.previous?.headYaw,m.previous?.pitch,m.walk?.speedOld,m.walk?.speed,m.walk?.position,m.flying.holding,m.flying.previous,living.hurtTime,living.deathTime,
       ...['x','y','z'].flatMap(a=>[m.position?.[a],m.previous?.position?.[a]])].every(Number.isFinite))throw Error('NATIVE_ENTITY_MOTION_UNAVAILABLE')
   const partial=Math.max(0,Math.min(1,(now-m.sampledAt)/50)),yaw=m.previous.bodyYaw+wrap(m.bodyYaw-m.previous.bodyYaw)*partial,head=m.previous.headYaw+wrap(m.headYaw-m.previous.headYaw)*partial
   root.position.set(...['x','y','z'].map(a=>mix(m.previous.position[a],m.position[a],partial)));root.rotation.y=Math.PI-yaw*RAD;root.visible=!state.invisible
   nameTag.update(next)
   orientation.rotation.z=living.deathTime>0?Math.min(1,Math.sqrt(Math.max(0,((living.deathTime+partial-1)/20)*1.6)))*Math.PI/2:0
   for(const layer of layers){layer.model.root.visible=!vex||state.charging===layer.charging;layer.overlay.set(living.hurtTime>0||living.deathTime>0)
    animateNativeFlying(layer.model,state,{age:F(m.tick+partial),walk:F(m.walk.position-m.walk.speed*(1-partial)),speed:F(mix(m.walk.speedOld,m.walk.speed,partial)),pitch:mix(m.previous.pitch,m.pitch,partial),headYaw:wrap(head-yaw),holding:mix(m.flying.previous,m.flying.holding,partial)/5})}
   const issues=['NATIVE_FLYING_ORIGINAL_LIGHTMAP_UNAVAILABLE']
   if(state.dancing)issues.push('NATIVE_ALLAY_DANCE_SPIN_STATE_UNAVAILABLE')
   if(state.main||state.off)issues.push('NATIVE_FLYING_HELD_ITEM_LAYER_UNAVAILABLE')
   if(state.fire)issues.push('NATIVE_ENTITY_FIRE_LAYER_UNAVAILABLE');if(state.outline)issues.push('NATIVE_ENTITY_OUTLINE_LAYER_UNAVAILABLE');if(state.pose!==0)issues.push('NATIVE_ENTITY_POSE_UNAVAILABLE:'+state.pose)
   root.userData.nativeLiving={type:state.name,entityId:next.entityId,uuid:next.uuid,health:state.health,tick:m.tick,hurtTime:living.hurtTime,deathTime:living.deathTime,issues}
   assetInfo.motionSource=m.source;assetInfo.motionTick=m.tick;return actor
  },dispose(){if(disposed)return;disposed=true;root.removeFromParent();nameTag.dispose();for(const model of models)model.dispose();for(const resource of resources)resource.dispose();root.clear()}}
  actor.update(entity,entity.motion?.sampledAt);return actor
 }catch(error){nameTag.dispose();for(const model of models)model.dispose();for(const resource of resources)resource.dispose();root.clear();throw error}
}
