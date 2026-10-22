import * as THREE from 'three'
import {nativeContainerItemAt} from './native-item-stack.js'
import {resourcePath,textureId} from './model-loader.js'
import {STATIC_ITEM_SOURCES} from './native-static-item-providers.js'
import {prepareNativeBlockGuiPlan,resolveNativeBlockItemModel,nativeGuiItemTransform,nativeGuiFaceCulling} from './native-block-item-icons.js'
import {verifyTwilightItemSource,twilightItemComponentState} from './native-twilight-ore-meter.js'

export const nativeTwilightJarEligible=id=>id==='twilightforest:mason_jar'
const allowed=new Set(['twilightforest:jar_lid','minecraft:container']),record=v=>v&&typeof v==='object'&&!Array.isArray(v)
// Original JarRenderer.LID_LOCATION_LIST + ClientRegistrationEvents cache.
// Minecraft mangrove and TF mangrove deliberately use different lid models.
const lids=new Map()
for(const leaf of 'mangrove canopy dark mining sorting time transformation twilight_oak'.split(' '))for(const prefix of ['', 'stripped_'])lids.set(`twilightforest:${prefix}${leaf}_log`,`${prefix}${leaf}_log`)
for(const leaf of 'acacia birch cherry dark_oak jungle mangrove oak spruce'.split(' '))for(const prefix of ['', 'stripped_'])lids.set(`minecraft:${prefix}${leaf}_log`,leaf==='mangrove'?`vanilla_${prefix}mangrove_log`:`${prefix}${leaf}_log`)
for(const leaf of 'crimson warped'.split(' '))for(const prefix of ['', 'stripped_'])lids.set(`minecraft:${prefix}${leaf}_stem`,`${prefix}${leaf}_stem`)
for(const leaf of ['pumpkin','bamboo_block','stripped_bamboo_block'])lids.set('minecraft:'+leaf,leaf)
lids.set('twilightforest:cinder_log','cinder_log')
export function nativeTwilightJarState(stack){
  if(!nativeTwilightJarEligible(stack?.id))throw Error('NATIVE_TWILIGHT_JAR_ITEM_UNSUPPORTED')
  const {foil}=twilightItemComponentState(stack,allowed),lid=stack.components['twilightforest:jar_lid']
  if(lid!==undefined&&(!record(lid)||Object.keys(lid).join(',')!=='lid'||typeof lid.lid!=='string'))throw Error('NATIVE_TWILIGHT_JAR_LID_INVALID')
  const selected=lids.has(lid?.lid)?lid.lid:'twilightforest:twilight_oak_log',content=nativeContainerItemAt(stack,0)
  if(content?.id==='twilightforest:mason_jar')throw Error('NATIVE_TWILIGHT_JAR_RECURSION_UNSUPPORTED')
  return {lid:selected,lidModel:'twilightforest:block/lid/'+lids.get(selected),content,foil}
}
function resolvedElements(model){
  return model.elements.map(e=>({...e,faces:Object.fromEntries(Object.entries(e.faces).map(([k,v])=>[k,{...v,texture:textureId(model,v.texture)}]))}))
}

// ISTER 9bcb613bdd1e4d5aad978d4ec3c52f486c17719f40db13dfc6caf4d88628bede:
// native block body, actual lid, slot-zero item at (.5,.4375,.5), scale .5.
// JARRED enum falls back to FIXED. This is GUI item composition only; placed
// jar wobble/rotation require the block-entity renderer and are not claimed.
export async function prepareNativeTwilightJar(reader,stack,{readPixels}={}){
  verifyTwilightItemSource(reader)
  const state=nativeTwilightJarState(stack),itemPath='assets/twilightforest/models/item/mason_jar.json',own=await reader.json(itemPath)
  if(own?.parent!=='minecraft:builtin/entity'||own.loader||own.overrides?.length||own.elements?.length||!record(own.display))throw Error('NATIVE_TWILIGHT_JAR_MODEL_UNSUPPORTED')
  const body=await resolveNativeBlockItemModel(reader,'twilightforest:block/mason_jar'),lid=await resolveNativeBlockItemModel(reader,state.lidModel)
  const model={...body,display:own.display,elements:[...resolvedElements(body),...resolvedElements(lid)],textures:{},
    sourcePaths:[itemPath,...body.sourcePaths,...lid.sourcePaths]}
  const plan=await prepareNativeBlockGuiPlan(reader,{name:stack.id,model,evidence:{source:STATIC_ITEM_SOURCES.twilightforest,itemClass:'twilightforest.item.JarItem$MasonJarItem'}})
  plan.kind='native-twilight-mason-jar-gui';plan.state=state
  if(state.content){
    const {prepareNativeHeldItem}=await import('./native-held-items.js')
    const held=await prepareNativeHeldItem(reader,state.content,'right',{...(readPixels?{readPixels}:{}),contextInput:{kind:'ground'}})
    if(!['native-generated-held','native-block-held'].includes(held.kind)||held.appearance.requirements.effectUnavailableReason)throw Error('NATIVE_TWILIGHT_JAR_CONTENT_RENDERER_UNAVAILABLE')
    const display=held.appearance.model.display??{},transform=nativeGuiItemTransform(display['twilightforest:jarred']??display.fixed??{})
    const matrix=new THREE.Matrix4().makeTranslation(0,-.0625,0).multiply(new THREE.Matrix4().makeScale(.5,.5,.5))
      .multiply(new THREE.Matrix4().compose(new THREE.Vector3(...transform.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad),'XYZ')),new THREE.Vector3(...transform.scale)))
    const faces=held.faces.map(face=>{
      const position=[]
      for(let i=0;i<face.position.length;i+=3)position.push(...new THREE.Vector3(...face.position.slice(i,i+3)).applyMatrix4(matrix).toArray())
      return {...face,position,tintColor:held.tintColors?.[face.tintIndex]===undefined?0xffffff:held.tintColors[face.tintIndex]&0xffffff}
    })
    if(plan.faces.length+faces.length>2048)throw Error('NATIVE_TWILIGHT_JAR_CONTENT_FACE_LIMIT')
    plan.faces=[...plan.faces,...faces]
    plan.culling=nativeGuiFaceCulling(plan.faces,plan.transform);plan.renderFaces=plan.culling.visible
    plan.texturePaths=[...new Set([...plan.texturePaths,...held.sourcePaths.filter(p=>p.endsWith('.png'))])]
    if(plan.texturePaths.length>32)throw Error('NATIVE_TWILIGHT_JAR_TEXTURE_LIMIT')
    plan.sourcePaths=[...new Set([...plan.sourcePaths,...held.sourcePaths])]
  }
  return plan
}
