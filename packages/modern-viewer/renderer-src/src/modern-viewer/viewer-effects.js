import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  TorusGeometry,
} from "three";

export const VIEWER_EFFECT_LIMITS = Object.freeze({
  maximumActiveEffects: 48,
  maximumActiveParticles: 240,
  maximumParticlesPerEvent: 24,
  maximumEventsPerSecond: 60,
  maximumLifetimeMs: 8_000,
  maximumChatHintsRemembered: 128,
});

const EVENT_KINDS = new Set(["particle", "sound", "status", "burst"]);
const BURST_STYLES = new Set(["critical", "magic_critical", "hurt", "death", "firework"]);
const SKILL_PATTERNS = Object.freeze([
  { skill: "影分身", actor: "鸣人", patterns: ["影分身", "shadow clone"] },
  { skill: "螺旋丸", actor: "鸣人", patterns: ["螺旋丸", "rasengan"] },
  { skill: "写轮眼", actor: "鸣人", patterns: ["写轮眼", "sharingan"] },
  { skill: "星爆气流斩", actor: "桐人", patterns: ["星爆气流斩", "starburst stream"] },
  { skill: "二刀流", actor: "桐人", patterns: ["二刀流", "dual blades", "dual wield"] },
]);
const ACTOR_ALIASES = Object.freeze([
  ["鸣人", ["鸣人", "楦d汉", "naruto"]],
  ["桐人", ["桐人", "妗愪汉", "kirito"]],
]);
const GENERIC_SKILL_MARKERS = Object.freeze([
  "释放", "施放", "发动", "技能", "cast", "skill", "ability", "閲婃斁", "鎶€鑳",
]);

/**
 * Keep the browser boundary deliberately small. Styling, colours and geometry
 * are selected locally; a server packet can provide only bounded facts.
 */
export function normalizeViewerEffectEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Number(value.schemaVersion) !== 1) return null;
  const kind = String(value.kind || "").toLowerCase();
  if (!EVENT_KINDS.has(kind)) return null;
  const position = normalizePosition(value.position);
  const base = {
    schemaVersion: 1,
    seq: boundedInteger(value.seq, 0, Number.MAX_SAFE_INTEGER, 0),
    kind,
    observedAt: boundedInteger(value.observedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    serverDropped: boundedInteger(value.serverDropped, 0, 10_000, 0),
  };

  if (kind === "particle") {
    if (!position) return null;
    return Object.freeze({
      ...base,
      source: "server-particle",
      name: normalizeEventName(value.name, "unknown_particle"),
      position,
      offset: normalizeOffset(value.offset),
      count: boundedInteger(value.count, 1, VIEWER_EFFECT_LIMITS.maximumParticlesPerEvent, 1),
      speed: boundedNumber(value.speed, 0, 4, 0),
    });
  }

  if (kind === "sound") {
    if (!position) return null;
    return Object.freeze({
      ...base,
      source: "server-sound",
      name: normalizeEventName(value.name, "unknown_sound"),
      position,
      volume: boundedNumber(value.volume, 0, 4, 1),
      pitch: boundedNumber(value.pitch, 0.05, 4, 1),
    });
  }

  if (kind === "status") {
    const entityId = normalizeEntityId(value.entityId);
    if (entityId === null && !position) return null;
    return Object.freeze({
      ...base,
      source: "server-status",
      phase: value.phase === "end" ? "end" : "start",
      entityId,
      position,
      effectId: boundedInteger(value.effectId, 0, 255, 0),
      effectName: normalizeEventName(value.effectName, `effect_${boundedInteger(value.effectId, 0, 255, 0)}`),
      amplifier: boundedInteger(value.amplifier, 0, 255, 0),
      durationTicks: boundedInteger(value.durationTicks, 0, 20 * 60 * 30, 0),
    });
  }

  const style = String(value.style || "").toLowerCase();
  if (!position || !BURST_STYLES.has(style)) return null;
  return Object.freeze({
    ...base,
    source: "server-entity-event",
    style,
    entityId: normalizeEntityId(value.entityId),
    position,
  });
}

/**
 * Chat never becomes an authoritative particle event. This helper only emits
 * an explicitly labelled inference for the lightweight HUD cue layer.
 */
