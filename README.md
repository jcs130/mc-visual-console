# mc-viewer

**一个 Mineflayer 驱动的 Minecraft 观战 + 接管组件。写一次，两个宿主共用。**

- **数据源**：Mineflayer（不是游戏 mod 的 live dump）
- **宿主①**：Cortico —— 包成外部 World 扩展，走 `console().stream()` / `invoke()` / `links[]`
- **宿主②**：dsh —— 包成插件，挂在 dsh web 的 webServer 路由上
- **状态**：施工中（M0 未完成）

---

## 为什么单做这个

现在这套观战能力的接法是**对 `prismarine-viewer` 的成品 bundle 做字符串手术**：

```
tools/patch_viewer_bundle.cjs   →  往 node_modules/prismarine-viewer/public/worker.js 里塞
                                   {"minecraftVersion":"1.21.11","version":774,"dataVersion":4671,…}
tools/patch_viewer_{chase,follow,fov,nearest,skins,smart}.cjs
```

后果：**每次游戏版本升级都要再做一次手术**，改动不可测、不可审计，而且只服务一个宿主。

把它做成本组件后：
- 版本支持从"字符串补丁"变成**数据/配置**；
- 一套交互模型同时被 dsh 与 Cortico 复用；
- 上游（Mineflayer）换实现、下游换宿主，都不需要重写。

## 设计原则

借自 Cortico 的 `AGENTS.md`：

- **Minimal priors**：能交给操作者/模型自己判断的，不写死控制流。
- **Design toward the frontier**：为绕过当前模型局限而存在的机制，命名与文档里就写成 fallback。

组件自身的边界（很重要）：
**组件只做"视图 + 操作通道"，不决定"谁能接管、走到哪里算危险"。** 业务语义属于宿主。

## 接缝

对外**全部**接口就是 [`docs/PROTOCOL.md`](docs/PROTOCOL.md)：

```
HTTP   /            页面    /state 快照    /health 判活    /command 兜底
WS 推  hello 快照 → delta 增量（约 100ms 合并）→ holder 接管变更 → notice/error
WS 收  claim/release 接管 · moveTo 点地移动 · lookAt 转头 · action 动作 · camera 镜头 · set 预算
```

上游只需要**一个 "像 mineflayer bot 的对象"**（`ViewerBot`）：拿得到世界、实体、玩家、自身状态，
提供 `look/goto/attack/activateEntity` 与事件。给一个假 bot 就能跑测试，不必连服务器。

## 交互模型（照搬千灯纪 `mc-modern-viewer` 的能力表）

> 地牢 2.5D 视角；悬停识别对象，接管后点击地面移动，右键或长按目标选择详情、走近、攻击或使用，滚轮缩放

加上我们已有的镜头思路：追尾 / 跟随 / 自由 / FOV / 就近实体 / 皮肤注入。

## 路线

| 里程碑 | 内容 | 状态 |
|---|---|---|
| **M0** | 假 bot + 单页 demo：看得到地形与实体、能接管、点地能走过去（**不连真实服务器**） | 未开始 |
| **M1** | 接 Cortico：外部 World 扩展，`stream`/`invoke`/`links` | 未开始 |
| **M2** | 接 dsh：插件 + webServer 路由 + WS | 未开始 |
| **M3** | 客户端性能预算落地（workers / 视距 / FPS），对照千灯纪 modern-viewer 的预算表 | 未开始 |

## 目录

```
docs/PROTOCOL.md   接缝协议（唯一契约，先读它）
src/protocol.ts    协议类型（与 PROTOCOL.md 一一对应）
src/adapter.ts     ViewerBot 与 EntityLike 等上游形状
src/server.ts      HTTP + WS 服务端（宿主挂载点）
src/index.ts       attach(bot, opts) 入口
fixtures/          脚本化假 bot（测试用，不连服务器）
test/              vitest
```

## 跑

```bash
corepack pnpm install
corepack pnpm test          # 假 bot，不连服务器
corepack pnpm dev:demo      # 单页 demo（M0 完成后可用）
```

## 许可

MIT。
