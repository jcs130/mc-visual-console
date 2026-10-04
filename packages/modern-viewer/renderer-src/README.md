# Minecraft 现代网页渲染器

此目录提供浏览器源码、页面与样式、HUD/动画/特效增强、离线资源导出与构建工具。
可以在其他 Mineflayer 项目复用，无需本机 Cortico 目录。
1.20.6 的独立构建与 Socket.IO 接入保留；1.21.1 模组实验通过原生资源、同账号包流和独立场景后端接入同一套页面。

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
背景音乐根据已知维度/群系选择，曲目之间保留原版式间隔，不连续循环。

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

## 1.21.1 模组画面的原生资源准备

My Agent World 要求贴图和建模与相同模组包的 Java 客户端一致。该实验路径禁止原版替代块、代理 state ID、裁切贴图和凭名称生成简化模型；目前支持部分原生场景和原完整页面的本人界面，尚未完成全部 1.21.1 模组画面。上文的 1.20.6 构建入口保持其原有版本范围。

`tools/native_viewer_assets.py` 从对应客户端、已锁定的模组 JAR、平台 JAR及可选资源包导出原始 `assets/<namespace>/...` 字节，逐文件核对 SHA-256；保留父模型、UV、旋转、动画元数据和嵌套库。输入必须包含实际模组包的注册表，不能用原版属性顺序推导模组 state ID。不同资源来源的同名文件全部保存在 `asset-variants/`，报告覆盖关系；特别是 atlas 定义需要按原生资源栈合并，不能仅使用最后一个 JSON 文件。未证明的 FML/资源包优先级明确标为未验收。

```powershell
python tools/native_viewer_assets.py --client-jar "<1.21.1-client.jar>" `
  --modpack-lock "<society-lab-1.21.1.lock.json>" --mods-dir "<locked-mods-dir>" `
  --platform-jar "<neoforge-21.1.248-universal.jar>" `
  --registry-dir "<native-registry-export-dir>" --output "<new-output-dir>"
