import { nativeCubeFaces } from './native-entity-model.js'
import { BLOCK_ICON_SHADER_HASHES, nativeGuiItemTransform, nativeGuiFaceCulling } from './native-block-item-icons.js'
import { verifyNativeStaticItemEvidence } from './native-static-item-providers.js'

// Locked 1.21.1 ChestRenderer.createSingleBodyLayer, ModelPart.Cube and
// BlockEntityWithoutLevelRenderer's no-level single/SOUTH/closed instance.
// ChestRenderer ghf.class SHA256 30fd1dbaf2f5cca1e8e9227bf43d533a5a93e06de4698b9ddc989d8fda19a86f;
// BEWLR gem.class 7667fd54fd26c8754f3dd83b7022c49505c8c3100719132e1f2069e0c5a8bcea.
// These are item GUI models, not evidence that a placed chest lid was observed.
export const NATIVE_CHEST_ITEM_PARTS = Object.freeze([
  {name:'bottom',pivot:[0,0,0],origin:[1,0,1],size:[14,10,14],uv:[0,19]},
  {name:'lid',pivot:[0,9,1],origin:[1,0,0],size:[14,5,14],uv:[0,0]},
  {name:'lock',pivot:[0,9,1],origin:[7,-2,14],size:[2,4,1],uv:[0,0]}
].map(part=>Object.freeze(part)))

const record=value=>value&&typeof value==='object'&&!Array.isArray(value)
export function nativeChestItemTexture(name, date = new Date()) {
  if(!['minecraft:chest','minecraft:trapped_chest','minecraft:ender_chest'].includes(name))throw Error('NATIVE_CHEST_ITEM_UNSUPPORTED')
  const christmas=date.getMonth()===11&&date.getDate()>=24&&date.getDate()<=26
  const leaf=name==='minecraft:ender_chest'?'ender':christmas?'christmas':name==='minecraft:trapped_chest'?'trapped':'normal'
  return `assets/minecraft/textures/entity/chest/${leaf}.png`
}

async function chestModel(reader,name) {
  const path=`assets/minecraft/models/item/${name.slice(10)}.json`,own=await reader.json(path)
  if(!record(own)||Object.keys(own).some(key=>!['parent','textures','display','gui_light'].includes(key))||
    (own.textures!==undefined&&(!record(own.textures)||Object.keys(own.textures).some(key=>key!=='particle')))||
    (own.display!==undefined&&!record(own.display))||own.gui_light&&own.gui_light!=='side')throw Error('NATIVE_CHEST_ITEM_MODEL_UNSUPPORTED')
  if(name==='minecraft:chest') {
    if(!['builtin/entity','minecraft:builtin/entity'].includes(own.parent))throw Error('NATIVE_CHEST_ITEM_MODEL_UNSUPPORTED')
    return {...own,sourcePaths:[path]}
  }
  if(!['item/chest','minecraft:item/chest'].includes(own.parent))throw Error('NATIVE_CHEST_ITEM_MODEL_UNSUPPORTED')
  const parent=await chestModel(reader,'minecraft:chest')
  return {...parent,...own,display:{...parent.display,...own.display},sourcePaths:[...parent.sourcePaths,path]}
}

export async function prepareNativeChestItemIcon(reader,name,{date=new Date()}={}) {
  const evidence=verifyNativeStaticItemEvidence(reader,name)
  if(evidence.kind!=='chest')throw Error('NATIVE_CHEST_ITEM_UNSUPPORTED')
  const model=await chestModel(reader,name),transform=nativeGuiItemTransform(model.display?.gui)
  const texturePath=nativeChestItemTexture(name,date)
  if(reader.manifest.assets[texturePath+'.mcmeta'])throw Error('NATIVE_CHEST_ITEM_ANIMATION_UNSUPPORTED')
  const bytes=reader.manifest.assets[texturePath]?.bytes
  if(!Number.isSafeInteger(bytes)||bytes<=0||bytes>16777216)throw Error('NATIVE_CHEST_ITEM_TEXTURE_UNAVAILABLE')
  for(const [path,hash]of Object.entries(BLOCK_ICON_SHADER_HASHES)) {
    if(reader.manifest.assets[path]?.sha256!==hash)throw Error('NATIVE_CHEST_ITEM_SHADER_UNVERIFIED')
    await reader.bytes(path)
  }
  const texture='minecraft:entity/chest/'+texturePath.split('/').at(-1).slice(0,-4)
  const faces=NATIVE_CHEST_ITEM_PARTS.flatMap(part=>nativeCubeFaces(part,[64,64]).map(face=>({...face,texture,
    part:part.name,position:face.position.map((value,index)=>(value+part.pivot[index%3])/16-.5)})))
  const culling=nativeGuiFaceCulling(faces,transform)
  return {name,kind:'native-builtin-chest-gui',model,faces,renderFaces:culling.visible,culling,transform,evidence,
    texturePaths:[texturePath],textureDimensions:[64,64],sourcePaths:[...model.sourcePaths,texturePath,...Object.keys(BLOCK_ICON_SHADER_HASHES)]}
}
