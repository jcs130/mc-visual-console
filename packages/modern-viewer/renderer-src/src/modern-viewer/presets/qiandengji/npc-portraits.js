export const CORE_NPC_PORTRAIT_URL = "/npc-portraits/core-trio-anime-v2.png";
export const PROFESSION_NPC_PORTRAIT_URL_A = "/npc-portraits/professions-a.png";
export const PROFESSION_NPC_PORTRAIT_URL_B = "/npc-portraits/professions-b.png";
export const GUOFENG_NPC_PORTRAIT_URL_A = "/npc-portraits/guofeng-a.png";
export const GUOFENG_NPC_PORTRAIT_URL_B = "/npc-portraits/anime-professions-b-v2.png";
export const NAMED_TRAVELLERS_PORTRAIT_URL = "/npc-portraits/named-travellers-fullbody-v3.png";
export const SPECIAL_CAST_PORTRAIT_URL = "/npc-portraits/village-special-cast-anime-v2.png";
export const GUILD_RECEPTIONIST_PORTRAIT_URL = "/npc-portraits/guild-receptionist-lan-fullbody-v3.png";

const CORE_NPC_PORTRAITS = new Map([
  ["npc-955c7244a414c9139448fca9-v1\u0000墨先生", "0%"],
  ["npc-d6364b74e7eb3537406f7538-v1\u0000神官·静水", "50%"],
  ["npc-148ee37f5f20a97561755b54-v1\u0000守夜人·烛九", "100%"],
]);

const NAMED_TRAVELLER_PORTRAITS = new Map([
  ["npc-ebc83899d36711020777c76a-v1\u0000鸣人", portraitCrop(NAMED_TRAVELLERS_PORTRAIT_URL, 2, 0)],
  ["npc-948131665d02111ab1893c3e-v1\u0000桐人", portraitCrop(NAMED_TRAVELLERS_PORTRAIT_URL, 2, 1)],
]);

// These five named villagers previously fell back to the deliberately simple
// Canvas illustrator. Keep their portraits keyed by the trusted id/name pair
// so two leatherworkers can have distinct faces and an entity cannot borrow a
// named character's artwork by changing only its display name.
const SPECIAL_CAST_PORTRAITS = new Map([
  ["npc-ade9c904461d5ab2a929b6c6-v1\u0000灯窝·阿爹", portraitCrop(SPECIAL_CAST_PORTRAIT_URL, 4, 0)],
  ["npc-d004094fb6cffc2fa2cded6f-v1\u0000吟游诗人·风临", portraitCrop(SPECIAL_CAST_PORTRAIT_URL, 4, 1)],
  ["npc-576da7e43b9e56d3a706c5fa-v1\u0000灯窝·穗娘", portraitCrop(SPECIAL_CAST_PORTRAIT_URL, 4, 2)],
  ["npc-b92f03412dc73422337278d0-v1\u0000阿宝", portraitCrop(SPECIAL_CAST_PORTRAIT_URL, 4, 3)],
  ["npc-2135b81dac6bb79e2cd473cf-v1\u0000公会接待员·岚", portraitCrop(GUILD_RECEPTIONIST_PORTRAIT_URL, 1, 0)],
]);

const SCROLL_ARCHETYPE_PORTRAITS = new Map([
  ["farmer", portraitCrop(PROFESSION_NPC_PORTRAIT_URL_A, 4, 0)],
  ["scholar", portraitCrop(PROFESSION_NPC_PORTRAIT_URL_A, 4, 1)],
  ["smith", portraitCrop(PROFESSION_NPC_PORTRAIT_URL_A, 4, 2)],
  ["cartographer", portraitCrop(PROFESSION_NPC_PORTRAIT_URL_A, 4, 3)],
  ["merchant", portraitCrop(PROFESSION_NPC_PORTRAIT_URL_B, 4, 0)],
  ["fisher", portraitCrop(PROFESSION_NPC_PORTRAIT_URL_B, 4, 1)],
  ["shepherd", portraitCrop(PROFESSION_NPC_PORTRAIT_URL_B, 4, 2)],
  ["priest", portraitCrop(PROFESSION_NPC_PORTRAIT_URL_B, 4, 3)],
]);

const GUOFENG_ARCHETYPE_PORTRAITS = new Map([
  ["farmer", portraitCrop(GUOFENG_NPC_PORTRAIT_URL_A, 4, 0)],
  ["scholar", portraitCrop(GUOFENG_NPC_PORTRAIT_URL_A, 4, 1)],
  ["smith", portraitCrop(GUOFENG_NPC_PORTRAIT_URL_A, 4, 2)],
  ["cartographer", portraitCrop(GUOFENG_NPC_PORTRAIT_URL_A, 4, 3)],
  ["merchant", portraitCrop(GUOFENG_NPC_PORTRAIT_URL_B, 4, 0)],
  ["fisher", portraitCrop(GUOFENG_NPC_PORTRAIT_URL_B, 4, 1)],
  ["shepherd", portraitCrop(GUOFENG_NPC_PORTRAIT_URL_B, 4, 2)],
  ["priest", portraitCrop(GUOFENG_NPC_PORTRAIT_URL_B, 4, 3)],
]);