export function detectSkillChatHint(message) {
  if (!message || typeof message !== "object" || message.rule === true) return null;
  const text = cleanDisplayText(message.message, 320);
  if (!text) return null;
  const folded = text.toLocaleLowerCase("zh-CN");
  let actor = null;
  for (const [name, aliases] of ACTOR_ALIASES) {
    if (aliases.some((alias) => folded.includes(alias.toLocaleLowerCase("zh-CN")))) {
      actor = name;
      break;
    }
  }
  for (const entry of SKILL_PATTERNS) {
    if (!entry.patterns.some((pattern) => folded.includes(pattern.toLocaleLowerCase("zh-CN")))) continue;
    return Object.freeze({
      id: cleanDisplayText(message.id, 128) || `chat-${hashText(text).toString(16)}`,
      source: "chat-inference",
      sourceLabel: "聊天推断（非服务器粒子）",
      actor: actor || entry.actor,
      skill: entry.skill,
      evidence: text,
    });
  }
  if (actor && GENERIC_SKILL_MARKERS.some((marker) => folded.includes(marker.toLocaleLowerCase("zh-CN")))) {
    return Object.freeze({
      id: cleanDisplayText(message.id, 128) || `chat-${hashText(text).toString(16)}`,
      source: "chat-inference",
      sourceLabel: "聊天推断（非服务器粒子）",
      actor,
      skill: "技能动作",
      evidence: text,
    });
  }
  return null;
}

export class ViewerEffectSystem {
  constructor(options = {}) {
    this.getWorld = typeof options.getWorld === "function" ? options.getWorld : () => globalThis.world;
    this.getEntity = typeof options.getEntity === "function"
      ? options.getEntity
      : (id) => this.getWorld()?.entities?.entities?.[String(id)] ?? null;
    this.cueElement = options.cueElement ?? null;
    this.now = typeof options.now === "function" ? options.now : () => performance.now();
    this.requestFrame = typeof options.requestFrame === "function"
      ? options.requestFrame
      : (callback) => requestAnimationFrame(callback);
    this.cancelFrame = typeof options.cancelFrame === "function"
      ? options.cancelFrame
      : (handle) => cancelAnimationFrame(handle);
    this.entries = [];
    this.statusEntries = new Map();
    this.recentEventTimes = [];
    this.seenChatHints = new Set();
    this.frame = null;
    this.suspended = false;
    this.disposed = false;
    this.activeParticles = 0;
    this.cueExpiresAt = 0;
    this.diagnostics = {
      received: 0,
      rendered: 0,
      dropped: 0,
      serverDropped: 0,
      expired: 0,
      actualParticleEvents: 0,
      soundVisualizations: 0,
      statusVisualizations: 0,
      entityBursts: 0,
      chatInferences: 0,
      eventsByKind: { particle: 0, sound: 0, status: 0, burst: 0 },
    };
  }

  handle(raw) {
    if (this.disposed) return false;
    const event = normalizeViewerEffectEvent(raw);
    this.diagnostics.received += 1;
    if (!event) {
      this.diagnostics.dropped += 1;
      return false;
    }
    this.diagnostics.serverDropped += event.serverDropped;
    const now = this.now();
    this.prune(now);
    this.recentEventTimes = this.recentEventTimes.filter((at) => now - at < 1_000);
    if (this.recentEventTimes.length >= VIEWER_EFFECT_LIMITS.maximumEventsPerSecond) {
      this.diagnostics.dropped += 1;
      return false;
    }
    this.recentEventTimes.push(now);
    this.diagnostics.eventsByKind[event.kind] += 1;

    let rendered = false;
    if (event.kind === "particle") rendered = this.spawnParticle(event, now);
    else if (event.kind === "sound") rendered = this.spawnSound(event, now);
    else if (event.kind === "status") rendered = this.applyStatus(event, now);
    else if (event.kind === "burst") rendered = this.spawnBurst(event, now);
    if (!rendered) {
      this.diagnostics.dropped += 1;
      return false;
    }
    this.diagnostics.rendered += 1;
    this.ensureFrame();
    return true;
  }

