# 在 Neko 项目复用画面

共享源码和素材从 `jcs130/mc-visual-console` 的 `main` 获取。Neko 宿主保留自己的 Agent、Minecraft 连接、身份和台词；通用渲染器与修复在本仓库维护。

## 1.20.6 Mineflayer 宿主

```powershell
npm ci --prefix packages/modern-viewer/renderer-src
node tools/prepare-viewer-assets.mjs java-1.20.6 "<Neko静态资源目录>"
```

需要游戏音效时加 `--sounds`。输出目录提供第一人称、第三人称和地下城 2.5D 页面。宿主将当前动作 bot 的区块、实体、本人状态、装备与窗口转换为 [Socket.IO 合约](../packages/modern-viewer/renderer-src/SOCKET_PROTOCOL.md) 的事件。

静态路由使用 `/index.js` → `dist/modern-viewer.js`，其余资源来自 `public/`；`/textures/*` 指向 `public/textures/1.20.6/`。同一 HTTP 服务提供 `/socket.io` 与 `/third/socket.io`。每个连接先发版本与完整快照，再发实际变化。每位 Agent 使用自己的服务或明确隔离的数据路由，演出台词和音频不读取 Corti 的全局来源。

## 1.21.1 模组宿主

使用 `native-1.21.1` 素材和匹配服务器的注册表/覆盖变体，调用 `prepareNativeWorldPreviewHost` 后将已有动作 bot、原生包流和该 Agent 的演出回调传入 `attach`。接口与原生 SSE 字段见 [协议第 8 节](../packages/modern-viewer/renderer-src/SOCKET_PROTOCOL.md#8-1211-模组原生前端sse)。

该原生包锁定一个具体模组版本组合，缺少模型或不支持的渲染行为会明确报出。它尚未达到 Java 客户端完整画面一致，1.20.6 的切面功能也不会因复用样式自动移植到原生后端。

## 同步更新

1. 在共享仓库的 `main` 拉取更新，记录提交号。
2. 使用原来的版本和预设重新准备素材/构建，更新 Neko 实际提供的静态目录。
3. 核对 `viewer-client.json` 的 bundle 哈希与 `/index.js`，刷新页面；检查当前玩家 UUID、装备、图标、洞穴遮挡与台词归属。

提交源码和素材不会修改其他机器已复制的文件，也不会重启 Neko。宿主接入适配与共享渲染改动分别提交到对应项目。
