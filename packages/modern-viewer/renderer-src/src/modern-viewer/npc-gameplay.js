import {
  canonicalEntityName,
  decodeVillagerAppearance,
  VILLAGER_LEVEL_KEYS,
  VILLAGER_PROFESSION_KEYS,
  VILLAGER_TYPE_KEYS,
} from "./viewer-runtime.js";

export const NPC_PROFILE_VERSION = 1;
export const NPC_INTERACTION_STATE_VERSION = 1;
export const NPC_ACTION_SCHEMA_VERSION = 1;

export const NPC_GAMEPLAY_LIMITS = Object.freeze({
  maxProfiles: 128,
  maxNpcKeyLength: 96,
  maxIdentityLength: 96,
  maxQuestHooksPerNpc: 12,
  maxQuestIdLength: 64,
  maxQuestTitleLength: 96,
  maxQuestDetailLength: 240,
  maxActionSchemas: 32,
  maxActionFields: 12,
  maxActionTextLength: 320,
  maxSerializedBytes: 65_536,
  maxMeetings: 9_999,
  minAffinity: -100,
  maxAffinity: 100,
  maxRevision: 2_147_483_647,
});

const VILLAGER_TYPE_LABELS = Object.freeze({
  desert: "沙漠",
  jungle: "丛林",
  plains: "平原",
  savanna: "热带草原",
  snow: "雪原",
  swamp: "沼泽",
  taiga: "针叶林",
});

const VILLAGER_PROFESSION_LABELS = Object.freeze({
  none: "无职业",
  armorer: "盔甲匠",
  butcher: "屠夫",
  cartographer: "制图师",
  cleric: "牧师",
  farmer: "农民",
  fisherman: "渔夫",
  fletcher: "制箭师",
  leatherworker: "皮匠",
  librarian: "图书管理员",
  mason: "石匠",
  nitwit: "傻子",
  shepherd: "牧羊人",
  toolsmith: "工具匠",
  weaponsmith: "武器匠",
});

const VILLAGER_LEVEL_LABELS = Object.freeze({
  none: "未交易",
  stone: "新手",
  iron: "学徒",
  gold: "熟练工",
  emerald: "专家",
  diamond: "大师",
});

const ENTITY_TYPE_LABELS = Object.freeze({
  villager: "村民",
  wandering_trader: "流浪商人",
  player: "玩家",
});

const QUEST_STATES = Object.freeze(["available", "active", "completed", "failed", "hidden"]);
const QUEST_SOURCES = Object.freeze(["local", "server"]);
const ACTION_FIELD_KINDS = new Set(["text", "id", "boolean", "number", "enum"]);
const UNSAFE_FIELD_NAMES = new Set(["__proto__", "constructor", "prototype"]);

const lore = (identityName, identityKey, archetype, title, summary, tags) => Object.freeze({
  id: `${identityKey}-lore-v1`,
  identityName,
  identityKey,
  archetype,
  title,
  summary,
  tags: Object.freeze([...tags]),
});

/**
 * Trusted local story data. Entity text is only used to select an exact
 * identity-name/key pair; it is never interpreted as markup or executable
 * content.
 */
