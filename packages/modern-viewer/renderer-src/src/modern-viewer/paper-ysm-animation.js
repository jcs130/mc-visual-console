import {compilePaperMolang} from './paper-ysm-molang.js';
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const vector = v => Array.isArray(v) && v.length === 3;
const catmull = (a, b, c, d, t) => .5 * ((2 * b) + (-a + c) * t + (2*a - 5*b + 4*c - d) * t*t + (-a + 3*b - 3*c + d) * t*t*t);
const readVector = (v, channel) => {
  if (channel === 'scale' && (Number.isFinite(v) || typeof v === 'string')) v = [v, v, v];
  if (!vector(v)) throw Error('YSM_KEYFRAME_UNSUPPORTED');
  return v.map(compilePaperMolang);
};
function compileTrack(source, channel) {
  if (vector(source) || Number.isFinite(source) || typeof source === 'string') {
    const v = readVector(source, channel); return (_time, context) => v.map(fn => fn(context));
  }
  if (!object(source) || !Object.keys(source).length || Object.keys(source).length > 512) throw Error('YSM_KEYFRAME_UNSUPPORTED');
  const frames = Object.entries(source).map(([key, v]) => {
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(key) || Number(key) > 600) throw Error('YSM_KEYFRAME_UNSUPPORTED');
    const structured = object(v), mode = structured ? v.lerp_mode ?? 'linear' : 'linear';
    if (!['linear','catmullrom'].includes(mode) || structured && Object.keys(v).some(k => !['pre','post','lerp_mode'].includes(k))) throw Error('YSM_INTERPOLATION_UNSUPPORTED');
    const pre = readVector(structured ? v.pre ?? v.post : v, channel), post = readVector(structured ? v.post ?? v.pre : v, channel);
    return {time:Number(key),pre,post,mode};
  }).sort((a,b) => a.time-b.time);
  const read = (v, context) => v.map(fn => fn(context));
  return (time, context) => {
    if (time < frames[0].time) return read(frames[0].pre,context);
    const last = frames.at(-1); if (time >= last.time) return read(last.post,context);
    const index = frames.findIndex(frame => frame.time > time), a = frames[index-1], b = frames[index];
    const from = read(a.post,context), to = read(b.pre,context), t = (time-a.time)/(b.time-a.time);
    if (b.mode === 'catmullrom') {
      const before = read(frames[Math.max(0,index-2)].post,context), after = read(frames[Math.min(frames.length-1,index+1)].pre,context);
      return from.map((v,i) => catmull(before[i],v,to[i],after[i],t));
    }
    return from.map((v,i) => v+(to[i]-v)*t);
  };
}
export function compilePaperYsmClip(definition, name, bones) {
  const clip = definition?.animations?.[name];
  if (!clip || definition.format_version !== '1.8.0') throw Error('YSM_CLIP_UNAVAILABLE:'+name);
  const length = clip.animation_length ?? 0;
  if (!Number.isFinite(length) || length < 0 || length > 3600 || ![undefined,false,true,'hold_on_last_frame'].includes(clip.loop) ||
      Object.keys(clip.bones??{}).length > 512) throw Error('YSM_CLIP_UNSUPPORTED');
  // Shared animation files may include optional bones absent from this model.
  // Bind only actual bones, retaining the omitted names for diagnostics.
  const ignoredBones = Object.keys(clip.bones??{}).filter(bone => !bones.has(bone));
  const tracks = Object.entries(clip.bones??{}).filter(([bone]) => bones.has(bone)).map(([bone, channels]) => {
    if (!object(channels) || Object.keys(channels).some(c => !['rotation','position','scale'].includes(c))) throw Error('YSM_ANIMATION_BONE_UNSUPPORTED:'+bone);
    return [bone, Object.fromEntries(Object.entries(channels).map(([channel, track]) => [channel,compileTrack(track,channel)]))];
  });
  const timeline = Object.entries(clip.timeline??{}).map(([t, commands]) => {
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(t) || Number(t)>600) throw Error('YSM_TIMELINE_UNSUPPORTED');
    commands = Array.isArray(commands) ? commands : [commands];
    if(commands.length>32) throw Error('YSM_TIMELINE_BUDGET');
    return {time:Number(t), commands:commands.map(compilePaperMolang)};
  }).sort((a,b)=>a.time-b.time);
  if(timeline.length>128) throw Error('YSM_TIMELINE_BUDGET');
  return {name,length,loop:clip.loop===true,hold:clip.loop==='hold_on_last_frame',tracks,timeline,ignoredBones};
}
export function samplePaperYsmClip(clip, seconds, context, cursor={cycle:-1,time:-1}) {
  const cycle = clip.loop && clip.length ? Math.floor(seconds/clip.length) : 0;
  const time = clip.length ? clip.loop ? seconds%clip.length : Math.min(seconds,clip.length) : 0;
  // Process event keyframes once, including time zero. New action tokens receive
  // a fresh cursor while Molang variables persist for original sword combos.
  const start = cycle === cursor.cycle && time >= cursor.time ? cursor.time : -1;
  context.queries['query.anim_time'] = time;
  const read = fn => {try{return fn();}catch(error){if(!Array.isArray(context.errors))throw error;context.errors.push(error.message);return undefined;}};
  for (const event of clip.timeline) if (event.time>start && event.time<=time) for (const command of event.commands) read(()=>command(context));
  cursor.cycle=cycle;cursor.time=time;
  return new Map(clip.tracks.map(([bone,channels])=>[bone,Object.fromEntries(Object.entries(channels).map(([channel,sample])=>[channel,read(()=>sample(time,context))]).filter(([,value])=>value!==undefined))]));
}
export function applyPaperYsmPose(model, pose, additiveRotation=false) {
  for (const [name,channels] of pose) {
    const bone=model.bones.get(name), initial=model.initial.get(name);
    for (const [channel,v] of Object.entries(channels)) {
      if(!v.every(n=>Number.isFinite(n)&&Math.abs(n)<=65536))throw Error('YSM_ANIMATION_VALUE_INVALID');
      if(channel==='rotation'){
        const base=additiveRotation?bone.rotation:initial.rotation;
        bone.rotation.set(base.x+v[0]*Math.PI/180,base.y+v[1]*Math.PI/180,base.z+v[2]*Math.PI/180,'ZYX');
      }
      else if(channel==='position')bone.position.set(initial.position.x+v[0]/16,initial.position.y-v[1]/16,initial.position.z+v[2]/16);
      else bone.scale.fromArray(v);
    }
  }
}
export function applyPaperYsmAnimation(model,definition,name,seconds,query={}) {
  const queries={...query,'ysm.is_close_eyes':Number(query.closeEyes??false),'ysm.head_yaw':query.headYaw??0,'ysm.head_pitch':query.headPitch??0};
  const clip=compilePaperYsmClip(definition,name,model.bones);model.reset();
  applyPaperYsmPose(model,samplePaperYsmClip(clip,seconds,{variables:Object.create(null),queries}));
}