const ARCHETYPE_PRESETS = Object.freeze({
  scholar: preset("#263c78", "#d8c8a5", "#b99345", "scholar", "book", { robe: true }),
  smith: preset("#343a41", "#7e352a", "#dc812d", "smith", "hammer", { beard: true }),
  priest: preset("#236e78", "#b9dddd", "#e5edf0", "water_crown", "censer", { robe: true }),
  merchant: preset("#8d6938", "#5e7651", "#c37b36", "merchant", "pack", { cape: true }),
  tanner: preset("#684233", "#ad7447", "#d5a34e", "fur", "leather", { beard: true }),
  fisher: preset("#294b63", "#c2a879", "#c95f4e", "reed", "fishing_rod", { beard: true }),
  watchman: preset("#292a2e", "#863e2b", "#efb74a", "watch", "lantern", { beard: true, cape: true, robe: true }),
  bard: preset("#2f7681", "#68538b", "#d6ad50", "bard", "lute", { cape: true }),
  farmer: preset("#66513b", "#c5a34e", "#56804b", "straw", "hoe", { beard: true }),
  shepherd: preset("#e1d7c5", "#73a6bd", "#c97883", "flower_scarf", "shepherd_staff"),
  receptionist: preset("#7daec2", "#2c4262", "#d9e4e8", "guild", "clipboard"),
  cartographer: preset("#385f4b", "#d0c398", "#b96e38", "survey", "map"),
  villager: preset("#a87938", "#6f8c4b", "#bc5149", "patched", "windmill"),
  ninja: preset("#e87524", "#1d2f55", "#f2cf55", "leaf_band", "kunai"),
  swordsman: preset("#171b24", "#394357", "#6fd7e8", "black_swordsman", "dual_swords", { robe: true, cape: true }),
  "uchiha-rival": preset("#26314a", "#d9dbe2", "#7f68b7", "black_swordsman", "kunai", { robe: true }),
  "copy-ninja": preset("#30443d", "#1d2730", "#a8b6c4", "leaf_band", "scroll"),
  "yellow-flash": preset("#e8e0cf", "#305a86", "#e7bd45", "leaf_band", "dual_swords", { robe: true, cape: true }),
  "gentle-fist": preset("#d7d2e6", "#6d7295", "#bba7d8", "flower_scarf", "kunai"),
  "medical-ninja": preset("#b84459", "#e6b2ba", "#6b9b69", "stitched_scarf", "censer"),
  taijutsu: preset("#347044", "#25372d", "#d65a4e", "scholar", "kunai"),
  "uchiha-legend": preset("#5e2528", "#20242c", "#9c353c", "watch", "dual_swords", { robe: true, cape: true }),
  "training-avatar": preset("#d9dde3", "#59616d", "#58a6c7", "survey", "clipboard"),
  soldier: preset("#3f5142", "#252e2a", "#9b8d58", "visor", "dual_swords"),
});

const PROFESSION_ARCHETYPES = Object.freeze({
  armorer: "smith",
  butcher: "merchant",
  cartographer: "cartographer",
  cleric: "priest",
  farmer: "farmer",
  fisherman: "fisher",
  fletcher: "merchant",
  leatherworker: "tanner",
  librarian: "scholar",
  mason: "smith",
  shepherd: "shepherd",
  toolsmith: "smith",
  weaponsmith: "smith",
});

const SKIN_TONES = Object.freeze(["#9f694e", "#ad7453", "#bd825d", "#c98f68", "#d5a17a", "#e0ae89"]);
const HAIR_COLORS = Object.freeze(["#181a20", "#242126", "#2b211f", "#342820", "#493229", "#5a3b2b"]);
const HAIR_STYLES = Object.freeze(["short", "long", "braids", "bun", "swept", "spiky"]);

/**
 * Resolve one trusted portrait description. Entity-provided URLs are never
 * inspected or copied: every image URL this module can return comes from the
 * fixed same-origin concept registry below.
 */
export function resolveNpcPortraitSpec(definition, options = {}) {
  if (!isCompleteDefinition(definition)) return null;
  const requestedTheme = options?.theme;
  const theme = requestedTheme === "scroll" || requestedTheme === "pixel" ? requestedTheme : "guofeng";
  const id = definition.id;
  const identityName = definition.identityName;
  const registeredCropPosition = CORE_NPC_PORTRAITS.get(`${id}\u0000${identityName}`) ?? null;
  const namedTravellerCrop = theme !== "pixel"
    ? NAMED_TRAVELLER_PORTRAITS.get(`${id}\u0000${identityName}`) ?? null
    : null;
  const specialCastCrop = theme !== "pixel"
    ? SPECIAL_CAST_PORTRAITS.get(`${id}\u0000${identityName}`) ?? null
    : null;
  const coreIndex = registeredCropPosition === "0%"
    ? 0
    : registeredCropPosition === "50%"
      ? 1
      : registeredCropPosition === "100%"
        ? 2
        : null;
  const usesAuthoredSheet = theme !== "pixel";
  const cropPosition = usesAuthoredSheet ? registeredCropPosition : null;
  const themedPortraits = theme === "scroll" ? SCROLL_ARCHETYPE_PORTRAITS : GUOFENG_ARCHETYPE_PORTRAITS;
  const crop = usesAuthoredSheet
    ? namedTravellerCrop
      ?? specialCastCrop
      ?? (coreIndex !== null
        ? portraitCrop(CORE_NPC_PORTRAIT_URL, 3, coreIndex)
        : themedPortraits.get(definition.archetype) ?? null)
    : null;
  const source = crop !== null
    ? "concept"
    : id.startsWith("npc-portrait-fallback-")
      ? "fallback"
      : "procedural-2d";
  return Object.freeze({
    id,
    identityName,
    theme,
    source,
    portraitUrl: crop?.url ?? null,
    cropPosition,
    portraitCrop: crop,
    definition,
  });
}

