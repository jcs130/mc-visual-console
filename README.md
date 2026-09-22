# mc-visual-console（仓库名候选见文末）

**Mineflayer 驱动的 Minecraft 现代化可视化后台。**
挂在任何 Mineflayer bot 上，就得到一个**能看、能查、能操作**的网页控制台。

- **它是什么**：一个独立、可嵌入的**可视化后台组件** —— 一张画面里看世界，同时能查实体、能下达操作。
- **数据源**：Mineflayer（不是游戏 mod 的 live dump）
- **宿主①**：Cortico —— 包成外部 World 扩展，走 `console().stream()` / `invoke()` / `links[]`
- **宿主②**：dsh —— 包成插件，挂在 dsh web 的 webServer 路由上
- **状态**：施工中（M0 骨架已跑通，测试 5/5）

## 特点（都从源码里数出来的，不是形容词）

### 1. 一张画面看世界，而且一切都有预算

画的东西照千灯纪 `mc-modern-viewer` 的实测值定档（其源码 28–34 行）：会话 **2**、视距 **3 区块**、
化身状态 **100 ms**、背包 **46 槽**、特效距离 **96** / 每秒 **80 事件** / 粒子 **24**。
本组件的对应项是 `maxSessions` / `viewDistance` / `stateHz` / `maxEntities` / `maxBlocksPerChunk`，
并且**超预算时丢增量、不丢连接**。

> 一张好看的后台，背后必须有一张账 —— 否则它只是在烧机器。

### 2. 能查：悬停识别 → 实体详情

画面上的对象不是贴图，是可查的实体：悬停识别、点开详情、NPC 面板带角色形象与立绘风格。
（千灯纪那份实测页面里，`entity-detail-title` 与 `npc-panel-*` 就是这套东西。）

### 3. 能操作：画面上的意图，直接变成动作

点地面 → 走过去；右键/长按目标 → 详情 / 走近 / 攻击 / 使用；滚轮缩放；镜头可切跟随 / 自由 / 第一人称。
这些不是前端小把戏，而是协议里的命令：`moveTo`、`lookAt`、`action`、`camera`。

### 4. 谁来操作，由权限机制管——观战是默认权利

同一个身体、同一时刻只有一个持有者；`claim` / `release` / 抢占 / 超时释放都在协议里。
**只有"操作类"命令要求持有权；"看"永远允许**（`not_holder` 是唯一的拒绝理由）。
—— 这条让"多人同看、一人操作"成为默认行为，而不是靠前端自觉。

### 5. 上游只要"像 bot 的对象"，不要 mineflayer

组件**不 import mineflayer**，只认 `ViewerBot` 那几样能力（世界、实体、玩家、自身状态、look/goto/attack）。
因此：运行时依赖只有 `ws` 一个；测试用脚本化假 bot 就能跑完整条协议，**不必连任何服务器**。

### 6. 两条通道分开：世界是一条，实体是另一条

千灯纪那份特意保留的"双 Socket.IO 命名空间数据桥"值得抄：**区块流与实体流各自独立背压**，
一方堵住不拖另一方。（本组件用单 WS + 分帧承载同一思路，见 `docs/PROTOCOL.md` §三。）

### 7. 不碰业务语义

谁能操作、走到哪里算危险、看到什么该报告 —— 全是**宿主**的事（Cortico 的 World / dsh 的插件）。
组件只做视图与操作通道。它自己的设计准则就一句话：**Minimal priors**。

## 两个宿主

| 宿主 | 接法 |
|---|---|
| **Cortico** | 包成外部 World 扩展：`console().stream()` 转发状态、`invoke()` 接命令、`links[]` 挂整页 |
| **dsh** | 包成插件：挂在 dsh web 的 webServer 路由 + WS 上 |

同一个组件、同一份协议，两端各自薄薄一层壳。这也是它值得单独存在的理由 ——
现状里这套能力**只长在千灯纪的 mod 侧**，且靠对 `prismarine-viewer` 产物做字符串手术维持。

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
**组件只做"视图 + 操作通道"，不决定"谁能操作、走到哪里算危险"。** 业务语义属于宿主。

## 接缝

对外**全部**接口就是 [`docs/PROTOCOL.md`](docs/PROTOCOL.md)：

```
HTTP   /            页面    /state 快照    /health 判活    /command 兜底
WS 推  hello 快照 → delta 增量（约 100ms 合并）→ holder 操作权变更 → notice/error
WS 收  claim/release 操作权 · moveTo 点地移动 · lookAt 转头 · action 动作 · camera 镜头 · set 预算
```

上游只需要**一个 "像 mineflayer bot 的对象"**（`ViewerBot`）：拿得到世界、实体、玩家、自身状态，
提供 `look/goto/attack/activateEntity` 与事件。给一个假 bot 就能跑测试，不必连服务器。

## 交互模型（照搬千灯纪 `mc-modern-viewer` 的能力表）

> 地牢 2.5D 视角；悬停识别对象，接管后点击地面移动，右键或长按目标选择详情、走近、攻击或使用，滚轮缩放

加上我们已有的镜头思路：追尾 / 跟随 / 自由 / FOV / 就近实体 / 皮肤注入。

## 路线

| 里程碑 | 内容 | 状态 |
|---|---|---|
| **M0** | 假 bot + 单页 demo：看得到地形与实体、能查、能点地走过去（**不连真实服务器**） | 骨架已跑通（测试 5/5） |
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
corepack pnpm test          # 假 bot，不连服务器（当前 5/5 通过）
corepack pnpm dev:demo      # 单页 demo（M0 骨架版；正式客户端待做）
```

## 许可

MIT。

---

## 仓库名候选（待定）

| 候选 | 对应 | 说明 |
|---|---|---|
| **`mc-visual-console`** | 「现代化可视化后台」逐字 | **按你这句定，我最赞成** —— 不绑任何单一卖点 |
| `mc-console` | 同上，更短 | 最好读，但检索时容易撞名 |
| `mc-dashboard` | 后台/看板 | 通用，但"看板"偏只看不操 |
| `mc-studio` | 工作台 | 画面感好；但与"后台"的语义稍远 |