export const ORIGINAL_NPC_LORE = Object.freeze([
  lore("书商·墨白", "npc-d3f933645b7d10682f5a18ee", "scholar", "旧页守望者", "替集市保存散佚书页，也悄悄记录每位旅人的选择。", ["书籍", "传闻"]),
  lore("铁匠·岳山", "npc-9b574b1b314ee9dece0aef95", "smith", "山火锻师", "相信好工具会记住主人的手势，愿为可靠的旅人重燃旧炉。", ["锻造", "工具"]),
  lore("甲匠·石磊", "npc-23ac7457fe3aeced2e1be1d0", "smith", "守壁之人", "研究护甲与古老城墙的裂纹，习惯先听脚步再开口。", ["护甲", "防守"]),
  lore("书商·云笈", "npc-f685b845661a789ece97b291", "scholar", "云图抄录者", "收集天气、地形与远行者的手绘地图，把偶然写成可循的路线。", ["地图", "探索"]),
  lore("神官·静水", "npc-d6364b74e7eb3537406f7538", "priest", "静潮司祭", "守护女神祷词的次序，认为真正的回应藏在倾听之后。", ["祷告", "女神"]),
  lore("货郎·福伯", "npc-c38a049a5b14f201b0af1293", "merchant", "百路货郎", "走过许多村道，能从一件普通物品讲出三段不同来历。", ["旅行", "交易"]),
  lore("灯窝·阿爹", "npc-ade9c904461d5ab2a929b6c6", "tanner", "灯窝老匠", "用皮革和旧布修补旅装，也照看归来太晚的人。", ["灯窝", "手艺"]),
  lore("墨先生", "npc-955c7244a414c9139448fca9", "scholar", "无字卷主人", "只在确信提问者准备好时，才会展开那卷没有墨迹的书。", ["谜语", "秘闻"]),
  lore("渔夫·浪伯", "npc-2edb554af4a89e89454fd91a", "fisher", "听潮老人", "熟悉河流在昼夜间的脾气，常把危险说成一则钓鱼故事。", ["河流", "垂钓"]),
  lore("货郎·铜板", "npc-d1dd592a2ea60d00ebd65008", "merchant", "公平秤手", "把每次买卖看作一次承诺，最讨厌缺斤少两和含糊的价码。", ["集市", "交易"]),
  lore("守夜人·烛九", "npc-148ee37f5f20a97561755b54", "watchman", "第九盏灯", "巡查村庄最暗的边缘，记得每个夜晚不该出现的声音。", ["夜巡", "守护"]),
  lore("集市掌柜·通宝", "npc-addde9030ff1e0518e122ef6", "merchant", "万物有价", "经营集市账册，也乐于为没有金币的人安排一场等价交换。", ["账本", "委托"]),
  lore("吟游诗人·风临", "npc-d004094fb6cffc2fa2cded6f", "bard", "借风成歌", "把旅人的见闻编进新曲；同一首歌从不会唱成完全相同的版本。", ["音乐", "故事"]),
  lore("老农·禾叔", "npc-064ac324c883df27e9000537", "farmer", "识土老农", "能从泥土颜色判断下一场雨，也愿把第一把种子留给新人。", ["农耕", "季节"]),
  lore("牧羊女·小满", "npc-d7b00c2e950e3e9c9db2315c", "shepherd", "原野引路人", "熟悉山坡上的安全小径，总能先于别人发现走失的生灵。", ["牧羊", "引路"]),
  lore("灯窝·穗娘", "npc-576da7e43b9e56d3a706c5fa", "tanner", "缝光者", "把旧披风缝得像新的一样，并在针脚里留下灯窝的记号。", ["灯窝", "缝纫"]),
  lore("阿宝", "npc-b92f03412dc73422337278d0", "villager", "风车少年", "对村外的一切都很好奇，正在收集能让小风车转得更快的办法。", ["好奇", "风车"]),
  lore("公会接待员·岚", "npc-2135b81dac6bb79e2cd473cf", "receptionist", "委托簿守门人", "整理冒险者公会的委托与回执，重视清楚的目标和可信的证据。", ["公会", "委托"]),
  lore("灯窝·阿禾", "npc-e6d8bb3c96052a7f264dbe08", "cartographer", "灯下测绘师", "用灯影校准地图，把安全营地和危险资源点标成不同的符号。", ["灯窝", "测绘"]),
  lore("鸣人", "npc-ebc83899d36711020777c76a", "ninja", "木叶忍者·漩涡鸣人", "来自木叶隐村的忍者，体内封印着九尾；他以成为火影、获得所有人的认同为目标，擅长影分身与螺旋丸。", ["火影忍者", "木叶", "螺旋丸"]),
  lore("桐人", "npc-948131665d02111ab1893c3e", "swordsman", "艾恩葛朗特的黑衣剑士", "本名桐谷和人，是被困在《Sword Art Online》死亡游戏中的攻略玩家；以黑色长衣、单手剑技与独有二刀流闻名。", ["刀剑神域", "黑衣剑士", "二刀流"]),
]);

const defaultLoreByKey = new Map(ORIGINAL_NPC_LORE.map((entry) => [entry.identityKey, entry]));

/**
 * Build a deterministic, JSON-safe view model from one streamed entity.
 * The result contains data only and is deeply frozen at its public edges.
 */
