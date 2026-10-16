import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {ItemAppearanceRegistry,itemCustomModelData,itemAppearanceKey,sha256Bytes,validateItemAppearanceManifest,loadItemAppearancePack,installItemAppearanceRenderer} from '../../src/modern-viewer/item-appearances.js';
import {createPaperHeldItem,PaperYsmHeldItems,paperYsmItemMount} from '../../src/modern-viewer/paper-ysm-items.js';
import {readItemAppearanceAssets,installItemAppearanceAssets,verifyItemAppearanceAssets,prepareItemAppearanceAssets} from '../item-appearance-assets.mjs';

const root=fileURLToPath(new URL('../../../asset-packs/qiandengji-items-1.20.6/',import.meta.url));
const pack=await readItemAppearanceAssets(root);
const item=(id=731001,base='iron_sword')=>({name:base,count:1,components:[{type:'custom_model_data',data:id}]});
const fetcher=async url=>{const name=url.slice('/item-appearances/'.length),bytes=pack.files.get(name);return bytes?new Response(bytes):new Response('',{status:404});};
const textureLoader=async()=>new THREE.Texture({width:32,height:32});
async function registry(){const result=new ItemAppearanceRegistry();await loadItemAppearancePack(result,{fetcher,textureLoader});return result;}

test('an uninstalled optional appearance pack makes no HTTP request and leaves reserved items unavailable',async()=>{
  const r=new ItemAppearanceRegistry();let requests=0;
  const loaded=await loadItemAppearancePack(r,{enabled:false,fetcher:async()=>{requests++;throw Error('Unexpected optional asset request');}});
  assert.equal(loaded,false);assert.equal(requests,0);
  assert.equal(r.reserved(item()),true);assert.equal(r.resolve(item()),null);assert.equal(r.stats().items,0);
});

