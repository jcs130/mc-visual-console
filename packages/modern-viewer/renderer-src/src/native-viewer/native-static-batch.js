import { Matrix4, Matrix3, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// A missing edge biome invalidates that block's tint, not thousands of other
// received instances sharing its material. Keep every independently known one.
export async function nativeInstanceTints(state,positions,batches,environment,work,onIssue=()=>{}){
  const indices=[...new Set(batches.map(p=>p.userData.tintIndex).filter(n=>n>=0))]
  const tints=new Map(indices.map(n=>[n,[]]))
  if(!indices.length)return {positions,tints}
  const valid=[];let reported=false
  for(let i=0;i<positions.length;i+=3){
    const pause=work?.checkpoint();if(pause)await pause
    const p={x:positions[i],y:positions[i+1],z:positions[i+2]}
    try{
      const colors=indices.map(n=>environment.blockTint(state,p,n));valid.push(p.x,p.y,p.z)
      indices.forEach((n,j)=>tints.get(n).push(colors[j]))
    }catch(error){if(!reported){reported=true;onIssue(error)}}
  }
  return {positions:valid,tints}
}

// Immutable authored faces only. Instances still use every original block's
// offset, state and tint. Only explicitly authored cullfaces facing a confirmed
// full opaque neighbor can be omitted; other geometry stays intact.
export function nativeStaticBatches(model, { faceMask = 63 } = {}) {
  model.updateMatrixWorld(true)
  const groups=new Map(),owned=[]
  model.traverse(part=>{
    if(!part.isMesh)return
    if(part.isSkinnedMesh||part.isInstancedMesh||Array.isArray(part.material)||part.geometry.morphAttributes.position?.length)
      throw Error('NATIVE_STATIC_BATCH_DYNAMIC_MODEL')
    const direction={west:[-1,0,0],east:[1,0,0],down:[0,-1,0],up:[0,1,0],north:[0,0,-1],south:[0,0,1]}[part.userData.cullface]
    if(direction&&faceMask!==63){
      const normal=new Vector3(...direction).applyNormalMatrix(new Matrix3().getNormalMatrix(part.matrixWorld))
      const axis=[normal.x,normal.y,normal.z].findIndex(value=>Math.abs(value)>1-1e-6)
      // Diagonally rotated or undeclared faces remain authored geometry.
      if(axis>=0){const bit=axis*2+([normal.x,normal.y,normal.z][axis]>0?1:0);if(!(faceMask&(1<<bit)))return}
    }
    const key=JSON.stringify([part.material.uuid,part.userData.tintIndex??-1,part.userData.shade??null])
    if(!groups.has(key))groups.set(key,[])
    groups.get(key).push(part)
  })
  try {
    const batches=[]
    for(const parts of groups.values()){
      const geometries=[]
      try{
        for(const part of parts){
          const geometry=part.geometry.clone().applyMatrix4(part.matrixWorld)
          geometries.push(geometry)
          if(part.matrixWorld.determinant()<0){
            if(!geometry.index)throw Error('NATIVE_STATIC_BATCH_REFLECTION_INDEX_REQUIRED')
            const index=geometry.index
            for(let n=0;n<index.count;n+=3){const a=index.getX(n);index.setX(n,index.getX(n+2));index.setX(n+2,a)}
          }
        }
        const geometry=mergeGeometries(geometries)
        if(!geometry)throw Error('NATIVE_STATIC_BATCH_ATTRIBUTES_MISMATCH')
        owned.push(geometry)
        batches.push({geometry,material:parts[0].material,matrixWorld:new Matrix4(),
          userData:{tintIndex:parts[0].userData.tintIndex??-1,shade:parts[0].userData.shade,
            nativeOriginalFaces:parts.map(part=>({...part.userData}))}})
      }finally{for(const geometry of geometries)geometry.dispose()}
    }
    let disposed=false
    return {batches,dispose(){if(disposed)return;disposed=true;for(const geometry of owned)geometry.dispose()}}
  }catch(error){for(const geometry of owned)geometry.dispose();throw error}
}
