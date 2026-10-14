import * as THREE from 'three'
import { nativePlayerSin, nativePlayerCos, toSkinviewLimbRotation } from './native-player-motion.js'

// Locked 1.21.1 client gev=ItemInHandRenderer, renderPlayerArm (279–312),
// applyItemArmAttackTransform (368–377), applyItemArmTransform (380–382).
// Client JAR SHA256 499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99.
// Equip is the known equipped endpoint. Equip transitions/camera bob/use families
// have separate inputs and are not claimed as complete vanilla animation parity.
const F = Math.fround, PI = F(Math.PI), mul = (a,b) => F(F(a)*F(b)), add = (a,b) => F(F(a)+F(b))
const rot = (matrix, axis, degrees) => matrix.multiply(new THREE.Matrix4()[`makeRotation${axis}`](mul(degrees, F(Math.PI / 180))))
export function nativeHandAnimation(self, arm, now = Date.now()) {
  const value = self?.handAnimation
  if (value?.source !== 'same_player_vanilla_hand_packets' || value.playerUuid !== self.uuid || value.entityId !== self.entityId ||
      !Number.isFinite(value.sampledAt) || now - value.sampledAt > 1500 || now < value.sampledAt - 100 ||
      !['left', 'right'].includes(value.mainArm) || !['left','right'].includes(arm)) return null
  if (value.usingItem !== false || value.spinAttack !== false) return null
  const swing = value.swing
  if (swing && (!Number.isFinite(swing.startedAt) || swing.startedAt > value.sampledAt || !Number.isInteger(swing.durationTicks) || swing.durationTicks < 1 || swing.durationTicks > 100)) return null
  const swingingArm = swing?.hand === 'offhand' ? (value.mainArm === 'right' ? 'left' : 'right') : value.mainArm
  return { progress: swing && arm === swingingArm ? F(Math.max(0, Math.min(1, (now - swing.startedAt) / (swing.durationTicks * 50)))) : 0,
    source: value.source, sequence: swing?.sequence ?? 0 }
}

export function nativeFirstPersonSwingMatrix(progress, arm = 'right') {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1 || !['left','right'].includes(arm)) throw Error('NATIVE_FIRST_PERSON_SWING_INVALID')
  const side = arm === 'right' ? 1 : -1, p = F(progress), root = F(Math.sqrt(p))
  const a = nativePlayerSin(mul(root, PI)), b = nativePlayerSin(mul(root, mul(2, PI))), c = nativePlayerSin(mul(p, PI))
  const matrix = new THREE.Matrix4().makeTranslation(mul(side, mul(-.4, a)), mul(.2, b), mul(-.2, c))
  matrix.multiply(new THREE.Matrix4().makeTranslation(mul(side, .56), F(-.52), F(-.72)))
  rot(matrix, 'Y', mul(side, add(45, mul(-20, nativePlayerSin(mul(mul(p,p), PI))))))
  rot(matrix, 'Z', mul(mul(side, a), -20)); rot(matrix, 'X', mul(a, -80)); rot(matrix, 'Y', mul(side, -45))
  return matrix
}

export function nativeHandUse(self,arm,item,now=Date.now()) {
  const state=self?.handAnimation,use=state?.use
  if(state?.source!=='same_player_vanilla_hand_packets' || state.playerUuid!==self.uuid || state.entityId!==self.entityId || state.usingItem!==true || state.spinAttack!==false ||
    !Number.isFinite(state.sampledAt) || now-state.sampledAt>1500 || now<state.sampledAt-100 || !['left','right'].includes(state.mainArm) || !use ||
    use.source!=='observed_use_packet_vanilla_duration' || !['eat','drink'].includes(use.kind) || !['mainhand','offhand'].includes(use.hand) ||
    ![16,32,40].includes(use.durationTicks) || !Number.isFinite(use.startedAt) || use.startedAt>state.sampledAt || now<use.startedAt || now-use.startedAt>=use.durationTicks*50) return null
  const active=use.hand==='offhand'?(state.mainArm==='left'?'right':'left'):state.mainArm
  if(arm!==active || item?.name!==use.name)return null
  return {kind:use.kind,remainingTicks:F(use.durationTicks-F((now-use.startedAt)/50)+1),durationTicks:use.durationTicks}
}