export function buildNpcProfile(entity, playerPosition, options = {}) {
  const source = record(entity);
  const entityType = canonicalEntityName(dataProperty(source, "name")) || "unknown";
  const entityId = scalarText(dataProperty(source, "id"), 64);
  const identityName = firstPlainText([
    dataProperty(source, "identityName"),
    dataProperty(source, "customName"),
    dataProperty(source, "displayName"),
    dataProperty(source, "username"),
  ], NPC_GAMEPLAY_LIMITS.maxIdentityLength)
    || `${ENTITY_TYPE_LABELS[entityType] || "NPC"}${entityId ? ` #${entityId}` : ""}`;
  const suppliedIdentityKey = normalizeStableToken(dataProperty(source, "identityKey"), NPC_GAMEPLAY_LIMITS.maxNpcKeyLength);
  const uuid = normalizeStableToken(dataProperty(source, "uuid"), NPC_GAMEPLAY_LIMITS.maxNpcKeyLength);
  const key = suppliedIdentityKey
    || `npc-auto-${stableHash(`${uuid || identityName}|${entityType}|${entityId}`)}`;
  const username = sanitizePlainText(dataProperty(source, "username"), 64) || null;
  const position = positionFrom(dataProperty(source, "pos") ?? dataProperty(source, "position"));
  const observerPosition = positionFrom(
    dataProperty(record(playerPosition), "pos")
      ?? dataProperty(record(playerPosition), "position")
      ?? playerPosition,
  );
  const distance = describeDistance(position, observerPosition);
  const appearance = resolveVillagerAppearance(source, entityType);
  const status = describeNpcStatus(source, distance);
  const profileLore = dataProperty(record(options), "includeLore") === false
    ? null
    : resolveNpcLore(key, identityName, dataProperty(record(options), "loreCatalog"));

  return Object.freeze({
    version: NPC_PROFILE_VERSION,
    key,
    entityId: entityId || null,
    identity: Object.freeze({
      name: identityName,
      username,
      source: suppliedIdentityKey ? "server-identity" : uuid ? "uuid" : entityId ? "entity-id" : "derived",
    }),
    type: Object.freeze({
      entityKey: entityType,
      entityLabel: ENTITY_TYPE_LABELS[entityType] || sanitizePlainText(entityType, 48) || "未知实体",
      biomeKey: appearance?.typeKey ?? null,
      biomeLabel: appearance?.typeLabel ?? null,
    }),
    profession: Object.freeze({
      key: appearance?.professionKey ?? "none",
      label: appearance?.professionLabel ?? "无职业",
      levelKey: appearance?.levelKey ?? "none",
      levelLabel: appearance?.levelLabel ?? "未交易",
    }),
    position: position ? Object.freeze(position) : null,
    distance: Object.freeze(distance),
    status: Object.freeze(status),
    lore: profileLore,
  });
}

export function createNpcInteractionState() {
  return freezeInteractionState({ version: NPC_INTERACTION_STATE_VERSION, revision: 0, entries: [] });
}

/** Parse untrusted storage data into a bounded canonical state. Invalid input resets safely. */
export function deserializeNpcInteractionState(serialized) {
  let raw = serialized;
  if (typeof serialized === "string") {
    if (serialized.length > NPC_GAMEPLAY_LIMITS.maxSerializedBytes
      || utf8ByteLength(serialized) > NPC_GAMEPLAY_LIMITS.maxSerializedBytes) {
      return createNpcInteractionState();
    }
    try {
      raw = JSON.parse(serialized);
    } catch {
      return createNpcInteractionState();
    }
  }
  const source = record(raw);
  const rawEntries = dataProperty(source, "entries");
  if (!Array.isArray(rawEntries)) return createNpcInteractionState();
  const candidates = rawEntries
    .slice(0, NPC_GAMEPLAY_LIMITS.maxProfiles * 4)
    .map(normalizeInteractionEntry)
    .filter(Boolean)
    .sort(compareInteractionEntries);
  const entries = [];
  const seen = new Set();
  for (const entry of candidates) {
    if (seen.has(entry.npcKey)) continue;
    seen.add(entry.npcKey);
    entries.push(entry);
    if (entries.length >= NPC_GAMEPLAY_LIMITS.maxProfiles) break;
  }
  entries.sort((left, right) => left.npcKey.localeCompare(right.npcKey));
  const highestEntryRevision = entries.reduce((highest, entry) => Math.max(highest, entry.updatedRevision), 0);
  const revision = Math.max(
    boundedInteger(dataProperty(source, "revision"), 0, NPC_GAMEPLAY_LIMITS.maxRevision, 0),
    highestEntryRevision,
  );
  return freezeInteractionState({ version: NPC_INTERACTION_STATE_VERSION, revision, entries });
}

/** Canonical serialization: field and entry order never depends on insertion order. */
export function serializeNpcInteractionState(state) {
  const normalized = deserializeNpcInteractionState(state);
  let entries = [...normalized.entries];
  let serialized = JSON.stringify(normalized);
  while (entries.length > 0 && utf8ByteLength(serialized) > NPC_GAMEPLAY_LIMITS.maxSerializedBytes) {
    entries = entries
      .sort((left, right) => right.updatedRevision - left.updatedRevision || left.npcKey.localeCompare(right.npcKey))
      .slice(0, -1)
      .sort((left, right) => left.npcKey.localeCompare(right.npcKey));
    serialized = JSON.stringify({
      version: NPC_INTERACTION_STATE_VERSION,
      revision: normalized.revision,
      entries,
    });
  }
  return serialized;
}

export function getNpcInteraction(state, target) {
  const normalized = deserializeNpcInteractionState(state);
  const npcKey = npcKeyFrom(target);
  const entry = npcKey ? normalized.entries.find((candidate) => candidate.npcKey === npcKey) : null;
  return entry ?? freezeInteractionEntry(defaultInteractionEntry(npcKey || "npc-invalid"));
}

/**
 * Immutable reducer for local NPC progress. Only named scalar fields and the
 * data-only questHook record are accepted; callbacks and extra objects vanish.
 */
