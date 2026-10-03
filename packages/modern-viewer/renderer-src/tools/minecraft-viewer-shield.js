/** A shield model for the renderer's offhand camera and the world avatar. */
function cortiShieldModel() {
  const three = globalThis.THREE;
  const root = new three.Group();
  root.name = 'corti-shield';
  const part = (width, height, depth, color, x, y, z, metalness = 0) => {
    const mesh = new three.Mesh(new three.BoxGeometry(width, height, depth),
      new three.MeshStandardMaterial({ color, metalness, roughness: metalness ? .52 : .84 }));
    mesh.position.set(x, y, z);
    root.add(mesh);
  };
  part(.78, 1.02, .105, 0x755634, 0, 0, 0);
  part(.84, 1.08, .055, 0x96918a, 0, 0, .034, .42);
  part(.69, .92, .025, 0x8e6a43, 0, 0, .072);
  part(.19, .28, .045, 0xb1aba1, 0, 0, .107, .56);
  part(.13, .51, .12, 0x5a3b25, 0, 0, -.09);
  return root;
}

function cortiShieldPose(raised) {
  return raised
    ? { x: .08, y: .14, z: .05, yaw: -.22, pitch: -.08, scale: .64 }
    : { x: .26, y: -.23, z: -.20, yaw: -.70, pitch: .10, scale: .49 };
}

function cortiApplyFirstPersonShield(offhand, raised, now = performance.now()) {
  const model = offhand.holdingBlock;
  if (model?.name !== 'corti-shield') return;
  const state = offhand.cortiShieldMotion ??= { blend: raised ? 1 : 0, at: now };
  const elapsed = Math.max(0, Math.min(100, now - state.at));
  state.at = now;
  state.blend += ((raised ? 1 : 0) - state.blend) * (1 - Math.exp(-elapsed / 90));
  const idle = cortiShieldPose(false);
  const guard = cortiShieldPose(true);
  const lerp = (key) => idle[key] + (guard[key] - idle[key]) * state.blend;
  model.position.set(lerp('x'), lerp('y'), lerp('z'));
  model.rotation.set(lerp('pitch'), lerp('yaw'), -.11);
  model.scale.setScalar(lerp('scale'));
}

function cortiInitializeShield() {
  const offhand = globalThis.world?.holdingBlockLeft;
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
    const raised = typeof pendingAvatarState !== 'undefined' && pendingAvatarState?.shieldRaised === true;
    cortiApplyFirstPersonShield(this, raised);
  };
  offhand.cortiShieldInstalled = true;
  offhand.lastHeldItemRenderKey = undefined;
  offhand.updateItem?.();
}

function cortiSyncAvatarShield(entity, item) {
  if (entity?.id === undefined) return;
  const rendered = globalThis.world?.entities?.entities?.[String(entity.id)];
  const arm = rendered?.playerObject?.skin?.leftArm;
  if (!arm) return;
  const shield = String(item?.name || '').replace(/^minecraft:/, '') === 'shield';
  const existing = arm.getObjectByName('corti-shield');
  const native = rendered.getObjectByName?.('custom_item_left');
  if (native) native.visible = !shield;
  if (!shield) {
    if (existing) arm.remove(existing);
    return;
  }
  if (existing) {
    existing.traverse?.((part) => { if (part.isMesh) part.visible = true; });
    cortiPoseAvatarShield(existing, entity);
    return;
  }
  const model = cortiShieldModel();
  model.scale.setScalar(8.2);
  cortiPoseAvatarShield(model, entity);
  arm.add(model);
}

function cortiPoseAvatarShield(model, entity) {
  const raised = entity?.isSelf === true && typeof pendingAvatarState !== 'undefined' &&
    pendingAvatarState?.shieldRaised === true;
  model.position.set(raised ? -1.2 : .7, raised ? -4.8 : -7, raised ? 5.2 : 2.5);
  model.rotation.set(raised ? -.22 : -.10, raised ? .35 : -.70, -.12);
}
