import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import * as THREE from 'three';
import {createViewerYsmMotion} from '../../host/viewer-ysm-motion.mjs';
import {createPaperYsmActor,PaperYsmPlayers} from '../../src/modern-viewer/paper-ysm.js';

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
