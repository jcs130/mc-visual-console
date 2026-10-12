# brain.py / 大脑框架指标契约

这份面板衡量框架怎样分配阅读与思考资源，以及分配之后的执行结果。OBS 使用 `/overlay`；本地详情使用 `/brain`。

## 当前项目对应关系

已经存在的入口：

| 指标 | 项目入口 | 口径 |
| --- | --- | --- |
| 聚焦／连贯阅读建议 | `ForegroundAdviser`、`foreground-advice` | 建议可能被拒绝、过期或因冷却未请求 |
| 请求历史预算及实际应用预算 | `Persona.prepareRequest`、`foreground-context` | `requestedMaxHistoryTokens` 与 `maxHistoryTokens` 分开；上下文 epoch 尚未重建时两者可不同 |
| 思考建议与请求参数 | `Persona.requestReasoning`、`foreground-reasoning`、Core `round.requestModel` | 建议 `immediate/routine/deliberate`，请求参数是 `thinking/effort`；不能把建议当成服务已生效 |
| 本轮投影及估算输入 | Core `round.requestContext` | 估算与实测分别报告；记录条数比例不是 token 压缩比例 |
| 主意识、规划、反思、构思等通道 | 当前 provider / fork 选择 | 按通道配置的路由与自主选择模型分开 |
| 框架运行阶段 | 只读 `/api/status` | 接收输入、模型、工具、退避、交接、待命；不等于 GPU 推理状态 |
| 完整实际输入与执行资源 | Strata 或模型服务 `/metrics` | 用同一请求 id 关联框架请求后，才允许进行估算与实测对比 |

阅读配置可以分别提供聚焦历史、通常历史和增长预算。
这些是历史投影预算，系统前缀、受保护的新输入和完整工具组等仍可增加完整输入；阶段预算另行报告。
自动思考档位未在部署配置中声明时显示“未声明”，CortiV 源码默认关闭。面板分别显示配置快照和本次选择，不据此虚构当前请求档位。

现有快速思考选择只改变本次 `thinking/effort`，不会自主更换主模型。规划等通道可使用独立配置的 provider；当前应标为配置路由。

## 显示内容

OBS 保持 440×290、面板 424×272：

- 本次／上次策略：请求通道和模型、阅读模式、请求思考档位、实际应用历史预算、增长预算。
- 近10分钟自适应采用率与选择器回退率；分母为零或缺失时显示“—”。
- 主模型、系统1、TTS、连接采样及更新时间，沿用独立执行指标。

详情页补充：

- 路由、阅读、思考各自的来源；支持自动、配置、继承、回退和人工指定同时存在。
- 阅读建议 → 应用模式、所选历史预算 → 实际应用预算、请求思考档位与服务确认。
- 估算完整输入、已关联实测输入、独立思考预算、选择器耗时。
- 阅读／请求思考档位／请求通道分布；历史预算、完整输入、独立思考预算的 P50/P95 和样本量。
- 模型调用失败、额外重试、已验证任务成功、终态待验证、失败后恢复及 token 消耗。

不合成“智力分数”。更长上下文、更高 effort、更多思考 token 都是资源选择，其效果由相同任务条件下的验证结果和成本共同判断。

## 计数单位与窗口

框架在事件发生处记录元数据，提供10分钟滚动聚合；浏览器与采样器重复读取不会增加计数。

| 单位 | 身份与计数点 |
| --- | --- |
| 目标／任务 | 稳定的 `task_id`；拆分、重试、换策略仍能追溯原任务。成功须有环境验证终态 |
| 决策 | `decision_id`；一次策略分配。刷新页面、重复读取状态不生成决策 |
| 逻辑模型请求 | `request_id`；策略提交时计一次。重试沿用此逻辑请求，产生新的 attempt |
| 调用尝试 | `attempt_id`；结束时计一次，失败、取消、丢弃和部分用量按真实终态保留 |
| 选择器尝试 | 真的向系统1发起分类才计一次；冷却、关闭、复用建议不计为新尝试 |
| 失败恢复案例 | 原任务的一次失败到验证结案，含策略调整关联；不能把每次重试都算成恢复 |

