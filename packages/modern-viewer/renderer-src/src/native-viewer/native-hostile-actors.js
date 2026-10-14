import * as THREE from 'three'
import { createNativeModelPart, ENTITY_MODEL_CLIENT_SHA256 } from './native-entity-model.js'
import { nativeHostileState } from './native-living-state.js'
import { nativeHostileModelDefinition, NATIVE_HOSTILE_TEXTURES } from './native-hostile-models.js'
import { nativePlayerSin as sin, nativePlayerCos as cos } from './native-player-motion.js'
import { prepareNativeHeldItem, buildNativeHeldItemObject, disposeNativeHeldItemObject } from './native-held-items.js'
import { NATIVE_MOB_MOTION_SOURCE } from './native-entity-motion.js'

const F=Math.fround,PI=F(Math.PI),RAD=F(.017453292),wrap=v=>((v+180)%360+360)%360-180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v))
const lerp=(a,b,t)=>a+(b-a)*t,triangle=(v,p)=>(Math.abs(v%p-p*.5)-p*.25)/(p*.25)
const skeleton=leaf=>['skeleton','stray','wither_skeleton','bogged'].includes(leaf)
const zombie=leaf=>['zombie','husk','drowned','zombie_villager'].includes(leaf)
const spider=leaf=>['spider','cave_spider'].includes(leaf)

// OverlayTexture 0xb20000ff and the original cutout shader's mix order.
// Keep texture/color ownership: hurt adds red instead of multiplying skin red.
export function nativeLivingOverlay(material) {
  const red={value:0},white={value:0}
  material.onBeforeCompile=shader=>{
    shader.uniforms.nativeHurt=red;shader.uniforms.nativeWhite=white
    shader.fragmentShader='uniform float nativeHurt;\nuniform float nativeWhite;\n'+shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,0.,0.),nativeHurt);\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.),nativeWhite);')
  }
  material.customProgramCacheKey=()=> 'native-1.21.1-living-overlay-v1'
  return {set(hurt,progress=0){
    red.value=hurt?77/255:0
    const u=Math.trunc(F(F(clamp(progress,0,1))*15)),alpha=Math.trunc(F(F(1-F(F(F(u)/15)*F(.75)))*255))
    white.value=hurt?0:1-alpha/255
  }}
}

