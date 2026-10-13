import test from 'node:test';
import assert from 'node:assert/strict';
import {mapEntityKind,mapHeading,mapPixel,mapSpec,mapLayer,mapClusters,MinimapTerrain} from '../../src/modern-viewer/scene-minimap.js';
import {overviewSpec,overviewRegions,overviewRegionLabels,overviewLabelLayout} from '../../src/modern-viewer/overview-capture.js';

test('species, relationships and aggression are separate; scenery is not an NPC',()=>{
  assert.equal(mapEntityKind({name:'player',hostile:true,username:'enemy'}).kind,'player');
  assert.equal(mapEntityKind({name:'villager'}).kind,'npc');
  assert.equal(mapEntityKind({name:'wolf'}).kind,'neutral');
  assert.equal(mapEntityKind({name:'enderman',type:'hostile'}).kind,'neutral');
  assert.equal(mapEntityKind({name:'zombie',identityName:'居民'}).kind,'hostile');
  for(const name of ['armor_stand','item','oak_boat','text_display','arrow'])assert.equal(mapEntityKind({name}),null);
  assert.equal(mapEntityKind({name:'mod:boss',hostile:true}).kind,'unknown');
  const registry={wolf:{metadataKeys:['remaining_anger_time']},enderman:{metadataKeys:['creepy']}};
  assert.equal(mapEntityKind({name:'wolf',metadata:[400]},registry).kind,'danger');
  assert.equal(mapEntityKind({name:'wolf',metadata:[0]},registry).kind,'neutral');
  assert.equal(mapEntityKind({name:'enderman',metadata:[true]},registry).kind,'danger');
});
test('north-up projection preserves negative continuous positions, height and heading',()=>{
  const spec=mapSpec({x:-540.5,z:-439.5},48,384);
  assert.deepEqual(mapPixel({x:-540.5,z:-439.5},spec),[192,192]);
  assert.deepEqual(mapPixel({x:-539.5,z:-438.5},spec),[200,200]);
  assert.deepEqual(mapHeading(0),[-0,-1]);
  assert.ok(Math.abs(mapHeading(Math.PI/2)[0]+1)<1e-9);
  const groups=mapClusters([{id:1,name:'player',pos:{x:-540.5,y:64,z:-439.5}},{id:2,name:'villager',pos:{x:-530,y:70,z:-430}},
    {id:3,name:'zombie',pos:{x:-530.2,y:64,z:-430.2}}],{id:1,position:{x:-540.5,y:64,z:-439.5}},spec);
  assert.equal(groups.length,1);assert.equal(groups[0].members.length,2);assert.equal(groups[0].kind,'hostile');
  assert.equal(groups[0].members[0].deltaY,6);
});

test('local layer is selected only under measured cover, including negative heights',()=>{
  const self={pos:{x:-.5,y:-31.5,z:-2.5}};
  assert.deepEqual(mapLayer({top:(x,z)=>{assert.equal(x,-1);assert.equal(z,-3);return 64;}},self),{kind:'slice',minY:-40,maxY:-30.75});
  assert.equal(mapLayer({top:()=>-32},self),null);
  assert.equal(mapLayer({top:()=>null},self),null);
});
test('overlapping region and point captions reserve disjoint boxes and use Chinese labels',()=>{
  const spec=overviewSpec({attention:{regions:[{bounds:[-4,-4,4,4],label:'施工区域'},{bounds:[-4,-4,4,4],label:'重点'}]}},{x:0,z:0},1280,720);
  const regionLabels=overviewRegionLabels(spec,overviewRegions(spec),s=>s.length*15);
  const layout=overviewLabelLayout(spec,[{id:'P1',at:[0,64,0],pixel:[950,510],inFrame:true}],null,s=>s.length*15,regionLabels);
  const boxes=[...regionLabels,...layout.placed];
  assert.match(regionLabels[0].text,/关注1/);assert.match(layout.placed[0].text,/点1/);
  for(let i=0;i<boxes.length;i++)for(const b of boxes.slice(i+1)) {
    const a=boxes[i];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);
  }
});
test('offscreen pass restores camera, target, origin, hand, fog and viewport even after GPU failure',()=>{
  const document={createElement(){return {getContext:()=>({createImageData:()=>({data:new Uint8Array(16)})})};}};
  const terrain=new MinimapTerrain(document,2),camera={},fog={};
  const origin={x:2,y:3,z:4,update(x,y,z){Object.assign(this,{x,y,z});},toSceneX(x){return x-this.x;},toSceneY(y){return y-this.y;},toSceneZ(z){return z-this.z;}};
  let target=null,hand=true,passCount=0;const render=()=>{};
  const renderer={render,autoClear:false,getRenderTarget:()=>target,setRenderTarget:x=>{target=x;},getViewport:v=>v.set(1,2,3,4),getScissor:v=>v.set(5,6,7,8),getScissorTest:()=>true,setScissor(){},setViewport(){},setScissorTest(){},readRenderTargetPixels(){throw Error('GPU read failed');}};
  const world={renderer,camera,sceneOrigin:origin,cameraWorldPos:{x:2,y:3,z:4},scene:{fog},finishedChunks:{'0,0':true},worldSizeParams:{minY:-64,worldHeight:384},
    displayOptions:{inWorldRenderingConfig:{get showHand(){return hand;},set showHand(v){hand=v;}}},reactiveDebugParams:{smartCull:true},render(){passCount++;assert.equal(hand,passCount>1);if(passCount===1){assert.equal(this.camera.near,328-65.25);assert.equal(this.camera.far,328-56);}}};
  assert.throws(()=>terrain.capture(world,{...mapSpec({x:8,z:8},16,2),layer:{kind:'slice',minY:56,maxY:65.25}}),/GPU read failed/);
  assert.equal(passCount,2);assert.equal(world.camera,camera);assert.equal(world.scene.fog,fog);assert.equal(target,null);assert.equal(hand,true);
  assert.deepEqual([origin.x,origin.y,origin.z],[2,3,4]);assert.deepEqual(world.cameraWorldPos,{x:2,y:3,z:4});assert.equal(renderer.render,render);assert.equal(renderer.autoClear,false);
  terrain.dispose();
});
