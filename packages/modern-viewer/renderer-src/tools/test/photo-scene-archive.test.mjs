import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {mkdtemp,readFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {captureNativeScene,readSceneArchive,encodeSceneArchive,storeSceneArchive,SCENE_SCHEMA} from '../../host/photo-scene-archive.mjs';
const uid='11111111-1111-3111-8111-111111111111',epoch='22222222-2222-3222-8222-222222222222',photo='33333333-3333-3333-8333-333333333333',world='44444444-4444-3444-8444-444444444444';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const base={protocol:'agent-mc-visual/v1',minecraftVersion:'1.21.1',uuid:uid,server:'fixture.invalid:25565',epoch,sampledAt:10000};
 const actor={id:7,uuid:uid,name:'minecraft:player',username:'Fixture',position:[0,64,0],yaw:0,pitch:0,headYaw:0,equipment:[{name:'minecraft:iron_sword',count:1,displayName:'Sword'}]};
 const frame={...base,source:'same_java_client_world',dimension:'minecraft:overworld',self:actor,entities:[],columns:[{x:0,z:0,revision:1}],time:6000,raining:false,thunder:0};
 const registry={...base,registry:{blocks:[{id:0,name:'minecraft:air',properties:{}},{id:1,name:'minecraft:stone',properties:{}}],biomes:[{id:0,name:'minecraft:plains',colors:{water:4159204}}]}};
 const chunk={...base,x:0,z:0,revision:1,minY:0,height:16,sections:Buffer.from([0,1,2]).toString('base64'),skyLight:[Buffer.alloc(2048,255).toString('base64')],blockLight:[Buffer.alloc(2048,0).toString('base64')],blockEntitiesAvailable:false};
 let calls=[],now=10000;const rpc=async(method,args)=>{calls.push({method,args});now+=10;return structuredClone(method==='visual_frame'?frame:method==='visual_registry'?registry:chunk);};
 const options={rpc,identity:{uuid:uid,server:base.server},job:{job:photo,owner:uid,world,entityId:7,mode:'third',x:0,y:64,z:4,yaw:0,pitch:0,nonce:'PRIVATE_AUTH_MUST_NOT_APPEAR',uploadBase:'PRIVATE_AUTH_MUST_NOT_APPEAR'},image:{sha256:'a'.repeat(64),width:1536,height:1536},cameraState:{instanceId:epoch},now:()=>now,radius:1};
 return{options,frame,registry,chunk,calls};
}
test('captures full received sections, biomes, light, pose and world without commands or private login data',async()=>{
 const f=fixture(),result=await captureNativeScene(f.options),archive=await readSceneArchive(result.bytes,{expectedSha256:result.metadata.sha256,photoId:photo,owner:uid});
 assert.equal(archive.schema,SCENE_SCHEMA);assert.equal(archive.photo.worldUuid,world);assert.equal(archive.frame.dimension,'minecraft:overworld');assert.equal(archive.chunks[0].sections,f.chunk.sections);assert.deepEqual(archive.chunks[0].skyLight,f.chunk.skyLight);assert.deepEqual(archive.registry,f.registry.registry);
 assert.equal(archive.coverage.completeSceneParityVerified,false);assert.equal(archive.coverage.blockEntitiesAvailable,false);assert.ok(!JSON.stringify(archive).includes('PRIVATE_AUTH_MUST_NOT_APPEAR'));assert.ok(!JSON.stringify(archive).includes('fixture.invalid'));
 assert.ok(f.calls.every(c=>['visual_frame','visual_registry','visual_chunk'].includes(c.method)));assert.equal(result.metadata.columns,1);assert.equal(result.metadata.state,'captured');
});
test('a changed world or observer cannot provide an old photo scene',async()=>{
 const f=fixture(),original=f.options.rpc;f.options.rpc=async(method,args)=>{const value=await original(method,args);if(method==='visual_chunk')value.epoch=world;return value;};
 await assert.rejects(captureNativeScene(f.options),/EPOCH_CHANGED/);
 const other=fixture();other.frame.uuid=world;await assert.rejects(captureNativeScene(other.options),/IDENTITY/);
 const changed=fixture();changed.options.job.entityId=8;await assert.rejects(captureNativeScene(changed.options),/SUBJECT_CHANGED/);
});
test('missing columns remain explicitly unavailable and changed revisions are not a coherent world freeze',async()=>{
 const f=fixture();f.frame.columns.push({x:1,z:0,revision:1});const original=f.options.rpc;f.options.rpc=async(method,args)=>{if(method==='visual_chunk'&&args.x===1)throw Error('Not received');return original(method,args);};
 const result=await captureNativeScene(f.options),archive=await readSceneArchive(result.bytes);assert.equal(result.metadata.state,'partial');assert.equal(archive.chunks.length,1);assert.deepEqual(archive.coverage.missingColumns,[{x:1,z:0,reason:'COLUMN_UNAVAILABLE_DURING_CAPTURE'}]);
});
test('scene, photo owner and compressed integrity are checked before use',async()=>{
 const result=await captureNativeScene(fixture().options);
 await assert.rejects(readSceneArchive(result.bytes,{expectedSha256:'b'.repeat(64)}),/HASH_MISMATCH/);await assert.rejects(readSceneArchive(result.bytes,{owner:world}),/OWNER_MISMATCH/);await assert.rejects(readSceneArchive(result.bytes,{photoId:world}),/PHOTO_MISMATCH/);
 await assert.rejects(readSceneArchive(result.bytes,{maxRawBytes:64}),/GZIP_INVALID/);
});
test('raw credentials and invalid embedded resources cannot enter an encoded archive',async()=>{
 const result=await captureNativeScene(fixture().options),archive=await readSceneArchive(result.bytes);archive.source.token='PRIVATE';await assert.rejects(encodeSceneArchive(archive),/PRIVATE_FIELD/);delete archive.source.token;
 archive.resources=[{name:'fixture.ysm',sha256:'c'.repeat(64),bytes:3,base64:Buffer.from('abc').toString('base64')}];await assert.rejects(encodeSceneArchive(archive),/RESOURCE_HASH/);
});
test('immutable scene storage is repeatable and refuses another image under the same photo id',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'mc-scene-test-'));try{
 const a=await captureNativeScene(fixture().options);await storeSceneArchive(root,a);await storeSceneArchive(root,a);assert.ok((await readFile(path.join(root,photo+'.mcscene.gz'))).equals(a.bytes));
 const f=fixture();f.options.image.sha256='b'.repeat(64);const b=await captureNativeScene(f.options);await assert.rejects(storeSceneArchive(root,b),/STORE_CONFLICT/);assert.equal(sha(await readFile(path.join(root,photo+'.mcscene.gz'))),a.metadata.sha256);
 }finally{await rm(root,{recursive:true,force:true});}
});
