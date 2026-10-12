<!-- Owner: harness.py, server.py, public/app.js -->

# 其他 Agent 的执行与方法指标

本页面属于具身 Agent Harness 的观察层，可以与 Cortico、MCP 或其他宿主配合。它不执行主决策，不写记忆，不修改游戏策略。

`overlay.config.json` 增加：

```json
{"harness":{"metricsUrl":"http://127.0.0.1:17841/api/harness/metrics"}}
```

`/brain` 增加独立运行记录、工具返回延迟、系统 1 / 系统 2 / 后台调用，以及方法的作者、阶段、父版本、源码哈希和回执。`/overlay` 保持 440×290 透明小窗。游戏透明 HUD 在 Minecraft 画面宿主的 `/?obs=1`，这两个页面用途不同。

## 数据协议

只读 GET `/api/harness/metrics`，返回 `schema: "agent-harness-metrics-v1"`、Unix 秒 `time`、进程 `run`、`phase` 和 `window: {seconds:600, coveredSeconds, complete}`。

- `tools`：`source:"runtime-measured"`，`calls / returned / errors / active`，`elapsedMs:{samples,p50,p95}`。计量的是工具接口返回，不能等同游戏动作终态或目标完成。
- `models[]`：`source:"host-reported"`、`role:system1|system2|background`，`calls / completed / active / failed / cancelled`，`elapsedMs / ttftMs` 分位数。`inputTokens / outputTokens / reasoningTokens / cachedTokens` 各含 `{samples,total}`；缺项 total 为 null。`cacheRatio` 只用同一请求同时有输入与缓存读数的样本，`cacheSamples` 说明分母。不能拿模型服务的全局请求当某个 Agent 的请求。
- `learning`：`source:"host-reported"`、`reportedEvents`、各 `stages` 计数，以及最多 12 条 `latest`。事件只保留 `id / method / author / stage / sourceHash / parentHash / artifact / receipt / executionId / outcome`；不展示源码或正文。`environmentVerifiedImprovement` 保持 null，页面不从上报结果推导能力提升。

未接入的通道显示未知；“0 条上报”不代表没有发生模型调用。模型服务队列、引擎执行、缓存与生成速率仍由 `models[].metricsUrl` 的独立只读服务投影提供；宿主上报的往返耗时不能替代引擎执行时间。已有 Cortico 逐次策略投影继续使用 `brain.metricsUrl`，无需改变原协议。

所有字段白名单化，不采集提示词、对话、源码、参考音频或凭据。源时钟超过 7 秒、浏览器断开或采样冻结时清空运行读数。统计是当前进程近 10 分钟，不拼接旧进程。

## 千灯纪独立包

`cortico-world-qiandengji` 的 MCP 私有配置可设 `metricsPort:17841`，只监听本机；工具 `mymc_metrics` 和资源 `mymc://metrics` 提供同一快照。宿主可通过 `mymc_trace` 上报自己实际测得的模型请求元数据，以及已经保存的执行制品关联。默认不开 HTTP 监听，也不主动连接 Minecraft。

MCP 插件观察不到外部 Agent 内部的所有模型调用。应由宿主在真实请求开始和结束时插桩；不要让模型凭口述填 token 或耗时。方法上报也不意味着已经自主学习：作者可能是维护人员，评价可能缺世界证据，必须保留来源。

验证：`python -m unittest discover -p test_*.py -v`。覆盖并发关联、缺项、来源白名单、过期和不把上报评价提升为验证结论。
