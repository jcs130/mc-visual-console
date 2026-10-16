// Locked original 1.21.1 bsx dimensions; cgq/cfb/cfx/cge/cgf/cjz/bte data slots.
import {nativeLivingMeta as meta} from './native-living-state.js'
export const NATIVE_AQUATIC_TYPES=Object.freeze('axolotl cod dolphin elder_guardian glow_squid guardian pufferfish salmon squid tadpole tropical_fish turtle'.split(' ').map(s=>'minecraft:'+s))
export const nativeAquaticType=name=>NATIVE_AQUATIC_TYPES.includes(name)
const dimensions={axolotl:[.75,.42,.2751],cod:[.5,.3,.195],dolphin:[.9,.6,.3],elder_guardian:[1.9975,1.9975,.99875],glow_squid:[.8,.8,.4],guardian:[.85,.85,.425],pufferfish:[.7,.7,.455],salmon:[.7,.4,.26],squid:[.8,.8,.4],tadpole:[.4,.3,.19500001],tropical_fish:[.5,.4,.26],turtle:[1.2,.4,.34]}
const dyes=[16383998,16351261,13061821,3847130,16701501,8439583,15961002,4673362,10329495,1481884,8991416,3949738,8606770,6192150,11546150,1908001]
export const nativeAquaticDye=id=>[16,8,0].map(shift=>((dyes[id]>>>shift)&255)/255)
export function nativeAquaticState(entity){
  if(!nativeAquaticType(entity?.name)||!Number.isSafeInteger(entity.entityId)||typeof entity.uuid!=='string'||!(Array.isArray(entity.metadata)||entity.metadata instanceof Map)||!entity.position||!['x','y','z'].every(a=>Number.isFinite(entity.position[a]))||![entity.yaw,entity.pitch,entity.headYaw].every(Number.isFinite))throw Error('NATIVE_AQUATIC_STATE_INVALID')
  const leaf=entity.name.split(':')[1],flags=meta(entity,0,'byte',0),pose=meta(entity,6,'pose',0)
  const state={name:entity.name,leaf,invisible:!!(flags&32),fire:!!(flags&1),outline:!!(flags&64),pose,health:meta(entity,9,'float',1),baby:['axolotl','turtle'].includes(leaf)?meta(entity,16,'boolean',false):false,defaultsSource:'Minecraft_1.21.1_defineSynchedData',issues:[]}
  if(leaf==='axolotl'){state.variant=meta(entity,17,'int',0);state.playingDead=meta(entity,18,'boolean',false);if(state.variant<0||state.variant>4)throw Error('NATIVE_AXOLOTL_VARIANT_INVALID')}
  if(leaf==='pufferfish'){state.puff=meta(entity,17,'int',0);if(state.puff<0||state.puff>2)throw Error('NATIVE_PUFFERFISH_SIZE_INVALID')}
  if(leaf==='tropical_fish'){
    const variant=meta(entity,17,'int',0);state.shape=variant&255;state.pattern=(variant>>>8)&255;state.baseColor=(variant>>>16)&255;state.patternColor=(variant>>>24)&255
    if(state.shape>1||state.pattern>5||state.baseColor>15||state.patternColor>15)throw Error('NATIVE_TROPICAL_FISH_VARIANT_UNSUPPORTED')
  }
  if(leaf==='turtle'){state.hasEgg=meta(entity,18,'boolean',false);state.layingEgg=meta(entity,22,'boolean',false)}
  if(leaf.endsWith('guardian')){state.moving=meta(entity,16,'boolean',false);state.targetId=meta(entity,17,'int',0);if(state.targetId<0)throw Error('NATIVE_GUARDIAN_TARGET_INVALID')}
  if(leaf==='glow_squid')state.darkTicks=meta(entity,16,'int',0)
  if(state.fire)state.issues.push('NATIVE_ENTITY_FIRE_LAYER_UNAVAILABLE')
  if(state.outline)state.issues.push('NATIVE_ENTITY_OUTLINE_LAYER_UNAVAILABLE')
  if(pose!==0)state.issues.push('NATIVE_AQUATIC_POSE_UNAVAILABLE:'+pose)
  if([...(entity.equipment instanceof Map?entity.equipment.values():entity.equipment??[])].some(row=>row.item?.itemCount>0||row.item?.count>0))state.issues.push('NATIVE_AQUATIC_EQUIPMENT_LAYER_UNAVAILABLE')
  return state
}
export function nativeAquaticDimensions(entity){
  const state=nativeAquaticState(entity),base=dimensions[state.leaf].map(Math.fround)
  const scale=state.leaf==='pufferfish'?[.5,.7,1][state.puff]:state.baby?(state.leaf==='turtle'?.3:.5):1
  const attribute=Math.fround(entity.renderScale?.value??1),factor=Math.fround(Math.fround(scale)*attribute)
  if(!Number.isFinite(attribute)||attribute<.0625||attribute>16)throw Error('NATIVE_ENTITY_SCALE_INVALID')
  return {width:Math.fround(base[0]*factor),height:Math.fround(base[1]*factor),eyeHeight:Math.fround(base[2]*factor),source:'Minecraft_1.21.1_EntityType_constructor_dimensions',scaleAttribute:entity.renderScale?.source??'original_scale_constructor_default_no_override_observed',scale:attribute}
}
// Entity.updateFluidHeightAndDoFluidPushing: deflate AABB .001, original
// FluidState.getHeight (full height when same fluid is above), never dry on unknown.
export function nativeAquaticEnvironment(entity,stateAt){
  const d=nativeAquaticDimensions(entity),p=entity.position,e=.001,r=d.width/2
  const box={minX:p.x-r+e,maxX:p.x+r-e,minY:p.y+e,maxY:p.y+d.height-e,minZ:p.z-r+e,maxZ:p.z+r-e}
  let waterHeight=0,inWater=false,bubble=false
  // Entity.touchingUnloadedChunk checks inflated horizontal AABB first.
  for(let cx=Math.floor((p.x-r-1)/16);cx<Math.ceil((p.x+r+1)/16);cx++)for(let cz=Math.floor((p.z-r-1)/16);cz<Math.ceil((p.z+r+1)/16);cz++)if(!stateAt({x:cx*16,y:Math.floor(p.y),z:cz*16}))return {available:false,reason:'NATIVE_AQUATIC_FLUID_BORDER_COLUMN_UNAVAILABLE',dimensions:d,bounds:box}
  for(let x=Math.floor(box.minX);x<Math.ceil(box.maxX);x++)for(let y=Math.floor(box.minY);y<Math.ceil(box.maxY);y++)for(let z=Math.floor(box.minZ);z<Math.ceil(box.maxZ);z++){
    const s=stateAt({x,y,z})
    if(!s||!s.fluid||typeof s.fluid.empty!=='boolean')return {available:false,reason:'NATIVE_AQUATIC_FLUID_COLUMN_OR_STATE_UNAVAILABLE',bounds:box,dimensions:d}
    if(x===Math.floor(p.x)&&y===Math.floor(p.y)&&z===Math.floor(p.z))bubble=s.name==='minecraft:bubble_column'
    if(!s.fluid.empty&&['minecraft:water','minecraft:flowing_water'].includes(s.fluid.name)){
      const above=stateAt({x,y:y+1,z})
      if(!above?.fluid)return {available:false,reason:'NATIVE_AQUATIC_FLUID_ABOVE_UNAVAILABLE',bounds:box,dimensions:d}
      const same=!above.fluid.empty&&['minecraft:water','minecraft:flowing_water'].includes(above.fluid.name)
      const height=same?1:s.fluid.height
      if(!Number.isFinite(height)||height<0||height>1)return {available:false,reason:'NATIVE_AQUATIC_FLUID_HEIGHT_INVALID',bounds:box,dimensions:d}
      const surface=Math.fround(Math.fround(y)+Math.fround(height))
      if(surface>=box.minY){inWater=true;waterHeight=Math.max(waterHeight,surface-box.minY)}
    }
  }
  return {available:true,source:'same_connection_original_fluid_height_and_entity_bounds',inWater,inWaterOrBubble:inWater||bubble,waterHeight,bounds:box,dimensions:d,issues:[]}
}

