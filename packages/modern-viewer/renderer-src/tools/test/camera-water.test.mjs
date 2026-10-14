import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {Scene,PerspectiveCamera,Color,Fog,Vector3} from 'three';
import {cameraWaterDepth,CameraWaterTransition,installCameraWater} from '../../src/modern-viewer/camera-water.js';
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
  assert.equal(world.cameraMedium.submerged,true);assert.ok(scene.fog.far<6);
  const client=readFileSync(new URL('../../src/modern-viewer/client.js',import.meta.url),'utf8');
  assert.match(client,/reactive.inWater = false/);assert.match(client,/installCameraWater\(globalThis.world/);
});