/**
 * Turn an otherwise unknown NPC into a bounded, deterministic character
 * definition that can drive the local portrait illustrator.
 */
export function createFallbackNpcPortraitDefinition(profile, entity, archetype) {
  const profileRecord = record(profile);
  const entityRecord = record(entity);
  const identity = record(dataProperty(profileRecord, "identity"));
  const profession = record(dataProperty(profileRecord, "profession"));
  const requestedArchetype = normalizeToken(archetype, 32)
    || PROFESSION_ARCHETYPES[normalizeToken(dataProperty(profession, "key"), 32)]
    || PROFESSION_ARCHETYPES[normalizeToken(dataProperty(profileRecord, "profession"), 32)]
    || "villager";
  const resolvedArchetype = Object.hasOwn(ARCHETYPE_PRESETS, requestedArchetype) ? requestedArchetype : "villager";
  const presetDefinition = ARCHETYPE_PRESETS[resolvedArchetype];
  const candidateIdentityName = cleanText(
    dataProperty(identity, "name")
      ?? dataProperty(profileRecord, "identityName")
      ?? dataProperty(entityRecord, "identityName")
      ?? dataProperty(entityRecord, "customName")
      ?? dataProperty(entityRecord, "displayName")
      ?? dataProperty(entityRecord, "username"),
    96,
  );
  const identityName = candidateIdentityName && !isUnsafeUrlText(candidateIdentityName)
    ? candidateIdentityName
    : "村庄旅人";
  const suppliedKey = normalizeStableKey(
    dataProperty(profileRecord, "key")
      ?? dataProperty(profileRecord, "identityKey")
      ?? dataProperty(entityRecord, "identityKey"),
  );
  const seed = [
    suppliedKey,
    identityName,
    resolvedArchetype,
    cleanText(dataProperty(entityRecord, "uuid"), 96),
    scalarText(dataProperty(entityRecord, "id"), 64),
  ].join("|");
  const hash = stableHash(seed);
  const identityKey = suppliedKey || `npc-portrait-${hash}`;
  const styleSeed = Number.parseInt(hash.slice(0, 8), 16) >>> 0;
  const hairStyle = HAIR_STYLES[(styleSeed >>> 8) % HAIR_STYLES.length];
  const definition = {
    id: `npc-portrait-fallback-${hash}-v1`,
    identityName,
    identityKey,
    archetype: resolvedArchetype,
    palette: Object.freeze({ ...presetDefinition.palette }),
    headgear: presetDefinition.headgear,
    prop: presetDefinition.prop,
    skin: SKIN_TONES[styleSeed % SKIN_TONES.length],
    hair: HAIR_COLORS[(styleSeed >>> 4) % HAIR_COLORS.length],
    eyes: presetDefinition.palette.accent,
    hairStyle,
    beard: presetDefinition.beard || ((styleSeed >>> 13) & 3) === 1,
    cape: presetDefinition.cape,
    robe: presetDefinition.robe,
  };
  return Object.freeze(definition);
}

/**
 * Render a deterministic, locally authored 2D character illustration into a
 * caller-owned canvas. The world renderer keeps using the real entity model;
 * this lightweight canvas exists only for the NPC dossier.
 */
export class NpcPortraitRenderer {
  constructor(canvas, options = {}) {
    if (!canvas || typeof canvas.getContext !== "function") {
      throw new TypeError("NpcPortraitRenderer requires a canvas element");
    }
    this.canvas = canvas;
    this.width = boundedInteger(options.width ?? canvas.width, 96, 1024, 256);
    this.height = boundedInteger(options.height ?? canvas.height, 120, 1280, 320);
    this.pixelRatio = boundedNumber(options.pixelRatio ?? globalThis.devicePixelRatio, 1, 2, 1);
    this.context = null;
    this.disposed = false;
    this.renderCount = 0;
    this.lastSource = null;
    this.lastCharacterId = null;
    this.lastError = null;
  }

  render(definition, entity = {}, options = {}) {
    this.assertUsable();
    const spec = resolveNpcPortraitSpec(definition, options);
    if (!spec) throw new TypeError("NPC portrait definition is incomplete");
    this.lastError = null;
    if (spec.source === "concept") {
      this.clear();
      this.lastSource = spec.source;
      this.lastCharacterId = spec.id;
      return portraitResult(spec, this.width, this.height);
    }

    try {
      const context = this.ensureContext();
      const composition = createNpcPortraitComposition(definition, entity);
      drawNpcPortrait(context, composition, this.width, this.height, this.pixelRatio);
      this.renderCount += 1;
      this.lastSource = spec.source;
      this.lastCharacterId = spec.id;
      return portraitResult(spec, this.width, this.height);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
      throw error;
    }
  }

  clear() {
    if (this.disposed) return;
    if (this.context) {
      this.context.save();
      this.context.setTransform(1, 0, 0, 1, 0, 0);
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.context.restore();
    } else {
      this.canvas.width = Math.round(this.width * this.pixelRatio);
      this.canvas.height = Math.round(this.height * this.pixelRatio);
    }
    this.lastSource = null;
    this.lastCharacterId = null;
  }

