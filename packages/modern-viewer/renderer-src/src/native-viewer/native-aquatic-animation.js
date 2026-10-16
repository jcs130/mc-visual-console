// Original model.setupAnim ports: fva/fvf/fvr/fwr/fws/fwt/fwy/fxm/fxo/fxq/fxr/fxs.
import {nativePlayerSin as sin,nativePlayerCos as cos} from './native-player-motion.js'
const F=Math.fround,PI=F(Math.PI),RAD=F(Math.PI/180),lerp=(a,b,t)=>F(a+F(F(b-a)*t))
export function createNativeAquaticAnimation(entity,{random=Math.random,clientConstructorId=1}={}) {
  const randomFloat=()=>Math.floor(random()*16777216)/16777216
  const leaf=entity.name.split(':')[1],guardian=leaf.endsWith('guardian'),squid=leaf.endsWith('squid')
  // Original Squid seeds with the client constructor ID, before packet setId.
  // This viewer has its own sequence; Java-client phases are not shared telemetry.
  let seed=(BigInt(clientConstructorId)^0x5deece66dn)&((1n<<48n)-1n)
  const nextFloat=()=>{seed=(seed*0x5deece66dn+11n)&((1n<<48n)-1n);return Number(seed>>24n)/(1<<24)}
  const s={tail:guardian?F(randomFloat()):0,tailOld:0,tailSpeed:0,spikes:0,spikesOld:0,attackTime:0,targetId:0,
    tentacle:0,tentacleOld:0,tentacleAngle:0,tentacleAngleOld:0,tentacleSpeed:squid?F(F(1/F(nextFloat()+1))*F(.2)):0,
    glowDarkTicks:leaf==='glow_squid'?0:null,receivedDarkTicks:0,rotateSpeed:0,xBodyRot:0,xBodyRotOld:0,zBodyRot:0,zBodyRotOld:0,bodyYaw:entity.yaw,lastCue:0}
  s.tailOld=s.tail
  const observe=(next,state)=>{
    for(const cue of next.cues??[]){if(cue.sequence<=s.lastCue)continue;if(squid&&cue.kind==='entity_status'&&cue.code===19)s.tentacle=0;s.lastCue=Math.max(s.lastCue,cue.sequence)}
    if(guardian&&state.targetId!==s.targetId){s.targetId=state.targetId;s.attackTime=0}
    if(leaf==='glow_squid'&&state.darkTicks!==s.receivedDarkTicks){s.receivedDarkTicks=state.darkTicks;s.glowDarkTicks=state.darkTicks}
  }
  return {observe,current:()=>({...s,randomPhaseSource:guardian?'viewer_client_local_RandomSource_not_shared_Java_seed':squid?'viewer_local_constructor_sequence_Java48_not_shared_Java_client_seed':null}),tick(next,state){
    const env=next.aquaticEnvironment
    observe(next,state)
    if(guardian&&state.health>0&&!next.living?.dead&&state.targetId)s.attackTime=Math.min(leaf==='elder_guardian'?60:80,s.attackTime+1)
    if(leaf==='glow_squid')s.glowDarkTicks=Math.max(0,s.glowDarkTicks-1)
    if(guardian&&state.health>0&&!next.living?.dead&&env?.available){
      s.tailOld=s.tail
      if(!env.inWater)s.tailSpeed=2
      else if(state.moving)s.tailSpeed=s.tailSpeed<.5?4:F(s.tailSpeed+F(F(.5-s.tailSpeed)*F(.1)))
      else s.tailSpeed=F(s.tailSpeed+F(F(.125-s.tailSpeed)*F(.2)))
      s.tail=F(s.tail+s.tailSpeed);s.spikesOld=s.spikes
      if(!env.inWaterOrBubble)s.spikes=F(randomFloat())
      else s.spikes=F(s.spikes+F(F((state.moving?0:1)-s.spikes)*F(state.moving?.25:.06)))
    }
    if(squid){
      s.xBodyRotOld=s.xBodyRot;s.zBodyRotOld=s.zBodyRot;s.tentacleOld=s.tentacle;s.tentacleAngleOld=s.tentacleAngle
      s.tentacle=Math.min(F(Math.PI*2),F(s.tentacle+s.tentacleSpeed))
      if(!env?.available)return
      if(env.inWaterOrBubble){
        if(s.tentacle<PI){const q=F(s.tentacle/PI);s.tentacleAngle=F(F(sin(F(F(q*q)*PI))*PI)*F(.25));if(q>.75)s.rotateSpeed=1;else s.rotateSpeed=F(s.rotateSpeed*F(.8))}
        else {s.tentacleAngle=0;s.rotateSpeed=F(s.rotateSpeed*F(.99))}
        const v=next.velocity
        if(v&&['x','y','z'].every(a=>Number.isFinite(v[a]))){s.bodyYaw=F(s.bodyYaw+F(F(-originalAtan2(v.x,v.z)*180/Math.PI-s.bodyYaw)*F(.1)));s.zBodyRot=F(s.zBodyRot+F(F(PI*s.rotateSpeed)*F(1.5)));s.xBodyRot=F(s.xBodyRot+F(F(-originalAtan2(Math.hypot(v.x,v.z),v.y)*180/Math.PI-s.xBodyRot)*F(.1)))}
      }else {s.tentacleAngle=F(F(Math.abs(sin(s.tentacle))*PI)*F(.25));s.xBodyRot=F(s.xBodyRot+F(F(-90-s.xBodyRot)*F(.02)))}
    }
  }}
}
const spikeX=[0,0,8,-8,-8,8,8,-8,0,0,8,-8],spikeY=[-8,-8,-8,-8,0,0,0,0,8,8,8,8],spikeZ=[8,-8,0,0,-8,-8,8,8,8,-8,0,0]
export function animateNativeAquatic(model,state,{age,partial,pitch,headYaw,walk,speed,motion}){
  const b=model.bones,leaf=state.leaf,env=motion.aquaticEnvironment,a=motion.aquatic
  // Axolotl intentionally retains per-entity rotations between setupAnim calls.
  if(leaf!=='axolotl')for(const p of model.definition.parts){const bone=b.get(p.path);bone.position.fromArray(p.pivot);bone.rotation.set(...p.rotationZYX,'ZYX')}
  const water=env?.available?env.inWater:null
  if(water!==null&&(leaf==='cod'||leaf==='tropical_fish'))b.get(leaf==='cod'?'tail_fin':'tail').rotation.y=F(F(F(-(water?1:1.5))*F(.45))*sin(F(F(.6)*age)))
  if(water!==null&&leaf==='salmon')b.get('body_back').rotation.y=F(F(F(-(water?1:1.3))*F(.25))*sin(F(F(F(water?1:1.7)*F(.6))*age)))
  if(water!==null&&leaf==='tadpole')b.get('tail').rotation.y=F(F(F(-(water?1:1.5))*F(.25))*sin(F(F(.3)*age)))
  if(leaf==='pufferfish'){
    const fin=F(F(.4)*sin(F(age*F(.2))))
    b.get(state.puff===0?'right_fin':'right_blue_fin').rotation.z=F(-.2+fin)
    b.get(state.puff===0?'left_fin':'left_blue_fin').rotation.z=F(.2-fin)
  }
  if(leaf==='dolphin'){
    b.get('body').rotation.set(F(pitch*RAD),F(headYaw*RAD),0,'ZYX')
    const v=motion.velocity
    if(v&&v.x*v.x+v.z*v.z>1e-7){const c=cos(F(age*F(.3)));b.get('body').rotation.x=F(b.get('body').rotation.x+F(-.05-F(F(.05)*c)));b.get('tail').rotation.x=F(F(-.1)*c);b.get('tail_fin').rotation.x=F(F(-.2)*c)}
  }
  if(env?.available&&leaf.endsWith('squid'))for(let i=0;i<8;i++)b.get('tentacle'+i).rotation.x=lerp(a.tentacleAngleOld,a.tentacleAngle,partial)
  if(env?.available&&leaf.endsWith('guardian')){
    b.get('head').rotation.set(F(pitch*RAD),F(headYaw*RAD),0,'ZYX')
    const spikes=F(F(1-lerp(a.spikesOld,a.spikes,partial))*F(.55)),tail=lerp(a.tailOld,a.tail,partial)
    for(let i=0;i<12;i++){const offset=F(F(1+F(cos(F(F(age*F(1.5))+i))*F(.01)))-spikes);b.get('spike'+i).position.set(F(spikeX[i]*offset),F(16+F(spikeY[i]*offset)),F(spikeZ[i]*offset))}
    for(let i=0;i<3;i++)b.get('tail'+i).rotation.y=F(F(sin(tail)*PI)*F([.05,.1,.15][i]))
  }
  if(water!==null&&leaf==='turtle'){
    b.get('head').rotation.set(F(pitch*RAD),F(headYaw*RAD),0,'ZYX')
    const phase=F(F(walk*F(.6662))*F(.6)),leg=o=>F(F(cos(F(phase+o))*F(.5))*speed)
    b.get('right_hind_leg').rotation.x=leg(0);b.get('left_hind_leg').rotation.x=leg(PI)
    b.get('right_front_leg').rotation.z=leg(PI);b.get('left_front_leg').rotation.z=leg(0)
    if(!water&&motion.onGround===true){const rate=state.layingEgg?4:1,strength=state.layingEgg?2:1
      for(const [side,offset]of [['right',PI],['left',0]]){const front=b.get(side+'_front_leg'),hind=b.get(side+'_hind_leg');front.rotation.y=F(F(F(cos(F(F(F(rate*walk)*5)+offset))*8)*speed)*strength);front.rotation.z=0;hind.rotation.y=F(F(cos(F(F(walk*5)+offset))*3)*speed);hind.rotation.x=0}
    }
    b.get('egg_belly').visible=!state.baby&&state.hasEgg
  }
  if(env?.available&&leaf==='axolotl')animateAxolotl(b,state,{age,pitch,headYaw,water:env.inWaterOrBubble,moving:speed>1e-5||motion.yaw!==motion.previous.yaw||motion.pitch!==motion.previous.pitch,onGround:motion.onGround})
}

