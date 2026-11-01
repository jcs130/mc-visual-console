import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyEvent,SceneSelector,belongsToActor,eventActor} from './scene-policy.mjs';
const now=100_000,combat=t=>({ts:new Date(t).toISOString(),type:'minecraft.combat',text:'native combat clear'});
const position=(at,x,run='one')=>({ts:new Date(at).toISOString(),run,type:'minecraft.world.snapshot',
  text:`[Minecraft] 我在fixture，脚下是石头，站在格 (${x}, 70, 0)，世界 fixture:one。我站着没动。`});
test('observed movement switches off a stationary actor while a long task is still running',()=>{
  const p=new SceneSelector(['Alice','Bob']);
  p.observe('Alice',position(now-12000,0),now-12000);p.observe('Alice',position(now,0),now);
  p.observe('Bob',position(now-1000,0),now-1000);p.observe('Bob',position(now,2),now);
  const c=p.choose('Alice',now-11000,now);assert.equal(c.name,'Bob');assert.equal(c.kind,'movement');
  p.observe('Bob',position(now+9000,2),now+9000);
  assert.equal(p.choose('Bob',0,now+9000),null,'standing after arrival does not keep generating movement');
});
test('chat coordinates, stale samples and cross-run teleports do not invent movement',()=>{
  const p=new SceneSelector(['Alice']);p.observe('Alice',position(now-1000,0),now-1000);
  p.observe('Alice',{ts:new Date(now).toISOString(),type:'minecraft.chat',text:'[MC] Alice: 站在格 (99,70,0)'},now);
  assert.equal(p.choose(null,0,now).kind,'conversation');
  p.observe('Alice',position(now,100,'two'),now);assert.notEqual(p.choose(null,0,now)?.kind,'movement');
  assert.equal(classifyEvent({ts:new Date(now).toISOString(),type:'minecraft.reflex',text:'[反射] 吃了面包'},now),null);
});
test('explicit cinematic framing selects overview for battle, follow for movement and overhead when idle',()=>{
  const p=new SceneSelector(['Alice'],{cinematicFraming:true});p.observe('Alice',combat(now),now);
  assert.equal(p.choose(null,0,now).view,'drone_overview');
  p.observe('Alice',position(now,0),now);p.observe('Alice',position(now+1000,2),now+1000);
  assert.equal(p.choose('Alice',0,now+14000,'drone_overview').view,'drone_follow');
  p.observe('Alice',position(now+21000,2),now+21000);p.observe('Alice',position(now+27000,2),now+27000);
  assert.equal(p.choose('Alice',0,now+27000,'drone_follow').view,'drone_overview');
  assert.equal(p.choose('Alice',0,now+27000,'drone_overview'),null,'idle actors are not round-robin fake activity');
});
test('public chat heard by all players is attributed only to its real speaker',()=>{
  const event={source:'minecraft',type:'minecraft.chat',text:'[MC] Bob: ready'};
  assert.equal(belongsToActor('Alice',event),false);
  assert.equal(belongsToActor('Bob',event),true);
  assert.equal(belongsToActor('bob',event),true);
  assert.equal(belongsToActor('Alice',combat(now)),true);
});
test('ignores stale, future, foreign-world and read-only data',()=>{
  assert.equal(classifyEvent(combat(now-61_000),now),null);
  assert.equal(classifyEvent(combat(now+2000),now),null);
  assert.equal(classifyEvent({...combat(now),type:'qq.chat'},now),null);
  assert.equal(classifyEvent({ts:new Date(now).toISOString(),type:'minecraft.task',text:'任务完成：试算；到了 (1,2,3)'},now),null);
});
test('uses actual terminal actions and does not make failed movement interesting',()=>{
  const e={ts:new Date(now).toISOString(),type:'minecraft.task',execution:{terminal:true,evidence:{steps:[
    {outcome:'fail',observedEffect:{skill:'goto',changed:{position:true}}}]}}};
  assert.equal(classifyEvent(e,now),null);
  e.execution.evidence.steps[0].outcome='ok';
  assert.equal(classifyEvent(e,now).kind,'movement');
  e.execution.terminal=false;assert.equal(classifyEvent(e,now),null);
});
test('honors target list and dwell, with bounded battle interruption',()=>{
  const p=new SceneSelector(['Alice','Bob']);
  p.observe('Eve',combat(now),now);assert.equal(p.choose(null,0,now),null);
  p.observe('Bob',combat(now),now);
  assert.equal(p.choose('Alice',now-9000,now),null);
  assert.equal(p.choose('Alice',now-11_000,now).name,'Bob');
  assert.equal(p.choose('Bob',now-40_000,now),null);
  assert.equal(p.choose('Alice',0,now+65_000),null);
});
test('crafting chooses hand/UI view; idle scenes do not cycle for fake progress',()=>{
  const p=new SceneSelector(['Alice','Bob']);
  assert.equal(p.choose(null,0,now),null);
  p.observe('Alice',{ts:new Date(now).toISOString(),type:'minecraft.task',execution:{terminal:true,evidence:{steps:[
    {outcome:'ok',observedEffect:{skill:'craft'}}]}}},now);
  assert.equal(p.choose(null,0,now).view,'first_person');
  assert.equal(p.inspect(now)[0].lastInteractionAt,now);
  assert.equal(p.inspect(now)[1].lastInteractionAt,null);
  assert.equal(p.choose('Alice',0,now),null);
});
test('a short chat reply does not erase fresh battle evidence',()=>{
  const p=new SceneSelector(['Alice','Bob']);
  p.observe('Alice',combat(now-1000),now);
  p.observe('Alice',{ts:new Date(now).toISOString(),type:'minecraft.chat',text:'[MC] Alice: ready'},now);
  assert.equal(p.choose(null,0,now).kind,'combat');
  const later=now+30_000;
  p.observe('Alice',{ts:new Date(later).toISOString(),type:'minecraft.task',execution:{terminal:true,evidence:{steps:[
    {outcome:'ok',observedEffect:{skill:'take'}}]}}},later);
  assert.equal(p.choose(null,0,later).kind,'interaction');
});

