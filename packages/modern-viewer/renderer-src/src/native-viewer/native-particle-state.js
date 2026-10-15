import {NativeSoundRandom} from './native-sound-selection.js'
export const NATIVE_PARTICLE_TYPES=Object.freeze(['heart','angry_villager','crit','enchanted_hit','damage_indicator','flame','small_flame','smoke','poof','explosion','sweep_attack'])
const f=Math.fround,mul=(a,b)=>f(f(a)*f(b)),add=(a,b)=>f(f(a)+f(b)),clamp=(n,a,b)=>Math.max(a,Math.min(b,n))
const finite=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]))
export class NativeParticleRandom extends NativeSoundRandom {
  float(){return this.next(24)/16777216}
  double(){return (this.next(26)*134217728+this.next(27))/9007199254740992}
  gaussian(){
    if(this.gaussianReady){this.gaussianReady=false;return this.gaussianValue}
    let x,y,r;do{x=2*this.double()-1;y=2*this.double()-1;r=x*x+y*y}while(r>=1||r===0)
    const s=Math.sqrt(-2*Math.log(r)/r);this.gaussianValue=y*s;this.gaussianReady=true;return x*s
  }
}
export function nativeParticlePacket(packet){
  const name=packet?.particle?.type
  if(!finite(packet)||typeof name!=='string'||!NATIVE_PARTICLE_TYPES.includes(name)||!Number.isInteger(packet.amount)||packet.amount<0||packet.amount>4096||
    ![packet.offsetX,packet.offsetY,packet.offsetZ,packet.velocityOffset].every(Number.isFinite))return null
  return{name,position:{x:packet.x,y:packet.y,z:packet.z},spread:{x:packet.offsetX,y:packet.offsetY,z:packet.offsetZ},speed:packet.velocityOffset,
    count:packet.amount,longDistance:packet.longDistance===true,source:'received_native_particle_packet',randomPhase:'observer_local_not_server_seed'}
}
export function expandNativeParticlePacket(value,random){
  if(value.count===0)return[{position:{...value.position},velocity:Object.fromEntries(['x','y','z'].map(k=>[k,f(f(value.spread[k])*f(value.speed))]))}]
  return Array.from({length:value.count},()=>{
    const position=Object.fromEntries(['x','y','z'].map(k=>[k,value.position[k]+random.gaussian()*f(value.spread[k])]))
    const velocity=Object.fromEntries(['x','y','z'].map(k=>[k,random.gaussian()*f(value.speed)]))
    return{position,velocity}
  })
}
const box=(p,size=f(.2))=>[p.x-size/2,p.y,p.z-size/2,p.x+size/2,p.y+size,p.z+size/2]
export function createNativeParticle(name,position,velocity,{particle:P,math:M,world:W}){
  if(!NATIVE_PARTICLE_TYPES.includes(name)||!finite(position)||!finite(velocity))throw Error('NATIVE_PARTICLE_INPUT_INVALID')
  const p={name,position:{...position},previous:{...position},box:box(position),velocity:{x:0,y:0,z:0},age:0,lifetime:0,
    color:[1,1,1],alpha:1,gravity:0,friction:f(.98),physics:true,onGround:false,stopped:false,removed:false,speedUp:false}
  P.float() // Discarded provisional lifetime draw is still consumed.
  const v=velocity
  if(name!=='poof'){
    const incoming=['flame','small_flame'].includes(name)?v:{x:0,y:0,z:0}
    const n=Object.fromEntries(['x','y','z'].map(k=>[k,incoming[k]+(2*M.double()-1)*f(.4)]))
    const speed=(M.double()+M.double()+1)*f(.15),length=Math.sqrt(n.x*n.x+n.y*n.y+n.z*n.z)
    p.velocity={x:n.x/length*speed*f(.4),y:n.y/length*speed*f(.4)+f(.1),z:n.z/length*speed*f(.4)}
  }
  p.size=mul(mul(.1,add(mul(P.float(),.5),.5)),2)
  if(['heart','angry_villager'].includes(name)){
    if(name==='angry_villager'){p.position.y+=.5;p.previous.y+=.5;p.box=box(p.position)}
    p.velocity=Object.fromEntries(['x','y','z'].map(k=>[k,p.velocity[k]*f(.01)+(k==='y'?.1:0)]))
    p.friction=f(.86);p.speedUp=true;p.physics=false;p.size=mul(p.size,1.5);p.lifetime=16;P.nextInt(1)
  }else if(['crit','enchanted_hit','damage_indicator'].includes(name)){
    p.friction=f(.7);p.gravity=f(.5);p.physics=false
    p.velocity=Object.fromEntries(['x','y','z'].map(k=>[k,p.velocity[k]*f(.1)+(v[k]+(k==='y'&&name==='damage_indicator'?1:0))*.4]))
    const gray=f(M.double()*f(.3)+f(.6));p.color=[gray,gray,gray];p.size=mul(p.size,.75);p.lifetime=Math.max(Math.trunc(6/(M.double()*.8+.6)),1)
    tickNativeParticle(p)
    if(name==='enchanted_hit'){p.color[0]=mul(p.color[0],.3);p.color[1]=mul(p.color[1],.8)}
    if(name==='damage_indicator')p.lifetime=20
    P.nextInt(1)
  }else if(['flame','small_flame'].includes(name)){
    p.friction=f(.96);p.velocity=Object.fromEntries(['x','y','z'].map(k=>[k,p.velocity[k]*f(.01)+v[k]]))
    for(const k of ['x','y','z'])p.position[k]+=mul(f(P.float()-P.float()),.05)
    p.lifetime=Math.trunc(8/(M.double()*.8+.2))+4;P.nextInt(1)
    if(name==='small_flame'){p.size=mul(p.size,.5);p.box=box(p.position,f(.1))}
  }else if(name==='smoke'){
    p.friction=f(.96);p.gravity=f(-.1);p.speedUp=true;p.velocity=Object.fromEntries(['x','y','z'].map(k=>[k,p.velocity[k]*f(.1)+v[k]]))
    const gray=mul(W.float(),.3);p.color=[gray,gray,gray];p.size=mul(p.size,.75);p.lifetime=Math.max(Math.trunc(8/(W.float()*.8+.2)),1)
  }else if(name==='poof'){
    p.friction=f(.9);p.gravity=f(-.1);p.velocity=Object.fromEntries(['x','y','z'].map(k=>[k,v[k]+(2*M.double()-1)*f(.05)]))
    const gray=add(mul(P.float(),.3),.7);p.color=[gray,gray,gray];p.size=mul(.1,add(mul(mul(P.float(),P.float()),6),1));p.lifetime=Math.trunc(16/(P.float()*.8+.2))+2
  }else{
    p.lifetime=name==='explosion'?6+P.nextInt(4):4
    const gray=add(mul(P.float(),.6),.4);p.color=[gray,gray,gray];p.size=mul(name==='explosion'?2:1,f(1-mul(f(v.x),.5)))
  }
  return p
}
export function tickNativeParticle(p,collide){
  if(p.removed)return false;p.previous={...p.position}
  if(p.age++>=p.lifetime){p.removed=true;if(['crit','enchanted_hit','damage_indicator'].includes(p.name)){p.color[1]=mul(p.color[1],.96);p.color[2]=mul(p.color[2],.9)}return false}
  if(!['explosion','sweep_attack'].includes(p.name)){
    p.velocity.y-=.04*p.gravity
    if(!p.stopped){
      const requested={...p.velocity};let accepted=requested
      const flame=['flame','small_flame'].includes(p.name)
      if(p.physics&&!flame&&Math.hypot(requested.x,requested.y,requested.z)<100){
        if(!collide)throw Error('NATIVE_PARTICLE_COLLISION_UNAVAILABLE')
        accepted=collide(p.box,requested)
      }
      for(let i=0;i<6;i++)p.box[i]+=accepted[['x','y','z'][i%3]]
      p.position={x:(p.box[0]+p.box[3])/2,y:p.box[1],z:(p.box[2]+p.box[5])/2}
      if(!flame){p.stopped=Math.abs(requested.y)>=f(1e-5)&&Math.abs(accepted.y)<f(1e-5);p.onGround=requested.y!==accepted.y&&requested.y<0
        if(requested.x!==accepted.x)p.velocity.x=0;if(requested.z!==accepted.z)p.velocity.z=0}
    }
    if(p.speedUp&&p.position.y===p.previous.y){p.velocity.x*=1.1;p.velocity.z*=1.1}
    for(const k of ['x','y','z'])p.velocity[k]*=p.friction
    if(p.onGround){p.velocity.x*=f(.7);p.velocity.z*=f(.7)}
  }
  if(['crit','enchanted_hit','damage_indicator'].includes(p.name)){p.color[1]=mul(p.color[1],.96);p.color[2]=mul(p.color[2],.9)}
  return true
}
export function nativeParticleFrame(p,partial,spriteCount=1){
  if(p.removed)return null
  const age=add(p.age,partial),progress=f(age/f(p.lifetime)),ramp=clamp(mul(progress,32),0,1)
  const q=['flame','small_flame'].includes(p.name)?mul(p.size,f(1-mul(mul(progress,progress),.5))):['poof','explosion','sweep_attack'].includes(p.name)?p.size:mul(p.size,ramp)
  return{position:Object.fromEntries(['x','y','z'].map(k=>[k,p.previous[k]+(p.position[k]-p.previous[k])*partial])),size:q,color:[...p.color],alpha:p.alpha,
    sprite:Math.trunc(p.age*(spriteCount-1)/p.lifetime),fullBright:['explosion','sweep_attack'].includes(p.name),lightmapVerified:false}
}

