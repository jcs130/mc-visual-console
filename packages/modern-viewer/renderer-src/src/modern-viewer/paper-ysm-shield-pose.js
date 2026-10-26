import {Quaternion} from 'three';
/** Viewer presentation for the standard articulated YSM rig, used only when
 * the model has no authored shield-use clip. Original assets remain intact. */
export function applyPaperShieldPose(model,hand,mainArm='right',pitch=0) {
 const side=(hand==='offhand')!==(mainArm==='left')?'Left':'Right',sign=side==='Left'?1:-1;
 const names=[side+'Arm',side+'ForeArm',side+'Hand'];
 if(!names.every(n=>model.bones.has(n)&&model.initial.has(n)))return {available:false,reason:'articulated_shield_rig_unavailable'};
 const below=(name,parent)=>{let b=model.bones.get(name);while(b=b.parent)if(b===model.bones.get(parent))return true;return false;};
 if(!below(names[1],names[0])||!below(names[2],names[1]))return {available:false,reason:'articulated_shield_hierarchy_unavailable'};
 const rotations=[[-30+Math.max(-20,Math.min(20,pitch)),sign*25,sign*12],[-50,sign*-25,0],[0,0,0]];
 for(const [i,name]of names.entries()){
  const b=model.bones.get(name),r=model.initial.get(name).rotation,v=rotations[i];b.rotation.set(r.x+v[0]*Math.PI/180,r.y+v[1]*Math.PI/180,r.z+v[2]*Math.PI/180,'ZYX');
 }
 // Align the original shield through its actual locator transform, rather
 // than guessing a wrist roll for a particular character. Keep its grip at
 // the hand and face its plate forward in the model's X-right/Y-down basis.
 const wrist=model.bones.get(names[2]),locator=model.bones.get(side+'HandLocator');
 const shield=locator?.children.find(c=>c.userData.item==='shield');
 if(shield&&model.root){
  model.root.updateWorldMatrix(true,true);
  const handWorld=wrist.getWorldQuaternion(new Quaternion());
  const relative=handWorld.clone().invert().multiply(shield.getWorldQuaternion(new Quaternion()));
  const desired=model.root.getWorldQuaternion(new Quaternion());
  wrist.quaternion.copy(wrist.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desired).multiply(relative.invert()));
 }
 return {available:true,source:'viewer_articulated_shield_pose',hand,alignment:shield?'original_item_locator':'awaiting_item'};
}
