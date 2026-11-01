/** Shared descriptions and conservative fallback rules; native runtime capabilities remain authoritative. */
export const NATIVE_CAMERA_RECIPES = Object.freeze({
  first_person:{recipeId:'pov_action',label:'原生第一人称',finite:false},
  third_person_back:{recipeId:'rear_follow',label:'原生后方第三人称',finite:false},
  third_person_front:{recipeId:'front_lead',label:'原生前方第三人称',finite:false},
  drone_follow:{recipeId:'rear_follow',label:'稳定后方跟随',finite:false},
  drone_overview:{recipeId:'high_context',label:'高位透视全景',finite:false},
  drone_eye:{recipeId:'eye_follow',label:'平视跟随',finite:false},
  drone_front:{recipeId:'front_lead',label:'人物前方往后看',finite:false},
  drone_front_left:{recipeId:'front_lead',label:'前方左斜角',finite:false},
  drone_front_right:{recipeId:'front_lead',label:'前方右斜角',finite:false},
  drone_side_left:{recipeId:'side_track',label:'左侧跟拍',finite:false},
  drone_side_right:{recipeId:'side_track',label:'右侧跟拍',finite:false},
  drone_low:{recipeId:'low_hero',label:'低机位仰视',finite:false},
  drone_orbit_left:{recipeId:'orbit_arc',label:'左向60度有限环绕',finite:true},
  drone_orbit_right:{recipeId:'orbit_arc',label:'右向60度有限环绕',finite:true},
  drone_push_in:{recipeId:'push_in',label:'有终点的推近',finite:true},
  drone_pull_out:{recipeId:'pull_out_reveal',label:'有终点的拉远',finite:true},
  ortho_isometric:{recipeId:'ortho_overview',label:'正交等距跟随',finite:false,projection:'orthographic',projectionProfile:'ortho_isometric'},
  ortho_overview:{recipeId:'ortho_overview',label:'正交布局全景',finite:false,projection:'orthographic',projectionProfile:'ortho_overview'},
  ortho_close:{recipeId:'ortho_overview',label:'正交近景',finite:false,projection:'orthographic',projectionProfile:'ortho_close'},
  ortho_top:{recipeId:'overhead_tactical',label:'正交俯视',finite:false,projection:'orthographic',projectionProfile:'ortho_top'},
});

/** Adopt the rendered view, never the name of a rig that already fell back. */
export function nativeCurrentView(native){
  const available=new Set(native?.availableViews??[]);
  if(native?.projection==='orthographic'&&native.orthographic?.active===true&&available.has(native.projectionProfile))return native.projectionProfile;
  if(available.has(native?.effectiveView))return native.effectiveView;
  if(native?.drone?.active===true&&available.has(native.droneShot))return native.droneShot;
  return native?.perspective==='THIRD_PERSON_FRONT'?'third_person_front':native?.perspective==='THIRD_PERSON_BACK'?'third_person_back':'first_person';
}

/** A safety fallback is recoverable; intentional POV interaction retains its close view. */
export function mayPreferOrthographic(view,{screenOpen=false,lastInteractionAt=null,preferOrthographic=false,now=Date.now()}={}){
  if(screenOpen)return false;
  if(['drone_overview','drone_eye','drone_follow','drone_front_left'].includes(view))return true;
  return view==='first_person'&&(preferOrthographic||lastInteractionAt===null||Number.isFinite(lastInteractionAt)&&now-lastInteractionAt>15000);
}

export function selectNativeShot(choice,native,{enabled=false,orthographic=false,preferOrthographic=false,now=Date.now(),lastProjectionChangeAt=0}={}){
  if(!choice||!enabled&&!orthographic||!Array.isArray(native?.availableViews))return choice;
  const ready=new Set(native.availableViews);
  const preferences=choice.kind==='combat'?['drone_eye','drone_follow','third_person_back']:
    choice.kind==='interaction'?['first_person','drone_eye','third_person_back']:
    choice.kind==='movement'?['drone_front_left','drone_eye','drone_follow','third_person_back']:
    choice.kind==='conversation'?['drone_front','third_person_front','drone_eye']:
    choice.kind==='overview'?['drone_overview','drone_follow','third_person_back']:[choice.view];
  // An orbit is deliberate coverage, never an idle timer or random variation.
  if(choice.kind==='showcase'&&choice.verifiedOutcome===true)preferences.unshift('drone_orbit_left','drone_pull_out');
  const context=native.spatial,subject=native.targets?.find(t=>t.name===choice.name)?.uuid;
  const currentOrthoSafe=native.phase==='attached'&&native.projection==='orthographic'&&native.orthographic?.active===true
    &&native.targetUuid&&native.cameraUuid===native.targetUuid&&context?.targetUuid===native.targetUuid
    &&context.nativeWorldEpoch===native.nativeWorldEpoch&&context.known===true&&context.floorSafe===true
    &&['open','room'].includes(context.layout)&&context.orthographicVisibility>=.8
    &&Number.isFinite(context.at)&&context.at<=now&&now-context.at<2000;
  if(orthographic&&preferOrthographic&&currentOrthoSafe&&choice.name!==native.target&&now-lastProjectionChangeAt<45000)return null;
  const canOrtho=orthographic&&native.orthographic?.ready===true&&context?.targetUuid===subject&&native.cameraUuid===subject
    &&context.nativeWorldEpoch===native.nativeWorldEpoch&&context.known===true&&['open','room'].includes(context.layout)&&context.floorSafe===true
    &&context.orthographicVisibility>=.8&&Number.isFinite(context.at)&&context.at<=now&&now-context.at<2000
    &&(native.projection==='orthographic'||now-lastProjectionChangeAt>=45000);
  const interactionOrtho=preferOrthographic&&native.screenOpen!==true&&choice.kind==='interaction';
  if(canOrtho&&native.projection==='orthographic'&&ready.has(native.projectionProfile)
    &&(choice.kind!=='interaction'||interactionOrtho)&&now-lastProjectionChangeAt<45000)
    preferences.unshift(native.projectionProfile);
  else if(canOrtho&&(['overview','conversation','movement'].includes(choice.kind)||interactionOrtho||native.projection==='orthographic'&&choice.kind==='combat'))
    preferences.unshift(choice.kind==='overview'?'ortho_overview':choice.kind==='conversation'||interactionOrtho?'ortho_close':'ortho_isometric');
  const view=preferences.find(v=>ready.has(v))??(ready.has(choice.view)?choice.view:null);
  return view?{...choice,view,framingReason:'native_capability_and_activity'}:null;
}