test('original native search movement is visible without treating chat claims as movement',()=>{
  const event=text=>({ts:new Date(now).toISOString(),type:'minecraft.task',text});
  const receipt='[执行器] 任务#80「朝东找白桦原木」完成:\n第 1 步 {"skill":"find","target":"birch_log","direction":"east","distance":64} 用时 32s: 朝东走了 62 格,当前看见了白桦原木';
  assert.equal(classifyEvent(event(receipt),now).kind,'movement');
  assert.equal(classifyEvent(event('[执行器] [22:45:00 共 2s] 任务#81完成: {"skill":"find","target":"oak_log","direction":"east"}: 朝东走满了 27 格,没看见橡木原木'),now).kind,'movement');
  assert.equal(classifyEvent(event('[执行器] [22:45:00 共 0s] 任务#82完成: {"skill":"chat","text":"我到了 (1,2,3)，朝东走了 62 格"}: 说了: 我到了 (1,2,3)，朝东走了 62 格'),now),null);
  assert.equal(classifyEvent(event('第 1 步 {"skill":"find","target":"birch_log"} 用时 1s: 没做成，朝东走了 62 格只是计划'),now),null);
});

test('recent physical activity beats repeated conversation after minimum dwell',()=>{
  const p=new SceneSelector(['Alice','Bob']);
  p.observe('Bob',{ts:new Date(now-8000).toISOString(),type:'minecraft.task',execution:{terminal:true,evidence:{steps:[
    {outcome:'ok',observedEffect:{skill:'goto',changed:{position:true}}}]}}},now);
  p.observe('Alice',{ts:new Date(now).toISOString(),type:'minecraft.chat',text:'[MC] Alice: still waiting'},now);
  assert.equal(p.choose('Alice',now-20_000,now),null);
  assert.equal(p.choose('Alice',now-40_000,now).name,'Bob');
  assert.equal(p.choose('Bob',now-40_000,now),null);
});

