const TRADE_STATUSES = new Set(["ready", "unseen", "needs_proximity", "loading", "error"]);
const TRADE_STATUS_ALIASES = Object.freeze({ unread: "unseen", failed: "error" });
const renderedTradeSignatures = new WeakMap();

export const VILLAGER_TRADE_LIMIT = 16;

function ownValue(value, key) {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function boundedText(value, fallback = "", limit = 80) {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  return [...String(value).replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim()]
    .slice(0, limit)
    .join("") || fallback;
}

function boundedInteger(value, fallback, maximum = 9_999) {
  const candidate = Number(value);
  return Number.isFinite(candidate)
    ? Math.max(0, Math.min(maximum, Math.floor(candidate)))
    : fallback;
}

function normalizeItem(value) {
  if (!value || typeof value !== "object") return null;
  const nestedItem = ownValue(value, "item");
  const source = nestedItem && typeof nestedItem === "object" ? nestedItem : value;
  const name = boundedText(
    ownValue(source, "name") ?? ownValue(source, "identifier") ?? ownValue(source, "id"),
    "未知物品",
    96,
  );
  const displayName = boundedText(
    ownValue(source, "displayName") ?? ownValue(source, "customName") ?? name.replace(/^minecraft:/u, "").replace(/_/gu, " "),
    name,
    96,
  );
  const count = Math.max(1, boundedInteger(
    ownValue(source, "count") ?? ownValue(source, "itemCount") ?? ownValue(source, "amount"),
    1,
  ));
  return Object.freeze({ name, displayName, count });
}

function normalizeOffer(value) {
  if (!value || typeof value !== "object") return null;
  const input = normalizeItem(
    ownValue(value, "input") ?? ownValue(value, "inputItem") ?? ownValue(value, "inputItem1") ?? ownValue(value, "price"),
  );
  const secondaryInput = normalizeItem(
    ownValue(value, "secondaryInput") ?? ownValue(value, "inputItem2") ?? ownValue(value, "secondInput"),
  );
  const output = normalizeItem(
    ownValue(value, "output") ?? ownValue(value, "outputItem") ?? ownValue(value, "result"),
  );
  if (!input || !output) return null;
  const uses = boundedInteger(ownValue(value, "uses") ?? ownValue(value, "nbTradeUses"), 0, 65_535);
  const maxUses = boundedInteger(
    ownValue(value, "maxUses") ?? ownValue(value, "maximumNbTradeUses"),
    0,
    65_535,
  );
  const disabled = ownValue(value, "disabled") === true
    || ownValue(value, "tradeDisabled") === true
    || (maxUses > 0 && uses >= maxUses);
  return Object.freeze({ input, secondaryInput, output, uses, maxUses, disabled });
}

function normalizeObservedAt(value) {
  if (typeof value === "string" && value.trim()) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  const candidate = Number(value);
  if (!Number.isFinite(candidate) || candidate <= 0) return null;
  return candidate < 10_000_000_000 ? candidate * 1_000 : candidate;
}

export function normalizeVillagerTradeOffers(value) {
  const source = Array.isArray(value) ? { status: "ready", offers: value } : value;
  if (!source || typeof source !== "object") {
    return Object.freeze({ status: "unseen", observedAt: null, offers: Object.freeze([]) });
  }
  const rawOffers = ownValue(source, "offers") ?? ownValue(source, "trades");
  const offers = (Array.isArray(rawOffers) ? rawOffers : [])
    .slice(0, VILLAGER_TRADE_LIMIT)
    .map(normalizeOffer)
    .filter(Boolean);
  const suppliedStatus = boundedText(ownValue(source, "status"), "", 32);
  const compatibleStatus = TRADE_STATUS_ALIASES[suppliedStatus] || suppliedStatus;
  const status = TRADE_STATUSES.has(compatibleStatus)
    ? compatibleStatus
    : offers.length > 0
      ? "ready"
      : "unseen";
  return Object.freeze({
    status,
    observedAt: normalizeObservedAt(ownValue(source, "observedAt") ?? ownValue(source, "updatedAt")),
    offers: Object.freeze(offers),
  });
}

function entityName(entity) {
  return boundedText(ownValue(entity, "name"), "unknown", 96).replace(/^minecraft:/u, "").toLowerCase();
}

function observedAtLabel(timestamp, now) {
  if (!timestamp) return "";
  const elapsed = Math.max(0, Number(now) - timestamp);
  if (elapsed < 60_000) return "最近读取：刚刚";
  if (elapsed < 3_600_000) return `最近读取：${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `最近读取：${Math.floor(elapsed / 3_600_000)} 小时前`;
  return `最近读取：${Math.floor(elapsed / 86_400_000)} 天前`;
}

export function createVillagerTradePanelModel(entity, now = Date.now()) {
  const name = entityName(entity);
  const tradeCapable = name === "villager" || name === "wandering_trader";
  if (!tradeCapable) {
    return Object.freeze({
      tradeCapable: false,
      status: "not_applicable",
      statusLabel: "该角色没有原版村民交易",
      observedLabel: "",
      offers: Object.freeze([]),
    });
  }
  const normalized = normalizeVillagerTradeOffers(ownValue(entity, "tradeOffers"));
  const statusLabels = {
    ready: normalized.offers.length > 0
      ? `已读取 ${normalized.offers.length} 项交易`
      : "已读取，但当前没有可用交易",
    unseen: "尚未读取这位村民的交易",
    needs_proximity: "需要靠近村民后才能读取交易",
    loading: "正在读取村民交易…",
    error: "交易数据读取失败，稍后靠近重试",
  };
  return Object.freeze({
    tradeCapable: true,
    status: normalized.status,
    statusLabel: statusLabels[normalized.status],
    observedLabel: observedAtLabel(normalized.observedAt, now),
    offers: normalized.offers,
  });
}

function itemChip(documentRef, item, className) {
  const chip = documentRef.createElement("span");
  chip.className = className;
  chip.textContent = `${item.displayName} ×${item.count}`;
  chip.title = item.name;
  return chip;
}

export function renderVillagerTradePanel(root, entity, now = Date.now()) {
  if (!root || typeof root.querySelector !== "function") return null;
  const model = createVillagerTradePanelModel(entity, now);
  const signature = JSON.stringify(model);
  if (renderedTradeSignatures.get(root) === signature) return model;
  renderedTradeSignatures.set(root, signature);
  const status = root.querySelector("[data-trade-status]");
  const observed = root.querySelector("[data-trade-observed]");
  const list = root.querySelector("[data-trade-list]");
  root.dataset.status = model.status;
  root.setAttribute("aria-busy", String(model.status === "loading"));
  if (status) status.textContent = model.statusLabel;
  if (observed) {
    observed.textContent = model.observedLabel;
    observed.hidden = !model.observedLabel;
  }
  if (!list || typeof list.replaceChildren !== "function") return model;
  const documentRef = root.ownerDocument;
  const rows = model.offers.map((offer) => {
    const row = documentRef.createElement("div");
    row.className = `npc-trade-offer${offer.disabled ? " is-disabled" : ""}`;
    row.setAttribute("role", "listitem");

    const cost = documentRef.createElement("div");
    cost.className = "npc-trade-cost";
    cost.append(itemChip(documentRef, offer.input, "npc-trade-item is-cost"));
    if (offer.secondaryInput) {
      const plus = documentRef.createElement("span");
      plus.className = "npc-trade-plus";
      plus.textContent = "+";
      cost.append(plus, itemChip(documentRef, offer.secondaryInput, "npc-trade-item is-cost"));
    }

    const arrow = documentRef.createElement("span");
    arrow.className = "npc-trade-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";

    const result = itemChip(documentRef, offer.output, "npc-trade-item is-result");
    const stock = documentRef.createElement("small");
    stock.className = "npc-trade-stock";
    stock.textContent = offer.disabled
      ? "已售罄"
      : offer.maxUses > 0
        ? `库存 ${Math.max(0, offer.maxUses - offer.uses)}/${offer.maxUses}`
        : "库存未知";
    row.append(cost, arrow, result, stock);
    return row;
  });
  list.replaceChildren(...rows);
  list.hidden = rows.length === 0;
  return model;
}
