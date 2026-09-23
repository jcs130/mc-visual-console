# cortico-world-mcvisual

Cortico World 扩展：把 **Minecraft 现代画面**（观战 + 接管）接进控制台。

一个组件两个宿主：组件本体在 [mc-visual-console](https://github.com/jcs130/mc-visual-console)，
对外只有一份[接缝协议](../../docs/PROTOCOL.md)；本目录是它的 **Cortico 宿主**。

## 它做什么、不做什么

| | |
|---|---|
| **做** | 一块画面面板、一个独立画面页链接、一条带接管的观战通道、`mcvisual_scene` 这一条只读观测工具 |
| **不做** | 挖放 / 移动 / 战斗等动作工具（那是本部署的 Minecraft World）；不解析渲染器；不替操作员决定谁能接管 |

World id 是 `mcvisual` —— **刻意不与内建 `minecraft` 撞名**：内建那套管的是 bot 自己的行为，
这一套管的是"人怎么看、怎么临时接管"。两者可以同时挂着，各自连各自的身份。

## 依赖的上游

本扩展不自己连服务器，它对着一个已经跑着的**观战接缝**说话：

```
GET  <protocolBase>/health     → { ok, bot, viewers, holder }      宿主判活
GET  <protocolBase>/state      → StateSnapshot                    对齐快照
POST <protocolBase>/command    → 提交命令（claim/release/moveTo/…）无 WS 时的兜底
WS   <protocolBase>            → hello/delta/holder/notice/error  面板推送
```

组件与它的启动方式见 [mc-visual-console](https://github.com/jcs130/mc-visual-console)。

## 配置（`worlds.mcvisual`）

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `false` | 默认禁用，由 bot 或部署启用 |
| `viewerBase` | `http://127.0.0.1:7800` | 画面 origin（独立画面页从这里开） |
| `protocolBase` | `http://127.0.0.1:7801` | 接缝 origin |
| `host` / `port` | `127.0.0.1` / `25702` | 服务器地址与统一外门端口 |
| `username` | `ag_viewer` | **观战身份**；一个身份只能有一条会话，务必与别的 bot 区分 |
| `version` | `1.21.1` | 须与门一致 |
| `allowTakeover` | `true` | 关掉后面板只读 |
| `probeTimeoutMs` | `1500` | 健康探测超时 |

## 开发

```bash
corepack pnpm install
corepack pnpm test          # 干装载 + 事件 + 工具回执
corepack pnpm build         # 打控制台面板产物 → dist/console.js (+ .css)
pnpm check:extension .      # 在 Cortico 仓库根下跑官方校验
```

装进一份部署（改源码后重启生效）：

```bash
cd <部署>/extensions && corepack pnpm add --ignore-workspace <本目录绝对路径>
```

## 规矩（照 Cortico 的扩展契约）

- 面板只用 `ctx`：`ctx.root` 内写 DOM，不碰 `document.body`，不直连 `/api/`，不用裸定时器（用 `ctx.interval` / `ctx.frame`）。
- 浏览器侧对 `cortico/*` 只能 `import type`。
- World 不直接读 Memory、不调用 Persona 的工具。
- 回执只陈述可确认的事实。
