import * as THREE from 'three'
import {nativeClientSourceVerified} from './native-client-source.js'
import {ENTITY_MODEL_CLIENT_SHA256} from './native-entity-model.js'

export const ORIGINAL_MODEL_LAYERS_PATH='assets/minecraft/native/client-model-layers.json'
export const ORIGINAL_MODEL_LAYERS_SHA256='3571f2c6d4fbaa2e07db239853e0baf5db9dd07c5b66653cafa7588da466fbe3'
const loaded=new WeakMap(),vector=(value,n)=>Array.isArray(value)&&value.length===n&&value.every(Number.isFinite)

// One original CPU bake of *every* LayerDefinitions entry. Resource integrity
// and rest geometry are separate from a renderer's texture, pose and animation.
export function loadOriginalModelLayers(reader) {
  if(!loaded.has(reader))loaded.set(reader,(async()=>{
    if(!nativeClientSourceVerified(reader.manifest,ENTITY_MODEL_CLIENT_SHA256)||reader.manifest.assets[ORIGINAL_MODEL_LAYERS_PATH]?.sha256!==ORIGINAL_MODEL_LAYERS_SHA256)throw Error('NATIVE_ORIGINAL_MODEL_LAYERS_SOURCE_UNVERIFIED')
    const data=await reader.json(ORIGINAL_MODEL_LAYERS_PATH)
    if(data.schemaVersion!==1||data.minecraftVersion!=='1.21.1'||data.clientJarSha256!==ENTITY_MODEL_CLIENT_SHA256||data.modelUnits!=='original_Y_down_pixels'||data.rotationOrder!=='ZYX'||Object.keys(data.layers??{}).length!==213||data.blockEntityRenderers?.length!==44)throw Error('NATIVE_ORIGINAL_MODEL_LAYERS_INVALID')
    for(const [key,count] of Object.entries({entities:130,particles:109,blockEntities:44,menus:25}))if(data.registries?.[key]?.length!==count)throw Error('NATIVE_ORIGINAL_REGISTRY_INCOMPLETE')
    return data
  })())
  return loaded.get(reader)
}

export function createOriginalModelLayer(data,key,material) {
  const definition=data?.layers?.[key]
  if(!definition||!Array.isArray(definition.parts)||definition.parts.length>128||!material?.isMaterial)throw Error('NATIVE_ORIGINAL_MODEL_LAYER_UNAVAILABLE')
  const root=new THREE.Group(),bones=new Map(),geometries=new Set(),names=new Map()
  try {
    for(const part of definition.parts){
      if(typeof part.path!=='string'||bones.has(part.path)||!vector(part.pivot,3)||!vector(part.rotationZYX,3)||!vector(part.scale,3)||typeof part.visible!=='boolean'||typeof part.skipDraw!=='boolean'||!Array.isArray(part.polygons)||part.polygons.length>4096)throw Error('NATIVE_ORIGINAL_MODEL_PART_INVALID')
      const bone=new THREE.Group();bone.name=part.name;bone.position.fromArray(part.pivot);bone.rotation.set(...part.rotationZYX,'ZYX');bone.scale.fromArray(part.scale);bone.visible=part.visible
      bones.set(part.path,bone);names.set(part.name,names.has(part.name)?null:bone)
      if(!part.skipDraw&&part.polygons.length){
        const positions=[],uv=[],normals=[],indices=[]
        for(const face of part.polygons){
          if(!vector(face.positions,12)||!vector(face.uv,8)||!vector(face.normal,3))throw Error('NATIVE_ORIGINAL_MODEL_POLYGON_INVALID')
          const offset=positions.length/3;positions.push(...face.positions);normals.push(...Array(4).fill(face.normal).flat())
          uv.push(...face.uv.map((v,i)=>i%2?1-v:v));indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3)
        }
        const geometry=new THREE.BufferGeometry();geometries.add(geometry)
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices)
        bone.add(new THREE.Mesh(geometry,material))
      }
    }
    for(const part of definition.parts){
      const parent=part.parent?bones.get(part.parent):root
      if(!parent)throw Error('NATIVE_ORIGINAL_MODEL_PARENT_UNAVAILABLE')
      const visited=new Set([part.path]);let ancestor=part.parent
      while(ancestor){if(visited.has(ancestor))throw Error('NATIVE_ORIGINAL_MODEL_PARENT_CYCLE');visited.add(ancestor);ancestor=definition.parts.find(p=>p.path===ancestor)?.parent}
      parent.add(bones.get(part.path))
    }
    // Unique names are convenience aliases. Repeated names remain addressable
    // only by their full original path; never animate a guessed matching bone.
    for(const [name,bone] of names)if(bone&&!bones.has(name))bones.set(name,bone)
    root.scale.setScalar(1/16)
    let disposed=false
    return {root,bones,definition,geometrySource:'original_LayerDefinition_bakeRoot',animationParityVerified:false,
      dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.clear();for(const geometry of geometries)geometry.dispose()}}
  }catch(error){for(const geometry of geometries)geometry.dispose();root.clear();throw error}
}

export function originalBlockModelContract(state,original,{vanillaOnly=false}={}) {
  if(state?.renderShape!=='MODEL')return {renderBase:false,issue:'原生特殊方块渲染器尚未接入'}
  if(!state.hasBlockEntity)return {renderBase:true,additionalRenderer:false,issue:null}
  const entry=vanillaOnly?original?.blockEntityRenderers?.find(row=>row.blocks.includes(state.name)):null
  return {renderBase:true,additionalRenderer:entry?.hasRenderer??null,
    issue:entry&&!entry.hasRenderer?null:'已显示原始方块模型；附加实体渲染尚未完整接入'}
}
