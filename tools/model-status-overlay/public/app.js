"use strict";
const $ = (id) => document.getElementById(id);
const dash = "—";
const finite = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
const integer = (n) => finite(n) ? Math.round(n).toLocaleString("en-US") : dash;
const rate = (n) => finite(n) ? (n >= 1000 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1)) : dash;
const seconds = (n) => finite(n) ? (n > 0 && n < .001 ? "<0.001" : n > 0 && n < .01 ? n.toFixed(3) : n < 1 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.round(n).toLocaleString("en-US")) : dash;
const percent = (n) => finite(n) ? `${n.toFixed(0)}%` : dash;
const phase = { idle: "待命", reading: "读取输入", generating: "生成回答", disconnected: "断连", unknown: "状态未知" };
const brainPhase = { idle: "框架待命", delivering: "接收输入", model: "模型决策", tools: "执行工具", backoff: "等待重试", handoff: "整理上下文" };
const roles = { main: "主意识", system1: "系统1", planning: "规划", reflection: "反思", cognition: "构思", dream: "记忆整理", unknown: "未知" };
const readings = { focused: "聚焦", connected: "连贯", standard: "常规", full: "完整", unknown: "未知" };
const origins = { adaptive: "自动选择", configured: "配置", inherited: "继承配置", fallback: "回退", manual: "人工指定", mixed: "组合来源" };
let current = null;
let receivedAt = 0;
let inFlight = false;
let disconnected = false;
const setText = (id, value) => { const node = $(id); if (node) node.textContent = value; };
const tokens = (n) => finite(n) ? `${integer(n)} tok` : dash;
const shortTokens = (n) => finite(n) ? n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : integer(n) : dash;
const ratio = (n) => finite(n) && n <= 1 ? percent(n * 100) : dash;
const effort = (s) => s?.thinking === false ? "关闭" : s?.thinking === true ? s.effort || "端点默认" : dash;

function setupModel(id, role) {
  const node = $(id);
  node.innerHTML = `<div class="model-top"><span class="role"></span><strong class="model-name">—</strong><span class="quant">—</span><span class="status">断连</span></div><div class="stats"><div class="stat"><span class="stat-label">输入<span class="kind input-kind">实时</span></span><span class="stat-value input-value">—<span class="unit">tok/s</span></span></div><div class="stat"><span class="stat-label">生成<span class="kind output-kind">实时</span></span><span class="stat-value output-value">—<span class="unit">tok/s</span></span></div><div class="stat"><span class="stat-label">排队</span><span class="stat-value queue-value">—</span></div><div class="stat"><span class="stat-label execution-label">本次执行</span><span class="stat-value execution-value">—<span class="unit">s</span></span></div></div><div class="context-line"><div class="context-left"><span class="context-label">上下文</span><span class="context-numbers">— / —</span></div><div class="context-right"><span class="context-percent">—</span><span class="reuse" title="上次单次请求复用的前缀token / 该次完整输入token">上轮复用 <b>—</b></span></div></div><div class="progress"><span></span></div>`;
  node.querySelector(".role").textContent = role;
}
setupModel("main", "主模型");
setupModel("system1", "系统1");

function writeValue(node, cls, value, unit = "") {
  const target = node.querySelector(cls);
  target.replaceChildren(document.createTextNode(value));
  if (unit) {
    const suffix = document.createElement("span");
    suffix.className = "unit";
    suffix.textContent = unit;
    target.append(suffix);
  }
}

function expired(source, age) {
  return !finite(source?.sampledAt) || age > (source.freshForSeconds ?? 7) || current.serverTime + age - source.sampledAt > (source.freshForSeconds ?? 7);
}

