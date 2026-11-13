/** A death receipt belongs to the old entity, not to the currently rendered world.
 * It permits waiting/reselection only; it never proves a respawn or an attachment.
 */
export function nativeTargetDeathRecovery({native:n,expectedTarget,expectedUuid,now=Date.now()}={}){
 const life=n?.terminalCameraLife,o=n?.offer,epoch=n?.nativeWorldEpoch;
 if(n?.phase!=='stopped'||n.reason!=='target_died'||n.connected!==true||n.authenticated!==true
  ||n.spectator!==true||n.manualDetachRequested===true||!n.observerUuid||!expectedUuid
  ||expectedUuid===n.observerUuid||n.target!==expectedTarget||!n.connectionEpoch||!n.requestId||!n.activeLease
  ||o?.accepted!==true||o.id!==n.requestId||o.lease!==n.activeLease||o.target!==expectedTarget
  ||life?.dead!==true||life.uuid!==expectedUuid||life.requestId!==n.requestId
  ||!Number.isSafeInteger(life.entityId)||life.entityId<0
  ||!Number.isSafeInteger(life.nativeWorldEpoch)||life.nativeWorldEpoch<1
  ||!Number.isSafeInteger(epoch)||epoch<life.nativeWorldEpoch
  ||!Number.isFinite(life.observedAttachedAt)||life.observedAttachedAt>now+1000)return null;
 const at=Date.parse(n.recordedAt);
 if(!Number.isFinite(at)||at>now+1000||now-at>5000)return null;
 if(n.observerAccess?.mode==='bound-player'&&n.observerAccess.boundTargetUuid!==expectedUuid)return null;
 const result={reason:'target_died',cooldownMs:15000,target:expectedTarget,uuid:expectedUuid,
  previousEntityId:life.entityId,previousWorldEpoch:life.nativeWorldEpoch,nativeWorldEpoch:epoch,
  replayPreviousRequest:false,completionVerified:false};
 if(n.cameraUuid===n.observerUuid)return{...result,action:'reselect'};
 if(n.cameraUuid==null)return{...result,action:'wait',waitReason:'await_native_camera_identity_after_death'};
 if(n.cameraUuid!==expectedUuid)return null; // A foreign camera is not permission to take control.
 const target=n.targets?.find(t=>t.name===expectedTarget&&t.uuid===expectedUuid);
 const alive=target?.loaded===true&&target.alive===true&&target.spectator===false
  &&Number.isSafeInteger(target.entityId)&&target.entityId>=0
  &&Number.isFinite(target.sampledAt)&&target.sampledAt>life.observedAttachedAt&&target.sampledAt<=now+1000&&now-target.sampledAt<=3000;
 // Respawn may reuse the numeric entity ID. Fresh alive roster evidence permits a NEW
 // request; it never adopts the old camera object or treats its death receipt as success.
 return alive?{...result,action:'reselect'}:{...result,action:'wait',waitReason:'await_respawned_target_entity'};
}
