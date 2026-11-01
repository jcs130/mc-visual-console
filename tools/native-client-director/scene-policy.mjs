/** Display selection only: never a game planner, skill selector or goal owner. */
export function belongsToActor(name,event){
  if(!/\.chat$/.test(event.type??''))return true;
  const sender=/^\[MC\] ([A-Za-z0-9_]{1,16}):/.exec(String(event.text??''));
  return !sender||sender[1].toLowerCase()===name.toLowerCase();
}
/** Attribute public speech heard on any trusted native feed, never another player's state. */
export function eventActor(sourceName,event,allowed){
  if(!/\.chat$/.test(event.type??''))return allowed.includes(sourceName)?sourceName:null;
  const sender=/^\[MC\] ([A-Za-z0-9_]{1,16}):/.exec(String(event.text??''));
  return sender?allowed.find(n=>n.toLowerCase()===sender[1].toLowerCase())??null:null;
}
function originalActions(text){
  const actions=[];
  for(const pattern of [
    /^(?:做成的:\s*)?第\s*\d+\s*步\s*(\{[^\r\n]*\})\s*用时[^:\r\n]*:\s*([^\r\n]*)/gm,
    /^.*?任务#\d+完成:\s*(\{[^\r\n]*\})\s*:\s*([^\r\n]*)/gm,
  ])for(const match of text.matchAll(pattern)){
    try{
      const call=JSON.parse(match[1]);
      if(typeof call.skill==='string'&&!/没做成|失败|试算|没什么可做的/.test(match[2]))
        actions.push({skill:call.skill,receipt:match[2]});
    }catch{/* A label or chat claim is not an executed native step. */}
  }
  return actions;
}
export function classifyEvent(event,now=Date.now()){
  const at=Date.parse(event.ts??event.at);
  if(!Number.isFinite(at)||at>now+1000||now-at>60_000)return null;
  if(!/^(?:minecraft|mymc)\./.test(event.type??''))return null;
  const text=String(event.text??'').slice(0,1800);
  if(/\.combat$/.test(event.type??'')||(/\.reflex$/.test(event.type??'')||/^\[反射\]/.test(text))&&/攻击|战斗|受击|格挡|撤退|击杀|敌人/.test(text))
    return {at,score:/death|死亡|只剩/.test(text)?10:8,kind:'combat'};
  const execution=event.execution;
  if(execution?.terminal===true){
    const steps=execution.evidence?.steps??[];
    if(steps.some(s=>s.outcome==='ok'&&s.observedEffect?.skill==='attack'))return {at,score:8,kind:'combat'};
    if(steps.some(s=>s.outcome==='ok'&&['craft','smelt','build','take','stow','give'].includes(s.observedEffect?.skill)))
      return {at,score:5,kind:'interaction'};
    if(steps.some(s=>s.outcome==='ok'&&['goto','goto_player','tunnel'].includes(s.observedEffect?.skill))){
      const moved=steps.some(s=>s.observedEffect?.changed?.position===true);
      if(moved)return {at,score:3,kind:'movement'};
    }
  }
  // Original Cortico has text receipts. A chat/plan/preview is not a body event.
  if(/\.task$/.test(event.type??'')){
    const actions=originalActions(text);
    if(actions.some(a=>a.skill==='attack'&&/打死了|命中 [1-9]/.test(a.receipt)))return {at,score:8,kind:'combat'};
    if(actions.some(a=>['craft','smelt','take','stow','collect'].includes(a.skill)
      &&/取出.{0,20}×|做出了|合成了|合成出来|存进了|挖了 [1-9]/.test(a.receipt)))return {at,score:5,kind:'interaction'};
    if(actions.some(a=>['goto','goto_player'].includes(a.skill)&&/到了 \(|到.{0,20}身边了/.test(a.receipt)
      ||a.skill==='find'&&/朝(?:东北|东南|西北|西南|东|南|西|北)走(?:了|满了)\s*[1-9]\d*(?:\.\d+)?\s*格/.test(a.receipt)))
      return {at,score:3,kind:'movement'};
  }
  if(/\.chat$/.test(event.type??'')&&/^\[MC\] [A-Za-z0-9_]{1,16}:/.test(text))
    return {at,score:1.5,kind:'conversation'};
  return null;
}
export class SceneSelector{
  constructor(names,{minDwellMs=30_000,maxDwellMs=120_000,cinematicFraming=false}={}){
    this.names=[...names];this.minDwellMs=Math.max(10_000,minDwellMs);
    this.maxDwellMs=Math.max(this.minDwellMs,maxDwellMs);this.activities=new Map();this.presence=new Map();this.cinematicFraming=cinematicFraming===true;
    this.available=null;
  }
  setAvailable(names){this.available=names===null?null:new Set(names.filter(n=>this.names.includes(n)));}
  remember(name,value){
    const activities=this.activities.get(name)??new Map(),previous=activities.get(value.kind);
    if(!previous||value.at>=previous.at)activities.set(value.kind,value);
    this.activities.set(name,activities);
  }
  observePosition(name,{at,position:pos,scope,source='observer'},now=Date.now()){
    if(!this.names.includes(name)||!Number.isFinite(at)||at>now+1000||now-at>15000
      ||typeof scope!=='string'||!scope||scope.length>256||!Array.isArray(pos)||pos.length!==3
      ||!pos.every(n=>Number.isFinite(n)&&Math.abs(n)<=30_000_000))return;
    const old=this.presence.get(name);
    if(old&&(at<=old.at||source==='body'&&old.source==='observer'&&now-old.at<=15000))return;
    const gap=old?at-old.at:Infinity,dist=old?Math.hypot(...pos.map((v,i)=>v-old.pos[i])):Infinity;
    const same=old&&old.scope===scope&&old.source===source&&gap<=20000&&dist<=64;
    // Accumulate slow walking against an anchor, rather than discarding sub-block steps.
    const moved=same&&Math.hypot(...pos.map((v,i)=>v-old.anchor[i]))>=0.75;
    this.presence.set(name,{at,pos:[...pos],scope,source,anchor:!same||moved?[...pos]:old.anchor,
      stillSince:!same||moved?at:old.stillSince});
    if(moved)this.remember(name,{at,score:4,kind:'movement',source:'observed-native-position-delta'});
  }
  stationary(name,now){const p=this.presence.get(name);return !!p&&now-p.at<=15000&&p.at-p.stillSince>=8000;}
  inspect(now=Date.now()){
    return this.names.map(name=>{const p=this.presence.get(name),a=this.activities.get(name);
      return {name,available:this.available===null?null:this.available.has(name),positionAt:p?.at??null,
        motion:!p||now-p.at>15000?'unknown':this.stationary(name,now)?'stationary':'recent_sample',
        stillSince:p?.stillSince??null,lastSpeechAt:a?.get('conversation')?.at??null,
        lastMotionAt:a?.get('movement')?.at??null,lastCombatAt:a?.get('combat')?.at??null,lastInteractionAt:a?.get('interaction')?.at??null};});
  }
  observe(name,event,now=Date.now()){
    if(!this.names.includes(name))return;
    // Only an owned native world snapshot supplies position; chat claims never do.
    if(event.type==='minecraft.world.snapshot'||event.type==='mymc.world.snapshot'){
      const at=Date.parse(event.ts??event.at),first=String(event.text??'').split('\n',1)[0];
      const match=/^\[Minecraft\] .{0,180}?站在格\s*\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/u.exec(first);
      if(match&&Number.isFinite(at)&&at<=now+1000&&now-at<=15000){
        this.observePosition(name,{at,position:match.slice(1).map(Number),scope:'body:'+event.run,source:'body'},now);
      }
    }
    const value=classifyEvent(event,now);if(value)this.remember(name,value);
  }
  choose(current,currentSince,now=Date.now(),currentView=null){
    const stationary=name=>this.stationary(name,now);
    const scored=this.names.filter(name=>this.available===null||this.available.has(name)).flatMap(name=>{
      const activities=[...(this.activities.get(name)?.values()??[])];
      return activities.map(e=>{
        const age=now-e.at,horizon=e.kind==='combat'?12000:e.kind==='interaction'?15000:e.kind==='conversation'?45000:20000;
        const staleMovement=e.kind==='movement'&&stationary(name);
        return {name,score:!staleMovement&&age>=0&&age<=horizon?e.score*Math.exp(-age/(e.kind==='conversation'?30000:12000)):0,kind:e.kind,at:e.at};
      });
    }).filter(s=>s.score>=0.15);
    const physical=scored.filter(s=>s.kind!=='conversation').sort((a,b)=>b.score-a.score);
    // Recency, not message volume, selects the speaker when no real action is fresh.
    const speakers=scored.filter(s=>s.kind==='conversation').sort((a,b)=>b.at-a.at);
    const best=physical[0]??speakers[0];
    if(!best||best.score<0.15){
      if(this.cinematicFraming&&current&&currentView&&currentView!=='drone_overview'&&stationary(current)
        &&now-this.presence.get(current).stillSince>=15000)
        return {name:current,score:0,kind:'overview',at:this.presence.get(current).at,view:'drone_overview',reframe:true};
      return null;
    }
    const own=physical.find(s=>s.name===current),dwell=now-currentSince;
    if(current&&current!==best.name){
      if(best.kind==='conversation'){
        if(best.at<=currentSince||dwell<(stationary(current)?12000:this.minDwellMs))return null;
        return {...best,view:this.cinematicFraming?'drone_follow':'third_person_back',
          reason:stationary(current)?'stationary_current_recent_speaker':'recent_speaker_no_fresh_action'};
      }
      const urgent=best.kind==='combat'&&best.score>=7&&dwell>=10_000;
      const idleYield=stationary(current)&&(own?.score??0)<0.15&&best.kind!=='conversation'&&dwell>=10000;
      if(dwell<this.minDwellMs&&!urgent&&!idleYield)return null;
      const physicalOverConversation=!own;
      if(!physicalOverConversation&&dwell<this.maxDwellMs&&best.score<(own?.score??0)+1.5)return null;
    }
    const view=best.kind==='interaction'?'first_person':this.cinematicFraming
      ?best.kind==='combat'?'drone_overview':'drone_follow':'third_person_back';
    if(current===best.name){
      if(!this.cinematicFraming||!currentView||view===currentView||now-currentSince<10000)return null;
      return {...best,view,reframe:true};
    }
    return {...best,view,reason:best.kind==='conversation'?'recent_speaker':'fresh_physical_activity'};
  }
}
