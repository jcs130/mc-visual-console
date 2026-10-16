import * as THREE from 'three'
import { prepareNativeHeldItem,buildNativeHeldItemObject,disposeNativeHeldItemObject } from './native-held-items.js'
import { nativeNumericValue } from './native-item-stack.js'
import { nativePlayerSin } from './native-player-motion.js'
import { NATIVE_MOB_MOTION_SOURCE } from './native-entity-motion.js'

const F=Math.fround
export const nativeDroppedItemCopies=count=>count>48?5:count>32?4:count>16?3:count>1?2:1
// Original LegacyRandomSource nextFloat, seeded by item registry ID + damage.
export function nativeDroppedItemOffsets(count,seed,gui3d,scaleZ=1) {
  const copies=nativeDroppedItemCopies(count),mask=(1n<<48n)-1n
  let value=(BigInt(seed)^0x5deece66dn)&mask
  const random=()=>{value=(value*0x5deece66dn+11n)&mask;return F(Number(value>>24n)/16777216)}
  return Array.from({length:copies},(_,n)=>{
    const x=n?F(F(F(random()*2)-1)*F(gui3d?.15:.075)):0
    const y=n?F(F(F(random()*2)-1)*F(gui3d?.15:.075)):0
    const z=gui3d?(n?F(F(F(random()*2)-1)*F(.15)):0):F(F(F(n-F((copies-1)*.5))*F(.09375))*F(scaleZ))
    return [x,y,z]
  })
}

export function nativeDroppedItemFrame(entity,now,groundScaleY) {
  const motion=entity.motion,item=motion?.item
  if(motion?.source!==NATIVE_MOB_MOTION_SOURCE||motion.tickMs!==50||!Number.isSafeInteger(item?.clientLifetimeTicks)||
    item.clientLifetimeTicks<0||!Number.isFinite(item.bobOffset)||!Number.isFinite(motion.sampledAt)||!motion.position||!motion.previous?.position||
    !['x','y','z'].every(k=>Number.isFinite(motion.position[k])&&Number.isFinite(motion.previous.position[k])))throw Error('NATIVE_DROPPED_ITEM_MOTION_UNAVAILABLE')
  const partial=Math.max(0,Math.min(1,(now-motion.sampledAt)/50)),age=F(item.clientLifetimeTicks+F(partial))
  return {position:['x','y','z'].map(k=>motion.previous.position[k]+(motion.position[k]-motion.previous.position[k])*partial),
    y:F(F(F(nativePlayerSin(F(F(age/10)+item.bobOffset)))*F(.1))+F(.1))+F(F(.25)*F(groundScaleY)),
    yaw:F(F(age/20)+item.bobOffset),ageSource:item.ageSource}
}

async function texture(bytes) {
  const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}))
  try{return await new THREE.TextureLoader().loadAsync(url)}finally{URL.revokeObjectURL(url)}
}
export async function createNativeDroppedItemActor(reader,entity,{loadTexture=texture,readPixels}={}) {
  const state=entity.itemState
  if(entity.name!=='minecraft:item'||state?.available!==true||state.source!=='same_player_vanilla_item_registry'||state.minecraftVersion!=='1.21.1'||
    !Number.isSafeInteger(state.registryId)||!state.item?.snbt)throw Error(state?.reason??'NATIVE_DROPPED_ITEM_STACK_UNAVAILABLE')
  const plan=await prepareNativeHeldItem(reader,state.item,'right',{contextInput:{kind:'ground'},...(readPixels?{readPixels}:{})}),ground=plan.groundTransform
  if(!ground)throw Error('NATIVE_DROPPED_ITEM_GROUND_MODEL_UNAVAILABLE')
  const root=new THREE.Group(),spin=new THREE.Group(),textures=new Map();root.add(spin)
  let original,disposed=false
  try {
    if(plan.textureLayers)for(const [path,row]of plan.textureLayers)textures.set(path,await loadTexture(row.bytes))
    else textures.set(plan.texturePath,await loadTexture(plan.textureBytes))
    original=buildNativeHeldItemObject(plan,plan.textureLayers?textures:textures.get(plan.texturePath))
    const damage=nativeNumericValue(plan.stack.components['minecraft:damage'])??0,gui3d=plan.kind==='native-block-held'
    const offsets=nativeDroppedItemOffsets(state.item.count,state.registryId+damage,gui3d,ground.scale[2])
    for(const [n,offset]of offsets.entries()) {
      const copy=new THREE.Group(),model=n?original.clone(true):original
      copy.position.fromArray(offset);model.position.fromArray(ground.translation)
      model.rotation.set(...ground.radians,'XYZ');model.scale.fromArray(ground.scale);copy.add(model);spin.add(copy)
    }
    const assetInfo={type:'minecraft:item',item:state.item.name,count:state.item.count,copies:offsets.length,
      geometrySource:plan.geometry,sourcePaths:plan.sourcePaths,itemContext:plan.appearance.context.kind,ageSource:'viewer_client_lifetime_not_server_despawn_age',
      completeEntityParityVerified:false,pixelParityVerified:false}
    const actor={root,assetInfo,update(next,now=Date.now()){
      if(disposed||next.entityId!==entity.entityId||next.uuid!==entity.uuid||next.itemState?.item?.snbt!==state.item.snbt)throw Error('NATIVE_DROPPED_ITEM_BINDING_MISMATCH')
      const frame=nativeDroppedItemFrame(next,now,ground.scale[1]);root.position.fromArray(frame.position)
      spin.position.y=frame.y;spin.rotation.y=frame.yaw
      root.userData.nativeDroppedItem={item:state.item.name,count:state.item.count,copies:offsets.length,ageSource:frame.ageSource,clientTick:next.motion.item.clientLifetimeTicks}
    },dispose(){if(disposed)return;disposed=true;root.removeFromParent();if(original)disposeNativeHeldItemObject(original);root.clear();for(const tex of textures.values())tex.dispose()}}
    actor.update(entity,entity.motion?.sampledAt??Date.now());return actor
  }catch(error){if(original)disposeNativeHeldItemObject(original);for(const tex of textures.values())tex.dispose();root.clear();throw error}
}
