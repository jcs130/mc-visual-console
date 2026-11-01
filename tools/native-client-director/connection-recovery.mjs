// Camera-only recovery after a positively observed new native connection.
// Prior effects remain unknown; callers must create a new lease/request.
export function directorTargetLoss({native,expectedTarget,expectedUuid}={}) {
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
  const life=native.cameraLife;
  if(native.reason==='target_died'&&life?.dead===true&&life.uuid===expectedUuid
      &&Number.isSafeInteger(life.entityId)&&life.entityId>=0
      &&Number.isSafeInteger(native.nativeWorldEpoch)&&native.nativeWorldEpoch>0
      &&life.nativeWorldEpoch===native.nativeWorldEpoch)
    return{reason:native.reason,cooldownMs:15000};
  return null;
}
export function directorConnectionRecovery({enabled,previousEpoch,expectedObserverUuid,targets=[],native}={}) {
  const epoch=native?.connectionEpoch;
  if(!previousEpoch||epoch===previousEpoch)return{action:'unchanged'};
  if(enabled!==true)return{action:'stop',reason:'connection_changed_manual_resume'};
  if(native?.phase==='paused')return{action:'stop',reason:'manual_or_native_detach'};
  if(native?.connected!==true||native?.authenticated!==true)return{action:'wait',reason:'await_new_connection_authentication'};
  if(typeof epoch!=='string'||!epoch||epoch.length>128)return{action:'stop',reason:'invalid_connection_epoch'};
  if(typeof expectedObserverUuid!=='string'||!expectedObserverUuid||native.observerUuid!==expectedObserverUuid)
    return{action:'stop',reason:'observer_identity_changed'};
  if(native.phase==='unknown')return{action:'stop',reason:'new_connection_camera_unknown'};
  const self=native.cameraUuid===native.observerUuid;
  const attached=native.phase==='attached'&&targets.includes(native.target)&&native.targetUuid
    &&native.targetUuid===native.cameraUuid;
  if(native.cameraUuid==null)return{action:'wait',reason:'await_native_camera_identity'};
  if(!self&&!attached)return{action:'stop',reason:'new_connection_camera_identity_unknown'};
  return{action:'recover',connectionEpoch:epoch,previousOutcome:'unknown_unless_previously_confirmed',
    replayPreviousRequest:false,newLeaseRequired:true};
}
