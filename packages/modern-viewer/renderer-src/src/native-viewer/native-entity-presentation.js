const axes = ['x', 'y', 'z']
const point = value => value && axes.every(key => Number.isFinite(value[key]))
const mix = (a, b, t) => a + (b - a) * t
const angle = (a, b, t) => a + ((b - a + 540) % 360 - 180) * t

// Position projection is already an endpoint. Aquatic model time/counters
// instead follow this same bounded received interval; never rewrite native ticks.
function aquaticAnimation(old,next,live,t) {
  if(!live.aquatic)return null
  if(!old.aquatic||!next.aquatic||![old.tick,next.tick,live.tick].every(v=>Number.isSafeInteger(v)&&v>=0)||old.tick>next.tick||next.tick>live.tick)throw Error('NATIVE_ENTITY_PRESENTATION_CLOCK_INVALID')
  const aquatic={...live.aquatic}
  for(const [previous,current]of [['tailOld','tail'],['spikesOld','spikes'],['tentacleAngleOld','tentacleAngle'],['xBodyRotOld','xBodyRot'],['zBodyRotOld','zBodyRot']]){
    if(![old.aquatic[current],next.aquatic[current]].every(Number.isFinite))throw Error('NATIVE_ENTITY_PRESENTATION_COUNTER_INVALID')
    aquatic[previous]=aquatic[current]=mix(old.aquatic[current],next.aquatic[current],t)
  }
  if(![old.aquatic.bodyYaw,next.aquatic.bodyYaw].every(Number.isFinite))throw Error('NATIVE_ENTITY_PRESENTATION_COUNTER_INVALID')
  aquatic.bodyYaw=angle(old.aquatic.bodyYaw,next.aquatic.bodyYaw,t)
  // A new target is an actual received event, not a blended old-target beam.
  if(old.aquatic.targetId===next.aquatic.targetId&&next.aquatic.targetId===live.aquatic.targetId){
    if(![old.aquatic.attackTime,next.aquatic.attackTime].every(Number.isFinite))throw Error('NATIVE_ENTITY_PRESENTATION_COUNTER_INVALID')
    aquatic.attackTime=mix(old.aquatic.attackTime,next.aquatic.attackTime,t)
  }
  return {source:'buffered_received_native_animation',fromTick:old.tick,toTick:next.tick,fraction:t,age:mix(old.tick,next.tick,t),aquatic}
}

// Browser-only jitter buffer. Raw entities, native ticks and metadata remain
// untouched. Play received position/limb samples; never predict future motion.
export class NativeEntityPresentation {
  constructor(delayMs = 200) { this.delayMs = delayMs; this.samples = []; this.position = null }
  push(entity, at) {
    if (!point(entity?.position) || !Number.isFinite(at)) return
    const last = this.samples.at(-1)
    if (last && at <= last.at) return
    if (last && (at - last.at > 1000 || Math.hypot(...axes.map(k => entity.position[k] - last.entity.position[k])) > 4)) this.samples = []
    this.samples.push({ entity, at })
    if (this.samples.length > 16) this.samples.shift()
  }
  sample(current, now) {
    const rows = this.samples, time = now - this.delayMs
    if (!rows.length) return current
    while (rows.length > 2 && rows[1].at <= time) rows.shift()
    const a = rows[0], b = rows[1] ?? a
    const t = b.at === a.at ? 1 : Math.max(0, Math.min(1, (time - a.at) / (b.at - a.at)))
    const position = Object.fromEntries(axes.map(k => [k, mix(a.entity.position[k], b.entity.position[k], t)]))
    this.position = position
    const old = a.entity.motion, next = b.entity.motion, live = current.motion
    if (!old || !next || !live || !point(live.position) || !point(live.previous?.position) ||
        !['bodyYaw', 'headYaw', 'pitch'].every(k => Number.isFinite(old[k]) && Number.isFinite(next[k])) ||
        (live.walk&&![old.walk?.position, next.walk?.position, old.walk?.speed, next.walk?.speed].every(Number.isFinite))) return current
    const pose = Object.fromEntries(['bodyYaw', 'headYaw', 'pitch'].map(k => [k, k === 'pitch' ? mix(old[k], next[k], t) : angle(old[k], next[k], t)]))
    const animation=aquaticAnimation(old,next,live,t)
    const speed = live.walk?mix(old.walk.speed, next.walk.speed, t):null
    // Existing actors render one native 50ms interval. Supply an explicitly
    // marked display projection at its endpoint, using received walk phases.
    return { ...current, position, motion: { ...live, ...pose, position,
      previous: { ...live.previous, ...pose, position }, sampledAt: now - 50,
      ...(live.walk?{walk: { ...live.walk, position: mix(old.walk.position, next.walk.position, t), speed, speedOld: speed }}:{}),
      ...(animation?{displayAnimation:animation}:{}),
      displayProjection: 'buffered_received_entity_samples' } }
  }
}
