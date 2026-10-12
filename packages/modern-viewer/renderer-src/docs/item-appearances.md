# Paper 特色装备外观

当前适配千灯纪 AgentFriend 0.4.33 候选，五件原版物品带 CustomModelData 731001–731005。服务器尚未部署，远端查看器也须自行更新。查看器支持在同一资源中显示五件三维模型、物品栏图标、第一／第三人称、OBS 原生手部渲染通道及无 UI 相机画面。

## 安装

在共享仓库使用新的私有输出目录，先沿原流程准备完整 **1.20.6** 查看器资产，再执行：

```powershell
cd packages/modern-viewer/renderer-src
node tools/install-item-appearances.mjs E:/mc-visual-console/packages/modern-viewer/asset-packs/qiandengji-items-1.20.6 E:/MC/research/NEW-viewer-assets
node tools/build-minecraft-viewer-client.mjs . E:/MC/research/NEW-viewer-assets --preset=qiandengji
```

安装器先核对所有文件摘要及资产版本，拒绝覆盖已有 `public/item-appearances`。替换整份候选资产目录，不在运行目录叠加旧文件。宿主也须拉取更新：`packages/modern-viewer/src/mc-modern-viewer.mts` 在既有静态服务下开放精确 `/item-appearances/` 路径，无新端口；仅更新浏览器 bundle 而继续运行旧宿主会得到 404。

构建器根据校验过的安装清单决定是否加载此外观包。未安装时，通用 1.20.6 构建不请求 `/item-appearances/`，保留编号的物品仍明确不可用；安装后须重新构建，才能启用原资源加载和摘要校验。

相机沿既有 `prepare-photo-camera.mjs` 冻结这份新资产和共享桥，然后经原维护流程切换配置。外机 OBS／Web 需由实际运行端更新及重启，Git 推送不代表远端已生效。

## 协议与生命周期

- 保留 `minecraft:iron_sword`／`crossbow`／`blaze_rod` 原基础身份，通过真实 `components.custom_model_data` 选外观，不根据名字猜测。
- `item-appearances.js` 验证清单、模型边界、每份模型／贴图／图标摘要。普通 HTTP 局域网使用经 Node 对照的 SHA256 实现，不依赖 HTTPS Web Crypto。
- 使用原手部装备切换、挥动和使用物品的动画通道；OBS 继续支持手部开关、透明背景和 FOV 配置。YSM 沿原 `RightHandLocator`／`LeftHandLocator` 与角色动画挂载模型。
- 同材质、同展示名但不同编号也刷新模型及两层 HUD 缓存；空闲更新复用几何和贴图，切换／关闭释放私有资源。
- `globalThis.itemAppearanceDiagnostics()` 返回目录摘要、五件加载数与错误。未知保留编号不给普通武器替身；HUD 无资源时保留文字，模型状态明确不可用。

原生 1.21.1 管线不接此 1.20.6 包。机械弩当前只有静态结构，Web 三维附魔流光未实现；图标投影不等于 Java GUI 精确像素。

## 验证

```powershell
node --test tools/test/item-appearances.test.mjs tools/test/paper-ysm-actions.test.mjs tools/test/obs-hands.test.mjs tools/test/obs-layout.test.mjs test/renderer-equipment.test.mjs test/host-assets.test.mjs
```

上述原有范围34项通过；合并上游持物／布局／指针及聊天布局稳定更新后，加跑 `agent-pointer`、`agent-visual-overlay`、`inventory-player-preview`、`viewer-layout`、`viewer-build-source` 五份测试，共62项通过。YSM已使用统一的居中顶点和原生定位骨骼变换，防止上游修正后再次偏移。另用原生隔离 Paper 库存、另一真实玩家的持物与挥动事件连接实际打包浏览器，17 项通过，包含五种 GPU 模型与对应图标、同一手部资源复用、OBS alpha canvas 和无 UI 相片中的其他玩家专属武器。此验证不是手机／Xbox 或原版 Java 像素测试。

私有浏览器原图／回执在服务端 `E:/MC/ops/repairs/item-appearances-20261012`，早期测试失败保留。最终合并产物 bundle SHA256 为 `961e2d519284fd0e4914b12cf2cb99982b1167cd474b2f1ccfda20db15b2b722`，资源清单 SHA256 为 `6885cac28712ad6a56c65f2d134d5b4e4d460e6be32233b04a02bf9dc833adc4`；新消费端仍须核对自己的 `viewer-client.json` 与实际 HTTP 文件。
