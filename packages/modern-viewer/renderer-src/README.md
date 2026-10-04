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

## 1.21.1 模组画面的原生资源准备

My Agent World 要求贴图和建模与相同模组包的 Java 客户端一致。该实验路径禁止原版替代块、代理 state ID、裁切贴图和凭名称生成简化模型；尚不提供已经完成的 1.21.1 模组浏览器渲染器。上文的 1.20.6 构建入口保持其原有版本范围。

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
node --test tools/test/native-create.test.mjs tools/test/native-model-selection.test.mjs tools/test/native-world.test.mjs
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
node --test tools/test/native-create.test.mjs tools/test/native-model-selection.test.mjs tools/test/native-world.test.mjs tools/test/native-environment.test.mjs tools/test/native-fluid.test.mjs
```

## 检查 1.20.6 源码

```powershell
# 本目录：离线工具与预设隔离测试
npm run test:tools
# 仓库根目录，先安装根依赖：通用控制台、渲染模型、钓鱼及页面测试
pnpm test
pnpm run typecheck
```
