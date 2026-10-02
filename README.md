# mc-visual-console

Mineflayer 驱动的 Minecraft 网页可视化。现代画面渲染器的源码在
[`packages/modern-viewer/renderer-src`](packages/modern-viewer/renderer-src/README.md)；
1.20.6 模型、贴图和浏览器 bundle 从使用者本地的原版客户端 JAR 生成，不在此仓库分发。

## 代码边界

| 层 | 从哪里取得数据 | 归属 |
| --- | --- | --- |
| 通用画面 | Mineflayer 已收到的区块、实体、装备、背包、窗口、交易、天气、生命/饱食度、状态效果、粒子、音效和动作 | 本仓库的现代渲染器；Cortico 的通用 Minecraft viewer 桥接负责发送画面数据 |
| 千灯纪 World | `/mycli`、保护预检、技能和试炼规则、服务端事件的行动语义 | [cortico-world-qiandengji](https://github.com/jcs130/cortico-world-qiandengji) |
| 千灯纪画面预设 | 精确身份匹配的命名 NPC、肖像、美术档案与网页本地剧情 | `renderer-src/src/modern-viewer/presets/qiandengji/`；普通实体仍使用通用渲染 |
| 服务端状态 | 可选的 `mcagent:state`、`mcagent:event` 插件消息 | 千灯纪服务端提供；普通服务器无需这些消息，通用画面照常运行 |

现代网页画面**不在**千灯纪 World 扩展里。千灯纪 World 复用 Cortico 的 Minecraft 连接和执行器，Cortico 在 `:7793` 提供 viewer 桥接，本仓库提供浏览器渲染源码。通用画面只显示客户端收到的信息；服务端独有的魔力、技能冷却等需服务端另发结构化状态。

## 构建 1.20.6 画面

先按[渲染器说明](packages/modern-viewer/renderer-src/README.md)安装源码依赖，从自己持有的 1.20.6 客户端 JAR 导出资源，再用 Cortico 构建脚本生成浏览器包。构建脚本当前位于 Cortico 仓库；它提供 Mineflayer Socket.IO 桥接和版本适配。本仓库的源码可以独立维护，生成包可以被多个 World 使用。

```powershell
# 在 Cortico 仓库根目录，路径按本机实际位置替换
python scripts/export-minecraft-viewer-assets.py <1.20.6-client.jar> <output-dir>
node scripts/build-minecraft-viewer-client.mjs <mc-visual-console>/packages/modern-viewer/renderer-src <output-dir>
node scripts/verify-minecraft-viewer-assets.mjs <1.20.6-client.jar> <output-dir>
```

在 Cortico 部署的 `worlds.minecraft.viewerAssetsDir` 或 `worlds.mymc.viewerAssetsDir` 指向 `<output-dir>`。当前桥接只绑定本机 `127.0.0.1`，不要直接暴露到公网。

旧版独立控制台、webplay 的实验记录在 [`docs/early-roadmap.md`](docs/early-roadmap.md)。它们与这套 1.20.6 直播画面的构建和兼容承诺不同。
