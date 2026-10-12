import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {viewerSourceDigest,checkViewerBuild} from '../viewer-build-source.mjs';
test('a changed host adapter or actual deployed bundle fails version verification',async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'viewer-build-'));
 try{
  const source=path.join(temp,'renderer-src'),host=path.join(temp,'src'),assets=path.join(temp,'assets');
  await Promise.all([mkdir(source),mkdir(host),mkdir(path.join(assets,'dist'),{recursive:true})]);
  await writeFile(path.join(source,'entry.js'),'export const renderer=1;\r\n');await writeFile(path.join(host,'adapter.mts'),'export const channel=1;\n');
  await writeFile(path.join(source,'viewer.css'),'body{color:white}\n');
  const stamp=await viewerSourceDigest(source),bundle=Buffer.from('actual deployed browser bytes');
  await writeFile(path.join(assets,'dist/modern-viewer.js'),bundle);await writeFile(path.join(assets,'viewer-client.json'),JSON.stringify({buildSource:stamp,browserBundleSha256:createHash('sha256').update(bundle).digest('hex'),minecraftVersion:'1.20.6',preset:'qiandengji'}));
  assert.equal((await checkViewerBuild(source,assets)).ok,true);
  await writeFile(path.join(source,'entry.js'),'export const renderer=1;\n');assert.equal((await checkViewerBuild(source,assets)).ok,true,'line endings are portable');
  await writeFile(path.join(source,'viewer.css'),'body{color:orange}\n');assert.equal((await checkViewerBuild(source,assets)).ok,false,'HUD stylesheet changes require rebuild');
  await writeFile(path.join(source,'viewer.css'),'body{color:white}\n');
  await writeFile(path.join(host,'adapter.mts'),'export const channel=2;\n');assert.equal((await checkViewerBuild(source,assets)).ok,false,'changed host requires rebuild');
  await writeFile(path.join(host,'adapter.mts'),'export const channel=1;\n');await writeFile(path.join(assets,'dist/modern-viewer.js'),'stale bundle');assert.equal((await checkViewerBuild(source,assets)).ok,false,'manifest alone cannot attest deployed bytes');
 }finally{assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.match(path.basename(temp),/^viewer-build-/);await rm(temp,{recursive:true,force:true});}
});
