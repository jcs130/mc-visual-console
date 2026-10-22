import {nativeNumericValue} from './native-item-stack.js'
import {nativeItemComponentState,STATIC_ITEM_SOURCES} from './native-static-item-providers.js'
import {loadOriginalItemColors,nativePotionColor} from './native-potion-items.js'
import {resolveNativeBlockItemModel} from './native-block-item-icons.js'

export const nativeTwilightFlaskEligible=id=>['twilightforest:brittle_potion_flask','twilightforest:greater_potion_flask'].includes(id)
export function nativeTwilightFlaskState(stack){
  if(!nativeTwilightFlaskEligible(stack?.id))throw Error('NATIVE_TWILIGHT_FLASK_UNSUPPORTED')
  const components={...stack.components};delete components['twilightforest:flask_contents'];delete components['!twilightforest:flask_contents']
  nativeItemComponentState({...stack,components},{allowPartialGlint:false})
  if(Object.hasOwn(stack.components,'twilightforest:flask_contents')&&Object.hasOwn(stack.components,'!twilightforest:flask_contents'))throw Error('NATIVE_TWILIGHT_FLASK_PATCH_INVALID')
  const contents=stack.components['twilightforest:flask_contents']??{}
  if(!contents||Array.isArray(contents)||typeof contents!=='object'||Object.keys(contents).some(k=>!['potion','doses','breakage','breakable'].includes(k)))throw Error('NATIVE_TWILIGHT_FLASK_COMPONENT_INVALID')
  const int=(n,defaultValue=0)=>{const value=n===undefined?defaultValue:nativeNumericValue(n);if(!Number.isInteger(value)||value<0||value>2147483647)throw Error('NATIVE_TWILIGHT_FLASK_COMPONENT_INVALID');return value}
  return {potion:contents.potion??{},doses:int(contents.doses),breakage:int(contents.breakage)}
}
export async function prepareNativeTwilightFlask(reader,stack){
  const source=STATIC_ITEM_SOURCES.twilightforest,rows=reader.manifest.sources?.filter(s=>s.name===source.name||s.sha256===source.sha256)
  if(rows?.length!==1||rows[0].sha256!==source.sha256||rows[0].explicitOverride)throw Error('NATIVE_TWILIGHT_FLASK_SOURCE_UNVERIFIED')
  const state=nativeTwilightFlaskState(stack),colors=await loadOriginalItemColors(reader)
  // Original ColorHandler: the absent base potion is WHITE even if custom
  // effects exist. This intentionally differs from vanilla potion colouring.
  const color=state.potion.potion===undefined?0xffffffff:nativePotionColor(state.potion,colors)
  const model=await resolveNativeBlockItemModel(reader,stack.id.replace(':',':item/'),[],{
    properties:{'twilightforest:potion_level':state.doses,'twilightforest:breakage':state.breakage},predicateMax:3})
  return {model,color,sourcePaths:['assets/minecraft/native/client-item-colors.json',...model.sourcePaths],state}
}