test('LAN HTTP SHA-256 fallback matches Node for binary data and padding boundaries',()=>{
  for(const size of [0,1,3,55,56,63,64,65,511,4096,65536]){
    const bytes=Uint8Array.from({length:size},(_,n)=>(n*17+size)%256);
    assert.equal(sha256Bytes(bytes),createHash('sha256').update(bytes).digest('hex'));
  }
});
test('original component decides appearance; names, foreign materials and invalid numbers cannot impersonate it',async()=>{
  const r=await registry();
  assert.equal(r.resolve({...item(),customName:'改过名字'}).item.id,'frost_sword');
  assert.equal(r.resolve({name:'iron_sword',customName:'寒霜剑'}),null);
  assert.equal(r.resolve(item(731001,'stick')),null);
  assert.equal(itemCustomModelData({components:{'minecraft:custom_model_data':{floats:[731001]}}}),731001);
  for(const value of [-1,0.5,16777216,NaN,'731001'])assert.equal(itemCustomModelData({components:[{type:'custom_model_data',data:value}]}),null);
  assert.notEqual(itemAppearanceKey(item()),itemAppearanceKey(item(731002)));
  assert.equal(r.reserved(item(731999)),true);assert.equal(r.resolve(item(731999)),null);r.clear();
});
test('all five real models have original cuboid geometry, a single texture draw and independent first-person transforms',async()=>{
  const r=await registry();assert.equal(r.stats().items,5);
  const sizes=[];
  for(const row of pack.manifest.items){
    const stack=item(row.modelData,row.baseId.slice(10)),raw=r.createRaw(stack),right=r.create(stack,'firstperson'),left=r.create(stack,'firstperson','left');
    assert.equal(raw.root.children.length,1);assert.equal(raw.root.children[0].geometry.index.count,r.resolve(stack).model.elements.length*36);
    assert.equal(raw.root.userData.appearanceId,'qiandengji:'+row.id);
    assert.match(r.icon(stack),/^\/item-appearances\/icons\/.*\.png$/);
    assert.notDeepEqual(right.root.matrix.elements,left.root.matrix.elements);
    sizes.push(new THREE.Box3().setFromObject(raw.root).getSize(new THREE.Vector3()).toArray());
    raw.dispose();right.dispose();left.dispose();
  }
  assert.ok(sizes[0][1]>sizes[1][1],'frost sword is visibly longer than dagger');
  assert.ok(sizes[3][1]>sizes[0][1],'wand has its own longer silhouette');r.clear();
});
test('manifest paths, duplicate identities, oversized assets and wrong byte hashes fail explicitly',async()=>{
  for(const mutate of [m=>m.items[0].model='../private.json',m=>m.items.push(m.items[0]),m=>m.assets['models/frost_sword.json'].bytes=999999,m=>m.items[0].modelData=800000]){
    const m=structuredClone(pack.manifest);mutate(m);assert.throws(()=>validateItemAppearanceManifest(m),/ITEM_APPEARANCE/);
  }
  const r=new ItemAppearanceRegistry();
  await assert.rejects(()=>loadItemAppearancePack(r,{fetcher:async url=>url.endsWith('frost_sword.json')?new Response('{}'):fetcher(url),textureLoader}),/HASH_MISMATCH/);
  assert.equal(r.stats().items,0);
  assert.equal(await loadItemAppearancePack(r,{fetcher:async()=>new Response('',{status:404})}),false);
});
test('native hand pass retains swap and motion ownership; unknown reserved models cannot draw an ordinary sword',async()=>{
  const r=await registry();let delegated=0;
  const create=async()=>{delegated++;return {model:new THREE.Group(),type:'item'};},motion=()=>{};
  const world={getItemRenderData:()=>({modelName:'iron_sword'}),holdingBlock:{createItemModel:create,updateCameraGroup:motion},holdingBlockLeft:{createItemModel:create,updateCameraGroup:motion},entities:{getItemMesh(){delegated++;},addItemModel(){delegated++;}}};
  const restore=installItemAppearanceRenderer(world,r);
  assert.notEqual(world.getItemRenderData(item()).modelName,world.getItemRenderData(item(731002)).modelName);
  const right=await world.holdingBlock.createItemModel({fullItem:item()}),left=await world.holdingBlockLeft.createItemModel({fullItem:item()});
  assert.equal(right.model.userData.appearanceId,'qiandengji:frost_sword');assert.notDeepEqual(right.model.matrix.elements,left.model.matrix.elements);
  assert.equal(world.holdingBlock.updateCameraGroup,motion);
  const missing=await world.holdingBlock.createItemModel({fullItem:item(731999)});assert.equal(missing.model.children.length,0);assert.equal(delegated,0);
  await world.holdingBlock.createItemModel({fullItem:{name:'stone'}});assert.equal(delegated,1);
  const entity=new THREE.Group(),arm=new THREE.Group();arm.name='rightArm';entity.add(arm);
  world.entities.addItemModel(entity,'right',item(),true);assert.equal(arm.children.length,1);
  world.entities.addItemModel(entity,'right',item(731002),true);assert.equal(arm.children.length,1);
  assert.equal(arm.children[0].children[0].userData.appearanceId,'qiandengji:blink_dagger');
  restore();assert.equal(world.holdingBlock.createItemModel,create);r.clear();
});
test('YSM hand locators use the custom mesh; same-base switches and late loads do not leave duplicates',async()=>{
  const r=await registry(),a=await createPaperHeldItem({},item(),'right',{itemAppearances:r});
  assert.equal(a.root.userData.appearanceId,'qiandengji:frost_sword');
  assert.deepEqual(a.root.matrix.elements,paperYsmItemMount(r.resolve(item()).model.display.thirdperson_righthand,'right').elements,'already centred custom vertices use the same native locator as ordinary items');a.dispose();
  const bones=new Map(['RightHandLocator','LeftHandLocator'].map(name=>[name,new THREE.Group()])),held=new PaperYsmHeldItems({bones},{},{itemAppearances:r});
  held.apply([item(),null]);held.apply([item(731002),null]);await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(bones.get('RightHandLocator').children.length,1);assert.equal(bones.get('RightHandLocator').children[0].userData.appearanceId,'qiandengji:blink_dagger');
  held.apply([null,item(731004,'blaze_rod')]);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(bones.get('RightHandLocator').children.length,0);assert.equal(bones.get('LeftHandLocator').children.length,1);
  held.dispose();assert.equal(bones.get('LeftHandLocator').children.length,0);r.clear();
});

test('repeated hand updates reuse geometry; renderer disposal releases its private texture; reinstall does not stack hooks',async()=>{
  const r=await registry(),original=async()=>({model:new THREE.Group(),type:'item'});
  const world={getItemRenderData:()=>({}),holdingBlock:{createItemModel:original},entities:{getItemMesh(){},addItemModel(){}}};
  const firstRestore=installItemAppearanceRenderer(world,r);
  const first=await world.holdingBlock.createItemModel({fullItem:item()});
  for(let n=0;n<100;n++)assert.equal(await world.holdingBlock.createItemModel({fullItem:item()}),undefined);
  let released=0;const mesh=first.model.children[0];mesh.material.map.addEventListener('dispose',()=>released++);
  mesh.geometry.dispose();mesh.material.dispose();assert.equal(released,1);
  const secondRestore=installItemAppearanceRenderer(world,r);firstRestore();
  assert.notEqual(world.holdingBlock.createItemModel,original);
  secondRestore();secondRestore();assert.equal(world.holdingBlock.createItemModel,original);r.clear();
});

