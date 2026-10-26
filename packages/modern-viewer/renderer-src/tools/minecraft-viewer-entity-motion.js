/** Read-only projectile and hostile-mob motion layered over the 1.20.6 scene. */
import { createObservedArrowVisual, isObservedArrow, observedArrowDirection, preloadObservedArrowTextures, refreshObservedArrowVisual } from './observed-arrows.js';
import {ObservedProjectileLayer,isObservedProjectile,preloadObservedProjectileTextures} from './observed-projectiles.js';
let cortiObservedProjectiles=null;
const cortiProjectileModels = new Map();
let cortiArrowTexturesRequested = false;
const cortiMobActions = new Map();
const cortiHostiles = new Set(['zombie', 'husk', 'drowned', 'skeleton', 'stray', 'bogged',
  'spider', 'cave_spider', 'creeper', 'witch', 'pillager', 'vindicator', 'evoker', 'ravager',
  'enderman', 'silverfish', 'slime', 'magma_cube', 'blaze', 'ghast', 'phantom',
  'guardian', 'elder_guardian', 'wither_skeleton', 'piglin_brute', 'zombified_piglin',
  'zombie_villager', 'breeze', 'shulker', 'warden', 'hoglin', 'zoglin', 'piglin',
  'vex', 'endermite']);
const cortiProjectileNames = new Set(['arrow','spectral_arrow','tipped_arrow']);
const cortiArcherWeapons = { skeleton: 'bow', stray: 'bow', bogged: 'bow', pillager: 'crossbow' };
const cortiRangedMobNames = new Set([...Object.keys(cortiArcherWeapons), 'piglin']);
const cortiBabyBipeds = new Set(['zombie', 'husk', 'drowned', 'zombie_villager', 'zombified_piglin', 'piglin']);
const cortiBowTextures = new Map();
let cortiOwnEquipmentSignature = null;

function cortiOwnEquipmentChanged(entity) {
  const signature = JSON.stringify(entity?.equipment ?? []);
  if (signature === cortiOwnEquipmentSignature) return false;
  cortiOwnEquipmentSignature = signature;
  return true;
}

function cortiProjectileModel(name,entity) {
 return isObservedArrow(name)?createObservedArrowVisual(name,entity,{version:cortiContentMinecraftVersion}):null;
}
function cortiSyncObservedProjectiles() {
 if(!globalThis.world?.scene)return;
 cortiObservedProjectiles??=new ObservedProjectileLayer({scene:()=>globalThis.world.scene,origin:()=>globalThis.world.sceneOrigin,
  models:paperYsmItemModels.models.latest,version:cortiContentMinecraftVersion,registry:()=>globalThis.mcData});
 for(const id of cortiObservedProjectiles.records.keys())if(!isObservedProjectile(entityCache.get(id)?.name))cortiObservedProjectiles.remove(id);
 for(const entity of entityCache.values())if(isObservedProjectile(entity.name))cortiObservedProjectiles.update(entity);
 cortiObservedProjectiles.tick(globalThis.world.camera);
}
socket.on('viewerReset',()=>cortiObservedProjectiles?.clear());
socket.on('disconnect',()=>cortiObservedProjectiles?.clear());
socket.on('entityAnimation', event => {
  if (event?.id != null && event.animation === 'oneSwing') {
    const id = String(event.id);
    const current = cortiMobActions.get(id);
    cortiMobActions.set(id, { kind: 'attack', at: performance.now(),
      rangedReleaseAt: current?.rangedReleaseAt });
  }
});
socket.on('entityDamage', event => {
  if (event?.id != null) {
    const id = String(event.id);
    const current = cortiMobActions.get(id);
    cortiMobActions.set(id, { kind: 'hurt', at: performance.now(),
      rangedReleaseAt: current?.rangedReleaseAt });
  }
});
socket.on('entityGone', id => {
  cortiMobActions.delete(String(id?.id ?? id));
  cortiProjectileModels.delete(String(id?.id ?? id));
});

function cortiMobMetadata(entity, index) {
  const metadata = entity?.metadata;
  return Array.isArray(metadata) ? metadata[index] : metadata?.[index];
}

function cortiMobWeapon(entity, name) {
  const equipped = String(entity?.equipment?.[0]?.name || '').replace(/^minecraft:/, '');
  if (equipped) return equipped;
  return cortiArcherWeapons[name] || (name === 'vindicator' ? 'iron_axe' : '');
}