function animateAxolotl(b,state,{age,pitch,headYaw,water,moving,onGround}){
  const blend=(...args)=>{const [t,a,z]=args.length===2?[.05,...args]:args;let delta=z-a;while(delta<-180)delta+=360;while(delta>=180)delta-=360;return F(a+F(F(t)*F(delta)))}
  const blendPart=(bone,x,y,z)=>bone.rotation.set(blend(bone.rotation.x,x),blend(bone.rotation.y,y),blend(bone.rotation.z,z),'ZYX')
  const body=b.get('body');body.position.x=0;body.position.y=20;b.get('head').position.y=0
  if(!body.userData.axolotlInitialized){for(const name of ['body','head','left_hind_leg','right_hind_leg','left_front_leg','right_front_leg','tail','top_gills','left_gills','right_gills'])b.get(name).rotation.set(0,0,0,'ZYX');body.rotation.set(F(pitch*RAD),F(headYaw*RAD),0,'ZYX');body.userData.axolotlInitialized=true}
  if(state.playingDead)playDead(headYaw);else if(water){if(moving)swim(age,pitch);else hover(age)}else if(onGround){if(moving)crawl(age,headYaw);else layStill(age,headYaw)}
   function layStill(v0,v1) {
      let v2 = F(v0*F(0.09));
      let v3 = sin(v2);
      let v4 = cos(v2);
      let v5 = F(F(v3*v3)-F(F(2.0)*v3));
      let v6 = F(F(v4*v4)-F(F(3.0)*v3));
      b.get('head').rotation.x = blend(b.get('head').rotation.x,F(F(-F(0.09))*v5));
      b.get('head').rotation.y = blend(b.get('head').rotation.y,F(0.0));
      b.get('head').rotation.z = blend(b.get('head').rotation.z,F(-F(0.2)));
      b.get('tail').rotation.y = blend(b.get('tail').rotation.y,F(F(-F(0.1))+F(F(0.1)*v5)));
      b.get('top_gills').rotation.x = blend(b.get('top_gills').rotation.x,F(F(0.6)+F(F(0.05)*v6)));
      b.get('left_gills').rotation.y = blend(b.get('left_gills').rotation.y,F(-b.get('top_gills').rotation.x));
      b.get('right_gills').rotation.y = blend(b.get('right_gills').rotation.y,F(-b.get('left_gills').rotation.y));
      blendPart(b.get('left_hind_leg'), 1.1, 1.0, 0.0);
      blendPart(b.get('left_front_leg'), 0.8, 2.3, -0.5);
      mirror();
      b.get('body').rotation.x = blend(F(0.2),b.get('body').rotation.x,F(0.0));
      b.get('body').rotation.y = blend(b.get('body').rotation.y,F(v1*RAD));
      b.get('body').rotation.z = blend(b.get('body').rotation.z,F(0.0));
   }

   function crawl(v0,v1) {
      let v2 = F(v0*F(0.11));
      let v3 = cos(v2);
      let v4 = F(F(F(v3*v3)-F(F(2.0)*v3))/F(5.0));
      let v5 = F(F(0.7)*v3);
      b.get('head').rotation.x = blend(b.get('head').rotation.x,F(0.0));
      b.get('head').rotation.y = blend(b.get('head').rotation.y,F(F(0.09)*v3));
      b.get('head').rotation.z = blend(b.get('head').rotation.z,F(0.0));
      b.get('tail').rotation.y = blend(b.get('tail').rotation.y,b.get('head').rotation.y);
      b.get('top_gills').rotation.x = blend(b.get('top_gills').rotation.x,F(F(0.6)-F(F(0.08)*F(F(v3*v3)+F(F(2.0)*sin(v2))))));
      b.get('left_gills').rotation.y = blend(b.get('left_gills').rotation.y,F(-b.get('top_gills').rotation.x));
      b.get('right_gills').rotation.y = blend(b.get('right_gills').rotation.y,F(-b.get('left_gills').rotation.y));
      blendPart(b.get('left_hind_leg'), 0.9424779, 1.5 - v4, -0.1);
      blendPart(b.get('left_front_leg'), 1.0995574, (Math.PI / 2) - v5, 0.0);
      blendPart(b.get('right_hind_leg'), b.get('left_hind_leg').rotation.x, -1.0 - v4, 0.0);
      blendPart(b.get('right_front_leg'), b.get('left_front_leg').rotation.x, (-Math.PI / 2) - v5, 0.0);
      b.get('body').rotation.x = blend(F(0.2),b.get('body').rotation.x,F(0.0));
      b.get('body').rotation.y = blend(b.get('body').rotation.y,F(v1*RAD));
      b.get('body').rotation.z = blend(b.get('body').rotation.z,F(0.0));
   }

   function hover(v0) {
      let v1 = F(v0*F(0.075));
      let v2 = cos(v1);
      let v3 = F(sin(v1)*F(0.15));
      b.get('body').rotation.x = blend(b.get('body').rotation.x,F(F(-F(0.15))+F(F(0.075)*v2)));
      b.get('body').position.y -= v3;
      b.get('head').rotation.x = blend(b.get('head').rotation.x,F(-b.get('body').rotation.x));
      b.get('top_gills').rotation.x = blend(b.get('top_gills').rotation.x,F(F(0.2)*v2));
      b.get('left_gills').rotation.y = blend(b.get('left_gills').rotation.y,F(F(F(-F(0.3))*v2)-F(0.19)));
      b.get('right_gills').rotation.y = blend(b.get('right_gills').rotation.y,F(-b.get('left_gills').rotation.y));
      blendPart(b.get('left_hind_leg'), (Math.PI * 3.0 / 4.0) - v2 * 0.11, 0.47123894, 1.7278761);
      blendPart(b.get('left_front_leg'), (Math.PI / 4) - v2 * 0.2, 2.042035, 0.0);
      mirror();
      b.get('tail').rotation.y = blend(b.get('tail').rotation.y,F(F(0.5)*v2));
      b.get('head').rotation.y = blend(b.get('head').rotation.y,F(0.0));
      b.get('head').rotation.z = blend(b.get('head').rotation.z,F(0.0));
   }

   function swim(v0,v1) {
      let v2 = F(v0*F(0.33));
      let v3 = sin(v2);
      let v4 = cos(v2);
      let v5 = F(F(0.13)*v3);
      b.get('body').rotation.x = blend(F(0.1),b.get('body').rotation.x,F(F(v1*RAD)+v5));
      b.get('head').rotation.x = F(F(-v5)*F(1.8));
      b.get('body').position.y -= F(F(0.45)*v4);
      b.get('top_gills').rotation.x = blend(b.get('top_gills').rotation.x,F(F(F(-F(0.5))*v3)-F(0.8)));
      b.get('left_gills').rotation.y = blend(b.get('left_gills').rotation.y,F(F(F(0.3)*v3)+F(0.9)));
      b.get('right_gills').rotation.y = blend(b.get('right_gills').rotation.y,F(-b.get('left_gills').rotation.y));
      b.get('tail').rotation.y = blend(b.get('tail').rotation.y,F(F(0.3)*cos(F(v2*F(0.9)))));
      blendPart(b.get('left_hind_leg'), 1.8849558, -0.4 * v3, (Math.PI / 2));
      blendPart(b.get('left_front_leg'), 1.8849558, -0.2 * v4 - 0.1, (Math.PI / 2));
      mirror();
      b.get('head').rotation.y = blend(b.get('head').rotation.y,F(0.0));
      b.get('head').rotation.z = blend(b.get('head').rotation.z,F(0.0));
   }

   function playDead(v0) {
      blendPart(b.get('left_hind_leg'), 1.4137167, 1.0995574, (Math.PI / 4));
      blendPart(b.get('left_front_leg'), (Math.PI / 4), 2.042035, 0.0);
      b.get('body').rotation.x = blend(b.get('body').rotation.x,F(-F(0.15)));
      b.get('body').rotation.z = blend(b.get('body').rotation.z,F(0.35));
      mirror();
      b.get('body').rotation.y = blend(b.get('body').rotation.y,F(v0*RAD));
      b.get('head').rotation.x = blend(b.get('head').rotation.x,F(0.0));
      b.get('head').rotation.y = blend(b.get('head').rotation.y,F(0.0));
      b.get('head').rotation.z = blend(b.get('head').rotation.z,F(0.0));
      b.get('tail').rotation.y = blend(b.get('tail').rotation.y,F(0.0));
      blendPart(b.get('top_gills'), 0.0, 0.0, 0.0);
      blendPart(b.get('left_gills'), 0.0, 0.0, 0.0);
      blendPart(b.get('right_gills'), 0.0, 0.0, 0.0);
   }

   function mirror() {
      blendPart(b.get('right_hind_leg'), b.get('left_hind_leg').rotation.x, -b.get('left_hind_leg').rotation.y, -b.get('left_hind_leg').rotation.z);
      blendPart(b.get('right_front_leg'), b.get('left_front_leg').rotation.x, -b.get('left_front_leg').rotation.y, -b.get('left_front_leg').rotation.z);
   }
}