  ingestChat(messages) {
    if (!Array.isArray(messages) || this.disposed) return null;
    let newest = null;
    for (const message of messages.slice(-40)) {
      const hint = detectSkillChatHint(message);
      if (!hint || this.seenChatHints.has(hint.id)) continue;
      this.seenChatHints.add(hint.id);
      newest = hint;
    }
    while (this.seenChatHints.size > VIEWER_EFFECT_LIMITS.maximumChatHintsRemembered) {
      this.seenChatHints.delete(this.seenChatHints.values().next().value);
    }
    if (!newest) return null;
    this.diagnostics.chatInferences += 1;
    this.showCue(newest.sourceLabel, `${newest.actor} · ${newest.skill}`, newest.evidence, 3_800);
    return newest;
  }

  setSuspended(value) {
    this.suspended = value === true;
    if (this.suspended && this.frame !== null) {
      this.cancelFrame(this.frame);
      this.frame = null;
    }
    if (!this.suspended) {
      this.prune(this.now());
      this.ensureFrame();
    }
  }

  getDiagnostics() {
    return {
      ...this.diagnostics,
      eventsByKind: { ...this.diagnostics.eventsByKind },
      activeEffects: this.entries.length,
      activeParticles: this.activeParticles,
      rememberedChatHints: this.seenChatHints.size,
      suspended: this.suspended,
      limits: { ...VIEWER_EFFECT_LIMITS },
      sources: ["server-particle", "server-sound", "server-status", "server-entity-event", "chat-inference"],
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    for (const entry of [...this.entries]) this.removeEntry(entry);
    this.entries.length = 0;
    this.statusEntries.clear();
    this.hideCue();
  }

  spawnParticle(event, now) {
    const count = Math.min(event.count, VIEWER_EFFECT_LIMITS.maximumActiveParticles - this.activeParticles);
    if (count <= 0 || this.entries.length >= VIEWER_EFFECT_LIMITS.maximumActiveEffects) return false;
    const style = particleStyle(event.name);
    const burst = createPointBurst(count, event.offset, event.speed, style, hashText(`${event.seq}:${event.name}`));
    const attached = this.attachWorldObject(burst.root, event.position);
    if (!attached) {
      burst.dispose();
      return false;
    }
    const lifetime = style.lifetime;
    this.entries.push({
      kind: "particle",
      root: burst.root,
      points: burst.points,
      geometry: burst.geometry,
      material: burst.material,
      base: burst.base,
      velocity: burst.velocity,
      count,
      createdAt: now,
      expiresAt: now + lifetime,
      lifetime,
      detach: attached,
    });
    this.activeParticles += count;
    this.diagnostics.actualParticleEvents += 1;
    return true;
  }

  spawnSound(event, now) {
    if (this.entries.length >= VIEWER_EFFECT_LIMITS.maximumActiveEffects) return false;
    const root = new Group();
    root.name = "__lantern_server_sound_wave";
    const geometry = new RingGeometry(0.32, 0.4, 32);
    const material = new MeshBasicMaterial({
      color: soundColour(event.name),
      transparent: true,
      opacity: Math.min(0.72, 0.28 + event.volume * 0.12),
      depthWrite: false,
      blending: AdditiveBlending,
      side: 2,
    });
    const ring = new Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    root.add(ring);
    const detach = this.attachWorldObject(root, event.position);
    if (!detach) {
      geometry.dispose();
      material.dispose();
      return false;
    }
    const lifetime = Math.round(650 + Math.min(1.5, event.volume) * 180);
    this.entries.push({ kind: "sound", root, ring, geometry, material, count: 0, createdAt: now, expiresAt: now + lifetime, lifetime, detach });
    this.diagnostics.soundVisualizations += 1;
    return true;
  }

  applyStatus(event, now) {
    const key = `status:${event.entityId ?? "world"}:${event.effectId}`;
    const previous = this.statusEntries.get(key);
    if (previous) this.removeEntry(previous);
    if (event.phase === "end") return true;
    if (this.entries.length >= VIEWER_EFFECT_LIMITS.maximumActiveEffects) return false;
    const root = new Group();
    root.name = "__lantern_server_status_aura";
    const geometry = new TorusGeometry(0.56, 0.035, 6, 28);
    const material = new MeshBasicMaterial({
      color: statusColour(event.effectName, event.effectId),
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const ring = new Mesh(geometry, material);
    ring.rotation.x = Math.PI / 2;
    root.add(ring);
    const detach = event.entityId !== null
      ? this.attachEntityObject(root, event.entityId)
      : this.attachWorldObject(root, event.position);
    if (!detach) {
      geometry.dispose();
      material.dispose();
      return false;
    }
    const durationMs = event.durationTicks > 0
      ? Math.min(VIEWER_EFFECT_LIMITS.maximumLifetimeMs, Math.max(600, event.durationTicks * 50))
      : 1_800;
    const entry = {
      kind: "status",
      statusKey: key,
      root,
      ring,
      geometry,
      material,
      count: 0,
      createdAt: now,
      expiresAt: now + durationMs,
      lifetime: durationMs,
      detach,
    };
    this.entries.push(entry);
    this.statusEntries.set(key, entry);
    this.diagnostics.statusVisualizations += 1;
    this.showCue("服务器状态", `${event.effectName}${event.amplifier > 0 ? ` ${event.amplifier + 1}` : ""}`, "来自 Mineflayer 的实体状态事件", 1_900);
    return true;
  }

  spawnBurst(event, now) {
    if (this.entries.length >= VIEWER_EFFECT_LIMITS.maximumActiveEffects) return false;
    const style = burstStyle(event.style);
    const count = Math.min(style.count, VIEWER_EFFECT_LIMITS.maximumActiveParticles - this.activeParticles);
    if (count <= 0) return false;
    const burst = createPointBurst(count, { x: 0.42, y: 0.6, z: 0.42 }, style.speed, style, hashText(`${event.seq}:${event.style}`));
    const detach = this.attachWorldObject(burst.root, { ...event.position, y: event.position.y + 0.9 });
    if (!detach) {
      burst.dispose();
      return false;
    }
    this.entries.push({
      kind: "burst",
      root: burst.root,
      points: burst.points,
      geometry: burst.geometry,
      material: burst.material,
      base: burst.base,
      velocity: burst.velocity,
      count,
      createdAt: now,
      expiresAt: now + style.lifetime,
      lifetime: style.lifetime,
      detach,
    });
    this.activeParticles += count;
    this.diagnostics.entityBursts += 1;
    return true;
  }

  attachWorldObject(root, position) {
    const world = this.getWorld();
    if (!world?.scene || !position) return null;
    try {
      world.sceneOrigin?.track?.(root);
      root.position.set(position.x, position.y, position.z);
      world.scene.add(root);
      return () => {
        if (typeof world.sceneOrigin?.removeAndUntrack === "function") world.sceneOrigin.removeAndUntrack(root);
        else root.removeFromParent();
      };
    } catch {
      root.removeFromParent();
      return null;
    }
  }

  attachEntityObject(root, entityId) {
    const entity = this.getEntity(entityId);
    if (!entity?.add) return null;
    try {
      root.position.set(0, Math.max(0.35, Number(entity.originalEntity?.height || 1.8) * 0.52), 0);
      entity.add(root);
      return () => root.removeFromParent();
    } catch {
      root.removeFromParent();
      return null;
    }
  }

  ensureFrame() {
    if (this.disposed || this.suspended || this.frame !== null || (this.entries.length === 0 && this.cueExpiresAt <= this.now())) return;
    this.frame = this.requestFrame(() => {
      this.frame = null;
      this.tick(this.now());
    });
  }

  tick(now) {
    if (this.disposed || this.suspended) return;
    this.prune(now);
    for (const entry of this.entries) {
      const elapsed = Math.max(0, now - entry.createdAt);
      const progress = Math.min(1, elapsed / entry.lifetime);
      if (entry.points) {
        const attribute = entry.geometry.getAttribute("position");
        for (let index = 0; index < entry.count * 3; index += 3) {
          attribute.array[index] = entry.base[index] + entry.velocity[index] * elapsed;
          attribute.array[index + 1] = entry.base[index + 1] + entry.velocity[index + 1] * elapsed - progress * progress * 0.55;
          attribute.array[index + 2] = entry.base[index + 2] + entry.velocity[index + 2] * elapsed;
        }
        attribute.needsUpdate = true;
        entry.material.opacity = Math.max(0, 0.92 * (1 - progress));
      } else if (entry.kind === "sound") {
        const scale = 0.65 + progress * 5.4;
        entry.ring.scale.setScalar(scale);
        entry.material.opacity = Math.max(0, 0.65 * (1 - progress));
      } else if (entry.kind === "status") {
        const pulse = 0.94 + Math.sin(elapsed * 0.009) * 0.1;
        entry.root.rotation.y += 0.018;
        entry.ring.scale.setScalar(pulse);
        entry.material.opacity = 0.38 + Math.sin(elapsed * 0.007) * 0.16;
      }
    }
    if (this.cueExpiresAt > 0 && now >= this.cueExpiresAt) this.hideCue();
    this.ensureFrame();
  }

  prune(now) {
    for (const entry of [...this.entries]) {
      if (entry.expiresAt <= now) {
        this.diagnostics.expired += 1;
        this.removeEntry(entry);
      }
    }
  }

  removeEntry(entry) {
    const index = this.entries.indexOf(entry);
    if (index >= 0) this.entries.splice(index, 1);
    if (entry.statusKey && this.statusEntries.get(entry.statusKey) === entry) this.statusEntries.delete(entry.statusKey);
    this.activeParticles = Math.max(0, this.activeParticles - Number(entry.count || 0));
    try { entry.detach?.(); } catch { entry.root?.removeFromParent?.(); }
    entry.geometry?.dispose?.();
    entry.material?.dispose?.();
  }

  showCue(source, title, evidence, lifetimeMs) {
    if (!this.cueElement) return;
    const sourceElement = this.cueElement.querySelector?.("[data-skill-cue-source]");
    const titleElement = this.cueElement.querySelector?.("[data-skill-cue-title]");
    const evidenceElement = this.cueElement.querySelector?.("[data-skill-cue-evidence]");
    if (sourceElement) sourceElement.textContent = cleanDisplayText(source, 64);
    if (titleElement) titleElement.textContent = cleanDisplayText(title, 96);
    if (evidenceElement) evidenceElement.textContent = cleanDisplayText(evidence, 180);
    this.cueElement.hidden = false;
    this.cueElement.classList?.add("is-visible");
    this.cueElement.dataset.source = source.includes("推断") ? "chat-inference" : "server-event";
    this.cueExpiresAt = this.now() + Math.min(5_000, Math.max(900, lifetimeMs));
    this.ensureFrame();
  }

  hideCue() {
    this.cueExpiresAt = 0;
    if (!this.cueElement) return;
    this.cueElement.classList?.remove("is-visible");
    this.cueElement.hidden = true;
    delete this.cueElement.dataset.source;
  }
}

function createPointBurst(count, offset, speed, style, seed) {
  const random = mulberry32(seed);
  const base = new Float32Array(count * 3);
  const velocity = new Float32Array(count * 3);
  for (let index = 0; index < count * 3; index += 3) {
    base[index] = (random() - 0.5) * offset.x;
    base[index + 1] = (random() - 0.2) * offset.y;
    base[index + 2] = (random() - 0.5) * offset.z;
    const lift = 0.00025 + random() * 0.0005;
    const impulse = Math.max(0.00015, speed * 0.00042);
    velocity[index] = (random() - 0.5) * impulse;
    velocity[index + 1] = lift + random() * impulse;
    velocity[index + 2] = (random() - 0.5) * impulse;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(base.slice(), 3));
  const material = new PointsMaterial({
    color: style.color,
    size: style.size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  const root = new Group();
  root.name = "__lantern_server_particle_burst";
  root.add(points);
  return { root, points, geometry, material, base, velocity, dispose: () => { geometry.dispose(); material.dispose(); } };
}

function particleStyle(name) {
  const value = String(name || "").toLowerCase();
  if (/flame|lava|fire|wax_on/u.test(value)) return { color: 0xff9f43, size: 0.16, lifetime: 1_050 };
  if (/soul|sculk|sonic/u.test(value)) return { color: 0x58d8ff, size: 0.18, lifetime: 1_300 };
  if (/witch|portal|enchant|dragon/u.test(value)) return { color: 0xb778ff, size: 0.17, lifetime: 1_450 };
  if (/heart|cherry/u.test(value)) return { color: 0xff7898, size: 0.2, lifetime: 1_350 };
  if (/happy|composter|totem/u.test(value)) return { color: 0x7bea8d, size: 0.16, lifetime: 1_250 };
  if (/crit|damage|sweep/u.test(value)) return { color: 0xfff0a8, size: 0.17, lifetime: 720 };
  if (/smoke|ash|poof/u.test(value)) return { color: 0xa7b0b9, size: 0.2, lifetime: 1_250 };
  if (/bubble|splash|drip|rain/u.test(value)) return { color: 0x6cbcff, size: 0.14, lifetime: 1_150 };
  if (/electric|spark|flash/u.test(value)) return { color: 0xe5f7ff, size: 0.18, lifetime: 680 };
  if (/explosion|firework/u.test(value)) return { color: 0xffd46a, size: 0.22, lifetime: 950 };
  return { color: 0xd8e9df, size: 0.13, lifetime: 1_100 };
}

function burstStyle(style) {
  if (style === "magic_critical") return { color: 0xc57cff, size: 0.18, lifetime: 760, count: 14, speed: 1.7 };
  if (style === "critical") return { color: 0xffefb0, size: 0.17, lifetime: 680, count: 12, speed: 1.5 };
  if (style === "hurt") return { color: 0xff5f57, size: 0.19, lifetime: 620, count: 10, speed: 1.25 };
  if (style === "death") return { color: 0xc0c7cd, size: 0.22, lifetime: 1_150, count: 18, speed: 1.1 };
  return { color: 0xffcc66, size: 0.22, lifetime: 1_200, count: 22, speed: 2.2 };
}

function soundColour(name) {
  const value = String(name || "").toLowerCase();
  if (/attack|hurt|break|explode/u.test(value)) return 0xff796d;
  if (/spell|enchant|portal|teleport/u.test(value)) return 0xb67cff;
  if (/door|button|lever|chest/u.test(value)) return 0xe4c878;
  if (/note|music|bell/u.test(value)) return 0x77dfff;
  return 0x85d7b0;
}

function statusColour(name, id) {
  const value = String(name || "").toLowerCase();
  if (/speed|haste|jump|dolphin/u.test(value)) return 0x63dcff;
  if (/strength|fire|damage/u.test(value)) return 0xff7d58;
  if (/regeneration|health|absorption/u.test(value)) return 0xff78a5;
  if (/poison|hunger|wither/u.test(value)) return 0x6b9144;
  if (/invisibility|night_vision|glowing/u.test(value)) return 0xcbe5ff;
  const hue = ((Number(id) || 0) * 47) % 360;
  return hslToHex(hue, 0.66, 0.62);
}

function normalizePosition(value) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  if (Math.abs(x) > 30_000_000 || Math.abs(z) > 30_000_000 || Math.abs(y) > 4_096) return null;
  return Object.freeze({ x, y, z });
}

function normalizeOffset(value) {
  const position = normalizePosition(value);
  return Object.freeze({
    x: boundedNumber(position?.x, -8, 8, 0.25),
    y: boundedNumber(position?.y, -8, 8, 0.25),
    z: boundedNumber(position?.z, -8, 8, 0.25),
  });
}

function normalizeEntityId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= 2_147_483_647 ? number : null;
}

function normalizeEventName(value, fallback) {
  const cleaned = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim()
    .slice(0, 96);
  return /^[\p{L}\p{N}_:./ -]+$/u.test(cleaned) ? cleaned : fallback;
}

function cleanDisplayText(value, maximum) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maximum);
}

function boundedInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.trunc(number))) : fallback;
}

function boundedNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function hashText(value) {
  let hash = 2_166_136_261;
  for (const symbol of String(value || "")) {
    hash ^= symbol.codePointAt(0) || 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hslToHex(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (segment < 1) [red, green] = [chroma, secondary];
  else if (segment < 2) [red, green] = [secondary, chroma];
  else if (segment < 3) [green, blue] = [chroma, secondary];
  else if (segment < 4) [green, blue] = [secondary, chroma];
  else if (segment < 5) [red, blue] = [secondary, chroma];
  else [red, blue] = [chroma, secondary];
  const match = lightness - chroma / 2;
  return ((Math.round((red + match) * 255) << 16)
    | (Math.round((green + match) * 255) << 8)
    | Math.round((blue + match) * 255)) >>> 0;
}
