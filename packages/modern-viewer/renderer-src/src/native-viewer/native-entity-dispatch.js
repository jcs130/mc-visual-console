import * as THREE from 'three'
import { NativeAssetReader } from './model-loader.js'
import { createNativeModelPart, ENTITY_MODEL_CLIENT_SHA256 } from './native-entity-model.js'
import { nativePlayerSin as sin, nativePlayerCos as cos } from './native-player-motion.js'
import { NATIVE_MOB_MOTION_SOURCE } from './native-entity-motion.js'
import { createNativeMaidActor, nativeMaidRenderState } from './native-entity-dispatch-maid.js'
import { createNativeContraptionActor, nativeContraptionState } from './native-contraption.js'

// Locked vanilla classes: fwm/fvd/fuz/fxa/fwz/fxi/fxv, fwu/fuf, glk,
// gly/gjw/gju/gmh/gmm/gne and original saddle/fur/profession layers.
// Original assets/geometry only; this is not a generic mob proxy renderer.
export const NATIVE_ENTITY_RENDER_TYPES=Object.freeze(['minecraft:pig','minecraft:cow','minecraft:chicken','minecraft:sheep','minecraft:slime','minecraft:villager','touhou_little_maid:maid','create:contraption','create:stationary_contraption'])
const SUPPORTED=new Set(NATIVE_ENTITY_RENDER_TYPES),F=Math.fround,PI=F(Math.PI),RAD=F(Math.PI/180)
const wrap=v=>((v+180)%360+360)%360-180,lerp=(a,b,t)=>a+(b-a)*t,angle=(a,b,t)=>a+wrap(b-a)*t
const cube=(uv,origin,size,dilation=0,mirror=false)=>({uv,origin,size,dilation,mirror})
const part=(name,pivot,cubes,rotation=[0,0,0],parent)=>({name,pivot,cubes,rotation,...(parent?{parent}:{})})
const TYPES={byte:0,int:1,float:3,boolean:8,pose:21,villager_data:19,optional_component:6}

function meta(entity,key,type,defaultValue){
  const entry=entity.metadata?.find(value=>value.key===key)
  if(!entry)return defaultValue // Matched defineSynchedData default, not fallback.
  if(entry.type!==type&&entry.type!==TYPES[type])throw Error(`NATIVE_ENTITY_METADATA_SERIALIZER_UNSUPPORTED:${key}`)
  const value=entry.value
  if(type==='boolean'&&typeof value!=='boolean')throw Error('NATIVE_ENTITY_METADATA_VALUE_INVALID')
  if(['byte','int','pose'].includes(type)&&!Number.isInteger(value))throw Error('NATIVE_ENTITY_METADATA_VALUE_INVALID')
  if(type==='byte'&&(value < -128 || value > 127))throw Error('NATIVE_ENTITY_METADATA_VALUE_INVALID')
  if(type==='float'&&!Number.isFinite(value))throw Error('NATIVE_ENTITY_METADATA_VALUE_INVALID')
  return value
}

