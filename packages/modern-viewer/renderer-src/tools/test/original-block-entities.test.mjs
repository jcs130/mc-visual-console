import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {withOriginalBlockEntityModels,originalLayerBlockModel} from '../viewer-original-block-entities.mjs';
import {withViewerMissingMaterial} from '../viewer-missing-material.mjs';
import {decoratedPotPatternUnsupported,syncSpecialBlockMaterials,clearRemovedSpecialBlockMaterial,UNSUPPORTED_POT_PATTERN} from '../../src/modern-viewer/special-block-materials.js';
import {bakeFaces} from '../../src/native-viewer/model-loader.js';
const require=createRequire(import.meta.url);
const json=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url),'utf8'));
const original=await json('../../../asset-packs/vanilla-1.21.1/assets/minecraft/native/client-model-layers.json');
const source=await json('../../../asset-packs/java-1.21.1/render-assets/blockStatesModels.json');
const atlas=await json('../../../asset-packs/java-1.21.1/render-assets/blocksAtlases.json');
const next=withViewerMissingMaterial(await withOriginalBlockEntityModels(source,'1.21.1'));
const {build}=require('esbuild');
const bundle=await build({stdin:{contents:"export {default} from 'mc-assets/dist/worldBlockProvider';",resolveDir:fileURLToPath(new URL('../../',import.meta.url))},bundle:true,write:false,format:'cjs',platform:'node'});
const module={exports:{}};runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require,console,structuredClone});
const provider=module.exports.default(next,atlas,'1.21.4');
const Block=require('prismarine-block')('1.21.1'),data=require('minecraft-data')('1.21.1');

test('real particle-only pot and skull failure is repaired for every original rotation and wall facing',()=>{
  const old=module.exports.default(withViewerMissingMaterial(source),atlas,'1.21.4');
  for(const name of ['decorated_pot','skeleton_skull']){
    const issues=[];old.getAllResolvedModels0_1({name,properties:{}},false,issues);
    assert.ok(issues.some(s=>s.includes('No valid models')),name);
  }
  for(const name of ['decorated_pot','skeleton_skull','skeleton_wall_skull','wither_skeleton_skull','wither_skeleton_wall_skull','zombie_head','zombie_wall_head','creeper_head','creeper_wall_head']){
    const {minStateId,maxStateId}=data.blocksByName[name];
    for(let id=minStateId;id<=maxStateId;id++){
      const b=Block.fromStateId(id,0),issues=[];
      const models=provider.getAllResolvedModels0_1({name,properties:b.getProperties()},false,issues);
      assert.deepEqual([...issues],[],`${name}:${id}`);
      assert.ok(models.flat(2).some(m=>m.elements.length>0));
      assert.ok(models.flat(2).flatMap(m=>m.elements).flatMap(e=>Object.values(e.faces)).every(f=>!f.texture.debugName.includes('missing')));
    }
  }
});

test('original ModelPart polygons and UV survive conversion, including zero-thickness pot sides',()=>{
  for(const [key,transform]of [
    ['decorated_pot_base',new THREE.Matrix4()],['decorated_pot_sides',new THREE.Matrix4()],
    ['skeleton_skull',new THREE.Matrix4().makeTranslation(8,0,8).multiply(new THREE.Matrix4().makeScale(-1,-1,1))],
  ]){
    const model=originalLayerBlockModel(original,`minecraft:${key}#main`,'block/original',transform);
    const faces=bakeFaces(model);
    assert.equal(faces.length,{decorated_pot_base:16,decorated_pot_sides:4,skeleton_skull:6}[key]);
    assert.ok(faces.every(f=>f.uv.every(Number.isFinite)&&f.position.every(Number.isFinite)));
    if(key==='skeleton_skull')assert.deepEqual([0,1,2].map(i=>[Math.min(...faces.flatMap(f=>f.position.filter((_,j)=>j%3===i))),Math.max(...faces.flatMap(f=>f.position.filter((_,j)=>j%3===i)))]),[[-.25,.25],[-.5,0],[-.25,.25]]);
  }
  assert.equal(next.models.latest['block/viewer/original/decorated_pot'].textures.side,'block/entity/decorated_pot/decorated_pot_side');
});

test('other versions and unrelated original models stay unchanged',async()=>{
  assert.equal(await withOriginalBlockEntityModels(source,'1.20.6'),source);
  assert.equal(await withOriginalBlockEntityModels(source,'1.21.11'),source);
  assert.equal(next.models.latest['block/stone'],source.models.latest['block/stone']);
  assert.equal(source.models.latest['block/decorated_pot'].elements,undefined);
  assert.equal(next.blockstates.latest.player_head,source.blockstates.latest.player_head);
});

test('observed non-default pot patterns remain explicitly unavailable, never substituted with a blank pot',()=>{
  const plain={type:'compound',value:{LootTable:{type:'string',value:'example:pots'}}};
  const pattern=shards=>({type:'compound',value:{sherds:{type:'list',value:{type:'string',value:shards}}}});
  assert.equal(decoratedPotPatternUnsupported(plain),false);
  assert.equal(decoratedPotPatternUnsupported(pattern(Array(4).fill('minecraft:brick'))),false);
  assert.equal(decoratedPotPatternUnsupported(pattern(['minecraft:archer_pottery_sherd',...Array(3).fill('minecraft:brick')])),true);
  assert.equal(decoratedPotPatternUnsupported({sherds:['brick']}),true);
  const calls=[],world={resourcesManager:{currentResources:{version:'1.21.1'}},protocolCustomBlocks:new Map(),updateCustomBlock(chunk,key,value){calls.push([chunk,key,value]);this.protocolCustomBlocks.set(chunk,{...this.protocolCustomBlocks.get(chunk),[key]:value});}};
  const value=pattern(Array(4).fill('minecraft:archer_pottery_sherd'));
  syncSpecialBlockMaterials(world,{'-1,64,-1':value});syncSpecialBlockMaterials(world,{'-1,64,-1':value});
  assert.deepEqual(calls,[['-16,-16','-1,64,-1',UNSUPPORTED_POT_PATTERN]]);
  assert.equal(world.specialBlockMaterialDiagnostics.unsupportedPotPatterns,1);
  syncSpecialBlockMaterials(world,{'-1,64,-1':plain});
  assert.equal(calls[1][2],undefined);assert.equal(world.specialBlockMaterialDiagnostics.reason,null);
  syncSpecialBlockMaterials(world,{'-1,64,-1':value});
  clearRemovedSpecialBlockMaterial(world,{x:-1,y:64,z:-1},'decorated_pot');assert.equal(calls.length,3);
  clearRemovedSpecialBlockMaterial(world,{x:-1,y:64,z:-1},'air');assert.equal(calls.length,4);assert.equal(calls[3][2],undefined);
  world.protocolCustomBlocks.set('-16,-16',{'-1,64,-1':'server_original_model'});
  syncSpecialBlockMaterials(world,{'-1,64,-1':value});assert.equal(calls.length,4);
});
