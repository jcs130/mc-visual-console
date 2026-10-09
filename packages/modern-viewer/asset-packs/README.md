# 共享可视化素材

素材与代码一起提交，其他宿主可从同一版本准备画面。每个包的 `pack.json` 记录 Minecraft 版本、来源哈希、文件数量及每个文件的 SHA-256；Git 保留原字节，包含 JSON 与动画元数据。

| 包 | 内容 | 使用范围 |
| --- | --- | --- |
| `java-1.20.6` | 原版模型数据、烘焙方块状态、方块与物品图集、实体/界面贴图、物品图标、绘画、地图调色板、展示框与粒子原素材 | 1.20.6 Socket.IO 渲染器；约 22 MB |
| `java-1.20.6-sounds` | 游戏音效与背景音乐、声音注册表 | 1.20.6 可选音频；约 557 MB |
| `native-1.21.1` | 锁定模组包清单中全部主资源，包括原生模型、贴图、语言与 YSM 动画 | 1.21.1 原生渲染器；约 254 MB，不能解释其他模组包的 state ID |

## 准备 1.20.6 页面

在仓库根目录执行，输出目录由宿主配置引用：

```powershell
npm ci --prefix packages/modern-viewer/renderer-src
node tools/prepare-viewer-assets.mjs java-1.20.6 "C:\viewer-output"
```

`--sounds` 安装音频包，`--preset=qiandengji` 启用千灯纪画面适配。默认使用通用画面，不包含宿主的 Agent 身份、台词或连接信息。该命令检查素材后复制并构建当前源码，生成 `viewer-assets.json` 与 `viewer-client.json`。修改源码后重新执行即可更新画面。

完整 Git checkout 包含可选音频；npm 的默认文件清单仅包含画面与原生素材。资源未变时不需要重新导出客户端 JAR。

```powershell
node tools/prepare-viewer-assets.mjs --list
node tools/prepare-viewer-assets.mjs --verify
```

## 准备 1.21.1 原生素材

```powershell
node tools/prepare-viewer-assets.mjs native-1.21.1 "C:\native-viewer-assets"
```

这个包包含 `native-assets.json` 声明的全部主资源。它不包含服务器的 `registry/` 或 `asset-variants/` 覆盖变体；这两类文件必须由使用同一模组锁定版本的服务器导出，并与清单中的哈希匹配。原生宿主启动时需要注册表，不能把 1.20.6 或 vanilla 注册表替代进去。接入已有动作 bot 的接口见 [`../renderer-src/README.md`](../renderer-src/README.md)。

每份资源均保留原文件字节与命名空间。来源版本记录在 `pack.json` 和原导出清单中；源码的 MIT 许可不改变 Minecraft 或模组素材的原有许可。客户端/模组 JAR、世界存档、账号、密钥、实测库存与私人截图不在素材包内。素材完整性校验与完整画面一致性是独立验收项。
