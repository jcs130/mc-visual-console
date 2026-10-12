# OBS 只读元数据接口

框架的模型路由、上下文预算、思考档位及执行效果另见 [BRAIN-METRICS.md](BRAIN-METRICS.md)。这两个接口分别描述框架策略和引擎资源。

主模型可接 Strata 原生 `GET /metrics`（JSON），或 LiteLLM 同路径提供的只读元数据投影。
不需要重新调用模型。2026-10-12 的统一网关同时保留 `engine/live/requests` 与精简 `live/last`；小窗优先使用明确投影的 `context_tokens / execution_seconds` 等字段。
不要转发 `/api/requests`、对话日志或 SSE 正文。

系统1及自定义模型服务可以提供下面的精简接口，同样使用 `GET /metrics`。
所有缺失值使用 `null`，确认数量为零才写 `0`。接口不得包含提示词、回答、思考、音频正文或凭据。

```json
{
  "schema": "obs-inference-v1",
  "time": 1791792000.0,
  "engine": {
    "model": "服务实际加载的模型名",
    "quantization": null,
    "max_context": null
  },
  "live": {
    "state": "idle",
    "queued": null,
    "running": null,
    "request_id": null,
    "context_tokens": null,
    "execution_seconds": null,
    "input_tok_s": null,
    "output_tok_s": null
  },
  "last": {
    "context_tokens": null,
    "reused_tokens": null,
    "execution_seconds": null,
    "input_tok_s": null,
    "output_tok_s": null
  }
}
```

上面是结构示例，时间必须每次响应更新为服务当前 Unix 秒；不是生产数据。

- `state`：`idle` / `reading` / `generating` / `disconnected` / `unknown`。
- `engine.max_context`：从实际引擎配置或运行实例读取的有效输入上下文上限，不是模型宣称的理论上限，也不是本次输出预算。小窗也支持读取本地 Strata JSON 配置中的 `--ctx` 等参数，不设置默认常数。
- `request_id`：内部随机编号即可；新请求开始立即替换、清空该请求未知字段。空闲时 `live` 的请求字段清空，上次数据放 `last`。小窗不会保存这个编号。
- `context_tokens`：本次完整输入经过实际 tokenizer/template 后的长度，包含系统提示、历史、工具及已复用前缀，不包含生成输出；不要写 `prompt_read`、当前 KV 使用量或字符数估算。
- `execution_seconds`：获得执行资源并开始本次推理后，用单调时钟计时；包含输入处理和本次生成，不包含此前排队、加载模型和 Agent 工具执行。若只能提供包含队列的请求响应时间，请保留 `null`。
- `queued`：等待推理资源的请求数量，不包含正在执行的请求。不同等待阶段按互斥集合合计，不重复计数。
- `input_tok_s`：本次新读取 token / 对应输入阶段执行秒数，不把已缓存的 token 当作重新读取；可使用本次阶段均速。`output_tok_s` 使用本次生成滑动窗口或明确的本次均速。
- `last.reused_tokens / last.context_tokens`：上次输入的前缀复用比例。不要用本次读取进度替代复用量。
- 多请求同时执行且没有可靠的单请求快照时，提供 `running` 和队列即可，单请求字段 `null`。小窗不会把多个请求的速度、上下文和时间拼在一起。

服务端也可以只提供原始计数，让小窗计算速度：在 `live` 或 `last` 中用 `input_processed_tokens`（新读取量，不含复用前缀）与 `input_processing_seconds` 替代 `input_tok_s`，用 `output_tokens` 与 `decode_seconds` 替代 `output_tok_s`。
这些时间必须是对应阶段执行时间。小窗按 token / 秒计算阶段均速；生成阶段均速属于本次数据，页面标记“实时”。已提供的引擎实时速率优先。

## LiteLLM 统一网关口径

网关不带根级 schema 时，`live` 与 `last` 都明确包含 `context_tokens`、`execution_seconds` 的格式识别为投影；不会再按原始 Strata 字段回算。

- `live.queued` 已由服务端区分等待与执行，直接采用。`inflight`、`waiting_control` 和原始等待字段不会再次累加。
- `last.execution_seconds: null` 保持未知，即使 `requests[0]` 有输入/生成阶段耗时，也不拼出单次推理执行耗时。
- `last` 是权威的上次快照，缺失字段不会借用 `requests` 中的其他读数。并发期间缺少可靠请求身份时，当前上下文和速率保持未知。
- 模型、有效上下文上限来自 `engine`；量化字段缺失时可从已报告的模型标识解析版本。
- 普通及流式响应的 `inference_stats` 属于现有模型客户端的单次统计。小窗不会调用推理接口以获取它，也不会保存响应正文。
- `gateway_duration_ms`、`gateway_ttft_ms` 包含网关往返与队列，不能替代引擎执行耗时或用于反算引擎 tok/s。
- 如客户端以后按会话聚合，须按 `request_id` 去重并用最新快照覆盖；缓存复用率为总复用输入 / 总输入，不平均各轮比例。流式客户端须读到最终 usage 数据块。