// ItemInHandRenderer.applyEatTransform (315–331), followed by original
// applyItemArmTransform. Float32 and Mth cosine LUT order are retained.
export function nativeFirstPersonConsumeMatrix(remainingTicks,durationTicks,arm='right') {
  if(!Number.isFinite(remainingTicks)||remainingTicks<0||!Number.isInteger(durationTicks)||durationTicks<=0||!['left','right'].includes(arm))throw Error('NATIVE_CONSUME_ANIMATION_INVALID')
  const side=arm==='right'?1:-1,remaining=F(remainingTicks),ratio=F(remaining/F(durationTicks)),matrix=new THREE.Matrix4()
  if(ratio<F(.8)) matrix.multiply(new THREE.Matrix4().makeTranslation(0,Math.abs(mul(nativePlayerCos(mul(F(remaining/F(4)),PI)),.1)),0))
  const amount=F(1-F(Math.pow(ratio,27)))
  matrix.multiply(new THREE.Matrix4().makeTranslation(mul(mul(amount,.6),side),mul(amount,-.5),0))
  rot(matrix,'Y',mul(mul(side,amount),90));rot(matrix,'X',mul(amount,10));rot(matrix,'Z',mul(mul(side,amount),30))
  return matrix.multiply(new THREE.Matrix4().makeTranslation(mul(side,.56),F(-.52),F(-.72)))
}

export function nativeFirstPersonEmptyArmMatrix(progress, arm = 'right') {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1 || !['left','right'].includes(arm)) throw Error('NATIVE_FIRST_PERSON_SWING_INVALID')
  const side = arm === 'right' ? 1 : -1, p = F(progress), root = F(Math.sqrt(p)), a = nativePlayerSin(mul(root, PI))
  const matrix = new THREE.Matrix4().makeTranslation(mul(side, add(.64000005, mul(-.3,a))),
    add(-.6, mul(.4,nativePlayerSin(mul(root,mul(2,PI))))), add(-.71999997,mul(-.4,nativePlayerSin(mul(p,PI)))))
  rot(matrix,'Y',mul(side,45)); rot(matrix,'Y',mul(mul(side,a),70)); rot(matrix,'Z',mul(mul(side,nativePlayerSin(mul(mul(p,p),PI))),-20))
  matrix.multiply(new THREE.Matrix4().makeTranslation(-side, F(3.6), F(3.5)))
  rot(matrix,'Z',mul(side,120)); rot(matrix,'X',200); rot(matrix,'Y',mul(side,-135))
  matrix.multiply(new THREE.Matrix4().makeTranslation(mul(side,5.6),0,0))
  // Convert original skinview arm pixels back to Java ModelPart coordinates.
  return matrix.multiply(new THREE.Matrix4().makeScale(1/16,-1/16,-1/16))
}

// Same locked client fvx=HumanoidModel.setupAttackAnimation (406–435).
export function nativeThirdPersonSwingPose(rotations, progress, arm, headPitch) {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1 || !['left','right'].includes(arm) || !Number.isFinite(headPitch)) throw Error('NATIVE_HUMANOID_SWING_INVALID')
  const limbs = Object.fromEntries(Object.entries(rotations).map(([key,value]) => [key,{x:value.x,y:-value.y,z:-value.z}]))
  const p=F(progress), yaw=mul(mul(nativePlayerSin(mul(F(Math.sqrt(p)),mul(2,PI))),.2),arm==='left'?-1:1)
  const positions={right:{x:mul(-5,nativePlayerCos(yaw)),z:mul(-5,nativePlayerSin(yaw))},
    left:{x:mul(5,nativePlayerCos(yaw)),z:mul(5,nativePlayerSin(yaw))}}
  if(p>0) {
    limbs.rightArm.y=add(limbs.rightArm.y,yaw);limbs.leftArm.y=add(limbs.leftArm.y,yaw);limbs.leftArm.x=add(limbs.leftArm.x,yaw)
    let eased=F(1-p);eased=mul(eased,eased);eased=mul(eased,eased);eased=F(1-eased)
    const target=limbs[`${arm}Arm`], head=mul(mul(nativePlayerSin(mul(p,PI)),F(-(F(headPitch)-F(.7)))),.75)
    target.x=F(target.x-add(mul(nativePlayerSin(mul(eased,PI)),1.2),head));target.y=add(target.y,mul(yaw,2))
    target.z=add(target.z,mul(nativePlayerSin(mul(p,PI)),-.4))
  }
  return {bodyYaw:-yaw,positions,rotations:Object.fromEntries(Object.entries(limbs).map(([key,value])=>[key,toSkinviewLimbRotation(value)]))}
}