let cortiFireMaterial = null;
let cortiFireGeometry = null;
function cortiSyncEntityFire(scene, entity, now) {
  const burning = entity?.burning === true || (Number(cortiMobMetadata(entity, 0)) & 1) !== 0;
  let fire = scene.userData.cortiFire;
  if (!burning) { if (fire) fire.visible = false; return; }
  const three = globalThis.THREE;
  if (!fire) {
    if (!cortiFireMaterial) {
      const texture = new three.TextureLoader().load('/textures/1.20.6/block/fire_0.png');
      texture.magFilter = three.NearestFilter;
      texture.minFilter = three.NearestFilter;
      texture.repeat.set(1, 1 / 32);
      cortiFireMaterial = new three.MeshBasicMaterial({ map: texture, transparent: true,
        alphaTest: .06, opacity: .68, side: three.DoubleSide, depthWrite: false });
      cortiFireGeometry = new three.PlaneGeometry(1, 1);
    }
    fire = new three.Group();
    fire.name = 'corti-entity-fire';
    for (const angle of [0, Math.PI / 2]) {
      const face = new three.Mesh(cortiFireGeometry, cortiFireMaterial);
      face.rotation.y = angle;
      fire.add(face);
    }
    scene.add(fire);
    scene.userData.cortiFire = fire;
  }
  const height = Math.max(.5, Math.min(3.5, Number(entity.height) || 1.8));
  fire.visible = true;
  fire.position.y = height * .46;
  fire.scale.set(height * (.48 + .035 * Math.sin(now * .02)), height * .85, height * .48);
  fire.rotation.y = now * .0004;
}

function cortiMobGripScale(entity, name) {
  if (!cortiBabyBipeds.has(name)) return 1;
  const baby = cortiMobMetadata(entity, 16);
  if (baby === true || baby === 1) return .5;
  const height = Number(entity?.height);
  return height > 0 && height < 1.4 ? Math.max(.4, Math.min(1, height / 1.95)) : 1;
}

function cortiMobPartName(object) {
  return String(object.name || '').toLowerCase().replace(/^bone_/, '').replace(/[^a-z0-9]/g, '');
}

function cortiMobPartPivot(mesh, key) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return null;
  const center = box.getCenter(new globalThis.THREE.Vector3());
  if (/arm|leg|wing|tentacle/.test(key)) center.y = box.max.y;
  if (/^leg[0-7]$/.test(key)) center.x = key.endsWith('0') || key.endsWith('2') || key.endsWith('4') || key.endsWith('6')
    ? box.max.x : box.min.x;
  return center;
}

function cortiMobRig(model) {
  const parts = new Map();
  const candidates = [];
  model.traverse(object => {
    const key = cortiMobPartName(object);
    if (!/^(?:leftarm|rightarm|arms|leftleg|rightleg|leg[0-7]|leg(?:front|back)(?:left|right)|leftwing|rightwing|wing[01]|wingtip[01]|head|body|body[01]|bodypart[0-9]+|upperbodyparts[0-9]+|tentacles[0-9]+|tailpart[0-9]+|lefttendril|righttendril|lid)$/.test(key)) return;
    if (object.isBone || (object.isMesh && !object.isSkinnedMesh)) candidates.push({ object, key });
  });
  for (const { object, key } of candidates) {
    let part = object;
    if (!object.isBone) {
      const pivot = cortiMobPartPivot(object, key);
      if (!pivot) continue;
      const parent = object.parent;
      const wrapper = new globalThis.THREE.Group();
      wrapper.name = `corti-rig-${key}`;
      wrapper.position.copy(pivot).add(object.position);
      parent.add(wrapper);
      wrapper.add(object);
      object.position.copy(pivot).multiplyScalar(-1);
      part = wrapper;
    }
    const entry = { object: part, basePosition: part.position.clone(), baseX: part.rotation.x,
      baseY: part.rotation.y, baseZ: part.rotation.z };
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key).push(entry);
  }
  return parts;
}

function cortiPoseMobPart(parts, key, x = 0, y = 0, z = 0) {
  for (const part of parts.get(key) || []) {
    part.object.rotation.x = part.baseX + x;
    part.object.rotation.y = part.baseY + y;
    part.object.rotation.z = part.baseZ + z;
  }
}

