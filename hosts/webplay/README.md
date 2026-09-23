# mc-webplay —— 在网页里玩任意标准 Minecraft 服务器

**它是这一堆东西里最干净的一个**：不依赖千灯纪那套现代画面、不带任何派生资源、没有 IP 牵连。

一句话说清它是什么：**`prismarine-web-client`（MIT · PrismarineJS 官方）的薄封装** ——
它在**浏览器里**跑 mineflayer + prismarine-viewer，经**自带的 WebSocket→TCP 代理**
连**任何标准 Minecraft 服务器**。我们**没有抄它一行代码**，只是把它装进来、配好启动方式。

| | |
|---|---|
| **能干什么** | 3D 世界 · 移动 · **放置/破坏方块** · 聊天 · 玩家与 mob |
| **连什么** | 任意标准 MC（原版/Paper/Spigot…）；页面里的 Play 屏填 `主机:端口` + 版本即可 |
| **默认值** | 见 `node_modules/prismarine-web-client/public/config.json`（`defaultHost` / `defaultHostPort` / `defaultVersion`），改它即可换默认 |
| **许可** | MIT（上游 PrismarineJS）；本目录只放我们的启动封装，同样 MIT |

## 用

```bash
cd hosts/webplay
npm install            # .npmrc 里已设 ignore-scripts：上游 postinstall 有缺陷，且包里已带构建产物
npm start              # 或：powershell -File serve.ps1
# 打开 http://localhost:8080 → 在 Play 屏填服务器地址与版本
```

长期挂着（沿用本仓库别的服务的做法：常驻服务交给计划任务）：

```powershell
schtasks /create /tn mc-webplay /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\mc-visual-console\hosts\webplay\serve.ps1" /sc minute /mo 5 /f
schtasks /run /tn mc-webplay
```

## 资源包：什么时候必须、什么时候不用

**贴图是必需的** —— 但绝大多数情况下**不需要你提供**：

| 情形 | 要不要自备资源包 | 你会看到什么 |
|---|---|---|
| **原版 / Paper / Spigot** 等标准服 | **不用** —— 包内自带一份 `public/textures/`、`public/blocksStates/`，并会按你选的版本去 CDN（`cdn.jsdelivr.net/npm/…`）拉 `minecraft-assets` | 正常渲染 |
| **断网 / CDN 取不到** | 不用，但拿不到贴图 | 方块显示成**紫黑格或纯色块** |
| **改装服（带 mod 方块）** | **必须自备** —— mod 的模型与贴图不在原版资产里 | 同上：mod 方块是紫黑/占位 |

**自判口诀**：方块**有形状但贴图不对**（紫黑格/纯色）⇒ 资源问题；**整屏空、连不上** ⇒ 连接或版本问题，与资源包无关。

> 给改装服配资源包：`prismarine-web-client` 本身不开放"自定义资产目录"的开关。
> 要给 mod 服做资源包，用仓库里的 `viewer-service/`（它带 `mod-assets/`，同名覆盖即可）或 `docs/EXTENSIONS.md`
> 里定义的 `packs/<包>/` 形态 —— 那是我们自己的渲染层，能改。

## 两个必须知道的坑


1. **`npm install` 会报 `patchPackages.js` 缺模块** —— 那是上游 postinstall 的打包缺陷（它只为 webpack
   开发构建准备补丁，而发布包**已带** `public/index.js` 约 30 MB 的构建产物）。本目录 `.npmrc` 设了
   `ignore-scripts=true` 直接跳过。
2. **`prismarine-web-client` 不是我们的代码，也不能由我们重新发布** —— 要用它就连同上游许可一起用；
   本目录只是"怎么装、怎么起"的封装。

## 与仓库里另外两条路的分工

| | 是什么 | 什么时候用 |
|---|---|---|
| **`hosts/webplay`（本目录）** | 通用"网页玩 MC"（浏览器里跑 mineflayer，3D，能挖能放） | 想**当游戏玩**、连任意标准服 |
| `client/` + `src/`（仓库主体） | 轻量 2.5D 观战 + 接管 + 接缝协议（可嵌进 Cortico / dsh） | 想**看 + 轻操作**、要嵌进别的控制台 |
| `viewer-service/` | 本机那套现代画面接入（跑在千灯纪那套边上，派生资源自备） | 要看**千灯纪那套漂亮画面**、走统一外门 |

> 三者都能对着**同一台服务器**用；前两者都不依赖千灯纪。
