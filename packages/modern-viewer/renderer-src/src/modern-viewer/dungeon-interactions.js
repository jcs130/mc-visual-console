import { canonicalEntityName } from "./viewer-runtime.js";
import { resolveNamedPlayerCharacterIdentity } from "./named-character-identities.js";

const HOSTILE_NAMES = new Set([
  "blaze",
  "bogged",
  "breeze",
  "cave_spider",
  "creeper",
  "drowned",
  "elder_guardian",
  "enderman",
  "endermite",
  "evoker",
  "ghast",
  "guardian",
  "husk",
  "magma_cube",
  "phantom",
  "piglin_brute",
  "pillager",
  "ravager",
  "shulker",
  "silverfish",
  "skeleton",
  "slime",
  "spider",
  "stray",
  "vex",
  "vindicator",
  "warden",
  "witch",
  "wither",
  "wither_skeleton",
  "zoglin",
  "zombie",
  "zombie_villager",
]);

const NPC_NAMES = new Set(["npc", "villager", "wandering_trader"]);
const HOSTILE_KINDS = new Set(["enemy", "hostile", "monster"]);
const PLAYER_NAMES = new Set(["player"]);
const PROTECTED_KINDS = new Set(["animal", "npc", "passive", "player"]);
const PROTECTED_ENTITY_NAMES = new Set([
  "allay",
  "armadillo",
  "axolotl",
  "bat",
  "bee",
  "camel",
  "cat",
  "chicken",
  "cod",
  "cow",
  "dolphin",
  "donkey",
  "fox",
  "frog",
  "glow_squid",
  "goat",
  "hoglin",
  "horse",
  "iron_golem",
  "llama",
  "mooshroom",
  "mule",
  "ocelot",
  "panda",
  "parrot",
  "pig",
  "polar_bear",
  "pufferfish",
  "rabbit",
  "salmon",
  "sheep",
  "skeleton_horse",
  "sniffer",
  "snow_golem",
  "squid",
  "strider",
  "tadpole",
  "trader_llama",
  "tropical_fish",
  "turtle",
  "wolf",
  "zombie_horse",
]);
const INTERACTION_CATEGORIES = new Set(["npc", "hostile", "other", "unavailable"]);
const INTERACTION_ACTIONS = new Set(["view", "attack", "details", "none"]);

const ENTITY_LABELS = Object.freeze({
  allay: "悦灵",
  armor_stand: "盔甲架",
  bat: "蝙蝠",
  bee: "蜜蜂",
  blaze: "烈焰人",
  bogged: "沼骸",
  breeze: "旋风人",
  cave_spider: "洞穴蜘蛛",
  chicken: "鸡",
  cow: "牛",
  creeper: "苦力怕",
  drowned: "溺尸",
  elder_guardian: "远古守卫者",
  enderman: "末影人",
  endermite: "末影螨",
  evoker: "唤魔者",
  fox: "狐狸",
  frog: "青蛙",
  ghast: "恶魂",
  goat: "山羊",
  guardian: "守卫者",
  hoglin: "疣猪兽",
  horse: "马",
  husk: "尸壳",
  iron_golem: "铁傀儡",
  item: "掉落物",
  item_frame: "物品展示框",
  magma_cube: "岩浆怪",
  panda: "熊猫",
  phantom: "幻翼",
  pig: "猪",
  piglin_brute: "猪灵蛮兵",
  pillager: "掠夺者",
  player: "玩家",
  rabbit: "兔子",
  ravager: "劫掠兽",
  sheep: "羊",
  shulker: "潜影贝",
  silverfish: "蠹虫",
  skeleton: "骷髅",
  slime: "史莱姆",
  spider: "蜘蛛",
  squid: "鱿鱼",
  stray: "流浪者",
  turtle: "海龟",
  vex: "恼鬼",
  villager: "村民",
  vindicator: "卫道士",
  wandering_trader: "流浪商人",
  warden: "监守者",
  witch: "女巫",
  wither: "凋灵",
  wither_skeleton: "凋灵骷髅",
  wolf: "狼",
  zoglin: "僵尸疣猪兽",
  zombie: "僵尸",
  zombie_villager: "僵尸村民",
});

/**
 * Purely classify the interaction offered by one streamed entity. This is UI
 * intent data only: an "attack" result does not bypass manual-control or PVE
 * policy checks and players are never classified as attackable.
 */