function renderModel(model, age) {
  const node = $(model.id);
  if (!node) return;
  const stale = expired(model, age);
  const m = stale ? { ...model, state: "disconnected", inputTps: null, outputTps: null, queue: null, executionSeconds: null, contextTokens: null, contextLimit: null, contextPercent: null, prefixReuseRatio: null } : model;
  const active = ["reading", "generating"].includes(m.state);
  const critical = finite(m.contextPercent) && m.contextPercent >= 90;
  node.className = `model ${active ? "active" : m.state === "disconnected" ? "error" : m.state === "unknown" ? "unknown" : ""} ${critical ? "critical" : finite(m.contextPercent) && m.contextPercent >= 75 ? "warn" : ""}`;
  node.querySelector(".model-name").textContent = m.name || dash;
  node.querySelector(".model-name").title = m.name || "尚无模型身份指标";
  node.querySelector(".quant").textContent = m.quant || dash;
  node.querySelector(".status").textContent = phase[m.state] || "状态未知";
  node.querySelector(".status").title = m.reason === "metrics-unavailable" ? "服务可连接，缺少独立推理指标" : m.reason === "multiple-active-requests" ? `${m.running} 个请求同时运行；未混用不同请求的数据` : m.reason === "not-configured" ? "尚未配置指标地址" : "模型执行状态";
  node.querySelector(".input-kind").textContent = m.inputSpeedKind === "last" ? "上轮" : "实时";
  node.querySelector(".input-kind").title = m.inputSpeedKind === "last" ? "上次推理的输入阶段均速" : "本次请求已读取的新token / 本次输入阶段执行时间";
  node.querySelector(".output-kind").textContent = m.outputSpeedKind === "last" ? "上轮" : "实时";
  writeValue(node, ".input-value", rate(m.inputTps), "tok/s");
  writeValue(node, ".output-value", rate(m.outputTps), "tok/s");
  writeValue(node, ".queue-value", integer(m.queue));
  node.querySelector(".execution-label").textContent = m.executionKind === "last" ? "上次推理" : "本次执行";
  node.querySelector(".execution-label").title = "推理执行时间，不包含此前排队与Agent工具执行";
  writeValue(node, ".execution-value", seconds(finite(m.executionSeconds) ? m.executionSeconds + (active ? age : 0) : null), "s");
  node.querySelector(".context-label").textContent = m.contextKind === "last" ? "上次上下文" : "本次上下文";
  node.querySelector(".context-numbers").textContent = `${integer(m.contextTokens)} / ${integer(m.contextLimit)}`;
  node.querySelector(".context-numbers").title = "完整输入：系统提示、历史、工具与复用前缀；不包含本次生成输出";
  node.querySelector(".context-percent").replaceChildren(document.createTextNode(finite(m.contextPercent) ? `${m.contextPercent.toFixed(1)}%` : dash));
  if (critical) {
    const warning = document.createElement("span");
    warning.className = "near-limit";
    warning.textContent = "接近上限";
    node.querySelector(".context-percent").append(warning);
  }
  node.querySelector(".reuse b").textContent = finite(m.prefixReuseRatio) ? percent(m.prefixReuseRatio * 100) : dash;
  node.querySelector(".progress span").style.width = `${finite(m.contextPercent) ? Math.min(100, m.contextPercent) : 0}%`;
}

