import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export async function loadNativePhysics(root,manifest){
  const expected=manifest.registryHashes?.['native-physics.json'];
  if(!expected)return {available:false,reason:'NATIVE_COLLISION_TABLE_NOT_PROVIDED',states:new Map()};
  const raw=await fs.readFile(path.join(root,'registry/native-physics.json'));
  if(raw.length>64*1048576||createHash('sha256').update(raw).digest('hex')!==expected)throw Error('NATIVE_PHYSICS_HASH_MISMATCH');
  const data=JSON.parse(raw),states=new Map();
  if(data.schemaVersion!==1||data.nativeRegistrySha256!==manifest.registryHashes['block-states.jsonl']||data.source!=='native_empty_block_getter'||
    !Array.isArray(data.shapes)||!Array.isArray(data.states)||data.shapes.length>65536||data.states.length>1048576)throw Error('NATIVE_PHYSICS_CONTRACT_INVALID');
  for(const shape of data.shapes){
    if(!Number.isFinite(shape.hardness)||!Number.isFinite(shape.friction)||typeof shape.canBreakWithHand!=='boolean'||!Array.isArray(shape.collisionBoxes)||shape.collisionBoxes.length>256||
      shape.collisionBoxes.some(b=>!Array.isArray(b)||b.length!==6||!b.every(Number.isFinite)||b.some(n=>n< -16||n>16)||[0,1,2].some(i=>b[i]>b[i+3])))throw Error('NATIVE_PHYSICS_SHAPE_INVALID');
  }
  for(const pair of data.states){if(!Array.isArray(pair)||pair.length!==2||!pair.every(Number.isInteger)||pair[0]<0||pair[0]>1048575||pair[1]<0||pair[1]>=data.shapes.length||states.has(pair[0]))throw Error('NATIVE_PHYSICS_STATE_INVALID');states.set(pair[0],data.shapes[pair[1]]);}
  return {available:true,source:data.source,sourceSha256:data.sourceSha256,states};
}
