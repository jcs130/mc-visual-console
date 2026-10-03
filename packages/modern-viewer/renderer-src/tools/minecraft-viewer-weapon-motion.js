/** First-person weapon motion is driven by the bot's real arm animation packets. */
const cortiWeaponNeutralPose = Object.freeze({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 });
const cortiWeaponSwings = { right: null, left: null };
let cortiSwordSwingSequence = 0;
let cortiEnchantmentTexture = null;
let cortiRangedUse = null;

function cortiSetRangedUse(event, now = performance.now()) {
  if (!event || !['bow', 'crossbow', 'trident'].includes(event.kind) ||
      !['draw', 'release', 'cancel'].includes(event.phase)) return;
  for (const holding of [globalThis.world?.holdingBlock, globalThis.world?.holdingBlockLeft]) {
    if (holding?.cortiNockedArrow) holding.cortiNockedArrow.visible = false;
    if (holding?.cortiBowDrawArm) holding.cortiBowDrawArm.visible = false;
  }
  cortiRangedUse = event.phase === 'cancel' ? null
    : { kind: event.kind, hand: event.hand === 'left' ? 'left' : 'right',
      phase: event.phase, at: now };
  if (event.phase !== 'draw' && viewer?.playerState?.reactive) {
    viewer.playerState.reactive.itemUsageTicks = 0;
  }
}

if (typeof socket !== 'undefined') socket.on('rangedUse', cortiSetRangedUse);

function cortiSyncRangedState(state) {
  if (cortiRangedUse?.phase !== 'draw') return;
  const item = cortiRangedUse.hand === 'left' ? state?.offhand
    : state?.hotbar?.find((slot) => slot?.selected)?.item;
  if ((item && String(item.name || '').replace(/^minecraft:/, '') !== cortiRangedUse.kind)
      || state?.usingHeldItem === false) {
    cortiSetRangedUse({ ...cortiRangedUse, phase: 'cancel' });
  }
}

if (typeof socket !== 'undefined') socket.on('avatarState', cortiSyncRangedState);

function cortiRangedPoseAt(use, now, hand = use?.hand) {
  if (!use) return null;
  const elapsed = now - use.at;
  if (use.phase === 'draw') {
    if (elapsed > 10_000) return null;
    const charge = Math.min(1, elapsed / (use.kind === 'crossbow' ? 1250 : 900));
    const smooth = charge * charge * (3 - 2 * charge);
    if (use.kind === 'bow' && hand !== use.hand) {
      return { x: -0.16 - 0.38 * smooth, y: 0.10 + 0.10 * smooth,
        z: -0.12 + 0.31 * smooth, yaw: 0.16 + 0.18 * smooth,
        pitch: -0.10 - 0.24 * smooth, roll: 0.12 + 0.17 * smooth };
    }
    return use.kind === 'trident'
      ? { x: -0.10 * smooth, y: 0.19 * smooth, z: 0.13 * smooth,
        yaw: 0.18 * smooth, pitch: -0.68 * smooth, roll: 0.12 * smooth }
      : use.kind === 'bow' && use.hand === 'right'
        ? { x: -0.84 - 0.08 * smooth, y: 0.08 + 0.03 * smooth, z: -0.12 - 0.12 * smooth,
          yaw: -0.18 - 0.10 * smooth, pitch: 0.07 * smooth, roll: -0.08 - 0.05 * smooth }
        : { x: -0.36 * smooth, y: 0.06 * smooth, z: -0.17 * smooth,
          yaw: -0.28 * smooth, pitch: 0.09 * smooth, roll: -0.11 * smooth };
  }
  if (elapsed > 360) return null;
  const kick = Math.sin(Math.PI * Math.min(1, elapsed / 360));
  if (use.kind === 'bow' && hand !== use.hand) {
    return { x: -0.32 * kick, y: 0.08 * kick, z: -0.12 * kick,
      yaw: 0.16 * kick, pitch: -0.18 * kick, roll: 0.14 * kick };
  }
  return { x: 0.10 * kick, y: -0.08 * kick, z: 0.23 * kick,
    yaw: -0.13 * kick, pitch: 0.35 * kick, roll: 0.08 * kick };
}

