import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { PerspectiveCamera, Group, Vector3 } from 'three';
import { Vec3 } from 'vec3';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { normalizeCameraSettings, loadCameraSettings, CAMERA_SETTINGS_KEY } from '../../src/modern-viewer/camera-preferences.js';
import { installCameraSettings } from '../../src/modern-viewer/camera-settings.js';
import { Document, Element } from './fixtures/native-console-dom.mjs';
// camera-controls uses DOMRect even for its detached, no-element solver.
globalThis.DOMRect ??= class DOMRect { constructor(x=0,y=0,width=0,height=0){Object.assign(this,{x,y,width,height});} };

const directory=await mkdtemp(join(tmpdir(),'viewer-camera-'));
let CameraDirector,cameraCollisionDistance;
try {
  const outfile=join(directory,'camera.mjs');
  await build({entryPoints:[fileURLToPath(new URL('../../src/modern-viewer/camera-director.js',import.meta.url))],outfile,bundle:true,platform:'node',format:'esm'});
  ({CameraDirector,cameraCollisionDistance}=await import(pathToFileURL(outfile)));
} finally { await rm(directory,{recursive:true,force:true}); }
const settings=extra=>({...normalizeCameraSettings(null),mode:'follow',...extra});
const target=(extra={})=>({key:'self',position:{x:0,y:64,z:0},yaw:0,height:1.8,...extra});
const near=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('preferences clamp numeric ranges and reject unknown versions and modes',()=>{
  assert.deepEqual(loadCameraSettings({getItem:()=>'{bad'}),normalizeCameraSettings(null));
  const s=normalizeCameraSettings({version:1,mode:'script',fov:500,smoothTime:NaN,distance:-1});
  assert.equal(s.mode,'manual');assert.equal(s.fov,110);assert.equal(s.distance,2);assert.equal(s.smoothTime,.35);
});
test('actual camera-controls frames behind/in front of the actor and adapts to model height and FOV',()=>{
  const d=new CameraDirector();
  try {
    assert.equal(d.update(target(),normalizeCameraSettings(null),0),null);
    const back=d.update(target(),settings(),0);assert.ok(back.position.z>0);near(back.yaw,0);assert.ok(back.pitch<0);
    d.reset();const front=d.update(target(),settings({mode:'front'}),0);assert.ok(front.position.z<0);
    d.reset();const shoulder=d.update(target(),settings({mode:'shoulder'}),0);assert.ok(shoulder.position.x>.5);
    d.reset();const tall=d.update(target({height:6}),settings({fov:35}),0);assert.ok(tall.distance>back.distance*2);assert.equal(tall.fov,35);
    d.reset();const top=d.update(target({yaw:Math.PI/2}),settings({mode:'overhead'}),0);assert.ok(top.position.y-top.focus.y>Math.hypot(top.position.x,top.position.z)*2);
  } finally{d.dispose();}
});
test('stationary scan packets do not spin a follow camera; travel turns at a bounded speed',()=>{
  const d=new CameraDirector();
  try{
    const start=d.update(target(),settings(),0);
    for(let i=1;i<=60;i++)near(d.update(target({yaw:i*.2}),settings(),i*16).yaw,start.yaw);
    let previous=d.heading;
    for(let i=1;i<=60;i++){
      d.update(target({position:{x:i*.07,y:64,z:0}}),settings(),960+i*16);
      assert.ok(Math.abs(d.heading-previous)<=1.6*.016+1e-8);previous=d.heading;
    }
    assert.ok(d.heading<-1);
  }finally{d.dispose();}
});
test('target switches, long gaps and teleports snap to the new target without sweeping across terrain',()=>{
  const d=new CameraDirector();
  try{
    d.update(target(),settings(),0);
    const next=d.update(target({key:'other',position:{x:1000,y:80,z:1000},yaw:1}),settings(),16);
    assert.ok(next.position.x>990);near(next.yaw,1);
    near(d.update(target({key:'other',position:{x:1000,y:80,z:1000},yaw:2}),settings(),5000).yaw,2);
    near(d.update(target({position:{x:-1000,y:64,z:0},yaw:0}),settings(),5016).yaw,0);
  }finally{d.dispose();}
});
test('long orbit distances, unknown terrain and near-plane corners cannot cross a wall',()=>{
  const origin={x:.5,y:65.5,z:.5},direction={x:0,y:0,z:1};
  const wall=cameraCollisionDistance(origin,direction,12,{isSolid:(x,y,z)=>z===7});
  assert.ok(wall>5&&wall<6.5);
  const unknown=cameraCollisionDistance(origin,direction,12,{columnKnown:(x,z)=>z<5});assert.ok(unknown<4.5);
  const side=cameraCollisionDistance({x:.99,y:65.5,z:.5},direction,12,{isSolid:(x,y,z)=>x===1&&z===4});assert.ok(side<4);
  near(cameraCollisionDistance(origin,direction,12),12);
});
test('collision pulls in immediately and recovers gradually; disabling it is explicit',()=>{
  const d=new CameraDirector();
  try{
    const free=d.update(target(),settings({distance:10}),0);
    const wall=d.update(target(),settings({distance:10}),16,{isSolid:(x,y,z)=>z===4});
    assert.ok(wall.distance<4&&wall.occluded);
    const recovered=d.update(target(),settings({distance:10}),32);assert.ok(recovered.distance>wall.distance&&recovered.distance<free.distance);
    d.reset();assert.ok(d.update(target(),settings({distance:10,collision:false}),0,{isSolid:()=>true}).distance>10);
  }finally{d.dispose();}
});
test('cinematic shots finish and manual mode resumes; reset cancels a running shot',()=>{
  const d=new CameraDirector(),s=normalizeCameraSettings(null);
  try{
    d.startShot('orbit',0);assert.equal(d.update(target(),s,0).shot,'orbit');
    assert.equal(d.update(target(),s,14001).shot,null);assert.equal(d.update(target(),s,14017),null);
    d.startShot('pullback',15000);assert.equal(d.update(target(),s,15000).shot,'pullback');
    d.reset();assert.equal(d.update(target(),s,15016),null);
    assert.equal(d.update(target({position:{x:NaN,y:64,z:0}}),settings(),16000),null);
  }finally{d.dispose();}
});
test('camera UI persists settings, exposes shot actions and releases listeners on disposal',()=>{
  const document=new Document(),window=new Element('window',document),saved=new Map(),changes=[],shots=[];
  window.localStorage={setItem:(k,v)=>saved.set(k,v)};
  const ui=installCameraSettings({document,window,settings:settings(),onChange:s=>changes.push(s),onShot:s=>shots.push(s)});
  const mode=document.querySelector('select');mode.value='orbit';mode.dispatch('change');assert.equal(changes.at(-1).mode,'orbit');
  assert.equal(JSON.parse(saved.get(CAMERA_SETTINGS_KEY)).mode,'orbit');
  document.querySelectorAll('button')[0].dispatch('click');assert.deepEqual(shots,['orbit']);
  ui.manual();assert.equal(changes.at(-1).mode,'manual');ui.dispose();assert.equal(document.body.children.length,0);
  assert.equal(window.listeners.get('keydown').length,0);
});
test('continuous cinematic updates do not accumulate transition listeners',()=>{
  const d=new CameraDirector();
  try {
    for(let i=0;i<10000;i++)d.update(target(),settings({mode:'orbit'}),i*16);
    assert.equal(d.controls._listeners?.rest?.length??0,0);
    assert.ok(Number.isFinite(d.lastPose.position.x));
  }finally{d.dispose();}
});

