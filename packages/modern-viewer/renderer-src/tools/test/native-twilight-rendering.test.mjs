import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import * as THREE from 'three';
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js';
import {loadTwilightLayers,createNativeTwilightActor} from '../../src/native-viewer/native-twilight-actors.js';
import {createOriginalModelLayer} from '../../src/native-viewer/native-original-model-layers.js';
import {nativeTwilightMenuLayout} from '../../src/native-viewer/native-twilight-menu.js';
import {prepareNativeTwilightFlask} from '../../src/native-viewer/native-twilight-items.js';
import {parseNativeItemStack} from '../../src/native-viewer/native-item-stack.js';
import {prepareNativeBlockItemIcon,prepareNativeBlockGuiPlan,buildNativeBlockItemObject,disposeNativeBlockItemObject} from '../../src/native-viewer/native-block-item-icons.js';
const uuid='12345678-1234-4234-8234-123456789abc';
test('uncrafting real inventory and recipe ghosts remain distinct and account bound',()=>{
  const menu={playerUuid:uuid,windowId:2,stateId:0,menuType:'twilightforest:uncrafting',slots:Array.from({length:56},(_,slot)=>({slot,item:null}))};
  const layout=nativeTwilightMenuLayout(menu,uuid);assert.equal(layout.slots.length,47);assert.equal(layout.ghosts.length,9);assert.equal(layout.costs.available,false);
  assert.deepEqual(layout.slots.find(s=>s.row.slot===47),{row:menu.slots[47],x:8,y:142,role:'inventory'});
  assert.throws(()=>nativeTwilightMenuLayout(menu,uuid.replace('1234','4321')),/IDENTITY/);
  assert.throws(()=>nativeTwilightMenuLayout({...menu,slots:menu.slots.slice(1)},uuid),/LAYOUT/);
});
const root=process.env.TWILIGHT_NATIVE_ASSETS;
test('pinned original Twilight bake preserves every exported geometry and Naga body identity',{skip:!root},async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(root,'native-assets.json'))),reader=new NativeAssetReader(manifest,p=>fs.readFile(path.join(root,p))),data=await loadTwilightLayers(reader),material=new THREE.MeshBasicMaterial();
  let faces=0;try{for(const [key,definition]of Object.entries(data.layers)){
    const model=createOriginalModelLayer(data,key,material);
    for(const part of definition.parts){const bone=model.bones.get(part.path);assert.deepEqual(bone.position.toArray(),part.pivot);for(const mesh of bone.children.filter(c=>c.isMesh)){
      assert.deepEqual([...mesh.geometry.attributes.position.array],part.polygons.flatMap(f=>f.positions).map(Math.fround));faces+=part.polygons.length;
    }}model.dispose();
  }}finally{material.dispose()}
  assert.equal(Object.keys(data.layers).length,100);assert(faces>1000);assert(Object.keys(data.unavailable).length>0);
  const motion={source:'same_connection_entity_ticks',tickMs:50,sampledAt:0,bodyYaw:0,position:{x:1,y:64,z:2},previous:{bodyYaw:0,position:{x:0,y:64,z:2}},twilight:{nagaRed:0},living:{hurtTime:0,deathTime:0}};
  const entity={entityId:1,uuid,name:'twilightforest:naga',metadata:[],motion};
  const actor=await createNativeTwilightActor(reader,entity,{loadTexture:async bytes=>new THREE.Texture({width:bytes[16]*16777216+bytes[17]*65536+bytes[18]*256+bytes[19],height:bytes[20]*16777216+bytes[21]*65536+bytes[22]*256+bytes[23]})});
  assert.equal(actor.root.position.x,1);
  const multipart={source:'same_connection_twilight_multipart_packet',sourceJarSha256:data.sourceJarSha256,parentUuid:uuid,observedAt:0,parts:[{entityId:2,position:{x:5,y:64,z:6},yaw:30,pitch:10,metadata:[]}]};
  actor.update({...entity,multipart},50);assert.equal(actor.root.userData.nativeLiving.multipartParts,1);assert.deepEqual(actor.root.children[1].position.toArray(),[4,0,4]);
  assert.throws(()=>actor.update({...entity,uuid:'other'},50),/IDENTITY/);
  actor.update(entity,50);assert.equal(actor.root.userData.nativeLiving.multipartParts,0);actor.dispose();assert.equal(actor.root.children.length,0);
});
test('flask tint and dose selection follow original NeoForge unbounded property callback',{skip:!root},async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(root,'native-assets.json'))),reader=new NativeAssetReader(manifest,p=>fs.readFile(path.join(root,p)));
  for(const [doses,model]of [[0,'greater_potion_flask'],[1,'greater_flask_0'],[2,'greater_flask_1'],[3,'greater_flask_2']]){
    const id='twilightforest:greater_potion_flask',stack=parseNativeItemStack({name:id,count:1,snbt:`{id:"${id}",count:1,components:{"twilightforest:flask_contents":{potion:{potion:"minecraft:healing"},doses:${doses}}}}`});
    const result=await prepareNativeTwilightFlask(reader,stack);assert(result.model.sourcePaths.some(p=>p.endsWith('/'+model+'.json')));assert.equal(result.color>>>24,255);
  }
});

test('original translucent uncrafting icon retains source geometry and only accepts its exact full-bright light override',{skip:!root},async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(root,'native-assets.json'))),reader=new NativeAssetReader(manifest,p=>fs.readFile(path.join(root,p)));
  const plan=await prepareNativeBlockItemIcon(reader,'twilightforest:uncrafting_table');
  assert.equal(plan.translucentCull,true);assert.equal(plan.model.render_type,'minecraft:translucent');
  const before=JSON.stringify(plan.model);
  assert(plan.model.elements.some(e=>Object.values(e.faces).some(f=>f.neoforge_data?.block_light===15)));
  assert(plan.faces.every(f=>f.nativeTranslucentCull===true));
  const textures=new Map(plan.texturePaths.map(p=>[p,new THREE.Texture()])),object=buildNativeBlockItemObject(plan,textures);
  for(const child of object.children){assert.equal(child.material.side,THREE.FrontSide);assert.equal(child.material.transparent,true)}
  disposeNativeBlockItemObject(object);for(const tex of textures.values())tex.dispose();assert.equal(JSON.stringify(plan.model),before);
  const changed=structuredClone(plan.model),face=changed.elements.flatMap(e=>Object.values(e.faces)).find(f=>f.neoforge_data);face.neoforge_data.block_light=14;
  await assert.rejects(prepareNativeBlockGuiPlan(reader,{name:plan.name,model:changed,evidence:plan.evidence}),/LIGHT_OVERRIDE_UNSUPPORTED/);
  await assert.rejects(prepareNativeBlockGuiPlan(reader,{name:'minecraft:crafting_table',model:plan.model,evidence:plan.evidence}),/RENDER_TYPE_UNSUPPORTED/);
});
