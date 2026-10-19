import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectProxyModels,blockCatalogCoverage,atlasFaceUV} from '../../src/modern-viewer/voxel-proxy-catalog.mjs';
import {bakeFaces} from '../../src/native-viewer/model-loader.js';
const shape={elements:[{from:[0,0,0],to:[16,8,16],faces:{}}]};
test('state properties select the actual variant, including false boolean values',()=>{
 const d={lamp:{variants:{'lit=false':{model:shape},'lit=true':{model:{elements:[]}}}}};
 assert.equal(selectProxyModels(d,{name:'minecraft:lamp',properties:{lit:false}},{x:0,y:1,z:0}).models[0].model,shape);
 assert.throws(()=>selectProxyModels(d,{name:'minecraft:lamp',properties:{}},{}),/STATE_UNRESOLVED/);
});
test('mod namespaces cannot silently resolve to vanilla names',()=>{
 assert.throws(()=>selectProxyModels({lamp:{variants:{'':{model:shape}}}},{name:'mod:lamp',properties:{}},{}),/MODEL_MISSING/);
});
test('multipart models preserve each matching state part',()=>{
 const d={fence:{multipart:[{apply:{model:shape}},{when:{north:'true'},apply:{model:shape,y:90}}]}};
 assert.equal(selectProxyModels(d,{name:'minecraft:fence',properties:{north:true}},{x:0,y:0,z:0}).models.length,2);
 assert.equal(selectProxyModels(d,{name:'minecraft:fence',properties:{north:false}},{x:0,y:0,z:0}).models.length,1);
});
test('an explicitly empty multipart state does not invent geometry',()=>{
 const d={wall:{multipart:[{when:{up:'true'},apply:{model:shape}}]}};
 assert.deepEqual(selectProxyModels(d,{name:'minecraft:wall',properties:{up:false}},{x:0,y:0,z:0}).models,[]);
});
test('uncertified texture variation is an explicit opt-in approximation',()=>{
 const d={machine:{variants:{'':[{model:shape},{model:shape,y:180}]}}};
 assert.throws(()=>selectProxyModels(d,{name:'minecraft:machine',properties:{}},{x:0,y:0,z:0}),/SEED_UNVERIFIED/);
 assert.equal(selectProxyModels(d,{name:'minecraft:machine',properties:{}},{x:0,y:0,z:0},{allowUnverifiedTextureVariation:true}).exactSeed,false);
});
test('already cropped atlas UVs are not cropped twice',()=>{
 const v=atlasFaceUV({texture:{u:.25,v:.5,su:.125,sv:.25},uv:[.25,.75,.25,.25,.75,.25,.75,.75]});
 assert.deepEqual(v,[.25,.5,.25,.25,.375,.25,.375,.5]);
 assert.throws(()=>atlasFaceUV({texture:'missing',uv:[]}),/ATLAS_RECT_INVALID/);
});
test('registry coverage reports missing types rather than certifying scene parity',()=>{
 const r={schema:'agent-mc-block-registry/v1',minecraftVersion:'1.21.1',blocks:[{name:'minecraft:stone',minStateId:1,maxStateId:2},{name:'minecraft:water',minStateId:3,maxStateId:5}]};
 const c=blockCatalogCoverage(r,{stone:{}});
 assert.equal(c.registeredStates,5);assert.equal(c.mappedTypes,1);assert.deepEqual(c.missing,['minecraft:water']);assert.equal(c.registryIsNotAnExactSceneParityCertificate,true);
});
test('native texture resolution remains the default; compiled atlas access is explicit',()=>{
 const model={textures:{all:'minecraft:block/stone'},elements:[{from:[0,0,0],to:[16,16,16],faces:{up:{texture:'#all'}}}]};
 assert.equal(bakeFaces(model)[0].texture,'minecraft:block/stone');
 const rect={u:0,v:0,su:.1,sv:.1};model.elements[0].faces.up.texture=rect;
 assert.throws(()=>bakeFaces(model));
 assert.equal(bakeFaces(model,{}, {resolveTexture:(_,value)=>value})[0].texture,rect);
});
