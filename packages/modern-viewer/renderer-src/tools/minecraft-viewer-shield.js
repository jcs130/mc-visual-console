import {observedHandUse} from './observed-hand-use.js';
import {PAPER_SHIELD_PARTS} from './paper-ysm-items.js';
import {createNativeModelPart} from '../native-viewer/native-entity-model.js';
let cortiShieldTexture = null;
/** Original shield geometry/UVs for both first-person hands and vanilla avatars. */
function cortiShieldModel() {
  const three = globalThis.THREE;
  const root = new three.Group();
  root.name = 'corti-shield';
  if(!cortiShieldTexture){
    cortiShieldTexture=new three.TextureLoader().load('/textures/'+cortiContentMinecraftVersion+'/entity/shield_base_nopattern.png');
    cortiShieldTexture.colorSpace=three.SRGBColorSpace;cortiShieldTexture.magFilter=three.NearestFilter;
    cortiShieldTexture.minFilter=three.NearestFilter;cortiShieldTexture.generateMipmaps=false;
  }
  const material=new three.MeshLambertMaterial({map:cortiShieldTexture,alphaTest:.1,side:three.DoubleSide});
  const original=createNativeModelPart(PAPER_SHIELD_PARTS,material,[64,64]);root.add(original.root);
  root.userData.dispose=()=>{root.removeFromParent();original.dispose();material.dispose();};
  return root;
}

function cortiShieldPose(raised) {
  return raised
    ? { x: .08, y: .14, z: .05, yaw: -.22, pitch: -.08, scale: .64 }
    : { x: .26, y: -.23, z: -.20, yaw: -.70, pitch: .10, scale: .49 };
}

function cortiApplyFirstPersonShield(offhand, raised, now = performance.now(), hand='left') {
  const model = offhand.holdingBlock;
  if (model?.name !== 'corti-shield') return;
  const state = offhand.cortiShieldMotion ??= { blend: raised ? 1 : 0, at: now };
  const elapsed = Math.max(0, Math.min(100, now - state.at));
  state.at = now;
  state.blend += ((raised ? 1 : 0) - state.blend) * (1 - Math.exp(-elapsed / 90));
  const idle = cortiShieldPose(false);
  const guard = cortiShieldPose(true);
  const lerp = (key) => idle[key] + (guard[key] - idle[key]) * state.blend;
  const sign=hand==='left'?1:-1;
  model.position.set(sign*lerp('x'), lerp('y'), lerp('z'));
  model.rotation.set(lerp('pitch'), sign*lerp('yaw'), sign*-.11);
  model.scale.setScalar(lerp('scale'));
}

function cortiInstallShieldHand(offhand, hand) {
  if (!offhand || offhand.cortiShieldInstalled) return;
  const createItemModel = offhand.createItemModel;
  if (typeof createItemModel !== 'function') return;
  offhand.createItemModel = async function (item) {
    if (String(item?.name || '').replace(/^minecraft:/, '') !== 'shield') {
      return createItemModel.call(this, item);
    }
    const model = cortiShieldModel();
    const idle = cortiShieldPose(false);
    model.position.set(idle.x, idle.y, idle.z);
    model.rotation.set(idle.pitch, idle.yaw, -.11);
    model.scale.setScalar(idle.scale);
    return { model, type: 'item' };
  };
  const updateCameraGroup = offhand.updateCameraGroup;
  if (typeof updateCameraGroup === 'function') offhand.updateCameraGroup = function (...args) {
    updateCameraGroup.apply(this, args);
    const use=observedHandUse(pendingAvatarState?.entity,pendingAvatarState);
    const raised=use.shieldRaised&&use.shieldHand===(hand===use.mainArm?'mainhand':'offhand');
    cortiApplyFirstPersonShield(this, raised, performance.now(), hand);
  };
  offhand.cortiShieldInstalled = true;
  offhand.lastHeldItemRenderKey = undefined;
  offhand.updateItem?.();
}
function cortiInitializeShield() {
  cortiInstallShieldHand(globalThis.world?.holdingBlockLeft,'left');
  cortiInstallShieldHand(globalThis.world?.holdingBlock,'right');
}

function cortiSyncAvatarShield(entity) {
  if (entity?.id === undefined) return;
  const rendered = globalThis.world?.entities?.entities?.[String(entity.id)];
  const own=entity.isSelf===true||entity.id===pendingAvatarState?.entity?.id;
  const use=observedHandUse(entity,own?pendingAvatarState:null);
  for(const [index,side]of [use.mainArm,use.mainArm==='left'?'right':'left'].entries()){
  const arm = rendered?.playerObject?.skin?.[side+'Arm'];
  if (!arm) return;
  const shield = String(use.equipment?.[index]?.name || '').replace(/^minecraft:/, '') === 'shield';
  const existing = arm.getObjectByName('corti-shield');
  if(rendered.getObjectByName?.('paper-ysm-player')?.visible){existing?.userData.dispose?.();continue;}
  const native = rendered.getObjectByName?.('custom_item_'+side);
  if (native) native.visible = !shield;
  if (!shield) {
    existing?.userData.dispose?.();
    continue;
  }
  if (existing) {
    existing.traverse?.((part) => { if (part.isMesh) part.visible = true; });
    cortiPoseAvatarShield(existing, entity, side, use);
    continue;
  }
  const model = cortiShieldModel();
  model.scale.setScalar(8.2);
  cortiPoseAvatarShield(model, entity, side, use);
  arm.add(model);
  }
}

function cortiPoseAvatarShield(model, entity, side='left', use=observedHandUse(entity)) {
  const raised=use.shieldRaised&&use.shieldHand===(side===use.mainArm?'mainhand':'offhand');
  const sign=side==='left'?1:-1;
  model.position.set(sign*(raised ? -1.2 : .7), raised ? -4.8 : -7, raised ? 5.2 : 2.5);
  model.rotation.set(raised ? -.22 : -.10, sign*(raised ? .35 : -.70), sign*-.12);
  model.userData.raised=raised;
}
