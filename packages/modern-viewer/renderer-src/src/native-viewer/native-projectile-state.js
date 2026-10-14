export const NATIVE_PROJECTILE_TYPES=Object.freeze(['minecraft:arrow','minecraft:spectral_arrow','minecraft:trident','minecraft:fishing_bobber','minecraft:experience_orb'])
export const nativeProjectileType=name=>NATIVE_PROJECTILE_TYPES.includes(name)
export const nativeExperienceSprite=value=>[3,7,17,37,73,149,307,617,1237,2477].filter(threshold=>value>=threshold).length
const wrap=v=>((v+180)%360+360)%360-180
export function nativeProjectileFrame(entity,now) {
  const m=entity.motion
  if(m?.source!=='same_connection_entity_ticks'||m.tickMs!==50||!Number.isSafeInteger(m.tick)||!Number.isFinite(m.sampledAt)||
    !m.position||!m.previous?.position||!['x','y','z'].every(k=>Number.isFinite(m.position[k])&&Number.isFinite(m.previous.position[k]))||
    ![m.yaw,m.pitch,m.previous.yaw,m.previous.pitch].every(Number.isFinite))throw Error('NATIVE_PROJECTILE_MOTION_UNAVAILABLE')
  const partial=Math.max(0,Math.min(1,(now-m.sampledAt)/50))
  return {position:['x','y','z'].map(k=>m.previous.position[k]+(m.position[k]-m.previous.position[k])*partial),
    yaw:m.previous.yaw+wrap(m.yaw-m.previous.yaw)*partial,pitch:m.previous.pitch+(m.pitch-m.previous.pitch)*partial,age:m.tick+partial}
}
