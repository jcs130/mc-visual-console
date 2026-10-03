# Minecraft 1.20.6 现代网页渲染器

此目录提供浏览器源码、页面与样式、HUD/动画/特效增强、离线资源导出与构建工具。
可以在其他 Mineflayer 项目复用，无需本机 Cortico 目录。

## 目录

| 路径 | 用途 |
| --- | --- |
| `src/modern-viewer/` | Three.js 渲染、区块与实体、装备、镜头、玩家交互呈现 |
| `src/page-template.html`、`src/viewer.css` | 页面结构、生存 HUD、物品界面、小地图与技能栏布局 |
| `src/viewer-page.mjs` | 输出第一人称、第三人称、地下城 2.5D 页面 |
| `tools/` | HUD、物品图标、动作、盾牌、粒子、音效、遮挡处理以及离线构建/校验 |
| `src/modern-viewer/presets/qiandengji/`、`tools/presets/` | 可选的千灯纪 NPC 美术、身份与技能视觉映射 |
| [SOCKET_PROTOCOL.md](SOCKET_PROTOCOL.md) | 宿主项目的数据接入合约 |

技能规则、保护预检、试炼机制和 Agent 决策由
[千灯纪 World](https://github.com/jcs130/cortico-world-qiandengji) 等宿主扩展负责。
前端不执行这些服务端机制。历史 `corti-*` DOM 名称保留以兼容浏览器增强组件，
无需使用 Cortico 或 CortiLan 账号。

## 独立构建

准备 Node.js 22 或更新版本、Python 3，以及自己持有的官方 **Java 1.20.6 客户端 JAR**。
本目录使用独立 `package-lock.json`。在仓库根目录执行以下步骤，将占位路径替换为实际路径：

```powershell
cd packages/modern-viewer/renderer-src
npm ci
python -m pip install -r tools/requirements.txt
python tools/export-minecraft-viewer-assets.py "<1.20.6-client.jar>" "<output-dir>"
node tools/build-minecraft-viewer-client.mjs . "<output-dir>"
node tools/verify-minecraft-viewer-assets.mjs "<1.20.6-client.jar>" "<output-dir>"
```

导出与校验绑定同一 JAR 的哈希，检查方块状态、模型、贴图、物品图标和绘画。
构建器从锁定的 npm 依赖提取 worker，自动接入原版皮肤和浏览器增强组件。
该构建流程当前只接受 1.20.6，不使用其他版本的资源代替。

默认使用通用 Minecraft 呈现。千灯纪的额外美术映射可以显式开启：

```powershell
node tools/build-minecraft-viewer-client.mjs . "<output-dir>" --preset=qiandengji
```

模型和肖像等额外美术资源需要宿主自己提供。Minecraft JAR、贴图、音频、角色模型与生成的
bundle 不在 Git 中分发；源码与工具使用仓库 MIT 许可，第三方依赖按其各自许可使用。
页面、样式和演出增强工具移植自 Cortico 部署的本地实现，其 MIT 版权声明保留于
[`tools/CORTICO_LICENSE`](tools/CORTICO_LICENSE)；方块实体几何的许可保留于
[`tools/minecraft-viewer-block-entity-geometry.LICENSE`](tools/minecraft-viewer-block-entity-geometry.LICENSE)。

### 可选：游戏音效

音频来自启动器的本地 `assets` 索引和对象缓存。以下工具校验版本索引与文件哈希，
不会联网下载资源；缺少本地资源时先用启动器安装相应版本：

```powershell
node tools/export-minecraft-viewer-sounds.mjs "<versions/1.20.6/1.20.6.json>" "<launcher-assets-dir>" "<output-dir>"
```

浏览器按音效按钮或与页面交互后才能播放音频。宿主还需要转发相应的音效事件。

## 产物与接入

产物布局：

```text
<output-dir>/
  dist/modern-viewer.js          浏览器 bundle
  public/index.html             第一人称
  public/third/index.html        第三人称
  public/dungeon/index.html      地下城 2.5D
  public/viewer.css              页面样式
  public/textures/, icons/, ...  导出的资源与 workers
  viewer-client.json             构建版本与哈希
```

宿主 HTTP 服务需在同一来源提供：

| URL | 文件或服务 |
| --- | --- |
| `/`、`/third/`、`/dungeon/` | `public/` 中的三个页面 |
| `/index.js` | `dist/modern-viewer.js` |
| `/viewer.css` 和资源路径 | `public/` 中对应文件；相对请求也需支持 `/third/`、`/dungeon/` 前缀 |
| `/textures/gui/...` 等版本省略路径 | `public/textures/1.20.6/` 中对应文件 |
| `/socket.io` | 第一人称数据连接 |
| `/third/socket.io` | 第三人称和 2.5D 数据连接 |

使用 Express 时，可以在自己的宿主应用中增加以下静态路由。先提供三个页面本身，再给
子路径中的 worker/资源请求提供回退，以及 HUD 使用的版本纹理别名：

```js
import express from 'express';
import path from 'node:path';

const app = express();
const outputRoot = path.resolve('<output-dir>');
const publicRoot = path.join(outputRoot, 'public');
app.get(['/index.js', '/third/index.js', '/dungeon/index.js'], (_req, res) => {
  res.sendFile(path.join(outputRoot, 'dist', 'modern-viewer.js'));
});
app.use(express.static(publicRoot));
app.use(['/third', '/dungeon'], express.static(publicRoot));
app.use(['/textures', '/third/textures', '/dungeon/textures'],
  express.static(path.join(publicRoot, 'textures', '1.20.6')));
// 在同一 HTTP server 上接入 /socket.io 和 /third/socket.io，并发送下述游戏状态。
```

连接建立后按 [Socket.IO 合约](SOCKET_PROTOCOL.md) 发送版本、世界高度、当前位置、区块和实体，
持续推送变化；只提供静态文件不会产生游戏画面。本次发布提供完整前端构建，宿主的数据适配器
由接入项目实现。现有 Cortico 的通用 Minecraft viewer 桥接可直接使用这些产物。

生命、饱食度、氧气、经验、装备和物品窗口来自 Mineflayer。魔力、技能图标与冷却使用可选的
`skillsState`；任何服务端都可以提供这个规范化状态，前端无需依赖千灯纪的消息频道。
施法反馈同样使用可选的结构化事件；没有这些状态的普通服务器可以只接通用画面。

## 检查源码

```powershell
# 本目录：离线工具与预设隔离测试
npm run test:tools
# 仓库根目录，先安装根依赖：通用控制台、渲染模型、钓鱼及页面测试
pnpm test
pnpm run typecheck
```