python tools/native_viewer_assets.py --verify "<output-dir>"
python tools/native_viewer_assets.py --verify "<output-dir>" --require-render-parity
```

注册表包含 `blocks.tsv`、`items.tsv`、`components.tsv`、`block-states.jsonl` 和 `entities.tsv`。逐状态 JSONL 保存真实网络号、注册 ID、属性、`renderShape` 与 `hasBlockEntity`；由隔离 NeoForge 实例读取导出。生成目录必须全新，工具不删除或覆盖之前的导出。

`native-assets.json` 分别记录资源完整性、注册表来源、静态模型依赖、原生 loader/方块实体渲染需求与画面验收状态。静态模型依赖完整也只记为 `json_model_sources_verified`，不代表客户端效果已一致。普通校验确认原始资源字节；严格校验在动态渲染、资源优先级、实际场景对照尚未通过时拒绝宣称完整画面，不能回退到原版近似模型。

Create 的轴/曲柄原生旋转、女仆骨骼动画、Domum 材质组合等需要相应模组的渲染逻辑和运行状态。**优先在 Three.js 中移植原生逻辑**：Java 代码定义动画，不等于只能用 Java 画面串流。机械可按真实转速更新原始模型矩阵，骨骼动画可接原始动画与姿态混合，粒子与动态材质分别实现对应发射和着色规则。原生 NeoForge 客户端用于画面对照。仅复制贴图不会自动执行 [BlockEntityRenderer](https://docs.neoforged.net/docs/1.21.1/blockentities/ber/) 或 [自定义模型加载器](https://docs.neoforged.net/docs/1.21.1/resources/client/models/modelloaders/)；是否需要另一种显示后端，应基于实测限制判断。

### 原生 Create 动画的网页验收入口

`src/native-viewer/model-loader.js` 在读取每份模型/贴图时核对导出索引的 SHA-256，解析父模型、子级纹理、原始面 UV、方块变体和元素旋转；使用原始 PNG，不生成替代几何。资源覆盖未决、缺失模型/贴图、自定义 loader 和未知染色提供器仍明确拒绝。下文的实时入口新增了经核对的位置加权变体、普通 multipart、UV lock 与原始动画贴图；未核对的随机种子覆盖仍拒绝，不能据此宣称通用模型加载器已经覆盖整个模组包。

`create-kinetics.js` 当前只验收锁定的 Create 6.0.10 JAR（SHA-256 `ef87fe5709f1ba1f5b8bb20a2925b5afb4669e178fd6d8bf10c167759eefe37a`）。传动轴依据原生 RPM、轴向、坐标相位偏移旋转；曲柄加载原始 `hand_crank/block` 和完整 `hand_crank/handle` 模型，保留握柄的 45° 部件，按原生每 tick 四分之一速度追踪与 partial tick 插值处理正反转和停机惯性。规则核对安装 JAR 的字节码及 [Create 对应提交源码](https://github.com/Creators-of-Create/Create/tree/ac0c444d9828da3453ae8cc65338e8de063286fb)。更新 Create 版本须重新核对，不能悄悄套用旧适配。

```powershell
node tools/serve-native-create-preview.mjs "<native-assets-dir>" "<private-create-capture.json>" 28982
node --test tools/test/native-create.test.mjs
```

入口只监听 `127.0.0.1`，检查 Host/Origin，并按资源清单限制文件来源；本机另有同名端口时会报错。它是只读模型验收台，不登录新观察账号、不发游戏动作、不改变现有 1.20.6 画面、不开放公网入口。页面播放来自执行动作账号原生包的真实记录，显式标记“联机记录回放”。输入为 `kind=native_create_capture`、`schemaVersion=1`、`mode=recorded_same_player_connection`，含注册表哈希、`nodes[].position/state/initialSpeed`、`updates[].atMs/key/speed`、`durationMs` 及空的 `errors`。`state` 必须来自同版本的真实注册表；`key` 是绝对坐标 `x,y,z`。不能从兼容代理的 `stone` 推测机器身份。

隔离实测通过正转 `32`、反转 `-32`、停机 `0` RPM；浏览器实际显示 35 个原始模型面。6 项几何/资源/动画回归通过，真实 WebGL 正转、反转、停止按钮和布局均验证。首次页面出现画布增高反馈，已将画布移出布局流并重新加载验收；修复后视口持续保持 400 px，没有沿用失败截图。完整世界、光照、所有方向/资源包、动画实体和其他模组仍待对照，`renderParityVerified` 与严格验收门槛保持关闭。Create 转速指示粒子已在网关原生流解码，但此模型预览尚未渲染这些粒子。

```powershell
python -m unittest discover -s tools/test -p "test_native_viewer_assets.py" -v
```

### 同一玩家连接的实时原生世界

`tools/native-world-host.mjs` 提供 `loadNativeStateRegistry`、`NativeWorldState` 和 `attachNativeWorld({ bot, nativeStream, world })`，供宿主接入**已有执行动作的 bot**。`nativeStream` 使用同一 bot 的 `attachNativeViewerPackets(bot, registryHash)`，必须在登录包到达之前挂载；掉线后用新连接重建，不能延用旧序号或旧世界。维度解析回调读取这条连接实际收到的注册表高度、最小 Y 与维度名。普通 Mineflayer 世界中的兼容代理 ID 不参与原生渲染。

原生快照包含 `login/respawn`、区块加载/卸载、单方块及批量变化、方块实体转速和真实 `update_time`。注册表 SHA-256 或包序号不符立即清空并说明原因；不读取磁盘世界、不请求额外区块。默认检查玩家周围水平 ±10 格、向下 5 格、向上 10 格，缓存最多 512 个已收到区块列。快照带绝对坐标、维度、本人位置/实际眼高、区域范围和未收到的区块；重生或换维度以 `epoch` 丢弃旧场景。时间包间按 20 tick/s 插值机械动画，完整光照、服务器低 TPS 时的相位对照仍待验收。

`src/native-viewer/world-preview.js` 使用原始面几何的 `InstancedMesh` 绘制静态方块，原生方块实体驱动 Create 轴/曲柄。普通 multipart 按实际属性和 `OR/AND` 条件选择原始模型；加权变体目前只允许已核对默认 `BlockBehaviour.getSeed` 的原版石头与沙子。1.21.1 官方客户端（SHA-1 `30c73b1c5da787909b2f73340419fdf13b9def88`）的字节码证明变体使用**方块绝对位置种子**，不是世界种子；`model-selection.js` 保留 Java 32/64 位溢出、48 位随机数与加权选择。模组自定义种子、加权 multipart 等未适配时明确列出，不能改用随机贴图。

隔离 QA 入口可以用一个普通动作账号联机，网页跟随的就是这个账号，而非另一个观察者：

```powershell
# 在本目录执行；游戏模块需由所传 native-packet.cjs 的项目依赖或 NODE_PATH 解析。
node tools/serve-native-world-preview.mjs "<native-assets-dir>" "<native-viewer-packet.cjs>" MawWebRenderQA 28980 28983
node --test tools/test/native-create.test.mjs tools/test/native-model-selection.test.mjs tools/test/native-world.test.mjs tools/test/native-cutting-board.test.mjs
```

网关需要同包注册表并开启 `GATE_NATIVE_VIEWER=1`；NeoForge 时间桥需 `GATE_NEOFORGE_TIME_BRIDGE=1`。模组组件/粒子仍按各自真实 codec 配置，不能省略协议适配。QA 启动器只连接 `127.0.0.1`，HTTP 也只监听回环；只允许 GET、最多四个 SSE 客户端，检查 Host/Origin/资源路径及哈希。网页无游戏动作或管理接口。实际 Agent 项目应复用 `attachNativeWorld`，不要另外登录一个同名观察账号。诊断 harness 可在启动器内部导出的同一个 `bot` 上执行动作；这不开放 HTTP 控制。

2026-10-04 隔离服实测：同一普通账号获得 201 个原生区块列，原版圆石在 `(3,64,-3)` 正常放置并拆除（原生状态 `0→14→0`），实际移动改变网页位置；Create 正反转/停止 `32/-32/0 RPM` 在原生状态与真实浏览器均可见。首次放置因 MineColonies 权限拒绝，失败记录保留；将 QA 账号加入研究城镇后通过，没有授予 OP。圆石由 QA 控制台提供，仅证明普通放置/拆除与同步，不证明自主获取材料。16 项模型/随机变体/原生世界回归通过，包括真实区块二进制、负坐标、未知维度、序号丢失、卸载/重生清理与实际眼高。网页可切换区域视角和本人视角，并列出未适配内容；断流时清空旧画面。

上述首轮区域约 2,600 个非空气方块中绘制约 2,200 个；当时草木染色、水体、原生实体方块等有明确缺口。下面记录环境适配后的进展。`completeSceneParityVerified=false`、`renderParityVerified=false` 保持关闭，当前页面是实时检查工具，**不能作为已经一致的 Agent 完整视觉输入**。Minecraft JAR、导出资源、存档和私人实测记录仍不提交到 Git。

### 原生环境、液体和动画贴图（2026-10-04）

同一连接的 CONFIG `minecraft:worldgen/biome` 提供真实群系 ID、温度、降水及颜色覆盖，登录/重生的 `hashedSeed` 以完整有符号 64 位字符串保留。`native-environment.js` 移植官方 BiomeManager 的八角扰动查找和半径 2 的颜色混合，用经哈希验证的原始草/叶颜色图处理已适配的原版提供器；保留松树/桦树固定颜色、群系覆盖及深色森林规则。草、蕨和高草使用经核对的位置偏移。沼泽噪声染色、模组颜色或偏移提供器仍明确报缺口，不套用普通草地颜色。

诊断注册表需要包含原生 `solid`、`blocksMotion`、`canOcclude`、`dynamicShape`、`hasOffsetFunction`、`fluid` 及静态 `occlusionBoxes`。由隔离服的 `build_lab_registry_dump.py` 从实际 BlockState/FluidState 导出，动态形状不猜测。快照增加已收到的 1 格方块邻居和群系 quart 网格；不加载额外区块。区块列按真实注册表确定全局 palette 位宽，并针对本包的 17 位状态 ID 扩展解码；只扩展自己的列对象，不修改依赖或其他 bot。位宽、长度或尾部数据不符明确失败。

`native-fluid.js` 移植原版水的加权角高度、邻居面遮挡、浅水/流动方向、原始 still/flow/overlay UV 及背面规则。使用真实流体高度与静态体素形状，空数据、动态形状、未知模组 overlay 均报错。**原生 atlas 打包与 UV shrink、透明面排序、完整游戏光照、水中雾仍未验收**，`atlasShrinkVerified=false`；水面几何移植不代表最终水体画面已达 1:1。含水方块和其他模组液体也还需独立适配。

`uv-lock.js` 对照官方 FaceBakery 的面坐标变换；96 组方向/旋转/非对称 UV 在 3e-5 容差内吻合。`texture-animation.js` 按原始 `.mcmeta` 的帧尺寸、顺序和时长切换完整原始 PNG 的 GPU UV，支持整数 tick 插帧、原始 RGB 字节混合并保留当前帧 alpha；不裁剪或重写贴图。浏览器资源动画从本地加载时钟起算，尚未与 Java 客户端资源加载相位、atlas/mipmap 插帧逐像素对照。

直接调用官方客户端类核对了 96 组 UV、5 组 64 位种子扰动距离、9 组流向角、5 组真实草颜色图结果和原生液体高度累加。32 项 Node 回归与 8 项导出回归通过，覆盖大于 256 个状态的 17 位 direct palette、损坏长度/位宽、缺失群系、动态遮挡及动画时序。隔离服重连后当前区域 2,615 个非空气方块绘制 2,568 个，6 个实服水体状态全部生成几何、无未收到区块，真实 WebGL 未报错；随后用隔离服 3×3 小水池检查实时方块更新。小水池是明确的 QA 设施，不是自主建造或自然探索证明。原生实体方块、资源覆盖冲突、沼泽草染色、红树苗偏移等仍列在检查页；实体、GUI/背包、完整光照和粒子仍待继续移植。

```powershell
node --test tools/test/native-create.test.mjs tools/test/native-model-selection.test.mjs tools/test/native-world.test.mjs tools/test/native-environment.test.mjs tools/test/native-fluid.test.mjs tools/test/native-cutting-board.test.mjs
```

### 空切菜板原生模型与短游玩闭环（2026-10-04）

`src/native-viewer/cutting-board.js` 只适配已核对的 Farmer's Delight 1.3.4 JAR（SHA-256 `139ad7696462c89c03eea463f805abffa552526c5dadaadae221dd9624cb197c`）。原生 `CuttingBoardBlockEntity` 同步 `Inventory` 和 `IsItemCarved`；其 Java 渲染器在板上没有物品时立即返回，因此空板可直接显示原始方块模型。实际导出资源经过哈希读取验证：`farmersdelight:block/cutting_board` 有 4 个原始元素、20 个面，使用原始 497 字节 PNG；朝西变体保留原生 `y=270` 旋转。没有用木板、代理方块或生成几何代替切菜板。

宿主快照新增 `cuttingBoards[]`，每项含绝对 `position`、原生 `stateId` 和 `content`。它只读取行动玩家已经收到的方块实体数据：`Inventory.Size=1`、`Items=[]` 且完整字段可核对时为 `empty`，有实际物品时为 `occupied`，缺失或格式未知时为 `unknown`。**仅确认空板后才绘制原始静态模型**；占用状态明确报告顶部物品渲染未适配，并列出原生物品 ID 和数量，未知状态明确报告未收到或无法核对的数据，不把两者画成空板。不会额外读取磁盘库存或查询其他玩家。板上内容参与场景重建签名，原木放入、加工后清空等变化会使旧空板缓存失效；方块替换、卸载及缺失的新方块实体数据也不能沿用旧的空库存。

39 项原生渲染 Node 回归通过，包含本轮 7 项新增检查：真实空板标签、占用标签、缺失或损坏库存、版本与状态锁定、同连接的空板→占用→空板变化，以及替换和卸载后的旧数据清理。它们验证资源来源与状态门槛，**不能代替实际 WebGL 画面或相同模组 Java 客户端的场景对照**。顶部物品、实体、GUI/背包、完整光照和其他已有缺口仍未完成；`completeSceneParityVerified` 与 `renderParityVerified` 保持 false，整个画面尚未验收为 1:1。

同一普通 Mineflayer 动作账号还在隔离服实际完成自然采木→手工合成工作台、木斧和切菜板→放置并切割原木→拾取树皮和去皮原木。材料、合成产物和加工产物由本人原生库存及世界状态核对，本轮没有通过管理命令提供材料。这是同一账号的脚本游玩闭环，尚不证明 Agent 已能长期自主规划、持续生活或掌握全部模组功能。

真实浏览器读取 `MawWebRenderQA` 的当前连接，空板 `(5,64,-3)` 使用朝南的原始模型和贴图显示；将本人去皮原木放上板后，页面列出顶部物品渲染未适配及 `minecraft:stripped_mangrove_log ×1`，没有继续画旧的空板。空手取回并走近拾取后，模型恢复；最终区域 2,608 个非空气方块、2,560 个已绘制方块，13 项明确缺口、0 个未收到区块，浏览器无 warn/error。截图位于私人研究目录 `E:\QiandengJiSocietyLab\research\native-survival-play-preview-20261004.png`，不提交资源或实测库存。Mineflayer 动作端尚将此薄板映射为完整石头碰撞，通用模组 physics/pathfinder 仍需另行适配；正确原生渲染不代表兼容代理的寻路已正确。

### 同账号本人模型与观战视角（2026-10-04）

21:06 首轮独立检查页默认第三人称跟随行动玩家，提供第一人称、自由观察和“回到 Agent”；F5 切换第一／第三人称，双击画布回到 Agent。本轮完整页面的默认第一人称及路由见下一节。镜头与模型使用本人连接的绝对坐标、yaw/pitch 和眼高，不新建观战账号。自由观察距离限制在已收到的局部区域，跟随镜头随移动／重生更新；镜头避障仅使用实际已绘制的几何，不替未知方块编造碰撞。

`native-world-preview-host.mjs` 的 snapshot/frame 与 `/status.json` 增加 `selfPlayer`：本人 UUID、名字、实体 ID、位置、朝向、眼高、生命、最大生命、饱食、着地、潜行、速度和皮肤可用状态。缺失数值用 null；断连或 UUID／身份不符时整个对象为 null。最大生命由收到的真实属性和 modifier 计算，HUD 不用固定 20 冒充实时值。profile 只报告是否含自定义 textures，不输出纹理值或 URL。

`native-player.js` 使用 skinview3d 3.4.2 的经典玩家六部位与第二层原始 UV。默认皮肤按锁定 Minecraft 1.21.1 客户端的 `floorMod(UUID.hashCode(),18)` 选择，九张 slim 后九张 wide；只读取资源清单中的原始 64×64 PNG 并校验哈希。真实 profile 有自定义纹理或未确定时明确标为不可用，不套用 Steve、VRoid 或千灯纪旧皮肤。`player-camera.js` 使用 Mineflayer 的真实视线约定（yaw=0 朝 -Z、正 pitch 朝上）。

首轮验收只覆盖本账号经典身体和真实头部俯仰；没有证明完整步行／潜行／游泳动画、持物、防具、自定义在线皮肤和其他实体一致。原生状态中的 `entityRenderingAvailable` 与完整场景一致性门槛仍为 false。原始模型和皮肤来源核验、实际 WebGL 可见性、完整 Java 画面对照分别验收，不能相互替代。

```powershell
node --test tools/test/native-player.test.mjs tools/test/player-camera.test.mjs tools/test/native-world-preview-host.test.mjs tools/test/agent-status.test.mjs
```

### 原完整页面接入原生场景与本人界面

`native-scene.js` 从原实时检查页拆出场景、相机、资源与生命周期逻辑；`world-preview.js` 继续作为诊断入口。
`native-console.js` 在原 `page-template.html` / `viewer.css` 下挂接该场景，复用背包人物预览、钓获展示组件和
自适应画质控制器。皮肤预览只能克隆当前已验证的本人模型，禁用无来源的默认人物回退；Three.js 在浏览器构建中统一为同一个实例。

页面 `/` 默认为第一人称，`/third/` 为第三人称，F5 切换两者；`/dungeon/` 使用地下城 2.5D 相机跟随本人，遮挡、切面和点击操控仍待接入。
`/diagnostics` 保留独立检查页。首页收起开发诊断，但继续明确说明未适配内容；重新使用完整页面不代表旧版所有显示功能已迁移。

`prepareNativeWorldPreviewHost({ assetDirectory, port })` 只准备资源和浏览器 bundle，不登录游戏或监听端口。
`prepared.attach({ bot, nativeStream, simplifyNBT, resolveDimension, expectedUsername, getAgentStatus, getPresentationState })`
绑定调用方已有账号，再由 `host.listen()` 监听回环；关闭宿主只释放自己的网页、订阅和计时器，不停止调用方的 bot。
必须在登录包到达前挂接原生包流。`getPresentationState` 是可选的同步只读回调，不是新增模型或管理员接口。

本人界面接收 `presentation`：实际生命、饥饿、经验与姿态、本人原生 `inventory` / `nativeMenu`、已收到的 `skills`，
以及这条连接的消息、标题、动作栏、时间和天气。原生物品保留命名空间、数量、槽位和完整 SNBT；菜单暂未提供标题时显示未知。
菜单打开/关闭只观察真实游戏状态，观众打开背包、切换视角和查看资料都不会发游戏点击。详见 [原生 SSE 合约](SOCKET_PROTOCOL.md#8-1211-模组原生前端sse)。

生存 HUD 的图像从同一资产清单中的原始 1.21.1 GUI PNG 校验读取，不借用旧 1.20.6 图集。
部分已核对无运行时颜色/模型选择的原版物品支持静态图标：按原始 JSON 的 generated/handheld 继承解析单层 PNG，
核对资源哈希与覆盖优先级。未移植的模组提供器、组件敏感规则、override、多层、动画及未核对的非平面模型仍拒绝；格子保留原生名称、真实数量与 SNBT，
不会把未知物品映射成同名原版图标。持物/盔甲模型仍未支持。
声音、音乐、小地图和网页夜视按钮明确标为未支持。没有魔力、冷却或最大生命数据时保留未知，不能补固定值或推算成可施放。

原生会话校验账号 UUID、注册表哈希和 epoch；断流清空旧场景与界面，旧 frame 不能复活已清理的世界。
宿主只接受 GET、同源 Host/Origin，SSE 最多四个客户端并有字节上限和背压处理；浏览器从唯一原生场景订阅取得状态。
不会为了重用界面把模组编号送入原版代理注册表。模型源码/状态测试、真实浏览器演示与匹配 Java 客户端的画面比较仍分别验收，
`completeSceneParityVerified=false` 和严格资源验收门槛保持不变。

```powershell
node --test tools/test/native-session.test.mjs tools/test/native-world-preview-host.test.mjs tools/test/native-ui-adapter.test.mjs tools/test/native-console.test.mjs tools/test/native-item-icons.test.mjs
```

本轮 UI/页面/静态图标 21 项定向回归通过，覆盖同账号组件保留、未知 HUD、原始 GUI 资源、真实 actor 预览、菜单生命周期、
唯一场景订阅、真实三种相机、持续压力下的画质调整、图标资源与异步释放。本轮 renderer 全部专项 213 项、仓库根回归 230 项、
真实 Cortico 0.1.4 集成 6 项和 typecheck 通过；各入口有重叠，不能相加。可选真实 SDK 测试独立运行，见 [仓库测试说明](../../../docs/TESTING.md)。

22:35:10 新 My Agent World 通过其 owned 守护恢复，22:35:37 worker 启动，旧服务器未改。
真实浏览器在完整页面 `/third/` 看到本人原始 Makena 皮肤，按 E 后显示实际 46 格原生背包和本人预览；第一人称与地下城相机也实际验证。
小麦种子与腐肉使用原始模型/PNG 的静态图标，其余未适配内容显示原生文字，不借用近似图标。实服当前生命 20，最大生命未收到仍显示未知；
Ars 本人回执为 100/100 魔力。三种页面没有浏览器 warn/error，截图保留于仓库外
`E:\QiandengJiSocietyLab\agents\maw-explorer\full-native-console-20261004.jpg`。
这是实际发布与短时展示验证，不证明全部实体、装备、动画、光照、声音、长期稳定或新服基岩兼容。
上述完整控制台已合并并发布 `main`；后续可视化改进在主干继续。

### 连续地形与刷新预算（2026-10-04）

原生快照默认由水平 ±10、向下5/向上10扩展为水平 ±24、上下各24格，通常为49×49×49。
这仍是本人已收到区块中的有界视窗，并非整个加载距离或完整 Java 场景。
`viewCoverage` 声明请求范围、实际 `bounds`、收到/缺失区块、扫描量及预算限制；
若达到100000非空气块、262144扫描格或1.5MiB快照上限，整体缩小水平范围并明确说明原因，
不逐块截断数据、不把缺失区块当空气，也不读取磁盘或额外加载区块。
液体邻点改为实际流体方块所需3×3×3去重采样，保留真实空气和水浸状态，避免发送无关整片空气。

姿态与本人界面持续更新，地形刷新至少间隔500ms；移动达到4格才重新锚定视窗。
区块和方块变化合并刷新，重生/换维度清除缓存；第二个观众复用同一个完整快照，
浏览器背压期间不继续扫描或堆积更新。`/status.json` 的 `viewer.terrain` 提供实际扫描次数/耗时和范围。
扩大地形仍保留原始模型、纹理和完整非空气块，未加入猜测的遮挡剔除。

基础步行动画使用同一 bot 的连续 `physicsTick`，按锁定1.21.1的 `WalkAnimationState`、
`HumanoidModel` float/LUT公式与骨骼轴变换计算；轻量 `motion` SSE 约20Hz传递，
不重复库存或唤醒模型。浏览器只插值一个已知50ms tick，断流冻结；传送/死亡/重生/维度变化清除旧步态。
现在只启用已知站立、在地面上的基础四肢动作；真实实体年龄未知时不添加待机摆动。
bodyYaw、持物、攻击、游泳等覆写及完整动画画面对照仍未验收，不能称为完整客户端动画。

泥土、橡木原木、圆石增加原始立方模型GUI图标，使用原JSON继承、六面UV、GUI变换、
原PNG与客户端GUI光照；支持范围有明确白名单。组件、动态模型、模组提供器和专用实体渲染器仍拒绝，
不会拿扁平贴图或普通书图标替代。图标资源/公式核验与像素一致验收分开，`pixelParityVerified=false`。
模型接口报额度/限流且Agent暂停时，页面现在明确显示原因；旧的wait成功回执不代表决策循环仍在运行。

实际扩大视窗后发现泥土、草地、土径原加权变体未开放默认位置种子，导致地表缺失；
现已按锁定客户端的注册类及完整 `getSeed` 继承链补足这三种方块，并保留雪草的独立模型。
蒲公英、虞美人也补足经原客户端核对的XZ偏移。未知种子/植物仍拒绝，未全量放开原版或模组命名空间。
木板纹理仍有Minecraft与Domum Ornamentum两份不同资源，缺少匹配Java客户端的真实资源栈回执，
因此木板/共用贴图的楼梯继续标不可用；没有按导出顺序猜测覆盖结果。床、实体、装备、粒子与完整光照仍待适配。

2026-10-05 此更新已通过新服 owned 守护停止、存档后重新启动，旧服和端口映射未改。
真实浏览器第三人称确认地表恢复，当前52,024非空气块中51,282个可渲染，收到区块缺列为0，
实际范围49×49格、Y=48–96；剩余缺项仍明确展示。页面当前reload没有warn/error。
这只是当前视窗的支持统计，不能解释为98.6%的场景像素或整个模组包已达到一致。
本人MawExplorer仍在线，但Coding Plan上游返回HTTP429 / MODEL_QUOTA_EXCEEDED，原有自主暂停标记保留；
没有再次调用模型、改模型或清除标记。重新连接后未收到Ars读数，魔力保留未知。
人物当前静止，基础步态通过源码/数值/会话回归，尚未在自主行走实战中验收；三种新立方物品图标也未在此账号背包实测。
截图保存在仓库外 `E:\QiandengJiSocietyLab\agents\maw-explorer\native-console-continuity-20261005.png`。
本轮renderer专项253项、根回归270项通过，零失败、零跳过，typecheck通过；两个测试入口重叠，不能相加。

### 法术书与手册物品栏渲染（2026-10-05）

法术书不使用同名扁平贴图或普通书图标。Ars Nouveau 5.13.2 的旧笔记本和三级法术书
接入专用三维GUI渲染：原始 `spellbook_closed.geo.json` 骨骼/立方体/UV、原始纹理、
各item JSON的GUI变换，以及原Gecko渲染的位移、光照和半透明材质规则。
旧笔记本选择破旧法典纹理；三级法术书按原Item类选择tier骨骼，并读取完整物品组件中的BASE_COLOR。
GUI静态来自原物品未注册动画controller的证据，不能据此把手持/施法动画当作静态图标。

Patchouli手册按 `patchouli:book` 组件选择已核实的《记忆中的幻想乡》原始封面；
此书模型定义由锁定模组JAR初始化，当前provider不泛推其他书籍。女仆模组空魂符也使用自己的原始generated模型/PNG；
含女仆的其他状态有闪光/动态规则，未实现时继续明确不可用。

专用provider绑定锁定的客户端/模组来源，所有模型与贴图仍经NativeAssetReader检查SHA与覆盖冲突。
有界Mojang SNBT解析保留完整组件和数字类型，校验id/count，拒绝重复键、超限及双重组件来源；
缓存绑定完整原始SNBT，换书、染色或组件变化不会借用旧图标。
未知视觉组件、闪光或未移植的模型提供器保持文本说明，不补代理图。
当前范围为快捷栏、背包和容器槽位；手持实体、打开法术书页面、glint和完整像素一致对照仍需独立适配。

原先把模型错误归为配额问题的说明已核实需要更正：实际 `429 usage allocated quota exceeded`
在[阿里云Coding Plan官方FAQ](https://help.aliyun.com/en/model-studio/coding-plan-faq)中是短时间请求速率限制，
不是套餐总额度耗尽。Maw驱动中的通用 `MODEL_QUOTA_EXCEEDED` 错误名称不能单独作为额度判断依据。
真实浏览器只读预览已看到同一本人库存中三件专用物品图标，并核实原生SNBT/资产来源；
四种Ars书与16色原纹理均完成离线哈希/几何准备验证，其他三种法术书尚未加入本人库存做实服展示。
本轮根回归305项通过，零失败、零跳过（设置私有guide资源路径）；类型检查通过。根与定向入口重叠，不相加。

## 检查源码

```powershell
# 本目录：离线工具与预设隔离测试
npm run test:tools
# 仓库根目录，先安装根依赖：通用控制台、渲染模型、钓鱼及页面测试
pnpm test
# 可选真实 Cortico SDK；缺失源码明确失败，详见仓库 docs/TESTING.md
pnpm test:cortico
pnpm run typecheck
```
