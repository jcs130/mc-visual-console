import test from "node:test";
import assert from "node:assert/strict";
import { FishingCatchHud, normalizeFishingCatch } from "../src/modern-viewer/fishing-catch.js";

const TIME = 1_000_000;
const caught = (seq = 1, item = { name: "cod", displayName: "鳕鱼" }, extra = {}) => ({
  seq, atMs: TIME, item, count: 1, ...extra,
});

class Element {
  constructor(tag, document) {
    this.tagName = tag;
    this.ownerDocument = document;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.events = new Map();
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, fn) { this.events.set(name, fn); }
}

function harness() {
  let time = TIME;
  let nextId = 0;
  const timers = new Map();
  const document = { createElement: (tag) => new Element(tag, document) };
  const root = new Element("section", document);
  const decorations = [];
  const hud = new FishingCatchHud({
    root,
    now: () => time,
    schedule: (callback, delay) => {
      const id = ++nextId;
      timers.set(id, { callback, time: time + delay });
      return id;
    },
    cancel: (id) => timers.delete(id),
    renderIcon: (icon, item) => {
      decorations.push(item);
      if (item.enchanted) icon.append(new Element("glint", document));
    },
  });
  return { hud, root, timers, decorations, advance(ms) {
    time += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.time <= time) {
        timers.delete(id);
        timer.callback();
      }
    }
  } };
}

test("only concrete fresh host catch facts produce a card", () => {
  assert.equal(normalizeFishingCatch(caught(), TIME).label, "鳕鱼");
  for (const event of [
    null, {}, { inventory: [{ name: "cod", count: 1 }] },
    caught(1, null), caught(1, { displayName: "鱼" }),
    caught(1, { name: "../diamond" }), caught(1, { name: "minecraft:cod?x" }),
    caught(1, undefined, { count: 0 }), caught(1, undefined, { count: 1.5 }),
    caught(1, undefined, { atMs: TIME - 15_001 }),
    caught(1, undefined, { atMs: TIME + 30_001 }),
    caught(-1), caught(1.5),
  ]) assert.equal(normalizeFishingCatch(event, TIME), null);
  assert.equal(normalizeFishingCatch(caught(1, { name: "enchanted_book" }), TIME).label, "enchanted_book");
});

test("custom names and the caught count take priority over generic item and stack labels", () => {
  const event = caught(1, { name: "minecraft:bow", displayName: "Bow", customName: "§d潮汐之弓", count: 64,
    enchanted: true, headTextureHash: "a".repeat(64) }, { count: 2 });
  const result = normalizeFishingCatch(event, TIME);
  assert.equal(result.label, "潮汐之弓");
  assert.equal(result.count, 2);
  assert.equal(result.item.count, 2);
  assert.equal(result.item.enchanted, true);
  assert.equal(result.item.headTextureHash, "a".repeat(64));
  assert.equal(event.item.count, 64);
  assert.equal(normalizeFishingCatch(caught(2, { name: "salmon", displayName: { text: "鲑鱼" },
    customName: ["unexpected"] }), TIME).label, "salmon");
});

test("the DOM card displays literal text, validated icon path, and existing enchant decoration", () => {
  const { hud, root, decorations } = harness();
  const name = "<img src=x onerror=alert(1)>";
  hud.push(caught(1, { name: "minecraft:bow", customName: name, enchanted: true }, { count: 2 }));
  assert.equal(root.hidden, false);
  assert.equal(root.children[0].children[0].src, "/icons/bow.png");
  assert.equal(root.children[1].children[1].textContent, name);
  assert.equal(root.children[2].textContent, "×2");
  assert.equal(root.dataset.enchanted, "true");
  assert.equal(decorations[0].enchanted, true);
  assert.equal(root.children[0].children[1].tagName, "glint");
  const image = root.children[0].children[0];
  image.events.get("error")();
  assert.equal(image.hidden, true);
  assert.equal(root.children[1].children[1].textContent, name);
});

