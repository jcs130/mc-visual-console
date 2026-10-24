import * as THREE from 'three'
import { playerCamera } from './player-camera.js'

// Manual controls can be selected before the first world snapshot arrives.
// Keep that initialization pending until the real pose exists; otherwise the
// camera stays at (0,0,0), outside the new body's terrain, with only the HUD visible.
export class NativeOrbitCameraAnchor {
  constructor () { this.reset() }
  reset () { this.pending = true; this.previous = null }
  rebase (pose) {
    if (!pose || !['x','y','z'].every(key => Number.isFinite(pose[key]))) return false
    this.pending = false; this.previous = {x:pose.x,y:pose.y,z:pose.z}; return true
  }
  initialize ({ pose, mode, camera, controls }) {
    if (!this.pending || !pose || !['x', 'y', 'z', 'yaw', 'pitch'].every(key => Number.isFinite(pose[key]))) return false
    const view = playerCamera(pose, mode === 'region' ? 'region' : 'third')
    controls.target.fromArray(view.target); camera.position.fromArray(view.position); controls.update()
    this.rebase(pose)
    return true
  }
  // Manual third person changes the orbit, not its tracked body. Translate
  // camera AND aim from the displayed root, retaining the viewer's pan/zoom.
  // Region mode remains an explicitly stationary world camera.
  follow ({ pose, mode, camera, controls }) {
    if (mode !== 'third' || this.pending || !pose || !['x','y','z'].every(key => Number.isFinite(pose[key]))) return false
    if (this.previous) for (const axis of ['x','y','z']) {
      const delta = pose[axis] - this.previous[axis]
      camera.position[axis] += delta; controls.target[axis] += delta
    }
    this.rebase(pose); return true
  }
}

// A camera target is the displayed body root of the authenticated same player,
// never a name tag, model head bone, another observer or actor control API.
export function nativeCameraTarget(state,actor) {
  const self=state?.selfPlayer,position=actor?.root?.position??state?.pose
  if(!self?.uuid||!Number.isSafeInteger(self.entityId)||!position||!['x','y','z'].every(k=>Number.isFinite(position[k])))return null
  return {key:`${self.uuid}:${self.entityId}:${state.epoch}`,position:{x:position.x,y:position.y,z:position.z},
    yaw:Number.isFinite(state.pose?.yaw)?state.pose.yaw:0,height:1.8}
}

// Seven rays protect the near plane using only the actual rendered original
// meshes. Unknown/unreceived volume is a camera boundary, not invented terrain.
export function nativeCameraCollisionDistance(focus,direction,distance,{fov=70,aspect=16/9,scene,bounds,receivedColumns=[],raycast}={}) {
  if(!Number.isFinite(distance)||distance<=0)return 0
  if(!bounds)return Math.min(.05,distance)
  const columns=new Set(receivedColumns),radius=Math.min(.3,Math.max(.12,.1*Math.tan(fov*Math.PI/360)*aspect))
  const known=p=>p.x>=bounds.minX&&p.x<bounds.maxX+1&&p.y>=bounds.minY&&p.y<bounds.maxY+1&&p.z>=bounds.minZ&&p.z<bounds.maxZ+1&&
    columns.has(`${Math.floor(p.x/16)},${Math.floor(p.z/16)}`)
  const ray=new THREE.Raycaster(),unit=new THREE.Vector3(direction.x,direction.y,direction.z).normalize()
  let allowed=distance;scene?.updateMatrixWorld?.(true)
  for(const offset of [[0,0,0],[radius,0,0],[-radius,0,0],[0,radius,0],[0,-radius,0],[0,0,radius],[0,0,-radius]]) {
    const start={x:focus.x+offset[0],y:focus.y+offset[1],z:focus.z+offset[2]}
    for(let at=0;at<=allowed;at+=.1) {
      if(!known({x:start.x+unit.x*at,y:start.y+unit.y*at,z:start.z+unit.z*at})){allowed=Math.max(0,at-.12);break}
    }
    ray.set(new THREE.Vector3(start.x,start.y,start.z),unit);ray.far=allowed
    const hits=raycast?raycast(ray):scene?ray.intersectObject(scene,true):[]
    const hit=hits.find(hit=>hit.distance>.05)
    if(hit)allowed=Math.min(allowed,Math.max(0,hit.distance-.12))
  }
  return allowed
}
