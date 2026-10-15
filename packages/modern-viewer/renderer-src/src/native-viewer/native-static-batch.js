import { Matrix4 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Immutable authored faces only. Instances still use every original block's
// offset, state and tint; no face/namespace or transparent geometry is removed.
export function nativeStaticBatches(model) {
  model.updateMatrixWorld(true)
  const groups=new Map(),owned=[]
  model.traverse(part=>{
    if(!part.isMesh)return
    if(part.isSkinnedMesh||part.isInstancedMesh||Array.isArray(part.material)||part.geometry.morphAttributes.position?.length)
      throw Error('NATIVE_STATIC_BATCH_DYNAMIC_MODEL')
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
