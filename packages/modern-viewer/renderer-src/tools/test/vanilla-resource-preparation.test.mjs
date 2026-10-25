import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,readdir,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {officialViewerUrl,officialBytes,prepareVanillaViewer} from '../../../../../tools/prepare-vanilla-viewer.mjs';
const sha=bytes=>createHash('sha1').update(bytes).digest('hex');
test('only official https sources and integrity-bounded bytes are accepted',async()=>{
  for(const url of ['http://piston-data.mojang.com/a','https://evil.test/a','https://piston-data.mojang.com.evil.test/a','https://user:secret@piston-data.mojang.com/a'])assert.throws(()=>officialViewerUrl(url),/SOURCE_INVALID/);
  const bytes=Buffer.from('asset'),fetch=async()=>new Response(bytes);
  assert.deepEqual(await officialBytes('https://piston-data.mojang.com/a',{fetch,sha1:sha(bytes),size:5}),bytes);
  await assert.rejects(officialBytes('https://piston-data.mojang.com/a',{fetch,sha1:'0'.repeat(40)}),/INTEGRITY/);
  await assert.rejects(officialBytes('https://piston-data.mojang.com/a',{fetch,limit:4}),/TOO_LARGE/);
});
test('uncatalogued 1.21.5 prepares by actual registry, reuses the verified JAR and retains replaced packs',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'viewer-resources-')),output=path.join(root,'picture'),cache=path.join(root,'cache');
  const jar=Buffer.from('fixture-client'),clientSha256=createHash('sha256').update(jar).digest('hex');
  const metaUrl='https://piston-meta.mojang.com/fixture/1.21.5.json',jarUrl='https://piston-data.mojang.com/fixture/client.jar';
  const meta=Buffer.from(JSON.stringify({id:'1.21.5',downloads:{client:{url:jarUrl,sha1:sha(jar),size:jar.length}}}));
  const manifest=JSON.stringify({versions:[{id:'1.21.5',url:metaUrl,sha1:sha(meta)}]});
  let downloads=0,builds=0;
  const fetch=async url=>{if(url===jarUrl){downloads++;return new Response(jar);}return new Response(url===metaUrl?meta:manifest);};
  const run=async(command,args)=>{builds++;if(args[0].endsWith('build-minecraft-viewer-client.mjs'))await writeFile(path.join(args[2],'viewer-client.json'),JSON.stringify({minecraftVersion:'1.21.5',clientJarSha256:clientSha256,browserBundleSha256:'a'.repeat(64),mesherSha256:'b'.repeat(64)}));};
  try{
    const options={version:'1.21.5',outputDirectory:output,cacheDirectory:cache,fetch,run};
    const first=await prepareVanillaViewer(options);assert.equal(first.minecraftVersion,'1.21.5');assert.equal(downloads,1);assert.equal(builds,3);
    await prepareVanillaViewer(options);assert.equal(downloads,1);assert.equal(builds,6);
    assert.equal((await readdir(path.join(output,'versions'))).filter(name=>name.startsWith('1.21.5.previous-')).length,1);
    assert.equal(JSON.parse(await readFile(path.join(first.directory,'viewer-assets.json'),'utf8')).gameConnections,0);
    await writeFile(path.join(output,'.prepare-1.21.5.lock'),'fixture',{flag:'wx'});
    await assert.rejects(prepareVanillaViewer(options),/IN_PROGRESS/);
    await assert.rejects(prepareVanillaViewer({...options,version:'../1.21.5'}),/VERSION_INVALID/);
  }finally{assert.ok(root.startsWith(path.join(tmpdir(),'viewer-resources-')));await rm(root,{recursive:true,force:true});}
});
