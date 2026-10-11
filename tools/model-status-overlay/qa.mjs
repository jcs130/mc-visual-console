import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, "outputs");
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const report = [];
const issues = [];
const context = await browser.newContext({ viewport: { width: 440, height: 290 }, deviceScaleFactor: 1 });

function fixture(change = {}, brainChange = {}) {
  const now = Date.now() / 1000;
  const model = (id, name) => ({ id, label: id, name, quant: "Q4_K_M", state: "generating", reason: null,
    sampledAt: now, freshForSeconds: 7, queue: 12, inputTps: 2543.2, outputTps: 47.6,
    inputSpeedKind: "realtime", outputSpeedKind: "realtime", executionSeconds: 18.1,
    executionKind: "current", prefixReuseRatio: .7219, contextTokens: 32768, contextLimit: 131072,
    contextPercent: 25, contextKind: "current" });
  const main = { ...model("main", "Main-Model-27B"), ...change };
  const brain = { sampledAt: now, sourceAt: now, freshForSeconds: 7, connected: true, source: "brain-metrics",
    phase: main.state === "idle" ? "idle" : "model", activeConnection: { name: "local", model: "main-model" }, stageBudgetTokens: 131072, inputHardLimit: 256144,
    configuration: { sampledAt: now, automaticReading: true, automaticReasoning: true, focusedHistoryTokens: 3000, standardHistoryTokens: 8000, growthTokens: 16384 },
    selection: { scope: main.state === "idle" ? "last" : "current", round: 42, role: "main", model: "main-model-with-long-identity",
      origin: "mixed", routeOrigin: "configured", readingOrigin: "adaptive", reasoningOrigin: "adaptive", reading: "focused", proposedReading: "focused",
      thinking: true, effort: "medium", proposedReasoning: "deliberate", providerConfirmed: null, historyTokens: 3000, requestedHistoryTokens: 3000, growthTokens: 16384,
      estimatedInputTokens: 33000, actualInputTokens: main.contextTokens, selectorMs: 43.5, reasoningBudgetTokens: null },
    statistics: { complete: true, coveredSeconds: 600, adaptiveRate: .6, fallbackRate: .1, eligible_requests: 20, adaptive_applied: 12, fallbackCount: 1, selector_attempts: 10,
      failedCallRate: .1, calls: 20, failed_calls: 2, retries: 2, taskSuccessRate: .8, verified_success: 8, verifiedTotal: 10, unknown_tasks: 3,
      recoveryRate: .5, recovered: 2, recovery_cases: 4, input_tokens: 1000000, output_tokens: 10000, reasoning_tokens: 2000,
      readingCounts: { focused: 12, connected: 8, standard: 0, full: 0, unknown: 0 },
      effortCounts: { off: 5, low: 10, medium: 5, high: 0, default: 0, other: 0, unknown: 0 },
      routeCounts: { main: 15, system1: 10, planning: 3, reflection: 2, cognition: 0, dream: 0, unknown: 0 },
      contextDistributions: { history_budget: { samples: 20, p50: 3000, p95: 8000 }, matched_input: { samples: 20, p50: 32768, p95: 65536 }, reasoning_budget: { samples: 0, p50: null, p95: null } } }, ...brainChange };
  return { models: [main, { ...model("system1", "Decision-Model-4B"), quant: "BF16", state: "reading",
      inputTps: 16750, outputTps: null, queue: 0, executionSeconds: .032,
      contextTokens: 384, contextLimit: 65536, contextPercent: 384 / 65536 * 100 }],
    tts: { sampledAt: now, freshForSeconds: 16, connected: true, synthesizing: 1, waiting: 3, lastSynthesisSeconds: .82, pending: 2 },
    connections: { sampledAt: now, freshForSeconds: 16, NEKO: 3, MC: 8, unclassified: 5 },
    brain, updatedAt: now, serverTime: now };
}

async function verifyLayout(page, label) {
  const result = await page.evaluate(() => {
    const panel = document.querySelector(".panel");
    const p = panel.getBoundingClientRect();
    const bad = [];
    for (const node of panel.querySelectorAll("*")) {
      const r = node.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.left < p.left || r.top < p.top || r.right > p.right + .5 || r.bottom > p.bottom + .5) bad.push(node.id || node.className || node.tagName);
    }
    const textOverflow = [...panel.querySelectorAll(".stat-value,.context-line,.tts-values,footer,.model,.brain-strip,.brain-line")]
      .filter(n => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1)
      .map(n => n.id || n.className);
    return { panel: { x: p.x, y: p.y, width: p.width, height: p.height },
      body: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      bad, textOverflow, background: getComputedStyle(document.body).backgroundColor };
  });
  assert.deepEqual(result.panel, { x: 8, y: 9, width: 424, height: 272 }, label);
  assert.deepEqual(result.body, { width: 440, height: 290, scrollWidth: 440, scrollHeight: 290 }, label);
  assert.deepEqual(result.bad, [], label + " visible elements outside panel");
  assert.deepEqual(result.textOverflow, [], label + " clipped contents");
  assert.equal(result.background, "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: path.join(out, `${label}.png`), omitBackground: true });
  report.push({ label, ...result });
}