  dispose() {
    if (this.disposed) return;
    this.clear();
    this.context = null;
    this.disposed = true;
  }

  getDiagnostics() {
    return Object.freeze({
      disposed: this.disposed,
      initialized: this.context !== null,
      width: this.width,
      height: this.height,
      pixelRatio: this.pixelRatio,
      renderCount: this.renderCount,
      source: this.lastSource,
      characterId: this.lastCharacterId,
      error: this.lastError,
    });
  }

  assertUsable() {
    if (this.disposed) throw new Error("NpcPortraitRenderer has been disposed");
  }

  ensureContext() {
    if (this.context) return this.context;
    try {
      this.canvas.width = Math.round(this.width * this.pixelRatio);
      this.canvas.height = Math.round(this.height * this.pixelRatio);
      const context = this.canvas.getContext("2d", { alpha: true, desynchronized: true });
      if (!context) throw new Error("Canvas 2D context is unavailable");
      context.imageSmoothingEnabled = true;
      this.context = context;
      return context;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
      throw error;
    }
  }
}

/**
 * Produce a serializable art direction record. Keeping this step pure makes
 * every named or inferred NPC stable across reloads and straightforward to
 * regression-test without a browser or GPU.
 */
export function createNpcPortraitComposition(definition, entity = {}) {
  if (!isCompleteDefinition(definition)) throw new TypeError("NPC portrait definition is incomplete");
  const entityRecord = record(entity);
  const seed = Number.parseInt(stableHash(`${definition.identityKey}:${definition.archetype}`).slice(0, 8), 16) >>> 0;
  return Object.freeze({
    id: definition.id,
    identityName: definition.identityName,
    archetype: definition.archetype,
    headgear: definition.headgear,
    prop: definition.prop,
    palette: Object.freeze({ ...definition.palette }),
    skin: definition.skin,
    hair: definition.hair,
    eyes: definition.eyes,
    hairStyle: definition.hairStyle,
    beard: definition.beard,
    cape: definition.cape,
    robe: definition.robe,
    seed,
    variant: seed % 4,
    glance: ((seed >>> 5) % 7 - 3) / 12,
    profession: cleanText(
      dataProperty(record(dataProperty(entityRecord, "villagerAppearance")), "professionLabel")
        ?? dataProperty(entityRecord, "professionLabel"),
      32,
    ),
  });
}

const ARCHETYPE_LABELS = Object.freeze({
  scholar: "学者",
  smith: "锻造师",
  priest: "神官",
  merchant: "行商",
  tanner: "皮匠",
  fisher: "渔夫",
  watchman: "守夜人",
  bard: "吟游诗人",
  farmer: "农人",
  shepherd: "牧羊人",
  receptionist: "公会接待",
  cartographer: "测绘师",
  villager: "村庄居民",
  ninja: "忍者",
  swordsman: "双剑士",
});

const PROP_SIGILS = Object.freeze({
  book: "书",
  hammer: "锻",
  tongs: "铠",
  scroll: "卷",
  censer: "祷",
  pack: "旅",
  leather: "革",
  ink_scroll: "墨",
  fishing_rod: "渔",
  scales: "商",
  lantern: "灯",
  abacus: "市",
  lute: "诗",
  hoe: "禾",
  shepherd_staff: "牧",
  spool: "织",
  windmill: "风",
  clipboard: "会",
  map: "图",
  kunai: "忍",
  dual_swords: "剑",
});

function drawNpcPortrait(context, art, width, height, pixelRatio) {
  const scaleX = (width * pixelRatio) / 640;
  const scaleY = (height * pixelRatio) / 400;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  context.lineJoin = "round";
  context.lineCap = "round";

  drawPortraitBackdrop(context, art);
  drawPortraitCharacter(context, art);
  drawPortraitProp(context, art);
  drawPortraitTypography(context, art);
  drawPortraitFrame(context, art);
  context.restore();
}

