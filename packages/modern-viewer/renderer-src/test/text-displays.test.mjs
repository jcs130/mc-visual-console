import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {unzipSync,strFromU8} from 'fflate';
import minecraftData from 'minecraft-data';
import {Scene,PerspectiveCamera} from 'three';
import {decodeTextDisplay,textDisplayRuns} from '../host/text-display.mjs';
import {createViewerContentBridge} from '../host/viewer-content.mjs';
import {TextDisplayFont,textDisplayLayout} from '../src/modern-viewer/text-display-font.js';
import {TextDisplays} from '../src/modern-viewer/text-displays.js';
const registry=minecraftData('1.20.6'),root=createRequire(new URL('../../../../package.json',import.meta.url));
const nbt=text=>({type:'compound',value:{text:{type:'string',value:''},extra:{type:'list',value:{type:'compound',value:[{text:{type:'string',value:text},color:{type:'string',value:'white'}}]}}}});
const entity=(id=40,text='中文气泡\n继续探索\n▼')=>({id,name:'text_display',position:{x:1,y:67,z:0},yaw:Math.PI,pitch:0,
  metadata:{15:3,23:nbt(text),24:320,25:-1357505240,26:-1,27:1,10:5}});
const state=(extra={})=>({...decodeTextDisplay(entity(),registry),epoch:0,...extra});
function bridgeSetup() {
  const protocol=new EventEmitter(),bot=Object.assign(new EventEmitter(),{version:'1.20.6',registry,_client:protocol,entities:{},entity:{position:{x:0,y:64,z:0}}});
  protocol.write=()=>{throw Error('Read-only observer must not write');};
  let tick;const bridge=createViewerContentBridge(bot,{schedule:fn=>{tick=fn;return 1;},unschedule(){}});
  const spawn=id=>protocol.emit('spawn_entity',{entityId:id,type:registry.entitiesByName.text_display.id,x:1,y:67,z:0,yaw:0,pitch:0});
  const metadata=(id,text)=>protocol.emit('entity_metadata',{entityId:id,metadata:Object.entries(entity(id,text).metadata).map(([key,value])=>({key:Number(key),value}))});
  return {protocol,bot,bridge,spawn,metadata,tick:()=>tick()};
}

test('actual protocol 766 NBT components survive wire serialization before generic host depth truncation',()=>{
  const {createSerializer,createDeserializer}=createRequire(root.resolve('mineflayer'))('minecraft-protocol');
  const serializer=createSerializer({state:'play',version:'1.20.6',isServer:true}),parser=createDeserializer({state:'play',version:'1.20.6',isServer:false});
  const raw={entityId:40,metadata:[{key:23,type:'component',value:nbt('青禾：一起种田吧\n▼')},{key:26,type:'byte',value:-1}]};
  const decoded=parser.parsePacketBuffer(serializer.createPacketBuffer({name:'entity_metadata',params:raw})).data.params;
  const e=entity();e.metadata=Object.fromEntries(decoded.metadata.map(f=>[f.key,f.value]));
  const result=decodeTextDisplay(e,registry);assert.equal(result.runs.map(r=>r.text).join(''),'青禾：一起种田吧\n▼');assert.equal(result.opacity,255);
  assert.equal(registry.entitiesByName.text_display.width,0);assert.equal(registry.entitiesByName.text_display.height,0);
});
test('signed bytes, background alpha, centered billboard and explicit unsupported components are preserved',()=>{
  const result=decodeTextDisplay(entity(),registry);assert.equal(result.billboard,3);assert.equal(result.flags,1);assert.equal(result.opacity,255);assert.equal(result.background>>>24,175);
  const e=entity();e.metadata[26]=-128;assert.equal(decodeTextDisplay(e,registry).opacity,128);
  assert.equal(textDisplayRuns({text:'<img src=x onerror=bad()>',clickEvent:{action:'open_url',value:'bad'}})[0].text,'<img src=x onerror=bad()>');
  for(const component of [{translate:'chat.type.text'},{text:'secret',bold:true},{text:'x',font:'other:font'},{selector:'@a'},'x'.repeat(513)])assert.equal(textDisplayRuns(component),null);
  e.metadata[23]=nbt('x');e.metadata[13]={x:.5,y:0,z:0,w:.5};assert.equal(decodeTextDisplay(e,registry).unavailable,'rotation');
  assert.equal(decodeTextDisplay(entity(),{entitiesByName:{}}),null);
});
test('two action connections never share private NPC text, and one NPC may own independent display IDs',()=>{
  const a=bridgeSetup(),b=bridgeSetup(),events=[];a.bridge.subscribe((name,value)=>events.push({name,value}));
  a.spawn(40);a.metadata(40,'PRIVATE_ONE');a.spawn(41);a.metadata(41,'PRIVATE_TWO');
  assert.equal(a.bridge.stats().textDisplays,2);assert.equal(b.bridge.stats().textDisplays,0);
  const late=[];a.bridge.subscribe((name,value)=>late.push({name,value}));
  assert.equal(late.filter(e=>e.name==='textDisplay').length,2);assert.ok(late.some(e=>JSON.stringify(e).includes('PRIVATE_ONE')));
  a.protocol.emit('entity_destroy',{entityIds:[40]});const after=[];a.bridge.subscribe((name,value)=>after.push({name,value}));
  assert.equal(after.some(e=>JSON.stringify(e).includes('PRIVATE_ONE')),false);assert.equal(events.at(-1).value.delete,true);
  a.bot.emit('respawn');assert.equal(a.bridge.stats().textDisplays,0);assert.equal(events.at(-1).name,'contentReset');
  a.bridge.dispose();b.bridge.dispose();assert.deepEqual(a.protocol.eventNames(),[]);
});
test('destroy or reused numeric ID cannot replay a prior private body to reconnecting or stalled browsers',()=>{
  const s=bridgeSetup(),out=[];let writable=false;
  const socket=Object.assign(new EventEmitter(),{connected:true});socket.emit=(name,value)=>out.push({name,value});
  s.bridge.subscribeSocket(socket,{writable:()=>writable});s.spawn(40);s.metadata(40,'PRIVATE_OLD');s.metadata(40,'PRIVATE_NEW');
  s.protocol.emit('entity_destroy',{entityIds:[40]});writable=true;s.tick();
  assert.ok(out.some(e=>e.name==='textDisplay'&&e.value.delete));assert.ok(out.every(e=>!JSON.stringify(e).includes('PRIVATE_')));
  s.spawn(41);s.metadata(41,'SECRET');s.protocol.emit('spawn_entity',{entityId:41,type:registry.entitiesByName.zombie.id,x:1,y:67,z:0});
  assert.equal(s.bridge.stats().textDisplays,0);assert.equal(out.at(-1).value.delete,true);s.bridge.dispose();
});
test('late host bootstrap uses only current Mineflayer entity metadata and the cache remains bounded',()=>{
  const s=bridgeSetup();for(let id=0;id<100;id++){s.spawn(id);s.metadata(id,'text');}
  assert.equal(s.bridge.stats().textDisplays,64);assert.equal(s.bridge.stats().rejectedTextDisplays,36);s.bridge.dispose();
  const bot=Object.assign(new EventEmitter(),{version:'1.20.6',registry,_client:new EventEmitter(),entities:{40:entity()},entity:{position:{x:0,y:64,z:0}}});
  const bridge=createViewerContentBridge(bot,{schedule:()=>1,unschedule(){}});assert.equal(bridge.stats().cachedTextDisplays,1);bridge.dispose();
});

