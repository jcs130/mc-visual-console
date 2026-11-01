import {CAMERA_SCRIPT_PROTOCOL,blendCameraScripts} from './camera-script.mjs';
import {validateChoiceProbabilities} from './systemone-decisions.mjs';
export const SUBJECT_CHOICE_PROTOCOL='mcvisual.subject-choice/v1';

/** One current image plus real all-actor activity/airtime. Other cameras are explicitly unobserved. */
export function buildNativeSubjectDecision(native,rows,{forceReview=false,eligibleNames,now=Date.now()}={}){
 if(!native||!Array.isArray(rows)||rows.length>16||!Array.isArray(native.targets)||native.targets.length>16)return null;
 const targets=new Map((native.targets??[]).filter(t=>t.uuid&&t.alive!==false).map(t=>[t.name,t]));
 const allowed=Array.isArray(eligibleNames)?new Set(eligibleNames):null;
 const eligible=rows.filter(r=>targets.has(r.name)&&r.name!==native.target&&(!allowed||allowed.has(r.name))).slice(0,15);
 if(!eligible.length||!native.availableViews?.includes('first_person'))return null;
 const options=[...(!forceReview?[{id:'keep',name:native.target,uuid:native.targetUuid}]:[]),
  ...eligible.map((r,i)=>({...r,id:'subject'+i,uuid:targets.get(r.name).uuid,view:'first_person'}))];
 const current=rows.find(r=>r.name===native.target);
 const state={schema:SUBJECT_CHOICE_PROTOCOL,current:native.target,currentDwellMs:current?.dwellMs??0,
  reason:forceReview?'ordinary_scene_coverage_deadline':'compare_live_activity',
  imageEvidence:'Only the CURRENT subject is pictured. Other subjects have no preview. Judge their real activity and coverage facts, not an invented picture.',
  subjects:options.map(o=>({id:o.id,name:o.name,activity:o.kind??current?.kind??'unknown',
   activityAgeMs:Number.isFinite(o.at)?Math.max(0,now-o.at):null,motion:o.motionState??current?.motionState??'unknown',
   waitingMs:o.waitingMs??0,airtimeMs:o.airtimeMs??0,visits:o.visits??0,loaded:targets.get(o.name)?.loaded===true}))};
 return{schema:SUBJECT_CHOICE_PROTOCOL,forceReview,options,request:{state,questions:{subject:{type:'choice',
  instructions:'选择下一段直播应观察的人。优先真实战斗、成功操作和新进展；普通发言不能永久占镜。结合等待时间、累计出镜和当前主体驻留。没有其他人的截图不等于对方没有价值。当前有关键战斗时可保持；ordinary_scene_coverage_deadline 表示普通镜头已到覆盖期限，候选只含其他可观战角色，选最值得了解近况的一位。切换先用真实第一人称确认现场，再安排构图。只选给定 ID。',
  criteria:Object.fromEntries(options.map(o=>[o.id,o.id==='keep'?'继续当前主体':'观察 '+o.name+' 的真实近况']))}}}};
}
export function selectNativeSubject(menu,answer){
 const a=answer?.answers?.subject,criteria=menu?.request.questions.subject.criteria;
 if(!criteria||!Object.hasOwn(criteria,a?.choice))return{kind:'rules',reason:'invalid_subject_choice'};
 const probabilities=validateChoiceProbabilities(a.probabilities,criteria);
 if(probabilities){
  const sorted=Object.entries(probabilities).sort((a,b)=>b[1]-a[1]),[id,p]=sorted[0],margin=p-(sorted[1]?.[1]??0),
   entropy=sorted.length>1?-sorted.reduce((s,[,p])=>s+(p?p*Math.log(p):0),0)/Math.log(sorted.length):0;
  if(id==='keep')return{kind:'keep',source:'probabilities',margin,entropy};
  if(p<.45||margin<.1)return{kind:menu.forceReview?'rules':'keep',reason:'ambiguous_subject_choice',source:'probabilities',margin,entropy};
  return{kind:'use',choice:menu.options.find(o=>o.id===id),source:'probabilities',margin,entropy};
 }
 return a.choice==='keep'?{kind:'keep',source:'hard_choices'}:{kind:'use',choice:menu.options.find(o=>o.id===a.choice),source:'hard_choices'};
}