export function nativeEntityRenderState(entity,{registries}={}){
  if(['create:contraption','create:stationary_contraption'].includes(entity?.name))return nativeContraptionState(entity)
  if(entity?.name==='touhou_little_maid:maid')return nativeMaidRenderState(entity)
  if(!SUPPORTED.has(entity?.name))throw Error(`NATIVE_ENTITY_RENDERER_UNSUPPORTED:${entity?.name}`)
  if(!Number.isSafeInteger(entity.entityId)||typeof entity.uuid!=='string'||!Array.isArray(entity.metadata)||!entity.position||![entity.position.x,entity.position.y,entity.position.z,entity.yaw,entity.pitch,entity.headYaw].every(Number.isFinite))throw Error('NATIVE_ENTITY_STATE_INVALID')
  const flags=meta(entity,0,'byte',0),pose=meta(entity,6,'pose',0),health=meta(entity,9,'float',1)
  if(pose!==0)throw Error(`NATIVE_ENTITY_POSE_UNSUPPORTED:${pose}`)
  if(flags&1)throw Error('NATIVE_ENTITY_FIRE_LAYER_UNSUPPORTED')
  if(flags&64)throw Error('NATIVE_ENTITY_OUTLINE_UNSUPPORTED')
  if(entity.equipment?.some(value=>value.item?.itemCount>0 || value.item?.count>0))throw Error('NATIVE_ENTITY_EQUIPMENT_RENDERING_UNSUPPORTED')
  const state={name:entity.name,invisible:Boolean(flags&32),alive:health>0,baby:entity.name==='minecraft:slime'?false:meta(entity,16,'boolean',false),defaultsSource:'Minecraft_1.21.1_defineSynchedData'}
  if(entity.name==='minecraft:slime') {state.size=meta(entity,16,'int',1);if(state.size<1||state.size>127)throw Error('NATIVE_SLIME_SIZE_INVALID')}
  if(entity.name==='minecraft:pig')state.saddled=meta(entity,17,'boolean',false)
  if(entity.name==='minecraft:sheep') {const wool=meta(entity,17,'byte',0);state.color=wool&15;state.sheared=Boolean(wool&16);if(wool&~31)throw Error('NATIVE_SHEEP_FLAGS_UNSUPPORTED');if(meta(entity,2,'optional_component',null)!==null)throw Error('NATIVE_SHEEP_CUSTOM_NAME_EFFECT_UNSUPPORTED')}
  if(entity.name==='minecraft:villager') {
    state.unhappy=meta(entity,17,'int',0)
    const data=meta(entity,18,'villager_data',null)
    if(data===null)state.villager={type:'minecraft:plains',profession:'minecraft:none',level:1}
    else {
      if(!data||![data.villagerType,data.villagerProfession,data.level].every(Number.isInteger))throw Error('NATIVE_VILLAGER_DATA_INVALID')
      const resolve=(entries,id)=>{const row=entries?.find(entry=>entry.id===id);if(!row||!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(row.name))throw Error('NATIVE_VILLAGER_REGISTRY_UNAVAILABLE');return row.name}
      if(registries?.source!=='server_builtin_registries')throw Error('NATIVE_VILLAGER_REGISTRY_UNAVAILABLE')
      state.villager={type:resolve(registries.villagerTypes,data.villagerType),profession:resolve(registries.villagerProfessions,data.villagerProfession),level:data.level}
      if(data.level<1||data.level>5)throw Error('NATIVE_VILLAGER_LEVEL_UNSUPPORTED')
    }
  }
  return state
}