test('HUD refreshes when identically named swords change model and when the pack becomes available',async()=>{
  const r=await registry();
  const node=()=>({children:[],style:{},dataset:{},classList:{toggle(){}},append(child){this.children.push(child);},replaceChildren(){this.children=[];}});
  const elements=new Map(),root={querySelector(selector){if(!elements.has(selector))elements.set(selector,node());return elements.get(selector);}};
  const context={paperItemAppearances:r,document:{getElementById:()=>root,createElement:node},cortiDurability:()=>null,cortiAppendHeadFace(){},cortiAppendEnchantmentGlint(){},cortiAppendDurability(){}};
  const icons=await readFile(new URL('../minecraft-viewer-item-icon.js',import.meta.url),'utf8');
  // Load only the pure resolver; unrelated head/glint behavior has its own tests.
  runInNewContext(icons.slice(icons.indexOf('function cortiItemLabel'),icons.indexOf('function cortiAppendHeadFace')),context);
  runInNewContext(await readFile(new URL('../minecraft-viewer-hud.js',import.meta.url),'utf8'),context);
  const state=id=>({health:20,food:20,hotbar:[{item:{...item(id),customName:'同一个名字'}}]});
  const src=()=>elements.get('[data-corti-slots]').children[0].children[0].src;
  context.renderCortiSurvivalHud(state(731001));assert.equal(src(),'/item-appearances/icons/frost_sword.png');
  context.renderCortiSurvivalHud(state(731002));assert.equal(src(),'/item-appearances/icons/blink_dagger.png');
  r.clear();context.renderCortiSurvivalHud(state(731002));assert.equal(src(),undefined);
  await loadItemAppearancePack(r,{fetcher,textureLoader});context.renderCortiSurvivalHud(state(731002));assert.equal(src(),'/item-appearances/icons/blink_dagger.png');r.clear();
});
test('consumer install validates all bytes first and rejects overwrite or a mismatched native version',async()=>{
  const tmp=await mkdtemp(path.join(tmpdir(),'qiandengji-item-assets-'));
  try{
    await mkdir(path.join(tmp,'public'));await writeFile(path.join(tmp,'public/asset-source.json'),' {"minecraftVersion":"1.20.6"}');
    const installed=await installItemAppearanceAssets(root,tmp);assert.equal(installed.items,5);assert.equal(installed.files,16);
    assert.deepEqual(await verifyItemAppearanceAssets(tmp),installed);
    await assert.rejects(()=>installItemAppearanceAssets(root,tmp),/EEXIST/);
    await writeFile(path.join(tmp,'public/asset-source.json'),' {"minecraftVersion":"unsupported"}');
    await assert.rejects(()=>installItemAppearanceAssets(root,tmp),/VERSION_MISMATCH/);
  }finally{await rm(tmp,{recursive:true,force:true});}
});

test('installs the original integer-component item pack for 1.21.1 without rewriting its art or manifest',async()=>{
  const tmp=await mkdtemp(path.join(tmpdir(),'java-1211-item-assets-'));
  try{
    await mkdir(path.join(tmp,'public'));await writeFile(path.join(tmp,'public/asset-source.json'),' {"minecraftVersion":"1.21.1"}');
    const installed=await installItemAppearanceAssets(root,tmp);assert.equal(installed.items,5);
    for(const [name,bytes]of pack.files)assert.deepEqual(await readFile(path.join(tmp,'public/item-appearances',name)),bytes);
    assert.equal((await verifyItemAppearanceAssets(tmp)).manifestSha256,pack.manifestSha256);
    const r=await registry();const dagger=r.create(item(731002),'thirdperson');
    assert.equal(dagger.root.userData.appearanceId,'qiandengji:blink_dagger');dagger.dispose();r.clear();
  }finally{await rm(tmp,{recursive:true,force:true});}
});
for(const version of ['1.20.6','1.21.1'])
test('Qiandengji '+version+' preparation includes the original pack once while generic builds stay opt-in',async()=>{
  const tmp=await mkdtemp(path.join(tmpdir(),'qiandengji-item-prepare-'));
  try{
    await mkdir(path.join(tmp,'public'));await writeFile(path.join(tmp,'public/asset-source.json'),JSON.stringify({minecraftVersion:version}));
    assert.equal(await prepareItemAppearanceAssets(tmp),null);
    const first=await prepareItemAppearanceAssets(tmp,{qiandengji:true,source:root});assert.equal(first.items,5);
    assert.deepEqual(await prepareItemAppearanceAssets(tmp,{qiandengji:true,source:root}),first);
    const filename=path.join(tmp,'public/item-appearances/models/focus_wand.json');
    await writeFile(filename,'{}');
    await assert.rejects(()=>prepareItemAppearanceAssets(tmp,{qiandengji:true,source:root}),/HASH_MISMATCH/);
    assert.equal(await readFile(filename,'utf8'),'{}');
  }finally{
    const absolute=path.resolve(tmp);assert(absolute.startsWith(path.resolve(tmpdir())+path.sep));
    await rm(absolute,{recursive:true,force:true});
  }
});
