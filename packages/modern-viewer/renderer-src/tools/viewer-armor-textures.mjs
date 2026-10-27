import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

/** Adapt original pack paths to the pinned renderer's armor texture contract. */
export async function originalArmorTextures(output,version) {
  if(!/^\d+\.\d+(?:\.\d+)?$/.test(version))throw Error('ARMOR_TEXTURE_VERSION_INVALID');
  const textures={};
  const folders=[['models/armor',0],['entity/equipment/humanoid',1],['entity/equipment/humanoid_leggings',2]];
  for(const [folder,layer] of folders){
    const directory=path.join(output,'public','textures',version,folder);
    for(const file of await readdir(directory).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){
      if(!/^[a-z0-9_]+\.png$/.test(file))continue;
      let key=file.slice(0,-4);
      if(!layer)key=key.replace(/^gold_layer_/,'golden_layer_');
      if(layer){const overlay=key.endsWith('_overlay');if(overlay)key=key.slice(0,-8);key=({gold:'golden',turtle_scute:'turtle'})[key]??key;key+=`_layer_${layer}`+(overlay?'_overlay':'');}
      if(!/^[a-z0-9_]+_layer_[12](?:_overlay)?$/.test(key))continue;
      const bytes=await readFile(path.join(directory,file));
      if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('ARMOR_TEXTURE_PNG_INVALID');
      textures[key]={src:`/textures/${version}/${folder}/${file}`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    }
  }
  return {schemaVersion:1,minecraftVersion:version,textures};
}
