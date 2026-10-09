import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Validate the optional matching-client content pack before building/serving it. */
export async function verifyViewerContentAssets(root,clientJarSha256,{required=false}={}) {
  const file=path.join(root,'public/viewer-content.json');
  let raw;
  try {raw=await readFile(file);} catch(error) {if(error.code==='ENOENT'&&!required)return null;throw error;}
  const content=JSON.parse(raw);
  if(content.schemaVersion!==1||content.minecraftVersion!=='1.20.6'||content.clientJarSha256!==clientJarSha256
      ||!Array.isArray(content.mapColors)||content.mapColors.length!==62
      ||!content.mapColors.every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffff)
      ||JSON.stringify(content.shades)!=='[180,220,255,135]')throw Error('viewer_content_assets_mismatch');
  for(const [name,expected] of Object.entries(content.textureHashes??{})) {
    if(!/^(?:block\/[a-z_]+|entity\/(?:glow_)?squid)$/.test(name))throw Error('viewer_content_texture_path_invalid');
    if(hash(await readFile(path.join(root,'public/textures/1.20.6',name+'.png')))!==expected)throw Error('viewer_content_texture_hash_mismatch:'+name);
  }
  const atlasSha256=hash(await readFile(path.join(root,'public/particle-content.png')));
  if(atlasSha256!==content.particleAtlasSha256)throw Error('viewer_content_atlas_hash_mismatch');
  for(const names of Object.values(content.particleDefinitions??{})) {
    if(!Array.isArray(names)||!names.length||names.length>64)throw Error('viewer_content_particle_definition_invalid');
    for(const name of names){const sprite=content.particleSprites?.[name];
      if(!sprite||!Array.isArray(sprite.uv)||sprite.uv.length!==4||!sprite.uv.every(n=>Number.isFinite(n)&&n>=0&&n<=1)
          ||sprite.uv[0]+sprite.uv[2]>1||sprite.uv[1]+sprite.uv[3]>1)throw Error('viewer_content_sprite_invalid');}
  }
  if(!content.frameModels?.item_frame?.elements||!content.frameModels?.glow_item_frame?.elements
      ||!Object.keys(content.textureHashes??{}).length||!Object.keys(content.particleDefinitions??{}).length)throw Error('viewer_content_assets_incomplete');
  return {schemaVersion:1,manifestSha256:hash(raw),particleAtlasSha256:atlasSha256,
    capabilities:{serverParticleProtocol:true,mapPixels:true,itemFrameMaps:true,heldMapPreview:true,mapDecorations:false},
    nativeParticlePhysicsParityVerified:false,javaFramePixelParityVerified:false};
}
