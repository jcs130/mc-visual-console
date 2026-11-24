import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBroadcastSelection,broadcastEligible,broadcastSubjects,broadcastChoice,broadcastAllows,broadcastPacing,BROADCAST_SELECTION_SCHEMA as schema} from './target-selection.mjs';
const observer='00000000-0000-0000-0000-000000000001',alice='00000000-0000-0000-0000-000000000002',bob='00000000-0000-0000-0000-000000000003';
const native={server:'fixture:25565',observerUuid:observer,targets:[{name:'Alice',uuid:alice,spectator:false},{name:'Bob',uuid:bob,spectator:false}]};
const pin={schema,id:'00000000-0000-0000-0000-000000000004',mode:'follow',scope:{server:native.server,observerUuid:observer},target:{name:'Alice',uuid:alice},updatedAt:new Date().toISOString()};
const subjects=[{name:'Alice',priority:3},{name:'Bob',priority:0}];
test('operator selection overrides scene proposal and model advice with exact identity',()=>{
 const s=resolveBroadcastSelection(pin,native);
 assert.deepEqual(broadcastEligible(s,['Alice','Bob']),['Alice']);
 assert.equal(broadcastChoice(s,{name:'Bob'},'Bob',bob,100).reason,'operator_selected_target');
 assert.equal(broadcastChoice(s,{name:'Bob'},'Alice',alice,100),null);
 assert.equal(broadcastAllows(s,{name:'Bob'},subjects,'Alice'),false);
});
test('offline, renamed and recycled identities wait; they never select another player',()=>{
 for(const targets of [[],[{name:'Alice',uuid:bob,spectator:false}],[{name:'Renamed',uuid:alice,spectator:false}],[{name:'Alice',uuid:alice,spectator:false,alive:false}]]){
  const s=resolveBroadcastSelection(pin,{...native,targets});assert.equal(s.state,'waiting_target');
  assert.equal(broadcastChoice(s,{name:'Bob'},null,null,100),null);
 }
});
test('scope mismatch and malformed preferences fail closed; only absent file defaults to auto',()=>{
 for(const v of [false,{}, {...pin,scope:{...pin.scope,server:'other'}},{...pin,target:{name:'Alice',uuid:observer}},{...pin,mode:'oops'}]){
  const s=resolveBroadcastSelection(v,native);assert.equal(s.state,'invalid_selection');assert.deepEqual(broadcastEligible(s,['Alice','Bob']),[]);
 }
 assert.equal(resolveBroadcastSelection(null,native).mode,'auto');
});
test('automatic model menu and final gate cannot prefer idle coverage over real combat',()=>{
 const s=resolveBroadcastSelection(null,native);
 assert.deepEqual(broadcastSubjects(s,subjects),[subjects[0]]);
 assert.equal(broadcastAllows(s,{name:'Bob'},subjects,'Alice'),false);
 assert.equal(broadcastAllows(s,{name:'Alice'},subjects,'Bob'),true);
 assert.equal(broadcastAllows(s,{name:'Bob'},subjects.map(s=>({...s,priority:0})),'Alice'),false);
 assert.equal(broadcastAllows(s,{name:'Alice'},subjects.map(s=>({...s,priority:0})),'Alice'),true);
});
test('explicit manual selection may watch an idle player; returning to auto restores activity priority',()=>{
 const s=resolveBroadcastSelection({...pin,target:{name:'Bob',uuid:bob}},native);
 assert.equal(broadcastAllows(s,{name:'Bob'},subjects,'Alice'),true);
 assert.equal(resolveBroadcastSelection({...pin,mode:'auto'},native).mode,'auto');
});
test('operator can override automatic editorial holds but not render, screen or cut safety',()=>{
 const s=resolveBroadcastSelection(pin,native),c=broadcastChoice(s,null,'Bob',bob,100);
 for(const reason of ['protect_live_combat','minimum_subject_hold','subject_return_cooldown_60s','subject_budget_2_per_minute'])assert.equal(broadcastPacing(s,c,{allow:false,reason}).allow,true);
 for(const reason of ['manual_or_unresolved','awaiting_render_binding','minimum_shot_12s','cut_budget_12_per_minute'])assert.equal(broadcastPacing(s,c,{allow:false,reason}).allow,false);
 assert.equal(broadcastPacing({mode:'auto'},c,{allow:false,reason:'protect_live_combat'}).allow,false);
});
