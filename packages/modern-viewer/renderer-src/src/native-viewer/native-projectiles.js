import * as THREE from 'three'
import { createNativeModelPart,ENTITY_MODEL_CLIENT_SHA256 } from './native-entity-model.js'
import { nativeClientSourceVerified } from './native-client-source.js'
import { nativeLivingMeta } from './native-living-state.js'
import { nativePlayerSin } from './native-player-motion.js'
import { nativeProjectileType,nativeProjectileFrame,nativeExperienceSprite } from './native-projectile-state.js'
export { NATIVE_PROJECTILE_TYPES,nativeProjectileType,nativeProjectileFrame,nativeExperienceSprite } from './native-projectile-state.js'

const RAD=Math.PI/180

const quad=(position,uv)=>{
  const g=new THREE.BufferGeometry()
  g.setAttribute('position',new THREE.Float32BufferAttribute(position.flat(),3))
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv.flatMap(([u,v])=>[u,1-v]),2))
  g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();return g
}
export function nativeArrowGeometry() {
  const faces=[quad([[-7,-2,-2],[-7,-2,2],[-7,2,2],[-7,2,-2]],[[0,.15625],[.15625,.15625],[.15625,.3125],[0,.3125]]),
    quad([[-7,2,-2],[-7,2,2],[-7,-2,2],[-7,-2,-2]],[[0,.15625],[.15625,.15625],[.15625,.3125],[0,.3125]])]
  for(let i=1;i<=4;i++){
    const g=quad([[-8,-2,0],[8,-2,0],[8,2,0],[-8,2,0]],[[0,0],[.5,0],[.5,.15625],[0,.15625]])
    g.rotateX(i*Math.PI/2);faces.push(g)
  }
  return faces
}
export const nativeTridentModel=()=>({parts:[
  {name:'pole',pivot:[0,0,0],cubes:[{uv:[0,6],origin:[-.5,2,-.5],size:[1,25,1]}]},
  {name:'base',parent:'pole',pivot:[0,0,0],cubes:[{uv:[4,0],origin:[-1.5,0,-.5],size:[3,2,1]}]},
  ...[['left_spike',[-2.5,-3,-.5],[4,3],false],['middle_spike',[-.5,-4,-.5],[0,0],false],['right_spike',[1.5,-3,-.5],[4,3],true]]
    .map(([name,origin,uv,mirror])=>({name,parent:'pole',pivot:[0,0,0],cubes:[{uv,origin,size:[1,4,1],mirror}]}))]})