export function nativeEntityModelDefinition(name,layer='base'){
  const quadruped=(height,dilation=0)=>({parts:[
    part('head',[0,18-height,-6],[cube([0,0],[-4,-4,-8],[8,8,8],dilation)]),
    part('body',[0,17-height,2],[cube([28,8],[-5,-10,-7],[10,16,8],dilation)],[F(Math.PI/2),0,0]),
    ...[['right_hind_leg',-3,7],['left_hind_leg',3,7],['right_front_leg',-3,-5],['left_front_leg',3,-5]].map(([n,x,z])=>part(n,[x,24-height,z],[cube([0,16],[-2,0,-2],[4,height,4],dilation)]))]})
  if(name==='minecraft:pig') {const dilation=layer==='saddle'?.5:0,def=quadruped(6,dilation);def.parts[0]=part('head',[0,12,-6],[cube([0,0],[-4,-4,-8],[8,8,8],dilation),cube([16,16],[-2,0,-9],[4,3,1],dilation)]);return def}
  if(name==='minecraft:cow')return {parts:[
    part('head',[0,4,-8],[cube([0,0],[-4,-4,-6],[8,8,6]),cube([22,0],[-5,-5,-4],[1,3,1]),cube([22,0],[4,-5,-4],[1,3,1])]),
    part('body',[0,5,2],[cube([18,4],[-6,-10,-7],[12,18,10]),cube([52,0],[-2,2,-8],[4,6,1])],[F(Math.PI/2),0,0]),
    ...[['right_hind_leg',-4,7],['left_hind_leg',4,7],['right_front_leg',-4,-6],['left_front_leg',4,-6]].map(([n,x,z])=>part(n,[x,12,z],[cube([0,16],[-2,0,-2],[4,12,4])]))]}
  if(name==='minecraft:sheep'){const def=quadruped(12),fur=layer==='fur';def.parts[0]=part('head',[0,6,-8],[cube([0,0],[-3,-4,fur?-4:-6],[6,6,fur?6:8],fur?.6:0)]);def.parts[1]=part('body',[0,5,2],[cube([28,8],[-4,-10,-7],[8,16,6],fur?1.75:0)],[F(Math.PI/2),0,0]);if(fur)for(const bone of def.parts.slice(2))bone.cubes=[cube([0,16],[-2,0,-2],[4,6,4],.5)];return def}
  if(name==='minecraft:chicken')return {parts:[
    part('head',[0,15,-4],[cube([0,0],[-2,-6,-2],[4,6,3])]),part('beak',[0,15,-4],[cube([14,0],[-2,-4,-4],[4,2,2])]),part('red_thing',[0,15,-4],[cube([14,4],[-1,-2,-3],[2,2,2])]),
    part('body',[0,16,0],[cube([0,9],[-3,-4,-3],[6,8,6])],[F(Math.PI/2),0,0]),part('right_leg',[-2,19,1],[cube([26,0],[-1,0,-3],[3,5,3])]),part('left_leg',[1,19,1],[cube([26,0],[-1,0,-3],[3,5,3])]),
    part('right_wing',[-4,13,0],[cube([24,13],[0,0,-3],[1,4,6])]),part('left_wing',[4,13,0],[cube([24,13],[-1,0,-3],[1,4,6])])]}
  if(name==='minecraft:slime')return {parts:layer==='outer'?[part('cube',[0,0,0],[cube([0,0],[-4,16,-4],[8,8,8])])]:[
    part('cube',[0,0,0],[cube([0,16],[-3,17,-3],[6,6,6])]),part('right_eye',[0,0,0],[cube([32,0],[-3.25,18,-3.5],[2,2,2])]),part('left_eye',[0,0,0],[cube([32,4],[1.25,18,-3.5],[2,2,2])]),part('mouth',[0,0,0],[cube([32,8],[0,21,-3.5],[1,1,1])])]}
  if(name==='minecraft:villager')return {parts:[
    part('head',[0,0,0],[cube([0,0],[-4,-10,-4],[8,10,8])]),part('hat',[0,0,0],[cube([32,0],[-4,-10,-4],[8,10,8],.51)],[0,0,0],'head'),part('hat_rim',[0,0,0],[cube([30,47],[-8,-8,-6],[16,16,1])],[-F(Math.PI/2),0,0],'hat'),part('nose',[0,-2,0],[cube([24,0],[-1,-1,-6],[2,4,2])],[0,0,0],'head'),
    part('body',[0,0,0],[cube([16,20],[-4,0,-3],[8,12,6])]),part('jacket',[0,0,0],[cube([0,38],[-4,0,-3],[8,20,6],.5)],[0,0,0],'body'),part('arms',[0,3,-1],[cube([44,22],[-8,-2,-2],[4,8,4]),cube([44,22],[4,-2,-2],[4,8,4],0,true),cube([40,38],[-4,2,-2],[8,4,4])],[-.75,0,0]),part('right_leg',[-2,12,0],[cube([0,22],[-2,0,-2],[4,12,4])]),part('left_leg',[2,12,0],[cube([0,22],[-2,0,-2],[4,12,4],0,true)])]}
  throw Error('NATIVE_ENTITY_MODEL_UNSUPPORTED')
}

const DYES=[0xf9fffe,16351261,13061821,3847130,16701501,8439583,15961002,4673362,0x9d9d97,1481884,8991416,3949738,8606770,6192150,11546150,0x1d1d21]
export function nativeSheepColor(index){if(!Number.isInteger(index)||index<0||index>15)throw Error('NATIVE_SHEEP_COLOR_INVALID');const value=DYES[index];return index===0?[230/255,230/255,230/255]:[16,8,0].map(shift=>Math.floor(((value>>>shift)&255)*F(.75))/255)}