export function animateNativeHostile(model,definition,state,{headX,headY,walk,speed,age,partial,living,entityId,mainItem}) {
  const b=model.bones,leaf=state.name.split(':')[1],phase=F(walk*F(.6662))
  for(const p of definition.parts){const bone=b.get(p.name);bone.position.fromArray(p.pivot);bone.rotation.set(...p.rotation,'ZYX')}
  const setHead=()=>{b.get('head').rotation.set(headX,headY,0,'ZYX');if(b.has('hat')&&!b.get('hat').parent.name)b.get('hat').rotation.copy(b.get('head').rotation)}
  setHead()
  const leg=(offset=0)=>F(F(cos(F(phase+offset))*F(1.4))*speed)
  if(b.has('right_leg')){b.get('right_leg').rotation.x=leg();b.get('left_leg').rotation.x=leg(PI)}
  if(b.has('right_arm')){b.get('right_arm').rotation.x=F(cos(F(phase+PI))*speed);b.get('left_arm').rotation.x=F(cos(phase)*speed)}
  let attack=lerp(living.attackAnimOld,living.attackAnim,partial)
  if(living.attackAnim<living.attackAnimOld)attack=lerp(living.attackAnimOld,living.attackAnim+1,partial)%1
  const a=sin(F(attack*PI)),a2=sin(F(F(1-F(F(1-attack)*F(1-attack)))*PI))
  const bob=()=>{const right=b.get('right_arm'),left=b.get('left_arm'),z=F(F(cos(F(age*F(.09)))*F(.05))+F(.05)),x=F(sin(F(age*F(.067)))*F(.05));right.rotation.z+=z;left.rotation.z-=z;right.rotation.x+=x;left.rotation.x-=x}
  if(zombie(leaf)||skeleton(leaf)&&state.aggressive&&mainItem!=='minecraft:bow'){
    const right=b.get('right_arm'),left=b.get('left_arm'),base=zombie(leaf)?-PI/(state.aggressive?1.5:2.25):-PI/2
    right.rotation.set(base+(zombie(leaf)?1:-1)*(1.2*a-.4*a2),-(.1-.6*a),0,'ZYX')
    left.rotation.set(right.rotation.x,.1-.6*a,0,'ZYX');bob()
  }else if(skeleton(leaf)&&state.aggressive&&mainItem==='minecraft:bow'){
    const right=b.get('right_arm'),left=b.get('left_arm'),isRight=state.mainArm==='right'
    right.rotation.set(-PI/2+headX,headY-(isRight?.1:.5),0,'ZYX');left.rotation.set(-PI/2+headX,headY+(isRight?.5:.1),0,'ZYX');bob()
  }else if(b.has('right_arm')&&leaf!=='iron_golem')bob()
  if(leaf==='drowned'&&state.aggressive&&mainItem==='minecraft:trident'){
    const arm=b.get(`${state.mainArm}_arm`);arm.rotation.x=arm.rotation.x*.5-PI;arm.rotation.y=0
  }
  if(leaf==='creeper')for(const [name,offset]of [['right_hind_leg',PI],['left_hind_leg',0],['right_front_leg',0],['left_front_leg',PI]])b.get(name).rotation.x=leg(offset)
  if(spider(leaf)){
    const names=['hind','middle_hind','middle_front','front'],ys=[PI/4,PI/8,-PI/8,-PI/4],zs=[-PI/4,-.58119464,-.58119464,-PI/4],phases=[0,PI,PI/2,PI*1.5]
    for(let i=0;i<4;i++){
      const y=-cos(F(F(phase*2)+phases[i]))*.4*speed,z=Math.abs(sin(F(phase+phases[i]))*.4)*speed
      b.get(`right_${names[i]}_leg`).rotation.set(0,ys[i]+y,zs[i]+z,'ZYX');b.get(`left_${names[i]}_leg`).rotation.set(0,-ys[i]-y,-zs[i]-z,'ZYX')
    }
  }
  if(leaf==='bogged'&&b.has('mushrooms'))b.get('mushrooms').visible=!state.sheared
  if(leaf==='enderman'){
    for(const n of ['right_arm','left_arm','right_leg','left_leg'])b.get(n).rotation.x=clamp(b.get(n).rotation.x*.5,-.4,.4)
    if(state.carriedBlock!==null){b.get('right_arm').rotation.set(-.5,0,.05);b.get('left_arm').rotation.set(-.5,0,-.05)}
    if(state.creepy)b.get('head').position.y-=5
    b.get('hat').position.copy(b.get('head').position);b.get('hat').rotation.copy(b.get('head').rotation)
  }
  if(leaf==='witch'){
    const nose=b.get('nose'),rate=(entityId%10)*.01,tick=Math.floor(age)
    nose.rotation.set(sin(F(tick*rate))*4.5*RAD,0,cos(F(tick*rate))*2.5*RAD,'ZYX')
    if(mainItem){nose.position.set(0,1,-1.5);nose.rotation.x=-.9}
    b.get('right_leg').rotation.x*=.5;b.get('left_leg').rotation.x*=.5
  }
  if(leaf==='iron_golem'){
    b.get('right_leg').rotation.x=-1.5*triangle(walk,13)*speed;b.get('left_leg').rotation.x=1.5*triangle(walk,13)*speed
    if(living.attackTimer>0)b.get('right_arm').rotation.x=b.get('left_arm').rotation.x=-2+1.5*triangle(living.attackTimer-partial,10)
    else if(living.flowerTimer>0){b.get('right_arm').rotation.x=-.8+.025*triangle(living.flowerTimer,70);b.get('left_arm').rotation.x=0}
    else {b.get('right_arm').rotation.x=(-.2+1.5*triangle(walk,13))*speed;b.get('left_arm').rotation.x=(-.2-1.5*triangle(walk,13))*speed}
  }
}

