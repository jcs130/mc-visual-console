const MAX_CATCH_AGE_MS = 15_000;
const MAX_FUTURE_SKEW_MS = 30_000;
const SHOW_MS = 4_500;
const MAX_PENDING = 3;
const MAX_SEEN = 64;
const RESOURCE_NAME = /^(?:[a-z0-9_.-]+:)?[a-z0-9_]+$/;

function plainLabel(value) {
  if (typeof value !== "string") return "";
  return [...value.replace(/§[0-9a-fk-or]/giu, "").replace(/[\u0000-\u001f\u007f]/gu, " ").trim()]
    .slice(0, 80).join("");
}

/** A catch is an explicit host fact; inventory updates alone never reach here. */
export function normalizeFishingCatch(event, now = Date.now()) {
  if (!event || typeof event !== "object" || !Number.isSafeInteger(event.seq) || event.seq < 0
    || !Number.isFinite(event.atMs) || event.atMs < now - MAX_CATCH_AGE_MS
    || event.atMs > now + MAX_FUTURE_SKEW_MS) return null;
  const source = event.item;
  if (!source || typeof source !== "object" || typeof source.name !== "string"
    || source.name.length > 128 || !RESOURCE_NAME.test(source.name)
    || !Number.isSafeInteger(event.count) || event.count < 1) return null;
  const item = {
    name: source.name,
    count: event.count,
    customName: plainLabel(source.customName),
    displayName: plainLabel(source.displayName),
    enchanted: source.enchanted === true,
  };
  if (typeof source.headTextureHash === "string" && /^[0-9a-f]{40,64}$/.test(source.headTextureHash)) {
    item.headTextureHash = source.headTextureHash;
  }
  const label = item.customName || item.displayName || item.name.replace(/^minecraft:/u, "");
  return { seq: event.seq, atMs: event.atMs, item, count: event.count, label };
}

/** A bounded transient feed shared by all three camera modes. */
export class FishingCatchHud {
  constructor({ root, renderIcon, now = Date.now,
    schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
    cancel = (timer) => globalThis.clearTimeout(timer) } = {}) {
    this.root = root;
    this.renderIcon = renderIcon;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.pending = [];
    this.seen = new Map();
    this.active = null;
    this.timer = null;
    this.disposed = false;
    if (root) root.hidden = true;
  }

  push(event) {
    if (this.disposed || !this.root) return false;
    const now = this.now();
    const caught = normalizeFishingCatch(event, now);
    if (!caught) return false;
    for (const [seq, receivedAt] of this.seen) {
      if (receivedAt < now - MAX_CATCH_AGE_MS) this.seen.delete(seq);
    }
    if (this.seen.has(caught.seq)) return false;
    this.seen.set(caught.seq, now);
    while (this.seen.size > MAX_SEEN) this.seen.delete(this.seen.keys().next().value);
    if (!this.active) this.show(caught);
    else {
      this.pending.push(caught);
      if (this.pending.length > MAX_PENDING) this.pending.shift();
    }
    return true;
  }

  show(caught) {
    this.active = caught;
    const document = this.root.ownerDocument;
    const icon = document.createElement("div");
    icon.className = "viewer-fishing-catch-icon corti-slot";
    icon.setAttribute("aria-hidden", "true");
    // The exported icon set belongs to Minecraft. A foreign namespace must not
    // inherit a different vanilla item merely because its basename matches.
    if (!caught.item.name.includes(":") || caught.item.name.startsWith("minecraft:")) {
      const image = document.createElement("img");
      image.src = `/icons/${caught.item.name.replace(/^minecraft:/u, "")}.png`;
      image.alt = "";
      image.width = 32;
      image.height = 32;
      // Missing optional icon assets leave the truthful text and count visible.
      image.addEventListener("error", () => { image.hidden = true; }, { once: true });
      icon.append(image);
    }
    this.renderIcon?.(icon, caught.item);
    const copy = document.createElement("div");
    copy.className = "viewer-fishing-catch-copy";
    const heading = document.createElement("small");
    heading.textContent = "钓获";
    const name = document.createElement("strong");
    name.textContent = caught.label;
    name.title = caught.label;
    const count = document.createElement("span");
    count.className = "viewer-fishing-catch-count";
    count.textContent = `×${caught.count}`;
    copy.append(heading, name);
    this.root.replaceChildren(icon, copy, count);
    this.root.hidden = false;
    this.root.dataset.enchanted = String(caught.item.enchanted);
    this.root.setAttribute("aria-label", `钓获 ${caught.label}，${caught.count} 个`);
    this.timer = this.schedule(() => this.advance(), SHOW_MS);
  }

  advance() {
    this.timer = null;
    this.active = null;
    const now = this.now();
    while (this.pending.length) {
      const next = this.pending.shift();
      if (next.atMs >= now - MAX_CATCH_AGE_MS) {
        this.show(next);
        return;
      }
    }
    if (this.root) {
      this.root.hidden = true;
      this.root.replaceChildren();
      this.root.removeAttribute("aria-label");
    }
  }

  /** Host reset/disconnect discards pending catches and reused sequence IDs. */
  reset() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    this.pending.length = 0;
    this.seen.clear();
    this.active = null;
    if (this.root) {
      this.root.hidden = true;
      this.root.replaceChildren();
      this.root.removeAttribute("aria-label");
      delete this.root.dataset.enchanted;
    }
  }

  dispose() {
    this.reset();
    this.disposed = true;
  }
}