try {
  const actual = await context.newPage();
  actual.on("pageerror", error => issues.push(error.message));
  actual.on("console", msg => { if (msg.type() === "error" && !msg.text().includes("favicon")) issues.push(msg.text()); });
  await actual.goto("http://127.0.0.1:17840/overlay");
  await actual.waitForFunction(() => document.body.dataset.ready === "true");
  await verifyLayout(actual, "actual-440x290");
  await actual.close();

  for (const [name, brainChange] of [
    ["fixture-brain-missing", { selection: null, statistics: null }],
    ["fixture-brain-stale", { sampledAt: Date.now() / 1000 - 20 }],
    ["fixture-brain-zero-samples", { statistics: { complete: false, coveredSeconds: 0, adaptiveRate: null, fallbackRate: null, eligible_requests: 0, adaptive_applied: 0 } }],
  ]) {
    const page = await context.newPage();
    await page.route("**/api/state", route => route.fulfill({ json: fixture({}, brainChange) }));
    await page.goto("http://127.0.0.1:17840/overlay");
    await page.waitForFunction(() => document.querySelector("#main .model-name").textContent !== "—");
    await verifyLayout(page, name);
    assert.equal(await page.locator("#brain-adaptive").textContent(), "—");
    if (name !== "fixture-brain-zero-samples") assert.equal(await page.locator("#brain-route").textContent(), "—");
    await page.close();
  }

  for (const [name, changes] of [
    ["fixture-generating", {}],
    ["fixture-idle", { state: "idle", inputSpeedKind: "last", outputSpeedKind: "last", executionKind: "last", contextKind: "last" }],
    ["fixture-75percent", { contextTokens: 98304, contextPercent: 75 }],
    ["fixture-90percent", { contextTokens: 117965, contextPercent: 90 }],
    ["fixture-large-context", { contextTokens: 1992294, contextLimit: 2097152, contextPercent: 95, inputTps: 100000, outputTps: 100000 }],
    ["fixture-missing-current", { contextTokens: null, contextPercent: null, inputTps: null, outputTps: null, executionSeconds: null, queue: null }],
    ["fixture-stale", { sampledAt: Date.now() / 1000 - 20 }],
  ]) {
    const page = await context.newPage();
    page.on("pageerror", error => issues.push(error.message));
    await page.route("**/api/state", route => route.fulfill({ json: fixture(changes) }));
    await page.goto("http://127.0.0.1:17840/overlay");
    await page.waitForFunction(() => document.querySelector("#main .model-name").textContent !== "—");
    await verifyLayout(page, name);
    if (changes.contextPercent >= 90) {
      assert.ok(await page.locator("#main").evaluate(n => n.classList.contains("critical")));
      assert.equal(await page.locator("#main .near-limit").textContent(), "接近上限");
    }
    if (changes.contextPercent === 75) assert.ok(await page.locator("#main").evaluate(n => n.classList.contains("warn")));
    if (name === "fixture-idle") assert.equal(await page.locator("#main .context-label").textContent(), "上次上下文");
    if (name === "fixture-stale") {
      assert.equal(await page.locator("#main .status").textContent(), "断连");
      assert.equal(await page.locator("#main .context-numbers").textContent(), "— / —");
    }
    await page.close();
  }

  const disconnected = await context.newPage();
  let samples = 0;
  await disconnected.route("**/api/state", route => ++samples === 1 ? route.fulfill({ json: fixture() }) : route.abort());
  await disconnected.goto("http://127.0.0.1:17840/overlay");
  await disconnected.waitForFunction(() => document.querySelector("#main .model-name").textContent !== "—");
  await disconnected.clock.install();
  await disconnected.clock.fastForward(3000);
  await disconnected.waitForFunction(() => document.querySelector("#monitor-state").textContent === "连接中断");
  await disconnected.clock.fastForward(6000);
  await disconnected.waitForFunction(() => document.querySelector("#main .status").textContent === "断连");
  assert.equal(await disconnected.locator("#main .status").textContent(), "断连");
  assert.equal(await disconnected.locator("#main .output-value").textContent(), "—tok/s");
  await disconnected.close();
  for (const [name, useFixture] of [["brain-dashboard-actual", false], ["brain-dashboard-fixture", true]]) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1040, height: 900 });
    page.on("pageerror", error => issues.push(error.message));
    if (useFixture) await page.route("**/api/state", route => route.fulfill({ json: fixture() }));
    await page.goto("http://127.0.0.1:17840/brain");
    await page.waitForFunction(() => document.body.dataset.ready === "true");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
    if (useFixture) {
      assert.equal(await page.locator("#metric-adaptive").textContent(), "60%");
      assert.equal(await page.locator("#metric-recovery").textContent(), "50%");
      assert.equal(await page.locator("#provider-confirmed").textContent(), "服务确认 —");
      assert.ok((await page.locator("#detail-origin").textContent()).includes("路由 配置 · 阅读 自动选择"));
    } else if (await page.evaluate(() => !current.brain?.selection)) {
      assert.equal(await page.locator("#detail-history").textContent(), "— → —");
      assert.equal(await page.locator("#metric-adaptive").textContent(), "—");
    }
    await page.setViewportSize({ width: 440, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.close();
  }
  assert.deepEqual(issues, [], "browser errors");
  await fs.writeFile(path.join(out, "layout-report.json"), JSON.stringify({ passed: true, report, browserErrors: issues }, null, 2));
  console.log(JSON.stringify({ passed: true, verifiedViews: report.length, dashboardViews: 2, dimensions: "440x290", panel: "424x272", browserErrors: issues }));
} finally {
  await browser.close();
}
