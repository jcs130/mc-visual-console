# mc-visual-console

Mineflayer 驱动的 Minecraft 网页可视化。现代画面渲染器的源码在
[`packages/modern-viewer/renderer-src`](packages/modern-viewer/renderer-src/README.md)；
按版本提交的模型、贴图、物品图标和可选音频位于 [`asset-packs`](packages/modern-viewer/asset-packs/README.md)，浏览器 bundle 从当前源码构建。
1.21.1 模组服另有使用实际模组包资源与注册表的原生接入路径，复用同一套完整页面和界面布局；
两个版本的数据与构建入口分别维护，不能混用方块编号或代理模型。

## 代码边界

| 层 | 从哪里取得数据 | 归属 |
| --- | --- | --- |
| 通用画面 | Mineflayer 已收到的区块、实体、装备、背包、窗口、交易、天气、生命/饱食度、状态效果、粒子、音效和动作 | 本仓库的现代渲染器、页面和构建工具；宿主项目负责按 Socket.IO 合约发送数据 |
| 千灯纪 World | `/mycli`、保护预检、技能和试炼规则、服务端事件的行动语义 | [cortico-world-qiandengji](https://github.com/jcs130/cortico-world-qiandengji) |
| 千灯纪画面预设 | 精确身份匹配的命名 NPC、肖像、美术档案、技能视觉类型 | `renderer-src/src/modern-viewer/presets/qiandengji/` 和 `renderer-src/tools/presets/`；构建时可选择 |
| 服务端状态 | 可选的 `mcagent:state`、`mcagent:event` 插件消息 | 千灯纪服务端提供；普通服务器无需这些消息，通用画面照常运行 |

现代网页画面**不在**千灯纪 World 扩展里。千灯纪 World 复用 Cortico 的 Minecraft 连接和执行器，Cortico 在 `:7793` 提供 viewer 桥接，本仓库提供浏览器渲染源码。通用画面只显示客户端收到的信息；服务端独有的魔力、技能冷却等需服务端另发结构化状态。

## 构建 1.20.6 画面

页面、HUD、动作、装备、钓鱼、特效、音效处理和原始素材均随仓库提供。在仓库根目录安装渲染器依赖，再校验素材并构建；无需 Cortico 或其他项目的本机素材目录。

```powershell
npm ci --prefix packages/modern-viewer/renderer-src
node tools/prepare-viewer-assets.mjs java-1.20.6 "<output-dir>"
```

命令先检查逐文件哈希，再复制对应版本的素材并编译当前浏览器代码；`viewer-assets.json` 记录素材版本和清单哈希。需要游戏音效时加 `--sounds`。自定义导出仍可按[渲染器说明](packages/modern-viewer/renderer-src/README.md)使用自己的客户端 JAR。

构建默认使用通用模式，适合 Neko 等其他宿主。千灯纪的技能视觉映射和公会看板显示用 `--preset=qiandengji` 显式开启；此选项不启用参考包内的命名 NPC 身份或本地剧情。服务端机制和 Agent 决策仍在独立 World 中。

1.20.6 的第三人称和 2.5D 画面只在检测到视线或顶层遮挡时开启透视／切面；无遮挡时恢复完整地形，不再常驻人物周围的透视圈。离开遮挡沿用连续采样确认，避免边缘来回闪烁。

## 1.21.1 模组服的原生接入

My Agent World 的实验接入复用原 `page-template.html`、`viewer.css`、背包人物预览和自适应画质组件，
由 `native-scene.js` 绘制实际 1.21.1 模组资源；`native-console.js` 与 `native-ui-adapter.js` 接上本人界面。
静态模型与纹理可从仓库中的 `native-1.21.1` 素材包准备；它绑定原模组包锁定哈希。注册表与资源覆盖变体来自匹配服务器的实际导出，缺失能力明确显示未支持。

宿主先调用 `prepareNativeWorldPreviewHost`，再向 `attach` 提供**已有动作 bot**、该连接的原生包流、
`getAgentStatus` 和可选 `getPresentationState`。宿主拥有 bot 的生命周期，网页不登录另一位观察者，
不提供游戏动作或管理员 HTTP 接口。资源导出、具体接口与回归命令见
[渲染器说明](packages/modern-viewer/renderer-src/README.md)，原生 SSE 合约见
[协议第 8 节](packages/modern-viewer/renderer-src/SOCKET_PROTOCOL.md#8-1211-模组原生前端sse)。

| 路径 | 当前作用 |
| --- | --- |
| `/`、`/third/` | 原完整页面的第一人称、第三人称跟随 |
| `/dungeon/` | 同一原完整页面的地下城 2.5D 跟随相机；遮挡、切面与点击操控尚未接入 |
| `/diagnostics` | 独立原生模型、身份、注册表与缺口检查页 |
| `/events`、`/status.json`、`/healthz` | 同账号 SSE、只读状态、连接与原生流健康 |

当前可展示实际生命/饥饿/经验、原生物品名称与数量、本人原生窗口和已收到的技能状态。
部分无组件敏感规则的原版物品可显示经原始 JSON 与 PNG 校验的静态图标；模组及动态物品图标、装备模型、
声音、小地图、全部实体与动画、完整光照仍需适配和实机验收。
资源哈希与测试通过分别证明来源和程序行为；完整画面一致性门槛保持关闭。
这一入口使用 SSE 和专用原生包桥，不能把模组 state ID 发给下面的 1.20.6 Socket.IO 渲染器。

2026-10-04 已在隔离的新 My Agent World 常驻服实际发布：浏览器验证同账号 Makena 皮肤、46 格背包与本人预览、
第一／第三人称和地下城相机，原版小麦种子与腐肉显示经过原始资源校验的静态图标，浏览器无 warn/error。
这是一次实际部署和短时游玩验证，旧服未改；完整模组画面、长期稳定和基岩接入尚未验收。

## 测试与维护

仓库根目录的 `pnpm test` 运行全部可独立使用的核心与 renderer 回归，不要求 Cortico。
`pnpm test:cortico` 单独验证真实可选 Cortico API；未安装 SDK 时用 `CORTICO_SOURCE_DIR` 指向实际源码 checkout，
缺失 SDK 会明确失败，不跳过或用 mock 替代。入口与所需源文件见 [测试说明](docs/TESTING.md)。
本轮根回归 230 项、renderer 专项 213 项、真实 Cortico 0.1.4 集成 6 项及 typecheck 通过，测试集合有重叠，不相加。

共享可视化改动与素材统一维护在 `main`；后端实验 worker 的分支单独维护。

## 在另一个项目复用

从 [`renderer-src/README.md`](packages/modern-viewer/renderer-src/README.md) 开始：宿主提供静态文件和 Socket.IO 数据桥接，前端通过 [`SOCKET_PROTOCOL.md`](packages/modern-viewer/renderer-src/SOCKET_PROTOCOL.md) 接收 Mineflayer 状态。第一人称、第三人称和地下城 2.5D 共用同一套资源。

Neko 接入与更新检查见 [Neko 复用说明](docs/NEKO-INTEGRATION.md)。

生命、饱食度、装备和背包等来自 Mineflayer。魔力、技能和冷却使用可选的规范化 `skillsState` 数据，其他服务器可以提供自己的适配器，无需安装千灯纪插件。

在现有 Cortico 部署中，将 `worlds.minecraft.viewerAssetsDir` 或 `worlds.mymc.viewerAssetsDir` 指向 `<output-dir>`，沿用其 viewer 桥接即可。

### 同步共享优化

共享源码以本仓库的 `main` 分支为准。各项目更新源码后，需要按自己的 Minecraft 版本、原资源目录和预设重新构建；更新宿主代码不会更新已经复制的浏览器文件。

1. 在可视化源码目录运行 `git pull --ff-only origin main`，并记录 `git rev-parse HEAD`。
2. 使用上面的离线构建步骤生成新产物。保留原资源版本；千灯纪继续使用 `--preset=qiandengji`，原生模组宿主按其原生构建说明更新。
3. 将产物同步到宿主实际提供的静态资源目录，核对 `viewer-client.json` 的 `browserBundleSha256` 与页面 `/index.js` 的内容哈希，然后刷新页面。

原资源未变时无需重新导出 Minecraft JAR。不同版本或预设的产物分别构建，不互相覆盖。发布源码、更新本地部署和其他机器完成更新是三个独立结果。

旧版独立控制台、webplay 的实验记录在 [`docs/early-roadmap.md`](docs/early-roadmap.md)。它们与这套 1.20.6 直播画面的构建和兼容承诺不同。
