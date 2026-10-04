# mc-visual-console

Mineflayer 驱动的 Minecraft 网页可视化。现代画面渲染器的源码在
[`packages/modern-viewer/renderer-src`](packages/modern-viewer/renderer-src/README.md)；
1.20.6 模型、贴图和浏览器 bundle 从使用者本地的原版客户端 JAR 生成，不在此仓库分发。

## 代码边界

| 层 | 从哪里取得数据 | 归属 |
| --- | --- | --- |
| 通用画面 | Mineflayer 已收到的区块、实体、装备、背包、窗口、交易、天气、生命/饱食度、状态效果、粒子、音效和动作 | 本仓库的现代渲染器、页面和构建工具；宿主项目负责按 Socket.IO 合约发送数据 |
| 千灯纪 World | `/mycli`、保护预检、技能和试炼规则、服务端事件的行动语义 | [cortico-world-qiandengji](https://github.com/jcs130/cortico-world-qiandengji) |
| 千灯纪画面预设 | 精确身份匹配的命名 NPC、肖像、美术档案、技能视觉类型 | `renderer-src/src/modern-viewer/presets/qiandengji/` 和 `renderer-src/tools/presets/`；构建时可选择 |
| 服务端状态 | 可选的 `mcagent:state`、`mcagent:event` 插件消息 | 千灯纪服务端提供；普通服务器无需这些消息，通用画面照常运行 |

现代网页画面**不在**千灯纪 World 扩展里。千灯纪 World 复用 Cortico 的 Minecraft 连接和执行器，Cortico 在 `:7793` 提供 viewer 桥接，本仓库提供浏览器渲染源码。通用画面只显示客户端收到的信息；服务端独有的魔力、技能冷却等需服务端另发结构化状态。

## 构建 1.20.6 画面

页面、HUD、动作、装备、钓鱼、特效、音效处理以及离线构建工具均在独立仓库。按[渲染器说明](packages/modern-viewer/renderer-src/README.md)安装依赖，用自己持有的 **Java 1.20.6** 客户端 JAR 导出资源并构建；无需 Cortico 源码目录。

```powershell
cd packages/modern-viewer/renderer-src
npm ci
python -m pip install -r tools/requirements.txt
python tools/export-minecraft-viewer-assets.py "<1.20.6-client.jar>" "<output-dir>"
node tools/build-minecraft-viewer-client.mjs . "<output-dir>"
node tools/verify-minecraft-viewer-assets.mjs "<1.20.6-client.jar>" "<output-dir>"
```

构建默认使用通用模式。千灯纪的技能视觉映射和公会看板显示用 `--preset=qiandengji` 显式开启；此选项不启用参考包内的命名 NPC 身份或本地剧情。服务端机制和 Agent 决策仍在独立 World 中。

## 在另一个项目复用

从 [`renderer-src/README.md`](packages/modern-viewer/renderer-src/README.md) 开始：宿主提供静态文件和 Socket.IO 数据桥接，前端通过 [`SOCKET_PROTOCOL.md`](packages/modern-viewer/renderer-src/SOCKET_PROTOCOL.md) 接收 Mineflayer 状态。第一人称、第三人称和地下城 2.5D 共用同一套资源。

生命、饱食度、装备和背包等来自 Mineflayer。魔力、技能和冷却使用可选的规范化 `skillsState` 数据，其他服务器可以提供自己的适配器，无需安装千灯纪插件。

在现有 Cortico 部署中，将 `worlds.minecraft.viewerAssetsDir` 或 `worlds.mymc.viewerAssetsDir` 指向 `<output-dir>`，沿用其 viewer 桥接即可。

旧版独立控制台、webplay 的实验记录在 [`docs/early-roadmap.md`](docs/early-roadmap.md)。它们与这套 1.20.6 直播画面的构建和兼容承诺不同。
