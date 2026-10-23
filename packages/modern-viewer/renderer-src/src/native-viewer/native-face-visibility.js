import { nativeOpaqueFullCube } from '../../tools/native-occlusion.mjs'

export const NATIVE_FACE_DIRECTIONS = Object.freeze([[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]])
// Dense, bounded received occupancy; never infer solidity from a block's name.
export function nativeFaceVisibility(snapshot) {
  const b=snapshot.bounds,w=b.maxX-b.minX+1,d=b.maxZ-b.minZ+1,layer=w*d
  const opaque=new Uint8Array(layer*(b.maxY-b.minY+1)),states=new Map(snapshot.states.map(s=>[s.stateId,s]))
  const index=(x,y,z)=>(y-b.minY)*layer+(z-b.minZ)*w+x-b.minX
  for(const group of snapshot.groups)if(nativeOpaqueFullCube(states.get(group.stateId)))
    for(let i=0;i<group.positions.length;i+=3)opaque[index(...group.positions.slice(i,i+3))]=1
  for(const [y,z,lo,hi,id]of snapshot.occludedSolidRuns??[])if(nativeOpaqueFullCube(states.get(id)))opaque.fill(1,index(lo,y,z),index(hi,y,z)+1)
  return (x,y,z)=>{
    let mask=0
    for(let n=0;n<6;n++){
      const delta=NATIVE_FACE_DIRECTIONS[n],px=x+delta[0],py=y+delta[1],pz=z+delta[2]
      if(px<b.minX||px>b.maxX||py<b.minY||py>b.maxY||pz<b.minZ||pz>b.maxZ||!opaque[index(px,py,pz)])mask|=1<<n
    }
    return mask
  }
}
