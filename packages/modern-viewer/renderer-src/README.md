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
| [host/](host/README.md) | 通用 Mineflayer 钓获与声音观察器，无 Cortico 或千灯纪运行依赖 |
| `src/modern-viewer/presets/qiandengji/`、`tools/presets/` | 可选的千灯纪 NPC 美术、身份与技能视觉映射 |
| [SOCKET_PROTOCOL.md](SOCKET_PROTOCOL.md) | 宿主项目的数据接入合约 |

技能规则、保护预检、试炼机制和 Agent 决策由
[千灯纪 World](https://github.com/jcs130/cortico-world-qiandengji) 等宿主扩展负责。
前端不执行这些服务端机制。历史 `corti-*` DOM 名称保留以兼容浏览器增强组件，
无需使用 Cortico 或 CortiLan 账号。

第三人称和 2.5D 的模型可见性由 `self-avatar-camera-visibility.js` 在每次实体绘制前处理。
自身模型不受区块遮挡缓存的瞬时变化影响；相机贴近时仍隐藏全身，协议隐身仍生效。
2.5D 始终以观察目标脚底所在格向上两格为裁切高度，移除整个画面中的上层地形，
并裁切模型、告示牌、旗帜等独立网格；上层怪物、玩家和掉落物逐帧隐藏。
裁切不依赖屋顶厚度或镜头射线，随观察目标和浮动原点更新，只影响网页画面。
第三人称保留局部遮挡透明；第一人称显示完整场景。
护甲各网格随人物骨骼动画显示，避免静态包围盒裁掉移动中的部件。

实体距离和区块遮挡查询统一使用 SceneOrigin 跟踪的世界坐标，避免镜头移动时
把近处人物、动物和怪物误判为远处模型、依赖正在重建的区块而闪烁。
受伤染色跳过没有颜色属性的着色器材质，保留附魔光效并避免中断事件处理。

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

默认使用通用 Minecraft 呈现。千灯纪的技能视觉映射和公会委托看板显示可以显式开启：

```powershell
node tools/build-minecraft-viewer-client.mjs . "<output-dir>" --preset=qiandengji
```

此选项只增加技能和公会资料显示适配，不启用参考包内的命名 NPC 身份、剧情或本地游戏玩法。
公会 CLI 的已收到文字会显示为只读看板，查看后收为当前委托卡片；通用宿主也可发送
`documentState` 展示自己的服务资料，字段见 [Socket.IO 合约](SOCKET_PROTOCOL.md)。

模型和肖像等额外美术资源需要宿主自己提供。Minecraft JAR、贴图、音频、角色模型与生成的
bundle 不在 Git 中分发；源码与工具使用仓库 MIT 许可，第三方依赖按其各自许可使用。
页面、样式和演出增强工具移植自 Cortico 部署的本地实现，其 MIT 版权声明保留于
[`tools/CORTICO_LICENSE`](tools/CORTICO_LICENSE)；方块实体几何的许可保留于
[`tools/minecraft-viewer-block-entity-geometry.LICENSE`](tools/minecraft-viewer-block-entity-geometry.LICENSE)。

### 可选：游戏音效与背景音乐

音频来自启动器的本地 `assets` 索引和对象缓存。以下工具校验版本索引与文件哈希，
不会联网下载资源；缺少本地资源时先用启动器安装相应版本：

```powershell
node tools/export-minecraft-viewer-sounds.mjs "<versions/1.20.6/1.20.6.json>" "<launcher-assets-dir>" "<output-dir>"
```

导出完整 sounds.json，包括所有变体、声音事件引用、音乐和唱片；音乐流式播放，不把长曲全部解码到内存。
宿主用 [通用观察器](host/README.md) 转发原始位置、实体及停止声音包，避免与 Mineflayer 派生事件重复播放。
浏览器点击音效/音乐按钮或与页面交互后才能播放音频。两个开关独立，声音设置中分别控制总音量、音效和音乐。
音乐按钮显示播放、等待倒数或静音状态；声音设置提供“试听音效”和“立即播放音乐”。后者可跳过当前等待，不会叠加正在播放的曲目或打断唱片。自动音乐仍保留原版的曲间间隔。
原版背景音乐根据已知维度/群系选择，曲目之间保留原版式间隔，不连续循环。

#### 可选原创 BGM 与前景音频

部署可以另行提供 `public/sounds/custom-bgm.json`，不修改原版 `manifest.json` 或其来源哈希：

```json
{"version":1,"tracks":[{"id":"river-at-dusk","title":"暮色河畔","file":"custom-bgm/river-at-dusk-20261005.ogg"}]}
```

`file` 相对于 `/sounds/`，仅接受由小写字母、数字、下划线、连字符组成的路径段和 `.ogg` 后缀；
绝对路径、空路径段、点路径段、反斜杠、URL、编码字符和查询参数均拒绝。
目录最多 500 首，`id` 唯一且为 1–160 个小写字母、数字、点、下划线或连字符，
`title` 为不含控制符的非空文本，最多 300 字符；目录及曲目不接受额外字段。
声音设置新增原版、原创、关闭三个来源和“刷新音乐目录”。
也可调用 `window.cortiWorldAudio.setMusicSource('custom')` 与 `await window.cortiWorldAudio.reloadCatalog()`。
刷新使用浏览器缓存重验证；网络、JSON 或校验失败保留上一份有效目录，并发刷新只接受最后一次请求。
原创音乐首次等待 1–3 秒，曲目结束后等待 3–8 秒自动续播；演唱期间仍阻止新曲启动。
原版首次等待 10–30 秒、曲间等待 5–10 分钟，保持原有行为。
缺少原创目录时不会回退播放原版。音频仍流式播放，更新音频内容时应使用新的文件名以避开旧缓存。

`window.cortiWorldAudio.setForegroundAudio({speech:true,music:false})` 将背景音乐降至用户音量的 20%；
`music:true` 将背景音乐静音并阻止新曲启动。清除两项状态后恢复当前用户音量；临时状态不写入浏览器偏好，
音效和唱片不受影响。直接调用此接口的宿主负责在前景音频结束时清除状态。
跨窗口宿主可以从当前页面内的 iframe 每秒发送
`{type:'mc-viewer.foreground-audio',detail:{speech:boolean,music:boolean}}`，
明确指定从 `document.referrer` 获得的父页面 origin 为 `postMessage` 的 `targetOrigin`。
播放器同时核对发送窗口与当前 DOM iframe 的 `contentWindow`、当前 `src` 的 origin；
未收到有效消息达 3.5 秒自动解除临时状态。协议不依赖特定宿主、iframe ID 或端口。
实际来源、曲名和前景状态可从声音面板、`state()` 或声音状态 output 的
`data-audio-music-source`、`data-audio-music-track`、`data-audio-foreground-speech`、`data-audio-foreground-music` 查看。

1.20.6 的服务器编号音效必须使用准确的原版注册表；依赖库沿用的 1.20.4 编号会播出错误声音。以下工具同时导出声音编号和脚步、挖掘所需的方块声音类型：

```powershell
# 额外需要 Java 21；最后一个参数可省略，默认使用 PATH 中的 java
node tools/export-minecraft-viewer-block-sounds.mjs "<versions/1.20.6/1.20.6.json>" "<launcher-libraries-dir>" "<output-dir>" "<java-21-executable>"
```

工具离线校验客户端与已安装依赖哈希，读取准确的 1607 个声音编号及 1060 种方块的 step / hit / break 等声音。
生成 `public/sounds/registry.json` 和 `block-sounds.json`；不下载或分发 JAR，不启动游戏窗口、不连接服务器。
宿主先用 `loadViewerSoundRegistry` 读取准确表，再转发原始声音包。缺少准确编号表时禁用编号音效并显示诊断，
直接名称音效和背景音乐仍可用；缺少方块声音映射时，脚步与挖掘不猜材质。
宿主须提供实际已加载的 surfaceBlock、动作状态及原版拾取事件，详见 Socket.IO 合约。

### 钓获展示

通用观察器核对本人鱼漂、上钩、收竿、战利品飞行、实际拾取和入包，才发送 `fishingCatch`。
三个视角都显示短暂钓获卡片，包含物品图标、实际数量、自定义名称及附魔装饰；宝藏与杂物无需单独名单。
普通拾取不会冒充钓获，旧事件不会在重连后重播，也不会向聊天或模型上下文塞入展示数据。

### 背包人物预览

点击「背包」或按 E，在原版背包的人物槽查看当前皮肤、四件盔甲及双手物品；移动鼠标可轻微转向。
人物保持独立站姿，不改变游戏中的位置、视角或动作。第一人称、第三人称和地下城视角均可使用。
预览优先复用现有玩家模型；尚未生成世界模型时，用同一皮肤和装备装配器建立私有模型，
装备与贴图延迟加载仍会更新。此功能只用通用 `avatarState.entity.equipment`，无需额外服务端插件。
关闭背包、切换到其他物品窗口、断线或页面隐藏后停止绘制；只复用一个预览渲染器，不释放世界的共享资源。

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