const voxelBits=new WeakMap(),EPSILON=1e-7
function occupancy(voxel){
  if(!voxelBits.has(voxel))voxelBits.set(voxel,Uint8Array.from(atob(voxel.occupied),c=>c.charCodeAt(0)))
  return voxelBits.get(voxel)
}
const upperBound=(coordinates,value)=>{let lo=0,hi=coordinates.length;while(lo<hi){const mid=(lo+hi)>>>1;if(value<coordinates[mid])hi=mid;else lo=mid+1}return lo-1}
// Original VoxelShape.collideX. Merged toAabbs() cannot replace the discrete
// planes when a particle starts embedded inside an unoptimized shape.
export function collideNativeParticleVoxel(voxel,axis,box,distance){
  const bits=occupancy(voxel);if(!bits.some(Boolean))return distance
  if(Math.abs(distance)<EPSILON)return 0
  const axes=[axis,(axis+1)%3,(axis+2)%3],[A,B,C]=axes,dimensions=voxel.dimensions
  const minI=upperBound(voxel.axes[A],box[A]+EPSILON),maxI=upperBound(voxel.axes[A],box[A+3]-EPSILON)
  const loB=Math.max(0,upperBound(voxel.axes[B],box[B]+EPSILON)),hiB=Math.min(dimensions[B],upperBound(voxel.axes[B],box[B+3]-EPSILON)+1)
  const loC=Math.max(0,upperBound(voxel.axes[C],box[C]+EPSILON)),hiC=Math.min(dimensions[C],upperBound(voxel.axes[C],box[C+3]-EPSILON)+1)
  const full=(i,j,k)=>{const c=[];c[A]=i;c[B]=j;c[C]=k;const index=(c[0]*dimensions[1]+c[1])*dimensions[2]+c[2];return (bits[index>>3]&(1<<(index&7)))!==0}
  const step=distance>0?1:-1
  for(let i=distance>0?maxI+1:minI-1;distance>0?i<dimensions[A]:i>=0;i+=step)for(let j=loB;j<hiB;j++)for(let k=loC;k<hiC;k++)if(full(i,j,k)){
    const gap=voxel.axes[A][distance>0?i:i+1]-box[distance>0?A+3:A]
    if(distance>0?gap>=-EPSILON:gap<=EPSILON)distance=distance>0?Math.min(distance,gap):Math.max(distance,gap)
    return distance
  }
  return distance
}
export function collideNativeParticleShapes(box,velocity,shapes){
  const b=[...box],v={...velocity}
  const axis=k=>{const i=['x','y','z'].indexOf(k)
    for(const shape of shapes){
      if(Math.abs(v[k])<EPSILON){v[k]=0;break}
      const local=b.map((n,j)=>n-shape.position[j%3]);v[k]=collideNativeParticleVoxel(shape.voxel,i,local,v[k])
    }
    b[i]+=v[k];b[i+3]+=v[k]
  }
  axis('y');if(Math.abs(v.x)<Math.abs(v.z)){axis('z');axis('x')}else{axis('x');axis('z')}
  return v
}
