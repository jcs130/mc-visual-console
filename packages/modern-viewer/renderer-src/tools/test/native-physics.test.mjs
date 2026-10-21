import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadNativePhysics} from '../../host/native-physics.mjs';
test('native collision export binds the exact registry, preserves original boxes and refuses altered bytes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'native-physics-'));
 try{
  await fs.mkdir(path.join(root,'registry'));
  const registry='a'.repeat(64),boxes=[[0,0,0,1,.5,1]],bytes=Buffer.from(JSON.stringify({schemaVersion:1,nativeRegistrySha256:registry,source:'native_empty_block_getter',sourceSha256:'b'.repeat(64),
   shapes:[{collisionBoxes:boxes,hardness:2,friction:.6,canBreakWithHand:false}],states:[[120000,0]]}));
  const file=path.join(root,'registry/native-physics.json');await fs.writeFile(file,bytes);
  const manifest={registryHashes:{'block-states.jsonl':registry,'native-physics.json':createHash('sha256').update(bytes).digest('hex')}};
  assert.deepEqual((await loadNativePhysics(root,manifest)).states.get(120000).collisionBoxes,boxes);
  await assert.rejects(loadNativePhysics(root,{registryHashes:{...manifest.registryHashes,'block-states.jsonl':'c'.repeat(64)}}),/CONTRACT_INVALID/);
  await fs.appendFile(file,' ');await assert.rejects(loadNativePhysics(root,manifest),/HASH_MISMATCH/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
