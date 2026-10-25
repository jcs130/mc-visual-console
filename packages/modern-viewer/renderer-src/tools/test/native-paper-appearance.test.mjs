import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import {createHash} from 'node:crypto'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {nativePaperAppearanceBinding,readPaperAppearance,createNativePaperAppearanceActor} from '../../src/native-viewer/native-paper-appearance.js'
import {NativeSelfPlayerController} from '../../src/native-viewer/native-self-player.js'
import {paperObservedLocomotion} from '../../host/paper-observed-motion.mjs'
const uuid='6e8b395e-4349-3d44-99f5-b7488825e426',other='822d173a-7181-3b9b-be60-804f29b24ecc',sha=b=>createHash('sha256').update(b).digest('hex')
const row={schemaVersion:1,source:'paper_server_appearance',available:true,playerUuid:uuid,entityId:12,kind:'ysm',bundleSha256:'a'.repeat(64),bytes:5,texture:'default'}
const directory=process.env.PAPER_APPEARANCE_FIXTURES,assets=process.env.PAPER_APPEARANCE_NATIVE_ASSETS
test('server appearance binding requires the actual observed UUID, body ID and bounded immutable resource',()=>{
  const self={uuid,entityId:12,paperAppearance:row};assert.equal(nativePaperAppearanceBinding(self,uuid).kind,'paper-original')
  for(const patch of [{playerUuid:other},{entityId:13},{bytes:9*1024*1024},{bundleSha256:'../secret'},{available:false}])assert.throws(()=>nativePaperAppearanceBinding({...self,paperAppearance:{...row,...patch}},uuid))
})