function cortiBowTexture(name) {
  if (cortiBowTextures.has(name)) return cortiBowTextures.get(name);
  const three = globalThis.THREE;
  const file = name === 'crossbow' ? 'crossbow_standby' : name;
  const texture = new three.TextureLoader().load(`/textures/1.20.6/item/${file}.png`);
  texture.magFilter = three.NearestFilter;
  texture.minFilter = three.NearestFilter;
  texture.colorSpace = three.SRGBColorSpace;
  cortiBowTextures.set(name, texture);
  return texture;
}

// Prismarine mob rigs are commonly authored in 16 model units per block.
// Child item quads use block units, so compensate for the parent's world scale.
function cortiItemUnits(parent) {
  const scale = parent.getWorldScale(new globalThis.THREE.Vector3());
  const value = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
  return Number.isFinite(value) && value > .001 ? 1 / value : 1;
}

// minecraft-renderer mounts a non-player's main-hand item on its left arm at
// the shoulder. Keep its actual 1.20.6 item model, but move the group to the
// wrist of the arm that owns the equipment slot. The model's parent may be
// recreated whenever an equipment packet arrives, so this runs each frame.
function cortiAttachMobNativeItem(model, motion, slot, side, gripScale = 1) {
  const item = model.getObjectByName(slot === 0 ? 'custom_item_left' : 'custom_item_right');
  const arm = motion.parts.get(`${side}arm`)?.[0]?.object;
  if (!item || !arm) return item;
  if (item.parent !== arm) arm.add(item);
  const units = cortiItemUnits(arm);
  item.position.set((side === 'right' ? -.02 : .02) * gripScale * units,
    -.59 * gripScale * units, -.10 * gripScale * units);
  return item;
}

