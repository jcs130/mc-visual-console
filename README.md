# mc-visual-console

**Mineflayer 驱动的 Minecraft 现代化可视化后台。**
挂在任何 Mineflayer bot 上，就得到一个**能看、能查、能操作**的网页控制台。

- **它是什么**：一个独立、可嵌入的**可视化后台组件** —— 一张画面里看世界，同时能查实体、能下达操作。
- **数据源**：Mineflayer（不是游戏 mod 的 live dump）
- **宿主①**：Cortico —— 包成外部 World 扩展，走 `console().stream()` / `invoke()` / `links[]`
- **宿主②**：dsh —— 包成插件，挂在 dsh web 的 webServer 路由上
- **状态**：施工中（M0 骨架已跑通，测试 5/5）

## 独立运行（克隆下来就能跑）

### 路 ①：组件 + 假 bot 演示 —— **完全自包含**

```bash
git clone https://github.com/jcs130/mc-visual-console.git && cd mc-visual-console
corepack pnpm install
corepack pnpm build:client      # 打包 client/app.js（未入库的构建产物）
corepack pnpm test              # 5/5
corepack pnpm dev:demo          # 假 bot 演示 → http://127.0.0.1:7799/
```

接自己的 bot：`import { attach } from './src/index.ts'` 然后 `attach(bot, { port })`。
它只要求一个"像 mineflayer bot 的对象"（`ViewerBot`，见 [docs/PROTOCOL.md](docs/PROTOCOL.md) 第一节），
不 import mineflayer —— 所以测试用脚本化假 bot 就能跑，不必连服务器。

### 路 ②：接真服务器 + 那套现代画面 —— **需自备派生资源**

`viewer-service/` 负责连"门"（`MC_PORT`）并跑现代画面。画面**引擎**与**资产包**不入库：
它们是**千灯纪那套现代画面**的派生资源（自有项目，非本仓 IP，见 `.gitignore` 的两条 `*.js` / `mod-assets/`）。

```bash
node packages/modern-viewer/tools/import-modern-viewer.mjs <千灯纪/vendor/modern-viewer 目录>
python packages/modern-viewer/tools/patch_official_avatar.py     # 可选：默认角色换成原版方块人/史蒂夫
powershell -File viewer-service/serve.ps1                # Windows；Linux 走 docker compose
```

两个口：**7800** 画面（`/` 第一人称 · `/third/` 环绕 · `/dungeon/` 2.5D）· **7801** 协议与控制台页（`GET /`
—— 自绘可操作台，接管后点地走）。画面里点地走 + 寻路轨迹由 `modern-viewer/mc-control.js` 注入实现
（读 `globalThis.world.camera`、锚点对账出世界坐标；见该文件头注释）。

### 包里有什么 / 没什么

| | |
|---|---|
| **有** | 接缝协议与实现（`src/`）· 自绘 2.5D 操作台（`client/`）· 假 bot 与测试（`fixtures/` `test/`）· 现代画面的桥接与注入脚本（`packages/modern-viewer/src/*.mts`、`mc-control.js`）· Cortico World 扩展（`hosts/cortico/`）· 文档（`docs/`） |
| **没有** | 画面引擎与资产包（`packages/modern-viewer/assets/*.js`、`mod-assets/`，**派生资源**，用上面的导入脚本自备）· 构建产物 `client/app.js`（`pnpm build:client` 生成） |

## 发布形态

- **Cortico 扩展**（`hosts/cortico/` = 包名 `cortico-world-mcvisual`，`cortico.kind=world, api=5`）：**可发 npm** ——
  发上去就能在 Cortico 控制台的「扩展」页直接装（`pnpm check:extension` 已通过）。
- **组件**（根包 `mc-visual-console`）：**可发 npm** —— 发布前需 `pnpm build:client`，并把 `client/app.js`
  与 `files` / `exports` 一并纳入。
- **画面引擎与资产**：**不能**由本仓发布 —— 派生资源不属于本仓，请自备或向源头项目取得。

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

## 名字的由来

名字取自「**现代化可视化后台**」这句定位：它是一个挂上去就能用的 Minecraft 可视化控制台，
不绑任何单一卖点（观战、查询、操作都在里面）。

## 连服务器（统一外门）

**只连门 `25702`**，绝不连 `25565`/`25567`（真人 NeoForge 口，裸连读到错乱世界）。
用户名 **`ag_` 开头**（名字 = UUID = 身份，凡背包/家当/成就都挂名字上，**定死别改**）；`version: 1.21.1` + `auth: offline` 必带；物品与方块号由门翻译，`bot.blockAt()` / `bot.inventory` 读到的就是对的。

```js
const mineflayer = require('mineflayer')
const bot = mineflayer.createBot({
  host: 'micro.kangqiang.site',  // 公网域名；局域网 192.168.3.133；本机 127.0.0.1
  port: 25702,
  username: 'ag_xiaozhi',
  version: '1.21.1',
  auth: 'offline'
})
bot.once('spawn', () => console.log('进了世界'))
bot.on('kicked', r => console.log('被拒:', r))
```

> 注意：`1.21.1` 在 prismarine-viewer 的支持列表内，**不需要** `tools/patch-viewer-version.cjs`；
> 那个补丁只用于 1.21.11（本机 NeoForge 直连口）。