export function classifyDungeonInteraction(entity) {
  const source = record(entity);
  if (source === EMPTY_RECORD || !hasEntitySignal(source)) return unavailableInteraction("invalid");

  const unavailableReason = entityUnavailableReason(source);
  if (unavailableReason) return unavailableInteraction(unavailableReason);

  const name = canonicalEntityName(dataProperty(source, "name") ?? dataProperty(source, "entityType"));
  const kinds = new Set([
    canonicalEntityName(dataProperty(source, "kind")),
    canonicalEntityName(dataProperty(source, "type")),
  ].filter(Boolean));
  const identityName = cleanLabel(dataProperty(source, "identityName"), 96);
  const isPlayer = PLAYER_NAMES.has(name) || kinds.has("player");
  const namedPlayerIdentity = name === "player"
    ? resolveNamedPlayerCharacterIdentity({
      name,
      username: dataProperty(source, "username"),
      displayName: dataProperty(source, "displayName"),
    })
    : null;

  // Protected identities always win over hostile-looking protocol flags.
  // Custom servers often report named NPCs as unknown hostile mobs, and a
  // stale `hostile: true` must never turn players, animals or golems into an
  // attack affordance.
  if (namedPlayerIdentity || NPC_NAMES.has(name) || kinds.has("npc") || (identityName && !isPlayer)) {
    return interaction("npc", "view", true, false, "pointer", "friendly", null);
  }
  if (isProtectedEntity(name, kinds, isPlayer)) {
    return interaction("other", "details", true, false, "help", "neutral", null);
  }
  if (!isPlayer && isHostileEntity(source, name, kinds)) {
    return interaction("hostile", "attack", false, true, "crosshair", "danger", null);
  }
  return interaction("other", "details", true, false, "help", "neutral", null);
}

/** Return whether a render-visible entity should participate in hover picking. */
export function isDungeonInteractionCandidate(entity) {
  return classifyDungeonInteraction(entity).category !== "unavailable";
}

/**
 * Build bounded, plain-text data for the hover chip. An optional classification
 * can be reused by the caller; malformed foreign objects are ignored.
 */
export function createDungeonHoverLabel(entity, classifiedInteraction) {
  const source = record(entity);
  const classification = isInteraction(classifiedInteraction)
    ? classifiedInteraction
    : classifyDungeonInteraction(entity);
  if (classification.category === "unavailable") {
    return Object.freeze({
      visible: false,
      entityId: entityId(source),
      title: "",
      subtitle: "",
      badge: "不可交互",
      actionLabel: "",
      category: classification.category,
      action: classification.action,
      tone: classification.tone,
      cursor: classification.cursor,
      canAttack: false,
      ariaLabel: "",
    });
  }

  const name = canonicalEntityName(dataProperty(source, "name") ?? dataProperty(source, "entityType"));
  const title = entityDisplayName(source, name);
  const distance = finiteBoundedNumber(dataProperty(source, "distance"), 0, 4_096);
  const health = finiteBoundedNumber(dataProperty(source, "health"), 0, 2_048);
  const distanceText = distance === null ? "" : `${formatNumber(distance)} 格`;
  const healthText = health === null ? "" : `生命 ${formatNumber(health)}`;
  const presentation = categoryPresentation(classification.category);
  const details = [presentation.subtitle, classification.category === "hostile" ? healthText : "", distanceText].filter(Boolean);
  const subtitle = details.join(" · ");
  const ariaLabel = [title, presentation.actionLabel, distanceText].filter(Boolean).join("，");

  return Object.freeze({
    visible: true,
    entityId: entityId(source),
    title,
    subtitle,
    badge: presentation.badge,
    actionLabel: presentation.actionLabel,
    category: classification.category,
    action: classification.action,
    tone: classification.tone,
    cursor: classification.cursor,
    canAttack: classification.canAttack,
    ariaLabel,
  });
}

function categoryPresentation(category) {
  if (category === "npc") return { badge: "NPC", actionLabel: "查看", subtitle: "点击查看角色档案" };
  if (category === "hostile") return { badge: "敌对", actionLabel: "攻击", subtitle: "敌对生物 · 点击攻击" };
  return { badge: "实体", actionLabel: "详情", subtitle: "点击查看详情 · 不可攻击" };
}

function entityDisplayName(source, canonicalName) {
  const identityName = cleanLabel(dataProperty(source, "identityName"), 96);
  if (identityName) return identityName;
  if (canonicalName === "player") {
    const username = cleanLabel(dataProperty(source, "username"), 64);
    if (username) return username;
  }
  const localized = ENTITY_LABELS[canonicalName];
  if (localized) return localized;
  const displayName = cleanLabel(dataProperty(source, "displayName"), 96);
  if (displayName) return displayName;
  const username = cleanLabel(dataProperty(source, "username"), 64);
  if (username) return username;
  if (!canonicalName || canonicalName === "unknown") return "未知实体";
  return cleanLabel(canonicalName.replaceAll("_", " "), 96) || "未知实体";
}

