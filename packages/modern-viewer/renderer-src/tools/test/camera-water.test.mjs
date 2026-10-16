import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {Scene,PerspectiveCamera,OrthographicCamera,Color,Fog,Vector3} from 'three';
import {cameraWaterDepth,CameraWaterTransition,installCameraWater,cameraWaterFogRange} from '../../src/modern-viewer/camera-water.js';
const air={name:'air'},water={name:'water',getProperties:()=>({level:0})};
test('eye height, partial flowing water, stacked water and missing geometry determine medium',()=>{
  assert.equal(cameraWaterDepth({x:0,y:64.95,z:0},()=>water)>0,true);
  assert.ok(cameraWaterDepth({x:0,y:64.95,z:0},(x,y)=>y===64?water:air)<0);
  assert.ok(cameraWaterDepth({x:0,y:64.2,z:0},(x,y)=>y===64?{...water,getProperties:()=>({level:7})}:air)<0);
  assert.equal(cameraWaterDepth({x:0,y:64.5,z:0},()=>null),null);
});
test('small surface oscillations do not toggle fog and entry/exit are gradual',()=>{
  const t=new CameraWaterTransition();t.update(-1,0);
  for(let i=1;i<60;i++)assert.equal(t.update(i%2?.01:-.01,i*16),0);
  const first=t.update(.3,960);assert.ok(first>0&&first<.15);
  for(let i=61;i<160;i++)t.update(.3,i*16);
  assert.ok(t.amount>.99);const exit=t.update(-1,2560);assert.ok(exit>.85&&exit<1);
  for(let i=161;i<250;i++)t.update(null,i*16);assert.equal(t.amount,0);
});
test('floating-origin observer eye above water stays clear while the actor is swimming',()=>{
  const scene=new Scene(),camera=new PerspectiveCamera();scene.add(camera);camera.position.set(0,5,3);
  scene.fog=new Fog(new Color(.7,.8,.9),.0025,128);scene.background=new Color(.7,.8,.9);
  const world={scene,camera,sceneOrigin:{toWorldX:x=>x-100,toWorldY:y=>y+64,toWorldZ:z=>z-100},
    playerStateReactive:{inWater:true,waterBreathing:false},skyboxRenderer:{}};
  let now=0;installCameraWater(world,(x,y)=>y<=64?water:air,()=>now);
  for(;now<1000;now+=16)scene.onBeforeRender(null,scene,camera);
  assert.equal(world.cameraMedium.submerged,false);assert.equal(scene.fog.far,128);
  camera.position.y=.5;
  for(;now<2000;now+=16){scene.fog=new Fog(new Color(.7,.8,.9),.0025,128);scene.onBeforeRender(null,scene,camera);}
  assert.equal(world.cameraMedium.submerged,true);assert.ok(scene.fog.far>=24&&scene.fog.far<25);
  const client=readFileSync(new URL('../../src/modern-viewer/client.js',import.meta.url),'utf8');
  assert.match(client,/reactive.inWater = false/);assert.match(client,/installCameraWater\(globalThis.world/);
});

test('water fog retains nearby surfaces instead of becoming an opaque blue wall after five blocks',()=>{
  assert.deepEqual(cameraWaterFogRange({observer:true,viewDistance:4}),{near:-8,far:64,visionKnown:true});
  assert.deepEqual(cameraWaterFogRange({observer:false}),{near:-8,far:24,visionKnown:false});
  assert.equal(cameraWaterFogRange({waterVision:.5}).far,48);
  assert.equal(cameraWaterFogRange({waterVision:1,viewDistance:2}).far,32);
  const scene=new Scene(),camera=new PerspectiveCamera();scene.add(camera);camera.position.y=64.5;
  const world={scene,camera,viewDistance:4,sceneOrigin:{toWorldX:x=>x,toWorldY:y=>y,toWorldZ:z=>z},
    playerStateReactive:{waterBreathing:false},skyboxRenderer:{}};
  let now=0;installCameraWater(world,()=>water,()=>now,{observer:true});
  for(;now<2000;now+=16){
    scene.fog=new Fog(new Color(.7,.8,.9),.0025,128);
    scene.onBeforeRender(null,scene,camera);
  }
  assert.ok(Math.abs(scene.fog.far-64)<.01);
  assert.ok(Math.abs(scene.fog.near-(-8))<.01);
  // The shader's linear distance factor at 12 blocks used to be 1. It
  // now preserves terrain texture rather than replacing it with fog RGB.
  const factor=(12-scene.fog.near)/(scene.fog.far-scene.fog.near);
  assert.ok(factor<.3);
  world.playerStateReactive.waterBreathing=true;
  scene.fog=new Fog(new Color(.7,.8,.9),.0025,128);scene.onBeforeRender(null,scene,camera);
  assert.ok(Math.abs(scene.fog.far-64)<.01,'breathing must not switch the observer fog to another arbitrary distance');
  assert.equal(world.cameraMedium.waterFog.biomeColourParityVerified,false);
});

test('an offscreen terrain camera does not change the live water transition or its diagnostics',()=>{
  const scene=new Scene(),camera=new PerspectiveCamera();scene.add(camera);camera.position.set(0,64.5,0);
  const world={scene,camera,sceneOrigin:{toWorldX:x=>x,toWorldY:y=>y,toWorldZ:z=>z},
    playerStateReactive:{waterBreathing:false},skyboxRenderer:{}};
  let now=100;const transition=installCameraWater(world,()=>water,()=>now);
  scene.onBeforeRender(null,scene,camera);const medium=world.cameraMedium,at=transition.at;
  const inset=new OrthographicCamera();inset.userData.offscreenTerrain=true;inset.position.y=328;
  now+=500;scene.onBeforeRender(null,scene,inset);
  assert.equal(world.cameraMedium,medium);assert.equal(transition.at,at);assert.equal(transition.submerged,true);
});
