import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { MILLSTONE_SOURCE, MILLSTONE_ASSETS, prepareNativeMillstoneModel, verifyNativeMillstoneSource,
  NativeKineticRenderClock, nativeKineticTimeStatus } from '../../src/native-viewer/native-millstone.js'
import { createKineticActor, kineticAngle } from '../../src/native-viewer/create-kinetics.js'
import { NativeAssetReader, NativeModelLoader } from '../../src/native-viewer/model-loader.js'

const CLIENT={name:'minecraft-1.21.1-client.jar',sha256:'499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'}
const state={name:'create:millstone',stateId:70003,properties:{},renderShape:'MODEL',hasBlockEntity:true}
const position={x:8,y:66,z:-3}
// Synthetic geometry only; the separate private-asset case closes original
// bytes/SHA/UV/PNG validation. This fixture does not bypass production readers.
function reader() {
  return {manifest:{minecraftVersion:'1.21.1',assetIntegrityVerified:true,clientJarSha256:CLIENT.sha256,
    sources:[CLIENT,MILLSTONE_SOURCE],assets:Object.fromEntries(Object.values(MILLSTONE_ASSETS).map(entry=>[entry.path,{...entry,source:MILLSTONE_SOURCE.name}]))},
    bytes:async()=>new Uint8Array([1]),json:async path=>{
      if(path===MILLSTONE_ASSETS.blockstate.path)return{variants:{'':{model:'create:block/millstone/block'}}}
      return{textures:{native:'create:block/millstone'},elements:[{from:[2,6,2],to:[14,12,14],faces:{north:{texture:'#native',uv:[0,0,6,3]}}}]}
    }}
}
function loader(source=reader()) {
  const calls=[],released=[]
  return {reader:source,calls,released,
    model:async id=>{calls.push(id);const group=new THREE.Group();group.add(new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial()));return group},
    block:async()=>{calls.push('block');return new THREE.Group()},
    releaseModel:root=>{released.push(root);root.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.dispose()})}}
}

test('millstone source registration is bound to unique original client/Create archives, not a matching old entry among overrides',()=>{
  verifyNativeMillstoneSource(reader())
  for(const alter of [r=>r.manifest.minecraftVersion='1.20.6',r=>r.manifest.clientJarSha256='wrong',r=>r.manifest.sources=null,
    r=>r.manifest.sources.push(MILLSTONE_SOURCE),r=>r.manifest.sources=[CLIENT,{...MILLSTONE_SOURCE,explicitOverride:true}],
    r=>r.manifest.sources=[CLIENT,{...MILLSTONE_SOURCE,sha256:'old'}],r=>r.manifest.sources=[MILLSTONE_SOURCE]]){
    const r=reader();alter(r);assert.throws(()=>verifyNativeMillstoneSource(r),/UNVERIFIED/)
  }
})

test('millstone preparation preserves original paths/UV and refuses wrong state, dynamic texture and resource priority',async()=>{
  const body=await prepareNativeMillstoneModel(reader(),state,'body'),rotor=await prepareNativeMillstoneModel(reader(),state,'rotor')
  assert.equal(body.modelId,'create:block/millstone/block');assert.equal(rotor.modelId,'create:block/millstone/inner')
  assert.equal(rotor.axis,'y');assert.equal(rotor.pixelParityVerified,false)
  assert.deepEqual(rotor.faces[0].uv,[0,1,0,13/16,6/16,13/16,6/16,1])
  for(const patch of [{name:'create:cogwheel'},{renderShape:'INVISIBLE'},{hasBlockEntity:false},{stateId:-1}])
    await assert.rejects(prepareNativeMillstoneModel(reader(),{...state,...patch}),/STATE_UNSUPPORTED/)
  await assert.rejects(prepareNativeMillstoneModel(reader(),state,'item'),/STATE_UNSUPPORTED/)
  const wrong=reader();wrong.manifest.assets[MILLSTONE_ASSETS.rotor.path].sha256='wrong'
  await assert.rejects(prepareNativeMillstoneModel(wrong,state,'rotor'),/ASSET_UNVERIFIED/)
  const animated=reader();animated.manifest.assets[`${MILLSTONE_ASSETS.millstone.path}.mcmeta`]={}
  await assert.rejects(prepareNativeMillstoneModel(animated,state,'rotor'),/TEXTURE_STATE_UNSUPPORTED/)
  const conflict=reader();conflict.bytes=async path=>{if(path===MILLSTONE_ASSETS.rotor.path)throw Error(`NATIVE_RESOURCE_PRIORITY_UNRESOLVED:${path}`);return new Uint8Array([1])}
  await assert.rejects(prepareNativeMillstoneModel(conflict,state,'rotor'),/PRIORITY_UNRESOLVED/)
})