生产端按身份去重，重试和重复事件幂等。窗口字段须用各自事件的提交／结束／验证时间归属；每种分母使用同一集合。

- **自适应采用率** = 至少一个适用策略维度实际采用自适应选择的逻辑请求 / 适用逻辑请求。一个请求最多计一次；单纯运行了选择器不算已采用。
- **选择器回退率** = 超时、不可达、低置信度、过期这四种互斥结果之和 / 实际选择器尝试。正常冷却和关闭单列为继承，不算服务异常。
- **模型调用失败率** = 失败终态尝试 / 同一窗口已结束尝试。进行中的请求不提前判失败；额外重试独立计数。
- **任务成功率** = 已验证成功 /（已验证成功 + 已验证失败）。受理、排队、超时后结果未知和待验证单列，不冒充完成或失败。
- **恢复率** = 原目标在调整后验证恢复的案例 / 有可验证结案的失败案例。仍在尝试、终态未知的案例不提前纳入分母。
- **档位与通道分布** 按实际提交的逻辑请求计数；分类器建议分布与实际请求分布不能混用。未知桶保留，未报告的桶是 `null`。
- **P50/P95** 使用相同窗口内、相同指标口径的有效请求样本，按 nearest-rank 计算。历史预算按提交的应用预算采样；实际输入只取成功关联的上游计数；思考预算仅取独立字段明确报告的值。零样本不返回 0 分位数。

窗口固定600秒，报告覆盖秒数及完整性。重启、观测断档、丢事件等使覆盖不完整时显式标记；页面不从采样点估计次数。
思考 token 通常是输出 token 的子集；显示三项读数，不把思考再次累加到输出。

## 只读接口

框架提供 `GET /api/brain/metrics`（或独立服务 `GET /metrics`），只返回以下元数据。
`time` 必须是响应时的服务 Unix 秒，`window.to` 同一时钟。缺失值使用 `null`。
小窗配置 `brain.metricsUrl` 或启动时的 `OBS_BRAIN_METRICS_URL`，每约2秒后台采样；配置热读，不需重启游戏或模型服务。

```json
{
  "schema": "cortico-brain-metrics-v1",
  "time": 1791792000.0,
  "phase": "model",
  "paused": false,
  "active_connection": {"name": null, "model": null},
  "stage_budget_tokens": null,
  "input_hard_limit": null,
  "selection": {
    "scope": "current",
    "decision_id": "opaque-decision-id",
    "request_id": "opaque-request-id",
    "inference_request_id": null,
    "round": null,
    "origin": "mixed",
    "sources": {"route": "configured", "reading": "adaptive", "reasoning": "inherited"},
    "proposed": {"reading": "focused", "reasoning": "routine", "effort": null},
    "applied": {
      "role": "main", "model": "loaded-model-id", "reading": "focused",
      "thinking": null, "effort": null, "reasoning_budget_tokens": null
    },
    "provider_confirmed": null,
    "confidence": null,
    "selector_ms": null,
    "context": {
      "requested_history_tokens": null,
      "applied_history_tokens": null,
      "growth_tokens": null,
      "protected_tokens": null,
      "estimated_input_tokens": null,
      "actual_input_tokens": null
    }
  },
  "window": {
    "window_seconds": 600, "from": 1791791400.0, "to": 1791792000.0,
    "covered_seconds": null, "complete": null,
    "eligible_requests": null, "adaptive_applied": null,
    "selector_attempts": null, "selector_timeouts": null, "selector_unavailable": null,
    "selector_uncertain": null, "selector_stale": null,
    "calls": null, "failed_calls": null, "retries": null,
    "verified_success": null, "verified_failed": null, "unknown_tasks": null,
    "recovery_cases": null, "recovered": null,
    "input_tokens": null, "output_tokens": null, "reasoning_tokens": null,
    "reading_counts": {"focused": null, "connected": null, "standard": null, "full": null, "unknown": null},
    "effort_counts": {"off": null, "low": null, "medium": null, "high": null, "default": null, "other": null, "unknown": null},
    "route_counts": {"main": null, "system1": null, "planning": null, "reflection": null, "cognition": null, "dream": null, "unknown": null},
    "context_distributions": {
      "history_budget": {"samples": null, "p50_tokens": null, "p95_tokens": null},
      "matched_input": {"samples": null, "p50_tokens": null, "p95_tokens": null},
      "reasoning_budget": {"samples": null, "p50_tokens": null, "p95_tokens": null}
    }
  }
}
```

