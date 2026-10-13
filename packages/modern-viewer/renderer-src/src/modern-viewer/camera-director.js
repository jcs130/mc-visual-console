import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { raycastVoxelSolid } from 'minecraft-renderer/src/three/thirdPersonVoxelRaycast.ts';
import { normalizeCameraSettings } from './camera-preferences.js';
export { normalizeCameraSettings, loadCameraSettings, CAMERA_SETTINGS_KEY } from './camera-preferences.js';

CameraControls.install({ THREE });
const number = (v, lo, hi, fallback) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
const angleDelta = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));

/** Sweep the near plane through real voxel data, including long orbit distances.
 * Unloaded columns are a boundary, never an invitation to look through terrain. */
export function cameraCollisionDistance(focus, direction, distance, { isSolid = () => false, columnKnown = () => true, fov = 75, aspect = 16/9 } = {}) {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  const solid = (x,y,z) => !columnKnown(x,z) || isSolid(x,y,z);
  const radius = Math.min(.3, Math.max(.12, .1*Math.tan(fov*Math.PI/360)*aspect));
  let allowed = distance;
  // Three orthogonal pairs protect the near plane at every yaw/pitch.
  for (const [x,y,z] of [[0,0,0],[radius,0,0],[-radius,0,0],[0,radius,0],[0,-radius,0],[0,0,radius],[0,0,-radius]]) {
    const hit = raycastVoxelSolid(focus.x+x, focus.y+y, focus.z+z, direction.x, direction.y, direction.z, distance, .1, .05, solid);
    if (hit) allowed = Math.min(allowed, Math.max(.05, hit.distance-.12));
  }
  return allowed;
}

/** Operates a detached, target-relative camera. The host applies its output
 * through the renderer's floating-origin API; it never writes actor controls. */