### 引擎计时与思考确认

统一网关使用 `obs-inference-v1` 投影，`metadata_version=engine-metadata-v1`。`execution_ms`、`queue_ms` 来自引擎执行资源边界，`timing_status` 和 `segments` 描述计时来源。缺失或显式 null 不从网关入口与 HTTP 完成时间推算。

1. 入队时记录 `enqueued_at`；取得引擎执行槽并开始输入处理时记录 `execution_started_at`。
2. 本次生成完成、失败或取消并确认引擎停止后记录 `execution_ended_at`。排队时间为开始减入队；执行时间为结束减开始。跨进程时应传递时长，避免相减不同进程的单调时钟读数。
3. 普通响应和最终 SSE usage 的 `inference_stats` 提供 `execution_ms`、`queue_ms`，使用原有同一 `request_id`。取消与失败保留真实终态，不用响应发送耗时延长执行计时。
4. `/metrics` 的单请求 `live.execution_seconds` 为当前单调时间减执行开始；`last.execution_seconds` 为已结束的执行时长。并发缺少单请求关联时保持 null。

计时沿用现有推理响应和只读接口，保持 Flash 引擎、上下文、并发与缓存配置；客户端按原业务请求身份关联这些字段。

`active_requests` 是逐请求实时快照，使用 `request_id` 关联；`session_id` 只用于分组。小窗保留各请求独立的上下文、速度、计时和思考参数，不从近期 `requests` 列表拼接当前值。多个请求执行时，OBS 摘要的单请求字段保持未知，详情逐项显示。单个实时记录超过7秒、整个 `gateway_snapshot_age_ms` 超过7秒或本地缓存过期时清空对应运行数值。

`reasoning.requested` 与 `reasoning.effective` 包含 `thinking / reasoning_effort / budget_tokens`；生效项可附带 `native_reasoning_effort / budget_status`。`reasoning.confirmation=serving_template_and_budget_policy` 表示服务端确认模板与预算策略。收到参数不等于确认生效。`budget_status=disabled` 保留 null 预算并显示关闭，不把输出上限或实际思考 token 当作独立预算。

## 系统1 StartLux-Decision 的特别说明

本机 8090 的 `/health` 只证明服务可达，不证明待命。当前 `latency_ms` 的计时起点位于 GPU 锁之前，包含排队，不能直接作为推理执行耗时。

该模型一个决策请求可能包含多个问题及多轮选择，`usage.input_tokens` 是多个前向计算的 token 总量。不能将这个总量除以单个序列的上下文上限。
请从实际编码后的每个输入序列取得完整长度，`context_tokens` 报告该请求中最大的完整序列长度，与引擎 `max_length` 对应；输入吞吐量可单独用所有实际读取 token 的总量计算。
计时点应在获得 GPU 执行锁之后；要更精确地隔离编码与 GPU 推理，可在引擎前向计算边界计时，并正确同步异步设备工作。
量化版本从实际加载 dtype/量化配置读取；没有自回归输出速率时保持 `null`。

## TTS

TTS 的 `GET /metrics` 提供：

```json
{
  "time": 1791792000.0,
  "status": "ok",
  "synthesizing": null,
  "waiting": null,
  "last_synthesis_seconds": null,
  "pending_items": null
}
```

`synthesizing` 是正在合成的条数，`waiting` 是等待开始合成的条数；`last_synthesis_seconds` 是上次单条合成在获得执行资源之后的耗时，不是从入队到播放结束的时间。
`pending_items` 是演出发送端明确统计的待发项；如果语音服务看不到演出队列，就返回 `null`，不能用音频片段数或完成总数代替。
当前 VoxCPM2 `/health` 还包含默认指令等非必要信息，默认不采集；请提供只包含上述元数据的独立投影接口。

## 接上小窗

把实际地址写进 `overlay.config.json` 的主模型、系统1和 TTS `metricsUrl`。只接受无凭据、无查询参数的 `/metrics` URL。
配置文件按采样周期自动重读，无需重启小窗。模型约 2 秒、TTS 约 5 秒读取一次；多网页只访问小窗缓存。

入口连接另行在配置的 `connections.NEKO / MC / unclassified` 中填写本机对应入口 TCP 端口数组。
仅统计这些入口上的 `ESTABLISHED` 连接。无法可靠确定入口时留空，显示未知；不要按连接推断调用次数或当前请求归属。

也可以配置 `connections.modelIngress`，按明确的客户端项目路径识别本机进程及子进程，仅数向指定模型网关建立的 TCP 连接。此模式不统计游戏服务器或控制台连接，结果只覆盖当前电脑；进程扫描和端口采样失败时保持未知。它与服务端入口采样同样不能代替调用统计。