export async function createNativeHostileActor(reader,entity,{loadTexture,readPixels}={}) {
  const initial=nativeHostileState(entity),leaf=initial.name.split(':')[1],[basePath,width,height,scale]=NATIVE_HOSTILE_TEXTURES[leaf]
  const root=new THREE.Group(),orientation=new THREE.Group(),content=new THREE.Group();root.add(orientation);orientation.add(content);content.position.y=-1.501
  const layers=[],resources=[],held=[],issues=[],sourcePaths=[];let disposed=false
  const layer=async(kind,path,{emissive=false,additive=false}={})=>{
    path=`assets/minecraft/textures/entity/${path}.png`
    const texture=await loadTexture(await reader.bytes(path));resources.push(texture)
    if(!texture?.isTexture||texture.image?.width!==width||texture.image?.height!==height)throw Error('NATIVE_HOSTILE_TEXTURE_DIMENSIONS_INVALID')
    texture.flipY=true;texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true
    const options={map:texture,alphaTest:.1,side:THREE.DoubleSide,...(emissive?{transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}:{})}
    const material=emissive?new THREE.MeshBasicMaterial(options):new THREE.MeshLambertMaterial(options)
    if(additive){material.transparent=true;material.blending=THREE.AdditiveBlending;material.depthWrite=false;material.color.setRGB(.5,.5,.5)}
    resources.push(material)
    const overlay=emissive||additive?null:nativeLivingOverlay(material),definition=nativeHostileModelDefinition(initial.name,kind),model=createNativeModelPart(definition,material,[width,height])
    content.add(model.root)
    const heads=new THREE.Group(),body=new THREE.Group();model.root.add(heads,body)
    for(const bone of [...model.root.children])if(bone!==heads&&bone!==body)(bone.name==='head'?heads:body).add(bone)
    layers.push({kind,model,definition,heads,body,material,overlay});sourcePaths.push(path);return model
  }
  try {
    const base=await layer('base',basePath)
    if(leaf==='drowned')await layer('outer','zombie/drowned_outer_layer')
    if(leaf==='stray'||leaf==='bogged')await layer('outer',`skeleton/${leaf}_overlay`)
    if(leaf==='creeper')await layer('charged','creeper/creeper_armor',{additive:true})
    if(spider(leaf))await layer('eyes','spider_eyes',{emissive:true})
    if(leaf==='enderman')await layer('eyes','enderman/enderman_eyes',{emissive:true})
    for(const row of initial.equipment){
      if(!(row.item?.itemCount>0||row.item?.count>0))continue
      const stack=row.stack?.available===true?row.stack.item:null
      if(!stack){issues.push('NATIVE_MOB_EQUIPMENT_COMPONENTS_UNAVAILABLE');continue}
      if(![0,1].includes(row.slot)||!base.bones.has('right_arm')){issues.push('NATIVE_MOB_ARMOR_OR_SPECIAL_ITEM_LAYER_UNAVAILABLE');continue}
      const arm=row.slot===0?initial.mainArm:initial.mainArm==='right'?'left':'right',textures=new Map()
      try {
        const plan=await prepareNativeHeldItem(reader,stack,arm,{...(readPixels?{readPixels}:{})})
        for(const [path,value]of plan.textureLayers??new Map([[plan.texturePath,{bytes:plan.textureBytes}]]))textures.set(path,await loadTexture(value.bytes))
        const object=buildNativeHeldItemObject(plan,plan.textureLayers?textures:textures.get(plan.texturePath)),mount=new THREE.Group()
        mount.matrixAutoUpdate=false
        const transform=plan.transform,modelMatrix=new THREE.Matrix4().compose(new THREE.Vector3(...transform.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.radians,'XYZ')),new THREE.Vector3(...transform.scale))
        mount.matrix.makeScale(16,16,16).multiply(new THREE.Matrix4().makeRotationX(-Math.PI/2)).multiply(new THREE.Matrix4().makeRotationY(Math.PI))
          .multiply(new THREE.Matrix4().makeTranslation(arm==='left'?-1/16:1/16,.125,-.625)).multiply(modelMatrix)
        // Skeleton.translateToHand shifts the pivot before the arm rotation.
        if(skeleton(leaf))mount.userData.pivotOffset=arm==='right'?1:-1
        mount.userData.originalMatrix=mount.matrix.clone();mount.add(object);base.bones.get(`${arm}_arm`).add(mount);held.push({object,textures,mount,arm})
        sourcePaths.push(...plan.sourcePaths)
      }catch(error){for(const texture of textures.values())texture.dispose();issues.push(`${stack.name}:${error.message}`)}
    }
    const assetInfo={type:initial.name,clientJarSha256:ENTITY_MODEL_CLIENT_SHA256,sourcePaths,geometrySource:'Minecraft_1.21.1_original_ModelPart_layers',
      metadataDefaultsSource:initial.defaultsSource,animationParityVerified:false,completeEntityParityVerified:false,issues}
    const actor={root,assetInfo,update(next,now=Date.now()){
      if(disposed)throw Error('NATIVE_ENTITY_ACTOR_DISPOSED')
      if(next.entityId!==entity.entityId||next.uuid!==entity.uuid||next.name!==entity.name)throw Error('NATIVE_ENTITY_ACTOR_IDENTITY_MISMATCH')
      const state=nativeHostileState(next),m=next.motion,living=m?.living
      if(m?.source!==NATIVE_MOB_MOTION_SOURCE||m.tickMs!==50||!m.previous?.position||!m.walk||!Number.isSafeInteger(m.tick)||!living||
        ![m.tick,m.sampledAt,m.bodyYaw,m.headYaw,m.pitch,m.previous.bodyYaw,m.previous.headYaw,m.previous.pitch,m.walk.speedOld,m.walk.speed,m.walk.position,
          living.hurtTime,living.deathTime,living.attackAnim,living.attackAnimOld,...['x','y','z'].flatMap(a=>[m.position?.[a],m.previous.position[a]])].every(Number.isFinite))throw Error('NATIVE_ENTITY_MOTION_UNAVAILABLE')
      const partial=clamp((now-m.sampledAt)/50,0,1),bodyYaw=m.previous.bodyYaw+wrap(m.bodyYaw-m.previous.bodyYaw)*partial,
        headYaw=m.previous.headYaw+wrap(m.headYaw-m.previous.headYaw)*partial,pitch=lerp(m.previous.pitch,m.pitch,partial),age=m.tick+partial,
        speed=F(lerp(m.walk.speedOld,m.walk.speed,partial)),walk=F(m.walk.position-F(m.walk.speed*F(1-partial)))*(state.baby?3:1)
      root.position.set(...['x','y','z'].map(a=>lerp(m.previous.position[a],m.position[a],partial)));root.rotation.set(0,Math.PI-bodyYaw*Math.PI/180,0)
      root.visible=!state.invisible||spider(leaf)||leaf==='enderman'
      orientation.scale.set(-scale,-scale,scale);orientation.rotation.z=0
      if(living.deathTime>0)orientation.rotation.z=Math.min(1,Math.sqrt(Math.max(0,((living.deathTime+partial-1)/20)*1.6)))*(spider(leaf)?Math.PI:Math.PI/2)
      else if(leaf==='iron_golem'&&speed>=.01)orientation.rotation.z=6.5*RAD*triangle(walk+6,13)
      let white=0
      if(leaf==='creeper'){
        const swelling=F(lerp(living.oldSwell,living.swell,partial)/28),pulse=1+sin(F(swelling*100))*swelling*.01,q=clamp(swelling,0,1)**4
        orientation.scale.set(-(1+.4*q)*pulse,-(1+.1*q)/pulse,(1+.4*q)*pulse)
        white=Math.floor(swelling*10)%2===0?0:clamp(swelling,.5,1)
      }
      const mainItem=state.equipment.find(row=>row.slot===0)?.stack?.item?.name??null
      for(const entry of layers){
        entry.heads.scale.setScalar(state.baby?.75:1);entry.heads.position.y=state.baby?12:0;entry.body.scale.setScalar(state.baby?.5:1);entry.body.position.y=state.baby?12:0
        entry.model.root.visible=entry.kind==='charged'?state.powered:entry.kind==='eyes'?true:!state.invisible
        if(entry.kind==='charged'){entry.material.map.offset.set(age*.01%1,age*.01%1);entry.material.map.wrapS=entry.material.map.wrapT=THREE.RepeatWrapping}
        entry.overlay?.set(living.hurtTime>0||living.deathTime>0,white)
        animateNativeHostile(entry.model,entry.definition,state,{headX:F(pitch*RAD),headY:F(wrap(headYaw-bodyYaw)*RAD),walk,speed,age,partial,living,entityId:next.entityId,mainItem})
      }
      for(const row of held)if(row.mount.userData.pivotOffset){
        const arm=base.bones.get(`${row.arm}_arm`),offset=new THREE.Vector3(row.mount.userData.pivotOffset,0,0).applyQuaternion(arm.quaternion.clone().invert())
        row.mount.matrix.makeTranslation(...offset.toArray()).multiply(row.mount.userData.originalMatrix)
      }
      const dynamic=[...issues]
      if(state.fire)dynamic.push('NATIVE_ENTITY_FIRE_LAYER_UNAVAILABLE')
      if(state.outline)dynamic.push('NATIVE_ENTITY_OUTLINE_LAYER_UNAVAILABLE')
      if(state.pose!==0)dynamic.push(`NATIVE_ENTITY_POSE_UNAVAILABLE:${state.pose}`)
      if(leaf==='enderman'&&state.carriedBlock!==null)dynamic.push('NATIVE_ENDERMAN_CARRIED_BLOCK_LAYER_UNAVAILABLE')
      if(leaf==='zombie_villager')dynamic.push('NATIVE_ZOMBIE_VILLAGER_PROFESSION_LAYERS_UNAVAILABLE')
      if(leaf==='iron_golem')dynamic.push('NATIVE_GOLEM_MAX_HEALTH_ATTRIBUTE_UNAVAILABLE')
      root.userData.nativeLiving={type:state.name,health:state.health,tick:m.tick,hurtTime:living.hurtTime,deathTime:living.deathTime,issues:dynamic}
      assetInfo.motionSource=m.source;assetInfo.motionTick=m.tick;return actor
    },dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const row of held){disposeNativeHeldItemObject(row.object);for(const t of row.textures.values())t.dispose()}for(const row of layers)row.model.dispose();for(const resource of resources)resource.dispose();root.clear()}}
    actor.update(entity,entity.motion.sampledAt);return actor
  }catch(error){for(const row of held){disposeNativeHeldItemObject(row.object);for(const t of row.textures.values())t.dispose()}for(const row of layers)row.model.dispose();for(const resource of resources)resource.dispose();root.clear();throw error}
}