export function updateNpcInteractionState(state, target, mutation) {
  const normalized = deserializeNpcInteractionState(state);
  const npcKey = npcKeyFrom(target);
  if (!npcKey) return normalized;
  const change = record(mutation);
  const existing = normalized.entries.find((entry) => entry.npcKey === npcKey) ?? defaultInteractionEntry(npcKey);
  let affinity = existing.affinity;
  const absoluteAffinity = finiteNumber(dataProperty(change, "affinity"));
  const affinityDelta = finiteNumber(dataProperty(change, "affinityDelta"));
  if (absoluteAffinity !== null) affinity = clampInteger(absoluteAffinity, NPC_GAMEPLAY_LIMITS.minAffinity, NPC_GAMEPLAY_LIMITS.maxAffinity);
  if (affinityDelta !== null) affinity = clampInteger(affinity + affinityDelta, NPC_GAMEPLAY_LIMITS.minAffinity, NPC_GAMEPLAY_LIMITS.maxAffinity);

  let meetings = existing.meetings;
  const meetingsDelta = finiteNumber(dataProperty(change, "meetingsDelta"));
  if (meetingsDelta !== null) meetings = clampInteger(meetings + meetingsDelta, 0, NPC_GAMEPLAY_LIMITS.maxMeetings);
  const recordedValue = dataProperty(change, "recorded");
  const recorded = typeof recordedValue === "boolean" ? recordedValue : existing.recorded;
  let questHooks = [...existing.questHooks];
  const removeQuestId = normalizeQuestId(dataProperty(change, "removeQuestHook"));
  if (removeQuestId) questHooks = questHooks.filter((hook) => hook.id !== removeQuestId);
  const questHook = normalizeQuestHook(dataProperty(change, "questHook"));
  if (questHook) questHooks = [...questHooks.filter((hook) => hook.id !== questHook.id), questHook];
  questHooks = canonicalQuestHooks(questHooks);

  const changed = affinity !== existing.affinity
    || meetings !== existing.meetings
    || recorded !== existing.recorded
    || JSON.stringify(questHooks) !== JSON.stringify(existing.questHooks);
  if (!changed && normalized.entries.some((entry) => entry.npcKey === npcKey)) return normalized;
  if (!changed) return normalized;

  const revision = Math.min(NPC_GAMEPLAY_LIMITS.maxRevision, normalized.revision + 1);
  const nextEntry = freezeInteractionEntry({ npcKey, affinity, meetings, recorded, questHooks, updatedRevision: revision });
  let entries = [...normalized.entries.filter((entry) => entry.npcKey !== npcKey), nextEntry];
  if (entries.length > NPC_GAMEPLAY_LIMITS.maxProfiles) {
    entries = entries
      .sort((left, right) => right.updatedRevision - left.updatedRevision || left.npcKey.localeCompare(right.npcKey))
      .slice(0, NPC_GAMEPLAY_LIMITS.maxProfiles);
  }
  entries.sort((left, right) => left.npcKey.localeCompare(right.npcKey));
  return freezeInteractionState({ version: NPC_INTERACTION_STATE_VERSION, revision, entries });
}

export function recordNpcMeeting(state, target, options = {}) {
  const source = record(options);
  return updateNpcInteractionState(state, target, {
    meetingsDelta: 1,
    affinityDelta: finiteNumber(dataProperty(source, "affinityDelta")) ?? 0,
    ...(typeof dataProperty(source, "recorded") === "boolean" ? { recorded: dataProperty(source, "recorded") } : {}),
  });
}

export function setNpcJournalRecorded(state, target, recorded = true) {
  return updateNpcInteractionState(state, target, { recorded: recorded === true });
}

export function setNpcAffinity(state, target, affinity) {
  return updateNpcInteractionState(state, target, { affinity });
}

export function upsertNpcQuestHook(state, target, questHook) {
  return updateNpcInteractionState(state, target, { questHook });
}

export function removeNpcQuestHook(state, target, questId) {
  return updateNpcInteractionState(state, target, { removeQuestHook: questId });
}

const BUILTIN_ACTION_DEFINITIONS = Object.freeze([
  {
    type: "focus",
    intent: "viewer.focus",
    fields: [],
  },
  {
    type: "journal",
    intent: "state.journal",
    fields: [{ name: "recorded", kind: "boolean", required: true }],
  },
  {
    type: "dialogue",
    intent: "social.dialogue",
    fields: [
      { name: "mode", kind: "enum", values: ["initiate", "reply"], required: false },
      { name: "prompt", kind: "text", maxLength: 280, required: false },
    ],
  },
]);

/**
 * Extend actions with declarative field descriptions. Descriptions are plain
 * data; function validators/handlers are intentionally not part of the format.
 */
