# 玩家与 NPC 头顶文字气泡（Java 1.20.6）

2026-10-10：接入 AgentFriend 0.4.9 实际发送的原版 `TextDisplay`。服务器已有玩家公开发言和 NPC 私人对白，本次补齐 Web 桥和 Three.js 显示。游戏服务器无需重启，Agent 的聊天、CLI 和行动接口保持兼容。另一台电脑的实际加载版本需要在那里核验。

## 显示与受众

- 第一人称、第三人称与地下城 2.5D 共用这条链路。文字显示实体原版宽高为 0，使用独立显示层，不经过生物碰撞尺寸过滤，也不生成替代身体。
- 读取当前行动 bot 实际收到的出生、NBT metadata、移动和销毁，保留实体 ID、位置、显式换行、文字颜色、ARGB 背景、opacity、阴影、对齐、billboard、原版 0.025 文字比例、静态 translation/scale 和位置插值。
- 中文、拉丁字和 `▼` 使用匹配 1.20.6 的原始 bitmap/Unihex 字形，包含 asset index 覆盖的 `include/unifont.json` 和原始 `unifont.zip`（内含许可证）。使用中文/非日文、非强制统一字体，不用系统字体代替。
- 不从公共聊天记录、NPC 名字或演出台词拼造气泡。同一 NPC 的多个私人回答按实际不同显示实体 ID 处理。每个 bot 的桥独立；服务器负责对话者、当前附身 Eye、距离和视线受众。
- 到期、Eye 脱离、角色消失由服务器销毁包清理。Web 重连只回放当前行动连接仍在跟踪的显示实体；游戏连接重生、切换世界或结束时递增 epoch 并清空。不回放历史对白。
- 按 `see-through` 控制深度测试。普通气泡被墙体和角色遮挡，不是常驻屏幕字幕。

## 更新另一台电脑

在实际使用的共享源码目录更新，用原来的版本、预设和输出目录构建：

```powershell
git pull --ff-only origin main
npm ci --prefix packages/modern-viewer/renderer-src
node tools/prepare-viewer-assets.mjs java-1.20.6 "<实际网页资源目录>" --preset=qiandengji
```

其他世界省略千灯纪预设。新版共享包包含字库和逐文件哈希，无需另下客户端 JAR。重新加载画面服务和网页，无需重启 Minecraft 或修改 Agent 操作协议。

宿主还须加载新版 [viewer-content.mjs](../host/viewer-content.mjs) 及同目录 `text-display.mjs`。上一轮粒子/照片桥若从当前源码导入，原有 `createViewerContentBridge(bot)` 和 `subscribeSocket(socket)` 会自动增加气泡事件，调用方式不变。若宿主复制了旧桥文件，需要更新副本并重启画面服务；只换网页 bundle 不够。

尚未接入桥的宿主沿用 [同连接桥接示例](paper-content-compatibility.md#远端宿主接入)：在 bot 创建后尽早创建一次，两个 Socket.IO 入口都订阅，浏览器断开时解除订阅，bot/宿主结束时 dispose。也能从该 bot 当前仍存在的 Mineflayer `text_display` metadata 引导加载，不索取他人存档或重发聊天。

静态服务需要以下文件：

| URL | 构建产物 |
| --- | --- |
| `/index.js` | `dist/modern-viewer.js` |
| `/text-display-font.json` | `public/text-display-font.json` |
| `/fonts/1.20.6/unifont.zip` | 同名原始字库，`application/zip` |
| `/textures/1.20.6/font/*.png` | 原始 bitmap 字库 |

共享 `serveViewerAsset` 已允许有界 ZIP；内置旧宿主为 1.20.6 增加了上述 `assets/public/` 路由。自建静态服务也要提供这些路径。字库缺失时页面明确提示更新匹配资源。

自定义客户端导出还需运行 `tools/export-text-display-font.py <1.20.6客户端JAR> <已校验的asset-index-16.json> <原始unifont.json和unifont.zip目录> <输出目录>`；该工具验证索引中的 SHA-1，保存原始字节和逐文件 SHA-256。常规共享包构建无需这一步。

核对 `viewer-client.json.browserBundleSha256` 与实际 `/index.js` 字节；其中 `textDisplays.manifestSha256` 必须匹配 `/text-display-font.json`。拉取源码不会自动替换另一台电脑已复制的网页。

## 增量事件与预算

事件名 `textDisplay`，带 `schemaVersion:1`、`epoch` 和显示实体 `id`。普通更新含 `name:'text_display'`、绝对 `position`、Mineflayer 弧度 `yaw/pitch`、解析后的 `runs:[{text,color}]`、`translation/scale`、`billboard`、`flags`、`lineWidth`、无符号 ARGB `background`、0–255 `opacity`、`viewRange`、`teleportTicks`、`invisible` 与 `unavailable`。删除为 `{schemaVersion:1,epoch,id,delete:true}`。不要使用玩家主体 UUID 代替显示实体 ID。

与粒子/地图共用 `contentReset`。每个行动连接和浏览器最多保留 64 个文字显示实体；当前服务器另有 32 个气泡上限。慢连接只保存有限 ID 的最新状态，优先处理文字更新/删除，再发送照片快照。移动复用纹理，正文/样式改变才重画；销毁/清理释放纹理与材质。Unihex 索引共用一份，解码字形缓存最多 512 个。

桥诊断：`createViewerContentBridge().stats().textDisplays`。浏览器 `window.cortiViewerContent.stats().textDisplays` 包含 tracked、visible、unavailable、textureUpdates 和 disposed。visible 是启用的实例数，不表示全部片元都没有被墙体遮挡。

## 验证与范围

- 7 项专项测试通过：真实 protocol 766 编解码/NBT、签名字节、私有连接隔离、销毁/ID 复用/慢连接不回放旧正文、当前缓存引导/上限、原始中文/指示符，以及 16 个移动实例的纹理复用与释放。资源生命周期测试使用合成 canvas 表面，实际字形与画面由原资产及浏览器另验。
- 隔离 Paper 0.4.9 的真实玩家发言、注册青禾的右键问候、旁观者受众与当前附身 Eye 已走到 Web 桥。问候来自实际插件，没有调用模型。浏览器已见第一人称/第三人称/地下城 2.5D 文字和 16 个原版显示实体；这是受控展示负载，不是 16 个自主 Agent 联合压测。同一气泡在墙后隐藏、移除墙体后显示；真实发言替换沿用同一 ID，八秒到期后不再回放。
- 合入同期主分支更新后重新准备素材、构建并回归：619 项通过、9 项既有可选环境检查跳过，类型检查通过。没有改动或重启正式游戏服务器。
- 首次切换第三人称时测试浏览器无法创建 WebGL2 上下文；关闭测试标签后新建标签恢复。失败记录保留，不计为渲染通过。
- 原始字库哈希和程序检查不代表 Java 逐像素一致，`javaTextPixelParityVerified=false`。超宽文字当前按字形折行；完整断词/双向排版、动态亮度、变换插值/非单位旋转、粗斜体/装饰/混淆、翻译/选择器/score/NBT 动态组件和其他字体尚未完整移植。未支持的组件/旋转明确 unavailable，不能称全部 TextDisplay 功能兼容。
- BlockDisplay、ItemDisplay、原版发光轮廓与 1.21.1 原生模组 SSE 后端不因本次气泡适配自动实现。两个版本的数据编号仍分开。

私有回执、截图、隔离服与构建产物留在运维记录，不纳入 Git。远端 LAN 页面需要更新后在那里验收。
