import {BLOCK_ICON_CLIENT_SHA256,BLOCK_ICON_SHADER_HASHES,nativeGuiItemTransform,nativeGuiFaceCulling} from './native-block-item-icons.js';

const layerPath='assets/minecraft/native/client-model-layers.json';
// Original 1.21.1 BEWLR (gem) -> SkullBlockRenderer (gho): direction=null,
// yRot=180, animation=0; translate(.5,0,.5), scale(-1,-1,1), then ModelPart.
// Consume exported original head AND hat polygons/UV, never a placeholder cube.
export async function prepareNativeProfileItemIcon(reader,textureHash){
  if(reader?.manifest?.minecraftVersion!=='1.21.1'||reader.manifest.assetIntegrityVerified!==true||
    reader.manifest.clientJarSha256!==BLOCK_ICON_CLIENT_SHA256||!/^[a-f0-9]{40,64}$/.test(textureHash??''))throw Error('NATIVE_PROFILE_SOURCE_UNVERIFIED');
  const modelPath='assets/minecraft/models/item/player_head.json',templatePath='assets/minecraft/models/item/template_skull.json';
  const own=await reader.json(modelPath),model=await reader.json(templatePath),layers=await reader.json(layerPath);
  if(!['item/template_skull','minecraft:item/template_skull'].includes(own.parent)||
    !['builtin/entity','minecraft:builtin/entity'].includes(model.parent)||layers.clientJarSha256!==BLOCK_ICON_CLIENT_SHA256)throw Error('NATIVE_PROFILE_MODEL_UNVERIFIED');
  const parts=layers.layers?.['minecraft:player_head#main']?.parts;
  if(!Array.isArray(parts)||parts.length!==3||parts.some(p=>!['root','head','hat'].includes(p.name)||p.pivot?.some(v=>v!==0)||p.rotationZYX?.some(v=>v!==0)||p.scale?.some(v=>v!==1)||!Array.isArray(p.polygons)))throw Error('NATIVE_PROFILE_GEOMETRY_UNSUPPORTED');
  const texture='minecraft:profile/'+textureHash,texturePath='assets/minecraft/textures/profile/'+textureHash+'.png';
  const faces=parts.flatMap(part=>part.polygons.map(p=>({part:part.name,texture,
    position:p.positions.map((v,i)=>i%3===0?v/16:i%3===1?-v/16-.5:-v/16),
    normal:[p.normal[0],-p.normal[1],-p.normal[2]],uv:p.uv.map((v,i)=>i%2?1-v:v),indices:[0,1,2,0,2,3]})));
  if(faces.length!==12||faces.some(f=>f.position.length!==12||f.uv.length!==8||[...f.position,...f.uv].some(v=>!Number.isFinite(v))))throw Error('NATIVE_PROFILE_GEOMETRY_INVALID');
  for(const [path,hash] of Object.entries(BLOCK_ICON_SHADER_HASHES)){
    if(reader.manifest.assets[path]?.sha256!==hash)throw Error('NATIVE_PROFILE_SHADER_UNVERIFIED');await reader.bytes(path);
  }
  const transform=nativeGuiItemTransform(model.display?.gui),culling=nativeGuiFaceCulling(faces,transform);
  return {name:'minecraft:player_head',kind:'native-profile-head-gui',model,faces,renderFaces:culling.visible,culling,transform,
    texturePaths:[texturePath],textureDimensions:[64,64],sourcePaths:[modelPath,templatePath,layerPath,texturePath,...Object.keys(BLOCK_ICON_SHADER_HASHES)],
    evidence:{clientJarSha256:BLOCK_ICON_CLIENT_SHA256,modelLayer:'minecraft:player_head#main',textureHash,source:'original_client_skull_renderer_and_observed_profile'}};
}
