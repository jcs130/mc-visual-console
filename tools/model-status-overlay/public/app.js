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
const effort = (s) => s?.thinking === false ? "关闭" : s?.effort || (s?.thinking === true ? "端点默认" : dash);

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
  node.querySelector(".status").textContent = m.reason === "multiple-active-requests" ? finite(m.running) ? `并发 ${integer(m.running)}` : "多请求" : phase[m.state] || "状态未知";
  node.querySelector(".status").title = m.reason === "metrics-unavailable" ? "服务可连接，缺少独立推理指标" : m.reason === "multiple-active-requests" ? `${m.running} 个请求同时运行；未混用不同请求的数据` : m.reason === "not-configured" ? "尚未配置指标地址" : "模型执行状态";
  node.querySelector(".input-kind").textContent = m.inputSpeedKind === "last" ? "上轮" : "实时";
  node.querySelector(".input-kind").title = m.inputSpeedKind === "last" ? "上次推理的输入阶段均速" : "本次请求已读取的新token / 本次输入阶段执行时间";
  node.querySelector(".output-kind").textContent = m.outputSpeedKind === "last" ? "上轮" : "实时";
  writeValue(node, ".input-value", rate(m.inputTps), "tok/s");
  writeValue(node, ".output-value", m.outputMode === "classification" ? "不适用" : rate(m.outputTps), m.outputMode === "classification" ? "" : "tok/s");
  node.querySelector(".output-value").title = m.outputMode === "classification" ? "此模型通过分类选择动作，不逐 token 生成回答" : "引擎生成阶段速率";
  if (m.outputMode === "classification") node.querySelector(".input-kind").title = "上次分类各次前向处理的 token 总数 / 取得执行锁后的分类耗时";
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
  setText("detail-effective-effort", s?.providerConfirmed === true ? effort({ thinking: s.effectiveThinking, effort: s.effectiveEffort }) : dash);
  setText("detail-history", `${tokens(s?.requestedHistoryTokens)} → ${tokens(s?.historyTokens)}`);
  setText("detail-growth", tokens(s?.growthTokens));
  setText("detail-estimated", tokens(s?.estimatedInputTokens));
  setText("detail-actual", tokens(s?.actualInputTokens));
  setText("detail-reasoning-budget", `${tokens(s?.providerRequestedBudgetTokens ?? s?.reasoningBudgetTokens)} → ${s?.effectiveBudgetStatus === "disabled" ? "关闭" : tokens(s?.effectiveReasoningBudgetTokens)}`);
  setText("detail-timing", `${duration(s?.executionSeconds)} / ${duration(s?.queueSeconds)}`);
  setText("detail-reasoning-tokens", integer(s?.reasoningTokens));
  setText("detail-selector", finite(s?.selectorMs) ? `${rate(s.selectorMs)} ms` : dash);

  const coverage = !w ? "统计待接入" : w.complete === true ? "完整窗口 · 600秒" : finite(w.coveredSeconds) ? `部分覆盖 · ${integer(w.coveredSeconds)} / 600秒` : "覆盖时长未知";
  setText("window-coverage", coverage);
  for (const [id, value] of [["adaptive", w?.adaptiveRate], ["fallback", w?.fallbackRate], ["failed", w?.failedCallRate], ["success", w?.taskSuccessRate], ["recovery", w?.recoveryRate]]) setText(`metric-${id}`, ratio(value));
  setText("metric-adaptive-count", `${integer(w?.adaptive_applied)} / ${integer(w?.eligible_requests)} 个适用请求`);
  setText("metric-fallback-count", `${integer(w?.fallbackCount)} / ${integer(w?.selector_attempts)} 次选择尝试`);
  setText("metric-failed-count", `${integer(w?.failed_calls)} / ${integer(w?.calls)} 次调用`);
  setText("metric-success-count", w?.taskVerificationAvailable === false ? "等待环境验证回执" : `${integer(w?.verified_success)} / ${integer(w?.verifiedTotal)} 个已验证终态`);
  setText("metric-recovery-count", w?.recoveryAvailable === false ? "尚缺失败与策略变更关联" : `${integer(w?.recovered)} / ${integer(w?.recovery_cases)} 个已结案失败案例`);
  setText("metric-retries", integer(w?.retries));
  setText("metric-unknown", integer(w?.unknown_tasks));
  setText("metric-tokens", `${integer(w?.input_tokens)} / ${integer(w?.output_tokens)} / ${integer(w?.reasoning_tokens)}`);
  const usage = w?.usageSamples;
  setText("usage-coverage", finite(usage?.attempts) ? `实测样本 ${integer(usage.input)} / ${integer(usage.output)} / ${integer(usage.reasoning)}，共 ${integer(usage.attempts)} 次；思考计入输出` : "主模型与后台通道 · 思考是输出的子集");
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