function drawPortraitBackdrop(context, art) {
  const background = context.createLinearGradient(0, 0, 640, 400);
  background.addColorStop(0, shadeHex(art.palette.primary, -52));
  background.addColorStop(0.55, shadeHex(art.palette.primary, -82));
  background.addColorStop(1, "#05090b");
  context.fillStyle = background;
  context.fillRect(0, 0, 640, 400);

  const halo = context.createRadialGradient(330, 135, 18, 330, 160, 230);
  halo.addColorStop(0, rgba(art.palette.accent, 0.58));
  halo.addColorStop(0.34, rgba(art.palette.primary, 0.34));
  halo.addColorStop(1, rgba("#020606", 0));
  context.fillStyle = halo;
  context.fillRect(60, 0, 560, 390);

  context.save();
  context.globalAlpha = 0.2;
  context.strokeStyle = art.palette.secondary;
  context.lineWidth = 1;
  for (let index = 0; index < 8; index += 1) {
    const radius = 86 + index * 22;
    context.beginPath();
    context.arc(332, 160, radius, Math.PI * 1.08, Math.PI * 1.92);
    context.stroke();
  }
  context.restore();

  for (let index = 0; index < 34; index += 1) {
    const x = 18 + seededUnit(art.seed, index * 2) * 604;
    const y = 16 + seededUnit(art.seed, index * 2 + 1) * 330;
    const radius = index % 7 === 0 ? 2.2 : 1.1;
    context.beginPath();
    context.fillStyle = rgba(index % 3 === 0 ? art.palette.accent : art.palette.secondary, 0.22 + (index % 4) * 0.07);
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.save();
  context.translate(42, 250);
  context.rotate(-0.22);
  context.fillStyle = rgba(art.palette.secondary, 0.055);
  for (let row = 0; row < 4; row += 1) context.fillRect(0, row * 19, 170, 2);
  context.restore();
}

function drawPortraitCharacter(context, art) {
  const centerX = 322 + [-13, -4, 6, 13][art.variant];
  const faceY = 151;

  drawHairBack(context, art, centerX, faceY);

  if (art.cape) {
    context.beginPath();
    context.moveTo(centerX - 108, 235);
    context.bezierCurveTo(centerX - 160, 267, centerX - 168, 344, centerX - 183, 405);
    context.lineTo(centerX + 171, 405);
    context.bezierCurveTo(centerX + 150, 338, centerX + 140, 270, centerX + 102, 235);
    context.closePath();
    const cape = context.createLinearGradient(centerX - 150, 240, centerX + 150, 390);
    cape.addColorStop(0, shadeHex(art.palette.secondary, -24));
    cape.addColorStop(0.55, art.palette.secondary);
    cape.addColorStop(1, shadeHex(art.palette.secondary, -48));
    context.fillStyle = cape;
    context.fill();
  }

  context.beginPath();
  context.moveTo(centerX - 177, 400);
  context.bezierCurveTo(centerX - 167, 310, centerX - 116, 265, centerX - 62, 250);
  context.lineTo(centerX + 62, 250);
  context.bezierCurveTo(centerX + 121, 266, centerX + 166, 316, centerX + 180, 400);
  context.closePath();
  const robe = context.createLinearGradient(centerX - 140, 265, centerX + 150, 400);
  robe.addColorStop(0, shadeHex(art.palette.primary, 22));
  robe.addColorStop(0.42, art.palette.primary);
  robe.addColorStop(1, shadeHex(art.palette.primary, -36));
  context.fillStyle = robe;
  context.shadowColor = rgba("#000000", 0.55);
  context.shadowBlur = 22;
  context.fill();
  context.shadowBlur = 0;

  context.beginPath();
  context.moveTo(centerX - 78, 259);
  context.quadraticCurveTo(centerX, 314, centerX + 78, 259);
  context.lineTo(centerX + 47, 400);
  context.lineTo(centerX - 47, 400);
  context.closePath();
  context.fillStyle = art.robe ? rgba(art.palette.secondary, 0.72) : rgba(art.palette.secondary, 0.42);
  context.fill();

  context.fillStyle = art.skin;
  roundedRectPath(context, centerX - 25, 217, 50, 57, 18);
  context.fill();

  context.beginPath();
  context.ellipse(centerX - 71, faceY + 19, 15, 23, -0.06, 0, Math.PI * 2);
  context.ellipse(centerX + 71, faceY + 19, 15, 23, 0.06, 0, Math.PI * 2);
  context.fillStyle = shadeHex(art.skin, -10);
  context.fill();

  context.beginPath();
  context.ellipse(centerX, faceY, 73, 88, 0, 0, Math.PI * 2);
  const face = context.createLinearGradient(centerX - 62, faceY - 48, centerX + 65, faceY + 70);
  face.addColorStop(0, shadeHex(art.skin, 18));
  face.addColorStop(0.5, art.skin);
  face.addColorStop(1, shadeHex(art.skin, -20));
  context.fillStyle = face;
  context.shadowColor = rgba(art.palette.accent, 0.2);
  context.shadowBlur = 16;
  context.fill();
  context.shadowBlur = 0;

  drawHairFront(context, art, centerX, faceY);
  drawFace(context, art, centerX, faceY);
  if (art.beard) drawPortraitBeard(context, art, centerX, faceY);
  drawPortraitHeadgear(context, art, centerX, faceY);

  context.beginPath();
  context.arc(centerX, 269, 10, 0, Math.PI * 2);
  context.fillStyle = art.palette.accent;
  context.shadowColor = art.palette.accent;
  context.shadowBlur = 12;
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = rgba("#fff7d6", 0.7);
  context.lineWidth = 2;
  context.stroke();
}

function drawHairBack(context, art, centerX, faceY) {
  if (!["long", "braids", "bun"].includes(art.hairStyle)) return;
  context.fillStyle = shadeHex(art.hair, -8);
  if (art.hairStyle === "long") {
    roundedRectPath(context, centerX - 77, faceY - 55, 154, 214, 62);
    context.fill();
  } else if (art.hairStyle === "braids") {
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(centerX + side * 57, faceY + 24);
      context.bezierCurveTo(centerX + side * 94, faceY + 72, centerX + side * 73, faceY + 135, centerX + side * 95, faceY + 174);
      context.lineWidth = 18;
      context.strokeStyle = art.hair;
      context.stroke();
      for (let knot = 0; knot < 4; knot += 1) {
        context.beginPath();
        context.ellipse(centerX + side * (71 + knot * 5), faceY + 67 + knot * 26, 12, 9, side * 0.28, 0, Math.PI * 2);
        context.fill();
      }
    }
  } else {
    context.beginPath();
    context.arc(centerX + 38, faceY - 83, 29, 0, Math.PI * 2);
    context.fill();
  }
}

