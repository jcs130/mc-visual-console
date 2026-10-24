import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import {createHash} from 'node:crypto'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {nativePaperAppearanceBinding,readPaperAppearance,createNativePaperAppearanceActor} from '../../src/native-viewer/native-paper-appearance.js'
import {NativeSelfPlayerController} from '../../src/native-viewer/native-self-player.js'
const uuid='6e8b395e-4349-3d44-99f5-b7488825e426',other='822d173a-7181-3b9b-be60-804f29b24ecc',sha=b=>createHash('sha256').update(b).digest('hex')
const row={schemaVersion:1,source:'paper_server_appearance',available:true,playerUuid:uuid,entityId:12,kind:'ysm',bundleSha256:'a'.repeat(64),bytes:5,texture:'default'}
test('server appearance binding requires the actual observed UUID, body ID and bounded immutable resource',()=>{
  const self={uuid,entityId:12,paperAppearance:row};assert.equal(nativePaperAppearanceBinding(self,uuid).kind,'paper-original')
  for(const patch of [{playerUuid:other},{entityId:13},{bytes:9*1024*1024},{bundleSha256:'../secret'},{available:false}])assert.throws(()=>nativePaperAppearanceBinding({...self,paperAppearance:{...row,...patch}},uuid))
})
test('server model loads are retired on a body switch; an old asynchronous actor cannot replace the new role',async()=>{
  let release,disposed=0;const actor={assetInfo:{source:'paper_server_appearance'},dispose(){disposed++}}
  const controller=new NativeSelfPlayerController({manifest:{assets:{}}},{paperAppearanceFactory:()=>new Promise(r=>{release=r})})
  const pending=controller.update({uuid,entityId:12,paperAppearance:row},uuid)
  controller.clear();release(actor);assert.equal(await pending,null);assert.equal(disposed,1);assert.equal(controller.actor,null);controller.dispose()
})

test('a transient first model download can recover for the same body without a page reload',async()=>{
  let clock=0,calls=0;const actor={assetInfo:{source:'paper_server_appearance'},dispose(){}}
  const controller=new NativeSelfPlayerController({manifest:{assets:{}}},{now:()=>clock,paperAppearanceFactory:async()=>{
    if(++calls===1)throw Error('PAPER_APPEARANCE_DOWNLOAD_FAILED');return actor
  }})
  const self={uuid,entityId:12,paperAppearance:row}
  assert.equal(await controller.update(self,uuid),null)
  for(let i=0;i<60;i++){clock+=10;await controller.update(self,uuid)}
  assert.equal(calls,1,'render frames must not create a retry storm')
  clock=2500;assert.equal(await controller.update(self,uuid),actor)
  assert.equal(calls,2);assert.equal(controller.actor,actor);controller.dispose()
})

test('automatic model retries are bounded and never repeat an invalid original-asset hash',async()=>{
  for(const message of ['PAPER_APPEARANCE_DOWNLOAD_FAILED','PAPER_APPEARANCE_HASH_MISMATCH']){
    let clock=0,calls=0
    const controller=new NativeSelfPlayerController({manifest:{assets:{}}},{now:()=>clock,paperAppearanceFactory:async()=>{calls++;throw Error(message)}})
    const self={uuid,entityId:12,paperAppearance:row}
    for(let i=0;i<12;i++){clock+=10000;await controller.update(self,uuid)}
    assert.equal(calls,message.includes('HASH')?1:3)
    controller.dispose();clock+=10000;await controller.update(self,uuid);assert.equal(calls,message.includes('HASH')?1:3)
  }
})
const directory=process.env.PAPER_APPEARANCE_FIXTURES,assets=process.env.PAPER_APPEARANCE_NATIVE_ASSETS
test('actual original NEKO and Kirito bundles render their complete geometry, correct source scales, first-person arms and live walk motion',{skip:!directory||!assets},async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(assets,'native-assets.json'),'utf8')),reader=new NativeAssetReader(manifest,p=>fs.readFile(path.join(assets,p)))
  const proofs=JSON.parse(await fs.readFile(path.join(directory,'appearance-source-verified.json'),'utf8'))
  for(const name of ['neko_yui','qiandengji_kirito']){
    const bytes=await fs.readFile(path.join(directory,name+'.json')),proof=proofs.find(r=>r.modelId===name),binding={...proof,bundleSha256:sha(bytes),bytes:bytes.length}
    const fetcher=async url=>{assert.ok(url.endsWith(binding.bundleSha256+'.json'));return new Response(bytes)}
    const bundle=await readPaperAppearance(binding,{fetcher,resolveUrl:p=>'http://127.0.0.1/'+p}),definition=JSON.parse(Buffer.from(bundle.files['ysm.json'].base64,'base64'))
    const actor=await createNativePaperAppearanceActor(reader,{uuid:proof.playerUuid,paperAppearance:binding,readBundle:async()=>bundle,
      loadTexture:async input=>{const png=Buffer.from(input.split(',')[1],'base64');return new THREE.Texture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)})}})
    assert.ok(actor.model.bones.size>10);assert.ok(actor.assetInfo.cubes>20);assert.equal(actor.assetInfo.scale.height,definition.properties.height_scale)
    assert.ok(actor.firstPersonRoot);const pose={x:100,y:67,z:-200,yaw:.4,pitch:.1};actor.applyPose(pose)
    const now=Date.now(),self={uuid:proof.playerUuid,entityId:proof.entityId,velocity:{x:.1,y:0,z:0},onGround:true,health:20,crouching:false,mainArm:'right',bodyYaw:.4,headYaw:.4}
    const frame={epoch:1,pose,selfPlayer:self,motion:{schemaVersion:1,source:'same_player_physics_tick',tickMs:50,epoch:1,tick:3,sampledAt:now},presentation:{available:true,source:'paper_server_observation',playerUuid:proof.playerUuid,sampledAt:now,self}}
    const motion=actor.applyMotion({current:frame,now});assert.equal(motion.available,true);assert.equal(motion.base,'walk');assert.deepEqual(actor.root.position.toArray(),[100,67,-200]);assert.equal(actor.root.visible,true)
    actor.applyPose({...pose,bodyYaw:.7,headYaw:.9})
    const stale=actor.applyMotion({current:frame,now:now+2000})
    assert.equal(stale.available,false);assert.match(stale.reason,/STALE/)
    assert.equal(actor.root.rotation.y,.7,'stale animation may not snap the body back to raw head yaw')
    actor.dispose();actor.dispose()
    await assert.rejects(readPaperAppearance({...binding,bundleSha256:'f'.repeat(64)},{resolveUrl:p=>'http://127.0.0.1/'+p,fetcher:async()=>new Response(bytes)}),/HASH_MISMATCH/)
  }
})