/** Actor attachment is separate from the selected view or finite script being on screen. */
export function nativeShotReceipt(native,request,now=Date.now(),{maxAgeMs=3000}={}){
  if(!native||!request||native.requestId!==request.id||native.activeLease!==request.lease
    ||native.connectionEpoch!==request.connectionEpoch
    ||request.nativeWorldEpoch!==undefined&&native.nativeWorldEpoch!==request.nativeWorldEpoch)return{kind:'waiting',reason:'binding_not_confirmed'};
  if(['unknown','paused','stopped'].includes(native.phase))return{kind:'unknown',reason:native.reason};
  if(native.phase==='cancelled')return{kind:'cancelled',reason:native.reason};
  if(native.phase!=='attached'||native.targetUuid!==request.targetUuid||native.cameraUuid!==request.targetUuid)
    return{kind:'waiting',reason:'actor_attachment_pending'};
  const fresh=at=>Number.isFinite(at)&&at>=request.issuedAt&&at<=now&&now-at<=maxAgeMs;
  const rendered=fresh(native.renderedAt);
  if(!rendered||native.transition?.active===true)return{kind:'waiting',reason:'program_frame_pending'};
  if(request.view.startsWith('ortho_')){
    const execution=native.orthographic;
    if(execution?.requestId!==request.id||execution.view!==request.view)return{kind:'waiting',reason:'projection_binding_pending'};
    if(['blocked','cancelled','stopped','paused'].includes(execution.phase))return{kind:'rejected',reason:execution.reason??'projection_unavailable'};
    if(native.projection!=='orthographic'||native.projectionProfile!==request.view||execution.active!==true
      ||execution.nativeWorldEpoch!==native.nativeWorldEpoch||execution.targetUuid!==request.targetUuid||!fresh(execution.renderedAt))
      return{kind:'waiting',reason:'actual_projection_frame_pending'};
    return execution.phase==='holding'?{kind:'applied',reason:'orthographic_projection_rendered'}:{kind:'waiting',reason:'projection_settling'};
  }
  if(!request.view.startsWith('drone_')){
    const actual={first_person:'FIRST_PERSON',third_person_back:'THIRD_PERSON_BACK',third_person_front:'THIRD_PERSON_FRONT'}[request.view];
    return native.perspective===actual?{kind:'applied',reason:'native_view_rendered'}:{kind:'waiting',reason:'native_view_pending'};
  }
  const shot=native.shotExecution,recipe=NATIVE_CAMERA_RECIPES[request.view];
  if(!recipe||shot?.requestId!==request.id||shot.view!==request.view)return{kind:'waiting',reason:'shot_binding_pending'};
  const adaptive=['drone_follow','drone_eye','drone_overview'].includes(request.view);
  if(['blocked','cancelled'].includes(shot.phase)||shot.fallback===true&&!adaptive)return{kind:'rejected',reason:shot.reason??'requested_shot_degraded'};
  if(native.drone?.active!==true||!fresh(native.drone.lastRenderedAt))
    return{kind:'waiting',reason:'native_rig_frame_pending'};
  if(request.motion&&['holding','completed'].includes(shot.phase)){
    const m=request.motion,match=(a,b)=>typeof a==='number'&&Math.abs(a-b)<1e-6;
    if(shot.scriptSchema!==m.schema||['distance','height','speed','arcDegrees'].some(k=>m[k]!==undefined&&!match(shot[k],m[k]))
      ||m.durationMs!==undefined&&!match(shot.durationMs,Math.round(m.durationMs/(m.speed??1))))return{kind:'rejected',reason:'script_parameters_not_rendered'};
  }
  return shot.phase===(recipe.finite?'completed':'holding')?{kind:'applied',reason:recipe.finite?'finite_endpoint_rendered':'native_rig_rendered'}:
    {kind:'waiting',reason:recipe.finite?'finite_motion_running':'rig_settling'};
}
