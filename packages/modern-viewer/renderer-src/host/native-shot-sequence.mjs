import {CAMERA_SCRIPT_PROTOCOL} from './camera-script.mjs';
const finite=view=>view?.startsWith('drone_orbit_')||['drone_push_in','drone_pull_out'].includes(view);
const perspectives=['drone_front_left','drone_orbit_left','drone_front','drone_push_in','drone_front_right','drone_orbit_right','drone_pull_out','drone_eye'];
const orthographics=['ortho_overview','ortho_close','ortho_isometric'];
const travelViews=['drone_follow','drone_side_right','drone_front_left','drone_overview','drone_side_left','drone_front_right','drone_eye'];
export const NATIVE_CAMERA_CADENCE_PROTOCOL='mcvisual.native-camera-cadence/v1';

/** Explicit display scheduling only. Every execution still uses fresh native collision/projection guards. */
export function nativeScheduledCamera(choice,n,{now=Date.now(),deadline=false}={}){
 const s=choice?.sequence,c=s?.cadence,fresh=t=>Number.isFinite(t)&&t<=now&&now-t<=3000;
 if(c?.schema!==NATIVE_CAMERA_CADENCE_PROTOCOL||c.scope!==n?.connectionEpoch+':'+n?.nativeWorldEpoch
  ||c.subjectUuid!==n?.targetUuid||c.requestId!==n?.requestId||choice.name!==n?.target||!n.availableViews?.includes(choice.view)
  ||!n.connected||!n.authenticated||!n.spectator||n.phase!=='attached'||n.cameraUuid!==n.targetUuid
  ||n.manualDetachRequested||n.screenOpen||n.transition?.active||n.cameraLife?.dead
  ||!fresh(Date.parse(n.recordedAt))||!fresh(n.renderedAt)||!fresh(s.nativeSceneAt)
  ||!Number.isFinite(c.since)||c.since>now||!['composition','stationary_motion'].includes(c.cause))return false;
 const age=now-c.since,early=c.cause==='stationary_motion',due=early?3000:5000,limit=early?4000:7000;
 if(age<due||c.dueAt!==c.since+due||c.deadlineAt!==c.since+limit||deadline&&now<c.deadlineAt)return false;
 if(early&&(!Number.isFinite(c.stationarySince)||c.stationarySince>now-3000))return false;
 const space=n.spatial,t=n.targets?.find(t=>t.uuid===n.targetUuid&&t.name===n.target);
 if(!t?.loaded||t.alive!==true||space?.known!==true||space.floorSafe!==true||space.targetUuid!==n.targetUuid
  ||space.nativeWorldEpoch!==n.nativeWorldEpoch||!fresh(space.at)||!['open','room'].includes(space.layout))return false;
 if(n.shotExecution?.requestId===n.requestId&&finite(n.shotExecution.view)&&!['completed','blocked','cancelled'].includes(n.shotExecution.phase))return false;
 if(n.shotExecution?.requestId===n.requestId&&n.shotExecution.fallback===true&&n.shotExecution.view===choice.view)return false;
 if(choice.view.startsWith('ortho_')&&(n.orthographic?.ready!==true||n.orthographic.worldCutawaySupported!==false||n.orthographic.roomClip||space.orthographicVisibility<.8))return false;
 if(finite(choice.view))return s.pathPreflightRequired===true&&n.cameraScript?.schema===CAMERA_SCRIPT_PROTOCOL&&n.cameraScript.preflightRequiredForFinite===true
  &&n.rigCancelSupported===true&&n.projection!=='orthographic'&&n.drone?.active===true&&fresh(n.drone.lastRenderedAt)
  &&space.layout==='open'&&space.headroom>=3.5&&space.spanX>=8&&space.spanZ>=8
  &&choice.motion?.schema===CAMERA_SCRIPT_PROTOCOL&&choice.motion.speed===1&&choice.motion.durationMs===4000
  &&(!choice.view.startsWith('drone_orbit_')||choice.motion.arcDegrees===15);
 return true;
}

