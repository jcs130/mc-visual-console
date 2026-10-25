import test from 'node:test'
import assert from 'node:assert/strict'
import {advancePaperPresentation} from '../../src/native-viewer/native-paper-presentation.js'
import {bundledYsmMotionInput} from '../../src/native-viewer/native-bundled-ysm-motion.js'
import {publicSpectatorEvent} from '../../host/spectator-public.mjs'
const uuid='01234567-89ab-cdef-0123-456789abcdef'
function sample(){
 const self={uuid,entityId:42,health:20,maxHealth:30,armor:17,onGround:true,inWater:false,sprinting:false,velocity:{x:0,y:0,z:0}}
 const presentation={available:true,source:'paper_server_observation',playerUuid:uuid,sampledAt:1000,self,inventory:{slots:[]}}
 const event={type:'motion',epoch:1,pose:{x:1,y:64,z:2,yaw:0,pitch:0},selfPlayer:{...self,maxHealth:null,armor:null,sprinting:true,
  locomotion:{source:'paper_position_delta',available:true,playerUuid:uuid,entityId:42,tick:120,sampledAt:6000,tickMs:50,spanTicks:1,velocity:{x:.2,y:0,z:0}}},
  motion:{source:'same_player_physics_tick',schemaVersion:1,epoch:1,tick:120,tickMs:50,sampledAt:6000}}
 return {presentation,event}
}
test('public Paper motion keeps original YSM walking after an unchanged inventory has aged five seconds',()=>{
 const {presentation,event}=sample(),wire=publicSpectatorEvent(event)
 const next=advancePaperPresentation(presentation,wire,uuid)
 assert.equal(next.inventory,presentation.inventory,'no inventory resending or copy required')
 assert.equal(presentation.sampledAt,1000,'do not mutate the replay checkpoint')
 assert.equal(next.sampledAt,6000)
 assert.equal(next.self.maxHealth,30);assert.equal(next.self.armor,17)
 const input=bundledYsmMotionInput({...wire,presentation:next},uuid,6050)
 assert.equal(input.horizontalSpeed,4);assert.equal(input.sprinting,true)
 assert.throws(()=>bundledYsmMotionInput({...wire,presentation:next},uuid,8000),/STALE/,'a stopped stream must still expire')
})
test('cached Paper presentation rejects mismatched identity, old frames and other source protocols',()=>{
 for(const mutate of [({event})=>event.selfPlayer.uuid='other',({event})=>event.selfPlayer.entityId=43,
  ({event})=>event.motion.sampledAt=900,({event})=>event.motion.epoch=2,({event})=>event.motion.source='unknown',
  ({presentation})=>presentation.source='same_player_connection',({event})=>event.motion=null]){
  const value=sample();mutate(value);assert.equal(advancePaperPresentation(value.presentation,value.event,uuid),value.presentation)
 }
})
