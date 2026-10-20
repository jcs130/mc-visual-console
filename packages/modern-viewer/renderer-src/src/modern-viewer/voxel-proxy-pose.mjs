/** Relative view of an explicitly declared look-yaw placement marker, not observed body animation. */
export function proxyFacing(yaw,offset){
 if(!Number.isFinite(yaw)||!Array.isArray(offset)||offset.length!==3||!offset.every(Number.isFinite))throw Error('Explicit finite yaw and camera offset required');
 const distance=Math.hypot(offset[0],offset[2]);
 const forward=[-Math.sin(yaw),0,-Math.cos(yaw)];
 if(distance<.05)return {view:'overhead',forward,bodyOrientationObserved:false};
 const front=(forward[0]*offset[0]+forward[2]*offset[2])/distance;
 const right=(Math.cos(yaw)*offset[0]-Math.sin(yaw)*offset[2])/distance;
 const angle=Math.acos(Math.max(-1,Math.min(1,front)))*180/Math.PI;
 const side=right>=0?'right':'left';
 const view=angle<30?'front':angle<75?`${side}-front-three-quarter`:angle<105?`${side}-profile`:angle<150?`${side}-rear-three-quarter`:'rear';
 return {view,forward,angleDegrees:angle,bodyOrientationObserved:false,orientationSource:'observed-head-yaw-used-for-neutral-placement'};
}

/** Validate an explicit historical/virtual pose before updating a proxy camera. */
export function checkedProxyPose(pose){
 if(!pose||pose.convention!=='mineflayer-radians'||pose.roll!==0||!Array.isArray(pose.feet)||!Array.isArray(pose.eye)||pose.feet.length!==3||pose.eye.length!==3||![...pose.feet,...pose.eye,pose.yaw,pose.pitch,pose.fovDegrees].every(Number.isFinite)||pose.fovDegrees<10||pose.fovDegrees>150)throw Error('Explicit versioned finite proxy pose required');
 return {...pose,feet:[...pose.feet],eye:[...pose.eye]};
}