export function createNpcActionSchema(extensionDefinitions = []) {
  const extensions = Array.isArray(extensionDefinitions)
    ? extensionDefinitions.slice(0, NPC_GAMEPLAY_LIMITS.maxActionSchemas)
    : [];
  const definitions = [];
  const seen = new Set();
  for (const candidate of [...BUILTIN_ACTION_DEFINITIONS, ...extensions]) {
    const definition = normalizeActionDefinition(candidate);
    if (!definition || seen.has(definition.type)) continue;
    seen.add(definition.type);
    definitions.push(definition);
    if (definitions.length >= NPC_GAMEPLAY_LIMITS.maxActionSchemas) break;
  }
  definitions.sort((left, right) => left.type.localeCompare(right.type));
  return Object.freeze({ version: NPC_ACTION_SCHEMA_VERSION, definitions: Object.freeze(definitions) });
}

export const NPC_ACTION_SCHEMA = createNpcActionSchema();

export function createNpcAction(type, target, payload = {}, schema = NPC_ACTION_SCHEMA) {
  return normalizeNpcAction({ type, target, payload }, schema);
}

/** Validate an action loaded from storage or received across a message boundary. */
export function parseNpcAction(raw, schema = NPC_ACTION_SCHEMA) {
  return normalizeNpcAction(raw, schema);
}

function normalizeNpcAction(raw, schema) {
  const source = record(raw);
  const type = normalizeActionToken(dataProperty(source, "type"));
  const definitions = Array.isArray(dataProperty(record(schema), "definitions"))
    ? dataProperty(record(schema), "definitions")
    : NPC_ACTION_SCHEMA.definitions;
  const definition = definitions.find((candidate) => dataProperty(record(candidate), "type") === type);
  if (!definition) return null;
  const target = dataProperty(source, "target") ?? dataProperty(source, "npcKey");
  const npcKey = npcKeyFrom(target);
  if (!npcKey) return null;
  const targetRecord = record(target);
  const entityId = scalarText(dataProperty(targetRecord, "entityId"), 64) || null;
  const rawPayload = record(dataProperty(source, "payload"));
  const sanitizedPayload = {};
  const fields = Array.isArray(dataProperty(record(definition), "fields"))
    ? dataProperty(record(definition), "fields").slice(0, NPC_GAMEPLAY_LIMITS.maxActionFields)
    : [];
  for (const rawField of fields) {
    const field = normalizeActionField(rawField);
    if (!field) continue;
    const parsed = parseActionField(field, dataProperty(rawPayload, field.name));
    if (!parsed.valid) return null;
    if (parsed.present) sanitizedPayload[field.name] = parsed.value;
  }
  const intent = normalizeActionIntent(dataProperty(record(definition), "intent"));
  if (!intent) return null;
  const frozenTarget = Object.freeze({ npcKey, entityId });
  const frozenPayload = Object.freeze(sanitizedPayload);
  const id = `npc-action-${stableHash(`${type}|${npcKey}|${JSON.stringify(frozenPayload)}`)}`;
  return Object.freeze({
    version: NPC_ACTION_SCHEMA_VERSION,
    id,
    type,
    intent,
    target: frozenTarget,
    payload: frozenPayload,
  });
}

function resolveVillagerAppearance(entity, entityType) {
  if (entityType !== "villager") return null;
  const explicit = normalizeVillagerAppearance(dataProperty(entity, "villagerAppearance"));
  if (explicit) return explicit;
  return normalizeVillagerAppearance(decodeVillagerAppearance(dataProperty(entity, "metadata")));
}

function normalizeVillagerAppearance(value) {
  const source = record(value);
  const typeKey = safeEnum(dataProperty(source, "typeKey"), VILLAGER_TYPE_KEYS);
  const professionKey = safeEnum(dataProperty(source, "professionKey"), VILLAGER_PROFESSION_KEYS);
  const levelKey = safeEnum(dataProperty(source, "levelKey"), VILLAGER_LEVEL_KEYS);
  if (!typeKey || !professionKey || !levelKey) return null;
  return {
    typeKey,
    typeLabel: VILLAGER_TYPE_LABELS[typeKey],
    professionKey,
    professionLabel: VILLAGER_PROFESSION_LABELS[professionKey],
    levelKey,
    levelLabel: VILLAGER_LEVEL_LABELS[levelKey],
  };
}

function describeDistance(position, observerPosition) {
  if (!position || !observerPosition) {
    return { blocks: null, horizontalBlocks: null, verticalBlocks: null, band: "unknown" };
  }
  const x = position.x - observerPosition.x;
  const y = position.y - observerPosition.y;
  const z = position.z - observerPosition.z;
  const blocks = round(Math.hypot(x, y, z), 3);
  return {
    blocks,
    horizontalBlocks: round(Math.hypot(x, z), 3),
    verticalBlocks: round(Math.abs(y), 3),
    band: blocks <= 4.5 ? "interaction" : blocks <= 16 ? "nearby" : "distant",
  };
}

