import fs from 'node:fs/promises';
import path from 'node:path';
import {NATIVE_BANNER_PATTERNS} from '../src/native-viewer/native-banner-data.js';
export async function verifyOriginalWorldBannerTextures(outputRoot,version){
 if(version!=='1.21.1')return;
 for(const name of ['banner_base',...NATIVE_BANNER_PATTERNS.map(p=>'banner/'+p)]){
  const bytes=await fs.readFile(path.join(outputRoot,'public','textures',version,'entity',name+'.png'));
  if(bytes.length<33||bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==64||bytes.readUInt32BE(20)!==64)
   throw Error('ORIGINAL_BANNER_TEXTURE_INVALID:'+name);
 }
}
export function patchOriginalWorldBanners(source,version){
 if(version!=='1.21.1')return source;
 for(const [anchor,code]of [
  ['function hl(n,e,t){','if(globalThis.__MC_ORIGINAL_BANNERS__)return globalThis.__MC_ORIGINAL_BANNERS__.texture(n,e,t);'],
  ['function fl(n){','if(globalThis.__MC_ORIGINAL_BANNERS__)return globalThis.__MC_ORIGINAL_BANNERS__.release(n);'],
  ['function ml(n,e,t,r,i=0,s=1,o=1){','if(globalThis.__MC_ORIGINAL_BANNERS__)return globalThis.__MC_ORIGINAL_BANNERS__.mesh(n,e,t,r,i,s,o,vl);'],
 ]){
  if(source.split(anchor).length!==2)throw Error('ORIGINAL_BANNER_RENDERER_ANCHOR_CHANGED:'+anchor);
  source=source.replace(anchor,anchor+code);
 }
 return source;
}
