import * as THREE from 'three'
import { RoomFloorMask } from '../modern-viewer/room-floor-mask.js'
import { createCutawayUniforms,patchCutawayMaterial,setRoomFloorMask,roomRevealRadius,advanceReveal } from '../modern-viewer/room-visibility.js'

export function nativeReceivedRoomCache(snapshot) {
  const states=new Map(snapshot.states.map(s=>[s.stateId,s])),blocks=new Map(),b=snapshot.bounds,columns=new Set(snapshot.viewCoverage?.receivedColumns??[])
  for(const group of snapshot.groups){const state=states.get(group.stateId);for(let i=0;i<group.positions.length;i+=3)blocks.set(group.positions.slice(i,i+3).join(','),state)}
  const known=(x,y,z)=>x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY&&z>=b.minZ&&z<=b.maxZ&&columns.has(`${Math.floor(x/16)},${Math.floor(z/16)}`)
  return {revision:`${snapshot.revision}:${Object.values(b).join(':')}`,known,
    isSolidBlock(x,y,z){if(!known(x,y,z))return true;const state=blocks.get(`${x},${y},${z}`);return state?.solid===true&&state.blocksMotion===true},
    hasCeiling(p){for(let height=2;height<=64;height++){
      let solid=0,received=0
      for(const [dx,dz]of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
        const x=Math.floor(p.x)+dx,y=Math.floor(p.y)+height,z=Math.floor(p.z)+dz
        if(known(x,y,z)){received++;if(this.isSolidBlock(x,y,z))solid++}
      }
      if(solid>=3)return true;if(!received)break
    }return false}}
}
export function createNativeRoomVisibility() {
  const uniforms=createCutawayUniforms(),ray=new THREE.Raycaster(),target=new THREE.Vector3(),direction=new THREE.Vector3()
  let cache=null,mask=null,last=0,reveal=0,status={active:false,reason:'waiting'},lastFrame=null
  return {uniforms,patch(material){return patchCutawayMaterial(material,uniforms)},
    stage(snapshot){cache=nativeReceivedRoomCache(snapshot);mask=new RoomFloorMask(cache);last=0},
    update({camera,pose,mode,enabled=true,raycast,now}){
      const dt=lastFrame===null?0:now-lastFrame;lastFrame=now
      if(!cache||!pose||mode!=='dungeon'||!enabled){status={active:false,reason:enabled?'view':'disabled'};uniforms.u_lanternCutawayEnabled.value=0;return status}
      target.set(pose.x,pose.y+1,pose.z)
      if(now-last>=100||last===0){
        const covered=cache.hasCeiling(pose),distance=camera.position.distanceTo(target)
        direction.copy(target).sub(camera.position).normalize();ray.set(camera.position,direction);ray.far=Math.max(0,distance-.8)
        const blocked=(raycast?.(ray)??[]).some(hit=>hit.distance>.05)
        const radius=roomRevealRadius(camera,target,pose.y,covered),floor=mask.update(pose,radius)
        setRoomFloorMask(uniforms,floor);uniforms.u_lanternRoomMaskOrigin.value.set(floor.origin.x,floor.baseY,floor.origin.z)
        uniforms.u_lanternRoomRadius.value=radius;uniforms.u_lanternFootY.value=floor.floorYAt(pose)??pose.y
        uniforms.u_lanternCutawayY.value=pose.y+1.95
        status={active:(covered||blocked)&&floor.openCells>0,covered,blocked,openCells:floor.openCells,reason:floor.openCells?'received_room':'floor_unavailable'};last=now
      }
      reveal=advanceReveal(reveal,status.active,dt)
      uniforms.u_lanternCutawayEnabled.value=reveal>0?(status.covered?2:3):0;uniforms.u_lanternReveal.value=reveal
      uniforms.u_lanternCutawayCamera.value.copy(camera.position);uniforms.u_lanternCutawayTarget.value.copy(target)
      return status
    },reset(){cache=null;mask=null;last=0;lastFrame=null;reveal=0;uniforms.u_lanternCutawayEnabled.value=0},dispose(){uniforms.u_lanternRoomMask.value.dispose()}}
}