function isHostileEntity(source, name, kinds) {
  if (!name || name === "unknown") return false;
  // The browser only advertises attack for the same explicit vanilla name
  // allow-list enforced by the runtime. A custom/unknown "monster" stays
  // view-only even if a server-provided flag claims it is hostile.
  return HOSTILE_NAMES.has(name)
    && (dataProperty(source, "hostile") === true || [...kinds].some((kind) => HOSTILE_KINDS.has(kind)));
}

function isProtectedEntity(name, kinds, isPlayer) {
  return isPlayer
    || !name
    || name === "unknown"
    || [...kinds].some((kind) => PROTECTED_KINDS.has(kind))
    || PROTECTED_ENTITY_NAMES.has(name)
    || name.endsWith("_golem");
}

function entityUnavailableReason(source) {
  if (dataProperty(source, "isSelf") === true) return "self";
  if (
    dataProperty(source, "delete") === true
    || dataProperty(source, "deleted") === true
    || dataProperty(source, "removed") === true
  ) return "removed";
  if (dataProperty(source, "dead") === true) return "dead";
  const health = finiteBoundedNumber(dataProperty(source, "health"), -2_048, 2_048);
  if (health !== null && health <= 0) return "dead";
  if (
    dataProperty(source, "invisible") === true
    || dataProperty(source, "isInvisible") === true
    || protocolInvisible(dataProperty(source, "metadata"))
  ) return "invisible";
  return null;
}

function protocolInvisible(metadata) {
  let flags = Array.isArray(metadata)
    ? dataProperty(metadata, "0")
    : dataProperty(record(metadata), "0");
  for (let depth = 0; depth < 4 && flags && typeof flags === "object"; depth += 1) {
    flags = dataProperty(flags, "value");
  }
  const number = Number(flags);
  return Number.isFinite(number) && (number & 0x20) !== 0;
}

function interaction(category, action, canView, canAttack, cursor, tone, reason) {
  return Object.freeze({ category, action, canView, canAttack, cursor, tone, reason });
}

function unavailableInteraction(reason) {
  return interaction("unavailable", "none", false, false, "default", "muted", reason);
}

function isInteraction(value) {
  const source = record(value);
  const category = dataProperty(source, "category");
  const action = dataProperty(source, "action");
  if (!INTERACTION_CATEGORIES.has(category) || !INTERACTION_ACTIONS.has(action)) return false;
  const expected = category === "npc"
    ? ["view", true, false, "pointer", "friendly"]
    : category === "hostile"
      ? ["attack", false, true, "crosshair", "danger"]
      : category === "other"
        ? ["details", true, false, "help", "neutral"]
        : ["none", false, false, "default", "muted"];
  return action === expected[0]
    && dataProperty(source, "canView") === expected[1]
    && dataProperty(source, "canAttack") === expected[2]
    && dataProperty(source, "cursor") === expected[3]
    && dataProperty(source, "tone") === expected[4];
}

function hasEntitySignal(source) {
  return dataProperty(source, "id") !== undefined
    || typeof dataProperty(source, "name") === "string"
    || typeof dataProperty(source, "entityType") === "string"
    || typeof dataProperty(source, "kind") === "string"
    || typeof dataProperty(source, "type") === "string"
    || typeof dataProperty(source, "identityName") === "string";
}

function entityId(source) {
  const value = dataProperty(source, "id");
  if (typeof value === "string") return cleanLabel(value, 64) || null;
  return typeof value === "number" && Number.isSafeInteger(value) ? String(value) : null;
}

function cleanLabel(value, maximumLength) {
  if (typeof value !== "string") return "";
  const cleaned = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, " ")
    .replace(/<[^>\r\n]{0,256}>/gu, " ")
    .replaceAll("&", "＆")
    .replaceAll("<", "＜")
    .replaceAll(">", "＞")
    .replaceAll('"', "＂")
    .replaceAll("'", "＇")
    .replaceAll("`", "｀")
    .replace(/\s+/gu, " ")
    .trim();
  return [...cleaned].slice(0, maximumLength).join("");
}

function finiteBoundedNumber(value, minimum, maximum) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(value.trim())) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(minimum, Math.min(maximum, number));
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/u, "");
}

function dataProperty(value, key) {
  if (!value || typeof value !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

const EMPTY_RECORD = Object.freeze({});

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : EMPTY_RECORD;
}
