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
});

export function selectNativeShot(choice,native,{enabled=false}={}){
  if(!choice||!enabled||!Array.isArray(native?.availableViews))return choice;
  const ready=new Set(native.availableViews);
  const preferences=choice.kind==='combat'?['drone_eye','drone_follow','third_person_back']:
    choice.kind==='interaction'?['first_person','drone_eye','third_person_back']:
    choice.kind==='movement'?['drone_front_left','drone_eye','drone_follow','third_person_back']:
    choice.kind==='conversation'?['drone_front','third_person_front','drone_eye']:
    choice.kind==='overview'?['drone_overview','drone_follow','third_person_back']:[choice.view];
  // An orbit is deliberate coverage, never an idle timer or random variation.
  if(choice.kind==='showcase'&&choice.verifiedOutcome===true)preferences.unshift('drone_orbit_left','drone_pull_out');
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
  return shot.phase===(recipe.finite?'completed':'holding')?{kind:'applied',reason:recipe.finite?'finite_endpoint_rendered':'native_rig_rendered'}:
    {kind:'waiting',reason:recipe.finite?'finite_motion_running':'rig_settling'};
}