function duration(value) { return finite(value) ? `${seconds(value)}s` : dash; }

function renderServiceMetadata(age) {
  if (!$("service-reasoning")) return;
  const model = current.models.find(m => m.id === "main");
  const m = model && !expired(model, age) ? model : {};
  const r = m.reasoning;
  const effective = r?.confirmed === true ? r.effective : null;
  const budget = (parameters) => parameters?.budgetStatus === "disabled" ? "关闭" : tokens(parameters?.budgetTokens);
  setText("service-request-scope", `共享主模型服务 · ${m.reason === "multiple-active-requests" ? "并发请求分别列出" : m.contextKind === "last" ? "上次请求" : "本次请求"} · 来源不代表当前 Agent`);
  setText("service-reasoning", `${effort(r?.requested)} → ${effective ? effort(effective) : dash}`);
  setText("service-confirmation", `服务确认 ${r?.confirmed === true ? "已确认思考参数" : r?.confirmed === false ? "未确认" : dash}`);
  setText("service-budget", `${budget(r?.requested)} → ${budget(effective)}`);
  setText("service-timing", `${duration(m.executionSeconds)} / ${duration(m.queueSeconds)}`);
  setText("service-reasoning-tokens", integer(m.reasoningTokens));
  const list = $("service-active-requests"), rows = m.activeRequests || [];
  list.replaceChildren(); list.hidden = rows.length === 0;
  for (const row of rows) {
    const item = document.createElement("div"), identity = document.createElement("b"), values = document.createElement("span");
    identity.textContent = `${row.requestId.slice(0, 14)} · ${row.state === "queued" ? "排队" : phase[row.state] || "状态未知"}`;
    identity.title = row.requestId;
    const parameters = row.reasoning?.confirmed === true ? row.reasoning.effective : null;
    values.textContent = `输入 ${tokens(row.contextTokens)} · 执行 ${duration(row.executionSeconds)} · 排队 ${duration(row.queueSeconds)} · 输入/生成 ${rate(row.inputTps)} / ${rate(row.outputTps)} tok/s · 思考 ${parameters ? effort(parameters) : dash}`;
    item.append(identity, values); list.append(item);
  }
}

function renderHarness(age) {
  if (!$("harness-state")) return;
  const h = current.harness, fresh = h && !expired(h, age) && h.source === "harness-metadata";
  const methods = fresh ? h.learning?.latest || [] : [];
  $("learning-panel").hidden = methods.length === 0;
  setText("harness-state", fresh ? `运行 ${h.run || dash} · 宿主上报` : "方法记录未验证");
  setText("learning-summary", fresh ? `执行 ${integer(h.learning?.stages?.executed)} · 复用 ${integer(h.learning?.stages?.reused)}` : "");
  const list = $("harness-methods"); list.replaceChildren();
  const stages = { authored: "编写", revised: "修订", validated: "校验", executed: "执行", evaluated: "评价", reused: "复用", reverted: "回退" };
  for (const m of methods.slice(-5).reverse()) {
    const item = document.createElement("div");
    item.className = "method-record";
    const name = document.createElement("b"), version = document.createElement("small");
    name.textContent = `${m.method || dash} · ${stages[m.stage] || m.stage || dash}`;
    version.textContent = `作者 ${m.author || dash} · ${m.sourceHash?.slice(0, 12) || dash}${m.parentHash ? ` ← ${m.parentHash.slice(0, 12)}` : ""}`;
    item.append(name, version);
    item.title = `制品 ${m.artifact || dash}\n源码 ${m.sourceHash || dash}\n执行 ${m.executionId || dash}\n回执 ${m.receipt || dash}`;
    list.append(item);
  }
}