/** Legal native menu; quality is assessed from the ONE current image, not fabricated previews. */
export function nativeCameraCandidates(choice,n,{now=Date.now()}={}){
 if(!choice||!n.availableViews?.includes(choice.view))return[];
 const candidate=n.targets?.find(t=>t.name===choice.name);if(!candidate?.loaded||candidate.alive!==true)return[];
 const out=[],seen=new Set(),same=candidate.uuid===n.targetUuid;
 const script=n.cameraScript?.schema===CAMERA_SCRIPT_PROTOCOL;
 function add(id,view,profile){
  if(view.startsWith('ortho_')&&nativeSafeOrthographic(n)!==true)return;
  if(!n.availableViews.includes(view)||view.startsWith('drone_orbit_')||['drone_push_in','drone_pull_out'].includes(view))return;
  const key=view+':'+(profile??'');if(seen.has(key))return;seen.add(key);
  const motion=script&&view.startsWith('drone_')?{schema:CAMERA_SCRIPT_PROTOCOL,speed:profile==='slow'?.7:1,
    ...(['drone_follow','drone_front_left','drone_front'].includes(view)?{height:profile==='slow'?1.8:1,distance:profile==='slow'?6.5:5.5}:{})}:undefined;
  out.push({...choice,id,view,...(motion?{motion}:{})});
 }
 add('proposal',choice.view);
 if(script&&choice.view.startsWith('drone_'))add('proposal_slow',choice.view,'slow');
 if(same){
  if(['interaction','combat'].includes(choice.kind)||['tunnel','layered'].includes(n.spatial?.layout))add('eye_action','first_person');
  add('stable_eye','drone_eye');
  if(choice.kind==='movement')add('lead','drone_front_left');
  if(choice.kind==='conversation')add('front','drone_front');
  const c=n.spatial;
  if(n.orthographic?.ready&&c?.known===true&&c.targetUuid===candidate.uuid&&c.nativeWorldEpoch===n.nativeWorldEpoch
    &&c.floorSafe===true&&['open','room'].includes(c.layout)&&c.orthographicVisibility>=.8&&c.at<=now&&now-c.at<2000){
   add('ortho_context',choice.kind==='interaction'?'ortho_close':'ortho_isometric');
  }
 }
 return out.slice(0,6);
}
const nativeSafeOrthographic=n=>n.orthographic?.ready===true&&n.orthographic?.worldCutawaySupported===false;

/** Real probability distributions stay distinct from hard-vote fractions. */
export function selectCameraBallot(options,votes,previous){
 const criteria=Object.fromEntries(options.map(o=>[o.id,true])),weights={action:1.3,space:1.2,continuity:1.1};
 const valid=votes?.filter(v=>Object.hasOwn(criteria,v.choice)&&Object.hasOwn(weights,v.role))??[];
 if(valid.length<2)return{kind:'keep',reason:'insufficient_votes'};
 const distributions=valid.map(v=>validateChoiceProbabilities(v.probabilities,criteria));
 if(distributions.every(Boolean)){
  const total=valid.reduce((s,v)=>s+weights[v.role],0),scores=Object.fromEntries(options.map(o=>[o.id,
    valid.reduce((s,v,i)=>s+weights[v.role]*distributions[i][o.id],0)/total]));
  // Previous posterior only applies to the identical ordered menu, subject and program binding (host scoped).
  if(validateChoiceProbabilities(previous,criteria)&&Object.keys(previous).join('|')===Object.keys(scores).join('|'))for(const id of Object.keys(scores))scores[id]=.7*scores[id]+.3*previous[id];
  // Profiles split one camera family's mass; compare families before blending their parameters.
  const families=new Map();for(const o of options){const key=o.id==='keep'?'keep':o.name+'|'+o.view;const group=families.get(key)??{key,mass:0,options:[]};group.mass+=scores[o.id];group.options.push(o);families.set(key,group);}
  const ranked=[...families.values()].sort((a,b)=>b.mass-a.mass),family=ranked[0],p=family.mass,
   winner=family.options.slice().sort((a,b)=>scores[b.id]-scores[a.id])[0].id,margin=p-(ranked[1]?.mass??0);
  const entropy=-Object.values(scores).reduce((s,p)=>s+(p>0?p*Math.log(p):0),0)/Math.log(options.length);
  if(winner==='keep'||p<.5||margin<.12)return{kind:'keep',reason:'probability_hysteresis',scores,entropy,margin};
  const option=options.find(o=>o.id===winner),motion=blendCameraScripts(options,scores,winner);
  return{kind:'use',choice:{...option,...(motion?{motion}:{})},scores,entropy,margin,source:'probabilities'};
 }
 const totals=Object.fromEntries(options.map(o=>[o.id,valid.filter(v=>v.choice===o.id).length])),[winner,count]=Object.entries(totals).sort((a,b)=>b[1]-a[1])[0];
 return winner==='keep'||count<2?{kind:'keep',reason:'hard_vote_hold'}:{kind:'use',choice:options.find(o=>o.id===winner),source:'hard_choices'};
}