function describeNpcStatus(entity, distance) {
  const flags = entitySharedFlags(dataProperty(entity, "metadata"));
  const deleted = dataProperty(entity, "delete") === true;
  const health = boundedNumber(dataProperty(entity, "health"), 0, 2_048);
  const alive = !deleted && dataProperty(entity, "dead") !== true && (health === null || health > 0);
  const invisible = dataProperty(entity, "invisible") === true || (flags & 0x20) !== 0;
  const visible = alive && !invisible;
  const moving = dataProperty(entity, "moving") === true || vectorMagnitude(dataProperty(entity, "velocity")) > 0.01;
  const sleeping = dataProperty(entity, "sleeping") === true;
  const trading = dataProperty(entity, "trading") === true || dataProperty(entity, "isTrading") === true;
  const sneaking = dataProperty(entity, "sneaking") === true || dataProperty(entity, "crouching") === true || (flags & 0x02) !== 0;
  const inWater = dataProperty(entity, "inWater") === true || dataProperty(entity, "isInWater") === true;
  const hurt = (finiteNumber(dataProperty(entity, "hurtTime")) ?? 0) > 0;
  const pose = !alive
    ? "gone"
    : sleeping
      ? "sleeping"
      : trading
        ? "trading"
        : hurt
          ? "hurt"
          : inWater
            ? "swimming"
            : sneaking
              ? "sneaking"
              : moving
                ? "moving"
                : "idle";
  const availability = !alive
    ? "gone"
    : !visible
      ? "hidden"
      : distance.band === "interaction"
        ? "available"
        : distance.band === "nearby"
          ? "nearby"
          : distance.band === "distant"
            ? "distant"
            : "unknown";
  return {
    alive,
    visible,
    health,
    moving,
    sleeping,
    trading,
    sneaking,
    inWater,
    pose,
    availability,
    canInteract: alive && visible && distance.band === "interaction",
  };
}

function resolveNpcLore(identityKey, identityName, externalCatalog) {
  const catalogs = [];
  if (Array.isArray(externalCatalog)) catalogs.push(...externalCatalog.slice(0, 64));
  const local = defaultLoreByKey.get(identityKey);
  if (local) catalogs.push(local);
  for (const candidate of catalogs) {
    const entry = normalizeLore(candidate);
    if (!entry || entry.identityKey !== identityKey || entry.identityName !== identityName) continue;
    return entry;
  }
  return null;
}

function normalizeLore(value) {
  const source = record(value);
  const identityKey = normalizeStableToken(dataProperty(source, "identityKey"), NPC_GAMEPLAY_LIMITS.maxNpcKeyLength);
  const identityName = sanitizePlainText(dataProperty(source, "identityName"), NPC_GAMEPLAY_LIMITS.maxIdentityLength);
  if (!identityKey || !identityName) return null;
  const tags = Array.isArray(dataProperty(source, "tags"))
    ? dataProperty(source, "tags")
      .slice(0, 8)
      .map((entry) => sanitizePlainText(entry, 24))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))
    : [];
  return Object.freeze({
    id: normalizeStableToken(dataProperty(source, "id"), 120) || `${identityKey}-lore`,
    identityName,
    identityKey,
    archetype: normalizeStableToken(dataProperty(source, "archetype"), 48) || "villager",
    title: sanitizePlainText(dataProperty(source, "title"), 80) || identityName,
    summary: sanitizePlainText(dataProperty(source, "summary"), 280) || "",
    tags: Object.freeze([...new Set(tags)]),
  });
}

function normalizeInteractionEntry(value) {
  const source = record(value);
  const npcKey = npcKeyFrom(dataProperty(source, "npcKey"));
  if (!npcKey) return null;
  return freezeInteractionEntry({
    npcKey,
    affinity: clampInteger(dataProperty(source, "affinity"), NPC_GAMEPLAY_LIMITS.minAffinity, NPC_GAMEPLAY_LIMITS.maxAffinity),
    meetings: clampInteger(dataProperty(source, "meetings"), 0, NPC_GAMEPLAY_LIMITS.maxMeetings),
    recorded: dataProperty(source, "recorded") === true,
    questHooks: canonicalQuestHooks(dataProperty(source, "questHooks")),
    updatedRevision: boundedInteger(dataProperty(source, "updatedRevision"), 0, NPC_GAMEPLAY_LIMITS.maxRevision, 0),
  });
}

function defaultInteractionEntry(npcKey) {
  return { npcKey, affinity: 0, meetings: 0, recorded: false, questHooks: [], updatedRevision: 0 };
}

function freezeInteractionEntry(entry) {
  return Object.freeze({
    npcKey: entry.npcKey,
    affinity: entry.affinity,
    meetings: entry.meetings,
    recorded: entry.recorded,
    questHooks: Object.freeze(entry.questHooks.map((hook) => Object.freeze({ ...hook }))),
    updatedRevision: entry.updatedRevision,
  });
}

