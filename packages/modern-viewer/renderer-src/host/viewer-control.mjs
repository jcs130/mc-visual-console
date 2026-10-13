import { randomUUID } from 'node:crypto';

/** One control lease for one action player's existing connection. The consuming
 * host authenticates the browser and pauses/resumes its Agent. No account,
 * Minecraft connection, password or public endpoint is created here. */
export function createViewerControlBridge({ adapter, authorize, acquire, release, now = Date.now,
  leaseMs = 4000, motionMs = 700, setInterval: interval = globalThis.setInterval,
  clearInterval: clear = globalThis.clearInterval } = {}) {
  if (!adapter || typeof authorize !== 'function' || typeof acquire !== 'function' || typeof release !== 'function')
    throw new TypeError('control requires an actor adapter, authorization and Agent handoff callbacks');
  if (![leaseMs, motionMs].every(v => Number.isFinite(v) && v >= 100) || motionMs >= leaseMs)
    throw new TypeError('control timeouts require 100 <= motionMs < leaseMs');
  const sessions = new Set();
  let lease = null, pending = null, disposed = false, cleaning = null, lastReason;
  const stop = () => { try { adapter.stop(); } catch {} };
  const snapshot = () => adapter.identity();
  const status = (session, reason) => ({ schemaVersion: 1, available: !disposed && adapter.ready(),
    active: lease?.session === session, busy: Boolean(lease && lease.session !== session || pending || cleaning),
    actor: snapshot(), epoch: lease?.session === session ? lease.epoch : null,
    phase: lease?.phase ?? 'observe', reason: reason ?? lastReason, capabilities: adapter.capabilities ?? [] });
  const publish = reason => { if (reason !== undefined) lastReason = reason;
    for (const session of sessions) session.socket.emit('viewerControlState', status(session)); };
  function relinquish(reason) {
    const previous = lease; lease = null;
    if (pending) { pending.cancelled = true; pending.abort.abort(); }
    // Stop synchronously, before asynchronous Agent handoff or another request.
    if (previous) {
      stop(); previous.abort.abort();
      // Native dig/place/use promises can outlive cancellation. Never resume the
      // Agent or admit another browser while a previous writer is still running.
      cleaning = Promise.resolve(previous.action).catch(() => {}).then(() => release({ actor: previous.actor, reason }))
        .catch(() => { publish('agent_resume_failed'); }).finally(() => { cleaning = null; publish(); });
    }
    publish(reason);
    return cleaning;
  }
  const timer = interval(() => {
    if (!lease) return;
    if (!adapter.ready() || JSON.stringify(snapshot()) !== JSON.stringify(lease.actor)) { relinquish('actor_changed'); return; }
    if (now() - lease.lastAt > leaseMs) { relinquish('lease_expired'); return; }
    if (lease.moving && now() - lease.motionAt > motionMs) {
      lease.actionAbort?.abort(); stop(); lease.moving = false; lease.phase = 'manual'; publish('input_expired');
    }
  }, Math.min(200, motionMs)); timer.unref?.();
  async function request(session, packet, acknowledge) {
    const ack = result => { if (typeof acknowledge === 'function') acknowledge({ schemaVersion: 1, requestId: packet?.requestId, ...result }); };
    if (disposed || !sessions.has(session) || !packet || packet.schemaVersion !== 1 || typeof packet.type !== 'string') return ack({ok:false,reason:'invalid_request'});
    if (packet.type === 'acquire') {
      if (lease?.session === session) { publish(); return ack({ok:true,status:'active'}); }
      if (lease || pending || cleaning || !adapter.ready()) return ack({ok:false,reason:'control_busy'});
      let finish;
      const attempt = { session, cancelled: false, abort: new AbortController(), done: new Promise(r => { finish = r; }) }; pending = attempt;
      let acquiredActor = null;
      try {
        if (await authorize(session.socket, snapshot()) !== true) return ack({ok:false,reason:'not_authorized'});
        if (attempt.cancelled || !sessions.has(session) || disposed) return ack({ok:false,reason:'acquire_cancelled'});
        const actor = snapshot();
        await acquire({ actor, socket: session.socket, signal: attempt.abort.signal });
        acquiredActor = actor;
        if (attempt.cancelled || !sessions.has(session) || disposed || !adapter.ready() || JSON.stringify(actor)!==JSON.stringify(snapshot())) {
          stop(); acquiredActor=null; await release({actor, reason:'acquire_cancelled'});
          return ack({ok:false,reason:'acquire_cancelled'});
        }
        stop(); lastReason = undefined;
        lease = { session, actor, epoch: randomUUID(), lastAt: now(), motionAt: now(), sequence: -1,
          moving: false, phase: 'manual', abort: new AbortController(), action: null };
        publish(); ack({ok:true,status:'active'});
      } catch { if(acquiredActor&&!lease)try{stop();await release({actor:acquiredActor,reason:'handoff_failed'});}catch{publish('agent_resume_failed');} ack({ok:false,reason:'handoff_failed'}); }
      finally { if (pending===attempt) pending=null; finish(); publish(); }
      return;
    }
    if (packet.type==='release' && pending?.session===session) { pending.cancelled=true; pending.abort.abort(); return ack({ok:true,status:'released'}); }
    const current = lease;
    if (!current || current.session!==session || packet.epoch!==current.epoch) return ack({ok:false,reason:'lease_required'});
    if (!Number.isSafeInteger(packet.sequence) || packet.sequence<=current.sequence) return ack({ok:false,reason:'stale_sequence'});
    current.sequence=packet.sequence;
    if (packet.type==='release') { relinquish('released'); return ack({ok:true,status:'released'}); }
    if (!adapter.ready() || JSON.stringify(current.actor)!==JSON.stringify(snapshot())) { relinquish('actor_changed'); return ack({ok:false,reason:'actor_changed'}); }
    current.lastAt=now();
    try {
      if (packet.type==='heartbeat') return ack({ok:true,status:'active'});
      if (packet.type==='stop') { current.actionAbort?.abort(); stop(); current.moving=false; current.phase='manual'; publish('stopped'); return ack({ok:true,status:'stopped'}); }
      if (packet.type==='motion') {
        const input=normalizeControlMotion(packet.input);
        if (!input) return ack({ok:false,reason:'invalid_input'});
        if(current.actionType==='navigate'&&Math.hypot(input.forward,input.strafe)>.15)current.actionAbort?.abort();
        adapter.motion(input); current.motionAt=now(); current.moving=true; current.phase='manual';
        return ack({ok:true,status:'applied',scope:'controls_only'});
      }
      if (packet.type==='primary' || packet.type==='secondary') {
        if(typeof packet.pressed!=='boolean')return ack({ok:false,reason:'invalid_input'});
        // Release edges are always accepted, including while a dig/use is pending.
        if(!packet.pressed){if(current.actionType===packet.type)current.actionAbort?.abort();await adapter.action(packet.type,false,{signal:current.abort.signal});return ack({ok:true,status:'stopped'});}
      }
      if (!['primary','secondary','hotbar','navigate'].includes(packet.type)) return ack({ok:false,reason:'unsupported_action'});
      if (current.action) return ack({ok:false,reason:'action_pending'});
      current.actionAbort=new AbortController();current.actionType=packet.type;
      current.phase=packet.type==='navigate'?'navigating':packet.type==='primary'?'attacking':packet.type==='secondary'?'interacting':'manual';
      // A navigation goal owns movement until finished or explicitly cancelled.
      if(packet.type==='navigate') current.moving=false;
      publish();
      const signal=AbortSignal.any([current.abort.signal,current.actionAbort.signal]);
      const operation = Promise.resolve().then(()=>adapter.action(packet.type,packet.type==='hotbar'?packet.slot:packet.type==='navigate'?packet.ray:true,{signal}));
      current.action=operation;
      try {
        const result=await operation;
        if (lease!==current) return ack({ok:false,reason:'lease_ended',status:'unknown'});
        ack({ok:result?.ok===true,...result});
      } catch { ack({ok:false,reason:'action_failed',status:'unknown'}); }
      finally { if(current.action===operation){current.action=null;current.actionAbort=null;current.actionType=null;
        if(lease===current){current.phase='manual';publish();}} }
    } catch { if(lease===current)stop(); ack({ok:false,reason:'control_failed',status:'unknown'}); }
  }
  return { snapshot: () => ({ active: Boolean(lease), actor: snapshot(), phase: lease?.phase??'observe' }),
    subscribeSocket(socket) {
      if(disposed)throw Error('control_disposed');
      const session={socket,startedAt:now(),received:0};sessions.add(session);
      const handler=(packet,ack)=>{
        if(now()-session.startedAt>=1000){session.startedAt=now();session.received=0;}
        if(++session.received>80){if(lease?.session===session)relinquish('rate_limited');return;}
        void request(session,packet,ack);
      };
      const state=()=>socket.emit('viewerControlState',status(session));
      const off=()=>{socket.off('viewerControl',handler);socket.off('viewerControlStatus',state);socket.off('disconnect',off);sessions.delete(session);
        if(pending?.session===session){pending.cancelled=true;pending.abort.abort();}
        if(lease?.session===session)relinquish('disconnected');};
      session.off=off;socket.on('viewerControl',handler);socket.on('viewerControlStatus',state);socket.once('disconnect',off);state();
      return off;
    },
    async dispose() { if(disposed)return;disposed=true;clear(timer);
      const handoff=pending?.done; await relinquish('disposed'); await handoff;
      for(const session of [...sessions])session.off();adapter.dispose?.(); }
  };
}

export function normalizeControlMotion(value) {
  if(!value || ![value.forward,value.strafe,value.cameraYaw].every(Number.isFinite))return null;
  const angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
  const hasLook=Number.isFinite(value.lookYaw)&&Number.isFinite(value.lookPitch);
  return {forward:Math.max(-1,Math.min(1,value.forward)),strafe:Math.max(-1,Math.min(1,value.strafe)),cameraYaw:angle(value.cameraYaw),
    movementMode:value.movementMode==='first_person'?'first_person':'camera_relative',
    ...(hasLook?{lookYaw:angle(value.lookYaw),lookPitch:Math.max(-1.5,Math.min(1.5,value.lookPitch))}:{}),
    jump:value.jump===true,sprint:value.sprint===true,sneak:value.sneak===true};
}
