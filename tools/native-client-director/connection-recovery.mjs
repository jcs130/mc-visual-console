// Camera-only recovery after a positively observed new native connection.
// Prior effects remain unknown; callers must create a new lease/request.
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
