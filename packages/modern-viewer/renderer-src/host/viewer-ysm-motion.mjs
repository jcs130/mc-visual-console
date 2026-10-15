// Read-only motion/equipment on the same Mineflayer connection as appearance.
// No server polling, new observer account, or gameplay/client method patches.
const angle = value => Math.atan2(Math.sin(value),Math.cos(value));
const compactItem = item => {
  if(item===null)return null;
  if(!item || !/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]{1,128}$/.test(item.name??''))return null;
  const result={name:item.name,count:Math.min(99,Math.max(1,item.count??1))};
  // Keep components needed by actual item models; bound their wire size.
  for(const key of ['type','metadata','enchants','components','nbt']) {
    if(item[key]===undefined)continue;
    try {const value=JSON.stringify(item[key],(_k,v)=>typeof v==='bigint'?v.toString():v);if(value.length<=8192)result[key]=JSON.parse(value);else result.visualDataUnavailable=true;}catch{result.visualDataUnavailable=true;}
  }
  return result;
};
export function createViewerYsmMotion(bot,{binding,emit,now=Date.now}={}) {
  const states=new Map(),ground=new Map(),sleep=new WeakMap();let sequence=0;
  const listeners=[];const on=(target,name,fn)=>{target.on(name,fn);listeners.push(()=>target.off(name,fn));};
  function actual(row) {
    const own=(bot._client.uuid??bot.player?.uuid)?.toLowerCase()===row.playerUuid;
    const entity=own?bot.entity:bot.entities?.[row.entityId];
    return entity && entity.id===row.entityId && (own || entity.uuid?.toLowerCase()===row.playerUuid)?entity:null;
  }
  function sample(row) {
    if(!row?.available)return null;const entity=actual(row);if(!entity)return null;
    const position=entity.position;if(!position || ![position.x,position.y,position.z].every(Number.isFinite))return null;
    let prior=states.get(row.playerUuid);const time=now();
    if(!prior || prior.entityId!==entity.id || prior.epoch!==row.epoch) {
      prior={entityId:entity.id,epoch:row.epoch,position:{...position},at:time,movedAt:time,speed:0,sentAt:0};states.set(row.playerUuid,prior);
    }
    const distance=Math.hypot(position.x-prior.position.x,position.z-prior.position.z), elapsed=(time-prior.at)/1000;
    if(distance>0 && elapsed>0) {prior.speed=distance<4 && elapsed<2?Math.min(30,distance/elapsed):0;prior.movedAt=time;}
    else if(time-prior.movedAt>250)prior.speed=0;
    prior.position={x:position.x,y:position.y,z:position.z};prior.at=time;
    const metadata=entity.metadata??[],flags=Number(metadata[0])||0,living=Number(metadata[8])||0;
    const yaw=entity.yaw??0,headYaw=entity.headYaw??yaw,pitch=entity.pitch??0;
    // Java metadata 18 is the actual player main arm (0 left / 1 right).
    const mainArm=metadata[18]===0?'left':'right';
    const equipment=entity===bot.entity?[bot.heldItem??entity.equipment?.[0]??null,bot.inventory?.slots?.[45]??entity.equipment?.[1]??null]:entity.equipment?.slice(0,2);
    const result={schemaVersion:1,source:'same_connection_java_protocol',epoch:row.epoch,playerUuid:row.playerUuid,entityId:entity.id,
      sequence:++sequence,horizontalSpeed:prior.speed,bodyYaw:yaw,headYawDegrees:angle(headYaw-yaw)*180/Math.PI,
      headPitchDegrees:-pitch*180/Math.PI,crouching:!!(flags&2),sprinting:!!(flags&8),usingItem:!!(living&1),
      activeHand:living&2?'offhand':'mainhand',mainArm,pose:typeof metadata[6]==='number'?['standing','fall_flying','sleeping','swimming','spin_attack','crouching','long_jumping','dying'][metadata[6]]:metadata[6],equipment:Array.isArray(equipment)?equipment.map(compactItem):null};
    const knownGround=entity===bot.entity?entity.onGround:ground.get(entity.id);
    const sleeping=entity===bot.entity && typeof bot.isSleeping==='boolean'?bot.isSleeping:sleep.get(entity);
    if(typeof sleeping==='boolean')result.pose=sleeping?'sleeping':result.pose==='sleeping'?'standing':result.pose;
    if(typeof knownGround==='boolean')result.onGround=knownGround;
    const flying=entity===bot.entity?bot.game?.gameMode==='creative' && bot.entity?.isFlying:undefined;
    if(typeof flying==='boolean')result.flying=flying;
    if(prior.swing && time-prior.swing.at<2500)result.swing={hand:prior.swing.hand,sequence:prior.swing.sequence,ageSeconds:(time-prior.swing.at)/1000};
    if(prior.hurt && time-prior.hurt.at<700)result.hurt={sequence:prior.hurt.sequence,ageSeconds:(time-prior.hurt.at)/1000};
    return result;
  }
  function send(row,force=false) {
    const prior=states.get(row?.playerUuid);if(!force && prior && now()-prior.sentAt<100)return;
    const value=sample(row);if(!value)return;
    const current=states.get(row.playerUuid),signature=JSON.stringify({...value,sequence:0,swing:value.swing?{...value.swing,ageSeconds:0}:null,hurt:value.hurt?{...value.hurt,ageSeconds:0}:null});
    if(!force && current.signature===signature && now()-current.sentAt<1000)return;
    current.signature=signature;current.sentAt=now();emit('appearanceMotion',value);
  }
  const update=entity=>{const row=binding(entity?.id);if(row)send(row);};
  for(const event of ['entityMoved','entityEquip','entityUpdate','entitySpawn'])on(bot,event,update);
  on(bot,'move',()=>update(bot.entity));on(bot,'heldItemChanged',()=>update(bot.entity));
  for(const [event,value]of [['entitySleep',true],['entityWake',false]])on(bot,event,entity=>{
    sleep.set(entity,value);const row=binding(entity?.id);if(row)send(row,true);
  });
  for(const event of ['sleep','wake'])on(bot,event,()=>{const row=binding(bot.entity?.id);if(row)send(row,true);});
  on(bot._client,'packet',(packet,meta)=>{
    if(['rel_entity_move','entity_move_look','entity_teleport','entity_position_sync'].includes(meta?.name) && typeof packet.onGround==='boolean') {
      if(ground.size<128 || ground.has(packet.entityId))ground.set(packet.entityId,packet.onGround);
    }
  });
  on(bot._client,'animation',packet=>{
    if(![0,3].includes(packet.animation))return;const row=binding(packet.entityId);if(!row || !sample(row))return;
    states.get(row.playerUuid).swing={at:now(),hand:packet.animation===3?'offhand':'mainhand',sequence:++sequence};send(row,true);
  });
  // The server does not echo a player's own arm-animation packet. Observe the
  // existing protocol serializer's bytes without replacing bot/client methods
  // or writing another packet. Only parse the pinned arm packet, never chat,
  // authentication, inventory commands or arbitrary outgoing payloads.
  let serializer=null,outgoing=null;
  const attachOutgoing=()=>{
    if(serializer&&outgoing)serializer.off('data',outgoing);serializer=bot._client.serializer;outgoing=null;
    if(!serializer?.createPacketBuffer||!serializer.proto?.parsePacketBuffer)return;
    try {
      const armBytes=serializer.createPacketBuffer({name:'arm_animation',params:{hand:0}});
      if(!Buffer.isBuffer(armBytes)||armBytes.length<2||armBytes.length>8)return;
      const probe=serializer.proto.parsePacketBuffer(serializer.mainType,armBytes).data;
      if(probe.name!=='arm_animation'||probe.params?.hand!==0)return;
      const prefix=armBytes.subarray(0,armBytes.length-1);
      outgoing=bytes=>{
        if(bot._client.state!=='play' || bytes.length!==armBytes.length || !bytes.subarray(0,prefix.length).equals(prefix))return;
        try {
          const decoded=serializer.proto.parsePacketBuffer(serializer.mainType,bytes).data;
          if(decoded.name!=='arm_animation'||![0,1].includes(decoded.params.hand))return;
          const row=binding(bot.entity?.id);if(!row||!sample(row))return;
          states.get(row.playerUuid).swing={at:now(),hand:decoded.params.hand?'offhand':'mainhand',sequence:++sequence};send(row,true);
        }catch{/* Observing a visual event must never interrupt outgoing gameplay. */}
      };
      serializer.on('data',outgoing);
    }catch{/* The host may attach before PLAY; the state event retries then. */}
  };
  on(bot._client,'state',attachOutgoing);attachOutgoing();
  on(bot,'entityHurt',entity=>{
    const row=binding(entity?.id);if(!row || !sample(row))return;
    states.get(row.playerUuid).hurt={at:now(),sequence:++sequence};send(row,true);
  });
  on(bot,'entityGone',entity=>{ground.delete(entity?.id);for(const [uuid,row]of states)if(row.entityId===entity?.id)states.delete(uuid);});
  const timer=setInterval(()=>{for(const [uuid,prior]of states){const row=binding(prior.entityId);if(!row || row.playerUuid!==uuid || row.epoch!==prior.epoch)states.delete(uuid);else send(row);}},100);timer.unref?.();
  return {send:row=>send(row,true),snapshot:rows=>rows.map(sample).filter(Boolean),reset(){states.clear();ground.clear();},
    dispose(){clearInterval(timer);if(serializer&&outgoing)serializer.off('data',outgoing);for(const off of listeners)off();states.clear();ground.clear();}};
}