这是字段结构示例，时间与计数不是生产数据。

`selection.scope` 空闲使用 `last` 并明确显示上次；新请求用新的 id 并清空缺失字段。
role 为 `main/system1/planning/reflection/cognition/dream`；reading 为 `focused/connected/standard/full`。
origin 为 `adaptive/configured/inherited/fallback/manual/mixed`，sources 各维度不能用 mixed 掩盖实际来源。
effort 保留 provider 的真实取值，不根据词义换算成假定的思考 token 预算。

`applied` 表示框架本次请求采用的参数，`provider_confirmed` 仅当有服务端可验证的回执才为 true。
框架主连接配置不等于任意当前请求的选择；S1 提议、Core 请求、provider 生效三者分别记录。
`actual_input_tokens` 只有 `request_id == inference_request_id` 且均存在时才显示；网关必须保留或映射关联编号，不能按时间相近或连接数量拼接。
LiteLLM 统一接入的 `inference_stats.request_id` 与 `x-litellm-call-id` 相同；框架应将这个回执 id 映射到原逻辑 request/attempt，再输出一致的关联编号。`session_id` 只是会话分组，不能用来辨认该会话中的某次请求。
响应统计未报告 reading、thinking/effort 的实际生效状态时，不能据此设置 `provider_confirmed: true`。网关 `/metrics` 也不能替代框架的逐次策略和环境验证接口。
实际输入必须是完整输入、包含复用前缀、排除生成输出。完整输入估算不得替换实测；历史预算也不是全输入上限。
`reasoning_budget_tokens` 必须来自独立思考预算字段，不能拿 `max_output_tokens`、实际 reasoning token 数或 effort 名字推算。

## 框架接线位置

1. `beforeDecision` / `ForegroundAdviser` 输出分类尝试结果，记录超时、低概率、过期等枚举，不附场景正文。
2. `prepareRequest` 记录阅读选择、请求预算、实际 epoch 预算和投影估算；不传 `ContextRecord[]`。
3. `requestReasoning` 完成后、真正发出模型请求前，提交本次策略快照；现有结束时的 `round.requestModel` 可用于核对，不能冒充实时开始事件。
4. Provider 尝试结束时记录 request/attempt 关联、真实 token 用量与终态。引擎执行时间和框架往返、选择器耗时、工具时间分别保留。
5. World 的环境验证终态关联原任务，更新任务与恢复案例计数。工具“已受理”不触发成功计数。
6. 从这些事件维护去重后的元数据缓存，GET 路由只读取缓存，不执行选择器、模型或工具。

没有独立投影时，小窗可读取已检查的 `/api/status` 元数据和部署配置白名单。逐次策略、窗口聚合和环境验证统计缺失时显示未知。
框架接线属于通用引擎／Persona 观测能力；千灯纪专属任务验证留在独立 World，TTS 统计留在 VTuber 扩展。
未来用于场景重放和经验评估时，可保留策略版本、匿名关联 id、环境快照 id 等元数据；正文和环境数据由原有训练数据管道分别管理。
