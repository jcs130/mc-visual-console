// A conservative air-connectivity mask for the optional surface observer.
// Only known, fully opaque solids can hide geometry. Unknown columns, glass,
// leaves and partial blocks never become occluders. Hidden solids remain in the
// snapshot's lossless native-state runs for collision/room queries.
export function * nativeSurfaceVisibility({ bounds: b, dimension, pose, stateAt, worldStateAt, isOpaque, maxSkyProbes = 2000000 }) {
  const width=b.maxX-b.minX+1, depth=b.maxZ-b.minZ+1, layer=width*depth, total=layer*(b.maxY-b.minY+1)
  const passable=new Uint8Array(total), seen=new Uint8Array(total), queue=new Int32Array(total)
  const index=(x,y,z)=>(y-b.minY)*layer+(z-b.minZ)*width+x-b.minX
  let head=0,tail=0,skyProbes=0
  const seed=(x,y,z)=>{
    if(x<b.minX||x>b.maxX||y<b.minY||y>b.maxY||z<b.minZ||z>b.maxZ)return
    const n=index(x,y,z)
    if(passable[n]===1&&!seen[n]){seen[n]=1;queue[tail++]=n}
  }
  for(let y=b.minY;y<=b.maxY;y++)for(let z=b.minZ;z<=b.maxZ;z++){
    yield
    for(let x=b.minX;x<=b.maxX;x++){
      const state=stateAt(x,y,z);passable[index(x,y,z)]=!state?2:isOpaque(state)?0:1
    }
  }
  // The top of a cropped volume is not necessarily sky (e.g. in a mine).
  // Probe only already received data up to the dimension's real ceiling.
  for(let z=b.minZ;z<=b.maxZ;z++)for(let x=b.minX;x<=b.maxX;x++){
    yield
    if(passable[index(x,b.maxY,z)]!==1)continue
    let sky=true
    for(let y=b.maxY+1;y<dimension.minY+dimension.height;y++){
      if(++skyProbes>maxSkyProbes)return null
      const state=worldStateAt(x,y,z)
      if(!state||isOpaque(state)){sky=false;break}
    }
    if(sky)seed(x,b.maxY,z)
  }
  if(pose)for(const y of [Math.floor(pose.y),Math.floor(pose.y+(pose.eyeHeight??1.62))])seed(Math.floor(pose.x),y,Math.floor(pose.z))
  while(head<tail){
    if((head&1023)===0)yield
    const n=queue[head++],y=Math.floor(n/layer),r=n-y*layer,z=Math.floor(r/width),x=r-z*width
    if(x>0)seed(x+b.minX-1,y+b.minY,z+b.minZ)
    if(x+1<width)seed(x+b.minX+1,y+b.minY,z+b.minZ)
    if(z>0)seed(x+b.minX,y+b.minY,z+b.minZ-1)
    if(z+1<depth)seed(x+b.minX,y+b.minY,z+b.minZ+1)
    if(y>0)seed(x+b.minX,y+b.minY-1,z+b.minZ)
    if(n+layer<total)seed(x+b.minX,y+b.minY+1,z+b.minZ)
  }
  const open=(x,y,z)=>{
    if(x<b.minX||x>b.maxX||y<b.minY||y>b.maxY||z<b.minZ||z>b.maxZ)return true
    const n=index(x,y,z);return passable[n]===2||seen[n]===1
  }
  return {skyProbes,visibleAirCells:tail,exposed:(x,y,z)=>open(x-1,y,z)||open(x+1,y,z)||open(x,y-1,z)||open(x,y+1,z)||open(x,y,z-1)||open(x,y,z+1)}
}
