// Camera-only recovery after a positively observed new native connection.
// Prior effects remain unknown; callers must create a new lease/request.
import {nativeTargetDeathRecovery,nativeBoundIdleCamera} from '../../packages/modern-viewer/renderer-src/host/native-target-recovery.mjs';
/** Only a fresh, explicitly refused offer with the pre-submission camera intact proves non-execution. */
export function directorExpiredOffer({native:n,request:r,expectedObserverUuid,now=Date.now()}={}){
 if(!n||!r||!expectedObserverUuid||n.observerUuid!==expectedObserverUuid||n.connected!==true||n.authenticated!==true
  ||n.spectator!==true||n.manualDetachRequested===true||!['attached','idle'].includes(n.phase)
  ||n.connectionEpoch!==r.connectionEpoch||n.nativeWorldEpoch!==r.nativeWorldEpoch)return null;
 const fresh=t=>Number.isFinite(t)&&t<=now&&now-t<=3000;
 const o=n.offer;
 if(!fresh(Date.parse(n.recordedAt))||!fresh(o?.at)||o.id!==r.id||o.lease!==r.lease||o.target!==r.target
  ||o.accepted!==false||o.neverAdmitted===false||o.reason!=='expired_request'||!Number.isFinite(r.issuedAt)||!Number.isFinite(r.expiresAt)
  ||r.expiresAt<=r.issuedAt||r.expiresAt-r.issuedAt>10000||r.expiresAt>o.at)return null;
 if(!Object.hasOwn(r,'previousNativeRequestId')||!Object.hasOwn(r,'previousCameraUuid')||n.requestId===r.id
  ||(n.requestId??null)!==r.previousNativeRequestId||n.cameraUuid!==r.previousCameraUuid)return null;
 if(n.phase==='attached'&&(!n.targetUuid||n.cameraUuid!==n.targetUuid)
  ||n.phase==='idle'&&n.cameraUuid!==n.observerUuid)return null;
 return{action:'reselect_after_explicit_non_execution',reason:'request_expired_before_admission',requestId:r.id,
  requestReissued:false,completionVerified:false,backoffMs:2000};
}
/** Adopt a newly rendered world only after the SAME accepted request is authoritatively attached there. */
export function directorWorldReconciliation({native:n,request:r,expectedObserverUuid,now=Date.now()}={}){
  if(!n||!r||!Number.isSafeInteger(r.nativeWorldEpoch)||r.nativeWorldEpoch<1
    ||!Number.isSafeInteger(n.nativeWorldEpoch)||n.nativeWorldEpoch<=r.nativeWorldEpoch
    ||!expectedObserverUuid||n.observerUuid!==expectedObserverUuid||n.connected!==true||n.authenticated!==true
    ||n.phase!=='attached'||n.spectator!==true||n.manualDetachRequested===true
    ||n.connectionEpoch!==r.connectionEpoch||n.requestId!==r.id||n.activeLease!==r.lease
    ||!r.targetUuid||n.targetUuid!==r.targetUuid||n.cameraUuid!==r.targetUuid
    ||n.offer?.id!==r.id||n.offer.lease!==r.lease||n.offer.accepted!==true)return null;
  const life=n.cameraLife,fresh=t=>Number.isFinite(t)&&t>=r.issuedAt&&t<=now&&now-t<=3000;
  if(life?.requestId!==r.id||life.uuid!==r.targetUuid||life.nativeWorldEpoch!==n.nativeWorldEpoch||life.dead!==false
    ||!Number.isSafeInteger(life.entityId)||life.entityId<0||!fresh(life.observedAttachedAt)||!fresh(n.renderedAt)
    ||!fresh(Date.parse(n.recordedAt))||n.transition?.active===true)return null;
  return{requestId:r.id,previousWorldEpoch:r.nativeWorldEpoch,nativeWorldEpoch:n.nativeWorldEpoch,
    targetUuid:r.targetUuid,requestReissued:false,completionVerified:false};
}
export function directorTargetLoss({native,expectedTarget,expectedUuid,now=Date.now()}={}) {
  const death=nativeTargetDeathRecovery({native,expectedTarget,expectedUuid,now});
  if(death||native?.terminalCameraLife&&native.offer?.accepted===true)return death;
  if(native?.phase!=='stopped'||native.connected!==true||native.authenticated!==true||native.spectator!==true
      ||!native.observerUuid||native.cameraUuid!==native.observerUuid
      ||native.target!==expectedTarget||!expectedUuid||native.manualDetachRequested===true)return null;
  if(native.reason==='target_identity_lost')return{reason:native.reason,cooldownMs:15000};
  const failure=native.positionFailure;
  if(native.reason==='target_position_unconfirmed'&&failure?.requestId===native.requestId
      &&failure.lease===native.offer?.lease&&native.offer?.id===native.requestId
      &&failure.targetUuid===expectedUuid&&failure.observerUuid===native.observerUuid
      &&failure.cameraUuid===native.observerUuid&&failure.nativeWorldEpoch===native.nativeWorldEpoch
      &&Number.isSafeInteger(failure.nativeWorldEpoch)&&failure.nativeWorldEpoch>0
      &&Number.isFinite(failure.observedAt)&&Number.isInteger(failure.commands)&&failure.commands>=1&&failure.commands<=2)
    return{reason:native.reason,cooldownMs:30000,previousTeleportOutcome:'unconfirmed',replayPreviousRequest:false};
  const life=native.terminalCameraLife??native.cameraLife;
  if(native.reason==='target_died'&&life?.dead===true&&life.uuid===expectedUuid
      &&(life.requestId==null||life.requestId===native.requestId)
      &&Number.isSafeInteger(life.entityId)&&life.entityId>=0
      &&Number.isSafeInteger(native.nativeWorldEpoch)&&native.nativeWorldEpoch>0
      &&life.nativeWorldEpoch===native.nativeWorldEpoch)
    return{reason:native.reason,cooldownMs:15000};
  return null;
}
export function directorConnectionRecovery({enabled,previousEpoch,expectedObserverUuid,targets=[],native,now=Date.now()}={}) {
  const epoch=native?.connectionEpoch;
  if(!previousEpoch||epoch===previousEpoch)return{action:'unchanged'};
  if(enabled!==true)return{action:'stop',reason:'connection_changed_manual_resume'};
  if(native?.phase==='paused'||native?.manualDetachRequested===true)return{action:'stop',reason:'manual_or_native_detach'};
  if(native?.connected!==true||native?.authenticated!==true)return{action:'wait',reason:'await_new_connection_authentication'};
  if(typeof epoch!=='string'||!epoch||epoch.length>128)return{action:'stop',reason:'invalid_connection_epoch'};
  if(typeof expectedObserverUuid!=='string'||!expectedObserverUuid||native.observerUuid!==expectedObserverUuid)
    return{action:'stop',reason:'observer_identity_changed'};
  if(native.phase==='unknown')return{action:'stop',reason:'new_connection_camera_unknown'};
  const self=native.cameraUuid===native.observerUuid;
  const attached=native.phase==='attached'&&targets.includes(native.target)&&native.targetUuid
    &&native.targetUuid===native.cameraUuid;
  if(native.cameraUuid==null)return{action:'wait',reason:'await_native_camera_identity'};
  const bound=nativeBoundIdleCamera(native,now);
  if(!self&&!attached&&!(bound&&targets.includes(bound.name)))return{action:'stop',reason:'new_connection_camera_identity_unknown'};
  return{action:'recover',connectionEpoch:epoch,previousOutcome:'unknown_unless_previously_confirmed',
    replayPreviousRequest:false,newLeaseRequired:true};
}