function cortiRangedVisual(model, motion, weapon) {
  const three = globalThis.THREE;
  if (motion.ranged?.weapon === weapon) {
    motion.ranged.group.visible = true;
    return motion.ranged;
  }
  if (motion.ranged) {
    motion.ranged.group.removeFromParent();
    motion.ranged.item.geometry.dispose();
    motion.ranged.arrow.traverse(child => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
    motion.ranged.material.dispose();
  }
  const group = new three.Group();
  group.name = 'corti-mob-ranged-weapon';
  const material = new three.MeshBasicMaterial({ map: cortiBowTexture(weapon), transparent: true,
    alphaTest: .08, side: three.FrontSide, depthWrite: true });
  const item = new three.Mesh(new three.PlaneGeometry(weapon === 'bow' ? .52 : .62,
    weapon === 'bow' ? .68 : .40), material);
  // A DoubleSide plane mirrors the item on its back. Two outward-facing
  // planes keep both the bow and crossbow texture readable from either camera.
  const reverse = new three.Mesh(item.geometry, material);
  item.position.z = .002;
  reverse.position.z = -.002;
  reverse.rotation.y = Math.PI;
  group.add(item);
  group.add(reverse);
  const arrow = cortiProjectileModel('arrow');
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(0, -.04, -.18);
  group.add(arrow);
  const arm = motion.parts.get('rightarm')?.[0]?.object ?? motion.parts.get('leftarm')?.[0]?.object;
  const parent = arm ?? model;
  const units = cortiItemUnits(parent);
  parent.add(group);
  group.scale.setScalar(units);
  group.position.set((arm ? -.02 : -.40) * units, (arm ? -.59 : 1.20) * units,
    (arm ? -.10 : -.34) * units);
  group.rotation.set(.07, Math.PI, -.20);
  motion.ranged = { weapon, group, item, reverse, material, arrow, textureName: weapon,
    armAttached: Boolean(arm), units };
  return motion.ranged;
}

function cortiMeleeVisual(model, motion, weapon, gripScale = 1) {
  if (motion.held?.weapon === weapon && motion.held.gripScale === gripScale) {
    motion.held.group.visible = true;
    return;
  }
  if (motion.held) {
    motion.held.group.removeFromParent();
    motion.held.group.traverse(child => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
  }
  const arm = motion.parts.get('rightarm')?.[0]?.object ?? motion.parts.get('leftarm')?.[0]?.object;
  const parent = arm ?? model;
  const units = cortiItemUnits(parent);
  const three = globalThis.THREE;
  const group = new three.Group();
  group.name = 'corti-mob-held-weapon';
  const material = weapon === 'trident' ? null : new three.MeshBasicMaterial({ map: cortiBowTexture(weapon),
    transparent: true, alphaTest: .08, side: three.DoubleSide, depthWrite: true });
  const item = weapon === 'trident' ? cortiProjectileModel('trident')
    : new three.Mesh(new three.PlaneGeometry(.52, .72), material);
  if (!item) return;
  if (weapon === 'trident') item.name = 'corti-held-trident';
  group.add(item);
  group.scale.setScalar(units * gripScale);
  group.position.set((arm ? 0 : -.40) * gripScale * units,
    (arm ? -.62 : 1.20) * gripScale * units, (arm ? -.11 : -.34) * gripScale * units);
  group.rotation.set(-.08, weapon === 'trident' ? -.35 : Math.PI, -.34);
  parent.add(group);
  motion.held = { weapon, gripScale, group, item, material };
}

function cortiMobProjectileLaunch(projectile, now) {
  const pos = projectile.pos || projectile.position;
  if (!pos) return;
  const sceneEntities = globalThis.world?.entities?.entities;
  const isPotion = String(projectile.name || '').replace(/^minecraft:/, '') === 'potion';
  const isFireball = ['small_fireball', 'fireball'].includes(
    String(projectile.name || '').replace(/^minecraft:/, ''));
  let nearest = null;
  let nearestDistance = 2.4;
  for (const [id, entity] of entityCache) {
    const name = String(entity.name || '').replace(/^minecraft:/, '');
    if (isFireball ? !['blaze', 'ghast'].includes(name) : isPotion ? name !== 'witch' :
        !cortiRangedMobNames.has(name) ||
        !['bow', 'crossbow'].includes(cortiMobWeapon(entity, name))) continue;
    const spot = entity.pos || entity.position;
    if (!spot) continue;
    const distance = Math.hypot(pos.x - spot.x, pos.y - spot.y - 1.3, pos.z - spot.z);
    if (distance >= nearestDistance) continue;
    if (!sceneEntities?.[id]?.children?.some(child => child.name === 'mesh')) continue;
    nearest = id;
    nearestDistance = distance;
  }
  if (nearest !== null) {
    const action = cortiMobActions.get(nearest);
    cortiMobActions.set(nearest, isPotion || isFireball ? { kind: 'attack', at: now }
      : { kind: action?.kind, at: action?.at, rangedReleaseAt: now });
  }
}

function cortiAnimateWorldEntities(now) {
  const three = globalThis.THREE;
  const sceneEntities = globalThis.world?.entities?.entities;
  if (three && sceneEntities) {
    cortiSyncObservedProjectiles();
    if (!cortiArrowTexturesRequested) {
      preloadObservedArrowTextures(cortiContentMinecraftVersion);
      void preloadObservedProjectileTextures(cortiContentMinecraftVersion);
      cortiArrowTexturesRequested = true;
    }
    for (const [id, entity] of entityCache) {
      const name = String(entity.name || '').replace(/^minecraft:/, '');
      const scene = sceneEntities[id];
      if (!scene) continue;
      if(isObservedProjectile(name)&&!isObservedArrow(name)){
        const native=scene.children.find(child=>child.name==='mesh');if(native)native.visible=false;continue;
      }
      cortiSyncEntityFire(scene, entity, now);
      if (name === 'player') cortiSyncAvatarShield(entity, entity.equipment?.[1]);
      cortiUpdateWorldEquipmentGlint(scene, entity, now);
      if (cortiProjectileNames.has(name)) {
        let record = cortiProjectileModels.get(id);
        const native = scene.children.find(child => child.name === 'mesh');
        if (!record || record.scene !== scene) {
          const model = cortiProjectileModel(name, entity);
          if (!model) continue;
          scene.add(model);
          record = { scene, native, model, lastDir: null, lastPos: null };
          cortiProjectileModels.set(id, record);
          if (name !== 'trident') cortiMobProjectileLaunch(entity, now);
        }
        if (record.native) record.native.visible = false;
        const pos = entity.pos || entity.position;
        const dir = observedArrowDirection(entity, record.lastPos, record.lastDir);
        if (pos) record.lastPos = { x: pos.x, y: pos.y, z: pos.z };
        if (dir) record.lastDir = dir;
        if (isObservedArrow(name)) {
          refreshObservedArrowVisual(record.model, name, entity, cortiContentMinecraftVersion);
          record.model.visible &&= Boolean(record.lastDir);
        }
        if (record.lastDir) {
          const parentQ = scene.getWorldQuaternion(new three.Quaternion());
          const aim = new three.Quaternion().setFromUnitVectors(new three.Vector3(0, 1, 0), record.lastDir);
          record.model.quaternion.copy(parentQ.invert().multiply(aim));
        }
        continue;
      }
      if (!cortiHostiles.has(name)) continue;
      const model = scene.children.find(child => child.name === 'mesh');
      if (!model) continue;
      const motion = model.userData.cortiMobMotion ??= {
        y: model.position.y, z: model.rotation.z, x: model.rotation.x,
        scale: model.scale.clone(), parts: cortiMobRig(model),
        lastX: scene.position.x, lastZ: scene.position.z,
        lastAt: now, speed: 0, aimed: false, aimAt: now };
      if (!motion.disableFrustumCulling) {
        model.traverse(part => { if (part.isMesh) part.frustumCulled = false; });
        motion.disableFrustumCulling = true;
      }
      const velocity = entity.velocity;
      if (now - motion.lastAt >= 45) {
        const moved = Math.hypot(scene.position.x - motion.lastX, scene.position.z - motion.lastZ);
        const observed = moved < 3 ? moved * 50 / (now - motion.lastAt) : 0;
        motion.speed = motion.speed * .72 + observed * .28;
        motion.lastX = scene.position.x;
        motion.lastZ = scene.position.z;
        motion.lastAt = now;
      }
      const speed = Math.max(motion.speed, Math.hypot(Number(velocity?.x) || 0, Number(velocity?.z) || 0));
      const gait = Math.min(1, speed * 5);
      const cycle = now * .011 + Number(id) * .3;
      const stride = Math.sin(cycle);
      const action = cortiMobActions.get(id);
      const age = now - (action?.at ?? -1000);
      const impulse = age >= 0 && age < 380 ? Math.sin(Math.PI * age / 380) : 0;
      const attack = action?.kind === 'attack' ? impulse : 0;
      const hurt = action?.kind === 'hurt' ? impulse : 0;
      model.position.y = motion.y + Math.abs(stride) * .035 * gait;
      model.rotation.z = motion.z + .15 * hurt - .05 * attack;
      model.rotation.x = motion.x - .14 * attack + .05 * hurt;
      model.scale.copy(motion.scale);
      for (const entries of motion.parts.values()) for (const part of entries) {
        part.object.position.copy(part.basePosition);
        part.object.rotation.x = part.baseX;
        part.object.rotation.y = part.baseY;
        part.object.rotation.z = part.baseZ;
      }
      const biped = motion.parts.has('rightarm') || motion.parts.has('leftarm');
      if (biped) {
        cortiPoseMobPart(motion.parts, 'rightleg', -.54 * stride * gait);
        cortiPoseMobPart(motion.parts, 'leftleg', .54 * stride * gait);
        const zombie = ['zombie', 'husk', 'drowned', 'zombified_piglin'].includes(name);
        const raised = zombie ? 1.10 : 0;
        cortiPoseMobPart(motion.parts, 'rightarm', raised + .36 * stride * gait + 1.15 * attack,
          -.08 - .35 * attack, -.04);
        cortiPoseMobPart(motion.parts, 'leftarm', raised - .36 * stride * gait + .55 * attack,
          .08, .04);
        cortiPoseMobPart(motion.parts, 'head', -.06 * attack + .08 * hurt);
      } else if (name === 'spider' || name === 'cave_spider') {
        for (let leg = 0; leg < 8; leg += 1) {
          const side = leg % 2 ? -1 : 1;
          const phase = leg < 4 ? 0 : Math.PI;
          cortiPoseMobPart(motion.parts, `leg${leg}`, 0,
            Math.sin(cycle + phase) * .30 * gait * side,
            (Math.cos(cycle + phase) * .28 * gait + .18 * attack) * side);
        }
        model.position.y = motion.y + Math.abs(stride) * .055 * gait;
      } else if (name === 'creeper') {
        for (let leg = 0; leg < 4; leg += 1)
          cortiPoseMobPart(motion.parts, `leg${leg}`, stride * (leg % 2 ? -1 : 1) * .52 * gait);
        const swelling = Number(cortiMobMetadata(entity, 16)) > 0 || cortiMobMetadata(entity, 18) === true;
        if (swelling) {
          const pulse = .06 + .05 * Math.sin(now * .024);
          model.scale.x *= 1 + pulse;
          model.scale.z *= 1 + pulse;
          model.scale.y *= 1 - pulse * .5;
        }
      } else if (name === 'ravager') {
        for (let leg = 0; leg < 4; leg += 1)
          cortiPoseMobPart(motion.parts, `leg${leg}`, stride * (leg % 2 ? -1 : 1) * .42 * gait);
        cortiPoseMobPart(motion.parts, 'head', -.12 * attack);
      } else if (name === 'hoglin' || name === 'zoglin') {
        for (const side of ['left', 'right']) for (const end of ['front', 'back']) {
          const sign = (side === 'left') === (end === 'front') ? 1 : -1;
          cortiPoseMobPart(motion.parts, `leg${end}${side}`, sign * stride * .48 * gait);
        }
        cortiPoseMobPart(motion.parts, 'head', -.2 * attack);
      } else if (name === 'phantom') {
        for (let wing = 0; wing < 2; wing += 1) {
          const flap = Math.sin(now * .012 + Number(id)) * .65;
          cortiPoseMobPart(motion.parts, `wing${wing}`, 0, 0, flap * (wing ? -1 : 1));
          cortiPoseMobPart(motion.parts, `wingtip${wing}`, 0, 0, flap * (wing ? -.55 : .55));
        }
      } else if (name === 'blaze') {
        model.position.y = motion.y + Math.sin(now * .003 + Number(id)) * .10 + .16 * attack;
        for (let rod = 0; rod < 12; rod += 1)
          cortiPoseMobPart(motion.parts, `upperbodyparts${rod}`, 0,
            now * .0015 * (rod % 2 ? -1 : 1), Math.sin(now * .004 + rod) * .12);
      } else if (name === 'ghast') {
        model.position.y = motion.y + Math.sin(now * .0018 + Number(id)) * .13;
        for (let tentacle = 0; tentacle < 9; tentacle += 1)
          cortiPoseMobPart(motion.parts, `tentacles${tentacle}`,
            Math.sin(now * .003 + tentacle) * .13);
      } else if (name === 'slime' || name === 'magma_cube') {
        const jump = Math.min(1, Math.abs(Number(velocity?.y) || 0) * 2.5);
        model.scale.x *= 1 + jump * .11;
        model.scale.z *= 1 + jump * .11;
        model.scale.y *= 1 - jump * .15;
      } else if (name === 'silverfish') {
        for (let segment = 0; segment < 7; segment += 1)
          cortiPoseMobPart(motion.parts, `bodypart${segment}`, 0,
            Math.sin(now * .012 + segment * .6) * .12 * (.25 + gait * .75));
      } else if (name === 'guardian' || name === 'elder_guardian') {
        for (let segment = 0; segment < 3; segment += 1)
          cortiPoseMobPart(motion.parts, `tailpart${segment}`, 0,
            Math.sin(now * .006 + segment * .6) * .18);
      } else if (name === 'shulker') {
        const peek = Math.max(0, Math.min(1, (Number(cortiMobMetadata(entity, 17)) || 0) / 100));
        for (const part of motion.parts.get('lid') || [])
          part.object.position.y = part.basePosition.y + .45 * peek;
      }
      if (name === 'vex') {
        const flap = Math.sin(now * .025 + Number(id)) * .60;
        cortiPoseMobPart(motion.parts, 'rightwing', 0, 0, -flap);
        cortiPoseMobPart(motion.parts, 'leftwing', 0, 0, flap);
      }
      if (name === 'warden') {
        const anger = Math.min(1, (Number(cortiMobMetadata(entity, 16)) || 0) / 80);
        const pulse = Math.sin(now * (.004 + anger * .005)) * (.07 + anger * .10);
        cortiPoseMobPart(motion.parts, 'righttendril', 0, 0, -pulse);
        cortiPoseMobPart(motion.parts, 'lefttendril', 0, 0, pulse);
        model.scale.x *= 1 + anger * .025 * Math.sin(now * .014);
      }
      if (name === 'evoker' && Number(cortiMobMetadata(entity, 17)) > 0) {
        const cast = .25 * Math.sin(now * .015);
        cortiPoseMobPart(motion.parts, 'rightarm', 1.25 + cast, -.25, -.55);
        cortiPoseMobPart(motion.parts, 'leftarm', 1.25 - cast, .25, .55);
        model.position.y += .045 * Math.sin(now * .008);
      }
      if (name === 'witch') {
        const drinking = Boolean(cortiMobMetadata(entity, 17));
        cortiPoseMobPart(motion.parts, 'arms', drinking ? .55 : .08 * Math.sin(now * .003) + .8 * attack);
        cortiPoseMobPart(motion.parts, 'head', drinking ? -.18 : 0);
      }
      if (name === 'enderman' && Boolean(cortiMobMetadata(entity, 17))) {
        cortiPoseMobPart(motion.parts, 'rightarm', .80 + .12 * Math.sin(now * .012));
        cortiPoseMobPart(motion.parts, 'leftarm', .80 - .12 * Math.sin(now * .012));
        model.rotation.x -= .06;
      }
      const weapon = cortiMobWeapon(entity, name);
      const gripScale = cortiMobGripScale(entity, name);
      const nativeMain = cortiAttachMobNativeItem(model, motion, 0, 'right', gripScale);
      const nativeOff = cortiAttachMobNativeItem(model, motion, 1, 'left', gripScale);
      if (cortiRangedMobNames.has(name) && (weapon === 'bow' || weapon === 'crossbow')) {
        const ranged = cortiRangedVisual(model, motion, weapon);
        if (nativeMain) nativeMain.visible = false;
        if (nativeOff) nativeOff.visible = true;
        const flags = Number(cortiMobMetadata(entity, 15)) || 0;
        const aiming = weapon === 'crossbow'
          ? Boolean(cortiMobMetadata(entity, name === 'piglin' ? 18 : 17)) || (flags & 4) !== 0
          : (flags & 4) !== 0;
        if (aiming && !motion.aimed) motion.aimAt = now;
        motion.aimed = aiming;
        const releaseAge = now - (action?.rangedReleaseAt ?? -1000);
        if (releaseAge >= 0 && releaseAge < 320) motion.aimAt = now + 320 - releaseAge;
        const charge = aiming ? Math.max(0, Math.min(1, (now - motion.aimAt) / 750)) : 0;
        const stage = charge < .38 ? 0 : charge < .78 ? 1 : 2;
        const textureName = aiming && releaseAge >= 320
          ? `${weapon}_pulling_${stage}` : weapon;
        if (ranged.textureName !== textureName) {
          ranged.material.map = cortiBowTexture(textureName);
          ranged.material.needsUpdate = true;
          ranged.textureName = textureName;
        }
        ranged.group.position.set((ranged.armAttached ? -.02 + .05 * charge : -.40 + .17 * charge) * ranged.units,
          (ranged.armAttached ? -.59 + .07 * charge : 1.20 + .20 * charge) * ranged.units,
          (ranged.armAttached ? -.10 - .11 * charge : -.34 - .23 * charge) * ranged.units);
        ranged.group.rotation.set(.07, Math.PI, -.20 - .20 * charge);
        ranged.arrow.visible = aiming && charge > .20 && releaseAge >= 320;
        cortiPoseMobPart(motion.parts, 'rightarm', .38 + .75 * charge,
          -.12 - .24 * charge, -.12);
        cortiPoseMobPart(motion.parts, 'leftarm', .18 + 1.00 * charge,
          .10 + .28 * charge, .13);
      } else if (motion.ranged) {
        motion.ranged.group.visible = false;
      }
      if (nativeMain && !['bow', 'crossbow', 'trident'].includes(weapon)) nativeMain.visible = name !== 'vindicator';
      if (nativeMain && weapon === 'trident') nativeMain.visible = false;
      if (nativeOff && !['bow', 'crossbow'].includes(weapon)) nativeOff.visible = true;
      if (weapon && !['bow', 'crossbow'].includes(weapon) &&
          (!nativeMain || weapon === 'trident' || name === 'vindicator')) {
        cortiMeleeVisual(model, motion, weapon, gripScale);
      } else if (motion.held) {
        motion.held.group.visible = false;
      }
      if (age >= 380 && action?.rangedReleaseAt === undefined) cortiMobActions.delete(id);
      if (action?.rangedReleaseAt !== undefined && now - action.rangedReleaseAt > 1000) cortiMobActions.delete(id);
    }
    for (const [id, record] of cortiProjectileModels)
      if (!entityCache.has(id) || sceneEntities[id] !== record.scene) cortiProjectileModels.delete(id);
  }
  requestAnimationFrame(cortiAnimateWorldEntities);
}
requestAnimationFrame(cortiAnimateWorldEntities);
