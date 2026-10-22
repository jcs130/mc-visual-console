import * as THREE from 'three'
import {createOriginalModelLayer} from './native-original-model-layers.js'
import {nativeLivingMeta} from './native-living-state.js'
import {nativeLivingOverlay} from './native-hostile-actors.js'

export const TWILIGHT_ENTITY_SOURCE='493da16d10210f9f53a3c33b3d8fcb4ae9b14016ee420d753c894562bd9aba35'
export const TWILIGHT_LAYERS_PATH='assets/twilightforest/native/model-layers.json'
export const TWILIGHT_LAYERS_SHA='56dcd09468a6440b15d5258394d90da4a4d18dd9773a772dffc8149978eaf2a2'
export const nativeTwilightType=name=>name==='twilightforest:naga'
const cache=new WeakMap(),RAD=Math.PI/180,wrap=v=>((v+180)%360+360)%360-180
const lerp=(a,b,t)=>a+(b-a)*t,angle=(a,b,t)=>a+wrap(b-a)*t
// Original NagaModel 660c57c9, NagaRenderer 0ed89567 and
// NagaSegmentRenderer 72b3cd80. Complete-pack runtime metadata confirms
// DATA_DAZE=17, DATA_CHARGE=18, DATA_STUNLESS=19, all serializer 8.
export async function loadTwilightLayers(reader){
  if(!cache.has(reader))cache.set(reader,(async()=>{
    const sources=reader.manifest.sources?.filter(s=>s.name==='twilightforest-1.21.1-4.8.3345-universal.jar'||s.sha256===TWILIGHT_ENTITY_SOURCE)
    if(sources?.length!==1||sources[0].sha256!==TWILIGHT_ENTITY_SOURCE||sources[0].explicitOverride||reader.manifest.assets?.[TWILIGHT_LAYERS_PATH]?.sha256!==TWILIGHT_LAYERS_SHA)throw Error('NATIVE_TWILIGHT_LAYERS_SOURCE_UNVERIFIED')
    const data=await reader.json(TWILIGHT_LAYERS_PATH)
    if(data.schemaVersion!==1||data.minecraftVersion!=='1.21.1'||data.sourceJarSha256!==TWILIGHT_ENTITY_SOURCE||data.source!=='original_registered_LayerDefinition_bakeRoot'||data.modelUnits!=='original_Y_down_pixels'||data.rotationOrder!=='ZYX'||Object.keys(data.layers??{}).length!==100)throw Error('NATIVE_TWILIGHT_LAYERS_INVALID')
    return data
  })())
  return cache.get(reader)
}
export function nativeTwilightState(entity){
  if(!nativeTwilightType(entity?.name)||!Number.isSafeInteger(entity.entityId)||typeof entity.uuid!=='string'||!Array.isArray(entity.metadata))throw Error('NATIVE_TWILIGHT_STATE_INVALID')
  const read=(key,type,value)=>nativeLivingMeta(entity,key,type,value),flags=read(0,'byte',0)
  if(flags&1||flags&64||read(6,'pose',0)!==0)throw Error('NATIVE_TWILIGHT_SPECIAL_RENDER_PASS_UNAVAILABLE')
  if(read(2,'optional_component',null)!==null)throw Error('NATIVE_TWILIGHT_NAMED_RENDER_EFFECT_UNAVAILABLE')
  return {invisible:!!(flags&32),health:read(9,'float',200),dazed:read(17,'boolean',false),charging:read(18,'boolean',false),stunless:read(19,'boolean',false)}
}
export async function createNativeTwilightActor(reader,entity,{loadTexture}={}){
  const data=await loadTwilightLayers(reader),root=new THREE.Group(),headRoot=new THREE.Group(),orientation=new THREE.Group(),scale=new THREE.Group(),offset=new THREE.Group(),content=new THREE.Group()
  root.add(headRoot);headRoot.add(orientation);orientation.add(scale);scale.add(offset);offset.add(content)
  orientation.scale.set(-1,-1,1);scale.scale.setScalar(2.01);content.position.y=-1.501
  const resources=[],models=new Set(),parts=new Map(),textures={},sourcePaths=[TWILIGHT_LAYERS_PATH]
  let disposed=false
  try{
    for(const name of ['nagahead','nagahead_charging','nagahead_dazed','nagasegment']){
      const path=`assets/twilightforest/textures/entity/${name}.png`,tex=await loadTexture(await reader.bytes(path));resources.push(tex)
      if(!tex?.isTexture||tex.image?.width!==64||tex.image?.height!==32)throw Error('NATIVE_TWILIGHT_TEXTURE_DIMENSIONS_INVALID')
      tex.flipY=true;tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.needsUpdate=true;textures[name]=tex;sourcePaths.push(path)
    }
    const headMaterial=new THREE.MeshLambertMaterial({map:textures.nagahead,side:THREE.DoubleSide,alphaTest:.1});resources.push(headMaterial)
    const overlay=nativeLivingOverlay(headMaterial),head=createOriginalModelLayer(data,'NAGA',headMaterial);models.add(head);content.add(head.root)
    const bodyMaterial=new THREE.MeshLambertMaterial({map:textures.nagasegment,side:THREE.DoubleSide,alphaTest:.1});resources.push(bodyMaterial);const bodyOverlay=nativeLivingOverlay(bodyMaterial)
    const actor={root,assetInfo:{type:entity.name,sourceJarSha256:TWILIGHT_ENTITY_SOURCE,sourcePaths,geometrySource:'original_LayerDefinition_bakeRoot',animationParityVerified:false,completeEntityParityVerified:false},update(next,now=Date.now()){
      if(disposed)throw Error('NATIVE_TWILIGHT_ACTOR_DISPOSED')
      if(next.entityId!==entity.entityId||next.uuid!==entity.uuid||next.name!==entity.name)throw Error('NATIVE_TWILIGHT_ACTOR_IDENTITY_MISMATCH')
      const state=nativeTwilightState(next),m=next.motion
      if(m?.source!=='same_connection_entity_ticks'||m.tickMs!==50||!m.previous?.position||![m.sampledAt,m.bodyYaw,m.previous.bodyYaw,...['x','y','z'].flatMap(k=>[m.position?.[k],m.previous.position[k]])].every(Number.isFinite))throw Error('NATIVE_TWILIGHT_MOTION_UNAVAILABLE')
      const t=Math.max(0,Math.min(1,(now-m.sampledAt)/50))
      root.position.set(...['x','y','z'].map(k=>lerp(m.previous.position[k],m.position[k],t)));headRoot.rotation.y=Math.PI-angle(m.previous.bodyYaw,m.bodyYaw,t)*RAD;headRoot.visible=!state.invisible
      offset.position.set(0,state.dazed?1.075:.75,state.dazed?.175:0)
      headMaterial.map=state.dazed?textures.nagahead_dazed:state.charging||state.health<=0?textures.nagahead_charging:textures.nagahead
      if(!Number.isFinite(m.twilight?.nagaRed))throw Error('NATIVE_TWILIGHT_CLIENT_COUNTER_UNAVAILABLE')
      headMaterial.color.setRGB(1,Math.trunc(255-m.twilight.nagaRed)/255,Math.trunc(255-m.twilight.nagaRed)/255)
      overlay.set(m.living?.hurtTime>0||m.living?.deathTime>0);bodyOverlay.set(m.living?.hurtTime>0||m.living?.deathTime>0)
      const frame=next.multipart
      if(frame&&(frame.parentUuid!==next.uuid||frame.sourceJarSha256!==TWILIGHT_ENTITY_SOURCE||frame.source!=='same_connection_twilight_multipart_packet'||!Array.isArray(frame.parts)||frame.parts.length>12))throw Error('NATIVE_TWILIGHT_MULTIPART_SOURCE_INVALID')
      const seen=new Set()
      for(const part of frame?.parts??[]){
        if(!Number.isSafeInteger(part.entityId)||!part.position||![part.yaw,part.pitch,...['x','y','z'].map(k=>part.position[k])].every(Number.isFinite)||seen.has(part.entityId))throw Error('NATIVE_TWILIGHT_MULTIPART_STATE_INVALID')
        seen.add(part.entityId);let row=parts.get(part.entityId)
        if(!row){const transform=new THREE.Group(),scaled=new THREE.Group(),translated=new THREE.Group(),flipped=new THREE.Group(),origin=new THREE.Group(),model=createOriginalModelLayer(data,'NAGA_BODY',bodyMaterial);models.add(model);root.add(transform);transform.add(scaled);scaled.add(translated);translated.add(flipped);flipped.add(origin);origin.add(model.root);scaled.scale.setScalar(2);translated.position.y=-1.25;flipped.scale.set(-1,-1,1);origin.position.y=-1.501;row={transform,model};parts.set(part.entityId,row)}
        const old=part.previous,pt=old?Math.max(0,Math.min(1,(now-frame.observedAt)/50)):1
        row.transform.position.set(...['x','y','z'].map(k=>(old?lerp(old.position[k],part.position[k],pt):part.position[k])-root.position[k]))
        row.transform.rotation.set(part.pitch*RAD,(old?angle(old.yaw,part.yaw,pt):part.yaw)*RAD,0,'YXZ')
        row.transform.visible=!(nativeLivingMeta(part,0,'byte',0)&32)
      }
      for(const [id,row]of parts)if(!seen.has(id)){row.model.dispose();models.delete(row.model);row.transform.removeFromParent();parts.delete(id)}
      root.userData.nativeLiving={type:entity.name,health:state.health,multipartParts:parts.size,issues:frame?[]:['NATIVE_TWILIGHT_MULTIPART_WAITING'],animationParityVerified:false}
      return actor
    },dispose(){if(disposed)return;disposed=true;for(const model of models)model.dispose();for(const resource of resources)resource.dispose();parts.clear();root.removeFromParent();root.clear()}}
    actor.update(entity);return actor
  }catch(error){for(const model of models)model.dispose();for(const resource of resources)resource.dispose();root.clear();throw error}
}
