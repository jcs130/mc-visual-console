import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import * as THREE from 'three';
import {createViewerYsmMotion} from '../../host/viewer-ysm-motion.mjs';
import {createPaperYsmActor,PaperYsmPlayers} from '../../src/modern-viewer/paper-ysm.js';
import {bundledYsmMotionInput} from '../../src/native-viewer/native-bundled-ysm-motion.js';

const uuid='00000000-0000-3000-8000-000000000001';
const encode=value=>({base64:Buffer.from(JSON.stringify(value)).toString('base64')});
const bundle={modelId:'look-test',assetSha256:'test',model:'model.json',animation:'animation.json',textures:{main:'texture.png'},files:{
  'ysm.json':encode({spec:2,properties:{free:true}}),
  'model.json':encode({format_version:'1.12.0','minecraft:geometry':[{description:{texture_width:16,texture_height:16},bones:[
    {name:'Root',pivot:[0,0,0]}, {name:'Head',parent:'Root',pivot:[0,24,0]},
    {name:'QueryProbe',parent:'Root',pivot:[0,24,0]}, {name:'RightArm',parent:'Root',pivot:[-5,22,0]}
  ]}]}),
  'animation.json':encode({format_version:'1.8.0',animations:{
    idle:{loop:true,bones:{}},walk:{loop:true,bones:{Root:{position:[0,1,0]}}},
    swing_hand:{animation_length:.375,bones:{RightArm:{rotation:[60,0,0]}}},
    parallel0:{bones:{QueryProbe:{rotation:['-ysm.head_pitch',0,0]}}}
  }}),'texture.png':{base64:''}
}};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('Paper observation and Mineflayer agree on left/right look and authored running bank at every heading',async()=>{
  const source=structuredClone(bundle);
  source.files['animation.json']=encode({format_version:'1.8.0',animations:{
    idle:{loop:true,bones:{}},run:{loop:true,bones:{Root:{rotation:[0,0,'0.4*ysm.head_yaw']}}}
  }});
  const actor=await createPaperYsmActor(source,'main',{loadTexture:async()=>new THREE.Texture({width:16,height:16})});
  const parent=new THREE.Group();parent.add(actor.root);
  try{
    let clock=1000;
    for(const bodyYaw of [0,Math.PI/2,-Math.PI/2,Math.PI-.1])for(const delta of [-.6,.6]){
      const now=clock,headYaw=bodyYaw+delta;clock+=2000;
      const frame={epoch:1,pose:{x:0,y:0,z:0,yaw:headYaw,pitch:0},selfPlayer:{uuid,entityId:7},
        motion:{schemaVersion:1,source:'same_player_physics_tick',tickMs:50,epoch:1,tick:20,sampledAt:now,resetSequence:0},
        presentation:{available:true,source:'paper_server_observation',playerUuid:uuid,sampledAt:now,
          self:{uuid,entityId:7,bodyYaw,headYaw,health:20,onGround:true,sprinting:true,velocity:{x:0,y:0,z:.25}}}};
      const observed=bundledYsmMotionInput(frame,uuid,now);
      close(observed.headYawDegrees,delta*180/Math.PI);
      // Live look alone must point toward the actual received head direction.
      parent.rotation.y=bodyYaw;actor.animate({motion:{...observed,horizontalSpeed:0}},now);actor.animate({motion:{...observed,horizontalSpeed:0}},now+300);parent.updateMatrixWorld(true);
      const direction=new THREE.Vector3(0,0,-1).transformDirection(actor.model.bones.get('Head').matrixWorld);
      close(direction.distanceTo(new THREE.Vector3(-Math.sin(headYaw),0,-Math.cos(headYaw))),0);
      // The unchanged authored Root channel leans into, rather than away from,
      // the same turn; this is the channel used by the original Cormy run clip.
      actor.animate({motion:observed},now+500);actor.animate({motion:observed},now+800);parent.updateMatrixWorld(true);
      const up=new THREE.Vector3(0,-1,0).transformDirection(actor.model.bones.get('Root').matrixWorld);
      const left=new THREE.Vector3(-Math.cos(bodyYaw),0,Math.sin(bodyYaw));
      assert.equal(Math.sign(up.dot(left)),Math.sign(delta));
      assert.deepEqual(actor.animationState.errors,[]);
    }
  }finally{actor.dispose();}
});

for(const own of [true,false])test(`YSM world-space look follows ${own?'own':'remote'} Mineflayer pitch through live, stale and legacy motion`,async()=>{
  const actor=await createPaperYsmActor(bundle,'main',{loadTexture:async()=>new THREE.Texture()});
  const entity={id:7,uuid,position:{x:0,y:64,z:0},yaw:0,pitch:0,metadata:{},equipment:[]};
  const bot=Object.assign(new EventEmitter(),{entities:{7:entity},_client:new EventEmitter()});
  if(own){bot.entity=entity;bot._client.uuid=uuid;}
  const row={schemaVersion:1,source:'freesia_worker',playerUuid:uuid,entityId:7,epoch:'a',available:true};
  const players=new PaperYsmPlayers();players.state(row);
  const bridge=createViewerYsmMotion(bot,{binding:()=>row,now:()=>1000,emit:(_name,motion)=>players.motion(motion,1000)});
  try {
    for(const pitch of [-Math.PI/3,0,Math.PI/3])for(const speed of [0,3]) {
      entity.pitch=pitch;bridge.send(row);
      // The wire is Java degrees (positive down); only the Molang boundary changes signs.
      close(players.motions.get(uuid).row.headPitchDegrees,-pitch*180/Math.PI);
      for(const now of [1000,4000]) {
        const motion={...players.motionFor(uuid,entity,now),horizontalSpeed:speed,onGround:true,swing:{sequence:1,ageSeconds:.1}};
        actor.animate({pitch,motion},now);actor.root.updateMatrixWorld(true);
        const expected=new THREE.Vector3(0,Math.sin(pitch),-Math.cos(pitch));
        for(const name of ['Head','QueryProbe']) {
          const forward=new THREE.Vector3(0,0,-1).transformDirection(actor.model.bones.get(name).matrixWorld);
          close(forward.distanceTo(expected),0);
        }
        assert.ok(actor.animationState.clips.includes('swing_hand'));
        assert.deepEqual(actor.animationState.errors,[]);
        const previous=actor.model.bones.get('Head').rotation.x;
        actor.animate({pitch,motion},now);close(actor.model.bones.get('Head').rotation.x,previous);
      }
      actor.animate({pitch},5000);actor.root.updateMatrixWorld(true);
      close(new THREE.Vector3(0,0,-1).transformDirection(actor.model.bones.get('Head').matrixWorld).y,Math.sin(pitch));
    }
  }finally{bridge.dispose();players.clear();actor.dispose();}
});
