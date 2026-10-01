import { classifyDungeonInteraction } from "./dungeon-interactions.js";

const ENTITY_NAMES = Object.freeze({
  player: "玩家", villager: "村民", wandering_trader: "流浪商人",
  pig: "猪", cow: "牛", sheep: "羊", chicken: "鸡", rabbit: "兔子",
  horse: "马", donkey: "驴", mule: "骡", llama: "羊驼", camel: "骆驼",
  wolf: "狼", cat: "猫", fox: "狐狸", parrot: "鹦鹉", bee: "蜜蜂",
  iron_golem: "铁傀儡", snow_golem: "雪傀儡", zombie: "僵尸",
  skeleton: "骷髅", creeper: "苦力怕", spider: "蜘蛛", enderman: "末影人",
});

const BLOCK_NAMES = Object.freeze({
  lever: "拉杆", iron_door: "铁门", iron_trapdoor: "铁活板门",
});
const BLOCK_MATERIAL_NAMES = Object.freeze({
  oak: "橡木", spruce: "云杉木", birch: "白桦木", jungle: "丛林木",
  acacia: "金合欢木", dark_oak: "深色橡木", mangrove: "红树木", cherry: "樱花木",
  pale_oak: "苍白橡木", bamboo: "竹", crimson: "绯红", warped: "诡异",
  stone: "石", polished_blackstone: "磨制黑石", iron: "铁",
});

const ENTITY_ACTIONS = new Set(["details", "approach", "attack"]);
const EXPLICIT_LIVESTOCK_ATTACK_NAMES = new Set(["pig", "cow", "sheep", "chicken", "rabbit"]);
const renderedMenuSignatures = new WeakMap();
const renderedDetailSignatures = new WeakMap();