function cortiMakeDrawnArrow(holding) {
  const three = globalThis.THREE;
  const arrow = new three.Group();
  arrow.name = 'corti-nocked-arrow';
  const wood = new three.MeshStandardMaterial({ color: 0x9c744e, roughness: .82 });
  const iron = new three.MeshStandardMaterial({ color: 0xd8dedc, metalness: .58, roughness: .28 });
  const feather = new three.MeshBasicMaterial({ color: 0xf4eee1, side: three.DoubleSide });
  const shaft = new three.Mesh(new three.CylinderGeometry(.008, .008, .62, 6), wood);
  arrow.add(shaft);
  const tip = new three.Mesh(new three.ConeGeometry(.022, .10, 6), iron);
  tip.position.y = .36;
  arrow.add(tip);
  for (const angle of [0, Math.PI / 2]) {
    const fin = new three.Mesh(new three.PlaneGeometry(.075, .13), feather);
    fin.position.y = -.26;
    fin.rotation.y = angle;
    arrow.add(fin);
  }
  arrow.rotation.set(-Math.PI / 2, -.26, .08);
  arrow.visible = false;
  holding.cameraGroup.add(arrow);
  return arrow;
}

function cortiUpdateDrawnArrow(holding, use, now) {
  const drawing = use?.phase === 'draw' && ['bow', 'crossbow'].includes(use.kind)
    && now - use.at < 10_000;
  if (!drawing) {
    if (holding.cortiNockedArrow) holding.cortiNockedArrow.visible = false;
    return;
  }
  const arrow = holding.cortiNockedArrow ??= cortiMakeDrawnArrow(holding);
  const charge = Math.min(1, (now - use.at) / (use.kind === 'bow' ? 900 : 1250));
  arrow.visible = true;
  arrow.position.set(.12 - .12 * charge, -.14 + .04 * charge, -.86 + .29 * charge);
}

function cortiUpdateBowDrawArm(holding, use, now) {
  const armSource = holding.playerHand || globalThis.world?.holdingBlock?.playerHand;
  const drawing = isFirstPersonView && use?.kind === 'bow' && use.phase === 'draw'
    && now - use.at < 10_000 && armSource;
  if (!drawing) {
    if (holding.cortiBowDrawArm) holding.cortiBowDrawArm.visible = false;
    return;
  }
  const three = globalThis.THREE;
  if (!three) return;
  if (!holding.cortiBowDrawArm || holding.cortiBowDrawArmSource !== armSource) {
    holding.cortiBowDrawArm?.removeFromParent();
    const arm = new three.Group();
    arm.name = 'corti-bow-draw-arm';
    arm.matrixAutoUpdate = false;
    arm.add(armSource.clone(true));
    holding.cameraGroup.add(arm);
    holding.cortiBowDrawArm = arm;
    holding.cortiBowDrawArmSource = armSource;
  }
  const arm = holding.cortiBowDrawArm;
  const pose = cortiRangedPoseAt(use, now, use.hand === 'right' ? 'left' : 'right');
  const transform = new three.Matrix4().makeTranslation(pose.x, pose.y, pose.z);
  transform.multiply(new three.Matrix4().makeRotationZ(pose.roll));
  transform.multiply(new three.Matrix4().makeRotationY(pose.yaw));
  transform.multiply(new three.Matrix4().makeRotationX(pose.pitch));
  arm.matrix.copy(holding.armTransformGroup.matrix).premultiply(transform);
  arm.matrixWorldNeedsUpdate = true;
  arm.visible = true;
}

function cortiWeaponKind(name) {
  const item = String(name || '').replace(/^minecraft:/, '');
  if (item.endsWith('_sword')) return 'sword';
  if (item.endsWith('_axe')) return 'axe';
  return null;
}

function cortiBlendWeaponPose(frames, index, progress) {
  const [start, from] = frames[index - 1];
  const [end, to] = frames[index];
  const t = (progress - start) / (end - start);
  const t2 = t * t;
  const t3 = t2 * t;
  const before = frames[index - 2];
  const after = frames[index + 1];
  const pose = {};
  for (const key of ['x', 'y', 'z', 'yaw', 'pitch', 'roll']) {
    const entering = before ? (to[key] - before[1][key]) / (end - before[0]) : 0;
    const leaving = after ? (after[1][key] - from[key]) / (after[0] - start) : 0;
    const span = end - start;
    pose[key] = (2 * t3 - 3 * t2 + 1) * from[key]
      + (t3 - 2 * t2 + t) * entering * span
      + (-2 * t3 + 3 * t2) * to[key]
      + (t3 - t2) * leaving * span;
  }
  return pose;
}

