import * as THREE from 'three'

// Exact original meshes, indexed by their received block coordinates. This is
// a broad phase only: the hit still uses the original triangles, material side
// and instance matrix. No full-cube collision or guessed voxel substitutes.
export function createNativeTerrainRaycast(root) {
  const cells=new Map(),unindexed=[],instance=new THREE.Matrix4(),matrix=new THREE.Matrix4(),probe=new THREE.Mesh()
  const cell=(x,y,z)=>`${x},${y},${z}`
  root?.updateMatrixWorld(true)
  root?.traverse(mesh=>{
    if(!mesh.isMesh)return
    const positions=mesh.userData.nativeBlockPositions
    if(!mesh.isInstancedMesh||!Array.isArray(positions)){unindexed.push(mesh);return}
    for(let i=0;i<mesh.count;i++){
      const key=cell(positions[i*3],positions[i*3+1],positions[i*3+2]),entries=cells.get(key)??[]
      entries.push({mesh,id:i});cells.set(key,entries)
    }
  })
  return ray=>{
    if(!Number.isFinite(ray.far)||ray.far>200)return []
    const selected=new Set(),hits=[],point=new THREE.Vector3()
    // Original block models can extend into an adjacent cell (doors, fences,
    // beds and authored offsets). Include that halo, then exact-test faces.
    for(let at=0;at<=ray.far+.25;at+=.25){
      ray.ray.at(Math.min(at,ray.far),point)
      const x=Math.floor(point.x),y=Math.floor(point.y),z=Math.floor(point.z)
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(const entry of cells.get(cell(x+dx,y+dy,z+dz))??[])selected.add(entry)
    }
    for(const {mesh,id}of selected){
      if(!mesh.visible)continue
      mesh.getMatrixAt(id,instance);matrix.multiplyMatrices(mesh.matrixWorld,instance)
      probe.geometry=mesh.geometry;probe.material=mesh.material;probe.matrixWorld.copy(matrix)
      const result=[];probe.raycast(ray,result)
      for(const hit of result)hits.push({...hit,object:mesh,instanceId:id})
    }
    for(const mesh of unindexed)if(mesh.visible)mesh.raycast(ray,hits)
    return hits.sort((a,b)=>a.distance-b.distance)
  }
}
