import * as THREE from 'three'
import {prepareNativeHeldItem,buildNativeHeldItemObject,disposeNativeHeldItemObject} from './native-held-items.js'
import {nativeProjectileFrame} from './native-projectile-state.js'
import {nativeLivingMeta} from './native-living-state.js'
import {NATIVE_THROWN_ITEM_DEFINITIONS,nativeThrownItemType} from './native-thrown-item-state.js'
async function texture(bytes){const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));try{return await new THREE.TextureLoader().loadAsync(url)}finally{URL.revokeObjectURL(url)}}

export async function createNativeThrownItemActor(reader,entity,{loadTexture=texture,readPixels}={}){
  if(!nativeThrownItemType(entity?.name))throw Error('NATIVE_THROWN_ITEM_TYPE_UNSUPPORTED')
  const state=entity.itemState,definition=NATIVE_THROWN_ITEM_DEFINITIONS[entity.name]
  if(state?.available!==true||state.minecraftVersion!=='1.21.1'||!['original_1.21.1_entity_constructor','same_player_vanilla_item_registry','received_native_empty_slot'].includes(state.source))throw Error(state?.reason??'NATIVE_THROWN_ITEM_STACK_UNAVAILABLE')
  const root=new THREE.Group(),billboard=new THREE.Group(),mount=new THREE.Group(),textures=new Map()
  root.scale.setScalar(definition.scale);root.add(billboard);billboard.add(mount)
  let model=null,disposed=false
  const issues=['NATIVE_THROWN_ITEM_LIGHTMAP_UNAVAILABLE']
  try{
    let plan=null
    if(!state.empty){
      plan=await prepareNativeHeldItem(reader,state.item,'right',{contextInput:{kind:'ground'},...(readPixels?{readPixels}:{})})
      if(!plan.groundTransform)throw Error('NATIVE_THROWN_ITEM_GROUND_MODEL_UNAVAILABLE')
      const layers=plan.textureLayers??new Map([[plan.texturePath,{bytes:plan.textureBytes}]])
      for(const [path,row]of layers)textures.set(path,await loadTexture(row.bytes))
      model=buildNativeHeldItemObject(plan,plan.textureLayers?textures:textures.get(plan.texturePath))
      mount.position.fromArray(plan.groundTransform.translation);mount.rotation.set(...plan.groundTransform.radians,'XYZ');mount.scale.fromArray(plan.groundTransform.scale);mount.add(model)
      // ThrownItemRenderer uses only the camera quaternion, then GROUND.
      // It has no extra Y rotation, dropped-item bob, spin or projectile yaw.
      const cameraRotation=new THREE.Quaternion()
      model.traverse(part=>{if(part.isMesh)part.onBeforeRender=(_renderer,_scene,camera)=>{
        camera.getWorldQuaternion(cameraRotation)
        if(!billboard.quaternion.equals(cameraRotation)){billboard.quaternion.copy(cameraRotation);billboard.updateMatrixWorld(true)}
      }})
    }
    const assetInfo={type:entity.name,item:state.item?.name??null,sourcePaths:plan?.sourcePaths??[],itemContext:plan?.appearance.context.kind??null,geometrySource:plan?.geometry??'received_native_empty_slot',
      constructorScale:definition.scale,fullBrightBlockLight:definition.fullBright,issues,completeEntityParityVerified:false,pixelParityVerified:false}
    const actor={root,assetInfo,update(next,now=Date.now(),{self}={}){
      if(disposed||next.entityId!==entity.entityId||next.uuid!==entity.uuid||next.spawnedAt!==entity.spawnedAt||
        next.itemState?.item?.snbt!==state.item?.snbt||next.itemState?.empty!==state.empty)throw Error('NATIVE_THROWN_ITEM_BINDING_MISMATCH')
      const frame=nativeProjectileFrame(next,now);root.position.fromArray(frame.position)
      const p=self?.position,m=next.motion
      const distance=p&&['x','y','z'].every(k=>Number.isFinite(p[k]))?['x','y','z'].reduce((sum,k)=>sum+(p[k]-m.position[k])**2,0):null
      root.visible=!state.empty&&!(nativeLivingMeta(next,0,'byte',0)&32)&&(m.tick>=2||distance!==null&&distance>=12.25)
      root.userData.nativeProjectile={type:entity.name,item:state.item?.name??null,empty:state.empty,scale:definition.scale,fullBrightBlockLight:definition.fullBright,issues}
    },dispose(){if(disposed)return;disposed=true;root.removeFromParent();if(model)disposeNativeHeldItemObject(model);for(const tex of textures.values())tex.dispose();root.clear()}}
    actor.update(entity,entity.motion?.sampledAt??Date.now());return actor
  }catch(error){if(model)disposeNativeHeldItemObject(model);for(const tex of textures.values())tex.dispose();root.clear();throw error}
}