function renderOverview(age) {
  if (!$("overview-data")) return;
  const raw = current.harness;
  const h = raw?.source === "harness-metadata" && !expired(raw, age) ? raw : null;
  const b = current.brain && !expired(current.brain, age) ? current.brain : null;
  const usefulBrain = !!(b && (brainPhase[b.phase] || b.selection || b.statistics));
  const available = !!h || usefulBrain;
  $("overview-data").hidden = !available;
  $("overview-empty").hidden = available;
  const stale = raw?.source === "stale" || current.brain?.source === "stale" ||
    (finite(raw?.sampledAt) && expired(raw, age)) || (finite(current.brain?.sampledAt) && expired(current.brain, age));
  setText("overview-empty-title", stale ? "Agent 运行数据已过期" : "尚未接入 Agent 运行数据");
  setText("overview-empty-text", stale ? "当前阶段和最近统计未验证，等待恢复采样。" : "接入后显示当前阶段、模型响应耗时和最近失败。");
  const source = usefulBrain ? "框架阶段" : h ? "独立运行时" : "宿主未接入";
  setText("overview-source", source);
  const runtimePhase = { starting: "引擎启动中", started: "引擎已启动", stopping: "引擎停止中", disconnected: "游戏引擎未启动" };
  setText("overview-phase", usefulBrain && brainPhase[b.phase] ? brainPhase[b.phase] : runtimePhase[h?.phase] || "阶段未提供");
  const s = b?.selection;
  setText("overview-request", s ? `${s.scope === "last" ? "上次" : "本次"}请求：${roles[s.role] || "未知通道"} · 思考 ${effort(s)}${finite(s.actualInputTokens) ? ` · 输入 ${tokens(s.actualInputTokens)}` : ""}` : "尚未提供逐次请求信息");
  setText("overview-work", h?.tools ? `工具调用中 ${integer(h.tools.active)} · 已返回 ${integer(h.tools.returned)} · 返回失败 ${integer(h.tools.errors)}` : "工具调用读数未接入");
  const w = h?.window || b?.statistics;
  setText("overview-coverage", w ? `近 10 分钟 · ${w.complete ? "完整采样" : `已采样 ${integer(w.coveredSeconds)} 秒`}` : "统计窗口未提供");
  const models = h?.models?.filter(m => ["system1", "system2"].includes(m.role) && (m.calls > 0 || m.completed > 0 || m.active > 0)) || [];
  $("response-panel").hidden = models.length === 0;
  const list = $("overview-models"); list.replaceChildren();
  const labels = ["模型通道", "首输出", "完整请求", "缓存复用"];
  for (const m of models) {
    const duration = d => d?.samples > 0 && finite(d.p50) && finite(d.p95)
      ? [`${seconds(d.p50 / 1000)}s`, `P95 ${seconds(d.p95 / 1000)}s · ${integer(d.samples)} 次`]
      : ["待采样", "没有有效耗时样本"];
    const roleLabel = m.role === "system2" ? "主决策" : "快决策";
    const values = [[m.role === "system2" ? "系统 2" : "系统 1", `${roleLabel}${m.active > 0 ? ` · 进行中 ${integer(m.active)}` : ""}`],
      duration(m.ttftMs), duration(m.elapsedMs), [m.cacheSamples > 0 ? ratio(m.cacheRatio) : dash, `${integer(m.cacheSamples)} 个样本`]];
    const row = document.createElement("div"); row.className = "response-row";
    for (const [index, value] of values.entries()) {
      const cell = document.createElement("div"), label = document.createElement("span"), strong = document.createElement("strong"), small = document.createElement("small");
      cell.className = "response-cell"; label.className = "mobile-label";
      label.textContent = labels[index]; strong.textContent = value[0]; small.textContent = value[1];
      cell.append(label, strong, small); row.append(cell);
    }
    list.append(row);
  }
  const issues = [];
  const harnessModelFailures = h?.models?.some(m => finite(m.failed));
  for (const m of h?.models || []) if (m.failed > 0)
    issues.push(`${({ system2: "系统 2", system1: "系统 1", background: "后台" })[m.role] || "模型"}：${integer(m.failed)} / ${integer(m.completed)} 次已结束请求失败`);
  if (h?.tools?.errors > 0) issues.push(`游戏工具：${integer(h.tools.errors)} 次返回失败`);
  if (!harnessModelFailures && b?.statistics?.failed_calls > 0) issues.push(`模型调用：${integer(b.statistics.failed_calls)} / ${integer(b.statistics.calls)} 次失败`);
  if (s?.origin === "fallback") issues.push(`${s.scope === "last" ? "上次" : "本次"}策略使用了回退`);
  const known = finite(h?.tools?.errors) || finite(b?.statistics?.failed_calls) || h?.models?.some(m => finite(m.failed));
  $("overview-issues").parentElement.classList.toggle("has-failures", issues.length > 0);
  const issueList = $("overview-issues"); issueList.replaceChildren();
  for (const text of issues.length ? issues : [known ? "当前采样窗口内未报告失败" : "失败统计尚未接入"]) {
    const item = document.createElement("li"); item.textContent = text; issueList.append(item);
  }
  const services = current.models.some(m => !expired(m, age)) || !expired(current.tts, age);
  const connections = !expired(current.connections, age);
  $("brain-details").hidden = !usefulBrain;
  $("service-details").hidden = !services;
  $("connection-details").hidden = !connections;
  $("diagnostics").hidden = !usefulBrain && !services && !connections;
  $("monitor-state").textContent = age > 7 ? "数据已过期" : disconnected ? "连接中断" : available ? "宿主数据已连接" : stale ? "宿主数据已过期" : "宿主数据待接入";
  $("signal").className = `signal ${available && (brainPhase[b?.phase] && b.phase !== "idle" || h?.tools?.active > 0) ? "active" : ""}`;
}

