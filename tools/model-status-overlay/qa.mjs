import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const root = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.QA_BASE_URL || "http://127.0.0.1:17840";
const out = path.join(root, "outputs");
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const report = [];
const issues = [];
const context = await browser.newContext({ viewport: { width: 440, height: 290 }, deviceScaleFactor: 1 });
if (process.env.QA_SOURCE_ASSETS === "1") {
  const assets = { "/overlay": "index.html", "/brain": "brain.html", "/app.js": "app.js", "/style.css": "style.css", "/dashboard.css": "dashboard.css" };
  await context.route(url => Object.hasOwn(assets, url.pathname), route =>
    route.fulfill({ path: path.join(root, "public", assets[new URL(route.request().url()).pathname]) }));
}
context.on("page", page => {
  page.on("requestfailed", req => {
    if (["stylesheet", "script"].includes(req.resourceType())) issues.push(req.url() + ": " + req.failure()?.errorText);
  });
});

function reasoningFixture(modes, depths, confirmedSamples = null) {
  const samples = Object.values(modes).reduce((a, b) => a + b, 0);
  return { samples, confirmedSamples, thinkingCounts: modes, effortCounts: depths,
    thinkingRates: Object.fromEntries(Object.entries(modes).map(([key, n]) => [key, samples ? n / samples : null])),
    effortRates: Object.fromEntries(Object.entries(depths).map(([key, n]) => [key, samples ? n / samples : null])) };
}

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
      requestedReasoning: reasoningFixture({ on: 15, off: 5, unknown: 0 }, { off: 5, low: 10, medium: 5 }),
      effectiveReasoning: reasoningFixture({ on: 8, off: 4, unknown: 4 }, { off: 4, medium: 8, unknown: 4 }, 12),
      routeCounts: { main: 15, system1: 10, planning: 3, reflection: 2, cognition: 0, dream: 0, unknown: 0 },
      contextDistributions: { history_budget: { samples: 20, p50: 3000, p95: 8000 }, matched_input: { samples: 20, p50: 32768, p95: 65536 }, reasoning_budget: { samples: 0, p50: null, p95: null } } }, ...brainChange };
  return { models: [main, { ...model("system1", "Decision-Model-4B"), quant: "BF16", state: "reading", outputMode: "classification",
      inputTps: 16750, outputTps: null, queue: 0, executionSeconds: .032,
      contextTokens: 384, contextLimit: 65536, contextPercent: 384 / 65536 * 100 }],
    tts: { sampledAt: now, freshForSeconds: 16, connected: true, synthesizing: 1, waiting: 3, lastSynthesisSeconds: .82, pending: 2 },
    connections: { sampledAt: now, freshForSeconds: 16, NEKO: 3, MC: 8, unclassified: 5 },
    harness: { source: "harness-metadata", sampledAt: now, sourceAt: now, freshForSeconds: 7, run: "fixture-run", phase: "started",
      window: { coveredSeconds: 24, complete: false }, tools: { calls: 3, returned: 2, errors: 1, active: 1, elapsedMs: { samples: 2, p50: 4, p95: 16 } },
      models: [{ role: "system2", calls: 3, completed: 2, failed: 1, active: 1,
        elapsedMs: { samples: 2, p50: 8500, p95: 12000 }, ttftMs: { samples: 2, p50: 6000, p95: 10000 },
        cacheRatio: .8, cacheSamples: 1, inputTokens: { total: 20000 }, outputTokens: { total: null }, reasoningTokens: { total: null } },
        { role: "system1", calls: 12, completed: 12, failed: 0, active: 0,
          elapsedMs: { samples: 12, p50: 300, p95: 650 }, ttftMs: { samples: 12, p50: 180, p95: 400 },
          cacheRatio: .94, cacheSamples: 12 }],
      learning: { stages: { executed: 1, evaluated: 1, reused: 0 }, latest: [{ method: "rail", stage: "evaluated", author: "fixture-agent", sourceHash: "a".repeat(64), outcome: "unknown" }] } },
    brain, updatedAt: now, serverTime: now };
}