function cortiWeaponPoseAt(swing, now) {
  if (!swing) return cortiWeaponNeutralPose;
  const progress = Math.min(1, Math.max(0, (now - swing.at) / swing.durationMs));
  if (progress >= 1) return cortiWeaponNeutralPose;
  const sword = swing.kind === 'sword';
  const frames = sword
    ? swing.variant === 1 ? [
      [0, swing.from],
      [0.16, { x: 0.12, y: 0.10, z: 0.04, yaw: -0.18, pitch: 0.21, roll: -0.32 }],
      [0.40, { x: -0.36, y: -0.12, z: -0.28, yaw: 0.72, pitch: -0.65, roll: 1.18 }],
      [0.59, { x: -0.22, y: -0.17, z: -0.17, yaw: 0.43, pitch: -0.40, roll: 0.66 }],
      [0.81, { x: -0.05, y: -0.03, z: -0.03, yaw: 0.08, pitch: -0.08, roll: 0.11 }],
      [1, cortiWeaponNeutralPose],
    ] : [
      [0, swing.from],
      [0.18, { x: -0.23, y: 0.25, z: 0.10, yaw: 0.50, pitch: 0.47, roll: 0.74 }],
      [0.37, { x: 0.36, y: -0.22, z: -0.38, yaw: -0.84, pitch: -0.94, roll: -1.30 }],
      [0.56, { x: 0.23, y: -0.28, z: -0.18, yaw: -0.46, pitch: -0.61, roll: -0.73 }],
      [0.82, { x: 0.04, y: -0.05, z: -0.03, yaw: -0.08, pitch: -0.11, roll: -0.12 }],
      [1, cortiWeaponNeutralPose],
    ] : [
      [0, swing.from],
      [0.25, { x: 0.12, y: 0.18, z: -0.10, yaw: -0.25, pitch: 0.34, roll: -0.28 }],
      [0.55, { x: -0.21, y: -0.18, z: -0.29, yaw: 0.35, pitch: -0.60, roll: 0.43 }],
      [0.72, { x: -0.14, y: -0.08, z: -0.12, yaw: 0.18, pitch: -0.26, roll: 0.20 }],
      [1, cortiWeaponNeutralPose],
    ];
  for (let i = 1; i < frames.length; i += 1) {
    if (progress > frames[i][0]) continue;
    const [start, from] = frames[i - 1];
    const [end, to] = frames[i];
    return cortiBlendWeaponPose(frames, i, progress);
  }
  return cortiWeaponNeutralPose;
}

function cortiStartWeaponSwing(hand, kind, itemName, now = performance.now()) {
  const previous = cortiWeaponSwings[hand];
  const from = previous && previous.itemName === itemName
    ? cortiWeaponPoseAt(previous, now)
    : cortiWeaponNeutralPose;
  cortiWeaponSwings[hand] = {
    hand, kind, itemName, from, at: now, durationMs: kind === 'sword' ? 360 : 470,
    variant: kind === 'sword' ? (++cortiSwordSwingSequence % 2 ? 1 : -1) : 1,
  };
}

function cortiMakeSwordTrail(holding) {
  const three = globalThis.THREE;
  if (!three) return null;
  const segments = 16;
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.BufferAttribute(new Float32Array((segments + 1) * 2 * 3), 3));
  const indices = [];
  for (let i = 0; i < segments; i += 1) {
    const vertex = i * 2;
    indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2);
  }
  geometry.setIndex(indices);
  const material = new three.MeshBasicMaterial({ color: 0xe7f4ff, transparent: true,
    opacity: 0, side: three.DoubleSide, depthTest: false, depthWrite: false,
    blending: three.AdditiveBlending, toneMapped: false });
  const mesh = new three.Mesh(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 20;
  holding.cameraGroup.add(mesh);
  return { mesh, geometry, material, segments, variant: 0 };
}

