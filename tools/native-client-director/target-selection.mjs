/** Operator camera preference. Display only; no game actions or account creation. */
export const BROADCAST_SELECTION_SCHEMA='mcvisual.broadcast-selection/v1';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const name=value=>typeof value==='string'&&/^[_A-Za-z0-9]{1,16}$/.test(value);
export function resolveBroadcastSelection(value,native){
  if(value===null)return {mode:'auto',state:'ready',id:null};
  const invalid={mode:'invalid',state:'invalid_selection',id:null};
  if(!value||value.schema!==BROADCAST_SELECTION_SCHEMA||!uuid(value.id)
    ||!['auto','follow'].includes(value.mode)||!Number.isFinite(Date.parse(value.updatedAt))
    ||value.scope?.server!==native.server||!uuid(value.scope?.observerUuid)
    ||value.scope.observerUuid.toLowerCase()!==native.observerUuid?.toLowerCase())return invalid;
  if(value.mode==='auto')return {mode:'auto',state:'ready',id:value.id};
  const target=value.target;
  if(!name(target?.name)||!uuid(target?.uuid)||target.uuid.toLowerCase()===native.observerUuid?.toLowerCase())return invalid;
  const found=native.targets?.find(t=>t.name===target.name&&t.uuid?.toLowerCase()===target.uuid.toLowerCase()
    &&t.spectator===false&&t.alive!==false);
  return {mode:'follow',state:found?'ready':'waiting_target',id:value.id,target:{name:target.name,uuid:target.uuid}};
}
export function broadcastEligible(selection,names){
  if(selection.mode==='auto')return names;
  return selection.mode==='follow'&&selection.state==='ready'?names.filter(n=>n===selection.target.name):[];
}
/** Highest fresh scene priority is shared by rules and model menus. */
export function broadcastSubjects(selection,subjects){
  const allowed=new Set(broadcastEligible(selection,subjects.map(s=>s.name)));
  const rows=subjects.filter(s=>allowed.has(s.name));
  const priority=Math.max(0,...rows.map(s=>s.priority??0));
  return priority>0?rows.filter(s=>(s.priority??0)===priority):rows;
}
export function broadcastChoice(selection,choice,current,currentUuid,now){
  if(selection.mode==='auto')return choice;
  if(selection.mode!=='follow'||selection.state!=='ready')return null;
  if(current!==selection.target.name||currentUuid?.toLowerCase()!==selection.target.uuid.toLowerCase())
    return {name:selection.target.name,kind:'operator',at:now,view:'first_person',reason:'operator_selected_target'};
  return choice?.name===selection.target.name?choice:null;
}
export function broadcastAllows(selection,choice,subjects,current){
  if(!choice)return false;
  if(selection.mode!=='auto')return selection.mode==='follow'&&selection.state==='ready'&&choice.name===selection.target.name;
  const rows=broadcastSubjects(selection,subjects);
  // Same-subject camera composition remains possible when all scenes are quiet.
  return rows.some(s=>s.name===choice.name)&&(choice.name===current||rows.some(s=>s.name===choice.name&&s.priority>0)||!current);
}
/** Manual selection overrides editorial holds, not native safety/render/cut gates. */
export function broadcastPacing(selection,choice,gate){
  if(selection.mode==='follow'&&selection.state==='ready'&&choice?.name===selection.target.name
    &&choice.reason==='operator_selected_target'&&['protect_live_combat','minimum_subject_hold','subject_return_cooldown_60s','subject_budget_2_per_minute'].includes(gate.reason))
    return {allow:true,reason:'operator_subject_selection'};
  return gate;
}