test('client integration preserves floating world origin, model framing and configured vertical FOV',()=>{
  const source=readFileSync(new URL('../../src/modern-viewer/client.js',import.meta.url),'utf8');
  const functions=source.slice(source.indexOf('function applyDirectedCamera('),source.indexOf('function minimumThirdPersonOrbitDistance('));
  const d=new CameraDirector(),camera=new PerspectiveCamera(75,16/9,.1,1000),parent=new Group();parent.add(camera);
  const position={x:-13000.5,y:80,z:32000.5},origin={...position},world={camera,cameraWorldPos:{x:position.x,y:81.62,z:position.z},
    setCinimaticFov(value){camera.fov=value;camera.updateProjectionMatrix();},cameraCollisionBlockCache:{isSolidBlock:()=>false}};
  let frames=0;
  const context={Vec3,world,cameraDirector:d,cameraSettings:settings({fov:47,collision:false}),focusedCharacterId:null,
    pendingAvatarState:{entity:{uuid:'self',yaw:.5,height:1.8}},latestPosition:{yaw:.5},
    resolveObserverTargetPosition:()=>({position}),performance:{now:()=>0},cameraSettingsUi:{status(){}},
    document:{hidden:false},scheduleCortiCameraFrame:()=>frames++,dungeonRoomCoverCache:null,
    viewer:{playerState:{reactive:{eyeHeight:1.62}},inWorldRenderingConfig:{fov:75},
      updateCamera(p,yaw,pitch){Object.assign(origin,{x:p.x,y:p.y+1.62,z:p.z});Object.assign(world.cameraWorldPos,origin);
        parent.rotation.set(pitch,yaw,0,'YXZ');parent.updateMatrixWorld(true);}}};
  try {
    const apply=runInNewContext(`${functions}\napplyDirectedCamera`,context);assert.equal(apply(),true);
    near(origin.x,d.lastPose.position.x);near(origin.y,d.lastPose.position.y);near(origin.z,d.lastPose.position.z);
    const focus=d.lastPose.focus,projected=new Vector3(focus.x-origin.x,focus.y-origin.y,focus.z-origin.z).project(camera);
    near(projected.x,0);near(projected.y,0);assert.equal(camera.fov,47);assert.equal(context.viewer.inWorldRenderingConfig.fov,47);
    assert.equal(frames,1);assert.deepEqual(position,{x:-13000.5,y:80,z:32000.5});
    context.cameraDirector=null;assert.equal(apply(),false,'photo/OBS paths without a director stay untouched');
  }finally{d.dispose();}
});