async function texture(bytes){const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));try{return await new THREE.TextureLoader().loadAsync(url)}finally{URL.revokeObjectURL(url)}}
export async function createNativeEntityActor(reader,entity,{registries,loadTexture=texture}={}){
  if(!(reader instanceof NativeAssetReader)||reader.manifest.clientJarSha256!==ENTITY_MODEL_CLIENT_SHA256)throw Error('NATIVE_ENTITY_CLIENT_SOURCE_UNSUPPORTED')
  const source=reader.manifest.sources?.filter(value=>value.name==='minecraft-1.21.1-client.jar')
  if(source?.length!==1||source[0].sha256!==ENTITY_MODEL_CLIENT_SHA256||source[0].explicitOverride)throw Error('NATIVE_ENTITY_CLIENT_SOURCE_UNSUPPORTED')
  if(entity?.name==='touhou_little_maid:maid')return createNativeMaidActor(reader,entity,{loadTexture})
  if(['create:contraption','create:stationary_contraption'].includes(entity?.name))return createNativeContraptionActor(reader,entity,{loadTexture})
  const state=nativeEntityRenderState(entity,{registries}),leaf=state.name.split(':')[1],height=leaf==='villager'?64:32
  const root=new THREE.Group(),orientation=new THREE.Group(),content=new THREE.Group();root.add(orientation);orientation.add(content);content.position.y=-1.501;orientation.scale.set(-1,-1,1)
  const resources=[],models=[],layers=[],sourcePaths=[]
  async function layer(kind,path,options={}){
    const bytes=await reader.bytes(path),tex=await loadTexture(bytes);resources.push(tex)
    if(!tex?.isTexture||tex.image?.width!==64||tex.image?.height!==height)throw Error('NATIVE_ENTITY_TEXTURE_DIMENSIONS_INVALID')
    if(reader.manifest.assets[`${path}.mcmeta`]){
      const metadata=await reader.json(`${path}.mcmeta`)
      if(!options.villagerMetadata||Object.keys(metadata).some(key=>key!=='villager')||!['none','partial','full'].includes(metadata.villager?.hat))throw Error('NATIVE_ENTITY_TEXTURE_METADATA_UNSUPPORTED')
    }
    tex.flipY=true;tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.needsUpdate=true
    const material=new THREE.MeshLambertMaterial({map:tex,side:THREE.DoubleSide,alphaTest:options.transparent?0:.1,transparent:options.transparent===true,depthWrite:true});resources.push(material)
    if(options.color)material.color.setRGB(...options.color)
    const model=createNativeModelPart(nativeEntityModelDefinition(state.name,kind),material,[64,height]);models.push(model);content.add(model.root)
    const heads=new THREE.Group(),body=new THREE.Group();model.root.add(heads,body)
    for(const bone of [...model.root.children])if(bone!==heads&&bone!==body)(['head','beak','red_thing'].includes(bone.name)?heads:body).add(bone)
    layers.push({kind,model,heads,body,material,hatVisible:options.hatVisible??true});sourcePaths.push(path)
    return model
  }
  try{
    await layer('base',`assets/minecraft/textures/entity/${['pig','cow','sheep','slime','villager'].includes(leaf)?leaf+'/':''}${leaf}.png`)
    if(leaf==='pig')await layer('saddle','assets/minecraft/textures/entity/pig/pig_saddle.png')
    if(leaf==='sheep')await layer('fur','assets/minecraft/textures/entity/sheep/sheep_fur.png',{color:nativeSheepColor(state.color)})
    if(leaf==='slime')await layer('outer','assets/minecraft/textures/entity/slime/slime.png',{transparent:true})
    const villagerKey=leaf==='villager'?JSON.stringify([state.villager,state.baby]):null
    if(leaf==='villager'){
      const path=(folder,id)=>{const [ns,name]=id.split(':');return `assets/${ns}/textures/entity/villager/${folder}/${name}.png`}
      const hat=async sourcePath=>{if(!reader.manifest.assets[`${sourcePath}.mcmeta`])return 'none';const metadata=await reader.json(`${sourcePath}.mcmeta`);if(Object.keys(metadata).some(key=>key!=='villager')||!['none','partial','full'].includes(metadata.villager?.hat))throw Error('NATIVE_VILLAGER_HAT_METADATA_UNSUPPORTED');sourcePaths.push(`${sourcePath}.mcmeta`);return metadata.villager.hat}
      const biomePath=path('type',state.villager.type),professionPath=path('profession',state.villager.profession)
      const biomeHat=await hat(biomePath),professionHat=state.villager.profession==='minecraft:none'?'none':await hat(professionPath)
      await layer('biome',biomePath,{villagerMetadata:true,hatVisible:professionHat==='none'||professionHat==='partial'&&biomeHat!=='full'})
      if(!state.baby&&state.villager.profession!=='minecraft:none'){
        await layer('profession',professionPath,{villagerMetadata:true})
        if(state.villager.profession!=='minecraft:nitwit')await layer('level',`assets/minecraft/textures/entity/villager/profession_level/${['stone','iron','gold','emerald','diamond'][state.villager.level-1]}.png`)
      }
    }
    let disposed=false
    const assetInfo={type:state.name,clientJarSha256:ENTITY_MODEL_CLIENT_SHA256,sourcePaths,geometrySource:'Minecraft_1.21.1_original_ModelPart_layers',metadataDefaultsSource:state.defaultsSource,animationParityVerified:false,completeEntityParityVerified:false}
    const actor={root,assetInfo,update(next,now=Date.now()){
      if(disposed)throw Error('NATIVE_ENTITY_ACTOR_DISPOSED')
      if(next.entityId!==entity.entityId||next.uuid!==entity.uuid||next.name!==entity.name)throw Error('NATIVE_ENTITY_ACTOR_IDENTITY_MISMATCH')
      const current=nativeEntityRenderState(next,{registries}),motion=next.motion
      if(leaf==='villager'&&JSON.stringify([current.villager,current.baby])!==villagerKey)throw Error('NATIVE_ENTITY_RENDER_VARIANT_CHANGED')
      if(motion?.source!==NATIVE_MOB_MOTION_SOURCE||motion.tickMs!==50||!Number.isSafeInteger(motion.tick)||motion.tick<0||!Number.isFinite(motion.sampledAt)||!motion.position||!motion.previous?.position||!motion.walk||
        ![...['x','y','z'].map(axis=>motion.position[axis]),...['x','y','z'].map(axis=>motion.previous.position[axis]),motion.bodyYaw,motion.headYaw,motion.pitch,motion.previous.bodyYaw,motion.previous.headYaw,motion.previous.pitch,motion.walk.speedOld,motion.walk.speed,motion.walk.position].every(Number.isFinite)||
        (leaf==='slime'&&![motion.slime?.oSquish,motion.slime?.squish].every(Number.isFinite))||
        (leaf==='chicken'&&![motion.chicken?.oFlap,motion.chicken?.flap,motion.chicken?.oFlapSpeed,motion.chicken?.flapSpeed].every(Number.isFinite))||
        (leaf==='sheep'&&(!Number.isInteger(motion.eatCounter)||motion.eatCounter<0||motion.eatCounter>40)))throw Error('NATIVE_ENTITY_MOTION_UNAVAILABLE')
      const partial=Math.max(0,Math.min(1,(now-motion.sampledAt)/50)),p=motion.position,old=motion.previous
      root.position.set(...['x','y','z'].map(axis=>lerp(old.position[axis],p[axis],partial)))
      const bodyYaw=angle(old.bodyYaw,motion.bodyYaw,partial),headYaw=angle(old.headYaw,motion.headYaw,partial),pitch=lerp(old.pitch,motion.pitch,partial)
      root.rotation.y=Math.PI-bodyYaw*Math.PI/180;root.visible=!current.invisible&&current.alive
      const speed=F(lerp(motion.walk.speedOld,motion.walk.speed,partial)),walkPosition=F(motion.walk.position-F(motion.walk.speed*F(1-partial))),phase=F(F(walkPosition*(current.baby?3:1))*F(.6662))
      const leg=offset=>F(F(cos(F(phase+offset))*F(1.4))*speed),headX=F(pitch*RAD),headY=F(wrap(headYaw-bodyYaw)*RAD)
      for(const entry of layers){
        entry.heads.position.set(0,0,0);entry.body.position.set(0,0,0);entry.body.scale.setScalar(1)
        if(current.baby&&leaf!=='villager'){const headOffset=leaf==='pig'?4:leaf==='cow'?10:leaf==='sheep'?8:5;entry.heads.position.set(0,headOffset,leaf==='chicken'?2:4);entry.body.scale.setScalar(.5);entry.body.position.y=12}
        if(entry.kind==='saddle')entry.model.root.visible=current.saddled
        if(entry.kind==='fur'){entry.model.root.visible=!current.sheared;entry.material.color.setRGB(...nativeSheepColor(current.color))}
        const bones=entry.model.bones
        for(const name of ['head','beak','red_thing'])if(bones.has(name))bones.get(name).rotation.set(headX,headY,0,'ZYX')
        for(const [name,offset]of [['right_hind_leg',0],['left_hind_leg',PI],['right_front_leg',PI],['left_front_leg',0],['right_leg',0],['left_leg',PI]])if(bones.has(name))bones.get(name).rotation.x=leg(offset)
        if(leaf==='chicken'){const flap=lerp(motion.chicken.oFlap,motion.chicken.flap,partial),strength=lerp(motion.chicken.oFlapSpeed,motion.chicken.flapSpeed,partial),rotation=F(F(sin(F(flap))+1)*F(strength));bones.get('right_wing').rotation.z=rotation;bones.get('left_wing').rotation.z=-rotation}
        if(leaf==='sheep'){const eat=motion.eatCounter;const lower=eat<=0?0:eat>=4&&eat<=36?1:eat<4?(eat-partial)/4:-(eat-40-partial)/4;bones.get('head').position.y=6+lower*9;bones.get('head').rotation.x=eat>4&&eat<=36?F(F(.62831855)+F(F(.21991149)*sin(F(F((eat-4-partial)/32)*F(28.7))))):eat>0?F(.62831855):headX}
        if(leaf==='villager'){
          const head=bones.get('head');head.visible=entry.hatVisible
          head.rotation.z=current.unhappy>0?F(F(.3)*sin(F(F(.45)*F(motion.tick+partial)))):0
          if(current.unhappy>0)head.rotation.x=F(.4)
          bones.get('right_leg').rotation.x=F(leg(0)*F(.5));bones.get('left_leg').rotation.x=F(leg(PI)*F(.5))
        }
      }
      if(leaf==='slime'){const s=motion.slime,amount=F(F(lerp(s.oSquish,s.squish,partial))/F(F(current.size*.5)+1)),xz=F(1/F(amount+1));orientation.scale.set(-.999*xz*current.size,-.999/xz*current.size,.999*xz*current.size);orientation.position.y=-.000999}
      if(leaf==='villager')orientation.scale.set(-.9375*(current.baby?.5:1),-.9375*(current.baby?.5:1),.9375*(current.baby?.5:1))
      assetInfo.motionSource=motion.source;assetInfo.motionTick=motion.tick;return actor
    },dispose(){if(disposed)return;disposed=true;root.visible=false;root.removeFromParent();for(const model of models)model.dispose();for(const resource of resources)resource.dispose();root.clear()}}
    actor.update(entity,Math.max(Date.now(),entity.spawnedAt));return actor
  }catch(error){for(const model of models)model.dispose();for(const resource of resources)resource?.dispose?.();root.clear();throw error}
}