test("duplicate event delivery does not extend the active catch or create a duplicate card", () => {
  const { hud, root, timers, advance } = harness();
  assert.equal(hud.push(caught(1)), true);
  advance(4_000);
  assert.equal(hud.push(caught(1)), false);
  assert.equal(hud.pending.length, 0);
  assert.equal(timers.size, 1);
  advance(500);
  assert.equal(root.hidden, true);
  assert.equal(root.children.length, 0);
});

test("foreign item namespaces do not borrow an unrelated vanilla icon", () => {
  const { hud, root } = harness();
  hud.push(caught(1, { name: "other:cod", customName: "海底遗物" }));
  assert.equal(root.children[0].children.length, 0);
  assert.equal(root.children[1].children[1].textContent, "海底遗物");
});

test("a catch burst remains bounded, shows the latest pending catches, and expires", () => {
  const { hud, root, timers, advance } = harness();
  for (let seq = 1; seq <= 6; seq++) hud.push(caught(seq));
  assert.equal(hud.active.seq, 1);
  assert.deepEqual(hud.pending.map((row) => row.seq), [4, 5, 6]);
  assert.equal(timers.size, 1);
  advance(4_500);
  assert.equal(hud.active.seq, 4);
  advance(4_500);
  assert.equal(hud.active.seq, 5);
  advance(4_500);
  assert.equal(hud.active.seq, 6);
  advance(4_500);
  assert.equal(root.hidden, true);
  assert.equal(timers.size, 0);
});

test("stalled tabs skip expired queued catches instead of replaying old loot", () => {
  const { hud, root, advance } = harness();
  hud.push(caught(1));
  hud.push(caught(2));
  advance(16_000);
  assert.equal(root.hidden, true);
  assert.equal(hud.pending.length, 0);
  assert.equal(hud.active, null);
});

test("disconnect/reset clears catches and allows a new session to reuse sequence numbers", () => {
  const { hud, root, timers } = harness();
  hud.push(caught(1));
  hud.push(caught(2));
  hud.reset();
  assert.equal(root.hidden, true);
  assert.equal(root.children.length, 0);
  assert.equal(hud.pending.length, 0);
  assert.equal(hud.seen.size, 0);
  assert.equal(timers.size, 0);
  assert.equal(hud.push(caught(1)), true);
  assert.equal(hud.active.seq, 1);
});

test("default timers preserve the browser global receiver when advancing and clearing cards", () => {
  const originalSchedule = globalThis.setTimeout;
  const originalCancel = globalThis.clearTimeout;
  const timers = new Map();
  let nextId = 0;
  const document = { createElement: (tag) => new Element(tag, document) };
  const root = new Element("section", document);
  try {
    // Native browser timers reject a detached call with the HUD as receiver.
    globalThis.setTimeout = function (callback, delay) {
      assert.equal(this, globalThis);
      const id = ++nextId;
      timers.set(id, { callback, delay });
      return id;
    };
    globalThis.clearTimeout = function (id) {
      assert.equal(this, globalThis);
      timers.delete(id);
    };
    const hud = new FishingCatchHud({ root, now: () => TIME });
    hud.push(caught(1));
    hud.push(caught(2));
    const first = timers.get(hud.timer);
    assert.equal(first.delay, 4_500);
    timers.delete(hud.timer);
    first.callback();
    assert.equal(hud.active.seq, 2);
    assert.equal(timers.size, 1);
    hud.reset();
    assert.equal(root.hidden, true);
    assert.equal(timers.size, 0);
  } finally {
    globalThis.setTimeout = originalSchedule;
    globalThis.clearTimeout = originalCancel;
  }
});

test("long sessions retain only bounded deduplication state and disposed cards ignore events", () => {
  const { hud, root, timers } = harness();
  for (let seq = 1; seq <= 100; seq++) hud.push(caught(seq));
  assert.equal(hud.seen.size, 64);
  assert.equal(hud.pending.length, 3);
  hud.dispose();
  assert.equal(hud.push(caught(101)), false);
  assert.equal(root.hidden, true);
  assert.equal(timers.size, 0);
});