export class CameraDirector {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(75,16/9,.1,1000);
    this.controls = new CameraControls(this.camera);
    // We drive this solver every frame and do not await transitions. In 3.1.2
    // setLookAt(true) otherwise accumulates a rest listener for every moving
    // frame. This public threshold changes completion events, not damping.
    this.controls.restThreshold = Infinity;
    this.controls.minDistance = .15; this.controls.maxDistance = 24;
    this.last = null; this.heading = 0; this.orbit = 0; this.safeDistance = null; this.shot = null;
    this.direction = new THREE.Vector3(); this.lastPose = null;
  }
  startShot(kind, now) {
    if(kind==='stop'){this.shot=null;return;}
    if (!['orbit','pullback'].includes(kind) || !Number.isFinite(now)) return;
    this.shot = { kind, at: now, duration: kind === 'orbit' ? 14000 : 9000, startAngle: this.orbit };
  }
  reset() { this.last = null; this.lastPose = null; this.safeDistance = null; this.shot = null; }
  update(target, options, now, { aspect = 16/9, isSolid = () => false, columnKnown = () => true, instant = false } = {}) {
    const settings = normalizeCameraSettings(options), pos = target?.position;
    if (!pos || ![pos.x,pos.y,pos.z,now].every(Number.isFinite)) { this.reset(); return null; }
    if (settings.mode === 'manual' && !this.shot) return null;
    const previous = this.last, moved = previous ? Math.hypot(pos.x-previous.x,pos.y-previous.y,pos.z-previous.z) : Infinity;
    const reset = !previous || previous.key !== target.key || moved > 8 || now-previous.at > 1500 || instant;
    const dt = reset ? 1/60 : Math.max(.001,Math.min(.05,(now-previous.at)/1000));
    if (reset) { this.heading = Number.isFinite(target.yaw) ? target.yaw : 0; this.orbit = this.heading; this.safeDistance = null; }
    else {
      const dx=pos.x-previous.x,dz=pos.z-previous.z;
      // Follow travel direction. Stationary AI look/scan packets cannot spin the shot.
      if (Math.hypot(dx,dz) > .005) {
        const delta = angleDelta(Math.atan2(-dx,-dz),this.heading), maximum=settings.turnSpeed*dt;
        this.heading += Math.max(-maximum,Math.min(maximum,delta));
      }
    }
    this.last = {x:pos.x,y:pos.y,z:pos.z,key:target.key,at:now};
    let mode=settings.mode, distance=settings.distance, angle=this.heading;
    if (this.shot) {
      const t=Math.min(1,Math.max(0,(now-this.shot.at)/this.shot.duration));
      if (t >= 1) this.shot = null;
      else if (this.shot.kind === 'orbit') { mode='orbit'; angle=this.shot.startAngle+t*Math.PI*2; }
      else { mode='follow'; distance *= 1+1.3*Math.sin(t*Math.PI); }
    }
    if (mode==='orbit' && this.shot?.kind!=='orbit') { this.orbit += settings.orbitSpeed*Math.PI/180*dt; angle=this.orbit; }
    if (mode==='front') angle+=Math.PI;
    const height=number(target.height,.3,8,1.8), focusHeight=height*.65;
    distance=Math.min(20,Math.max(distance,height*.65/Math.tan(settings.fov*Math.PI/360)));
    this.camera.aspect=number(aspect,.25,4,16/9);
    // Shift camera AND aim together. A lateral camera aimed at the player
    // still puts the player in the centre, rather than a third-person frame.
    const side=mode==='shoulder'?distance*Math.tan(settings.fov*Math.PI/360)*this.camera.aspect*settings.framing:0;
    const aim={x:Math.cos(angle)*side,y:focusHeight,z:-Math.sin(angle)*side};
    const horizontal = mode === 'overhead' ? distance*.3 : distance;
    const offset={x:Math.sin(angle)*horizontal+Math.cos(angle)*side,
      y:focusHeight+settings.height+(mode==='overhead'?distance*1.3:0),
      z:Math.cos(angle)*horizontal-Math.sin(angle)*side};
    this.controls.smoothTime=settings.smoothTime;
    this.camera.fov=settings.fov;this.camera.aspect=number(aspect,.25,4,16/9);this.camera.updateProjectionMatrix();
    this.controls.normalizeRotations().setLookAt(offset.x,offset.y,offset.z,aim.x,aim.y,aim.z,!reset);
    this.controls.update(dt);
    const focus={x:pos.x,y:pos.y+focusHeight,z:pos.z}, v=this.camera.position;
    this.direction.set(v.x,v.y-focusHeight,v.z);const requested=this.direction.length();this.direction.normalize();
    const allowed = settings.collision ? cameraCollisionDistance(focus, this.direction, requested,
      {isSolid, columnKnown, fov:settings.fov, aspect:this.camera.aspect}) : requested;
    // Pull in immediately to avoid crossing a wall; recover distance gradually.
    this.safeDistance=this.safeDistance===null||allowed<this.safeDistance?allowed:this.safeDistance+(allowed-this.safeDistance)*(1-Math.exp(-dt/Math.max(.15,settings.smoothTime)));
    const p={x:focus.x+this.direction.x*this.safeDistance,y:focus.y+this.direction.y*this.safeDistance,z:focus.z+this.direction.z*this.safeDistance};
    const aimPoint=this.controls.getTarget(new THREE.Vector3()),weight=requested>0?this.safeDistance/requested:0;
    const viewFocus={x:pos.x+aimPoint.x*weight,y:focus.y,z:pos.z+aimPoint.z*weight};
    this.direction.set(p.x-viewFocus.x,p.y-viewFocus.y,p.z-viewFocus.z).normalize();
    const yaw=Math.atan2(this.direction.x,this.direction.z),pitch=-Math.asin(Math.max(-1,Math.min(1,this.direction.y)));
    return this.lastPose={position:p,focus:viewFocus,yaw,pitch,fov:settings.fov,distance:this.safeDistance,occluded:allowed<requested-.05,shot:this.shot?.kind??null,mode};
  }
  dispose() { this.controls.dispose();this.reset(); }
}
