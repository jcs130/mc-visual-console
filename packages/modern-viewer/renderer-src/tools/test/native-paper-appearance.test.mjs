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
import {mirrorInventoryPlayer,poseInventoryPlayer,releaseInventoryMirror} from '../../src/modern-viewer/inventory-player-preview.js'
const uuid='6e8b395e-4349-3d44-99f5-b7488825e426',other='822d173a-7181-3b9b-be60-804f29b24ecc',sha=b=>createHash('sha256').update(b).digest('hex')
const row={schemaVersion:1,source:'paper_server_appearance',available:true,playerUuid:uuid,entityId:12,kind:'ysm',bundleSha256:'a'.repeat(64),bytes:5,texture:'default'}
const directory=process.env.PAPER_APPEARANCE_FIXTURES,assets=process.env.PAPER_APPEARANCE_NATIVE_ASSETS
test('server appearance binding requires the actual observed UUID, body ID and bounded immutable resource',()=>{
  const self={uuid,entityId:12,paperAppearance:row};assert.equal(nativePaperAppearanceBinding(self,uuid).kind,'paper-original')
  for(const patch of [{playerUuid:other},{entityId:13},{bytes:9*1024*1024},{bundleSha256:'../secret'},{available:false}])assert.throws(()=>nativePaperAppearanceBinding({...self,paperAppearance:{...row,...patch}},uuid))
})

