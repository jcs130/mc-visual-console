export const TWILIGHT_MULTIPART_SOURCE='493da16d10210f9f53a3c33b3d8fcb4ae9b14016ee420d753c894562bd9aba35'
const position=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=30000000)
// TFPart.writeData sends dirty metadata; movement lists contain all parts.
// Keep metadata only for the same parent UUID and received part ID. A removed
// or untracked parent never borrows another entity's body components.
export function twilightMultipartFrame(entity,packet,{observedAt,sequence}={}){
  if(!entity?.name?.startsWith('twilightforest:')||entity.entityId!==packet?.entityId||
    packet.sourceJarSha256!==TWILIGHT_MULTIPART_SOURCE||packet.sourceChannel!=='twilightforest:update_multipart_entity'||
    !Number.isFinite(observedAt)||!Number.isSafeInteger(sequence)||!Array.isArray(packet.parts)||packet.parts.length>128)throw Error('NATIVE_TWILIGHT_MULTIPART_IDENTITY_INVALID')
  if(entity.multipart&&entity.multipart.parentUuid!==entity.uuid)throw Error('NATIVE_TWILIGHT_MULTIPART_IDENTITY_INVALID')
  const old=new Map((entity.multipart?.parts??[]).map(p=>[p.entityId,p])),seen=new Set(),parts=[]
  for(const p of packet.parts){
    if(!Number.isSafeInteger(p?.entityId)||p.entityId<=0||p.entityId===entity.entityId||seen.has(p.entityId)||!position(p.position)||
      ![p.yaw,p.pitch,p.width,p.height].every(Number.isFinite)||p.width<0||p.height<0||p.width>128||p.height>128||typeof p.fixed!=='boolean'||!Array.isArray(p.metadata)||p.metadata.length>128)throw Error('NATIVE_TWILIGHT_MULTIPART_PART_INVALID')
    seen.add(p.entityId);const prior=old.get(p.entityId),metadata=new Map((prior?.metadata??[]).map(m=>[m.key,m])),dirty=new Set()
    for(const m of p.metadata){
      if(!Number.isInteger(m?.key)||m.key<0||m.key>=255||dirty.has(m.key)||!(typeof m.type==='string'||Number.isSafeInteger(m.type)))throw Error('NATIVE_TWILIGHT_MULTIPART_METADATA_INVALID')
      dirty.add(m.key);metadata.set(m.key,structuredClone(m))
    }
    parts.push({...structuredClone(p),metadata:[...metadata.values()],previous:prior?{position:{...prior.position},yaw:prior.yaw,pitch:prior.pitch,observedAt:entity.multipart.observedAt}:null})
  }
  return {source:'same_connection_twilight_multipart_packet',parentUuid:entity.uuid,sourceJarSha256:TWILIGHT_MULTIPART_SOURCE,observedAt,sequence,parts}
}
