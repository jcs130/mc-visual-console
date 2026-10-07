const HEAD_MODEL = 'head:{bones:[{name:"armor",pivot:[0,12,0]},{name:"head",parent:"armor",pivot:[0,12,0],cubes:[{origin:[-4,23,-4],size:[8,8,8],uv:[0,0],inflate:1}]},{name:"overlay",parent:"head",pivot:[0,12,0],cubes:[{origin:[-4,23,-4],size:[8,8,8],uv:[32,0],inflate:1.2}]}]';
const FIXED_HEAD_MODEL = 'head:{bones:[{name:"armor",pivot:[0,12,0]},{name:"head",parent:"armor",pivot:[0,24,0],cubes:[{origin:[-4,24,-4],size:[8,8,8],uv:[0,0],inflate:1}]},{name:"overlay",parent:"head",pivot:[0,24,0],cubes:[{origin:[-4,24,-4],size:[8,8,8],uv:[32,0],inflate:1.2}]}]';
const ARMOR_PIVOTS = [
  ['body",parent:"armor",pivot:[0,13,0]', 'body",parent:"armor",pivot:[0,18,0]'],
  ['leftarm",parent:"armor",pivot:[5,10,0]', 'leftarm",parent:"armor",pivot:[5,22,0]'],
  ['rightarm",parent:"armor",pivot:[-5,10,0]', 'rightarm",parent:"armor",pivot:[-5,22,0]'],
  ['leftleg",parent:"armor",pivot:[1.9,1,0]', 'leftleg",parent:"armor",pivot:[1.9,12,-.1]'],
  ['rightleg",parent:"armor",pivot:[-1.9,1,0]', 'rightleg",parent:"armor",pivot:[-1.9,12,-.1]'],
];
const HEAD_SYNC = 'case"geometry_armor_head":t.children[0]?.children[0]&&t.children[0].children[0].rotation.set(-r.head.rotation.x,r.head.rotation.y,r.head.rotation.z,r.head.rotation.order);break;';
const FIXED_HEAD_SYNC = 'case"geometry_armor_head":case"geometry_armor_head_overlay":{let h=t.children[0]?.children[0];if(h){h.position.set(r.head.position.x,12+r.head.position.y,r.head.position.z);h.rotation.set(-r.head.rotation.x,r.head.rotation.y,r.head.rotation.z,r.head.rotation.order)}break}';
const CHEST_SYNC = 'case"geometry_armor_chest":case"geometry_armor_chest_overlay":{let a=t.children[0];if(a)for(let [name,part] of [["body",r.body],["leftarm",r.leftArm],["rightarm",r.rightArm]]){let bone=a.getObjectByName("bone_"+name);if(bone&&part){bone.position.set(part.position.x,12+part.position.y,part.position.z);bone.rotation.copy(part.rotation)}}break}';
const LEG_SYNC = 'case"geometry_armor_legs":t.children[0]&&(t.children[0].children[2]&&t.children[0].children[2].rotation.set(-r.leftLeg.rotation.x,r.leftLeg.rotation.y,r.leftLeg.rotation.z,r.leftLeg.rotation.order),t.children[0].children[1]&&t.children[0].children[1].rotation.set(-r.rightLeg.rotation.x,r.rightLeg.rotation.y,r.rightLeg.rotation.z,r.rightLeg.rotation.order));break;';
// The armor root faces 180 degrees away from skinview3d's mesh root. Its
// left-leg bone sits over the skin's right leg (and vice versa), so convert
// both the source limb and its local X/Z axes instead of copying the pose.
const FIXED_LEG_SYNC = 'case"geometry_armor_legs":case"geometry_armor_legs_overlay":{let a=t.children[0];if(a)for(let [name,part] of [["leftleg",r.rightLeg],["rightleg",r.leftLeg]]){let bone=a.getObjectByName("bone_"+name);if(bone&&part){bone.position.set(-part.position.x,12+part.position.y,-part.position.z);bone.rotation.set(-part.rotation.x,part.rotation.y,-part.rotation.z,part.rotation.order)}}break}';
const FOOT_SYNC = 'case"geometry_armor_feet":t.children[0]&&(t.children[0].children[0]&&t.children[0].children[0].rotation.set(-r.rightLeg.rotation.x,r.rightLeg.rotation.y,r.rightLeg.rotation.z,r.rightLeg.rotation.order),t.children[0].children[1]&&t.children[0].children[1].rotation.set(-r.leftLeg.rotation.x,r.leftLeg.rotation.y,-r.leftLeg.rotation.z,r.leftLeg.rotation.order));break';
const FIXED_FOOT_SYNC = 'case"geometry_armor_feet":case"geometry_armor_feet_overlay":{let a=t.children[0];if(a)for(let [name,part] of [["leftleg",r.rightLeg],["rightleg",r.leftLeg]]){let bone=a.getObjectByName("bone_"+name);if(bone&&part){bone.position.set(-part.position.x,12+part.position.y,-part.position.z);bone.rotation.set(-part.rotation.x,part.rotation.y,-part.rotation.z,part.rotation.order)}}break}';
const ARMOR_ROOT_SYNC = 'syncArmorPositions(e){e.playerObject&&e.traverse(';
// skinview3d rotates the PlayerObject around its centre (one block above the
// feet). The armor meshes have their origin at the feet, so compensate their
// translation while copying the pitch in the armor's opposite-facing frame.
const FIXED_ARMOR_ROOT_SYNC = 'syncArmorPositions(e){if(e.playerObject)for(let armor of e.children)if(armor.name.startsWith("geometry_armor_")){let pitch=-e.playerObject.rotation.x;armor.rotation.x=pitch;armor.position.y=1-Math.cos(pitch);armor.position.z=-Math.sin(pitch)}e.playerObject&&e.traverse(';