test('only the original millstone inner rotates around the block centre from real signed RPM; static body is separate',async()=>{
  const l=loader(),actor=await createKineticActor(l,state,position)
  assert.deepEqual(l.calls,['create:block/millstone/inner']);assert.deepEqual(actor.root.position.toArray(),[8.5,66.5,-2.5])
  assert.equal(actor.staticBodyRenderedSeparately,true);assert.equal(actor.root.visible,false)
  assert.equal(actor.root.userData.nativeDevice.clockAvailable,false)
  assert.throws(()=>actor.frame(10,.5),/SPEED_UNAVAILABLE/)
  actor.setSpeed(32);actor.frame(10,.5);actor.setClockAvailable(true)
  assert.ok(actor.rotor.quaternion.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),kineticAngle(10,32,position,'y')))<1e-7)
  actor.setSpeed(-32);actor.frame(10,.5)
  assert.ok(actor.rotor.quaternion.y<0);assert.equal(actor.root.userData.nativeDevice.speed,-32)
  actor.setSpeed(0);actor.frame(100,.2);assert.equal(actor.rotor.quaternion.y,0)
  actor.setClockAvailable(false,'NATIVE_KINETIC_NATIVE_TIME_UNAVAILABLE')
  assert.equal(actor.root.visible,false);assert.equal(actor.root.userData.nativeDevice.clockReason,'NATIVE_KINETIC_NATIVE_TIME_UNAVAILABLE')
  const parent=new THREE.Group();parent.add(actor.root);actor.dispose();actor.dispose()
  assert.equal(parent.children.length,0);assert.equal(l.released.length,1)
  assert.throws(()=>actor.setSpeed(32),/DISPOSED/);assert.throws(()=>actor.frame(0,0),/DISPOSED/)
})

test('source failure, missing actual RPM and overflowing float input never produce a guessed rotor or leak its owned geometry',async()=>{
  const source=reader();source.bytes=async()=>{throw Error('NATIVE_ASSET_HASH_MISMATCH')}
  const l=loader(source);await assert.rejects(createKineticActor(l,state,position),/HASH_MISMATCH/)
  assert.equal(l.calls.length,0);assert.equal(l.released.length,1)
  const broken=loader();broken.model=async()=>{throw Error('NATIVE_ASSET_MISSING')}
  await assert.rejects(createKineticActor(broken,state,position),/ASSET_MISSING/);assert.equal(broken.released.length,1)
  for(const invalid of [null,{x:8.5,y:66,z:-3},{x:2147483648,y:66,z:-3}])
    await assert.rejects(createKineticActor(loader(),state,invalid),/POSITION_INVALID/)
  const actor=await createKineticActor(loader(),state,position)
  for(const speed of [null,undefined,NaN,Infinity,1e100])assert.throws(()=>actor.setSpeed(speed),/SPEED_UNAVAILABLE/)
  assert.throws(()=>kineticAngle(1728000,3e38,position,'y'),/ANGLE_UNAVAILABLE/)
  actor.dispose()
})

test('failed hand-crank partial creation releases the already-created body and does not publish a half actor',async()=>{
  const l=loader();let body,disposed=0
  l.block=async()=>{body=new THREE.Group();const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial());mesh.geometry.addEventListener('dispose',()=>disposed++);body.add(mesh);return body}
  l.model=async()=>{throw Error('NATIVE_ASSET_MISSING:handle')}
  await assert.rejects(createKineticActor(l,{name:'create:hand_crank',stateId:1,properties:{facing:'down'}},position),/ASSET_MISSING/)
  assert.equal(l.released.length,1);assert.equal(disposed,1);assert.ok(body)
})

test('client render clock retains source float partial tick and 1728000 tick period independently of server world age',()=>{
  const c=new NativeKineticRenderClock()
  assert.deepEqual(c.sample(1000),{ticks:0,elapsedTicks:0,partialTick:0,renderTicks:0,source:'browser_animation_tick_holder',paused:false,javaReferencePhaseVerified:false})
  const a=c.sample(1120);assert.equal(a.ticks,2);assert.equal(a.partialTick,Math.fround(.4));assert.equal(a.renderTicks,Math.fround(2+Math.fround(.4)))
  const wrap=c.sample(1000+1728000*50+25);assert.equal(wrap.ticks,0);assert.equal(wrap.elapsedTicks,1728000);assert.equal(wrap.renderTicks,.5)
  assert.equal(c.sample(1000+1728001*50).renderTicks,1)
})

