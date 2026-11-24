/** Official index-backed supplemental resources. Runs before the viewer build/verification. */
import {readFile,writeFile,mkdir,rename,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const renderer=fileURLToPath(new URL('../packages/modern-viewer/renderer-src/',import.meta.url));
const sha1=bytes=>createHash('sha1').update(bytes).digest('hex');
export async function prepareVanillaExtras({metadata,jar,cache,output,python,javap='javap',fetch:transport=globalThis.fetch,signal,sounds=false,run}) {
  const indexSpec=metadata.assetIndex;
  if(!indexSpec || !/^[a-f0-9]{40}$/.test(indexSpec.sha1))throw Error('OFFICIAL_ASSET_INDEX_MISSING');
  const assets=path.join(cache,'assets');
  async function verifiedFile(file,spec) {
    let bytes=await readFile(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(bytes && sha1(bytes)===spec.sha1 && bytes.length===spec.size)return bytes;
    const url=new URL(spec.url);
    if(url.protocol!=='https:' || !['piston-meta.mojang.com','resources.download.minecraft.net','libraries.minecraft.net'].includes(url.hostname)
      ||url.username||url.password||url.port||url.search||url.hash)throw Error('INVALID_OFFICIAL_RESOURCE_URL');
    const response=await transport(url.href,{redirect:'error',signal});
    if(!response.ok)throw Error('RESOURCE_HTTP_'+response.status);
    const parts=[];let count=0;
    for await(const chunk of response.body){count+=chunk.length;if(count>spec.size)throw Error('RESOURCE_OVERSIZE');parts.push(chunk);}
    bytes=Buffer.concat(parts);
    if(bytes.length!==spec.size||sha1(bytes)!==spec.sha1)throw Error('RESOURCE_INTEGRITY_MISMATCH');
    await mkdir(path.dirname(file),{recursive:true});await writeFile(file+'.partial',bytes);await rename(file+'.partial',file);
    return bytes;
  }
  const indexPath=path.join(assets,'indexes',indexSpec.id+'.json');
  const index=JSON.parse((await verifiedFile(indexPath,indexSpec)).toString('utf8')).objects;
  const fonts=path.join(cache,'fonts');await mkdir(fonts,{recursive:true});
  const wanted=Object.entries(index).filter(([name])=>name.startsWith('minecraft/font/')
    ||sounds&&(name==='minecraft/sounds.json'||name.startsWith('minecraft/sounds/')));
  // Bounded concurrency; every object is verified even when already cached.
  let cursor=0;
  await Promise.all(Array.from({length:8},async()=>{
    while(cursor<wanted.length){
      const [name,row]=wanted[cursor++];
      const file=path.join(assets,'objects',row.hash.slice(0,2),row.hash);
      const bytes=await verifiedFile(file,{sha1:row.hash,size:row.size,url:`https://resources.download.minecraft.net/${row.hash.slice(0,2)}/${row.hash}`});
      if(name.startsWith('minecraft/font/'))await writeFile(path.join(fonts,path.basename(name)),bytes);
    }
  }));
  const execute=(tool,args)=>run(tool,args,{signal});
  await execute(python,[path.join(renderer,'tools/export-text-display-font.py'),jar,indexPath,fonts,output]);
  if(['26.1','26.2'].includes(metadata.id))await execute(python,[path.join(renderer,'tools/export-minecraft-viewer-content.py'),jar,
    path.join(cache,'unobfuscated-no-mappings'),output,'--javap',javap]);
  if(['26.1','26.2'].includes(metadata.id))await copyFile(path.join(output,'public/textures/'+metadata.id+'/item/clock_00.png'),path.join(output,'public/textures/'+metadata.id+'/item/clock.png'));
  if(['26.1','26.2'].includes(metadata.id))await copyFile(path.join(output,'public/icons/clock_00.png'),path.join(output,'public/icons/clock.png'));
  if(['26.1','26.2'].includes(metadata.id))for(const [legacy,official] of Object.entries({'entity/llama/spit.png':'entity/llama/llama_spit.png','entity/trident.png':'entity/trident/trident.png'})){
    const target=path.join(output,'public/textures/'+metadata.id,legacy);await mkdir(path.dirname(target),{recursive:true});
    await copyFile(path.join(output,'public/textures/'+metadata.id,official),target);
  }

  if(sounds){
    const versionPath=path.join(cache,'official-'+metadata.id+'.json');
    await writeFile(versionPath,JSON.stringify(metadata));
    if(['26.1','26.2'].includes(metadata.id)){
      const libraries=path.join(cache,'libraries');
      const artifacts=(metadata.libraries??[]).map(row=>row.downloads?.artifact).filter(row=>row?.path&&!row.path.includes('natives-'));
      for(const artifact of artifacts){
        const target=path.resolve(libraries,artifact.path);
        if(!target.startsWith(path.resolve(libraries)+path.sep))throw Error('INVALID_LIBRARY_PATH');
        await verifiedFile(target,artifact);
      }
      const java=javap==='javap'?'java':path.join(path.dirname(javap),'java');
      await execute(process.execPath,[path.join(renderer,'tools/export-minecraft-viewer-block-sounds.mjs'),versionPath,libraries,output,java,jar]);
    }
    await execute(process.execPath,[path.join(renderer,'tools/export-minecraft-viewer-sounds.mjs'),versionPath,assets,output,indexPath]);
  }
  return {objectsVerified:wanted.length,assetIndexSha1:indexSpec.sha1,sounds};
}
