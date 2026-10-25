import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {shareViewerAssets,createSharedViewerAssets} from '../../host/viewer-shared-assets.mjs';
import {playerSkinTexture} from '../../host/viewer-player-profile.mjs';
import {createViewerHeadTextures} from '../../host/viewer-head-textures.mjs';
test('identical images share one verified object; differing textures and numeric registries remain per-version',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'shared-viewer-'));
  try{
    for(const [version,bytes] of [['1.21.1','old material'],['1.21.5','new material']]){
      const dir=path.join(root,'versions',version,'public/icons');await mkdir(dir,{recursive:true});
      await writeFile(path.join(dir,'stone.png'),'same original bytes');await writeFile(path.join(dir,'copper.png'),bytes);
      await writeFile(path.join(dir,'registry.json'),JSON.stringify({version,stateId:version==='1.21.1'?1:2}));
    }
    const report=await shareViewerAssets(root,{generated:true});assert.equal(report.objects,1);assert.equal(report.aliases,2);assert.equal(report.savedBytes,19);
    const resolve=createSharedViewerAssets(root);
    const first=await resolve.resolve(path.join(root,'versions/1.21.1/public/icons/stone.png'));
    const second=await resolve.resolve(path.join(root,'versions/1.21.5/public/icons/stone.png'));
    assert.equal(first.file,second.file);assert.equal((await readFile(first.file)).toString(),'same original bytes');
    assert.equal(await resolve.resolve(path.join(root,'versions/1.21.5/public/icons/copper.png')),null);
    assert.equal((await stat(path.join(root,'versions/1.21.5/public/icons/registry.json'))).isFile(),true);
    assert.equal(await resolve.resolve(path.join(root,'versions/1.99.9/public/icons/stone.png')),null);
    await assert.rejects(shareViewerAssets(root,{generated:true}),/ALREADY_PREPARED/);
    await writeFile(first.file,'changed original!!!');await assert.rejects(resolve.resolve(path.join(root,'versions/1.21.1/public/icons/stone.png')),/HASH_MISMATCH|OBJECT_INVALID/);
  }finally{assert.ok(root.startsWith(path.join(tmpdir(),'shared-viewer-')));await rm(root,{recursive:true,force:true});}
});
test('vanilla player texture properties feed the same bounded same-origin proxy and never trigger username lookup',async()=>{
  const hash='a'.repeat(64),url='http://textures.minecraft.net/texture/'+hash;
  const player={properties:[{name:'textures',value:Buffer.from(JSON.stringify({textures:{SKIN:{url,metadata:{model:'slim'}}}})).toString('base64')}]};
  assert.deepEqual(playerSkinTexture(player),{hash,model:'slim'});
  assert.equal(playerSkinTexture({skinData:{url:'https://evil.test/texture/'+hash}}),null);
  let fetched=0;const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(64,16);png.writeUInt32BE(64,20);
  const proxy=createViewerHeadTextures({fetcher:async target=>{fetched++;assert.equal(target,'https://textures.minecraft.net/texture/'+hash);return new Response(png);}});
  proxy.observeBot({players:{Alice:player}});assert.equal(fetched,0);
  assert.equal(await proxy.read('b'.repeat(64)),null);assert.equal(fetched,0);
  assert.deepEqual(await proxy.read(hash),png);assert.deepEqual(await proxy.read(hash),png);assert.equal(fetched,1);
});
