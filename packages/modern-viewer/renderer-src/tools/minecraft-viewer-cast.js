/** The viewer shows cast facts from the Minecraft World over the game picture. */
let cortiCastSequence = -1;
let cortiCastPhase = '';
let cortiCastTimer = null;
let cortiCastDimension = null;
const cortiSkillEffects = [];
const cortiTargetedCastAt = new Map();
let cortiSkillGlowTexture = null;
const cortiSkillPalettes = Object.freeze({
  arcane: [0xc9a7ff, 0xf4e8ff], frost: [0x75dfff, 0xe7fbff],
  flame: [0xff703b, 0xffd189], life: [0x76eeaa, 0xe2ffbd],
  star: [0xb5a1ff, 0xfff0ba], earth: [0x8fda9b, 0xffd58f],
  wind: [0x80e2ec, 0xf2ffff], blood: [0xff6585, 0xffc2d0],
});

function cortiSpellVisual(spellId, tone) {
  const preset = globalThis.mcViewerSpellVisualPreset?.(spellId);
  if (preset) return preset;
  if (tone === 'healing') return { motion: 'heal', palette: 'life', reach: 1, duration: 1450 };
  if (tone === 'frost') return { motion: 'nova', palette: 'frost', reach: 4, duration: 1450 };
  if (tone === 'fire') return { motion: 'wave', palette: 'flame', reach: 4, duration: 1200 };
  if (tone === 'movement') return { motion: 'lift', palette: 'wind', reach: 1.4, duration: 1300 };
  return { motion: 'scan', palette: 'arcane', reach: 1.8, duration: 1200 };
}

function cortiFinitePoint(point) {
  return point && ['x', 'y', 'z'].every((axis) => Number.isFinite(point[axis]));
}