// Literal EntityType width/height from locked bsx registration; eye default is
// EntityDimensions.height*.85f. Pose-dependent types require original pose rules.
const originalEntityDimensions={"minecraft:bogged":[0.6,1.99,1.74],"minecraft:cave_spider":[0.7,0.5,0.45],"minecraft:chicken":[0.4,0.7,0.644],"minecraft:cow":[0.9,1.4,1.3],"minecraft:creeper":[0.6,1.7,null],"minecraft:drowned":[0.6,1.95,1.74],"minecraft:enderman":[0.6,2.9,2.55],"minecraft:husk":[0.6,1.95,1.74],"minecraft:iron_golem":[1.4,2.7,null],"minecraft:pig":[0.9,0.9,null],"minecraft:sheep":[0.9,1.3,1.235],"minecraft:skeleton":[0.6,1.99,1.74],"minecraft:spider":[1.4,0.9,0.65],"minecraft:stray":[0.6,1.99,1.74],"minecraft:villager":[0.6,1.95,1.62],"minecraft:witch":[0.6,1.95,1.62],"minecraft:wither_skeleton":[0.7,2.4,2.1],"minecraft:zombie":[0.6,1.95,1.74],"minecraft:zombie_villager":[0.6,1.95,1.74],"minecraft:player":[0.6,1.8,1.62]}
export function nativeEntityBounds(entity){
  if(nativeAquaticType(entity?.name))return nativeAquaticDimensions(entity)
  const base=originalEntityDimensions[entity?.name]
  if(!base||meta(entity,6,'pose',0)!==0)return null
  const baby=['minecraft:pig','minecraft:cow','minecraft:chicken','minecraft:sheep','minecraft:villager','minecraft:zombie','minecraft:husk','minecraft:drowned','minecraft:zombie_villager'].includes(entity.name)&&meta(entity,16,'boolean',false)
  const scale=Math.fround(entity.renderScale?.value??1),factor=Math.fround(scale*(baby?.5:1)),height=Math.fround(base[1]),eye=base[2]===null?Math.fround(height*Math.fround(.85)):Math.fround(base[2])
  if(!Number.isFinite(scale)||scale<.0625||scale>16)return null
  return {width:Math.fround(Math.fround(base[0])*factor),height:Math.fround(height*factor),eyeHeight:Math.fround(eye*factor),scale,source:'original_EntityType_dimensions_and_received_scale',scaleAttribute:entity.renderScale?.source??'original_scale_constructor_default_no_override_observed'}
}