test('clock pause/unknown data/reconnect cannot advance the rotor by hidden wall time or resurrect an old epoch',()=>{
  const c=new NativeKineticRenderClock();c.sample(1000);c.pause(1125)
  const paused=c.sample(5000);assert.equal(paused.renderTicks,2.5);assert.equal(paused.paused,true)
  c.resume(5125);assert.equal(c.sample(5125).renderTicks,2.5);assert.equal(c.sample(5150).renderTicks,3)
  assert.throws(()=>c.sample(5100),/CLOCK_INVALID/);assert.throws(()=>c.resume(-1),/CLOCK_INVALID/)
  c.reset();assert.equal(c.sample(100).renderTicks,0)
  for(const value of [NaN,Infinity,-1]){const other=new NativeKineticRenderClock();assert.throws(()=>other.sample(value),/CLOCK_INVALID/)}
})

test('native time freshness remains an independent unknown guard and is never used as the client animation phase',()=>{
  assert.deepEqual(nativeKineticTimeStatus({age:90000000,receivedAt:1000},16000),{available:true})
  // A final/background RAF after visibilitychange must not resume an otherwise
  // fresh native clock before the document is visible again.
  assert.deepEqual(nativeKineticTimeStatus({age:90000000,receivedAt:1000},1001,{paused:true}),
    {available:false,reason:'NATIVE_KINETIC_RENDER_CLOCK_PAUSED'})
  assert.deepEqual(nativeKineticTimeStatus({age:90000000,receivedAt:1000},1002,{paused:false}),{available:true})
  assert.equal(nativeKineticTimeStatus({age:90000000,receivedAt:1000},16001).reason,'NATIVE_KINETIC_NATIVE_TIME_STALE')
  for(const time of [null,{}, {age:NaN,receivedAt:0},{age:1,receivedAt:NaN},{age:-1,receivedAt:0},{age:1,receivedAt:2000}])
    assert.equal(nativeKineticTimeStatus(time,1000).reason,'NATIVE_KINETIC_NATIVE_TIME_UNAVAILABLE')
})

test('private v5 assets close original millstone body/inner geometry, textures and UV while RPM transforms only the rotor',{
  skip:!(process.env.NATIVE_DEVICE_ASSET_DIR||process.env.NATIVE_GUIDE_ASSET_DIR)
},async()=>{
  const {readFile}=await import('node:fs/promises'),{join}=await import('node:path')
  const dir=process.env.NATIVE_DEVICE_ASSET_DIR||process.env.NATIVE_GUIDE_ASSET_DIR
  const manifest=JSON.parse(await readFile(join(dir,'native-assets.json'),'utf8'))
  const source=new NativeAssetReader(manifest,path=>readFile(join(dir,path)))
  const body=await prepareNativeMillstoneModel(source,state,'body'),rotor=await prepareNativeMillstoneModel(source,state,'rotor')
  assert.equal(body.faces.length,28);assert.equal(rotor.faces.length,36)
  assert.deepEqual(body.faces[0].position,[.5,-.125,-.5,.5,-.5,-.5,-.5,-.5,-.5,-.5,-.125,-.5])
  assert.deepEqual(rotor.faces[0].uv,[9/16,6/16,9/16,3/16,10.5/16,3/16,10.5/16,6/16])
  const decoded=[];const l=new NativeModelLoader(source,async bytes=>{
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),image={width:view.getUint32(16),height:view.getUint32(20)}
    decoded.push(image);return new THREE.Texture(image)
  })
  const staticModel=await l.model(body.modelId),actor=await createKineticActor(l,state,position)
  staticModel.position.set(8.5,66.5,-2.5);const staticBefore=staticModel.quaternion.toArray()
  actor.setSpeed(32);actor.frame(10,.25);actor.setClockAvailable(true)
  assert.deepEqual(staticModel.quaternion.toArray(),staticBefore)
  let count=0;actor.root.traverse(mesh=>{if(mesh.isMesh){count++;assert.ok(mesh.userData.originalTexture.startsWith('create:block/'))}})
  assert.equal(count,36);assert.equal(decoded.length,4);assert.ok(decoded.every(image=>image.width>0&&image.height>0))
  actor.dispose();l.releaseModel(staticModel);assert.equal(l.geometries.size,0);await l.dispose()
})
