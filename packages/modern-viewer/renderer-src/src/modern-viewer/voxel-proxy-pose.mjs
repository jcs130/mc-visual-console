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