function freezeInteractionState(state) {
  return Object.freeze({
    version: NPC_INTERACTION_STATE_VERSION,
    revision: state.revision,
    entries: Object.freeze(state.entries.map((entry) => freezeInteractionEntry(entry))),
  });
}

function compareInteractionEntries(left, right) {
  return left.npcKey.localeCompare(right.npcKey)
    || right.updatedRevision - left.updatedRevision
    || JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function canonicalQuestHooks(value) {
  const source = Array.isArray(value) ? value : [];
  const candidates = source
    .slice(0, NPC_GAMEPLAY_LIMITS.maxQuestHooksPerNpc * 4)
    .map(normalizeQuestHook)
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id) || JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const result = [];
  const seen = new Set();
  for (const hook of candidates) {
    if (seen.has(hook.id)) continue;
    seen.add(hook.id);
    result.push(hook);
    if (result.length >= NPC_GAMEPLAY_LIMITS.maxQuestHooksPerNpc) break;
  }
  return result;
}

function normalizeQuestHook(value) {
  const source = record(value);
  const id = normalizeQuestId(dataProperty(source, "id"));
  if (!id) return null;
  const state = safeEnum(dataProperty(source, "state"), QUEST_STATES) || "available";
  const sourceKind = safeEnum(dataProperty(source, "source"), QUEST_SOURCES) || "local";
  return {
    id,
    state,
    source: sourceKind,
    progress: round(clampNumber(dataProperty(source, "progress"), 0, 1, 0), 4),
    title: sanitizePlainText(dataProperty(source, "title"), NPC_GAMEPLAY_LIMITS.maxQuestTitleLength),
    detail: sanitizePlainText(dataProperty(source, "detail"), NPC_GAMEPLAY_LIMITS.maxQuestDetailLength),
  };
}

function normalizeQuestId(value) {
  const text = sanitizePlainText(value, NPC_GAMEPLAY_LIMITS.maxQuestIdLength);
  if (!text) return "";
  const token = normalizeActionToken(text);
  return token || `quest-${stableHash(text)}`;
}

function normalizeActionDefinition(value) {
  const source = record(value);
  const type = normalizeActionToken(dataProperty(source, "type"));
  const intent = normalizeActionIntent(dataProperty(source, "intent"));
  if (!type || !intent) return null;
  const rawFields = dataProperty(source, "fields");
  const fields = Array.isArray(rawFields)
    ? rawFields.slice(0, NPC_GAMEPLAY_LIMITS.maxActionFields).map(normalizeActionField).filter(Boolean)
    : [];
  fields.sort((left, right) => left.name.localeCompare(right.name));
  const uniqueFields = [];
  const seen = new Set();
  for (const field of fields) {
    if (seen.has(field.name)) continue;
    seen.add(field.name);
    uniqueFields.push(field);
  }
  return Object.freeze({ type, intent, fields: Object.freeze(uniqueFields) });
}

function normalizeActionField(value) {
  const source = record(value);
  const name = normalizeActionToken(dataProperty(source, "name"));
  const kind = sanitizePlainText(dataProperty(source, "kind"), 16).toLowerCase();
  if (!name || UNSAFE_FIELD_NAMES.has(name) || !ACTION_FIELD_KINDS.has(kind)) return null;
  const field = { name, kind, required: dataProperty(source, "required") === true };
  if (kind === "text") {
    field.maxLength = boundedInteger(
      dataProperty(source, "maxLength"),
      1,
      NPC_GAMEPLAY_LIMITS.maxActionTextLength,
      NPC_GAMEPLAY_LIMITS.maxActionTextLength,
    );
  }
  if (kind === "enum") {
    const values = Array.isArray(dataProperty(source, "values"))
      ? dataProperty(source, "values").slice(0, 16).map(normalizeActionToken).filter(Boolean).sort()
      : [];
    if (values.length === 0) return null;
    field.values = Object.freeze([...new Set(values)]);
  }
  if (kind === "number") {
    field.min = finiteNumber(dataProperty(source, "min")) ?? -1_000_000;
    field.max = finiteNumber(dataProperty(source, "max")) ?? 1_000_000;
    if (field.min > field.max) [field.min, field.max] = [field.max, field.min];
  }
  return Object.freeze(field);
}

