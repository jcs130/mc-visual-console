// Replaced by the portable builder from this pack's original PNG files.
export const ORIGINAL_ARMOR_TEXTURES = {};

export function installOriginalArmorTextures(resources, manifest = ORIGINAL_ARMOR_TEXTURES) {
  if(manifest.schemaVersion!==1)return 0;
  const version=resources.currentConfig?.texturesVersion??resources.currentConfig?.version;
  if(manifest.minecraftVersion!==version)throw Error('ARMOR_TEXTURE_VERSION_MISMATCH');
  const textures={},prefix=`/textures/${version}/`;
  for(const [name,value] of Object.entries(manifest.textures)){
    if(!/^[a-z0-9_]+_layer_[12](?:_overlay)?$/.test(name)||typeof value?.src!=='string'
      ||!value.src.startsWith(prefix)||value.src.includes('..')||/[?#\\]/.test(value.src)
      ||!/^\/textures\/[\d.]+\/(?:models\/armor|entity\/equipment\/(?:humanoid|humanoid_leggings))\/[a-z0-9_]+\.png$/.test(value.src))throw Error('ARMOR_TEXTURE_PATH_INVALID');
    textures[name]={src:value.src};
  }
  const previous=resources.currentResources.customTextures.armor;
  resources.currentResources.customTextures.armor={...previous,tileSize:previous?.tileSize,textures:{...textures,...previous?.textures}};
  return Object.keys(textures).length;
}
