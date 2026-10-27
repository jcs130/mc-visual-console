import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {withIntentionalEmptyModels} from '../viewer-empty-models.mjs';
import {withViewerMissingMaterial} from '../viewer-missing-material.mjs';
import {patchOriginalWorldBanners} from '../minecraft-viewer-banner-patch.mjs';
import {originalWorldBannerMesh,originalWorldBannerLayers} from '../../src/modern-viewer/original-world-banners.js';
import {NATIVE_BANNER_COLORS} from '../../src/native-viewer/native-banner-data.js';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../../',import.meta.url));
const json=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url),'utf8'));
const source=await json('../../../asset-packs/java-1.21.1/render-assets/blockStatesModels.json');
const atlas=await json('../../../asset-packs/java-1.21.1/render-assets/blocksAtlases.json');
const {build}=require('esbuild');
const result=await build({stdin:{contents:"export {default} from 'mc-assets/dist/worldBlockProvider';",resolveDir:root},bundle:true,write:false,format:'cjs',platform:'node'});
const module={exports:{}};runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require,console,structuredClone});
const Block=require('prismarine-block')('1.21.1'),data=require('minecraft-data')('1.21.1');
const old=module.exports.default(withViewerMissingMaterial(source),atlas,'1.21.4');
const next=withIntentionalEmptyModels(source,'1.21.1',{originalBanners:true});
const provider=module.exports.default(withViewerMissingMaterial(next),atlas,'1.21.4');
const resolve=(p,name,properties)=>{const issues=[];const models=p.getAllResolvedModels0_1({name,properties},false,issues);return {issues,models};};
const faces=out=>out.models.flat(2).flatMap(m=>m.elements??[]).flatMap(e=>Object.values(e.faces??{}));

test('native zero-face wall states and early pitcher upper halves do not turn into missing-material cubes',()=>{
 let tested=0;
 for(const b of Object.values(data.blocksByName))for(let id=b.minStateId;id<=b.maxStateId;id++){
  const block=Block.fromStateId(id,0),props=block.getProperties();
  if(!(b.name.endsWith('_wall')&&props.up===false&&['north','east','south','west'].every(k=>props[k]==='none'))&&
    !(b.name==='pitcher_crop'&&props.half==='upper'&&props.age<3))continue;
  assert.ok(resolve(old,b.name,props).issues.length,b.name+': original failure');
  const fixed=resolve(provider,b.name,props);assert.deepEqual([...fixed.issues],[],b.name+':'+id);
  assert.ok(fixed.models.length);assert.equal(faces(fixed).length,0);tested++;
 }
 assert.ok(tested>=50,'cover every native wall type, not one hardcoded block');
 const stone=resolve(provider,'stone',{});assert.equal(faces(stone).length,faces(resolve(old,'stone',{})).length);
 assert.ok(faces(resolve(provider,'unknown',{})).every(f=>f.texture.debugName==='block/missing_texture'));
 assert.equal(withIntentionalEmptyModels(source,'1.20.6',{originalBanners:true}),source);
});

test('all 32 banners defer only their particle-only background model to the original world renderer',()=>{
 for(const color of Object.keys(NATIVE_BANNER_COLORS))for(const wall of [false,true]){
  const name=color+(wall?'_wall':'')+'_banner',props=wall?{facing:'north'}:{rotation:0};
  assert.ok(resolve(old,name,props).issues.length);
  const fixed=resolve(provider,name,props);assert.deepEqual([...fixed.issues],[]);assert.equal(faces(fixed).length,0);
 }
 const without=withIntentionalEmptyModels(source,'1.21.1');assert.equal(without.blockstates.latest.white_banner,source.blockstates.latest.white_banner);
 assert.equal(next.models.latest['block/stone'],source.models.latest['block/stone']);
});

test('modern 1.21.1 ominous patterns and base dyes stay exact; unknown or legacy metadata does not become a plain flag',()=>{
 const patterns=[['rhombus','cyan'],['stripe_bottom','light_gray'],['stripe_center','gray'],['border','light_gray'],['stripe_middle','black'],['half_horizontal','light_gray'],['circle','light_gray'],['border','black']].map(([pattern,color])=>({pattern:'minecraft:'+pattern,color}));
 const layers=originalWorldBannerLayers('white_wall_banner',{patterns});assert.equal(layers.length,9);
 assert.equal(layers[1].asset,'minecraft:rhombus');assert.equal(layers[1].tintColor,NATIVE_BANNER_COLORS.cyan);
 for(const [color,rgb]of Object.entries(NATIVE_BANNER_COLORS))assert.equal(originalWorldBannerLayers(color+'_banner',{})[0].tintColor,rgb);
 assert.throws(()=>originalWorldBannerLayers('white_banner',{patterns:[{pattern:'other:missing',color:'red'}]}),/UNSUPPORTED/);
 assert.throws(()=>originalWorldBannerLayers('white_banner',{Patterns:[{Pattern:'bs',Color:0}]}),/LEGACY/);
 assert.equal(originalWorldBannerLayers('white_banner',{patterns:Array(20).fill(patterns[0])}).length,17);
});

test('standing and wall banners use native full cube UVs, pole visibility and original poses in every rotation',()=>{
 for(const wall of [false,true])for(let rotation=0;rotation<(wall?4:16);rotation++){
  const texture=new THREE.Texture(),materialLight=[];
  const object=originalWorldBannerMesh({x:2,y:70,z:-1},rotation,wall,texture,(...a)=>materialLight.push(a),.2,.8,.7);
  object.updateMatrixWorld(true);
  assert.equal(materialLight.length,1);assert.equal(object.bannerMaterial,materialLight[0][0]);
  const meshes=[];object.traverse(m=>{if(m.isMesh)meshes.push(m);});assert.equal(meshes.length,wall?12:18);
  assert.deepEqual(object.userData.originalBanner.parts,wall?['bar','flag']:['pole','bar','flag']);
  assert.ok(Math.abs(object.rotation.y+rotation*(wall?Math.PI/2:Math.PI/8))<1e-12);
  assert.equal(object.position.y,70+(wall?-1/6:.5));
  assert.ok(meshes.every(m=>m.geometry.attributes.uv.count===4&&m.geometry.index.count===6&&m.material===object.bannerMaterial));
  const box=new THREE.Box3().setFromObject(object);assert.ok(!box.isEmpty()&&box.max.y-box.min.y>1.6);
  object.userData.originalBanner.native.dispose();object.bannerMaterial.dispose();texture.dispose();
 }
});

test('frozen renderer patch redirects all three real banner operations and rejects changed dependency anchors',async()=>{
 const source=await fs.readFile(require.resolve('minecraft-renderer/dist/minecraft-renderer.js'),'utf8');
 const fixed=patchOriginalWorldBanners(source,'1.21.1');assert.equal((fixed.match(/globalThis\.__MC_ORIGINAL_BANNERS__\)return/g)??[]).length,3);
 assert.equal(patchOriginalWorldBanners(source,'1.20.6'),source);
 assert.throws(()=>patchOriginalWorldBanners('changed dependency','1.21.1'),/ANCHOR_CHANGED/);
});