function ownValue(value, key) {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function text(value, fallback = "", maximum = 96) {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const cleaned = String(value)
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[<>]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return [...cleaned].slice(0, maximum).join("") || fallback;
}

function canonical(value) {
  return text(value, "unknown", 96).toLowerCase().replace(/^minecraft:/u, "").replace(/[^a-z0-9_]/gu, "") || "unknown";
}

function finite(value) {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : null;
}

function safeEntityId(entity) {
  const id = Number(ownValue(entity, "id"));
  return Number.isSafeInteger(id) && id >= 0 && id <= 2_147_483_647 ? id : null;
}

function vector(value) {
  if (!value || typeof value !== "object") return null;
  const x = finite(ownValue(value, "x"));
  const y = finite(ownValue(value, "y"));
  const z = finite(ownValue(value, "z"));
  return x === null || y === null || z === null ? null : { x, y, z };
}

function entityDistance(entity, playerPosition) {
  const supplied = finite(ownValue(entity, "distance"));
  const target = vector(ownValue(entity, "pos") ?? ownValue(entity, "position"));
  const origin = vector(playerPosition);
  if (target && origin) return Math.hypot(target.x - origin.x, target.y - origin.y, target.z - origin.z);
  return supplied === null ? null : Math.max(0, supplied);
}

function entityTitle(entity, name) {
  for (const key of ["identityName", "username", "customName", "displayName"]) {
    const candidate = text(ownValue(entity, key), "", 96);
    if (candidate && candidate.toLowerCase() !== name) return candidate;
  }
  return ENTITY_NAMES[name] || text(name.replace(/_/gu, " "), "未知实体", 96);
}

function explicitBoolean(entity, positiveKeys, ownerKeys = []) {
  for (const key of positiveKeys) {
    const value = ownValue(entity, key);
    if (typeof value === "boolean") return value;
  }
  for (const key of ownerKeys) {
    const value = ownValue(entity, key);
    if (typeof value === "string" && value.trim()) return true;
  }
  return null;
}

function babyState(entity) {
  const explicit = explicitBoolean(entity, ["isBaby", "baby"]);
  if (explicit !== null) return explicit;
  const age = finite(ownValue(entity, "age"));
  return age === null ? null : age < 0;
}

function tamedState(entity) {
  return explicitBoolean(
    entity,
    ["isTamed", "tamed"],
    ["ownerUuid", "ownerUUID", "ownerId", "ownerName"],
  );
}

function row(label, value) {
  return Object.freeze({ label, value });
}

export function createEntityContextMenuModel(entity, playerPosition = null, classified = null) {
  const entityId = safeEntityId(entity);
  const interaction = classified || classifyDungeonInteraction(entity);
  if (entityId === null || interaction?.category === "unavailable") return null;
  const name = canonical(ownValue(entity, "name"));
  const title = entityTitle(entity, name);
  const distance = entityDistance(entity, playerPosition);
  const health = finite(ownValue(entity, "health"));
  const maxHealth = finite(ownValue(entity, "maxHealth"));
  const baby = babyState(entity);
  const tamed = tamedState(entity);
  const isPlayer = name === "player" || typeof ownValue(entity, "username") === "string";
  const isNpc = interaction?.category === "npc" || name === "villager" || name === "wandering_trader";
  const typeLabel = isPlayer
    ? "玩家"
    : isNpc
      ? name === "wandering_trader" ? "流浪商人 · NPC" : "村民 · NPC"
      : interaction?.category === "hostile"
        ? "敌对生物"
        : ENTITY_NAMES[name] ? "普通生物" : "世界实体";
  const details = [row("类型", typeLabel)];
  if (distance !== null) details.push(row("距离", `${distance.toFixed(1)} 格`));
  if (health !== null) {
    details.push(row("生命", maxHealth !== null && maxHealth > 0 ? `${health.toFixed(1)} / ${maxHealth.toFixed(1)}` : health.toFixed(1)));
  }
  if (baby !== null) details.push(row("幼体", baby ? "是" : "否"));
  if (tamed !== null) details.push(row("驯服", tamed ? "已驯服" : "未驯服"));

  const actions = [
    Object.freeze({ action: "details", label: "查看详情", tone: "info" }),
    Object.freeze({ action: "approach", label: "走近", tone: "move" }),
  ];
  // Right-click is an explicit operator action, so a small livestock allowlist
  // is available in addition to verified hostiles. Left-click remains hostile
  // only. Known babies, players, NPCs and tamed pets stay protected.
  const explicitlyAttackableLivestock = EXPLICIT_LIVESTOCK_ATTACK_NAMES.has(name) && baby !== true;
  if ((interaction?.canAttack === true || explicitlyAttackableLivestock) && !isPlayer && !isNpc && tamed !== true) {
    actions.push(Object.freeze({ action: "attack", label: "攻击", tone: "danger" }));
  }
  return Object.freeze({
    kind: "entity",
    entityId,
    name,
    title,
    subtitle: distance === null ? typeLabel : `${typeLabel} · ${distance.toFixed(1)} 格`,
    category: interaction?.category || "other",
    isPlayer,
    isNpc,
    isTamed: tamed === true,
    details: Object.freeze(details),
    actions: Object.freeze(actions),
  });
}

function blockAction(name, open) {
  if (name === "lever" || name.endsWith("_button")) return { action: "interact", label: "使用" };
  if (name.endsWith("_door") || name.endsWith("_trapdoor") || name.endsWith("_fence_gate")) {
    return { action: "interact", label: open === true ? "关闭" : "打开" };
  }
  return null;
}

function localizedBlockName(name) {
  const suffixes = [
    ["_fence_gate", "栅栏门"],
    ["_trapdoor", "活板门"],
    ["_button", "按钮"],
    ["_door", "门"],
  ];
  for (const [suffix, label] of suffixes) {
    if (!name.endsWith(suffix)) continue;
    const material = name.slice(0, -suffix.length);
    return `${BLOCK_MATERIAL_NAMES[material] || ""}${label}`;
  }
  return "";
}

export function createInteractableBlockContextModel(block) {
  if (!block || typeof block !== "object") return null;
  const name = canonical(ownValue(block, "name"));
  const position = vector(ownValue(block, "position"));
  const open = ownValue(block, "open") === true;
  const action = blockAction(name, open);
  if (!action || !position || ![position.x, position.y, position.z].every(Number.isInteger)) return null;
  const displayName = BLOCK_NAMES[name]
    || localizedBlockName(name)
    || text(ownValue(block, "displayName"), "", 96)
    || text(name.replace(/_/gu, " "), "可交互方块", 96);
  return Object.freeze({
    kind: "block",
    name,
    title: displayName,
    subtitle: `方块 · ${position.x}, ${position.y}, ${position.z}`,
    position: Object.freeze(position),
    details: Object.freeze([
      row("类型", "可交互方块"),
      row("位置", `${position.x}, ${position.y}, ${position.z}`),
    ]),
    actions: Object.freeze([Object.freeze({ ...action, tone: "move" })]),
  });
}

export function createEntityContextActionMessage(model, action) {
  if (!model || model.kind !== "entity" || !ENTITY_ACTIONS.has(action)) return null;
  if (!model.actions.some((candidate) => candidate.action === action)) return null;
  if (action === "attack") {
    return Object.freeze({
      type: "lantern-control-explicit-attack-entity",
      entityId: model.entityId,
      explicit: true,
    });
  }
  return Object.freeze({
    type: "lantern-entity-context-action",
    entityId: model.entityId,
    action,
    explicit: true,
  });
}

export function createBlockContextActionMessage(model, action) {
  if (!model || model.kind !== "block" || action !== "interact") return null;
  if (!model.actions.some((candidate) => candidate.action === action)) return null;
  return Object.freeze({
    type: "lantern-control-interact-block",
    position: Object.freeze({ ...model.position }),
    explicit: true,
  });
}

function setText(root, selector, value) {
  const element = root.querySelector(selector);
  if (element) element.textContent = text(value, "", 160);
}

function createRows(documentRef, rows, compact = false) {
  return rows.map((entry) => {
    const line = documentRef.createElement("div");
    line.className = compact ? "entity-context-fact" : "entity-detail-row";
    const label = documentRef.createElement("span");
    label.textContent = entry.label;
    const value = documentRef.createElement("strong");
    value.textContent = entry.value;
    line.append(label, value);
    return line;
  });
}

export function renderEntityContextMenu(root, model, x, y) {
  if (!root || !model || typeof root.querySelector !== "function") return false;
  const signature = JSON.stringify(model);
  if (renderedMenuSignatures.get(root) !== signature) {
    renderedMenuSignatures.set(root, signature);
    setText(root, "[data-context-title]", model.title);
    setText(root, "[data-context-subtitle]", model.subtitle);
    const summary = root.querySelector("[data-context-summary]");
    const actions = root.querySelector("[data-context-actions]");
    const documentRef = root.ownerDocument;
    summary?.replaceChildren(...createRows(documentRef, model.details.slice(0, 3), true));
    const buttons = model.actions.map((entry) => {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.dataset.contextAction = entry.action;
      button.dataset.tone = entry.tone;
      button.setAttribute("role", "menuitem");
      button.textContent = entry.label;
      return button;
    });
    actions?.replaceChildren(...buttons);
  }
  root.dataset.targetKind = model.kind;
  const view = root.ownerDocument?.defaultView;
  const left = Math.max(8, Math.min((view?.innerWidth || 320) - 250, Number(x) || 8));
  const top = Math.max(8, Math.min((view?.innerHeight || 320) - 260, Number(y) || 8));
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  root.querySelector("button")?.focus({ preventScroll: true });
  return true;
}

export function renderEntityDetailCard(root, model) {
  if (!root || !model || model.kind !== "entity" || typeof root.querySelector !== "function") return false;
  const signature = JSON.stringify(model);
  if (renderedDetailSignatures.get(root) !== signature) {
    renderedDetailSignatures.set(root, signature);
    setText(root, "[data-detail-title]", model.title);
    setText(root, "[data-detail-subtitle]", model.subtitle);
    const rows = root.querySelector("[data-detail-rows]");
    rows?.replaceChildren(...createRows(root.ownerDocument, model.details));
  }
  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  return true;
}

export function hideEntityContextSurface(root) {
  if (!root) return;
  root.hidden = true;
  root.setAttribute?.("aria-hidden", "true");
}