test('original Cormy tracks advance between source samples and retain actual sword/eat/drink actions',
 {skip:!directory||!assets||!process.env.PAPER_CORMY_ACTION_FIXTURE},async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(assets,'native-assets.json'),'utf8')),reader=new NativeAssetReader(manifest,p=>fs.readFile(path.join(assets,p)))
  const bundle=JSON.parse(await fs.readFile(path.join(directory,'cormy-winefox-cream.json'),'utf8'))
  const proof=JSON.parse(await fs.readFile(path.join(directory,'appearance-source-verified.json'),'utf8')).find(r=>r.modelId===bundle.modelId),uuid=proof.playerUuid
  const actor=await createNativePaperAppearanceActor(reader,{uuid,paperAppearance:proof,readBundle:async()=>bundle,
    loadTexture:async input=>{const png=Buffer.from(input.split(',')[1],'base64');return new THREE.Texture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)})}})
  let tick=10
  try{
   for(const [name,patch,item,clip]of [['idle',{},null,'idle'],['walk',{dx:.2},null,'walk'],['run',{dx:.3,sprinting:true},null,'run'],
     ['sneak',{dx:.05,crouching:true},null,'sneak'],['jump',{onGround:false},null,'jump'],['swim',{dx:.1,onGround:false,inWater:true,pose:3},null,'swim'],
     ['attack',{},'diamond_sword','swing:sword'],['eat',{},'apple','use_mainhand:eat'],['drink',{},'potion','use_mainhand:drink']]){
    const now=100000+(++tick)*100,self={uuid,playerUuid:uuid,entityId:proof.entityId,serverTick:tick,observedAt:now,world:{uuid},position:{x:patch.dx??0,y:64,z:0},
      velocity:{x:0,y:0,z:0},onGround:true,health:20,maxHealth:20,crouching:false,mainArm:'right',bodyYaw:0,headYaw:0,...patch}
    self.locomotion=paperObservedLocomotion({...self,serverTick:tick-1,observedAt:now-50,position:{x:0,y:64,z:0}},self)
    self.handAnimation={source:'paper_server_observation',playerUuid:uuid,entityId:proof.entityId,sampledAt:now,mainArm:'right',activeHand:'mainhand',usingItem:['eat','drink'].includes(name)}
    if(name==='attack')self.handAnimation.swing={hand:'mainhand',sequence:1,startedAt:now-100}
    if(['eat','drink'].includes(name))self.handAnimation.use={source:'paper_use_item_state',hand:'mainhand',kind:name,name:'minecraft:'+item,durationTicks:32,startedAt:now-100}
    const current={epoch:1,pose:{yaw:0,pitch:0,x:0,y:64,z:0},selfPlayer:self,
      motion:{source:'same_player_physics_tick',schemaVersion:1,tickMs:50,tick,epoch:1,sampledAt:now},
      presentation:{available:true,playerUuid:uuid,source:'paper_server_observation',sampledAt:now,self,
        inventory:{playerUuid:uuid,windowId:0,hotbarStart:36,offhandSlot:45,selectedHotbarSlot:0,slots:Array.from({length:46},(_,slot)=>({slot,
          item:slot===36&&item?{name:'minecraft:'+item,count:1,snbt:`{id:"minecraft:${item}",count:1}`} :null}))}}}
    const frames=[]
    for(let age=0;age<=100;age+=1000/60){
      const state=actor.applyMotion({current,now:now+age});assert.equal(state.available,true,name+': '+state.reason);assert.ok(state.clips.includes(clip),name);assert.deepEqual(state.errors,[])
      assert.equal(state.locomotionSource,'paper_position_delta')
      frames.push([...actor.model.bones.values()].flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]))
    }
    assert.ok(frames.every(f=>f.every(Number.isFinite)),name+' has finite bone transforms')
    if(['walk','attack','eat','drink'].includes(name))assert.notDeepEqual(frames[0],frames.at(-1),name+' advances without a new network packet')
   }
  }finally{actor.dispose()}
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
test('original bundles render complete source geometry, scales, first-person arms and received walk motion',{skip:!directory||!assets},async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(assets,'native-assets.json'),'utf8')),reader=new NativeAssetReader(manifest,p=>fs.readFile(path.join(assets,p)))
  const proofs=JSON.parse(await fs.readFile(path.join(directory,'appearance-source-verified.json'),'utf8'))
  for(const name of ['neko_yui','qiandengji_kirito','cormy-winefox-cream'].filter(name=>proofs.some(r=>r.modelId===name))){
    const bytes=await fs.readFile(path.join(directory,name+'.json')),proof=proofs.find(r=>r.modelId===name),binding={...proof,bundleSha256:sha(bytes),bytes:bytes.length}
    const fetcher=async url=>{assert.ok(url.endsWith(binding.bundleSha256+'.json'));return new Response(bytes)}
    const bundle=await readPaperAppearance(binding,{fetcher,resolveUrl:p=>'http://127.0.0.1/'+p}),definition=JSON.parse(Buffer.from(bundle.files['ysm.json'].base64,'base64'))
    const actor=await createNativePaperAppearanceActor(reader,{uuid:proof.playerUuid,paperAppearance:binding,readBundle:async()=>bundle,
      loadTexture:async input=>{const png=Buffer.from(input.split(',')[1],'base64');return new THREE.Texture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)})}})
    assert.ok(actor.model.bones.size>10);assert.ok(actor.assetInfo.cubes>20);assert.equal(actor.assetInfo.scale.height,definition.properties.height_scale)
    assert.ok(actor.firstPersonRoot);const pose={x:100,y:67,z:-200,yaw:.4,pitch:.1};actor.applyPose(pose)
    const now=Date.now(),self={uuid:proof.playerUuid,entityId:proof.entityId,velocity:{x:.1,y:0,z:0},onGround:true,health:20,maxHealth:20,crouching:false,mainArm:'right',bodyYaw:.4,headYaw:.4}
    const frame={epoch:1,pose,selfPlayer:self,motion:{schemaVersion:1,source:'same_player_physics_tick',tickMs:50,epoch:1,tick:3,sampledAt:now},presentation:{available:true,source:'paper_server_observation',playerUuid:proof.playerUuid,sampledAt:now,self}}
    const motion=actor.applyMotion({current:frame,now});assert.equal(motion.available,true,name+': '+motion.reason);assert.equal(motion.base,'walk');assert.equal(motion.clip,'walk','shared diagnostics must not report waiting during a valid Paper animation');assert.deepEqual(actor.root.position.toArray(),[100,67,-200]);assert.equal(actor.root.visible,true)
    actor.applyPose({...pose,bodyYaw:.7,headYaw:.9})
    const stale=actor.applyMotion({current:frame,now:now+2000})
    assert.equal(stale.available,false);assert.match(stale.reason,/STALE/)
    assert.equal(actor.root.rotation.y,.7,'stale animation may not snap the body back to raw head yaw')
    actor.dispose();actor.dispose()
    await assert.rejects(readPaperAppearance({...binding,bundleSha256:'f'.repeat(64)},{resolveUrl:p=>'http://127.0.0.1/'+p,fetcher:async()=>new Response(bytes)}),/HASH_MISMATCH/)
  }
})