function cortiShapeSwordTrail(trail, variant) {
  const positions = trail.geometry.attributes.position;
  const start = variant === 1 ? [0.40, 0.16] : [-0.28, 0.28];
  const end = variant === 1 ? [-0.18, -0.28] : [0.42, -0.26];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  const nx = -dy / length;
  const ny = dx / length;
  for (let i = 0; i <= trail.segments; i += 1) {
    const t = i / trail.segments;
    const bend = Math.sin(Math.PI * t) * 0.055;
    const x = start[0] + dx * t + nx * bend;
    const y = start[1] + dy * t + ny * bend;
    const width = 0.003 + 0.016 * Math.sin(Math.PI * t);
    positions.setXYZ(i * 2, x - nx * width, y - ny * width, -0.95);
    positions.setXYZ(i * 2 + 1, x + nx * width, y + ny * width, -0.95);
  }
  positions.needsUpdate = true;
  trail.variant = variant;
}

function cortiUpdateSwordTrail(holding, swing, now) {
  const trail = holding.cortiSwordTrail ??= cortiMakeSwordTrail(holding);
  if (!trail) return;
  const progress = swing?.kind === 'sword' ? (now - swing.at) / swing.durationMs : 1;
  if (progress < 0.18 || progress >= 0.68) {
    trail.mesh.visible = false;
    return;
  }
  if (trail.variant !== swing.variant) cortiShapeSwordTrail(trail, swing.variant);
  const revealed = Math.min(1, Math.max(0, (progress - 0.18) / 0.36));
  trail.geometry.setDrawRange(0, Math.max(1, Math.ceil(revealed * trail.segments)) * 6);
  const fade = Math.min(1, (0.68 - progress) / 0.18);
  trail.material.opacity = (swing.enchanted ? 0.48 : 0.26) * fade;
  trail.material.color.setHex(swing.enchanted ? 0xcda6ff : 0xe7f4ff);
  trail.mesh.visible = true;
}

