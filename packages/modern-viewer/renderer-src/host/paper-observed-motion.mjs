// Paper's ServerPlayer velocity is an impulse/physics vector. Network-driven
// walking can change position while that vector stays zero. Keep it unchanged;
// derive a separate, labelled animation input from actual source ticks instead.
export function paperObservedLocomotion(previous, current, reset = false) {
  if (!Number.isSafeInteger(current?.serverTick) || current.serverTick < 0 || !Number.isFinite(current.observedAt)) return null;
  const base={source:'paper_position_delta',playerUuid:current.uuid,entityId:current.entityId,
    tick:current.serverTick,sampledAt:current.observedAt,tickMs:50,available:false,velocity:null};
  if(reset||!previous||previous.uuid!==current.uuid||previous.entityId!==current.entityId||previous.world?.uuid!==current.world?.uuid)
    return {...base,reason:'PAPER_MOTION_BASELINE'};
  const span=current.serverTick-previous.serverTick,elapsed=current.observedAt-previous.observedAt;
  if(!Number.isSafeInteger(span)||span<1||span>20||!(elapsed>0&&elapsed<=1500))return {...base,reason:'PAPER_MOTION_SAMPLE_GAP'};
  const delta=Object.fromEntries(['x','y','z'].map(k=>[k,current.position?.[k]-previous.position?.[k]]));
  // Match the renderer's existing discontinuity bound. A teleport cannot turn
  // into a sprint animation, and an unknown interval is never extrapolated.
  if(!Object.values(delta).every(Number.isFinite)||Math.hypot(delta.x,delta.y,delta.z)>8)return {...base,reason:'PAPER_MOTION_DISCONTINUITY'};
  return {...base,available:true,reason:null,spanTicks:span,velocity:Object.fromEntries(Object.entries(delta).map(([k,n])=>[k,n/span]))};
}