function parseActionField(field, value) {
  if (value === undefined || value === null) return { valid: field.required !== true, present: false };
  if (field.kind === "boolean") {
    return typeof value === "boolean" ? { valid: true, present: true, value } : { valid: false, present: false };
  }
  if (field.kind === "number") {
    const number = finiteNumber(value);
    return number === null
      ? { valid: false, present: false }
      : { valid: true, present: true, value: round(clampNumber(number, field.min, field.max, field.min), 6) };
  }
  if (field.kind === "enum") {
    const token = normalizeActionToken(value);
    return field.values.includes(token)
      ? { valid: true, present: true, value: token }
      : { valid: false, present: false };
  }
  if (field.kind === "id") {
    const token = normalizeActionToken(value);
    return token ? { valid: true, present: true, value: token } : { valid: false, present: false };
  }
  const text = sanitizePlainText(value, field.maxLength);
  return text || !field.required
    ? { valid: true, present: Boolean(text), value: text }
    : { valid: false, present: false };
}

function npcKeyFrom(value) {
  const source = record(value);
  const candidate = typeof value === "string"
    ? value
    : dataProperty(source, "key") ?? dataProperty(source, "npcKey");
  const text = sanitizePlainText(candidate, NPC_GAMEPLAY_LIMITS.maxNpcKeyLength);
  if (!text) return "";
  return normalizeStableToken(text, NPC_GAMEPLAY_LIMITS.maxNpcKeyLength) || `npc-ref-${stableHash(text)}`;
}

function positionFrom(value) {
  const source = record(value);
  const x = finiteNumber(dataProperty(source, "x"));
  const y = finiteNumber(dataProperty(source, "y"));
  const z = finiteNumber(dataProperty(source, "z"));
  if (x === null || y === null || z === null) return null;
  if (Math.abs(x) > 60_000_000 || Math.abs(z) > 60_000_000 || Math.abs(y) > 4_096) return null;
  return { x: round(x, 4), y: round(y, 4), z: round(z, 4) };
}

function vectorMagnitude(value) {
  const vector = positionFrom(value);
  return vector ? Math.hypot(vector.x, vector.y, vector.z) : 0;
}

function entitySharedFlags(metadata) {
  const raw = Array.isArray(metadata)
    ? dataProperty(metadata, "0")
    : dataProperty(record(metadata), "0");
  const flags = Number(raw);
  return Number.isInteger(flags) ? flags : 0;
}

/** Plain-text boundary used for all server- or storage-provided labels. */
export function sanitizeNpcText(value, maximumLength = NPC_GAMEPLAY_LIMITS.maxActionTextLength) {
  return sanitizePlainText(value, boundedInteger(maximumLength, 1, NPC_GAMEPLAY_LIMITS.maxActionTextLength, NPC_GAMEPLAY_LIMITS.maxActionTextLength));
}

function sanitizePlainText(value, maximumLength) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, " ")
    .replaceAll("&", "＆")
    .replaceAll("<", "＜")
    .replaceAll(">", "＞")
    .replaceAll('"', "＂")
    .replaceAll("'", "＇")
    .replaceAll("`", "｀")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maximumLength);
}

function firstPlainText(values, maximumLength) {
  for (const value of values) {
    const text = sanitizePlainText(value, maximumLength);
    if (text) return text;
  }
  return "";
}

function normalizeStableToken(value, maximumLength) {
  const text = sanitizePlainText(value, maximumLength).toLowerCase();
  return /^[a-z0-9][a-z0-9:._-]*$/u.test(text) ? text : "";
}

function normalizeActionToken(value) {
  const text = sanitizePlainText(value, 64).toLowerCase();
  return /^[a-z][a-z0-9_-]{0,63}$/u.test(text) && !UNSAFE_FIELD_NAMES.has(text) ? text : "";
}

function normalizeActionIntent(value) {
  const text = sanitizePlainText(value, 80).toLowerCase();
  return /^[a-z][a-z0-9._-]{0,79}$/u.test(text) ? text : "";
}

function scalarText(value, maximumLength) {
  if (typeof value === "string") return sanitizePlainText(value, maximumLength);
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, maximumLength);
  return "";
}

function safeEnum(value, allowed) {
  return typeof value === "string" && allowed.includes(value) ? value : "";
}

function boundedNumber(value, minimum, maximum) {
  const number = finiteNumber(value);
  return number === null ? null : round(Math.max(minimum, Math.min(maximum, number)), 4);
}

function finiteNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedInteger(value, minimum, maximum, fallback) {
  const number = finiteNumber(value);
  if (number === null) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(number)));
}

function clampInteger(value, minimum, maximum) {
  const number = finiteNumber(value);
  return Math.max(minimum, Math.min(maximum, Math.round(number ?? 0)));
}

function clampNumber(value, minimum, maximum, fallback) {
  const number = finiteNumber(value);
  return number === null ? fallback : Math.max(minimum, Math.min(maximum, number));
}

function round(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
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

function utf8ByteLength(value) {
  let length = 0;
  for (const symbol of value) {
    const code = symbol.codePointAt(0) || 0;
    length += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (length > NPC_GAMEPLAY_LIMITS.maxSerializedBytes) break;
  }
  return length;
}

function dataProperty(value, key) {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
