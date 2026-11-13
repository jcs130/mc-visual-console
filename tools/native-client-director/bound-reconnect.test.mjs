import test from 'node:test';
import assert from 'node:assert/strict';
import {directorConnectionRecovery} from './connection-recovery.mjs';
import {planNativeDirectorResume} from '../../packages/modern-viewer/renderer-src/host/native-director-policy.mjs';
const now=100000;
const native=()=>({recordedAt:new Date(now).toISOString(),renderedAt:now,connectionEpoch:'new',nativeWorldEpoch:1,
 connected:true,authenticated:true,connectionBoundRequests:true,spectator:true,server:'example.test:25565',
 observerUuid:'eye',cameraUuid:'player',phase:'idle',reason:'connection_epoch_mismatch',manualDetachRequested:false,
 offer:{id:'old-offer',lease:'old-lease',accepted:false,neverAdmitted:true,reason:'connection_epoch_mismatch'},
 observerAccess:{mode:'bound-player',boundTargetUuid:'player'},targetDiscovery:{mode:'bound_player'},
 targets:[{name:'Alice',uuid:'player',entityId:511,alive:true,loaded:true,spectator:false,sampledAt:now,scope:'new:world'}]});
const recover=n=>directorConnectionRecovery({enabled:true,previousEpoch:'old',expectedObserverUuid:'eye',targets:['Alice'],native:n,now});
const resume=n=>planNativeDirectorResume({enabled:true,observerAlive:true,selectorAlive:false,expectedServer:'example.test:25565',expectedObserverUuid:'eye',previousEpoch:'old',native:n,selector:{running:false,phase:'new_connection_camera_identity_unknown'},now});
test('server-bound eye after reconnect permits a fresh lease, never adopts the rejected old offer',()=>{
 const n=native(),before=structuredClone(n);
 assert.equal(recover(n).action,'recover');assert.equal(resume(n).action,'start');
 assert.equal(recover(n).replayPreviousRequest,false);assert.equal(resume(n).newLeaseRequired,true);
 assert.deepEqual(n,before);
});
test('bound camera recovery retains identity, freshness, manual stop and unknown-operation boundaries',()=>{
 const base=native();
 for(const patch of [{manualDetachRequested:true},{phase:'paused'},{phase:'unknown'},{authenticated:false},
  {cameraUuid:'foreign'},{activeLease:'unresolved'},{requestId:'unresolved'},{transition:{active:true}},
  {observerAccess:{mode:'all-online'}},{targetDiscovery:{mode:'all_online'}},{connectionBoundRequests:false},
  {offer:{...base.offer,accepted:true}},{offer:{...base.offer,neverAdmitted:false}},
  {recordedAt:new Date(now-4000).toISOString()},{renderedAt:now-4000},
  ...[{alive:false},{loaded:false},{spectator:true},{sampledAt:now-4000},{sampledAt:now+1},{scope:'old:world'},{uuid:'other'}]
    .map(t=>({targets:[{...base.targets[0],...t}]}))]){
   assert.notEqual(recover({...base,...patch}).action,'recover',JSON.stringify(patch));
   assert.notEqual(resume({...base,...patch}).action,'start',JSON.stringify(patch));
 }
 assert.notEqual(directorConnectionRecovery({enabled:true,previousEpoch:'old',expectedObserverUuid:'eye',targets:['Bob'],native:base,now}).action,'recover');
 assert.equal(planNativeDirectorResume({enabled:true,observerAlive:true,expectedServer:'example.test:25565',expectedObserverUuid:'eye',previousEpoch:'new',native:base,now}).action,'hold');
});