function engineFixture(parallel = false) {
  const data = fixture();
  const reasoning = { requested: { thinking: true, effort: "high", budgetTokens: 4096 },
    effective: { thinking: true, effort: "medium", nativeEffort: "medium", budgetTokens: 1024, budgetStatus: "applied" },
    confirmed: true, confirmation: "serving_template_and_budget_policy" };
  Object.assign(data.models[0], { requestId: "call-engine-1", queueSeconds: .03, reasoning, reasoningTokens: 20 });
  Object.assign(data.brain.selection, { effort: "high", providerConfirmed: true, effectiveThinking: true, effectiveEffort: "medium",
    providerRequestedBudgetTokens: 4096, effectiveReasoningBudgetTokens: 1024, effectiveBudgetStatus: "applied", executionSeconds: 1.5, queueSeconds: .03, reasoningTokens: 20 });
  if (parallel) Object.assign(data.models[0], { reason: "multiple-active-requests", running: 2, contextTokens: null, contextPercent: null,
    inputTps: null, outputTps: null, executionSeconds: null, reasoning: null, reasoningTokens: null, queueSeconds: null,
    activeRequests: [1, 2].map(n => ({ requestId: `call-engine-${n}`, state: "generating", contextTokens: n * 1200,
      executionSeconds: n * 1.5, queueSeconds: .03, inputTps: n * 400, outputTps: n * 20, reasoning })) });
  return data;
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
  await actual.goto(`${base}/overlay`);
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
    await page.goto(`${base}/overlay`);
    await page.waitForFunction(() => document.querySelector("#main .model-name").textContent !== "—");
    await verifyLayout(page, name);
    assert.equal(await page.locator("#brain-thinking-summary").textContent(), "开 — · 关 — · 未知 —");
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
    ["fixture-parallel", { reason: "multiple-active-requests", running: 2, contextTokens: null, contextPercent: null, inputTps: null, outputTps: null, executionSeconds: null,
      activeRequests: engineFixture(true).models[0].activeRequests }],
    ["fixture-stale", { sampledAt: Date.now() / 1000 - 20 }],
  ]) {
    const page = await context.newPage();
    page.on("pageerror", error => issues.push(error.message));
    await page.route("**/api/state", route => route.fulfill({ json: fixture(changes) }));
    await page.goto(`${base}/overlay`);
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
  await disconnected.goto(`${base}/overlay`);
  await disconnected.waitForFunction(() => document.querySelector("#main .model-name").textContent !== "—");
  await disconnected.clock.install();
  await disconnected.clock.fastForward(3000);
  await disconnected.waitForFunction(() => document.querySelector("#monitor-state").textContent === "连接中断");
  await disconnected.clock.fastForward(6000);
  await disconnected.waitForFunction(() => document.querySelector("#main .status").textContent === "断连");
  assert.equal(await disconnected.locator("#main .status").textContent(), "断连");
  assert.equal(await disconnected.locator("#main .output-value").textContent(), "—tok/s");
  await disconnected.close();
  const cases = [
    ["brain-dashboard-actual", null],
    ["brain-dashboard-fixture", fixture],
    ["brain-dashboard-engine-confirmed", engineFixture],
    ["brain-dashboard-parallel", () => engineFixture(true)],
    ["brain-dashboard-services-only", () => ({ ...fixture(), brain: null, harness: null })],
    ["brain-dashboard-mixed-sources", () => {
      const data = fixture(); data.harness.models = []; return data;
    }],
    ["brain-dashboard-stale", () => {
      const data = fixture();
      data.brain.sampledAt -= 20; data.harness.sampledAt -= 20;
      return data;
    }],
    ["brain-dashboard-zero-samples", () => {
      const data = fixture({}, { statistics: null, selection: null });
      data.harness.tools = { calls: 0, returned: 0, errors: 0, active: 0 };
      data.harness.models = [{ role: "system2", calls: 1, active: 1, completed: 0, failed: 0,
        elapsedMs: { samples: 0, p50: 0, p95: 0 }, ttftMs: { samples: 0, p50: 0, p95: 0 }, cacheSamples: 0, cacheRatio: null }];
      data.harness.learning.latest = [];
      return data;
    }],
    ["brain-dashboard-thinking-unknown", () => {
      const data = fixture();
      data.brain.statistics.requestedReasoning = reasoningFixture({ on: 0, off: 0, unknown: 10 }, { unknown: 10 });
      data.brain.statistics.effectiveReasoning = null;
      return data;
    }],
    ["brain-dashboard-thinking-depths", () => {
      const data = fixture();
      const depths = Object.fromEntries(["off", "minimal", "low", "medium", "high", "xhigh", "max", "default", "other", "unknown"].map(key => [key, 1]));
      data.brain.statistics.requestedReasoning = reasoningFixture({ on: 7, off: 1, unknown: 2 }, depths);
      data.brain.statistics.effectiveReasoning = reasoningFixture({ on: 0, off: 0, unknown: 0 }, {}, 0);
      return data;
    }],
  ];
  for (const [name, makeData] of cases) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1040, height: 900 });
    page.on("pageerror", error => issues.push(error.message));
    if (makeData) await page.route("**/api/state", route => route.fulfill({ json: makeData() }));
    await page.goto(`${base}/brain`);
    await page.waitForFunction(() => document.body.dataset.ready === "true");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".dashboard-panel")).display === "grid");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    assert.equal(await page.locator("#diagnostics").getAttribute("open"), null);
    assert.equal(await page.locator("#learning-panel").getAttribute("open"), null);
    await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
    const overviewHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    assert.ok(overviewHeight <= 900, name + " overview should fit one desktop screen; actual " + overviewHeight);
    if (name === "brain-dashboard-fixture") {
      assert.ok(await page.locator(".dashboard-panel").evaluate(n => n.getBoundingClientRect().height <= 760), "overview with reasoning distribution should stay compact");
      assert.equal(await page.locator("#overview-phase").textContent(), "模型决策");
      assert.equal(await page.locator("#requested-thinking").textContent(), "开 75% · 关 25% · 未知 0%");
      assert.equal(await page.locator("#effective-thinking").textContent(), "开 50% · 关 25% · 未知 25%");
      assert.match(await page.locator("#requested-depth").textContent(), /low 50% \(10\)/);
      assert.match(await page.locator("#effective-samples").textContent(), /引擎确认 12 \/ 16/);
      assert.match(await page.locator("#overview-request").textContent(), /本次请求.*medium.*32,768 tok/);
      assert.match(await page.locator("#overview-work").textContent(), /工具调用中 1.*已返回 2.*返回失败 1/);
      assert.match(await page.locator("#overview-coverage").textContent(), /已采样 24 秒/);
      const response = await page.locator("#overview-models").textContent();
      assert.match(response, /系统 2.*6\.0s.*P95 10\.0s.*8\.5s.*80%/);
      assert.match(response, /系统 1.*0\.18s.*0\.30s.*94%/);
      assert.match(await page.locator("#overview-issues").textContent(), /系统 2：1 \/ 2.*游戏工具：1 次返回失败/);
      assert.equal(await page.locator("#harness-methods").isVisible(), false);
      await page.locator("#learning-panel > summary").click();
      assert.equal(await page.locator("#harness-methods").isVisible(), true);
      assert.match(await page.locator("#harness-methods").textContent(), /rail · 评价.*fixture-agent/);
      await page.locator("#diagnostics > summary").click();
      assert.equal(await page.locator("#metric-adaptive").textContent(), "60%");
      assert.equal(await page.locator("#metric-recovery").textContent(), "50%");
      assert.equal(await page.locator("#provider-confirmed").textContent(), "服务确认 —");
      assert.ok((await page.locator("#detail-origin").textContent()).includes("路由 配置 · 阅读 自动选择"));
      await page.clock.install();
      await page.clock.fastForward(2100);
      assert.equal(await page.locator("#diagnostics").getAttribute("open"), "");
      await page.locator("#learning-panel > summary").click();
      await page.locator("#diagnostics > summary").click();
    } else if (name === "brain-dashboard-engine-confirmed" || name === "brain-dashboard-parallel") {
      await page.locator("#diagnostics > summary").click();
      assert.equal(await page.locator("#detail-effective-effort").textContent(), "medium");
      assert.equal(await page.locator("#detail-reasoning-budget").textContent(), "4,096 tok → 1,024 tok");
      assert.equal(await page.locator("#detail-timing").textContent(), "1.5s / 0.03s");
      if (name.endsWith("parallel")) {
        assert.equal(await page.locator("#main .status").textContent(), "并发 2");
        assert.equal(await page.locator("#main .context-numbers").textContent(), "— / 131,072");
        assert.equal(await page.locator("#service-active-requests > div").count(), 2);
        assert.match(await page.locator("#service-active-requests > div").nth(0).textContent(), /call-engine-1.*1,200 tok.*1\.5s/);
        assert.match(await page.locator("#service-active-requests > div").nth(1).textContent(), /call-engine-2.*2,400 tok.*3\.0s/);
      } else {
        assert.equal(await page.locator("#service-reasoning").textContent(), "high → medium");
        assert.equal(await page.locator("#service-budget").textContent(), "4,096 tok → 1,024 tok");
      }
    } else if (name === "brain-dashboard-mixed-sources") {
      assert.match(await page.locator("#overview-issues").textContent(), /模型调用：2 \/ 20 次失败/);
    } else if (name === "brain-dashboard-services-only" || name === "brain-dashboard-stale") {
      assert.equal(await page.locator("#overview-data").isVisible(), false);
      assert.equal(await page.locator("#overview-empty").isVisible(), true);
      assert.equal(await page.locator("#response-panel").isVisible(), false);
      assert.equal(await page.locator("#learning-panel").isVisible(), false);
      assert.equal(await page.locator("#brain-details").isVisible(), false);
      assert.equal(await page.locator("#overview-empty-title").textContent(), name.endsWith("stale") ? "Agent 运行数据已过期" : "尚未接入 Agent 运行数据");
    } else if (name === "brain-dashboard-zero-samples") {
      assert.match(await page.locator("#overview-models").textContent(), /待采样.*待采样/);
      assert.doesNotMatch(await page.locator("#overview-models").textContent(), /0\.00s/);
      assert.equal(await page.locator("#overview-issues").textContent(), "当前采样窗口内未报告失败");
      assert.equal(await page.locator("#learning-panel").isVisible(), false);
      assert.equal(await page.locator("#reasoning-overview").isVisible(), false);
    } else if (name === "brain-dashboard-thinking-unknown") {
      assert.equal(await page.locator("#requested-thinking").textContent(), "开 0% · 关 0% · 未知 100%");
      assert.equal(await page.locator("#effective-thinking").textContent(), "开 — · 关 — · 未知 —");
      assert.equal(await page.locator("#effective-samples").textContent(), "聚合指标待接入");
    } else if (name === "brain-dashboard-thinking-depths") {
      assert.match(await page.locator("#requested-depth").textContent(), /minimal 10%.*xhigh 10%.*max 10%/);
      assert.equal(await page.locator("#effective-thinking").textContent(), "开 — · 关 — · 未知 —");
      assert.equal(await page.locator("#effective-depth").textContent(), "暂无调用样本");
    } else if (await page.evaluate(() => !current.brain?.selection)) {
      assert.equal(await page.locator("#detail-history").textContent(), "— → —");
      assert.equal(await page.locator("#metric-adaptive").textContent(), "—");
    }
    await page.setViewportSize({ width: 440, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    if (name === "brain-dashboard-fixture") await page.screenshot({ path: path.join(out, "brain-dashboard-mobile.png"), fullPage: true });
    await page.close();
  }
  assert.deepEqual(issues, [], "browser errors");
  await fs.writeFile(path.join(out, "layout-report.json"), JSON.stringify({ passed: true, report, browserErrors: issues }, null, 2));
  console.log(JSON.stringify({ passed: true, verifiedViews: report.length, dashboardViews: cases.length, dimensions: "440x290", panel: "424x272", browserErrors: issues }));
} finally {
  await browser.close();
}