// ayo/Mth.atan2: original lookup + fast inverse square root, double bit layout.
const atanBits=new DataView(new ArrayBuffer(8)),asinTable=Array.from({length:257},(_,i)=>Math.asin(i/256)),cosTable=asinTable.map(Math.cos)
atanBits.setBigUint64(0,4805340802404319232n);const atanBias=atanBits.getFloat64(0)
export function originalAtan2(y,x){
  const length=x*x+y*y
  if(Number.isNaN(length))return NaN
  const negativeY=y<0,negativeX=x<0
  if(negativeY)y=-y;if(negativeX)x=-x
  const swapped=y>x;if(swapped){const old=x;x=y;y=old}
  atanBits.setFloat64(0,length);atanBits.setBigUint64(0,6910469410427058090n-(atanBits.getBigUint64(0)>>1n))
  let inverse=atanBits.getFloat64(0);inverse*=1.5-.5*length*inverse*inverse
  x*=inverse;y*=inverse
  const biased=atanBias+y;atanBits.setFloat64(0,biased);const index=Number(atanBits.getBigUint64(0)&0xffffffffn),fraction=biased-atanBias,error=y*cosTable[index]-x*fraction
  let result=asinTable[index]+(6+error*error)*error/6
  if(swapped)result=Math.PI/2-result;if(negativeX)result=Math.PI-result;if(negativeY)result=-result
  return result
}
