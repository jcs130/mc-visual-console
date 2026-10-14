import * as THREE from 'three';

// Optional viewer-authored presentation for the standard articulated YSM rig.
// Original geometry/textures/clips are unchanged. This is not a native YSM clip
// or a simulation of recovery; only server-confirmed downed state enables it.
const joints=['Root','UpBody','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftLeg','LeftLowerLeg','LeftFoot','RightLeg','RightLowerLeg','RightFoot'];
export function supportsRescuePose(model){
 if(!joints.every(n=>model.bones.has(n)))return false;
 const below=(name,parent)=>{let b=model.bones.get(name);const p=model.bones.get(parent);while(b=b.parent)if(b===p)return true;return false;};
 return ['Left','Right'].every(side=>below(side+'ForeArm',side+'Arm')&&below(side+'Hand',side+'ForeArm')&&below(side+'LowerLeg',side+'Leg')&&below(side+'Foot',side+'LowerLeg'));
}
const world=b=>b.getWorldPosition(new THREE.Vector3());
function turnToward(bone,child,target){
 bone.updateWorldMatrix(true,true);
 const p=world(bone),from=world(child).sub(p),to=target.clone().sub(p);
 if(from.lengthSq()<1e-10||to.lengthSq()<1e-10)return;
 const delta=new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize());
 const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion());
 bone.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));
 bone.updateWorldMatrix(true,true);
}
function reach(model,names,target,pole){
 const [upper,lower,end]=names.map(n=>model.bones.get(n));
 const start=world(upper),a=world(lower).distanceTo(start),b=world(end).distanceTo(world(lower));
 const direction=target.clone().sub(start),distance=Math.max(Math.abs(a-b)+1e-5,Math.min(a+b-1e-5,direction.length()));direction.normalize();
 const side=pole.clone().sub(start);side.addScaledVector(direction,-side.dot(direction)).normalize();
 const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
 turnToward(upper,lower,start.clone().addScaledVector(direction,along).addScaledVector(side,height));
 turnToward(lower,end,target);
}

/** A low seated/kneeling body with one planted palm, other hand near the thigh. */
export function applyRescuePose(model,root){
 if(!supportsRescuePose(model))return {available:false,reason:'articulated_humanoid_rig_unavailable'};
 const rotate=(name,v)=>{const b=model.bones.get(name),r=model.initial.get(name).rotation;b.rotation.set(r.x+v[0]*Math.PI/180,r.y+v[1]*Math.PI/180,r.z+v[2]*Math.PI/180,'ZYX');};
 rotate('Root',[0,0,0]);rotate('UpBody',[35,0,-25]);rotate('Head',[-25,0,15]);
 rotate('LeftLeg',[-68,-12,-10]);rotate('LeftLowerLeg',[110,0,0]);rotate('LeftFoot',[-25,0,0]);
 rotate('RightLeg',[-42,10,16]);rotate('RightLowerLeg',[112,0,0]);rotate('RightFoot',[-28,0,0]);
 root.updateWorldMatrix(true,true);
 const origin=root.getWorldPosition(new THREE.Vector3());
 const shoulder=world(model.bones.get('RightArm')),elbow=world(model.bones.get('RightForeArm')),hand=world(model.bones.get('RightHand'));
 const reachLength=shoulder.distanceTo(elbow)+elbow.distanceTo(hand);
 const scale=root.getWorldScale(new THREE.Vector3()).y;
 // Lower the pelvis with the folded legs; do not alter the game entity position.
 root.position.y-=(shoulder.y-origin.y-.80*reachLength)/(root.parent?.getWorldScale(new THREE.Vector3()).y??1);
 root.updateWorldMatrix(true,true);
 const floor=origin.y, local=(x,y,z)=>root.localToWorld(new THREE.Vector3(x,y,z));
 const right=world(model.bones.get('RightArm')),left=world(model.bones.get('LeftArm'));
 const target=right.clone().add(new THREE.Vector3(.14*scale,0,.12*scale));target.y=floor+.06*scale;
 reach(model,['RightArm','RightForeArm','RightHand'],target,right.clone().add(new THREE.Vector3(.4*scale,0,.3*scale)));
 const leftTarget=local(-.25,0,-.4);leftTarget.y=floor+.38*scale;
 reach(model,['LeftArm','LeftForeArm','LeftHand'],leftTarget,left.clone().add(new THREE.Vector3(-.4*scale,0,-.1*scale)));
 for(const [side,x,z]of [['Left',-.24,-.92],['Right',.26,-.55]]){
  const foot=local(x,0,z);foot.y=floor+.10*scale;
  const knee=local(x*1.5,0,-.35);knee.y=floor+.55*scale;
  reach(model,[side+'Leg',side+'LowerLeg',side+'Foot'],foot,knee);
 }
 return {available:true,id:'supported-rescue/v1',source:'viewer-authored',supportHand:'right',floorY:floor};
}

/** Relax the original articulated tail along the rest surface, retaining lengths. */
export function relaxRestTail(model,root,surfaceY){
 const names=['Tail','Tail2','Tail3','Tail4','Tail5','Tail6','Tail7'];
 if(!names.every(n=>model.bones.has(n)))return {available:false,reason:'articulated_tail_unavailable'};
 const bones=names.map(n=>model.bones.get(n));
 if(bones.slice(1).some((b,i)=>b.parent!==bones[i]))return {available:false,reason:'tail_hierarchy_unavailable'};
 root.updateWorldMatrix(true,true);
 const start=world(bones[0]),scale=root.getWorldScale(new THREE.Vector3()).y;
 const plane=Number.isFinite(surfaceY)?surfaceY+.10*scale:start.y-.3*scale;
 // The authored curl determines the horizontal direction; a nearly vertical
 // segment continues the preceding direction rather than standing on end.
 let heading=new THREE.Vector3(-1,0,0).transformDirection(root.matrixWorld);
 heading.y=0;heading.normalize();
 const positions=bones.map(world);
 for(let i=0;i<bones.length-1;i++){
  const p=world(bones[i]),delta=positions[i+1].clone().sub(positions[i]),length=delta.length();
  delta.y=0;if(delta.length()>.04*scale)heading.copy(delta.normalize());
  const dy=Math.max(-length*.55,Math.min(length*.25,plane-p.y));
  const target=p.clone().addScaledVector(heading,Math.sqrt(Math.max(0,length*length-dy*dy)));target.y=p.y+dy;
  turnToward(bones[i],bones[i+1],target);
 }
 return {available:true,id:'relaxed-rest-tail/v1',source:'viewer-authored',surfaceY:plane};
}
