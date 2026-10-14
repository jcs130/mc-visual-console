import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JavaVisualData,javaYaw,javaPitch} from '../host/java-visual-data.mjs';
const require=createRequire(import.meta.url),mc=require('minecraft-data')('1.20.6'),Chunk=require('prismarine-chunk')('1.20.6');
const uuid='11111111-1111-4111-8111-111111111111';
const env={protocol:'agent-mc-visual/v1',minecraftVersion:'1.20.6',uuid,server:'example.test',epoch:'world1',sequence:1,sampledAt:100,dimension:'minecraft:overworld'};
const reg={...env,registry:{blocks:[{id:0,name:'minecraft:air',properties:{}},{id:1,name:'minecraft:stone',properties:{}}],biomes:[{id:0,name:'minecraft:plains'}]}};
const decoder=()=>{const d=new JavaVisualData({uuid,server:'example.test:25565'});d.registry(reg);return d;};
const self={id:1,uuid,name:'minecraft:player',username:'Test',position:[-.5,64,-16.5],yaw:0,pitch:45,headYaw:90,width:.6,height:1.8,eyeHeight:1.62,pose:'STANDING',velocity:[.1,0,0],onGround:true,sneaking:false,sprinting:false,burning:false,equipment:[],hurtTime:0};
const frame={...env,sequence:2,self,columns:[{x:-1,z:-2,revision:3}],entities:[],time:6000,raining:false,thunder:0};
function column(){const c=new Chunk({minY:-16,worldHeight:32});c.setBlockStateId({x:15,y:-1,z:0},1);return {...env,sequence:3,x:-1,z:-2,revision:3,minY:-16,height:32,sections:c.dump().toString('base64'),skyLight:[Buffer.alloc(2048,255).toString('base64'),Buffer.alloc(2048,255).toString('base64')],blockLight:[Buffer.alloc(2048).toString('base64'),Buffer.alloc(2048).toString('base64')]};}
test('native column round trips negative positions, section heights and real state ID',()=>{
 const result=decoder().decodeChunk(column()),c=Chunk.fromJson(result.chunk);
 assert.equal(result.x,-16);assert.equal(result.z,-32);assert.equal(c.getBlockStateId({x:15,y:-1,z:0}),1);assert.equal(c.getBlockStateId({x:15,y:0,z:0}),0);
 assert.equal(c.getBiome({x:0,y:0,z:0}),mc.biomesByName.plains.id);assert.deepEqual(result.worldConfig,{minY:-16,worldHeight:32});
 assert.equal(c.getSkyLight({x:15,y:-1,z:0}),15);assert.equal(c.getBlockLight({x:15,y:-1,z:0}),0);
});
test('native registry remaps IDs by full names/properties, never assumes matching biome ordinal',()=>{
 const d=decoder();assert.equal(d.biomes.get(0),mc.biomesByName.plains.id);
 assert.notEqual(d.biomes.get(0),0);
});
test('unknown namespaced block fails instead of becoming vanilla stone',()=>{
 const d=decoder();d.registry({...reg,registry:{...reg.registry,blocks:[reg.registry.blocks[0],{id:1,name:'a_mod:stone',properties:{}}]}});
 assert.throws(()=>d.decodeChunk(column()),/UNSUPPORTED_BLOCK_STATE_1/);
});
test('UUID, server, version and epoch isolate actual player streams',()=>{
 const d=decoder();for(const patch of [{uuid:'22222222-2222-4222-8222-222222222222'},{server:'other.test'},{minecraftVersion:'1.21.1'},{epoch:'world2'}])assert.throws(()=>d.decodeChunk({...column(),...patch}));
});
test('native degrees convert to Mineflayer view radians without reversing pitch',()=>{
 assert.equal(javaYaw(0),Math.PI);assert.equal(javaYaw(180),0);assert.equal(javaPitch(90),-Math.PI/2);
});
test('movement emits deltas without rebuilding equipment or flashing damage',()=>{
 const d=decoder(),events=[];const emit=(...args)=>events.push(args);d.applyFrame(frame,emit);events.length=0;
 d.applyFrame({...frame,sequence:4,self:{...self,position:[.5,64,-16.5]}},emit);
 assert.equal(events.filter(e=>e[0]==='entity').length,0);assert.equal(events.filter(e=>e[0]==='playerEntity').length,0);assert.equal(events.filter(e=>e[0]==='entityMoved').length,1);assert.equal(events.filter(e=>e[0]==='entityDamage').length,0);
 assert.throws(()=>d.applyFrame(frame,emit),/STALE_FRAME/);
});
test('damage fires on actual hurt tick rising edge and not each red frame',()=>{
 const d=decoder(),events=[];const emit=(...args)=>events.push(args);d.applyFrame(frame,emit);
 for(const [sequence,hurtTime] of [[4,10],[5,9],[6,8],[7,10]])d.applyFrame({...frame,sequence,self:{...self,hurtTime}},emit);
 assert.equal(events.filter(e=>e[0]==='entityDamage').length,2);
});
test('out of view chunks unload; duplicate unchanged chunks do not transfer again',()=>{
 const d=decoder(),events=[];const emit=(...args)=>events.push(args);d.applyFrame(frame,emit);d.acceptChunk(column(),emit);
 assert.equal(d.applyFrame({...frame,sequence:4},emit).length,0);
 d.applyFrame({...frame,sequence:5,columns:[]},emit);assert.deepEqual(events.at(-1),['unloadChunk',{x:-16,z:-32}]);assert.equal(d.columns.size,0);
});
test('malformed height and light arrays fail before being emitted',()=>{
 const d=decoder();for(const patch of [{height:15},{height:4096},{minY:-63},{skyLight:[]},{blockLight:['AA==',null]}])assert.throws(()=>d.decodeChunk({...column(),...patch}));
});
test('missing native propagated light is unavailable, never guessed as black',()=>{
 assert.throws(()=>decoder().decodeChunk({...column(),skyLight:[null,null]}),/LIGHT_UNAVAILABLE/);
});
test('full native enum properties map only their canonical serialized names',()=>{
 const d=decoder();d.registry({...reg,registry:{...reg.registry,blocks:[{id:2961,name:'minecraft:chest',properties:{facing:'north',type:'single',waterlogged:'false'}}]}});
 assert.equal(d.blocks.get(2961),require('prismarine-block')('1.20.6').fromStateId(mc.blocksByName.chest.defaultState,0).stateId);
});
test('stale revision or removed column response cannot overwrite the current view',()=>{
 const d=decoder(),events=[];const emit=(...v)=>events.push(v);d.applyFrame(frame,emit);d.acceptChunk(column(),emit);
 d.applyFrame({...frame,sequence:4,columns:[{x:-1,z:-2,revision:5}]},emit);events.length=0;
 assert.equal(d.acceptChunk(column(),emit),null);assert.equal(events.length,0);
 d.applyFrame({...frame,sequence:5,columns:[]},emit);assert.equal(d.acceptChunk(column(),emit),null);
});
test('duplicate column indices are rejected',()=>{
 assert.throws(()=>decoder().applyFrame({...frame,columns:[frame.columns[0],frame.columns[0]]},()=>{}),/COLUMN_INVALID/);
});
test('native custom biome palette survives chunk serialization without guessing an equivalent biome',()=>{
 const d=decoder(),colors={grass:0x123456,foliage:0x654321,water:0x112233};
 d.registry({...reg,registry:{...reg.registry,biomes:[{id:0,name:'test:highlands',colors}]}});
 const result=d.decodeChunk(column()),json=JSON.parse(result.chunk),c=Chunk.fromJson(result.chunk);
 assert.equal(c.getBiome({x:0,y:0,z:0}),1024);assert.deepEqual(json.agentMcBiomes.entries,[{id:1024,name:'test:highlands',colors}]);
 d.registry({...reg,registry:{...reg.registry,biomes:[{id:0,name:'test:highlands'}]}});assert.throws(()=>d.decodeChunk(column()),/UNSUPPORTED_BIOME/);
});

test('native opaque signed ARGB color maps retain RGB channels; transparent and oversized values are rejected',()=>{
 const d=decoder();
 const registry=colors=>({...reg,registry:{...reg.registry,biomes:[{id:0,name:'test:color_map',colors}]}});
 d.registry(registry({grass:0xff123456|0,foliage:0xff654321|0,water:0x112233}));
 assert.deepEqual(JSON.parse(d.decodeChunk(column()).chunk).agentMcBiomes.entries[0].colors,{grass:0x123456,foliage:0x654321,water:0x112233});
 for(const grass of [0x1000000,0x80123456|0,NaN,0x100000000])assert.throws(()=>d.registry(registry({grass,foliage:0,water:0})),/BIOME_COLORS_INVALID/);
});
