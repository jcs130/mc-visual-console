import {CAMERA_SCRIPT_PROTOCOL} from './camera-script.mjs';
const finite=view=>view?.startsWith('drone_orbit_')||['drone_push_in','drone_pull_out'].includes(view);
const perspectives=['drone_front_left','drone_orbit_left','drone_front','drone_push_in','drone_front_right','drone_orbit_right','drone_pull_out','drone_eye'];
const orthographics=['ortho_overview','ortho_close','ortho_isometric'];

/** Display-only shot progression. Native render, collision and pacing remain authoritative. */
export class NativeCameraSequence{
 constructor({enabled=false,now=Date.now,currentView,intervalMs=22000}={}){
  if(typeof currentView!=='function')throw Error('EXPLICIT_NATIVE_VIEW_REQUIRED');
  this.enabled=enabled===true;this.now=now;this.view=currentView;this.intervalMs=Math.max(16000,Math.min(45000,intervalMs));
  this.current=null;this.blocked=new Map();this.stopped=false;this.phase=this.enabled?'waiting_for_native_frame':'disabled';
 }
 ready(n){const now=this.now(),fresh=t=>Number.isFinite(t)&&t<=now&&now-t<=3000;
  return this.enabled&&!this.stopped&&n?.connected===true&&n.authenticated===true&&n.spectator===true&&n.phase==='attached'
   &&n.targetUuid&&n.cameraUuid===n.targetUuid&&!n.manualDetachRequested&&!n.screenOpen&&!n.transition?.active
   &&fresh(Date.parse(n.recordedAt))&&fresh(n.renderedAt);
 }
 observe(n){
  if(!this.ready(n))return;
  const now=this.now(),scope=n.connectionEpoch+':'+n.nativeWorldEpoch,view=this.view(n);
  if(this.current?.scope!==scope){this.current=null;this.blocked.clear();}
  if(this.current?.id!==n.requestId||this.current?.uuid!==n.targetUuid){
   const offered=n.offer?.id===n.requestId&&n.offer.accepted===true&&Number.isFinite(n.offer.at)&&n.offer.at<=now?n.offer.at:now;
   this.current={scope,id:n.requestId,uuid:n.targetUuid,view,since:offered};
  }else this.current.view=view;
  const shot=n.shotExecution;
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
  if(now-c.since<this.intervalMs){this.phase='holding_shot';return null;}
  const space=n.spatial,subject=n.targets?.find(t=>t.uuid===n.targetUuid&&t.name===n.target);
  if(!subject?.loaded||subject.alive!==true||space?.known!==true||space.targetUuid!==n.targetUuid
    ||space.nativeWorldEpoch!==n.nativeWorldEpoch||!fresh(space.at,2000)||space.floorSafe!==true){this.phase='waiting_for_scene_evidence';return null;}
  const caps=new Set(n.availableViews),still=a?.motion==='stationary'&&fresh(a.positionAt,15000)&&Number.isFinite(a.stillSince)&&now-a.stillSince>=15000;
  const tight=['tunnel','layered'].includes(space.layout);
  const orthoSafe=orthographic&&n.orthographic?.ready===true&&n.orthographic.worldCutawaySupported===false&&!n.orthographic.roomClip
    &&['open','room'].includes(space.layout)&&space.orthographicVisibility>=.8;
  const projectionAge=now-lastProjectionChangeAt;
  let candidates;
  if(tight)candidates=['first_person','drone_eye'];
  else if(n.projection==='orthographic')candidates=projectionAge>=45000?['drone_front_left','drone_eye']:
    orthoSafe?rotate(orthographics,c.view):[];
  else if(still&&orthoSafe&&preferOrthographic&&projectionAge>=75000)candidates=orthographics;
  else candidates=rotate(still?perspectives:['drone_front_left','drone_side_right','drone_front_right','drone_side_left','drone_eye'],c.view);
  const pathReady=still&&space.layout==='open'&&space.headroom>=3.5&&space.spanX>=8&&space.spanZ>=8
    &&n.cameraScript?.schema===CAMERA_SCRIPT_PROTOCOL&&n.cameraScript.preflightRequiredForFinite===true&&n.rigCancelSupported===true
    &&n.projection!=='orthographic'&&n.drone?.active===true&&fresh(n.drone.lastRenderedAt,2000)
    &&!Array.from(this.blocked.values()).some(until=>until>now);
  for(const view of candidates){
   if(!caps.has(view)||view===c.view||view.startsWith('ortho_')&&!orthoSafe||finite(view)&&!pathReady)continue;
   if(view.startsWith('ortho_')!==(n.projection==='orthographic')&&projectionAge<45000)continue;
   const motion=finite(view)?{schema:CAMERA_SCRIPT_PROTOCOL,speed:.75,durationMs:view.startsWith('drone_orbit_')?7500:6000,
      ...(view.startsWith('drone_orbit_')?{arcDegrees:35}:{})}:
    view.startsWith('drone_')?{schema:CAMERA_SCRIPT_PROTOCOL,speed:.75}:undefined;
   this.phase='proposing_sequence';
   return{name:n.target,view,kind:still?'overview':'movement',at:now,reframe:true,reason:'native_scene_sequence',
    sequence:{schema:'mcvisual.shot-sequence/v1',previousView:c.view,shotAgeMs:now-c.since,subjectStationary:still,
      pathPreflightRequired:finite(view),nativeSceneAt:space.at},...(motion?{motion}:{})};
  }
  this.phase='holding_legal_view';return null;
 }
 stats(){return{enabled:this.enabled,phase:this.stopped?'stopped':this.phase,intervalMs:this.intervalMs,actualView:this.current?.view??null,stopped:this.stopped};}
 stop(){this.stopped=true;this.phase='stopped';}
}
function rotate(views,current){const i=views.indexOf(current);return i<0?[...views]:[...views.slice(i+1),...views.slice(0,i+1)];}
