import * as THREE from 'three'
import {nativeAquaticState,nativeAquaticDye,nativeAquaticDimensions,nativeEntityBounds} from './native-aquatic-state.js'
import {animateNativeAquatic} from './native-aquatic-animation.js'
import {loadOriginalModelLayers,createOriginalModelLayer,ORIGINAL_MODEL_LAYERS_PATH} from './native-original-model-layers.js'
import {nativeLivingOverlay} from './native-hostile-actors.js'
import {nativePlayerSin as sin,nativePlayerCos as cos} from './native-player-motion.js'
import {ENTITY_MODEL_CLIENT_SHA256} from './native-entity-model.js'
const F=Math.fround
const mix=(a,b,t)=>a+(b-a)*t,wrap=v=>((v+180)%360+360)%360-180,angle=(a,b,t)=>a+wrap(b-a)*t,RAD=F(Math.PI/180)
const leafPaths={cod:'fish/cod',dolphin:'dolphin',elder_guardian:'guardian_elder',glow_squid:'squid/glow_squid',guardian:'guardian',pufferfish:'fish/pufferfish',salmon:'fish/salmon',squid:'squid/squid',tadpole:'tadpole/tadpole',turtle:'turtle/big_sea_turtle'}
const variantKey=s=>JSON.stringify([s.variant,s.puff,s.shape,s.pattern,s.baseColor,s.patternColor])
export async function createNativeAquaticActor(reader,entity,{loadTexture}={}){
  const initial=nativeAquaticState(entity),leaf=initial.leaf,original=await loadOriginalModelLayers(reader),root=new THREE.Group(),rotations=new THREE.Group(),transform=new THREE.Group(),orientation=new THREE.Group(),content=new THREE.Group()
  root.add(rotations);rotations.add(transform);transform.add(orientation);orientation.add(content);orientation.scale.set(-1,-1,1);content.position.y=-1.501
  const models=[],resources=[],layers=[],sourcePaths=[ORIGINAL_MODEL_LAYERS_PATH];let disposed=false
  const key=leaf==='pufferfish'?`minecraft:pufferfish_${['small','medium','big'][initial.puff]}#main`:leaf==='tropical_fish'?`minecraft:tropical_fish_${initial.shape?'large':'small'}#main`:`${entity.name}#main`
  const path=leaf==='axolotl'?`axolotl/axolotl_${['lucy','wild','gold','cyan','blue'][initial.variant]}`:leaf==='tropical_fish'?`fish/tropical_${initial.shape?'b':'a'}`:leafPaths[leaf]
  async function layer(layerKey,texturePath,color=null){
    texturePath=`assets/minecraft/textures/entity/${texturePath}.png`
    const tex=await loadTexture(await reader.bytes(texturePath));resources.push(tex)
    const dimensions=original.layers[layerKey]?.textureSize
    if(!tex?.isTexture||tex.image?.width!==dimensions?.[0]||tex.image?.height!==dimensions?.[1])throw Error('NATIVE_AQUATIC_TEXTURE_DIMENSIONS_INVALID')
    tex.flipY=true;tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.needsUpdate=true
    const material=new THREE.MeshLambertMaterial({map:tex,alphaTest:.1,side:THREE.DoubleSide});resources.push(material);if(color)material.color.setRGB(...color)
    const model=createOriginalModelLayer(original,layerKey,material);models.push(model);content.add(model.root)
    const heads=new THREE.Group(),body=new THREE.Group(),owner=model.bones.get('root');owner.add(heads,body)
    if(leaf==='turtle'||leaf==='axolotl')for(const child of [...owner.children])if(child!==heads&&child!==body)(leaf==='turtle'&&child.name==='head'?heads:body).add(child)
    layers.push({key:layerKey,model,material,overlay:nativeLivingOverlay(material),heads,body});sourcePaths.push(texturePath);return model
  }
  let beam=null,targetIdentity=null,targetId=initial.targetId??0
  try{
    await layer(key,path,leaf==='tropical_fish'?nativeAquaticDye(initial.baseColor):null)
    if(leaf==='tropical_fish')await layer(key.replace('#main','#pattern'),`fish/tropical_${initial.shape?'b':'a'}_pattern_${initial.pattern+1}`,nativeAquaticDye(initial.patternColor))
    if(leaf.endsWith('guardian')){
      const path='assets/minecraft/textures/entity/guardian_beam.png',tex=await loadTexture(await reader.bytes(path));resources.push(tex);sourcePaths.push(path)
      tex.flipY=true;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.colorSpace=THREE.SRGBColorSpace;tex.generateMipmaps=false
      const geometry=new THREE.BufferGeometry(),material=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,vertexColors:true,alphaTest:.1});resources.push(geometry,material)
      beam=new THREE.Mesh(geometry,material);beam.visible=false;root.add(beam)
    }
    const issues=[],assetInfo={type:entity.name,sourcePaths,clientJarSha256:ENTITY_MODEL_CLIENT_SHA256,geometrySource:'original_LayerDefinition_bakeRoot',metadataDefaultsSource:initial.defaultsSource,animationParityVerified:false,completeEntityParityVerified:false,issues}
    const actor={root,assetInfo,update(next,now=Date.now(),{entities,self,camera}={}){
      if(disposed)throw Error('NATIVE_ENTITY_ACTOR_DISPOSED')
      if(next.entityId!==entity.entityId||next.uuid!==entity.uuid||next.name!==entity.name)throw Error('NATIVE_ENTITY_ACTOR_IDENTITY_MISMATCH')
      const state=nativeAquaticState(next),m=next.motion,living=m?.living
      if(variantKey(state)!==variantKey(initial))throw Error('NATIVE_ENTITY_RENDER_VARIANT_CHANGED')
      if(m?.source!=='same_connection_entity_ticks'||m.tickMs!==50||!Number.isSafeInteger(m.tick)||m.tick<0||!m.aquatic||!living||![m.sampledAt,m.bodyYaw,m.yaw,m.headYaw,m.pitch,m.previous?.bodyYaw,m.previous?.yaw,m.previous?.headYaw,m.previous?.pitch,living.hurtTime,living.deathTime,living.attackAnim,living.attackAnimOld,...['x','y','z'].flatMap(a=>[m.position?.[a],m.previous?.position?.[a]])].every(Number.isFinite))throw Error('NATIVE_ENTITY_MOTION_UNAVAILABLE')
      const partial=Math.max(0,Math.min(1,(now-m.sampledAt)/50)),age=F(m.tick+partial),yaw=angle(m.previous.bodyYaw,m.bodyYaw,partial),headYaw=angle(m.previous.headYaw,m.headYaw,partial),pitch=mix(m.previous.pitch,m.pitch,partial),env=m.aquaticEnvironment
      const walk=m.walk?mix(m.walk.position-m.walk.speed,m.walk.position,partial)*(state.baby?3:1):0,speed=m.walk?mix(m.walk.speedOld,m.walk.speed,partial):0
      root.position.set(...['x','y','z'].map(a=>mix(m.previous.position[a],m.position[a],partial)));root.visible=!state.invisible||leaf.endsWith('guardian')&&state.targetId!==0;content.visible=!state.invisible
      rotations.position.set(0,0,0);rotations.rotation.set(0,Math.PI-yaw*RAD,0);transform.position.set(0,0,0);transform.rotation.set(0,0,0);orientation.scale.set(-1,-1,1);content.position.y=-1.501
      if(living.deathTime>0)rotations.rotateZ(Math.min(1,Math.sqrt(Math.max(0,((living.deathTime+partial-1)/20)*1.6)))*Math.PI/2)
      if(Object.values(m.aquatic).some(value=>typeof value==='number'&&!Number.isFinite(value)))throw Error('NATIVE_ENTITY_MOTION_UNAVAILABLE')
      if(env?.available&&(!['inWater','inWaterOrBubble'].every(k=>typeof env[k]==='boolean')||!Number.isFinite(env.waterHeight)))throw Error('NATIVE_AQUATIC_ENVIRONMENT_INVALID')
      const dynamic=[...state.issues,...(env?.issues??[]),'NATIVE_AQUATIC_ORIGINAL_LIGHTMAP_UNAVAILABLE']
      if(!next.renderScale)dynamic.push('NATIVE_AQUATIC_SCALE_OVERRIDE_TELEMETRY_UNCONFIRMED')
      if(!env?.available)dynamic.push(env?.reason??'NATIVE_AQUATIC_WATER_OCCUPANCY_UNAVAILABLE')
      if(leaf==='dolphin'&&!m.velocity)dynamic.push('NATIVE_DOLPHIN_VELOCITY_UNAVAILABLE')
      if(leaf==='cod'||leaf==='salmon'||leaf==='tropical_fish'){
        if(env?.available){const factor=leaf==='salmon'&&!env.inWater?1.3:1,rate=leaf==='salmon'&&!env.inWater?1.7:1;rotations.rotateY(F(F(F(factor)*F(4.3))*sin(F(F(F(rate)*F(.6))*age)))*RAD)
          if(leaf==='salmon')transform.position.z=-.4
          if(!env.inWater){transform.position.add(new THREE.Vector3(leaf==='cod'?.1:.2,.1,leaf==='cod'?-.1:0));transform.rotation.z=Math.PI/2}
        }
      }
      if(leaf==='pufferfish')rotations.position.y=F(cos(F(age*F(.05)))*F(.08))
      if(leaf==='elder_guardian'){const scale=Math.fround(Math.fround(1.9975)/Math.fround(.85));orientation.scale.set(-scale,-scale,scale)}
      if(leaf.endsWith('squid')){rotations.position.y=.5;rotations.rotation.set(0,Math.PI-m.aquatic.bodyYaw*RAD,0);rotations.rotateX(mix(m.aquatic.xBodyRotOld,m.aquatic.xBodyRot,partial)*RAD);rotations.rotateY(mix(m.aquatic.zBodyRotOld,m.aquatic.zBodyRot,partial)*RAD);transform.position.y=-1.2;if(!m.velocity)dynamic.push('NATIVE_SQUID_VELOCITY_UNAVAILABLE')}
      orientation.scale.multiplyScalar(nativeAquaticDimensions(next).scale)
      if(leaf==='glow_squid')dynamic.push('NATIVE_GLOW_SQUID_ORIGINAL_BLOCK_LIGHTMAP_UNAVAILABLE:'+Math.trunc(Math.max(0,Math.min(15,15*(1-m.aquatic.glowDarkTicks/10)))))
      if(m.aquatic.randomPhaseSource?.includes('not_shared'))dynamic.push(leaf.endsWith('squid')?'NATIVE_SQUID_LOCAL_RANDOM_PHASE_DIFFERS_FROM_REFERENCE_CLIENT':'NATIVE_GUARDIAN_LOCAL_RANDOM_PHASE_DIFFERS_FROM_REFERENCE_CLIENT')
      for(const entry of layers){
        entry.overlay.set(living.hurtTime>0||living.deathTime>0)
        if(leaf==='axolotl'){entry.body.scale.setScalar(state.baby?.5:1);entry.body.position.y=state.baby?12:0}
        if(leaf==='turtle'){entry.heads.scale.setScalar(state.baby?1/6:1);entry.heads.position.y=state.baby?20:0;entry.body.scale.setScalar(state.baby?1/6:1);entry.body.position.y=state.baby?20:0;if(!state.baby&&state.hasEgg)content.position.y-=.08}
        animateNativeAquatic(entry.model,state,{age,partial,pitch,headYaw:wrap(headYaw-yaw),walk,speed,motion:m})
      }
      if(leaf.endsWith('guardian')){
        if(state.targetId!==targetId){targetId=state.targetId;targetIdentity=null}
        let target=state.targetId?(entities?.get(state.targetId)??(self?.entityId===state.targetId?self:null)):null
        if(target&&targetIdentity&&target.uuid!==targetIdentity){dynamic.push('NATIVE_GUARDIAN_TARGET_IDENTITY_CHANGED');target=null}
        if(target?.uuid&&!targetIdentity)targetIdentity=target.uuid
        const eyeTarget=state.targetId?target:self
        const targetBounds=target===self&&Number.isInteger(self?.pose)?nativeEntityBounds({...self,name:'minecraft:player',metadata:[{key:6,type:'pose',value:self.pose}]}):target?nativeEntityBounds(target):null
        const eyeHeight=state.targetId?targetBounds?.eyeHeight:eyeTarget?.position?.eyeHeight
        if(eyeTarget?.position&&Number.isFinite(eyeHeight)){
          const eye=eyeTarget.position.y+eyeHeight,ours=root.position.y+nativeAquaticDimensions(next).eyeHeight
          for(const entry of layers){const bone=entry.model.bones.get('eye');bone.position.y=eye>ours?0:1
            const dx=root.position.x-eyeTarget.position.x,dz=root.position.z-eyeTarget.position.z,len=Math.hypot(dx,dz),lookX=-sin(F(next.yaw*RAD))*cos(F(next.pitch*RAD)),lookZ=cos(F(next.yaw*RAD))*cos(F(next.pitch*RAD)),dot=len?lookX*dz/len-lookZ*dx/len:0
            bone.position.x=F(F(F(Math.sqrt(F(Math.abs(dot))))*2)*Math.sign(dot))
          }
        }else dynamic.push(state.targetId?'NATIVE_GUARDIAN_TARGET_EYE_POSITION_UNAVAILABLE':'NATIVE_GUARDIAN_CAMERA_ENTITY_EYE_POSITION_UNAVAILABLE')
        beam.visible=false
        if(state.targetId){
          if(target?.position&&targetBounds){
            const tm=target.motion,targetPosition=tm?.previous?.position?Object.fromEntries(['x','y','z'].map(a=>[a,mix(tm.previous.position[a],tm.position[a],partial)])):target.position
            updateGuardianBeam(beam,root.position,nativeAquaticDimensions(next).eyeHeight,targetPosition,targetBounds.height,m.aquatic.attackTime,partial,m.tick,leaf==='elder_guardian'?60:80);beam.visible=true
            if(!tm?.previous?.position)dynamic.push('NATIVE_GUARDIAN_BEAM_TARGET_INTERPOLATION_UNAVAILABLE')
          }else dynamic.push('NATIVE_GUARDIAN_BEAM_TARGET_BOUNDS_UNAVAILABLE:'+state.targetId)
        }
      }
      root.userData.nativeLiving={type:state.name,health:state.health,tick:m.tick,hurtTime:living.hurtTime,deathTime:living.deathTime,attackAnim:mix(living.attackAnimOld,living.attackAnim,partial),issues:dynamic}
      root.userData.nativeAquatic={environment:env,originalModelKeys:layers.map(entry=>entry.key),animationAvailable:(env?.available===true||leaf==='pufferfish'||leaf==='dolphin'&&!!m.velocity)&&state.pose===0,animationInputs:{waterOccupancy:env?.available===true?'available':'unavailable',velocity:m.velocity?'received':'unavailable',livingCounters:'received_cues_and_connection_ticks',scale:next.renderScale?.source??'original_constructor_baseline_override_telemetry_unconfirmed'}}
      issues.splice(0,issues.length,...dynamic);assetInfo.motionSource=m.source;assetInfo.motionTick=m.tick;return actor
    },dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.visible=false;for(const model of models)model.dispose();for(const resource of resources)resource.dispose();root.clear()}}
    actor.update(entity,entity.motion?.sampledAt??entity.spawnedAt);return actor
  }catch(error){for(const model of models)model.dispose();for(const resource of resources)resource.dispose();root.clear();throw error}
}
// gkx: two crossed beam quads and end cap; original UV scroll/color/fullbright pass.
export function updateGuardianBeam(mesh,origin,eyeHeight,target,height,attackTime,partial,tick,duration){
  const delta=new THREE.Vector3(target.x-origin.x,target.y+height*.5-origin.y-eyeHeight,target.z-origin.z),length=F(delta.length()+1),t=F(attackTime+partial),q=F(F(t/duration)**2),phase=F(F(t*F(.05))*F(-1.5)),scroll=F(F(F(t*F(.5))%1)-1)
  const color=[64+Math.trunc(F(q*191)),32+Math.trunc(F(q*191)),128-Math.trunc(F(q*64))].map(c=>c/255),pos=[],uv=[],colors=[],indices=[]
  const point=(a,r)=>[F(cos(F(phase+F(a)))*F(r)),F(sin(F(phase+F(a)))*F(r))]
  const add=vertices=>{const start=pos.length/3;for(const [x,y,z,u,v]of vertices){pos.push(x,y,z);uv.push(u,1-v);colors.push(...color)}indices.push(start,start+1,start+2,start,start+2,start+3)}
  for(const [a,b]of [[Math.PI,0],[Math.PI/2,Math.PI*1.5]]){const [x,z]=point(a,.2),[x2,z2]=point(b,.2);add([[x,length,z,.4999,length*2.5+scroll],[x,0,z,.4999,scroll],[x2,0,z2,0,scroll],[x2,length,z2,0,length*2.5+scroll]])}
  const end=tick%2===0?.5:0,points=[.75,.25,1.75,1.25].map(v=>point(v*Math.PI,.282));add(points.map(([x,z],i)=>[x,length,z,[.5,1,1,.5][i],[end+.5,end+.5,end,end][i]]))
  mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));mesh.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));mesh.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));mesh.geometry.setIndex(indices);mesh.geometry.computeBoundingSphere()
  mesh.position.set(0,eyeHeight,0);delta.normalize();mesh.rotation.set(0,0,0);mesh.rotateY(F(F(Math.PI/2)-F(Math.atan2(delta.z,delta.x))));mesh.rotateX(F(Math.acos(delta.y)))
}