function cortiUpdateWeaponGlint(holding, now) {
  const model = holding.holdingBlock;
  if (!model) return;
  const enchanted = holding.lastHeldItem?.fullItem?.enchanted === true;
  if (!enchanted) {
    for (const part of model.userData.cortiGlintParts || []) part.visible = false;
    return;
  }
  const three = globalThis.THREE;
  if (!three) return;
  if (!cortiEnchantmentTexture) {
    cortiEnchantmentTexture = new three.TextureLoader().load('/textures/1.20.6/misc/enchanted_glint_item.png');
    cortiEnchantmentTexture.wrapS = three.RepeatWrapping;
    cortiEnchantmentTexture.wrapT = three.RepeatWrapping;
    cortiEnchantmentTexture.minFilter = three.LinearFilter;
    cortiEnchantmentTexture.magFilter = three.LinearFilter;
  }
  if (!model.userData.cortiGlintMaterials) {
    const meshes = [];
    model.traverse(object => {
      if (object.isMesh && !object.userData.cortiWeaponGlint) meshes.push(object);
    });
    const materials = [];
    const parts = [];
    for (const mesh of meshes) {
      const base = Array.isArray(mesh.material) ? mesh.material.find(material => material?.map) : mesh.material;
      if (!mesh.geometry) continue;
      const baseMap = base?.map || cortiEnchantmentTexture;
      const width = baseMap.image?.width || 16;
      const height = baseMap.image?.height || 16;
      const material = new three.ShaderMaterial({
        uniforms: { baseMap: { value: baseMap }, glintMap: { value: cortiEnchantmentTexture },
          hasBaseMap: { value: base?.map ? 1 : 0 },
          texel: { value: new three.Vector2(1 / width, 1 / height) }, time: { value: 0 } },
        vertexShader: `varying vec2 vUv;
          void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `uniform sampler2D baseMap; uniform sampler2D glintMap;
          uniform vec2 texel; uniform float time; uniform float hasBaseMap; varying vec2 vUv;
          void main(){float alpha=hasBaseMap>0.5?texture2D(baseMap,vUv).a:1.0;if(alpha<0.1)discard;
            float neighbor=min(min(texture2D(baseMap,vUv+vec2(texel.x,0.0)).a,
              texture2D(baseMap,vUv-vec2(texel.x,0.0)).a),
              min(texture2D(baseMap,vUv+vec2(0.0,texel.y)).a,
              texture2D(baseMap,vUv-vec2(0.0,texel.y)).a));
            float rim=hasBaseMap>0.5?clamp((alpha-neighbor)*1.2,0.0,1.0):0.35;
            vec3 a=texture2D(glintMap,vUv*2.7+vec2(time*0.11,-time*0.06)).rgb;
            vec3 b=texture2D(glintMap,vUv*2.7+vec2(-time*0.07,time*0.08)).rgb;
            float shine=clamp(max(max(a.r,b.r),max(a.b,b.b))*1.5,0.0,1.0);
            vec3 color=mix(vec3(0.37,0.15,0.74),vec3(0.85,0.69,1.0),shine);
            gl_FragColor=vec4(color,alpha*(0.34+0.48*shine+0.34*rim));}`,
        transparent: true, depthWrite: false, depthTest: true,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        side: three.DoubleSide, blending: three.AdditiveBlending, toneMapped: false,
      });
      const overlay = new three.Mesh(mesh.geometry, material);
      overlay.userData.cortiWeaponGlint = true;
      overlay.renderOrder = mesh.renderOrder + 1;
      mesh.add(overlay);
      materials.push(material);
      parts.push(overlay);
      const glowMaterial = new three.MeshBasicMaterial({ color: 0x9b57e5,
        transparent: true, opacity: 0.18, side: three.BackSide, depthWrite: false,
        blending: three.AdditiveBlending, toneMapped: false });
      const glow = new three.Mesh(mesh.geometry, glowMaterial);
      glow.scale.setScalar(1.055);
      glow.renderOrder = mesh.renderOrder + 1;
      mesh.add(glow);
      parts.push(glow);
      const edgeGeometry = new three.EdgesGeometry(mesh.geometry, 42);
      const edgeMaterial = new three.LineBasicMaterial({ color: 0xb780ff,
        transparent: true, opacity: 0.48, depthWrite: false, blending: three.AdditiveBlending,
        toneMapped: false });
      const outline = new three.LineSegments(edgeGeometry, edgeMaterial);
      outline.scale.setScalar(1.018);
      outline.renderOrder = mesh.renderOrder + 2;
      mesh.add(outline);
      parts.push(outline);
    }
    model.userData.cortiGlintMaterials = materials;
    model.userData.cortiGlintParts = parts;
  }
  for (const part of model.userData.cortiGlintParts) part.visible = true;
  for (const material of model.userData.cortiGlintMaterials) material.uniforms.time.value = now / 1000;
}

function cortiUpdateWorldEquipmentGlint(scene, entity, now) {
  const equipment = entity?.equipment;
  if (!Array.isArray(equipment)) return;
  const isPlayer = String(entity?.name || '').replace(/^minecraft:/, '') === 'player';
  for (const [hand, index] of [['right', 0], ['left', 1]]) {
    const item = equipment[index];
    if (item?.enchanted !== true) continue;
    let attached = null;
    const rendererHand = isPlayer ? hand : hand === 'right' ? 'left' : 'right';
    scene.traverse(child => {
      if (child.name === `custom_item_${rendererHand}` && !attached) attached = child;
      if (isPlayer && hand === 'left' && child.name === 'corti-shield') attached = child;
    });
    if (attached) cortiUpdateWeaponGlint({ holdingBlock: attached,
      lastHeldItem: { name: item?.name, fullItem: item } }, now);
  }
}

function cortiApplyFirstPersonSwing(event) {
  const isLeft = event.hand === 'left';
  const hand = isLeft ? 'left' : 'right';
  const item = viewer?.playerState?.reactive?.[isLeft ? 'heldItemOff' : 'heldItemMain'];
  const itemName = String(item?.name || '');
  const kind = cortiWeaponKind(itemName);
  if (isFirstPersonView && kind) {
    cortiStartWeaponSwing(hand, kind, itemName);
    cortiWeaponSwings[hand].enchanted = item?.fullItem?.enchanted === true;
    return;
  }
  const swing = viewer?.backend?.backendMethods?.changeHandSwingingState;
  swing?.(true, isLeft);
  // The renderer finishes a 250 ms cycle after stopSwing. Stop before its first boundary.
  queueMicrotask(() => swing?.(false, isLeft));
}

function cortiInitializeWeaponMotion() {
  const world = globalThis.world;
  if (!world) return;
  for (const [hand, holding] of [['right', world.holdingBlock], ['left', world.holdingBlockLeft]]) {
    if (!holding || holding.cortiWeaponMotionInstalled) continue;
    const original = holding.updateCameraGroup;
    const transform = holding.armTransformGroup.matrix.clone();
    const rotation = transform.clone();
    holding.updateCameraGroup = function (...args) {
      const now = performance.now();
      if (cortiRangedUse?.phase === 'draw' && hand === cortiRangedUse.hand &&
          viewer?.playerState?.reactive) {
        viewer.playerState.reactive.itemUsageTicks = Math.min(72000, Math.floor((now - cortiRangedUse.at) / 50));
      }
      original.apply(this, args);
      // The renderer multiplies first-person hand bob by 1.8. Keep a small
      // readable stride while sprinting so the item does not shake across the view.
      const bobScale = viewer?.playerState?.reactive?.sprinting ? 0.24 : 0.52;
      this.cameraGroup.position.x = this.camera.position.x
        + (this.cameraGroup.position.x - this.camera.position.x) * bobScale;
      this.cameraGroup.position.y = this.camera.position.y
        + (this.cameraGroup.position.y - this.camera.position.y) * bobScale;
      this.cameraGroup.rotation.x = this.camera.rotation.x
        + (this.cameraGroup.rotation.x - this.camera.rotation.x) * bobScale;
      this.cameraGroup.rotation.y = this.camera.rotation.y
        + (this.cameraGroup.rotation.y - this.camera.rotation.y) * bobScale;
      this.cameraGroup.rotation.z = this.camera.rotation.z
        + (this.cameraGroup.rotation.z - this.camera.rotation.z) * bobScale;
      // Minecraft-renderer loads the skin hand asynchronously. An empty slot
      // must retain that model after an item swap instead of looking invisible.
      if (hand === 'right' && this.lastHeldItem?.type === 'hand' &&
          !this.holdingBlock && this.playerHand) {
        this.holdingBlock = this.playerHand;
        this.currentDisplayType = 'hand';
        this.armTransformGroup.add(this.playerHand);
      }
      const swing = cortiWeaponSwings[hand];
      cortiUpdateWeaponGlint(this, now);
      const activeRanged = cortiRangedUse?.hand === hand ? cortiRangedUse : null;
      cortiUpdateDrawnArrow(this, activeRanged, now);
      if (activeRanged) cortiUpdateBowDrawArm(this, activeRanged, now);
      else if (this.cortiBowDrawArm) this.cortiBowDrawArm.visible = false;
      const ranged = activeRanged ? cortiRangedPoseAt(activeRanged, now, hand) : null;
      if (!ranged && cortiRangedUse?.hand === hand && cortiRangedUse.phase === 'release') cortiRangedUse = null;
      if (!ranged && (!swing || now - swing.at >= swing.durationMs || this.lastHeldItem?.name !== swing.itemName)) {
        if (swing) cortiWeaponSwings[hand] = null;
        cortiUpdateSwordTrail(this, null, now);
        return;
      }
      cortiUpdateSwordTrail(this, swing, now);
      const pose = ranged || cortiWeaponPoseAt(swing, now);
      // The offhand renderer mirrors its camera group after this transform.
      const pivotX = 0.56;
      transform.makeTranslation(pose.x + pivotX, pose.y - 0.52, pose.z - 0.72);
      transform.multiply(rotation.makeRotationZ(pose.roll));
      transform.multiply(rotation.makeRotationY(pose.yaw));
      transform.multiply(rotation.makeRotationX(pose.pitch));
      transform.multiply(rotation.makeTranslation(-pivotX, 0.52, 0.72));
      this.armTransformGroup.matrix.premultiply(transform);
      this.armTransformGroup.matrixWorldNeedsUpdate = true;
    };
    holding.cortiWeaponMotionInstalled = true;
  }
}