/** @param {string} source @param {string} before @param {string} after @param {string} label */
function replaceOnce(source, before, after, label) {
  if (source.split(before).length !== 2) throw Error(`${label} 源码锚点已变化`);
  return source.replace(before, after);
}

/** @param {string} source */
export function patchRendererAvatar(source) {
  let corrected = replaceOnce(source, HEAD_MODEL, FIXED_HEAD_MODEL, '头盔模型');
  for (const [before, after] of ARMOR_PIVOTS) {
    const count = corrected.split(before).length - 1;
    if (count !== ((before.startsWith('leftarm') || before.startsWith('rightarm')) ? 1 : 2))
      throw Error(`盔甲关节源码锚点已变化: ${before}`);
    corrected = corrected.replaceAll(before, after);
  }
  corrected = replaceOnce(corrected, HEAD_SYNC, CHEST_SYNC + FIXED_HEAD_SYNC, '头盔及胸甲随动');
  corrected = replaceOnce(corrected, LEG_SYNC, FIXED_LEG_SYNC, '护腿随动');
  corrected = replaceOnce(corrected, FOOT_SYNC, FIXED_FOOT_SYNC, '靴子随动');
  return replaceOnce(corrected, ARMOR_ROOT_SYNC, FIXED_ARMOR_ROOT_SYNC, '游泳盔甲俯仰');
}

/** @param {string} source @param {string} swordOverlay */
export function patchAvatarMotion(source, swordOverlay) {
  source = source.replace(/\r\n/g, '\n');
  swordOverlay = swordOverlay.replace(/\r\n/g, '\n');
  if (!swordOverlay.includes('function applySwingOverlay(')) throw Error('第三人称挥砍动作缺失');
  const start = source.indexOf('function applySwingOverlay(');
  const end = source.indexOf('function applyUseOverlay(', start);
  if (start < 0 || end < 0 || source.indexOf('function applySwingOverlay(', start + 1) >= 0)
    throw Error('角色挥击源码锚点已变化');
  let corrected = source.slice(0, start) + swordOverlay.trim() + '\n\n' + source.slice(end);
  corrected = replaceOnce(corrected, '      kind,\n      hand: source.hand === "left" ? "left" : "right",',
    '      kind,\n      hand: source.hand === "left" ? "left" : "right",\n      style: source.style === "sword" ? "sword" : null,\n      variant: this.actionsTriggered % 2 ? -1 : 1,', '挥击动作参数');
  corrected = replaceOnce(corrected,
    'if (upper.kind === "swing") applySwingOverlay(pose, progress, upper.hand);',
    'if (upper.kind === "swing") applySwingOverlay(pose, progress, upper.hand, upper.style, upper.variant);',
    '挥击动作调用');
  corrected = replaceOnce(corrected,
    '    if (frame.inWater || frame.inLava) return "swim";',
    '    if (frame.inWater && !frame.onGround && frame.sprinting && frame.horizontalSpeed >= this.options.walkEnterSpeed) return "swim";\n    if (frame.inWater || frame.inLava) return frame.onGround ? this.classifyGroundLocomotion(frame) : "idle";',
    '游泳与涉水判定');
  corrected = replaceOnce(corrected,
    '    addRotation(pose, "root", -1.32, 0, 0, weight);',
    '    addRotation(pose, "root", 1.32, 0, 0, weight);',
    '游泳朝向');
  return corrected;
}