export function paperYsmItemCategory(item) {
  const name=String(item?.name??'').replace(/^minecraft:/,'');
  if(!name)return 'empty';
  if(/_(sword|pickaxe|shovel|hoe|axe)$/.test(name))return name.split('_').at(-1);
  return ({trident:'spear',splash_potion:'throwable_potion',lingering_potion:'throwable_potion',potion:'drink',milk_bucket:'drink',honey_bottle:'drink',goat_horn:'toot_horn'})[name]??name;
}
function selectArmClip(definition, kind, hand, item) {
  const names=definition?.animations??{}, id=item?.name?.includes(':')?item.name:'minecraft:'+item?.name;
  const prefix=kind==='swing' && hand==='mainhand'?'swing':kind+'_'+hand;
  const category=paperYsmItemCategory(item);
  // Exact ID takes priority over built-in item categories, then generic hold.
  return [prefix+'$'+id,prefix+':'+category,prefix].find(name=>Object.hasOwn(names,name));
}
export class PaperYsmAnimation {
  constructor(model,main,{arm=null,extra=null,controllers=[]}={}) {
    this.model=model;this.main=main;this.arm=arm;this.extra=extra;this.controllers=controllers;
    this.compiled=new Map();this.layers=new Map();this.variables=Object.create(null);this.selected=[];this.errors=[];this.start=null;
  }
  clip(def,name){let map=this.compiled.get(def);if(!map){map=new Map();this.compiled.set(def,map);}if(!map.has(name))map.set(name,compilePaperYsmClip(def,name,this.model.bones));return map.get(name);}
  apply(state,now) {
    const previous=this.waterTransition?.lastPose;
    this.start??=now;this.model.reset();this.errors=[];this.selected=[];
    const m=state.motion??state, speed=m.horizontalSpeed??0, pose=m.pose===2?'sleeping':m.pose;
    this.moving = speed > (this.moving ? 0.03 : 0.08);
    const inhibited=m.bodyState?.source==='server' && m.bodyState.canAct===false;
    const downed=inhibited && m.bodyState.pose==='downed';
    const sleeping=!inhibited && pose==='sleeping', restricted=inhibited||sleeping;
    let base=pose==='sleeping'?'sleep':pose==='dying'?'death':pose==='spin_attack'?'riptide':pose==='fall_flying'?'elytra_fly':
      pose==='swimming'?'swim':m.flying===true?'fly':m.inWater===true&&m.onGround===false?
        (speed>.2?'swim':this.main.animations?.swim_stand?'swim_stand':'swim'):
        m.onGround===false?'jump':m.crouching===true?(this.moving?'sneak':'sneaking'):this.moving?(m.sprinting===true?'run':'walk'):'idle';
    if(inhibited){base=downed&&this.main.animations?.downed?'downed':'idle';this.waterTransition=null;this.layers.clear();}
    // appearanceMotion stores Java pitch degrees (positive down). YSM's
    // head_pitch query is positive up, as is legacy Mineflayer pitch in radians.
    // Convert here once so authored hair/eye tracks and the Head look agree.
    const headPitch=m.headPitchDegrees!==undefined?-m.headPitchDegrees:(state.pitch??0)*180/Math.PI;
    const queries={'query.life_time':(now-this.start)/1000,'query.ground_speed':speed,'query.is_jumping':Number(m.onGround===false),
      'ysm.head_yaw':m.headYawDegrees??0,'ysm.head_pitch':headPitch,'ysm.is_close_eyes':0};
    const equipment=m.equipment??state.equipment??[];
    queries['ysm.has_mainhand']=Number(!!equipment[0]);queries['ysm.has_offhand']=Number(!!equipment[1]);
    for(const [field,query]of [['health','query.health'],['maxHealth','query.max_health'],['verticalSpeed','query.vertical_speed']])if(Number.isFinite(m[field]))queries[query]=m[field];
    const context={queries,variables:this.variables,errors:this.errors};const keep=new Set(),ignoredBones=new Set();
    const layer=(key,definition,name,{token=name,seconds,loop=false,additiveRotation=false}={})=>{
      if(!name)return false;keep.add(key);
      try {
        const clip=this.clip(definition,name);for(const bone of clip.ignoredBones)ignoredBones.add(bone);let row=this.layers.get(key);
        if(!row||row.name!==name||row.token!==token){
          // Preserve gait phase when shifting walk/run, rather than putting
          // the same foot down again on every sprint-state packet.
          const gait=key==='main'&&['walk','run','sneak'].includes(name)&&['walk','run','sneak'].includes(row?.name);
          const phase=gait&&row.length>0?(((now-row.started)/1000/row.length)%1+1)%1:0;
          row={name,token,length:clip.length,started:now-phase*clip.length*1000,cursor:{cycle:-1,time:-1}};this.layers.set(key,row);
        }
        const age=seconds??(now-row.started)/1000;
        const sampled=samplePaperYsmClip(loop&&!clip.hold?{...clip,loop:true}:clip,age,context,row.cursor);
        applyPaperYsmPose(this.model,sampled,additiveRotation);this.selected.push(name);return true;
      }catch(error){this.errors.push(error.message);return false;}
    };
    for(let n=0;n<8;n++)if(this.main.animations?.['pre_parallel'+n])layer('pre'+n,this.main,'pre_parallel'+n,{loop:true});
    layer('main',this.main,base,{loop:base!=='death'});
    this.blendLocomotion(base,now,previous,restricted || this.wasSleeping===true);
    this.wasSleeping=sleeping;
    if(!restricted)for(const [index,hand]of ['mainhand','offhand'].entries()) {
      const item=equipment[index],hold=item?selectArmClip(this.arm,'hold',hand,item):Object.hasOwn(this.arm?.animations??{},'hold_'+hand+':empty')?'hold_'+hand+':empty':null;
      if(hold)layer('hold'+index,this.arm,hold,{loop:true,token:JSON.stringify(item??null)});
      if(m.usingItem===true && (m.activeHand??'mainhand')===hand) {
        const condition=selectArmClip(this.arm,'use',hand,item);
        layer('use'+index,condition?this.arm:this.main,condition??'use_'+hand,{loop:true});
      }
      const swing=m.swing;
      if(swing && (swing.hand??'mainhand')===hand) {
        const condition=selectArmClip(this.arm,'swing',hand,item),def=condition?this.arm:this.main,name=condition??(index?'swing_offhand':'swing_hand');
        try{
          const clip=this.clip(def,name),key='swing'+index;
          if(swing.ageSeconds>=0 && swing.ageSeconds<Math.max(clip.length,.375))layer(key,def,name,{token:swing.sequence,seconds:swing.ageSeconds});
          else if(this.layers.get(key)?.token===swing.sequence) {
            // The terminal timeline often clears combo variables. Execute it
            // once even when the next rendered frame is after the last keyframe.
            samplePaperYsmClip({...clip,loop:false},clip.length,context,this.layers.get(key).cursor);
          }
        }catch(error){this.errors.push(error.message);}
      }
    }
    if(!restricted && m.hurt && m.hurt.ageSeconds>=0 && m.hurt.ageSeconds<.5)layer('hurt',this.main,'attacked',{token:m.hurt.sequence,seconds:m.hurt.ageSeconds});
    if(!restricted && state.animation && !['idle','empty'].includes(state.animation))layer('extra',this.extra?.animations?.[state.animation]?this.extra:this.main,state.animation);
    for(let n=0;n<8;n++)if(this.main.animations?.['parallel'+n])layer('parallel'+n,this.main,'parallel'+n,{loop:true,additiveRotation:true});
    // The native Head bone also follows the actual look direction, even when
    // the authored animation has no head channel.
    const head=this.model.bones.get('Head');if(head && !restricted){head.rotation.x-=queries['ysm.head_pitch']*Math.PI/180;head.rotation.y+=queries['ysm.head_yaw']*Math.PI/180;}
    for(const key of this.layers.keys())if(!keep.has(key))this.layers.delete(key);
    if(this.controllers.length)this.errors.push('YSM_CUSTOM_CONTROLLERS_UNSUPPORTED');
    return {base:downed?'downed':base,canAct:!inhibited,waterSource:m.waterSource??(pose==='swimming'?'entity_pose':null),inWater:m.inWater??null,clips:[...this.selected],errors:[...new Set(this.errors)],ignoredBones:[...ignoredBones],completeEntityParityVerified:false};
  }
  // Blend the authored locomotion before applying live look, attacks and held
  // item layers; easing a gait must never delay a hit or reuse an old aim.
  blendLocomotion(base,now,previous,inhibited) {
    const water=base==='swim'||base==='swim_stand',transition=this.waterTransition??={base,water,lastPose:null,from:null,start:now};
    if(base!==transition.base) {
      transition.duration=water||transition.water?220:140;
      transition.from=previous&&!inhibited?new Map([...previous].map(([name,p])=>[name,
        {position:p.position.clone(),quaternion:p.quaternion.clone(),scale:p.scale.clone()}])):null;transition.start=now;
      transition.base=base;transition.water=water;
    }
    const alpha=Math.min(1,Math.max(0,(now-transition.start)/(transition.duration??140))),blend=alpha*alpha*(3-2*alpha);
    if(transition.from && alpha<1)for(const [name,from]of transition.from) {
      const bone=this.model.bones.get(name);if(!bone)continue;
      bone.position.lerpVectors(from.position,bone.position,blend);
      bone.quaternion.slerpQuaternions(from.quaternion,bone.quaternion,blend);
      bone.scale.lerpVectors(from.scale,bone.scale,blend);
    }
    else transition.from=null;
    // Reuse the snapshot objects; no per-frame allocation proportional to cubes.
    transition.lastPose??=new Map();
    for(const [name,bone]of this.model.bones) {
      let saved=transition.lastPose.get(name);
      if(!saved){saved={position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()};transition.lastPose.set(name,saved);}
      else {saved.position.copy(bone.position);saved.quaternion.copy(bone.quaternion);saved.scale.copy(bone.scale);}
    }
  }
}
