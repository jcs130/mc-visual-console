import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
export const NATIVE_PARTICLE_COLLISION_SHA256='3eb554012eb5c5fad976ab944fff7ae3b2ee5a723bb9fbe7024ba7605348959a'
export async function loadNativeParticleCollisions(root,states,registrySha256){
  try{
    const bytes=await fs.readFile(path.join(root,'registry/particle-collisions.json'))
    if(bytes.length>16*1024*1024||createHash('sha256').update(bytes).digest('hex')!==NATIVE_PARTICLE_COLLISION_SHA256)throw Error('NATIVE_PARTICLE_COLLISION_SOURCE_MISMATCH')
    const data=JSON.parse(bytes)
    if(data.schemaVersion!==1||data.minecraftVersion!=='1.21.1'||data.source!=='original_static_block_collision_empty_context'||data.nativeRegistrySha256!==registrySha256||data.states.length!==states.size)throw Error('NATIVE_PARTICLE_COLLISION_REGISTRY_MISMATCH')
    const ids=new Set(),merged=new Map()
    for(const row of data.states){
      const state=states.get(row.stateId)
      if(!state||ids.has(row.stateId)||row.name!==state.name||JSON.stringify(row.properties)!==JSON.stringify(state.properties))throw Error('NATIVE_PARTICLE_COLLISION_STATE_MISMATCH')
      ids.add(row.stateId)
      if(typeof row.large!=='boolean')throw Error('NATIVE_PARTICLE_COLLISION_STATE_INVALID')
      if(row.unavailable){merged.set(row.stateId,{...state,collisionLarge:row.large,collisionUnavailable:row.unavailable});continue}
      if(!Array.isArray(row.boxes)||row.boxes.length>128||row.boxes.some(b=>!Array.isArray(b)||b.length!==6||!b.every(Number.isFinite)||b.some(n=>n< -16||n>16)||[0,1,2].some(i=>b[i]>b[i+3])))throw Error('NATIVE_PARTICLE_COLLISION_BOX_INVALID')
      const voxel=row.voxel
      if(!voxel||!Array.isArray(voxel.dimensions)||voxel.dimensions.length!==3||voxel.dimensions.some(n=>!Number.isInteger(n)||n<0||n>16)||
        !Array.isArray(voxel.axes)||voxel.axes.length!==3||voxel.axes.some((axis,i)=>!Array.isArray(axis)||axis.length!==voxel.dimensions[i]+1||
          axis.some((n,j)=>!Number.isFinite(n)||n< -16||n>16||j>0&&n<=axis[j-1]))||typeof voxel.occupied!=='string'||typeof row.canonicalFullBlock!=='boolean')throw Error('NATIVE_PARTICLE_COLLISION_VOXEL_INVALID')
      const cells=voxel.dimensions.reduce((a,b)=>a*b,1),bits=Buffer.from(voxel.occupied,'base64')
      if(bits.length!==Math.ceil(cells/8)||bits.toString('base64')!==voxel.occupied||cells%8&&bits.at(-1)>>cells%8)throw Error('NATIVE_PARTICLE_COLLISION_OCCUPANCY_INVALID')
      merged.set(row.stateId,{...state,collisionBoxes:row.boxes,collisionVoxel:voxel,collisionLarge:row.large,collisionFullBlock:row.canonicalFullBlock})
    }
    return{available:true,states:merged,sourceSha256:NATIVE_PARTICLE_COLLISION_SHA256,source:data.source}
  }catch(error){return{available:false,states,reason:error.code==='ENOENT'?'NATIVE_PARTICLE_COLLISION_TABLE_MISSING':error.message.startsWith('NATIVE_')?error.message:'NATIVE_PARTICLE_COLLISION_TABLE_INVALID'}}
}