function renderBrain(age) {
  const b = current.brain || {};
  const fresh = !expired(b, age);
  const s = fresh ? b.selection : null;
  const w = fresh ? b.statistics : null;
  const config = b.configuration || {};
  const cfg = !expired({ ...config, freshForSeconds: 7 }, age) ? config : {};
  setText("brain-scope", s?.scope === "last" ? "上次策略" : "本次策略");
  setText("brain-route", s ? `${roles[s.role] || dash} → ${s.model || dash}` : dash);
  if ($("brain-route")) $("brain-route").title = s ? `${origins[s.origin] || dash} · ${s.model || dash}` : "逐次策略指标尚未提供";
  setText("brain-reading", readings[s?.reading] || dash);
  setText("brain-effort", effort(s));
  setText("brain-budget", `历史预算 ${shortTokens(s?.historyTokens)} · 增长 ${shortTokens(s?.growthTokens)}`);
  setText("brain-adaptive", ratio(w?.adaptiveRate));
  setText("brain-fallback", ratio(w?.fallbackRate));
  setText("brain-window", w && w.complete !== true ? "10分·部分" : "10分");
  const strip = document.querySelector(".brain-strip");
  if (strip) strip.className = `brain-strip ${s?.origin === "adaptive" ? "is-adaptive" : s?.origin === "fallback" ? "is-fallback" : ""}`;

  setText("selection-title", s?.scope === "last" ? "上次策略" : "本次策略");
  setText("selection-source", s ? `第 ${integer(s.round)} 轮 · ${origins[s.origin] || dash}` : fresh ? "已连接 · 逐次策略待接入" : "逐次策略待接入");
  setText("detail-route", s ? `${roles[s.role] || dash} / ${s.model || dash}` : dash);
  setText("detail-origin", s ? `路由 ${origins[s.routeOrigin] || dash} · 阅读 ${origins[s.readingOrigin] || dash} · 思考 ${origins[s.reasoningOrigin] || dash}` : dash);
  setText("detail-reading", `${readings[s?.proposedReading] || dash} → ${readings[s?.reading] || dash}`);
  setText("detail-effort", `${({ immediate: "即时", routine: "常规", deliberate: "深入" })[s?.proposedReasoning] || dash} → ${effort(s)}`);
  setText("provider-confirmed", `服务确认 ${s?.providerConfirmed === true ? "已确认" : s?.providerConfirmed === false ? "未确认" : dash}`);
  setText("detail-history", `${tokens(s?.requestedHistoryTokens)} → ${tokens(s?.historyTokens)}`);
  setText("detail-growth", tokens(s?.growthTokens));
  setText("detail-estimated", tokens(s?.estimatedInputTokens));
  setText("detail-actual", tokens(s?.actualInputTokens));
  setText("detail-reasoning-budget", tokens(s?.reasoningBudgetTokens));
  setText("detail-selector", finite(s?.selectorMs) ? `${rate(s.selectorMs)} ms` : dash);

  const coverage = !w ? "统计待接入" : w.complete === true ? "完整窗口 · 600秒" : finite(w.coveredSeconds) ? `部分覆盖 · ${integer(w.coveredSeconds)} / 600秒` : "覆盖时长未知";
  setText("window-coverage", coverage);
  for (const [id, value] of [["adaptive", w?.adaptiveRate], ["fallback", w?.fallbackRate], ["failed", w?.failedCallRate], ["success", w?.taskSuccessRate], ["recovery", w?.recoveryRate]]) setText(`metric-${id}`, ratio(value));
  setText("metric-adaptive-count", `${integer(w?.adaptive_applied)} / ${integer(w?.eligible_requests)} 个适用请求`);
  setText("metric-fallback-count", `${integer(w?.fallbackCount)} / ${integer(w?.selector_attempts)} 次选择尝试`);
  setText("metric-failed-count", `${integer(w?.failed_calls)} / ${integer(w?.calls)} 次调用`);
  setText("metric-success-count", `${integer(w?.verified_success)} / ${integer(w?.verifiedTotal)} 个已验证终态`);
  setText("metric-recovery-count", `${integer(w?.recovered)} / ${integer(w?.recovery_cases)} 个已结案失败案例`);
  setText("metric-retries", integer(w?.retries));
  setText("metric-unknown", integer(w?.unknown_tasks));
  setText("metric-tokens", `${integer(w?.input_tokens)} / ${integer(w?.output_tokens)} / ${integer(w?.reasoning_tokens)}`);
  const distribution = (counts, labels) => !counts ? dash : Object.entries(labels).map(([key, text]) => `${text} ${integer(counts[key])}`).join(" · ");
  setText("reading-distribution", distribution(w?.readingCounts, readings));
  setText("effort-distribution", distribution(w?.effortCounts, { off: "关闭", low: "low", medium: "medium", high: "high", default: "默认", other: "其他", unknown: "未知" }));
  setText("route-distribution", distribution(w?.routeCounts, roles));
  for (const [id, key] of [["history", "history_budget"], ["input", "matched_input"], ["reasoning", "reasoning_budget"]]) {
    const dist = w?.contextDistributions?.[key];
    setText(`${id}-percentiles`, `${integer(dist?.p50)} / ${integer(dist?.p95)} tok · ${integer(dist?.samples)} 个样本`);
  }

  const automatic = (value) => value === true ? "已配置启用" : value === false ? "已配置关闭" : "未声明";
  setText("policy-source", finite(cfg.sampledAt) ? "配置快照 · 本次选择单独报告" : "配置未知");
  setText("policy-summary", finite(cfg.sampledAt) ? `自适应阅读 ${automatic(cfg.automaticReading)}；聚焦历史 ${tokens(cfg.focusedHistoryTokens)}，常规历史 ${tokens(cfg.standardHistoryTokens)}，增长预算 ${cfg.growthTokens === 0 ? "随应用历史预算" : tokens(cfg.growthTokens)}。自动思考档位 ${automatic(cfg.automaticReasoning)}。` : dash);
  setText("active-connection", fresh ? `活动主连接 ${b.activeConnection?.name || dash} / ${b.activeConnection?.model || dash} · 阶段预算 ${tokens(b.stageBudgetTokens)} · 框架输入硬限 ${tokens(b.inputHardLimit)}` : "活动主连接 —");
  return fresh ? brainPhase[b.phase] : null;
}