function drawHairFront(context, art, centerX, faceY) {
  context.fillStyle = art.hair;
  context.beginPath();
  context.moveTo(centerX - 66, faceY - 35);
  context.bezierCurveTo(centerX - 57, faceY - 100, centerX + 58, faceY - 101, centerX + 68, faceY - 34);
  if (art.hairStyle === "swept") {
    context.bezierCurveTo(centerX + 23, faceY - 62, centerX - 5, faceY - 48, centerX - 30, faceY - 22);
  } else {
    context.bezierCurveTo(centerX + 30, faceY - 54, centerX - 22, faceY - 45, centerX - 66, faceY - 35);
  }
  context.closePath();
  context.fill();

  if (art.hairStyle === "long") {
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(centerX + side * 61, faceY - 25);
      context.quadraticCurveTo(centerX + side * 78, faceY + 55, centerX + side * 60, faceY + 110);
      context.lineWidth = 20;
      context.strokeStyle = art.hair;
      context.stroke();
    }
  }
}

function drawFace(context, art, centerX, faceY) {
  const eyeY = faceY + 2;
  const glance = art.glance * 7;
  for (const side of [-1, 1]) {
    const x = centerX + side * 28;
    context.beginPath();
    context.moveTo(x - 13, eyeY - 13);
    context.quadraticCurveTo(x, eyeY - 19 + (side * art.glance * 2), x + 14, eyeY - 12);
    context.strokeStyle = shadeHex(art.hair, 8);
    context.lineWidth = 5;
    context.stroke();
    context.beginPath();
    context.ellipse(x, eyeY, 13, 8, 0, 0, Math.PI * 2);
    context.fillStyle = "#fff7e9";
    context.fill();
    context.beginPath();
    context.arc(x + glance, eyeY, 4.8, 0, Math.PI * 2);
    context.fillStyle = art.eyes;
    context.fill();
    context.beginPath();
    context.arc(x + glance, eyeY, 2.2, 0, Math.PI * 2);
    context.fillStyle = shadeHex(art.eyes, -70);
    context.fill();
  }

  context.beginPath();
  context.moveTo(centerX - 2, faceY + 8);
  context.quadraticCurveTo(centerX - 9, faceY + 31, centerX + 2, faceY + 37);
  context.quadraticCurveTo(centerX + 11, faceY + 39, centerX + 14, faceY + 34);
  context.strokeStyle = rgba(shadeHex(art.skin, -48), 0.62);
  context.lineWidth = 2.3;
  context.stroke();

  context.beginPath();
  context.moveTo(centerX - 17, faceY + 56);
  context.quadraticCurveTo(centerX, faceY + 64 + art.variant, centerX + 20, faceY + 54);
  context.strokeStyle = shadeHex(art.skin, -62);
  context.lineWidth = 3;
  context.stroke();

  context.fillStyle = rgba(shadeHex(art.skin, 24), 0.35);
  context.beginPath();
  context.ellipse(centerX - 43, faceY + 35, 18, 8, -0.1, 0, Math.PI * 2);
  context.ellipse(centerX + 43, faceY + 35, 18, 8, 0.1, 0, Math.PI * 2);
  context.fill();
}

function drawPortraitBeard(context, art, centerX, faceY) {
  context.beginPath();
  context.moveTo(centerX - 42, faceY + 46);
  context.quadraticCurveTo(centerX - 33, faceY + 104, centerX, faceY + 119);
  context.quadraticCurveTo(centerX + 39, faceY + 97, centerX + 44, faceY + 45);
  context.quadraticCurveTo(centerX + 12, faceY + 72, centerX, faceY + 64);
  context.quadraticCurveTo(centerX - 13, faceY + 72, centerX - 42, faceY + 46);
  context.fillStyle = rgba(art.hair, 0.9);
  context.fill();
  context.strokeStyle = rgba(shadeHex(art.hair, 34), 0.5);
  context.lineWidth = 2;
  for (let offset = -22; offset <= 22; offset += 11) {
    context.beginPath();
    context.moveTo(centerX + offset, faceY + 70);
    context.lineTo(centerX + offset * 0.55, faceY + 102 - Math.abs(offset) * 0.3);
    context.stroke();
  }
}