/** Display-only shot progression. Native render, collision and pacing remain authoritative. */
export class NativeCameraSequence{
 constructor({enabled=false,now=Date.now,currentView,intervalMs=22000,cadenceProfile='steady'}={}){
  if(typeof currentView!=='function')throw Error('EXPLICIT_NATIVE_VIEW_REQUIRED');
  if(!['steady','lively'].includes(cadenceProfile))throw Error('INVALID_CAMERA_CADENCE_PROFILE');
  this.enabled=enabled===true;this.now=now;this.view=currentView;this.cadenceProfile=cadenceProfile;
  this.intervalMs=cadenceProfile==='lively'?5000:Math.max(16000,Math.min(45000,intervalMs));
  this.current=null;this.cue=null;this.cueOffer=null;this.blocked=new Map();this.failedViews=new Map();this.stopped=false;this.phase=this.enabled?'waiting_for_native_frame':'disabled';
 }
 ready(n){const now=this.now(),fresh=t=>Number.isFinite(t)&&t<=now&&now-t<=3000;
  return this.enabled&&!this.stopped&&n?.connected===true&&n.authenticated===true&&n.spectator===true&&n.phase==='attached'
   &&n.targetUuid&&n.cameraUuid===n.targetUuid&&!n.manualDetachRequested&&!n.screenOpen&&!n.transition?.active
   &&fresh(Date.parse(n.recordedAt))&&fresh(n.renderedAt);
 }
 observe(n){
  if(!this.ready(n))return;
  const now=this.now(),scope=n.connectionEpoch+':'+n.nativeWorldEpoch,view=this.view(n);
  if(this.current?.scope!==scope||this.current?.uuid!==n.targetUuid){this.current=null;this.cue=null;this.cueOffer=null;this.blocked.clear();this.failedViews.clear();}
  const cue=this.cueOffer;
  if(cue&&cue.scope===scope&&cue.uuid===n.targetUuid&&cue.parent!==n.requestId&&n.shotExecution?.requestId===n.requestId
   &&n.shotExecution.fallback!==true&&['running','holding','completed','transitioning'].includes(n.shotExecution.phase)){
   this.cue={scope,uuid:n.targetUuid,stationarySince:cue.stationarySince};this.cueOffer=null;
  }
  if(this.current?.id!==n.requestId||this.current?.uuid!==n.targetUuid){
   const offered=n.offer?.id===n.requestId&&n.offer.accepted===true&&Number.isFinite(n.offer.at)&&n.offer.at<=now?n.offer.at:now;
   const continuation=this.cadenceProfile==='lively'&&this.current?.uuid===n.targetUuid&&finite(n.shotExecution?.view);
   this.current={scope,id:n.requestId,uuid:n.targetUuid,view,since:continuation?this.current.since:offered};
  }else this.current.view=view;
  const shot=n.shotExecution;
  if(this.cadenceProfile==='lively'&&shot?.requestId===n.requestId&&shot.fallback===true&&!finite(shot.view)
   &&this.failedViews.get(shot.view)?.requestId!==n.requestId)this.failedViews.set(shot.view,{requestId:n.requestId,until:now+20000});
  for(const[view,value]of this.failedViews)if(value.until<=now)this.failedViews.delete(view);
  if(shot?.requestId===n.requestId&&finite(shot.view)&&['blocked','cancelled'].includes(shot.phase)&&!this.blocked.has(n.requestId)){
   this.blocked.set(n.requestId,now+60000);while(this.blocked.size>16)this.blocked.delete(this.blocked.keys().next().value);
  }
 }
 choose(n,{activity=[],lastProjectionChangeAt=0,orthographic=false,preferOrthographic=false}={}){
  if(this.stopped)return null;
  this.observe(n);if(!this.ready(n)||!this.current){this.phase=this.enabled?'waiting_for_native_frame':'disabled';return null;}
  const now=this.now(),c=this.current,a=activity.find(a=>a.name===n.target),fresh=(at,age)=>Number.isFinite(at)&&at<=now&&now-at<=age;
  if(fresh(a?.lastCombatAt,8000)||fresh(a?.lastInteractionAt,12000)){this.phase='protecting_live_action';return null;}
  if(finite(n.shotExecution?.view)&&n.shotExecution.requestId===n.requestId&&!['completed','blocked','cancelled'].includes(n.shotExecution.phase)){
   this.phase='awaiting_finite_endpoint';return null;
  }
  const lively=this.cadenceProfile==='lively';
  const still=lively?fresh(a?.positionAt,3000)&&Number.isFinite(a?.stillSince)&&now-a.stillSince>=3000:
   a?.motion==='stationary'&&fresh(a.positionAt,15000)&&Number.isFinite(a.stillSince)&&now-a.stillSince>=15000;
  const earlyMotion=lively&&still&&this.cue?.stationarySince!==a.stillSince&&now-c.since>=3000&&now-c.since<5000;
  if(now-c.since<this.intervalMs&&!earlyMotion){this.phase='holding_shot';return null;}
  const space=n.spatial,subject=n.targets?.find(t=>t.uuid===n.targetUuid&&t.name===n.target);
  if(!subject?.loaded||subject.alive!==true||space?.known!==true||space.targetUuid!==n.targetUuid
    ||space.nativeWorldEpoch!==n.nativeWorldEpoch||!fresh(space.at,2000)||space.floorSafe!==true){this.phase='waiting_for_scene_evidence';return null;}
  const caps=new Set(n.availableViews);
  const travelling=a?.motion!=='stationary'&&fresh(a?.lastMotionAt,5000);
  const tight=['tunnel','layered'].includes(space.layout);
  const orthoSafe=orthographic&&n.orthographic?.ready===true&&n.orthographic.worldCutawaySupported===false&&!n.orthographic.roomClip
    &&['open','room'].includes(space.layout)&&space.orthographicVisibility>=.8;
  const projectionAge=now-lastProjectionChangeAt,projectionHold=lively?10000:45000;
  let candidates;
  if(tight)candidates=['first_person','drone_eye'];
  else if(n.projection==='orthographic'){
   if(!lively&&projectionAge<45000&&45000-projectionAge<8000){this.phase='awaiting_projection_exit';return null;}
   candidates=projectionAge>=projectionHold?(lively?['drone_follow','drone_front_left','drone_eye']:['drone_front_left','drone_eye']):orthoSafe?rotate(orthographics,c.view):[];
  }
  else if((still||lively&&this.failedViews.size>0&&c.view==='first_person')&&orthoSafe&&preferOrthographic&&projectionAge>=(lively?10000:75000))candidates=orthographics;
  else candidates=earlyMotion?['drone_orbit_left','drone_orbit_right','drone_push_in','drone_follow']:
   rotate(lively?travelViews:still?perspectives:['drone_front_left','drone_side_right','drone_front_right','drone_side_left','drone_eye'],c.view);
  const pathReady=still&&space.layout==='open'&&space.headroom>=3.5&&space.spanX>=8&&space.spanZ>=8
    &&n.cameraScript?.schema===CAMERA_SCRIPT_PROTOCOL&&n.cameraScript.preflightRequiredForFinite===true&&n.rigCancelSupported===true
    &&n.projection!=='orthographic'&&n.drone?.active===true&&fresh(n.drone.lastRenderedAt,2000)
    &&!Array.from(this.blocked.values()).some(until=>until>now);
  const shot=n.shotExecution;
  const unavailable=shot?.requestId===n.requestId&&!finite(shot.view)&&shot.fallback===true?shot.view:null;
  for(const view of candidates){
   if(!caps.has(view)||view===c.view||view===unavailable||this.failedViews.has(view)||view.startsWith('ortho_')&&!orthoSafe||finite(view)&&!pathReady)continue;
   if(view.startsWith('ortho_')!==(n.projection==='orthographic')&&projectionAge<projectionHold)continue;
   const motion=finite(view)?{schema:CAMERA_SCRIPT_PROTOCOL,speed:lively?1:.75,durationMs:lively?4000:view.startsWith('drone_orbit_')?7500:6000,
      ...(view.startsWith('drone_orbit_')?{arcDegrees:lively?15:35}:{})}:
    view.startsWith('drone_')?{schema:CAMERA_SCRIPT_PROTOCOL,speed:lively?1.15:.75,
     ...(lively?{height:view==='drone_overview'?5.2:view==='drone_follow'?2.2:1.8,distance:view==='drone_overview'?7.5:5.5}:{})}:undefined;
   this.phase='proposing_sequence';
   if(earlyMotion)this.cueOffer={scope:c.scope,uuid:n.targetUuid,parent:n.requestId,stationarySince:a.stillSince};
   return{name:n.target,view,kind:travelling?'movement':'overview',at:now,reframe:true,reason:'native_scene_sequence',
    sequence:{schema:'mcvisual.shot-sequence/v1',previousView:c.view,shotAgeMs:now-c.since,subjectStationary:still,
      pathPreflightRequired:finite(view),nativeSceneAt:space.at,reviewRequired:!lively&&still&&now-c.since>=45000,
      ...(lively?{unavailableViews:[...this.failedViews.keys()],cadence:{schema:NATIVE_CAMERA_CADENCE_PROTOCOL,scope:c.scope,subjectUuid:n.targetUuid,requestId:n.requestId,since:c.since,
       cause:earlyMotion?'stationary_motion':'composition',stationarySince:still?a.stillSince:null,dueAt:c.since+(earlyMotion?3000:5000),deadlineAt:c.since+(earlyMotion?4000:7000)}}:{})},...(motion?{motion}:{})};
  }
  this.phase='holding_legal_view';return null;
 }
 stats(){return{enabled:this.enabled,phase:this.stopped?'stopped':this.phase,intervalMs:this.intervalMs,cadenceProfile:this.cadenceProfile,actualView:this.current?.view??null,stopped:this.stopped};}
 stop(){this.stopped=true;this.phase='stopped';}
}
function rotate(views,current){const i=views.indexOf(current);return i<0?[...views]:[...views.slice(i+1),...views.slice(0,i+1)];}