function cortiGetSkillGlowTexture(three) {
  if (cortiSkillGlowTexture) return cortiSkillGlowTexture;
  const canvas = document.createElement?.('canvas');
  const context = canvas?.getContext?.('2d');
  if (!context) return null;
  canvas.width = canvas.height = 64;
  const glow = context.createRadialGradient(32, 32, 2, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(.22, 'rgba(255,255,255,.9)');
  glow.addColorStop(.55, 'rgba(255,255,255,.28)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  cortiSkillGlowTexture = new three.CanvasTexture(canvas);
  return cortiSkillGlowTexture;
}

function cortiDisposeSkillEffect(effect) {
  if (!effect) return;
  effect.group.parent?.remove(effect.group);
  effect.ringGeometry.dispose();
  effect.pointGeometry.dispose();
  effect.ringMaterial.dispose();
  effect.pointMaterial.dispose();
  effect.beam?.geometry.dispose();
  effect.beam?.material.dispose();
  effect.rune?.geometry.dispose();
  effect.rune?.material.dispose();
}

function cortiStartSkillEffect(event) {
  // A request is only a quiet wind-up. The server's success reply owns the main effect.
  if (event.phase === 'failed') return;
  if (event.position && event.dimension && event.dimension !== cortiCastDimension) return;
  const three = globalThis.THREE;
  const world = globalThis.world;
  const caster = pendingAvatarState?.entity?.pos || latestPosition?.pos;
  if (!three || !world?.scene || !world.sceneOrigin || !cortiFinitePoint(caster)) return;
  const visual = cortiSpellVisual(event.spellId, event.tone);
  const palette = cortiSkillPalettes[visual.palette];
  const target = cortiFinitePoint(event.position) ? event.position : null;
  const id = String(event.spellId || '').split(':').pop().toLowerCase();
  const now = performance.now();
  if (!target && event.phase === 'succeeded' && now - (cortiTargetedCastAt.get(id) || 0) < 700) return;
  if (target) {
    if (cortiTargetedCastAt.size >= 64) cortiTargetedCastAt.clear();
    cortiTargetedCastAt.set(id, now);
  }
  if (event.phase === 'succeeded') {
    for (let i = cortiSkillEffects.length - 1; i >= 0; i--) {
      const previous = cortiSkillEffects[i];
      if (previous.id !== id || now - previous.at > 1200 ||
          (!target && previous.phase !== 'sent')) continue;
      cortiDisposeSkillEffect(previous);
      cortiSkillEffects.splice(i, 1);
    }
  }
  const pos = target && visual.motion !== 'bolt' ? target : caster;
  const yaw = Number.isFinite(latestPosition?.yaw) ? latestPosition.yaw : 0;
  let forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  let reach = visual.reach;
  if (target && visual.motion === 'bolt') {
    const dx = target.x - caster.x;
    const dz = target.z - caster.z;
    const distance = Math.hypot(dx, dz);
    if (distance > .1) {
      forward = { x: dx / distance, z: dz / distance };
      reach = Math.min(distance, 16);
    }
  }
  const right = { x: -forward.z, z: forward.x };
  const group = new three.Group();
  group.name = 'corti-skill-vfx';
  const ringMaterial = new three.MeshBasicMaterial({ color: palette[0], transparent: true, opacity: .72,
    blending: three.AdditiveBlending, depthWrite: false, side: three.DoubleSide, toneMapped: false });
  const ringGeometry = new three.TorusGeometry(1, .025, 5, 64);
  const rings = [new three.Mesh(ringGeometry, ringMaterial), new three.Mesh(ringGeometry, ringMaterial)];
  for (const ring of rings) { ring.rotation.x = Math.PI / 2; group.add(ring); }
  const count = event.phase === 'sent' ? 20 : 84;
  const pointGeometry = new three.BufferGeometry();
  pointGeometry.setAttribute('position', new three.BufferAttribute(new Float32Array(count * 3), 3));
  const colors = new Float32Array(count * 3);
  const first = new three.Color(palette[0]);
  const second = new three.Color(palette[1]);
  for (let i = 0; i < count; i++) {
    const color = i % 3 ? first : second;
    colors.set([color.r, color.g, color.b], i * 3);
  }
  pointGeometry.setAttribute('color', new three.BufferAttribute(colors, 3));
  const pointMaterial = new three.PointsMaterial({ size: event.phase === 'sent' ? .065 : .12,
    sizeAttenuation: true, vertexColors: true, transparent: true, opacity: .8,
    blending: three.AdditiveBlending, depthWrite: false, toneMapped: false,
    map: cortiGetSkillGlowTexture(three) });
  group.add(new three.Points(pointGeometry, pointMaterial));
  let rune = null;
  if (event.phase === 'succeeded' && ['summon', 'portal', 'heal'].includes(visual.motion)) {
    const vertices = [];
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const b = (i + 1) * Math.PI / 6;
      vertices.push(Math.cos(a) * .88, .08, Math.sin(a) * .88,
        Math.cos(b) * .88, .08, Math.sin(b) * .88);
      if (i % 2 === 0) vertices.push(Math.cos(a) * .88, .08, Math.sin(a) * .88,
        Math.cos(a) * .35, .08, Math.sin(a) * .35);
    }
    const runeGeometry = new three.BufferGeometry();
    runeGeometry.setAttribute('position', new three.BufferAttribute(new Float32Array(vertices), 3));
    const runeMaterial = new three.LineBasicMaterial({ color: palette[1], transparent: true,
      opacity: .7, blending: three.AdditiveBlending, depthWrite: false, toneMapped: false });
    rune = new three.LineSegments(runeGeometry, runeMaterial);
    group.add(rune);
  }
  let beam = null;
  if (visual.motion === 'bolt' && event.phase === 'succeeded') {
    const beamMaterial = new three.MeshBasicMaterial({ color: palette[1], transparent: true,
      opacity: .62, blending: three.AdditiveBlending, depthWrite: false, toneMapped: false });
    beam = new three.Mesh(new three.CylinderGeometry(.016, .07, 1, 7), beamMaterial);
    group.add(beam);
  }
  world.scene.add(group);
  cortiSkillEffects.push({ group, rings, ringGeometry, ringMaterial, pointGeometry, pointMaterial,
    beam, rune, visual, forward, right, reach, target, phase: event.phase, id,
    pos: { x: pos.x, y: pos.y, z: pos.z }, at: now,
    duration: event.phase === 'sent' ? 520 : visual.duration });
  while (cortiSkillEffects.length > 6) cortiDisposeSkillEffect(cortiSkillEffects.shift());
}

function cortiAnimateSkillEffects(now) {
  const origin = globalThis.world?.sceneOrigin;
  for (let i = cortiSkillEffects.length - 1; i >= 0; i--) {
    const effect = cortiSkillEffects[i];
    const progress = (now - effect.at) / effect.duration;
    if (progress >= 1 || !origin) {
      cortiDisposeSkillEffect(effect);
      cortiSkillEffects.splice(i, 1);
      continue;
    }
    const { visual, forward, right, reach, phase } = effect;
    const motion = phase === 'sent' ? 'windup' : visual.motion;
    const fade = Math.min(1, progress * 6) * (1 - progress) ** .65;
    effect.group.position.set(origin.toSceneX(effect.pos.x),
      origin.toSceneY(effect.pos.y + .12), origin.toSceneZ(effect.pos.z));
    const ringRadius = motion === 'nova' || motion === 'scan' ? reach * progress
      : motion === 'wave' ? reach * progress * .55
        : motion === 'windup' ? .45 + progress * .35
          : motion === 'portal' || motion === 'summon' ? .65 + progress * .7 : 1 + progress * .5;
    effect.rings[0].scale.setScalar(Math.max(.03, ringRadius));
    effect.rings[1].scale.setScalar(Math.max(.03, ringRadius * (motion === 'nova' ? .77 : .58)));
    effect.rings[1].rotation.z = now * .0009;
    effect.rings[0].visible = motion !== 'bolt' && motion !== 'burst' && motion !== 'shower';
    effect.rings[1].visible = motion !== 'bolt' && motion !== 'wave' &&
      motion !== 'burst' && motion !== 'shower';
    if (motion === 'wave') {
      effect.rings[0].position.set(forward.x * reach * progress * .65, .65,
        forward.z * reach * progress * .65);
      effect.rings[0].rotation.set(0, Math.atan2(forward.x, forward.z), 0);
      effect.rings[0].scale.set(reach * .4 * progress, 1.25 * progress, 1);
    } else {
      effect.rings[0].rotation.x = motion === 'portal' ? .35 : Math.PI / 2;
      effect.rings[0].position.set(0, motion === 'portal' ? 1 : .06, 0);
      effect.rings[1].position.y = motion === 'portal' ? 1.35 : .08;
    }
    effect.ringMaterial.opacity = fade * (phase === 'sent' ? .26 : .76);
    effect.pointMaterial.opacity = fade * (phase === 'sent' ? .42 : .9);
    if (effect.rune) {
      effect.rune.rotation.y = now * .0008;
      effect.rune.scale.setScalar(.7 + progress * .65);
      effect.rune.material.opacity = fade * .73;
    }
    const positions = effect.pointGeometry.attributes.position;
    for (let j = 0; j < positions.count; j++) {
      const u = j / positions.count;
      const angle = j * 2.399963 + now * .0007;
      const spread = .35 + (j % 7) / 7;
      let along = 0; let sideways = 0; let height = 0;
      if (motion === 'nova' || motion === 'scan') {
        const r = reach * Math.max(0, progress - u * .12) * spread;
        along = Math.cos(angle) * r; sideways = Math.sin(angle) * r;
        height = motion === 'nova' ? .1 + Math.sin(progress * Math.PI) * (j % 5) * .16 : .08;
      } else if (motion === 'wave') {
        along = reach * Math.max(0, progress - u * .16);
        sideways = Math.sin(angle) * along * .45 * spread;
        height = .15 + (j % 9) * .13 * Math.sin(progress * Math.PI);
      } else if (motion === 'bolt') {
        along = reach * Math.max(0, progress * 1.35 - u * .48);
        sideways = Math.sin(angle) * (.07 + .16 * u);
        height = 1.35 + Math.cos(angle) * .17 +
          (effect.target ? (effect.target.y - effect.pos.y - 1.35) * Math.min(1, along / reach) : 0);
      } else if (motion === 'burst') {
        const burst = Math.max(0, (progress - .3 - u * .12) / .58);
        along = Math.cos(angle) * burst * reach * spread;
        sideways = Math.sin(angle) * burst * reach * spread;
        height = Math.min(1, progress / .3) * 2.6 +
          Math.sin(j * 1.7) * burst * reach * .65;
      } else if (motion === 'shower') {
        along = Math.cos(angle) * reach * spread;
        sideways = Math.sin(angle) * reach * spread;
        height = 3.2 - (progress + u * .55) % 1 * 3;
      } else if (motion === 'summon' || motion === 'portal' || motion === 'heal' || motion === 'lift') {
        const r = motion === 'summon' ? .75 : motion === 'portal' ? 1 : .5;
        along = Math.cos(angle + progress * 5) * r * spread;
        sideways = Math.sin(angle + progress * 5) * r * spread;
        height = motion === 'lift' ? progress * 3 * spread
          : motion === 'heal' ? progress * 2.2 + u * .5
            : progress * 2.8 + u * .35;
      } else {
        along = Math.cos(angle) * (.35 + progress * .45);
        sideways = Math.sin(angle) * (.35 + progress * .45);
        height = .3 + progress * .5;
      }
      positions.setXYZ(j, forward.x * along + right.x * sideways, height,
        forward.z * along + right.z * sideways);
    }
    positions.needsUpdate = true;
    if (effect.beam) {
      const length = Math.max(.03, reach * Math.min(1, progress * 2.2));
      const rise = effect.target ? effect.target.y - effect.pos.y - 1.35 : 0;
      effect.beam.position.set(forward.x * length / 2, 1.35 + rise * length / reach / 2,
        forward.z * length / 2);
      effect.beam.scale.y = Math.hypot(length, rise * length / reach);
      effect.beam.quaternion.setFromUnitVectors(new globalThis.THREE.Vector3(0, 1, 0),
        new globalThis.THREE.Vector3(forward.x, rise / reach, forward.z).normalize());
      effect.beam.material.opacity = .6 * fade;
    }
  }
  requestAnimationFrame(cortiAnimateSkillEffects);
}
requestAnimationFrame(cortiAnimateSkillEffects);

function cortiInstallCastCue(socket) {
  const root = document.getElementById('corti-cast');
  if (!root) return;
  socket.on('connect', () => {
    cortiCastSequence = -1;
    cortiCastPhase = '';
    cortiCastDimension = null;
    root.hidden = true;
    if (cortiCastTimer !== null) clearTimeout(cortiCastTimer);
    cortiCastTimer = null;
    while (cortiSkillEffects.length) cortiDisposeSkillEffect(cortiSkillEffects.pop());
    cortiTargetedCastAt.clear();
  });
  socket.on('biome', (event) => {
    if (typeof event?.dimension === 'string') cortiCastDimension = event.dimension;
  });
  socket.on('castCue', (event) => {
    if (!event || !Number.isSafeInteger(event.seq) || event.seq < 0 ||
        !['sent', 'succeeded', 'failed'].includes(event.phase) ||
        typeof event.spellName !== 'string' || event.spellName.length > 80) return;
    if (event.seq === cortiCastSequence && cortiCastPhase !== 'sent' && event.phase === 'sent') return;
    cortiCastSequence = event.seq;
    cortiCastPhase = event.phase;
    cortiStartSkillEffect(event);
    root.hidden = false;
    root.dataset.phase = event.phase;
    root.dataset.tone = typeof event.tone === 'string' ? event.tone : 'arcane';
    root.querySelector('[data-cast-phase]').textContent = event.phase === 'sent'
      ? '✦ 使用技能 · 咏唱' : event.phase === 'succeeded'
        ? '✦ 使用技能 · 生效' : '✦ 使用技能 · 受阻';
    root.querySelector('[data-cast-name]').textContent = event.spellName;
    root.querySelector('[data-cast-detail]').textContent = event.phase === 'sent'
      ? '法术已发出，等待回应' : typeof event.detail === 'string' ? event.detail.slice(0, 80) : '';
    const line = root.querySelector('.corti-cast-line');
    line.style.animation = 'none';
    void line.offsetWidth;
    line.style.animation = '';
    if (cortiCastTimer !== null) clearTimeout(cortiCastTimer);
    const sequence = event.seq;
    cortiCastTimer = setTimeout(() => {
      if (cortiCastSequence === sequence) root.hidden = true;
      cortiCastTimer = null;
    }, event.phase === 'sent' ? 5_000 : 4_000);
  });
}

cortiInstallCastCue(socket);

// Cosmetic-only preview for tuning the viewer; it never sends a game command.
globalThis.MinecraftViewerSkillVfx = Object.freeze({
  preview(spellId) {
    if (typeof spellId !== 'string' || !/^[a-z0-9_:]{1,64}$/.test(spellId)) return false;
    cortiStartSkillEffect({ spellId, phase: 'succeeded' });
    return true;
  },
  get activeCount() { return cortiSkillEffects.length; },
});