function drawPortraitHeadgear(context, art, centerX, faceY) {
  const kind = art.headgear;
  context.save();
  context.shadowColor = rgba("#000000", 0.5);
  context.shadowBlur = 8;
  if (["scholar", "cloud", "tall_scholar"].includes(kind)) {
    context.fillStyle = art.palette.primary;
    roundedRectPath(context, centerX - (kind === "tall_scholar" ? 46 : 65), faceY - 113, kind === "tall_scholar" ? 92 : 130, kind === "tall_scholar" ? 70 : 47, 12);
    context.fill();
    context.fillStyle = art.palette.accent;
    roundedRectPath(context, centerX - 88, faceY - 75, 176, 14, 7);
    context.fill();
  } else if (["smith", "visor"].includes(kind)) {
    context.strokeStyle = art.palette.secondary;
    context.lineWidth = 15;
    context.beginPath();
    context.arc(centerX, faceY - 54, 65, Math.PI * 1.05, Math.PI * 1.95);
    context.stroke();
    context.fillStyle = art.palette.accent;
    for (const side of [-1, 1]) {
      roundedRectPath(context, centerX + side * 23 - 17, faceY - 73, 34, 21, 8);
      context.fill();
    }
    if (kind === "visor") {
      context.fillStyle = rgba(art.palette.secondary, 0.92);
      roundedRectPath(context, centerX - 59, faceY - 38, 118, 28, 7);
      context.fill();
    }
  } else if (kind === "water_crown") {
    context.strokeStyle = art.palette.secondary;
    context.lineWidth = 10;
    context.beginPath();
    context.moveTo(centerX - 64, faceY - 63);
    context.lineTo(centerX - 42, faceY - 102);
    context.lineTo(centerX - 17, faceY - 70);
    context.lineTo(centerX, faceY - 119);
    context.lineTo(centerX + 19, faceY - 70);
    context.lineTo(centerX + 46, faceY - 103);
    context.lineTo(centerX + 66, faceY - 62);
    context.stroke();
    context.beginPath();
    context.arc(centerX, faceY - 85, 8, 0, Math.PI * 2);
    context.fillStyle = art.palette.accent;
    context.fill();
  } else if (["merchant", "coin", "shopkeeper", "bard", "straw", "reed", "watch"].includes(kind)) {
    context.fillStyle = kind === "straw" || kind === "reed" ? art.palette.secondary : art.palette.primary;
    context.beginPath();
    context.ellipse(centerX, faceY - 69, kind === "watch" ? 99 : 86, 17, 0, 0, Math.PI * 2);
    context.fill();
    const crown = context.createLinearGradient(centerX, faceY - 124, centerX, faceY - 62);
    crown.addColorStop(0, shadeHex(art.palette.primary, 18));
    crown.addColorStop(1, art.palette.primary);
    context.fillStyle = crown;
    roundedRectPath(context, centerX - 50, faceY - 121, 100, 58, 16);
    context.fill();
    if (kind === "watch") {
      context.fillStyle = art.palette.accent;
      context.fillRect(centerX - 51, faceY - 84, 102, 9);
    }
  } else if (["flower_scarf", "stitched_scarf"].includes(kind)) {
    context.fillStyle = art.palette.primary;
    context.beginPath();
    context.arc(centerX, faceY - 43, 73, Math.PI * 1.08, Math.PI * 1.92);
    context.lineTo(centerX + 57, faceY - 15);
    context.quadraticCurveTo(centerX, faceY - 55, centerX - 58, faceY - 15);
    context.closePath();
    context.fill();
    if (kind === "flower_scarf") {
      context.fillStyle = art.palette.accent;
      for (let petal = 0; petal < 5; petal += 1) {
        const angle = petal * Math.PI * 2 / 5;
        context.beginPath();
        context.ellipse(centerX - 54 + Math.cos(angle) * 10, faceY - 54 + Math.sin(angle) * 10, 8, 4, angle, 0, Math.PI * 2);
        context.fill();
      }
    }
  } else {
    context.fillStyle = art.palette.primary;
    context.beginPath();
    context.moveTo(centerX - 76, faceY - 57);
    context.quadraticCurveTo(centerX - 28, faceY - 118, centerX + 69, faceY - 71);
    context.lineTo(centerX + 60, faceY - 47);
    context.quadraticCurveTo(centerX, faceY - 78, centerX - 68, faceY - 34);
    context.closePath();
    context.fill();
    context.fillStyle = art.palette.secondary;
    roundedRectPath(context, centerX - 60, faceY - 60, 120, 10, 5);
    context.fill();
  }
  context.restore();
}

function drawPortraitProp(context, art) {
  const x = art.variant % 2 === 0 ? 542 : 104;
  const y = 230;
  const glow = context.createRadialGradient(x, y, 6, x, y, 62);
  glow.addColorStop(0, rgba(art.palette.accent, 0.42));
  glow.addColorStop(1, rgba(art.palette.accent, 0));
  context.fillStyle = glow;
  context.fillRect(x - 70, y - 70, 140, 140);

  context.beginPath();
  context.arc(x, y, 43, 0, Math.PI * 2);
  context.fillStyle = rgba("#071011", 0.78);
  context.fill();
  context.strokeStyle = rgba(art.palette.accent, 0.82);
  context.lineWidth = 2;
  context.stroke();
  context.beginPath();
  context.arc(x, y, 34, 0, Math.PI * 2);
  context.strokeStyle = rgba(art.palette.secondary, 0.35);
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = "#fff0c5";
  context.font = '700 27px Georgia,"Microsoft YaHei",serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(PROP_SIGILS[art.prop] || "旅", x, y + 1);
}

function drawPortraitTypography(context, art) {
  const role = art.profession || ARCHETYPE_LABELS[art.archetype] || "村庄角色";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = rgba("#f7e8bf", 0.72);
  context.font = '600 11px "Segoe UI","Microsoft YaHei",sans-serif';
  context.fillText("灯火人物志 · LOCAL CHARACTER ARCHIVE", 24, 29);
  context.fillStyle = "#fff4d8";
  context.shadowColor = rgba("#000000", 0.8);
  context.shadowBlur = 8;
  context.font = '700 29px Georgia,"Microsoft YaHei",serif';
  context.fillText(art.identityName, 24, 67, 250);
  context.shadowBlur = 0;
  context.fillStyle = rgba(art.palette.secondary, 0.9);
  context.font = '600 13px "Segoe UI","Microsoft YaHei",sans-serif';
  context.fillText(role, 26, 91, 220);
}

