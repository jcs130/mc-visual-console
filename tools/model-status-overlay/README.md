# 大脑框架与本地模型指标

地址：**http://127.0.0.1:17840/overlay**

OBS 添加“浏览器”源，宽 **440**、高 **290**；网页面板 **424×272**，四周透明。主模型和系统1分别显示。
OBS 中将浏览器源缩放保持为 100%，可放在游戏画面角落。页面不需要麦克风、音频或外部资源。

首次配置将 `overlay.config.example.json` 复制为 `overlay.config.json`，填写本机数据源，再运行 `./start.ps1`（Python 3.10+，无额外 Python 依赖）。
没有本机配置文件时使用空白示例；缺项显示未知。保持服务运行即可，OBS 多开页面共用同一个采样器。

本地详情：**http://127.0.0.1:17840/brain**。展示逐次策略、选择／应用预算、上下文长度分位数、请求思考档位分布、回退、重试、任务验证和失败恢复。
OBS 保留紧凑策略条及近10分钟采用／回退摘要。

框架口径和只读投影接口见 [BRAIN-METRICS.md](BRAIN-METRICS.md)。支持框架运行阶段、活动主连接和明确标注的配置快照；逐次选择与窗口统计由框架的独立元数据投影提供。

## 数据接入

编辑 `overlay.config.json`：

- `models[0].metricsUrl`：真实 Strata JSON `/metrics` 地址，或现有 LiteLLM 网关的同路径只读投影。
- `models[0].engineConfigPath`：可选的本机 Strata 引擎 JSON；运行时 `engine.max_context` 优先，配置作为回退。
- `models[1].metricsUrl`：系统1独立的只读 `/metrics`。
- `tts.metricsUrl`：本地语音服务只包含元数据的 `/metrics`。
- `tts.pendingUrl`：演出待发项只读元数据；VTuber 扩展使用 `/api/console/providers/world:vtuber/panels/tts/metrics`，独立于合成服务采样有效性。
- `connections`：NEKO、MC 和未分类入口对应的本机 TCP 端口，数组为空表示入口尚未配置。
- `brain.metricsUrl`：CortiV 使用 `/api/console/providers/persona:cortiv/panels/planning/metrics`；也兼容 `/api/brain/metrics` 或 `/metrics`。环境变量 `OBS_BRAIN_METRICS_URL` 也可设置。
- `brain.statusUrl / deploymentConfigPath`：没有策略投影时，读取已检查的 Cortico `/api/status` 元数据和配置白名单；不会将配置值作为本次选择。

也可设置环境变量 `OBS_STRATA_METRICS_URL / OBS_STRATA_CONFIG / OBS_SYSTEM1_METRICS_URL / OBS_SYSTEM1_CONFIG / OBS_TTS_METRICS_URL` 后启动。
不要在 URL 中放令牌或账号密码。详细字段及服务端实现要点见 [METRICS-CONTRACT.md](METRICS-CONTRACT.md)。

健康接口只证明服务可达和身份，缺少推理指标时显示“状态未知”。
TTS 应提供只包含元数据的接口；不要采集附带参考文本或默认指令的健康响应。
未配置的入口连接显示“—”，未分类项只在确有已建立连接时显示。

若需要采样本机客户端到模型网关的连接，可将 `connections.modelIngress` 配为 `endpoints:[{host,port}]` 和 `clients:{NEKO:[进程命令中的完整项目路径],MC:[框架入口文件路径]}`。分类包括子进程，只输出连接数量；采样覆盖本机，不包括其他电脑上的客户端，不读取连接中的 HTTP 内容。旧的端口数组配置仍按服务器入口端口采样。

系统1分类模型明确报告 `output_mode:classification` 时，生成速率显示“不适用”。输入速率是该次分类各次前向处理 token 总数除以分类执行时间，不能与逐 token 生成模型的 prefill 阶段速率直接比较。

## 口径

完整输入优先读取 Strata `live.prompt_tokens` 或精简接口的 `context_tokens`，不读取 `prompt_read` 作为完整长度，也不把生成输出加进去。
上限由有效引擎配置读取。占用 75% 黄色，90% 红色并显示“接近上限”；空闲显示“上次上下文”。
Strata 单请求执行时钟位于分词、FIFO 排队和引擎加载之后；批处理包含内部排队的时钟不会被当作单次执行时间。
空闲时只使用最近一条请求的元数据，不跳过不完整记录寻找更早的好看数值。当前缺字段不回填上次数据。
LiteLLM 投影优先使用其明确的 `live/last` 字段；队列不重复累加，执行耗时为 null 时不从网关总耗时或阶段耗时推算。
输入速度为本次输入阶段均速，生成速度采用 Strata 当前窗口；空闲清楚标记“上轮”。前缀复用始终标记“上轮复用”。
模型指标 7 秒、TTS/连接 16 秒过期后清空运行数值。网页断开也会自行使缓存过期。

采样只做 GET，无推理请求；不保存原始响应，不写对话或凭据日志。接口返回值白名单中只有身份、时间、token、队列、缓存和连接数量。

## 验证

`python -m unittest discover -p test_*.py -v`

覆盖完整输入/读取进度、缓存、取消请求、当前/上次隔离、动态上限、缺失/过期、并发请求、只读访问与共享采样。
也覆盖配置与当前选择隔离、建议与应用预算隔离、请求关联、统计分母、窗口范围、零样本和上下文分位数。
布局验证脚本 `qa.mjs` 使用本机已有 Playwright 和 Chromium，验证 440×290 及真实页/测试场景，不向模型发送请求。
可通过 `PLAYWRIGHT_MODULE` 指定已有的 Playwright 模块，通过 `CHROME_PATH` 指定本机 Chromium；不设置时使用正常模块解析及 Playwright 默认浏览器。
