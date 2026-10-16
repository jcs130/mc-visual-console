import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createHash} from 'node:crypto'
import * as THREE from 'three'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {createNativeEntityActor} from '../../src/native-viewer/native-entity-dispatch.js'
import {createNativeEntityMotion} from '../../src/native-viewer/native-entity-motion.js'
import {nativeAquaticState,nativeAquaticEnvironment,nativeAquaticDimensions,NATIVE_AQUATIC_TYPES} from '../../src/native-viewer/native-aquatic-state.js'
import {NATIVE_ENTITY_CENSUS,NATIVE_NO_MESH_TYPES,assertNativeEntityCensus,nativeEntityCoverage} from '../../src/native-viewer/native-entity-coverage.js'
import {NativeEntityLayer} from '../../src/native-viewer/native-entity-layer.js'
import {NativeEntityPresentation} from '../../src/native-viewer/native-entity-presentation.js'
import {originalAtan2} from '../../src/native-viewer/native-aquatic-animation.js'
import {NativeWorldState} from '../native-world-host.mjs'
const packRoot=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url)
const pack=JSON.parse(await fs.readFile(new URL('pack.json',packRoot),'utf8'))
const cataloguePath='assets/minecraft/native/client-model-layers.json'
const catalogue=JSON.parse(await fs.readFile(new URL(cataloguePath,packRoot),'utf8'))
const manifest={minecraftVersion:'1.21.1',assetIntegrityVerified:true,clientJarSha256:catalogue.clientJarSha256,sources:[{name:'minecraft-1.21.1-client.jar',sha256:catalogue.clientJarSha256}],assets:pack.files}
const reader=new NativeAssetReader(manifest,path=>fs.readFile(new URL(path,packRoot)))
const decode=async bytes=>{const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return new THREE.Texture({width:v.getUint32(16),height:v.getUint32(20)})}
const reference=JSON.parse(await fs.readFile(new URL('./fixtures/native-aquatic-model-reference.json',import.meta.url),'utf8'))
const air={name:'minecraft:air',fluid:{empty:true,name:'minecraft:empty',height:0}},water={name:'minecraft:water',fluid:{empty:false,name:'minecraft:water',height:8/9}}
const entry=(key,type,value)=>({key,type,value})
function entity(name='minecraft:cod',metadata=[]){return {entityId:12,uuid:'12345678-1234-5678-1234-567812345678',name,position:{x:4.5,y:64,z:4.5},yaw:0,pitch:10,headYaw:30,spawnedAt:1000,onGround:true,velocity:{x:.1,y:0,z:.1},metadata,equipment:[],cues:[]}}
function motionFor(e,inWater=true){const tracker=createNativeEntityMotion(e,{random:()=>.7,environmentAt:(next,position)=>nativeAquaticEnvironment({...next,position},p=>inWater&&p.y===64?water:air)});e.motion=tracker.current();return tracker}
const close=(a,b,label,tolerance=3e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${label}: ${a} != original ${b}`)
const bone=(actor,name)=>{let found;actor.root.traverse(o=>{if(o.name===name&&!found)found=o});assert.ok(found,name);return found}
const finish=async layer=>{while(layer.running)await new Promise(r=>setImmediate(r))}

test('all130 original registry rows, provider evidence, layer keys and textures remain explicit',async()=>{
 assert.equal(assertNativeEntityCensus(catalogue),true);assert.equal(NATIVE_ENTITY_CENSUS.length,130)
 assert.equal(NATIVE_ENTITY_CENSUS.filter(row=>row.path==='U').length,80)
 assert.equal(NATIVE_ENTITY_CENSUS.filter(row=>row.path==='A').length,12)
 for(const row of NATIVE_ENTITY_CENSUS){for(const key of row.originalLayers)assert.ok(catalogue.layers[key],`${row.name}:${key}`);for(const path of row.originalTextureCandidates)assert.ok(pack.files[path],path);const c=nativeEntityCoverage(row.name);assert.equal(c.scene,'unverified');for(const key of ['geometry','state','animation','material'])assert.equal(typeof c[key],'string')}
 assert.throws(()=>assertNativeEntityCensus({...catalogue,registries:{entities:catalogue.registries.entities.slice(1)}}),/CENSUS_MISMATCH/)
 assert.equal(createHash('sha256').update(await reader.bytes(cataloguePath)).digest('hex'),'3571f2c6d4fbaa2e07db239853e0baf5db9dd07c5b66653cafa7588da466fbe3')
})

test('all12 production actors use locked original polygons, UVs, textures and dispose resources',async()=>{
 for(const name of NATIVE_AQUATIC_TYPES){const e=entity(name);motionFor(e);const actor=await createNativeEntityActor(reader,e,{loadTexture:decode})
  assert.equal(actor.root.visible,true);assert.equal(actor.assetInfo.type,name);assert.equal(actor.assetInfo.animationParityVerified,false)
  const keys=actor.root.userData.nativeAquatic.originalModelKeys;assert.ok(keys.length)
  for(const [index,key] of keys.entries()){const def=catalogue.layers[key];for(const part of def.parts){if(!part.polygons.length)continue;const candidates=[];actor.root.traverse(o=>{if(o.name===part.name)candidates.push(o)});const b=candidates[index],mesh=b.children.find(child=>child.isMesh);assert.ok(mesh,part.path)
   assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),part.polygons.flatMap(face=>face.positions.map(Math.fround)))
   assert.deepEqual(Array.from(mesh.geometry.attributes.uv.array),part.polygons.flatMap(face=>face.uv.map((v,i)=>Math.fround(i%2?1-v:v))))
  }}
  for(const path of actor.assetInfo.sourcePaths){const bytes=await reader.bytes(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),pack.files[path].sha256)}
  const resources=new Set();actor.root.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material){resources.add(o.material);if(o.material.map)resources.add(o.material.map)}})
  let disposed=0;for(const r of resources)r.addEventListener('dispose',()=>disposed++)
  actor.dispose();actor.dispose();assert.equal(disposed,resources.size);assert.equal(actor.root.children.length,0)
 }
})

for(const r of reference.cases)test(`unaltered original setupAnim bytecode comparison: ${r.type} ${r.water?'water':'land'}`,async()=>{
 let leaf=r.type.startsWith('pufferfish')?'pufferfish':r.type.startsWith('tropical_fish')?'tropical_fish':r.type.startsWith('axolotl')?'axolotl':r.type
 const metadata=[]
 if(leaf==='pufferfish')metadata.push(entry(17,'int',r.type.endsWith('small')?0:r.type.endsWith('medium')?1:2))
 if(leaf==='tropical_fish')metadata.push(entry(17,'int',r.type.endsWith('large')?1:0))
 if(leaf==='turtle')metadata.push(entry(18,'boolean',true),entry(22,'boolean',true))
 if(r.type.endsWith('dead'))metadata.push(entry(18,'boolean',true))
 const e=entity('minecraft:'+leaf,metadata);motionFor(e,r.water)
 e.motion={...e.motion,tick:5,onGround:!r.water,walk:{position:1.05,speed:.4,speedOld:.4},aquatic:{...e.motion.aquatic,tail:.7,tailOld:.7,spikes:.4,spikesOld:.4,tentacleAngle:.42,tentacleAngleOld:.42}}
 if(r.type.endsWith('still'))e.motion.walk={position:.75,speed:0,speedOld:0}
 const actor=await createNativeEntityActor(reader,e,{loadTexture:decode});actor.update(e,1012.5)
 for(const [name,expected]of Object.entries(r.bones)){
  if(['body','egg_belly'].includes(name)&&leaf==='turtle')continue
  const b=bone(actor,name)
  const axes=leaf==='cod'||leaf==='salmon'||leaf==='tadpole'||leaf==='tropical_fish'?[1]:leaf==='pufferfish'?[2]:leaf.endsWith('squid')?[0]:leaf.endsWith('guardian')?(name==='head'?[0,1]:name.startsWith('tail')?[1]:[]):[0,1,2]
  if(leaf==='dolphin'&&name!=='body'&&name!=='tail'&&name!=='tail_fin')continue
  for(const i of axes)close(b.rotation[['x','y','z'][i]],expected[i],`${r.type}:${name}:${i}`)
  if(leaf.endsWith('guardian')&&name.startsWith('spike'))for(let i=0;i<3;i++)close(b.position[['x','y','z'][i]],expected[i+3],name,2e-6)
  if(leaf==='axolotl'&&name==='body')close(b.position.y,expected[4],'axolotl body y',2e-6)
 }
 actor.dispose()
})

test('water uses original height/bounds and loaded border, dry or missing are distinct, scaled bounds are real',()=>{
 const e=entity();e.position.y=64.9
 assert.equal(nativeAquaticEnvironment(e,p=>p.y===64?water:air).inWater,false)
 e.position.y=64.8;assert.equal(nativeAquaticEnvironment(e,p=>p.y===64?water:air).inWater,true)
 assert.equal(nativeAquaticEnvironment(e,()=>null).available,false)
 assert.equal(nativeAquaticEnvironment(e,()=>air).inWater,false)
 e.renderScale={value:2,source:'received_native_entity_update_attributes'};close(nativeAquaticDimensions(e).width,1,'received scale')
 assert.equal(nativeAquaticEnvironment(e,()=>air).dimensions.scale,2)
 const fake={...e,onGround:false};assert.equal(nativeAquaticEnvironment(fake,()=>air).inWater,false)
})

test('typed variant serializers, missing data and malformed real metadata have no guessed substitutes',async()=>{
 assert.throws(()=>nativeAquaticState(entity('minecraft:pufferfish',[entry(17,'boolean',true)])),/SERIALIZER/)
 assert.throws(()=>nativeAquaticState(entity('minecraft:axolotl',[entry(17,'int',NaN)])),/METADATA_INVALID/)
 assert.throws(()=>nativeAquaticState(entity('minecraft:tropical_fish',[entry(17,'int',0x10000000)])),/VARIANT_UNSUPPORTED/)
 const e=entity();e.motion=createNativeEntityMotion(e).current();const actor=await createNativeEntityActor(reader,e,{loadTexture:decode});assert.ok(actor.assetInfo.issues.includes('NATIVE_AQUATIC_WATER_OCCUPANCY_UNAVAILABLE'));assert.equal(actor.root.userData.nativeAquatic.animationAvailable,false)
 assert.throws(()=>actor.update({...e,motion:{...e.motion,aquatic:{...e.motion.aquatic,tail:NaN}}},1000),/MOTION_UNAVAILABLE/)
 assert.throws(()=>actor.update({...e,uuid:'other'},1000),/IDENTITY_MISMATCH/);actor.dispose()
})

test('axolotl variants, three puffer sizes and all12 tropical patterns use actual selectors/dyes',async()=>{
 for(let variant=0;variant<5;variant++){const e=entity('minecraft:axolotl',[entry(17,'int',variant)]);motionFor(e);const a=await createNativeEntityActor(reader,e,{loadTexture:decode});assert.ok(a.assetInfo.sourcePaths.some(p=>p.endsWith(`axolotl_${['lucy','wild','gold','cyan','blue'][variant]}.png`)));a.dispose()}
 for(let shape=0;shape<2;shape++)for(let pattern=0;pattern<6;pattern++){
  const e=entity('minecraft:tropical_fish',[entry(17,'int',(14<<24)|(11<<16)|(pattern<<8)|shape)]);motionFor(e);const a=await createNativeEntityActor(reader,e,{loadTexture:decode});assert.ok(a.assetInfo.sourcePaths.some(p=>p.endsWith(`tropical_${shape?'b':'a'}_pattern_${pattern+1}.png`)));const colors=[];a.root.traverse(o=>{if(o.isMesh&&!colors.includes(o.material))colors.push(o.material)});close(colors[0].color.r,60/255,'blue dye red');close(colors[1].color.r,176/255,'red dye red');a.dispose()
 }
})

test('common six use actual hurt/death/swing counters and remain until received removal; aquatic epoch/UUID lifecycle',async()=>{
 for(const name of ['pig','cow','chicken','sheep','slime','villager']){
  const e=entity('minecraft:'+name),tracker=motionFor(e);e.cues=[{sequence:1,kind:'hurt_animation'},{sequence:2,kind:'animation',code:0},{sequence:3,kind:'entity_status',code:3}];tracker.observe(e,'hurt_animation');e.motion=tracker.tick(e,1050);e.motion=tracker.tick(e,1100)
  const a=await createNativeEntityActor(reader,e,{loadTexture:decode});a.update(e,1125);assert.equal(a.root.visible,true);assert.equal(a.root.userData.nativeLiving.deathTime,2);assert.equal(a.root.userData.nativeLiving.hurtTime,8);assert.ok(a.root.userData.nativeLiving.attackAnim>0)
  const shader={uniforms:{},fragmentShader:'#include <map_fragment>'};let mat;a.root.traverse(o=>{if(o.isMesh&&!mat)mat=o.material});mat.onBeforeCompile(shader);close(shader.uniforms.nativeHurt.value,77/255,'original hurt overlay');a.dispose()
 }
 const layer=new NativeEntityLayer(reader,{createActor:(reader,e)=>createNativeEntityActor(reader,e,{loadTexture:decode}),now:()=>1000}),e=entity('minecraft:axolotl');motionFor(e)
 layer.stage({available:true,epoch:1,entities:[e]});await finish(layer);const first=layer.actors.get(12).actor
 layer.stage({available:true,epoch:1,entities:[{...e,metadata:[entry(18,'boolean',true)]}]});await finish(layer);assert.equal(layer.actors.get(12).actor,first,'pose updates preserve original per-entity rotation map')
 layer.stage({available:true,epoch:2,entities:[{...e,uuid:'other'}]});await finish(layer);assert.notEqual(layer.actors.get(12).actor,first);assert.equal(first.root.children.length,0)
 layer.stage({available:true,epoch:2,entities:[]});await finish(layer);assert.equal(layer.actors.size,0);layer.dispose()
})

test('intentional NoopRenderer returns no mesh and reports independently from unsupported actors',async()=>{
 const layer=new NativeEntityLayer(reader,{createActor:(r,e)=>createNativeEntityActor(r,e,{loadTexture:decode})})
 layer.stage({available:true,epoch:1,entities:NATIVE_NO_MESH_TYPES.map((name,i)=>({...entity(name),entityId:i}))});await finish(layer)
 assert.equal(layer.diagnostics().intentionalNoMesh,3);assert.equal(layer.diagnostics().rendered,0);assert.equal(layer.failures.size,0);layer.dispose()
})

test('native packet orchestrator applies typed metadata/scale, rejects stale sequence, keeps water unknown until loaded',()=>{
 const world=new NativeWorldState({states:new Map([[1,air],[2,water]]),registrySha256:'a'.repeat(64),entityRegistry:new Map([[20,'minecraft:cod']]),entityRegistrySha256:'b'.repeat(64),resolveDimension:()=>({name:'minecraft:overworld',minY:0,height:256}),simplifyNBT:x=>x,now:()=>1000})
 let sequence=0;const packet=(name,params)=>world.handle({registrySha256:'a'.repeat(64),sequence:++sequence,name,params})
 packet('login',{});packet('spawn_entity',{entityId:12,objectUUID:entity().uuid,type:20,x:4.5,y:64,z:4.5,yaw:0,pitch:0,headPitch:0,velocity:{x:800,y:0,z:0}})
 assert.equal(world.entitySnapshot().entities[0].motion.aquaticEnvironment.available,false)
 packet('entity_update_attributes',{entityId:12,properties:[{key:'generic.scale',value:2,modifiers:[{uuid:'test',amount:.5,operation:2}]}]});world.tickEntities();const e=world.entitySnapshot().entities[0];assert.equal(e.renderScale.value,3);assert.equal(e.motion.aquaticEnvironment.dimensions.scale,3)
 packet('entity_destroy',{entityIds:[12]});assert.equal(world.entitySnapshot().entities.length,0)
 world.handle({registrySha256:'a'.repeat(64),sequence:1,name:'entity_destroy',params:{entityIds:[12]}});assert.equal(world.entitySnapshot().reason,'NATIVE_WORLD_PACKET_SEQUENCE_OR_REGISTRY_MISMATCH')
})


test('actual water-to-land transition changes cod tail/flop; partial ticks cannot create connection ticks',async()=>{
 const e=entity();let wet=true;const tracker=createNativeEntityMotion(e,{environmentAt:(next,position)=>nativeAquaticEnvironment({...next,position},p=>wet&&p.y===64?water:air)})
 e.motion=tracker.tick(e,1050);const a=await createNativeEntityActor(reader,e,{loadTexture:decode});a.update(e,1075);const wetTail=bone(a,'tail_fin').rotation.y
 wet=false;e.motion=tracker.tick(e,1100);a.update(e,1125);const dryTail=bone(a,'tail_fin').rotation.y
 assert.notEqual(wetTail,dryTail);close(a.root.children[0].children[0].rotation.z,Math.PI/2,'cod land flop')
 const tick=e.motion.tick;a.update(e,999999);assert.equal(e.motion.tick,tick);a.dispose()
 const buffer=new NativeEntityPresentation(200),first=entity();motionFor(first);const next={...first,position:{...first.position,x:5.5},motion:{...first.motion,position:{...first.position,x:5.5},bodyYaw:20}}
 buffer.push(first,1000);buffer.push(next,1200);const displayed=buffer.sample(next,1300);close(displayed.position.x,5,'aquatic buffered position');assert.equal(displayed.motion.walk,undefined)
})

test('squid original client phase clamps until actual status19; guardian target clocks reset on real metadata',()=>{
 const squid=entity('minecraft:squid'),m=motionFor(squid)
 for(let i=1;i<=100;i++)squid.motion=m.tick(squid,1000+i*50)
 close(squid.motion.aquatic.tentacle,Math.fround(Math.PI*2),'squid client clamp')
 squid.cues=[{sequence:5,kind:'entity_status',code:19}];m.observe(squid,'entity_status');assert.equal(m.current().aquatic.tentacle,0)
 squid.motion=m.tick(squid,6050);assert.ok(squid.motion.aquatic.tentacle>0);assert.ok(squid.motion.aquatic.tentacle<.21)
 for(const leaf of ['guardian','elder_guardian']){
  const e=entity('minecraft:'+leaf,[entry(17,'int',44)]),t=motionFor(e)
  for(let i=1;i<=100;i++)e.motion=t.tick(e,1000+i*50)
  assert.equal(e.motion.aquatic.attackTime,leaf==='guardian'?80:60)
  e.metadata=[entry(17,'int',45)];t.observe(e,'entity_metadata');assert.equal(t.current().aquatic.attackTime,0)
 }
 for(const [y,x]of [[.1,.2],[-.4,.5],[.1,-.7],[0,0]])assert.ok(Math.abs(originalAtan2(y,x)-Math.atan2(y,x))<.0001)
})

test('guardian beam uses real target bounds and original fullbright UV/color quads; unknown target is specific',async()=>{
 const guardian=entity('minecraft:guardian',[entry(17,'int',13)]),target={...entity('minecraft:cod'),entityId:13,position:{x:6.5,y:65,z:7.5}}
 motionFor(guardian);motionFor(target);guardian.motion.aquatic.attackTime=40
 const a=await createNativeEntityActor(reader,guardian,{loadTexture:decode});a.update(guardian,1000,{entities:new Map([[13,target]])})
 const beam=a.root.children.find(o=>o.isMesh);assert.equal(beam.visible,true);assert.equal(beam.geometry.attributes.position.count,12);assert.equal(beam.geometry.index.count,18)
 const color=beam.geometry.attributes.color.array;close(color[0],111/255,'beam red');close(color[1],79/255,'beam green');close(color[2],112/255,'beam blue')
 assert.equal(beam.material.alphaTest,.1);assert.equal(beam.material.isMeshBasicMaterial,true)
 a.update(guardian,1000,{entities:new Map([[13,{...target,uuid:'reused'}]])});assert.equal(beam.visible,false);assert.ok(a.assetInfo.issues.includes('NATIVE_GUARDIAN_TARGET_IDENTITY_CHANGED'))
 a.update(guardian,1000,{entities:new Map()});assert.equal(beam.visible,false);assert.ok(a.assetInfo.issues.includes('NATIVE_GUARDIAN_BEAM_TARGET_BOUNDS_UNAVAILABLE:13'));assert.ok(!a.assetInfo.issues.includes('NATIVE_GUARDIAN_TARGET_IDENTITY_CHANGED'),'a missing target is not proof of UUID reuse');a.dispose()
})

test('old epoch and revision cannot resurrect reused native entity IDs',async()=>{
 const layer=new NativeEntityLayer(reader,{createActor:(r,e)=>createNativeEntityActor(r,e,{loadTexture:decode})}),e=entity();motionFor(e)
 layer.stage({available:true,epoch:3,revision:8,entities:[e]});await finish(layer);const a=layer.actors.get(12).actor
 layer.stage({available:true,epoch:2,revision:99,entities:[]});await finish(layer);assert.equal(layer.actors.get(12).actor,a)
 layer.stage({available:true,epoch:3,revision:7,entities:[]});await finish(layer);assert.equal(layer.actors.get(12).actor,a);layer.dispose()
})


test('missing water does not suppress independent original fin/velocity animations',async()=>{
 for(const leaf of ['pufferfish','dolphin']){const e=entity('minecraft:'+leaf);e.motion=createNativeEntityMotion(e).current();e.motion.tick=5;const a=await createNativeEntityActor(reader,e,{loadTexture:decode});assert.equal(a.root.userData.nativeAquatic.animationInputs.waterOccupancy,'unavailable');assert.equal(a.root.userData.nativeAquatic.animationAvailable,true);assert.ok(Math.abs(bone(a,leaf==='dolphin'?'tail':'right_fin').rotation[leaf==='dolphin'?'x':'z'])>0);a.dispose()}
})
