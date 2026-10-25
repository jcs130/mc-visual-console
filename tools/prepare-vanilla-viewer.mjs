/** Build an exact vanilla viewer on demand. Never connects Minecraft or a model. */
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,lstat,rename,open,unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const repository=fileURLToPath(new URL('../',import.meta.url));
const renderer=path.join(repository,'packages/modern-viewer/renderer-src');
const MANIFEST='https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const HOSTS=new Set(['piston-meta.mojang.com','launchermeta.mojang.com','piston-data.mojang.com','launcher.mojang.com']);
const digest=(bytes,algorithm='sha1')=>createHash(algorithm).update(bytes).digest('hex');
const inside=(parent,child)=>child.startsWith(path.resolve(parent)+path.sep);
export function officialViewerUrl(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||!HOSTS.has(url.hostname)||url.username||url.password||url.port||url.search||url.hash)throw Error('VIEWER_DOWNLOAD_SOURCE_INVALID');
  return url.href;
}
export async function officialBytes(url,{fetch:transport=globalThis.fetch,sha1,size,limit=128*1024*1024,signal}={}){
  officialViewerUrl(url);
  const response=await transport(url,{redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(180000),...(signal?[signal]:[])])});
  if(!response.ok)throw Error('VIEWER_DOWNLOAD_HTTP_'+response.status);
  const length=Number(response.headers.get('content-length'));
  if(length>limit)throw Error('VIEWER_DOWNLOAD_TOO_LARGE');
  let count=0;const parts=[];
  for await(const part of response.body){count+=part.length;if(count>limit){throw Error('VIEWER_DOWNLOAD_TOO_LARGE');}parts.push(part);}
  const bytes=Buffer.concat(parts);
  if(size!==undefined&&bytes.length!==size||sha1!==undefined&&digest(bytes)!==sha1)throw Error('VIEWER_DOWNLOAD_INTEGRITY_MISMATCH');
  return bytes;
}
async function run(command,args,{signal}={}){
  await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:renderer,stdio:'inherit',windowsHide:true,signal});
    child.once('error',reject);child.once('exit',(code,reason)=>code===0?resolve():reject(Error('VIEWER_BUILD_FAILED: '+path.basename(command)+' '+(reason??code))));
  });
}
/** Explicit cache and output; no version whitelist or cross-version fallback. */
export async function prepareVanillaViewer({version,outputDirectory,cacheDirectory,python='python',fetch:transport=globalThis.fetch,signal,run:execute=run}){
  if(typeof version!=='string'||!/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(version))throw Error('VIEWER_VERSION_INVALID');
  if(!outputDirectory||!cacheDirectory)throw Error('VIEWER_OUTPUT_AND_CACHE_REQUIRED');
  const output=path.resolve(outputDirectory),cache=path.resolve(cacheDirectory);
  if(output===cache||inside(output,cache)||inside(cache,output)||output===repository||inside(output,repository)||inside(renderer,output)||output===renderer)throw Error('VIEWER_OUTPUT_OVERLAPS_SOURCE_OR_CACHE');
  const require=createRequire(path.join(renderer,'package.json'));
  const data=require('minecraft-data')(version);
  if(data?.version?.minecraftVersion!==version)throw Error('VIEWER_REGISTRY_MISSING: install the renderer dependencies for '+version);
  await mkdir(output,{recursive:true});await mkdir(cache,{recursive:true});
  const lock=path.join(output,'.prepare-'+version+'.lock'),handle=await open(lock,'wx').catch(error=>{if(error.code==='EEXIST')throw Error('VIEWER_PREPARATION_IN_PROGRESS');throw error;});
  try{
    signal?.throwIfAborted();
    const manifest=JSON.parse((await officialBytes(MANIFEST,{fetch:transport,limit:4*1024*1024,signal})).toString('utf8'));
    const entry=manifest.versions?.find(row=>row.id===version);
    if(!entry||!/^[a-f0-9]{40}$/.test(entry.sha1??''))throw Error('VIEWER_OFFICIAL_VERSION_MISSING');
    const metadata=JSON.parse((await officialBytes(entry.url,{fetch:transport,sha1:entry.sha1,limit:4*1024*1024,signal})).toString('utf8'));
    const download=metadata.downloads?.client;
    if(metadata.id!==version||!/^[a-f0-9]{40}$/.test(download?.sha1??'')||!Number.isSafeInteger(download?.size)||download.size<=0||download.size>128*1024*1024)throw Error('VIEWER_OFFICIAL_METADATA_INVALID');
    officialViewerUrl(download.url);
    const jar=path.join(cache,version+'-'+download.sha1+'.jar');
    let bytes;
    try{const info=await lstat(jar);if(!info.isFile()||info.isSymbolicLink())throw Error('VIEWER_CACHE_FILE_INVALID');bytes=await readFile(jar);}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(!bytes||bytes.length!==download.size||digest(bytes)!==download.sha1){
      bytes=await officialBytes(download.url,{fetch:transport,sha1:download.sha1,size:download.size,signal});
      const temporary=jar+'.'+randomUUID()+'.partial';await writeFile(temporary,bytes,{flag:'wx'});await rename(temporary,jar);
    }
    const id=randomUUID(),staging=path.join(output,'.prepare-'+version+'-'+id),target=path.join(output,'versions',version);
    await mkdir(staging);
    console.log(JSON.stringify({phase:'exporting',version,clientSha256:digest(bytes,'sha256')}));
    await execute(python,[path.join(renderer,'tools/export-minecraft-viewer-assets.py'),jar,staging],{signal});
    await execute(process.execPath,[path.join(renderer,'tools/build-minecraft-viewer-client.mjs'),renderer,staging,'--no-sounds'],{signal});
    await execute(process.execPath,[path.join(renderer,'tools/verify-minecraft-viewer-assets.mjs'),jar,staging],{signal});
    const client=JSON.parse(await readFile(path.join(staging,'viewer-client.json'),'utf8'));
    if(client.minecraftVersion!==version||client.clientJarSha256!==digest(bytes,'sha256'))throw Error('VIEWER_BUILT_VERSION_MISMATCH');
    const receipt={schemaVersion:1,minecraftVersion:version,preparedAt:new Date().toISOString(),source:{manifest:MANIFEST,metadata:entry.url,metadataSha1:entry.sha1,clientUrl:download.url,clientSha1:download.sha1,clientSha256:client.clientJarSha256},browserBundleSha256:client.browserBundleSha256,mesherSha256:client.mesherSha256,audio:{requested:false,status:'disabled'},gameConnections:0,modelCalls:0};
    await writeFile(path.join(staging,'viewer-assets.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
    await mkdir(path.dirname(target),{recursive:true});
    const previous=await lstat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    signal?.throwIfAborted();
    const backup=path.join(output,'versions',version+'.previous-'+id);
    if(previous){if(!previous.isDirectory()||previous.isSymbolicLink())throw Error('VIEWER_OUTPUT_INVALID');await rename(target,backup);}
    try{await rename(staging,target);}catch(error){if(previous)await rename(backup,target);throw error;}
    return {directory:target,root:output,...receipt};
  }finally{await handle.close();await unlink(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),options={};
  for(let index=0;index<args.length;index+=2){if(!['--version','--output','--cache','--python'].includes(args[index])||!args[index+1])throw Error('Usage: node tools/prepare-vanilla-viewer.mjs --version 1.21.5 --output <viewer-root> --cache <private-cache> [--python <python-executable>]');options[args[index].slice(2)]=args[index+1];}
  console.log(JSON.stringify(await prepareVanillaViewer({version:options.version,outputDirectory:options.output,cacheDirectory:options.cache,python:options.python}),null,2));
}