test('an unsupported optional first-person arm hierarchy retains the original third-person model and animation',async()=>{
  const encode=value=>({base64:Buffer.from(JSON.stringify(value)).toString('base64')})
  const geometry={format_version:'1.12.0','minecraft:geometry':[{description:{texture_width:16,texture_height:16},bones:[{name:'Root',pivot:[0,0,0],cubes:[{origin:[0,0,0],size:[1,1,1],uv:[0,0]}]}]}]}
  const bundle={modelId:'custom-arm-rig',model:'main.json',animation:'main.animation.json',textures:{default:'texture.png'},files:{
    'ysm.json':encode({spec:2,properties:{free:true},files:{player:{model:{arm:'arm.json'}}}}),
    'main.json':encode(geometry),'arm.json':encode(geometry),
    'main.animation.json':encode({format_version:'1.8.0',animations:{idle:{loop:true,bones:{}},walk:{loop:true,bones:{}}}}),'texture.png':{base64:''}}}
  const original=JSON.stringify(bundle)
  const actor=await createNativePaperAppearanceActor(null,{uuid,paperAppearance:{kind:'ysm',texture:'default',modelId:bundle.modelId},readBundle:async()=>bundle,loadTexture:async()=>new THREE.Texture()})
  try{
    actor.applyPose({x:12,y:64,z:20,yaw:0,pitch:0})
    const now=10000,self={uuid,entityId:12,velocity:{x:.1,y:0,z:0},onGround:true,health:20,mainArm:'right'}
    const current={epoch:1,pose:{x:12,y:64,z:20,yaw:0,pitch:0},selfPlayer:self,
      motion:{schemaVersion:1,source:'same_player_physics_tick',epoch:1,tick:1,tickMs:50,sampledAt:now},
      presentation:{available:true,source:'paper_server_observation',playerUuid:uuid,sampledAt:now,self}}
    const motion=actor.applyMotion({current,now});assert.equal(motion.available,true,motion.reason)
    assert.equal(actor.model.root.visible,true)
    assert.equal(actor.assetInfo.firstPersonArmsAvailable,false)
    assert.equal(actor.assetInfo.firstPersonArmReason,'PAPER_FIRST_PERSON_ARM_RIG_UNSUPPORTED')
    assert.deepEqual(actor.root.position.toArray(),[12,64,20])
    assert.equal(JSON.stringify(bundle),original)
  }finally{actor.dispose()}
  const broken=structuredClone(bundle);broken.files['arm.json']={base64:Buffer.from('{bad json').toString('base64')}
  await assert.rejects(createNativePaperAppearanceActor(null,{uuid,paperAppearance:{kind:'ysm',texture:'default'},readBundle:async()=>broken,loadTexture:async()=>new THREE.Texture()}),SyntaxError)
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
    assert.equal(actor.root.userData.playerUuid,proof.playerUuid)
    assert.equal(actor.assetInfo.inventoryPreviewAvailable,true)
    assert.equal(actor.assetInfo.equipmentRenderingAvailable,false)
    assert.ok(actor.firstPersonRoot);const pose={x:100,y:67,z:-200,yaw:.4,pitch:.1};actor.applyPose(pose)
    assert.equal(actor.model?.root.visible ?? false,false,'a world position is not an initialized original animation')
    const waiting=actor.applyMotion({current:{},now:0});assert.equal(waiting.available,false)
    assert.equal(actor.model.root.visible,false,'missing first-frame state cannot expose original bind-pose props')
    const now=Date.now(),self={uuid:proof.playerUuid,entityId:proof.entityId,velocity:{x:.1,y:0,z:0},onGround:true,health:20,maxHealth:20,crouching:false,mainArm:'right',bodyYaw:.4,headYaw:.4}
    const frame={epoch:1,pose,selfPlayer:self,motion:{schemaVersion:1,source:'same_player_physics_tick',tickMs:50,epoch:1,tick:3,sampledAt:now},presentation:{available:true,source:'paper_server_observation',playerUuid:proof.playerUuid,sampledAt:now,self}}
    const motion=actor.applyMotion({current:frame,now});assert.equal(motion.available,true,name+': '+motion.reason);assert.equal(motion.base,'walk');assert.equal(motion.clip,'walk','shared diagnostics must not report waiting during a valid Paper animation');assert.deepEqual(actor.root.position.toArray(),[100,67,-200]);assert.equal(actor.root.visible,true)
    assert.equal(actor.model.root.visible,true)
    if(name==='cormy-winefox-cream')for(const prop of ['UmbrellaArm','chair2','FOX'])assert.equal(actor.model.bones.get(prop).scale.length(),0,prop+' remains hidden in normal movement')
    // Paper movement is position delta, not impulse velocity. Exercise each
    // actual original model, including a missed tick and frames between packets.
    self.velocity={x:0,y:0,z:0};self.sprinting=true
    self.locomotion={source:'paper_position_delta',playerUuid:proof.playerUuid,entityId:proof.entityId,tick:3,sampledAt:now,tickMs:50,spanTicks:2,available:true,velocity:{x:.3,y:0,z:0}}
    const poses=[]
    for(let age=0;age<=100;age+=1000/60){
      const running=actor.applyMotion({current:frame,now:now+age})
      assert.equal(running.available,true,name+': '+running.reason);assert.equal(running.base,'run')
      assert.equal(running.locomotionSource,'paper_position_delta')
      poses.push([...actor.model.bones.values()].flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]))
    }
    assert.notDeepEqual(poses[0],poses.at(-1),name+' running bones must advance between packets')
    const before=actor.root.position.toArray(),mirror=mirrorInventoryPlayer(THREE,actor.root)
    poseInventoryPlayer(mirror,.2,.1)
    for(const bone of actor.model.bones.values()){
      assert.notStrictEqual(mirror.nodes.get(bone),bone)
      assert.deepEqual(mirror.nodes.get(bone).quaternion.toArray(),bone.quaternion.toArray(),name+' preview preserves the original current pose')
    }
    assert.deepEqual(actor.root.position.toArray(),before,'read-only preview does not move the world actor')
    releaseInventoryMirror(mirror)
    self.locomotion.velocity.x=0;self.sprinting=false
    const stopped=actor.applyMotion({current:frame,now:now+150})
    assert.equal(stopped.base,'idle',name+' stops instead of continuing to run')
    if(name!=='qiandengji_kirito')assert.equal(stopped.available,true,name+': '+JSON.stringify(stopped))
    else assert.equal(stopped.reason,'YSM_CLIP_UNAVAILABLE:idle','retain original missing-idle diagnostic without hiding a valid static body')
    actor.applyPose({...pose,bodyYaw:.7,headYaw:.9})
    const stale=actor.applyMotion({current:frame,now:now+2000})
    assert.equal(stale.available,false);assert.match(stale.reason,/STALE/)
    assert.equal(actor.model.root.visible,true,'a stale sample preserves the last verified pose instead of resetting to bind pose')
    assert.equal(actor.root.rotation.y,.7,'stale animation may not snap the body back to raw head yaw')
    actor.dispose();actor.dispose()
    await assert.rejects(readPaperAppearance({...binding,bundleSha256:'f'.repeat(64)},{resolveUrl:p=>'http://127.0.0.1/'+p,fetcher:async()=>new Response(bytes)}),/HASH_MISMATCH/)
  }
})
