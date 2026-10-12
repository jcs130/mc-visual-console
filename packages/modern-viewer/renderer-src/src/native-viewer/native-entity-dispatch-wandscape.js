import * as THREE from 'three'
import { NativeAssetReader } from './model-loader.js'
import { createNativeModelPart } from './native-entity-model.js'
import { NATIVE_MOB_MOTION_SOURCE } from './native-entity-motion.js'

// Wandscape release a93cca0 / 2.1.3-1211, MIT. Original PlayerModel.createMesh
// baked into HumanoidModel, WizardHatModel and WandscapeNpcModel. This is a
// renderer for that native entity, never a substituted vanilla player entity.
export const WANDSCAPE_JAR_SHA256 = 'b9ff4debb039f1fbcac006fd8b53d306e49f8042611b9eb385f292f8c75f0788'
export const WANDSCAPE_NPC = 'wandscape:wandscape_npc'
const F=Math.fround, RAD=Math.PI/180, wrap=x=>((x+180)%360+360)%360-180
const cube=(uv,origin,size,dilation=0)=>({uv,origin,size,dilation})
const part=(name,pivot,cubes=[],parent,rotation=[0,0,0])=>({name,pivot,cubes,rotation,...(parent?{parent}:{})})
export function wandscapeModelDefinition(layer='body') {
  if(layer==='body')return {parts:[
    part('head',[0,0,0],[cube([0,0],[-4,-8,-4],[8,8,8])]),
    part('hat',[0,0,0],[cube([32,0],[-4,-8,-4],[8,8,8],.5)]),
    part('body',[0,0,0],[cube([16,16],[-4,0,-2],[8,12,4])]),
    part('right_arm',[-5,2,0],[cube([40,16],[-3,-2,-2],[4,12,4])]),
    part('left_arm',[5,2,0],[cube([32,48],[-1,-2,-2],[4,12,4])]),
    part('right_leg',[-1.9,12,0],[cube([0,16],[-2,0,-2],[4,12,4])]),
    part('left_leg',[1.9,12,0],[cube([16,48],[-2,0,-2],[4,12,4])])]}
  if(layer==='edge')return {parts:[part('head',[0,0,0]),part('hat_brim_edge',[0,0,0],[cube([0,0],[-5.5,-9,-5.5],[11,1,11])],'head')]}
  if(layer==='tint')return {parts:[part('head',[0,0,0]),part('hat_brim_inner',[0,0,0],[cube([0,44],[-4.5,-9,-4.5],[9,1,9],.01)],'head'),
    part('hat_body',[0,-9,0],[cube([0,12],[-3.5,-5,-3.5],[7,5,7])],'head'),
    part('hat_layer2',[0,-5,0],[cube([0,24],[-2,-4,-2],[4,4,4])],'hat_body',[-.06,0,.03]),
    part('hat_tip',[0,-4,0],[cube([0,32],[-1,-3,-1],[2,3,2],.2)],'hat_layer2',[-.1,0,.06])]}
  throw Error('NATIVE_WANDSCAPE_MODEL_LAYER_UNSUPPORTED')
}
function meta(e,key,type,fallback) {
  const row=e.metadata.find(r=>r.key===key);if(!row)return fallback
  if(![type,{int:1,byte:0,float:3,string:4,boolean:8,pose:21}[type]].includes(row.type)||
    (['int','byte','pose'].includes(type)?!Number.isInteger(row.value):typeof row.value!==(type==='float'?'number':type))||
    type==='float'&&!Number.isFinite(row.value))throw Error(`NATIVE_WANDSCAPE_METADATA_INVALID:${key}`)
  return row.value
}
export function nativeWandscapeRenderState(e) {
  if(e?.name!==WANDSCAPE_NPC||!Number.isSafeInteger(e.entityId)||!Array.isArray(e.metadata)||!e.position||
    ![e.position.x,e.position.y,e.position.z,e.yaw,e.pitch,e.headYaw].every(Number.isFinite))throw Error('NATIVE_WANDSCAPE_ENTITY_INVALID')
  const flags=meta(e,0,'byte',0),pose=meta(e,6,'pose',0)
  if(pose!==0||flags&17)throw Error('NATIVE_WANDSCAPE_POSE_OR_FIRE_UNSUPPORTED')
  if(meta(e,8,'byte',0)&1)throw Error('NATIVE_WANDSCAPE_ITEM_USE_UNSUPPORTED')
  // HumanoidMobRenderer adds held items, a custom head and elytra layers;
  // ordinary armour has no HumanoidArmorLayer in the upstream renderer.
  if(!Array.isArray(e.equipment)||e.equipment.some(r=>[0,1].includes(r.slot)&&r.item?.itemCount!==0))throw Error('NATIVE_WANDSCAPE_HELD_ITEM_LAYER_UNSUPPORTED')
  if(e.equipment.some(r=>r.item?.itemCount>0&&[4,5].includes(r.slot)))throw Error('NATIVE_WANDSCAPE_HEAD_OR_ELYTRA_LAYER_UNSUPPORTED')
  return {name:e.name,skin:meta(e,16,'int',-1),color:meta(e,17,'int',0)||0xff5030a0,casting:meta(e,18,'boolean',false),
    opKind:meta(e,19,'string',''),status:meta(e,20,'string',''),spell:meta(e,21,'string',''),invisible:Boolean(flags&32),alive:meta(e,9,'float',1)>0}
}
function castPose(b,s,age,pitch,headPitch,headYaw) {
  const spell=s.spell.toLowerCase(),r=b.get('right_arm'),l=b.get('left_arm'),h=b.get('head'),sin=Math.sin,cos=Math.cos
  if(/black_hole|void|singularity/.test(spell)){const p=sin(age*.75)*.08,bob=cos(age*.4)*.04;r.rotation.set(-1.25+pitch*.35+p,-.45+bob,.4,'ZYX');l.rotation.set(-1.25+pitch*.35-p,.45-bob,-.4,'ZYX');h.rotation.set(headPitch-.12,headYaw,0,'ZYX')}
  else if(/beam|ray|frost|breath|electrocute|continuous/.test(spell)){const p=sin(age*.9)*.035;r.rotation.set(-1.55+pitch+p,.08,.02,'ZYX');l.rotation.set(-1.55+pitch+p,-.08,-.02,'ZYX')}
  else if(/meteor|starfall|storm|blizzard|overhead/.test(spell)){const p=sin(age*.35)*.06;r.rotation.set(-2.75+p,.2,.35,'ZYX');l.rotation.set(-2.75-p,-.2,-.35,'ZYX');h.rotation.set(-.55,headYaw*.5,0,'ZYX')}
  else if(/heal|bless|shield|oakskin|fortify|angel/.test(spell)){const p=sin(age*.25)*.03;r.rotation.set(-.85+p,-.45,.25,'ZYX');l.rotation.set(-.85+p,.45,-.25,'ZYX');h.rotation.set(headPitch*.5+.15,headYaw*.5,0,'ZYX')}
  else if(/fireball|lance|icicle|missile|petrify|arrow/.test(spell)){const p=sin(age*.5)*.05;r.rotation.set(-.65+pitch*.4+p,-.55,.55,'ZYX');l.rotation.set(-1.45+pitch,.2,-.1,'ZYX')}
  else {const p=sin(age*.45)*.035;r.rotation.set(-1.2+pitch+p,.12,.05,'ZYX');l.rotation.set(-1.15+pitch*.5-p,.35,-.22,'ZYX')}
  b.get('hat').rotation.copy(h.rotation)
}
export async function createNativeWandscapeActor(reader,e,{loadTexture}={}) {
  if(!(reader instanceof NativeAssetReader)||!reader.manifest.sources?.some(s=>s.sha256===WANDSCAPE_JAR_SHA256&&!s.explicitOverride))throw Error('NATIVE_WANDSCAPE_SOURCE_UNSUPPORTED')
  const state=nativeWandscapeRenderState(e),textures=Object.keys(reader.manifest.assets).filter(k=>/^assets\/wandscape\/textures\/entity\/wizard\/[^/]+\.png$/.test(k)).sort()
  if(!textures.length)throw Error('NATIVE_WANDSCAPE_TEXTURES_MISSING')
  const path=textures[state.skin>=0&&state.skin<textures.length?state.skin:0],root=new THREE.Group(),orientation=new THREE.Group(),content=new THREE.Group()
  root.add(orientation);orientation.add(content);orientation.scale.set(-1,-1,1);content.position.y=-1.501
  const resources=[],models=[];let disposed=false
  try {
    for(const kind of ['body','edge','tint']) {
      const bytes=await reader.bytes(kind==='body'?path:'assets/wandscape/textures/entity/wizard_hat.png'),tex=await loadTexture(bytes);resources.push(tex)
      if(!tex?.isTexture||tex.image?.width!==64||tex.image?.height!==64)throw Error('NATIVE_WANDSCAPE_TEXTURE_DIMENSIONS_INVALID')
      tex.flipY=true;tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.needsUpdate=true
      const material=new THREE.MeshLambertMaterial({map:tex,side:THREE.DoubleSide,alphaTest:.1});resources.push(material)
      if(kind==='tint')material.color.setRGB((state.color>>>16&255)/255,(state.color>>>8&255)/255,(state.color&255)/255,THREE.LinearSRGBColorSpace)
      const model=createNativeModelPart(wandscapeModelDefinition(kind),material,[64,64]);models.push(model);content.add(model.root)
    }
    const actor={root,assetInfo:{type:e.name,sourceJarSha256:WANDSCAPE_JAR_SHA256,sourcePaths:[path,'assets/wandscape/textures/entity/wizard_hat.png'],geometrySource:'Wandscape_2.1.3_PlayerModel_and_WizardHatModel',completeEntityParityVerified:false,animationParityVerified:false},update(next,now=Date.now()){
      if(disposed)throw Error('NATIVE_WANDSCAPE_ACTOR_DISPOSED')
      if(next.entityId!==e.entityId||next.uuid!==e.uuid||next.name!==e.name)throw Error('NATIVE_WANDSCAPE_IDENTITY_MISMATCH')
      const s=nativeWandscapeRenderState(next),m=next.motion
      if(s.skin!==state.skin||s.color!==state.color)throw Error('NATIVE_WANDSCAPE_RENDER_VARIANT_CHANGED')
      if(m?.source!==NATIVE_MOB_MOTION_SOURCE||m.tickMs!==50||!m.previous?.position||!m.walk||!Number.isSafeInteger(m.tick)||
        ![m.sampledAt,m.bodyYaw,m.headYaw,m.pitch,m.previous.bodyYaw,m.previous.headYaw,m.previous.pitch,m.walk.speedOld,m.walk.speed,m.walk.position,...['x','y','z'].flatMap(a=>[m.position?.[a],m.previous.position[a]])].every(Number.isFinite))throw Error('NATIVE_WANDSCAPE_MOTION_UNAVAILABLE')
      const t=Math.max(0,Math.min(1,(now-m.sampledAt)/50)),lerp=(a,b)=>a+(b-a)*t,angle=(a,b)=>a+wrap(b-a)*t
      root.position.set(...['x','y','z'].map(a=>lerp(m.previous.position[a],m.position[a])))
      const body=angle(m.previous.bodyYaw,m.bodyYaw),head=angle(m.previous.headYaw,m.headYaw),pitch=lerp(m.previous.pitch,m.pitch)*RAD,hy=wrap(head-body)*RAD,age=m.tick+t
      root.rotation.y=Math.PI-body*RAD;root.visible=s.alive&&!s.invisible
      const bones=models[0].bones,speed=lerp(m.walk.speedOld,m.walk.speed),phase=(m.walk.position-m.walk.speed*(1-t))*.6662
      for(const bone of bones.values())bone.rotation.set(0,0,0,'ZYX')
      bones.get('head').rotation.set(pitch,hy,0,'ZYX');bones.get('hat').rotation.copy(bones.get('head').rotation)
      bones.get('right_leg').rotation.x=F(Math.cos(phase)*1.4*speed);bones.get('left_leg').rotation.x=F(Math.cos(phase+Math.PI)*1.4*speed)
      bones.get('right_arm').rotation.x=F(Math.cos(phase+Math.PI)*speed);bones.get('left_arm').rotation.x=F(Math.cos(phase)*speed)
      const bobZ=Math.cos(age*.09)*.05+.05,bobX=Math.sin(age*.067)*.05
      bones.get('right_arm').rotation.z=bobZ;bones.get('left_arm').rotation.z=-bobZ;bones.get('right_arm').rotation.x+=bobX;bones.get('left_arm').rotation.x-=bobX
      if(s.casting)castPose(bones,s,age,pitch,pitch,hy)
      for(const model of models.slice(1))model.bones.get('head').rotation.copy(bones.get('head').rotation)
      return actor
    },dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const m of models)m.dispose();for(const r of resources)r?.dispose?.();root.clear()}}
    actor.update(e);return actor
  }catch(error){for(const m of models)m.dispose();for(const r of resources)r?.dispose?.();root.clear();throw error}
}