async function texture(bytes){const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));try{return await new THREE.TextureLoader().loadAsync(url)}finally{URL.revokeObjectURL(url)}}
export async function createNativeProjectileActor(reader,entity,{loadTexture=texture}={}) {
  if(!nativeProjectileType(entity?.name)||!nativeClientSourceVerified(reader.manifest,ENTITY_MODEL_CLIENT_SHA256))throw Error('NATIVE_PROJECTILE_SOURCE_UNSUPPORTED')
  const leaf=entity.name.split(':')[1],arrow=['arrow','spectral_arrow'].includes(leaf),orb=leaf==='experience_orb',bobber=leaf==='fishing_bobber'
  const color=leaf==='arrow'?nativeLivingMeta(entity,10,'int',-1):-1
  const path=`assets/minecraft/textures/entity/${arrow?'projectiles/'+(leaf==='spectral_arrow'?'spectral_arrow':color>0?'tipped_arrow':'arrow'):bobber?'fishing_hook':leaf}.png`
  const root=new THREE.Group(),yaw=new THREE.Group(),pose=new THREE.Group(),resources=[],geometries=[]
  let model=null,disposed=false;root.add(yaw);yaw.add(pose)
  try {
    const tex=await loadTexture(await reader.bytes(path));resources.push(tex)
    const size=orb?64:bobber?8:32
    if(!tex?.isTexture||tex.image?.width!==size||tex.image?.height!==size)throw Error('NATIVE_PROJECTILE_TEXTURE_DIMENSIONS_INVALID')
    tex.flipY=true;tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.needsUpdate=true
    const material=orb?new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:128/255,depthWrite:true,side:THREE.DoubleSide})
      :new THREE.MeshLambertMaterial({map:tex,alphaTest:.1,side:THREE.DoubleSide})
    resources.push(material)
    if(arrow){
      const roll=new THREE.Group(),scaled=new THREE.Group(),translated=new THREE.Group();pose.add(roll);roll.rotation.x=Math.PI/4
      roll.add(scaled);scaled.scale.setScalar(.05625);scaled.add(translated);translated.position.x=-4
      for(const g of nativeArrowGeometry()){geometries.push(g);translated.add(new THREE.Mesh(g,material))}
    }else if(leaf==='trident'){model=createNativeModelPart(nativeTridentModel(),material,[32,32]);pose.add(model.root)}
    else {
      if(orb&&(!Number.isInteger(entity.experienceValue)||entity.experienceValue<=0||entity.experienceValue>32767))throw Error('NATIVE_EXPERIENCE_VALUE_UNAVAILABLE')
      const index=orb?nativeExperienceSprite(entity.experienceValue):0,u=orb?(index%4)/4:0,v=orb?Math.floor(index/4)/4:0,d=orb?.25:1
      const g=quad(orb?[[-.5,-.25,0],[.5,-.25,0],[.5,.75,0],[-.5,.75,0]]:[[-.5,-.5,0],[.5,-.5,0],[.5,.5,0],[-.5,.5,0]],[[u,v+d],[u+d,v+d],[u+d,v],[u,v]])
      geometries.push(g);const mesh=new THREE.Mesh(g,material);pose.add(mesh);pose.scale.setScalar(orb?.3:.5);pose.position.y=orb?.1:0
      mesh.onBeforeRender=(_renderer,_scene,camera)=>{yaw.quaternion.copy(camera.quaternion)}
    }
    const issues=[...(arrow?['NATIVE_ARROW_IMPACT_SHAKE_UNAVAILABLE']:[]),...(leaf==='trident'&&nativeLivingMeta(entity,11,'boolean',false)?['NATIVE_TRIDENT_FOIL_PASS_UNAVAILABLE']:[]),
      ...(bobber?['NATIVE_FISHING_LINE_HAND_ENDPOINT_UNAVAILABLE']:[]),...(orb?['NATIVE_EXPERIENCE_LIGHTMAP_UNAVAILABLE']:[])]
    const assetInfo={type:entity.name,sourcePaths:[path],geometrySource:'Minecraft_1.21.1_original_projectile_renderer',issues,
      completeEntityParityVerified:false,pixelParityVerified:false}
    const actor={root,assetInfo,update(next,now=Date.now(),context={}) {
      if(disposed||next.entityId!==entity.entityId||next.uuid!==entity.uuid||next.spawnedAt!==entity.spawnedAt)throw Error('NATIVE_PROJECTILE_BINDING_MISMATCH')
      const frame=nativeProjectileFrame(next,now);root.position.fromArray(frame.position)
      root.visible=!(nativeLivingMeta(next,0,'byte',0)&32)
      if(arrow||leaf==='trident'){yaw.rotation.y=(frame.yaw-90)*RAD;pose.rotation.z=(frame.pitch+(arrow?0:90))*RAD}
      if(orb){const t=Math.fround(frame.age/2),r=Math.trunc(Math.fround(Math.fround(Math.fround(nativePlayerSin(t)+1)*.5)*255)),b=Math.trunc(Math.fround(Math.fround(Math.fround(nativePlayerSin(Math.fround(t+4.1887903))+1)*.1)*255));material.color.setRGB(r/255,1,b/255)}
      if(bobber){const owner=next.objectData;root.visible&&=Number.isSafeInteger(owner)&&(context.self?.entityId===owner||context.entities?.has(owner))}
      root.userData.nativeProjectile={type:entity.name,experienceValue:orb?entity.experienceValue:null,ownerEntityId:bobber?next.objectData:null,issues}
    },dispose(){if(disposed)return;disposed=true;root.removeFromParent();model?.dispose();for(const g of geometries)g.dispose();for(const r of resources)r.dispose();root.clear()}}
    actor.update(entity,entity.motion?.sampledAt??Date.now());return actor
  }catch(error){model?.dispose();for(const g of geometries)g.dispose();for(const r of resources)r.dispose();root.clear();throw error}
}