function render() {
  if (!current) return;
  const age = Math.max(0, (performance.now() - receivedAt) / 1000);
  const frameworkPhase = renderBrain(age);
  renderHarness(age);
  for (const model of current.models) renderModel(model, age);
  const tts = expired(current.tts, age) ? { pending: current.tts?.pending, pendingSampledAt: current.tts?.pendingSampledAt } : current.tts;
  $("tts-active").textContent = integer(tts.synthesizing);
  $("tts-waiting").textContent = integer(tts.waiting);
  $("tts-duration").textContent = finite(tts.lastSynthesisSeconds) ? `${seconds(tts.lastSynthesisSeconds)}s` : dash;
  const pendingExpired = finite(tts.pendingSampledAt) && current.serverTime + age - tts.pendingSampledAt > 16;
  $("tts-pending").textContent = pendingExpired ? dash : integer(tts.pending);
  $("tts-dot").className = `tiny-dot ${tts.connected === true ? "active" : tts.connected === false ? "error" : ""}`;
  $("tts-label").textContent = tts.connected === false ? "断连" : "本地合成";
  const con = expired(current.connections, age) ? {} : current.connections;
  $("neko").textContent = integer(con.NEKO);
  $("mc").textContent = integer(con.MC);
  $("mc").parentElement.title = con.scope === "local-to-model-gateway" ? "本机 MC 框架进程及其子进程到模型网关的已建立 TCP 连接；连接数不是调用次数或本次请求来源" : "入口 TCP 连接采样";
  $("neko").parentElement.title = con.scope === "local-to-model-gateway" ? "本机 NEKO 进程及其子进程到模型网关的已建立 TCP 连接；连接数不是调用次数或本次请求来源" : "入口 TCP 连接采样";
  $("unclassified").hidden = !finite(con.unclassified) || con.unclassified === 0;
  $("unclassified").querySelector("i").textContent = integer(con.unclassified);
  const anyFresh = !!frameworkPhase || current.models.some((m) => !expired(m, age));
  const anyActive = (!!frameworkPhase && current.brain?.phase !== "idle") || current.models.some((m) => !expired(m, age) && ["reading", "generating"].includes(m.state));
  $("signal").className = `signal ${anyActive ? "active" : anyFresh ? "" : "error"}`;
  $("monitor-state").textContent = age > 7 ? "数据已过期" : disconnected ? "连接中断" : frameworkPhase || "只读监测";
  $("updated").textContent = finite(current.updatedAt) ? `更新 ${new Date(current.updatedAt * 1000).toLocaleTimeString("zh-CN", { hour12: false })}` : "更新 —";
  renderOverview(age);
  renderServiceMetadata(age);
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