const speech=(name,at)=>({ts:new Date(at).toISOString(),type:'minecraft.chat',text:`[MC] ${name}: ready`});
const sample=(p,name,at,x=0,scope='observer:world')=>p.observePosition(name,{at,position:[x,70,0],scope},at);
test('continuous native samples detect idle and yield to the latest public speaker',()=>{
  const p=new SceneSelector(['Alice','Bob','Carol'],{cinematicFraming:true});
  sample(p,'Alice',now-13000);sample(p,'Alice',now);
  p.observe('Bob',speech('Bob',now-1000),now);p.observe('Carol',speech('Carol',now-500),now);
  const c=p.choose('Alice',now-14000,now,'drone_follow');
  assert.equal(c.name,'Carol');assert.equal(c.reason,'stationary_current_recent_speaker');
  assert.equal(c.view,'drone_follow');assert.equal(p.inspect(now)[0].motion,'stationary');
  p.observe('Alice',speech('Alice',now),now);
  assert.equal(p.choose('Alice',now-14000,now,'drone_follow'),null,'current latest speaker keeps the camera');
});
test('missing motion remains unknown; fresh speech can yield only after normal dwell',()=>{
  const p=new SceneSelector(['Alice','Bob']);p.observe('Bob',speech('Bob',now),now);
  assert.equal(p.inspect(now)[0].motion,'unknown');
  assert.equal(p.choose('Alice',now-20000,now),null);
  assert.equal(p.choose('Alice',now-40000,now).reason,'recent_speaker_no_fresh_action');
  assert.equal(p.choose('Alice',now-40000,now+46000),null,'stale speech is not a fresh scene');
  assert.equal(p.choose('Alice',now+1,now+40000),null,'a past speech is not replayed after a later cut');
});
test('real combat and interaction are retained over a newer speaker',()=>{
  const p=new SceneSelector(['Alice','Bob']);sample(p,'Alice',now-14000);sample(p,'Alice',now);
  p.observe('Alice',combat(now-1000),now);p.observe('Bob',speech('Bob',now),now);
  assert.equal(p.choose('Alice',now-40000,now),null);
  assert.equal(p.choose(null,0,now).name,'Alice');
});
test('availability filters disconnected speakers and unknown tab data is explicit',()=>{
  const p=new SceneSelector(['Alice','Bob']);p.observe('Bob',speech('Bob',now),now);p.setAvailable(['Alice']);
  assert.equal(p.choose(null,0,now),null);assert.equal(p.inspect(now)[1].available,false);
  p.setAvailable(null);assert.equal(p.choose(null,0,now).name,'Bob');
});
test('slow travel accumulates; head jitter, teleport and world changes do not invent movement',()=>{
  const p=new SceneSelector(['Alice']);sample(p,'Alice',now-3000,0);sample(p,'Alice',now-2000,0.3);
  sample(p,'Alice',now-1000,0.6);sample(p,'Alice',now,0.9);
  assert.equal(p.choose(null,0,now).kind,'movement');
  const q=new SceneSelector(['Alice']);sample(q,'Alice',now-10000,0);sample(q,'Alice',now,0.05);
  assert.equal(q.inspect(now)[0].motion,'stationary');assert.equal(q.choose(null,0,now),null);
  const r=new SceneSelector(['Alice']);sample(r,'Alice',now-1000,0);sample(r,'Alice',now,100);
  sample(r,'Alice',now+1000,102,'observer:other');assert.equal(r.choose(null,0,now+1000),null);
});
test('owned body snapshots cannot overwrite fresh continuous observer positions',()=>{
  const p=new SceneSelector(['Alice']);sample(p,'Alice',now-12000);sample(p,'Alice',now-1000);
  p.observe('Alice',position(now,200,'body-run'),now);sample(p,'Alice',now+1000);
  assert.equal(p.inspect(now+1000)[0].motion,'stationary');assert.equal(p.choose(null,0,now+1000),null);
});
test('trusted public speech from a peer feed is attributed to the real allowed speaker only',()=>{
  assert.equal(eventActor('Alice',speech('Bob',now),['Alice','Bob']),'Bob');
  assert.equal(eventActor('Alice',speech('Eve',now),['Alice','Bob']),null);
  assert.equal(eventActor('Alice',{type:'minecraft.chat',text:'[私聊] Bob: ready'},['Alice','Bob']),null);
  assert.equal(eventActor('Alice',{type:'minecraft.chat',text:'quoted [MC] Bob: ready'},['Alice','Bob']),null);
  assert.equal(eventActor('Alice',position(now,1),['Alice','Bob']),'Alice');
});
test('a late completed movement receipt cannot overrule continuous confirmed idle',()=>{
  const p=new SceneSelector(['Alice','Bob']);sample(p,'Alice',now-13000);sample(p,'Alice',now);
  p.observe('Alice',{ts:new Date(now).toISOString(),type:'minecraft.task',execution:{terminal:true,evidence:{steps:[
    {outcome:'ok',observedEffect:{skill:'goto',changed:{position:true}}}]}}},now);
  p.observe('Bob',speech('Bob',now),now);
  assert.equal(p.choose('Alice',now-14000,now).name,'Bob');
});