function drawPortraitFrame(context, art) {
  const vignette = context.createRadialGradient(320, 180, 150, 320, 200, 390);
  vignette.addColorStop(0, rgba("#000000", 0));
  vignette.addColorStop(1, rgba("#000000", 0.62));
  context.fillStyle = vignette;
  context.fillRect(0, 0, 640, 400);
  const lower = context.createLinearGradient(0, 300, 0, 400);
  lower.addColorStop(0, rgba("#020607", 0));
  lower.addColorStop(1, rgba("#020607", 0.82));
  context.fillStyle = lower;
  context.fillRect(0, 295, 640, 105);
  context.strokeStyle = rgba(art.palette.accent, 0.32);
  context.lineWidth = 2;
  roundedRectPath(context, 9, 9, 622, 382, 16);
  context.stroke();
  context.strokeStyle = rgba("#ffffff", 0.08);
  context.lineWidth = 1;
  roundedRectPath(context, 14, 14, 612, 372, 13);
  context.stroke();
}

function roundedRectPath(context, x, y, width, height, radius) {
  const resolved = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + resolved, y);
  context.lineTo(x + width - resolved, y);
  context.quadraticCurveTo(x + width, y, x + width, y + resolved);
  context.lineTo(x + width, y + height - resolved);
  context.quadraticCurveTo(x + width, y + height, x + width - resolved, y + height);
  context.lineTo(x + resolved, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - resolved);
  context.lineTo(x, y + resolved);
  context.quadraticCurveTo(x, y, x + resolved, y);
  context.closePath();
}

function seededUnit(seed, index) {
  let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value / 0xffffffff;
}

function rgba(hex, alpha) {
  const value = Number.parseInt(String(hex).slice(1), 16);
  const red = (value >>> 16) & 0xff;
  const green = (value >>> 8) & 0xff;
  const blue = value & 0xff;
  return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, Number(alpha) || 0))})`;
}

function portraitResult(spec, width, height) {
  return Object.freeze({
    id: spec.id,
    identityName: spec.identityName,
    theme: spec.theme,
    source: spec.source,
    portraitUrl: spec.portraitUrl,
    cropPosition: spec.cropPosition,
    portraitCrop: spec.portraitCrop,
    width,
    height,
  });
}

function portraitCrop(url, columns, index) {
  return Object.freeze({ url, columns, index });
}

function preset(primary, secondary, accent, headgear, prop, details = {}) {
  return Object.freeze({
    palette: Object.freeze({ primary, secondary, accent }),
    headgear,
    prop,
    beard: details.beard === true,
    cape: details.cape === true,
    robe: details.robe === true,
  });
}

function isCompleteDefinition(value) {
  const source = record(value);
  const palette = record(dataProperty(source, "palette"));
  return normalizeStableKey(dataProperty(source, "id")) === dataProperty(source, "id")
    && cleanText(dataProperty(source, "identityName"), 96) === dataProperty(source, "identityName")
    && !isUnsafeUrlText(dataProperty(source, "identityName"))
    && normalizeStableKey(dataProperty(source, "identityKey")) !== ""
    && Object.hasOwn(ARCHETYPE_PRESETS, normalizeToken(dataProperty(source, "archetype"), 32))
    && isHexColor(dataProperty(palette, "primary"))
    && isHexColor(dataProperty(palette, "secondary"))
    && isHexColor(dataProperty(palette, "accent"))
    && normalizeToken(dataProperty(source, "headgear"), 32) !== ""
    && normalizeToken(dataProperty(source, "prop"), 32) !== ""
    && isHexColor(dataProperty(source, "skin"))
    && isHexColor(dataProperty(source, "hair"))
    && isHexColor(dataProperty(source, "eyes"))
    && HAIR_STYLES.includes(dataProperty(source, "hairStyle"))
    && typeof dataProperty(source, "beard") === "boolean"
    && typeof dataProperty(source, "cape") === "boolean"
    && typeof dataProperty(source, "robe") === "boolean";
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value);
}

function normalizeToken(value, maximumLength) {
  const text = cleanText(value, maximumLength).toLowerCase();
  return /^[a-z][a-z0-9_-]*$/u.test(text) ? text : "";
}

function normalizeStableKey(value) {
  const text = cleanText(value, 128).toLowerCase();
  return /^[a-z0-9][a-z0-9:._-]{0,127}$/u.test(text) && !isUnsafeUrlText(text) ? text : "";
}

function isUnsafeUrlText(value) {
  return typeof value === "string" && /^(?:https?|javascript|data|file|blob):/iu.test(value.trim());
}

function cleanText(value, maximumLength) {
  if (typeof value !== "string") return "";
  return [...value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()]
    .slice(0, maximumLength)
    .join("");
}

function scalarText(value, maximumLength) {
  if (typeof value === "string") return cleanText(value, maximumLength);
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, maximumLength);
  return "";
}

function stableHash(value) {
  let first = 2_166_136_261;
  let second = 2_246_822_519;
  for (const symbol of String(value)) {
    const code = symbol.codePointAt(0) || 0;
    first = Math.imul(first ^ code, 16_777_619) >>> 0;
    second = Math.imul(second ^ (code + 0x9e37), 32_648_991) >>> 0;
  }
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

function boundedInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(number)));
}

function boundedNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function shadeHex(hex, amount) {
  const value = Number.parseInt(String(hex).slice(1), 16);
  const channel = (shift) => Math.max(0, Math.min(255, ((value >>> shift) & 0xff) + amount));
  return `#${[channel(16), channel(8), channel(0)]
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("")}`;
}

function dataProperty(value, key) {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