/** One pacing gate, advanced ONLY by actual rendered native observations, never by accepted advice. */
export class NativeCameraPacing{
 constructor({now=Date.now,currentView}={}){if(typeof currentView!=='function')throw Error('EXPLICIT_NATIVE_VIEW_REQUIRED');this.view=currentView;this.now=now;this.binding=null;this.current=null;this.history=[];this.left=new Map();this.stopped=false;}
 observe(n){
  if(this.stopped||n?.phase!=='attached'||!n.targetUuid||n.cameraUuid!==n.targetUuid||n.transition?.active||n.manualDetachRequested
    ||!Number.isFinite(n.renderedAt)||n.renderedAt>this.now()+1000||this.now()-n.renderedAt>3000)return;
  const binding=n.connectionEpoch+':'+n.nativeWorldEpoch;
  if(this.binding!==binding){this.binding=binding;this.current=null;this.history=[];this.left.clear();}
  const signature=[n.requestId,n.targetUuid,this.view(n)].join(':'),at=this.now();
  if(this.current?.signature===signature)return;
  if(this.current?.requestId===n.requestId&&this.current.uuid===n.targetUuid){
   // Collision/close-view recovery is the same camera operation, not another editorial cut.
   const projection=n.projection??'perspective';if(this.current.projection!==projection)this.current.projectionAt=at;
   this.current.signature=signature;this.current.view=this.view(n);this.current.projection=projection;return;
  }
  const old=this.current,subjectChanged=old&&old.uuid!==n.targetUuid,projection=n.projection??'perspective';
  const applied=Number.isFinite(n.offer?.at)&&n.offer.at<=at?n.offer.at:at;
  if(subjectChanged)this.left.set(old.uuid,at);
  if(old)this.history.push({at,subjectChanged:!!subjectChanged});
  this.current={signature,requestId:n.requestId,uuid:n.targetUuid,view:this.view(n),projection,shotAt:old?at:applied,
   subjectAt:!old?applied:subjectChanged?at:old.subjectAt,projectionAt:!old?-Infinity:old.projection!==projection?at:old.projectionAt};
  this.history=this.history.filter(h=>at-h.at<60000);
  for(const[k,t]of this.left)if(at-t>=60000)this.left.delete(k);
 }
 check(choice,n,{activity=[],recovery=false}={}){
  if(this.stopped)return{allow:false,reason:'stopped'};
  if(n?.manualDetachRequested||n?.screenOpen||['paused','unknown','cancelled'].includes(n?.phase))return{allow:false,reason:'manual_or_unresolved'};
  this.observe(n);const now=this.now(),c=this.current,subject=n.targets?.find(t=>t.name===choice.name)?.uuid;
  // Time-based expiry must progress while KEEP is held; no new shot may be needed to release it.
  for(const[k,t]of this.left)if(now-t>=60000)this.left.delete(k);
  if(!c&&n.phase==='idle'&&!n.manualDetachRequested)return{allow:true,reason:'initial_attachment'};
  // recovery is supplied only after the host's canonical death/position-loss verifier succeeds.
  if(recovery===true&&n.phase==='stopped'&&['target_identity_lost','target_died','target_position_unconfirmed'].includes(n.reason)
    &&n.connected===true&&n.authenticated===true&&n.spectator===true&&n.cameraUuid===n.observerUuid&&!n.manualDetachRequested)return{allow:true,reason:'verified_target_loss_recovery'};
  if(!c||!subject)return{allow:false,reason:'awaiting_render_binding'};
  const projection=choice.view.startsWith('ortho_')?'orthographic':'perspective',cross=subject!==c.uuid;
  this.history=this.history.filter(h=>now-h.at<60000);
  if(now-c.shotAt<12000)return{allow:false,reason:'minimum_shot_12s'};
  if(this.history.length>=4)return{allow:false,reason:'cut_budget_4_per_minute'};
  if(!cross&&projection!==c.projection&&now-c.projectionAt<45000)return{allow:false,reason:'projection_hold_45s'};
  if(cross){
   const current=activity.find(a=>a.name===n.target),engaged=Number.isFinite(current?.lastCombatAt)&&now-current.lastCombatAt<8000;
   if(engaged)return{allow:false,reason:'protect_live_combat'};
   const idle=current?.motion==='stationary'&&Number.isFinite(current.stillSince)&&now-current.stillSince>=20000;
   const urgent=choice.kind==='combat'&&Number.isFinite(choice.at)&&now-choice.at>=0&&now-choice.at<5000;
   if(now-c.subjectAt<(idle||urgent?12000:30000))return{allow:false,reason:'minimum_subject_hold'};
   const leftAt=this.left.get(subject),newProgress=['combat','movement','interaction'].includes(choice.kind)
     &&Number.isFinite(choice.at)&&choice.at>leftAt&&now-choice.at>=0&&now-choice.at<5000;
   // A quiet check-in can yield to genuinely NEW action, while the global cut budget still applies.
   if(leftAt!==undefined&&!(idle&&now-leftAt>=15000&&newProgress))return{allow:false,reason:'subject_return_cooldown_60s'};
   if(this.history.filter(h=>h.subjectChanged).length>=2)return{allow:false,reason:'subject_budget_2_per_minute'};
  }
  return{allow:true,reason:'pacing_passed'};
 }
 stop(){this.stopped=true;}
}