function render() {
  if (!current) return;
  const age = Math.max(0, (performance.now() - receivedAt) / 1000);
  const frameworkPhase = renderBrain(age);
  for (const model of current.models) renderModel(model, age);
  const tts = expired(current.tts, age) ? {} : current.tts;
  $("tts-active").textContent = integer(tts.synthesizing);
  $("tts-waiting").textContent = integer(tts.waiting);
  $("tts-duration").textContent = finite(tts.lastSynthesisSeconds) ? `${seconds(tts.lastSynthesisSeconds)}s` : dash;
  $("tts-pending").textContent = integer(tts.pending);
  $("tts-dot").className = `tiny-dot ${tts.connected === true ? "active" : tts.connected === false ? "error" : ""}`;
  $("tts-label").textContent = tts.connected === false ? "断连" : "本地合成";
  const con = expired(current.connections, age) ? {} : current.connections;
  $("neko").textContent = integer(con.NEKO);
  $("mc").textContent = integer(con.MC);
  $("unclassified").hidden = !finite(con.unclassified) || con.unclassified === 0;
  $("unclassified").querySelector("i").textContent = integer(con.unclassified);
  const anyFresh = !!frameworkPhase || current.models.some((m) => !expired(m, age));
  const anyActive = (!!frameworkPhase && current.brain?.phase !== "idle") || current.models.some((m) => !expired(m, age) && ["reading", "generating"].includes(m.state));
  $("signal").className = `signal ${anyActive ? "active" : anyFresh ? "" : "error"}`;
  $("monitor-state").textContent = age > 7 ? "数据已过期" : disconnected ? "连接中断" : frameworkPhase || "只读监测";
  $("updated").textContent = finite(current.updatedAt) ? `更新 ${new Date(current.updatedAt * 1000).toLocaleTimeString("zh-CN", { hour12: false })}` : "更新 —";
}

async function refresh() {
  if (inFlight) return;
  inFlight = true;
  try {
    const response = await fetch("/api/state", { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error("unavailable");
    const value = await response.json();
    if (!Array.isArray(value.models) || !value.tts || !value.connections) throw new Error("invalid-metadata");
    current = value;
    document.body.dataset.ready = "true";
    receivedAt = performance.now();
    disconnected = false;
    render();
  } catch {
    disconnected = true;
    $("monitor-state").textContent = "连接中断";
  } finally {
    inFlight = false;
  }
}
refresh();
setInterval(refresh, 2000);
setInterval(render, 250);
