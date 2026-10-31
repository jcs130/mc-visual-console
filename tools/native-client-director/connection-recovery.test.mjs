import test from 'node:test';
import assert from 'node:assert/strict';
import {directorConnectionRecovery as recover} from './connection-recovery.mjs';
const input=()=>({enabled:true,previousEpoch:'old',expectedObserverUuid:'observer',targets:['Alice'],
  native:{connectionEpoch:'new',connected:true,authenticated:true,phase:'idle',observerUuid:'observer',cameraUuid:'observer'}});
test('a confirmed fresh observer connection permits only a new camera lease',()=>{
  const result=recover(input());assert.equal(result.action,'recover');assert.equal(result.newLeaseRequired,true);
  assert.equal(result.replayPreviousRequest,false);assert.equal(result.previousOutcome,'unknown_unless_previously_confirmed');
});
test('connection recovery is explicit opt-in and does not alter an unchanged connection',()=>{
  assert.equal(recover({...input(),enabled:false}).action,'stop');
  const i=input();i.native.connectionEpoch='old';assert.deepEqual(recover(i),{action:'unchanged'});
});
test('authentication, account identity and known camera identity remain required',()=>{
  for(const patch of [{authenticated:false},{connected:false}]){
    const i=input();Object.assign(i.native,patch);assert.equal(recover(i).action,'wait');
  }
  for(const patch of [{observerUuid:'other'},{cameraUuid:'unknown'},{phase:'unknown'}]){
    const i=input();Object.assign(i.native,patch);assert.equal(recover(i).action,'stop');
  }
});
test('manual pause is preserved across reconnection',()=>{
  const i=input();i.native.phase='paused';assert.equal(recover(i).reason,'manual_or_native_detach');
});
test('an already attached camera is accepted only with matched native UUID and allowed target',()=>{
  const i=input();Object.assign(i.native,{phase:'attached',target:'Alice',targetUuid:'alice',cameraUuid:'alice'});
  assert.equal(recover(i).action,'recover');i.native.target='unlisted';assert.equal(recover(i).action,'stop');
});