const assetRoot=fileURLToPath(new URL('../../asset-packs/java-1.20.6/public/',import.meta.url));
function originalFont() {
  const spec=JSON.parse(readFileSync(assetRoot+'text-display-font.json','utf8')),font=new TextDisplayFont();
  const provider=spec.providers.find(p=>p.type==='unihex');
  font.addHex(strFromU8(unzipSync(readFileSync(assetRoot+provider.url.slice(1)))[provider.entry]),provider.size_overrides);
  return font;
}
test('original 1.20.6 Unihex glyph pixels and override metrics support Chinese and the native downward pointer',()=>{
  const font=originalFont(),spec=font.glyph('萌');assert.equal(spec.width,16);assert.equal(spec.height,16);assert.equal(spec.advance,9);
  assert.ok(spec.mask.some(n=>n===255));assert.equal(font.glyph('萌'),spec);assert.ok(font.glyph('▼'));
  const display=state(),layout=textDisplayLayout(display,font);assert.equal(layout.lines.length,3);assert.ok(layout.width>0);font.dispose();
});
test('moving 16 displays reuses textures; replacement, destroy, world reset and disposal release GPU resources',()=>{
  let now=0;const scene=new Scene(),camera=new PerspectiveCamera(),origin={toSceneX:x=>x-100,toSceneY:y=>y-64,toSceneZ:z=>z};camera.position.set(-100,3,8);
  // Drawing surface is synthetic for this resource-lifecycle test; actual font pixels
  // and browser WebGL rendering are verified separately, without node-canvas binaries.
  const createCanvas=()=>({width:1,height:1,getContext:()=>({fillRect(){}})});
  const texts=new TextDisplays({getWorld:()=>({scene,camera,sceneOrigin:origin}),now:()=>now,createCanvas});
  texts.setFont(originalFont());texts.reset(0);for(let id=0;id<16;id++)assert.equal(texts.handle(state({id})),true);texts.tick();
  assert.equal(texts.stats().visible,16);assert.equal(texts.stats().textureUpdates,16);const entry=texts.instances.get(0);let released=0;entry.texture.addEventListener('dispose',()=>released++);
  for(let id=0;id<16;id++)texts.handle(state({id,position:{x:5,y:67,z:0}}));now=125;texts.tick();
  assert.equal(entry.root.position.x,-97);assert.equal(texts.stats().textureUpdates,16);assert.equal(entry.mesh.material.depthTest,true);
  texts.handle(state({id:0,runs:[{text:'圣愈术\n▼',color:'#ffffff'}]}));texts.tick();assert.equal(released,1);assert.equal(texts.stats().textureUpdates,17);
  texts.handle({schemaVersion:1,epoch:0,id:0,delete:true});assert.equal(texts.stats().tracked,15);
  texts.reset(1);assert.equal(texts.stats().tracked,0);assert.equal(texts.stats().visible,0);assert.equal(scene.children.length,0);
  assert.equal(texts.handle(state()),false);texts.dispose();
});
