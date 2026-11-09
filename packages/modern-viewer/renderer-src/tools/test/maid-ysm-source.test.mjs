import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createMaidAppearanceSource, TLM_JAR_SHA256 } from '../../host/maid-appearance-source.mjs'
import { paperMaidBinding } from '../../src/native-viewer/native-paper-maid.js'
import { createMaidYsmActor } from '../../src/native-viewer/native-paper-maid.js'
import { readPaperAppearance } from '../../src/native-viewer/native-paper-appearance.js'
import * as THREE from 'three'

const sha=b=>createHash('sha256').update(b).digest('hex')
const uuid='12345678-1234-5678-1234-567812345678'
const ysmSha='b285c73d4ec010d9a9be3c53c1bee890cf269645be5f1bcf1c27a2e8e82807cb'
test('original maid YSM projection requires the exact UUID and current native choice; resources stay immutable',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'maid-ysm-'))
 try{
  const data=Buffer.from('{"schemaVersion":1}'),hash=sha(data)
  const base=Buffer.from(JSON.stringify({schemaVersion:1,format:'tlm-bedrock-catalog',jarSha256:TLM_JAR_SHA256,models:{}}))
  const ref={maidUuid:uuid,nativeModelId:'大肥鱼_1.1.ysm',nativeTexture:'white',modelId:'qd_dafeiyu',texture:'pearl',
   bundleSha256:hash,bytes:data.length,assetSha256:'b'.repeat(64),presentation:'owner_web_projection'}
  const raw=Buffer.from(JSON.stringify({schemaVersion:1,format:'maid-ysm-original-catalog',tlmJarSha256:TLM_JAR_SHA256,
   ysmVersion:'2.6.5',ysmJarSha256:ysmSha,bindings:[ref]}))
  await fs.mkdir(path.join(directory,'assets'));await fs.writeFile(path.join(directory,'catalog.json'),base)
  await fs.writeFile(path.join(directory,'maid-ysm.json'),raw);await fs.writeFile(path.join(directory,'assets',hash+'.json'),data)
  const source=await createMaidAppearanceSource({directory,catalogSha256:sha(base),ysmCatalogSha256:sha(raw)})
  const row={uuid,available:true,ysm:true,modelId:'authors_and_credits:clocklalier',ysmModelId:ref.nativeModelId,ysmTexture:'white'}
  assert.equal(source.binding(row).reason,'TLM_ASSET_LOADING');await source.prepare([row])
  const binding=source.binding(row);assert.equal(binding.available,true);assert.equal(binding.format,'ysm-bedrock-original')
  assert.equal(binding.modelId,'qd_dafeiyu');assert.equal(binding.nativeModelId,row.ysmModelId);assert.equal(binding.texture,'pearl')
  const entity={uuid,entityId:21,name:'touhou_little_maid:maid',paperMaid:{source:'paper_tracked_maids',uuid,entityId:21,state:row,asset:binding}}
  assert.equal(paperMaidBinding(entity).uuid,uuid);assert.equal(source.read(hash),source.read(hash))
  for(const patch of [{uuid:'22345678-1234-5678-1234-567812345678'},{ysmModelId:'other.ysm'},{ysmTexture:'black'},{ysmModelId:undefined},{available:false}])assert.equal(source.binding({...row,...patch}).available,false)
  assert.throws(()=>paperMaidBinding({...entity,paperMaid:{...entity.paperMaid,state:{...row,ysmTexture:'black'}}}),/ASSET/)
  await assert.rejects(createMaidAppearanceSource({directory,catalogSha256:sha(base),ysmCatalogSha256:'f'.repeat(64)}),/HASH/)
  // Evicted or corrupt bytes are never reported as an available model.
  await fs.writeFile(path.join(directory,'assets',hash+'.json'),'corrupt')
  const corrupt=await createMaidAppearanceSource({directory,catalogSha256:sha(base),ysmCatalogSha256:sha(raw)})
  await corrupt.prepare([row]);assert.equal(corrupt.binding(row).available,false)
 }finally{await fs.rm(directory,{recursive:true,force:true})}
})

test('exported original Feiyu source retains geometry, texture choice and identity through idle, walk and removal',
 {skip:!process.env.TLM_MAID_YSM_ASSETS},async()=>{
 const directory=process.env.TLM_MAID_YSM_ASSETS,raw=await fs.readFile(path.join(directory,'maid-ysm.json')),
  catalog=JSON.parse(raw),ref=catalog.bindings[0],base=await fs.readFile(path.join(directory,'catalog.json'))
 const source=await createMaidAppearanceSource({directory,catalogSha256:sha(base),ysmCatalogSha256:sha(raw)})
 const state={uuid:ref.maidUuid,available:true,ysm:true,modelId:'touhou_little_maid:hakurei_reimu',ysmModelId:ref.nativeModelId,ysmTexture:ref.nativeTexture,
  bodyYaw:0,headYaw:0,pitch:0,health:20,maxHealth:20,onGround:true,sprinting:false,backpack:'touhou_little_maid:empty'}
 await source.prepare([state]);const asset=source.binding(state)
 const entity={uuid:ref.maidUuid,entityId:21,name:'touhou_little_maid:maid',position:{x:0,y:64,z:0},metadata:[],equipment:[],
  paperMaid:{source:'paper_tracked_maids',uuid:ref.maidUuid,entityId:21,sampledAt:10000,state,asset}}
 const bytes=source.read(asset.bundleSha256),original=sha(bytes)
 const actor=await createMaidYsmActor(entity,paperMaidBinding(entity),{
  readBundle:r=>readPaperAppearance(r,{resolveUrl:p=>p,fetcher:async()=>new Response(bytes)}),
  loadMaidTexture:async file=>{const png=Buffer.from(file.base64,'base64');return new THREE.Texture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)})}})
 try{
  actor.update(entity,10000);assert.equal(actor.root.visible,true);assert.ok(actor.model.cubeCount>10)
  assert.equal(actor.assetInfo.animation,'idle');assert.equal(actor.assetInfo.modelId,ref.modelId)
  actor.update({...entity,position:{x:1,y:64,z:0},paperMaid:{...entity.paperMaid,sampledAt:10500}},10500)
  assert.equal(actor.assetInfo.animation,'walk');assert.equal(actor.root.position.x,1)
  assert.equal(actor.assetInfo.originalTexture,true);assert.equal(sha(source.read(asset.bundleSha256)),original)
  assert.throws(()=>actor.update({...entity,uuid:uuid}),/IDENTITY/)
  assert.equal(actor.assetInfo.completeEntityParityVerified,false)
 }finally{actor.dispose();actor.dispose();assert.equal(actor.root.children.length,0)}
})
