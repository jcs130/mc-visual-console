# mc-modern-viewer —— Minecraft 高级 3D 网页可视化（独立形态）

这是把**千灯纪那套"现代画面"**从它原来那个项目里**独立出来**的目标形态：
一个包，自带引擎与 1.21.1 资产，起一个网页，**默认就是高级 3D 可视化**，并且**能操作**（点地走 + 寻路轨迹）。

> 铁律（用户定调）：**默认视图必须是高级 3D 可视化** —— 不许拿朴素的 2.5D 自绘画面顶替默认。

## 三件必需件（缺一不可）

| # | 件 | 来源 | 现状 |
|---|---|---|---|
| ① | **引擎** `modern-viewer.js`(10.9 MB) + mesher/worker/wasm/renderer | 千灯纪自有项目（派生资源） | 靠 `import-assets` 导入，不入库 |
| ② | **1.21.1 资产包** `mod-assets/`(12.3 MB)、`character-assets/`(19.3 MB)、`npc-portraits/` | 同上 | 同上 |
| ③ | **宿主桥接 + 我们的增强**（`*.mts` + `mc-control.js` + 补丁脚本） | **本仓** | 已在仓 ✓ |

> ② 不是可选项：默认路（高级 3D）必须能画出 **1.21.1** 的方块 ——
> PrismarineJS 的 `minecraft-assets` 虽然覆盖到 1.21.8，但那套客户端（prismarine-web-client）**自身只认到 1.20.x**
> （实测其产物内最高 `1.20.50`），连不上本场景的 1.21.1 门。所以默认路只能走这一套。

## 现在怎么跑（= 在跑的那份 `viewer-service`）

```bash
node packages/modern-viewer/tools/import-modern-viewer.mjs <千灯纪/vendor/modern-viewer 目录>   # 导入 ①②
python packages/modern-viewer/tools/patch_official_avatar.py                                   # 可选：官方角色
powershell -File viewer-service/serve.ps1                                              # 起服务
```

两个口：**7800** 画面（`/` 第一人称 · `/third/` 环绕 · **`/dungeon/` 2.5D**）· **7801** 协议与控制台页（自绘可操作台）。
独立页可选：`?diagnostic` 会让状态行带诊断信息。

## 迁移状态：**已完成**（2026-09-23，停机切换一次）

**这个包现在就是"在跑的那份"** —— `viewer-service/server.mjs` 直接从 `packages/modern-viewer/src/` 加载桥接，
运行时资产在本包 `assets/`（`ASSET_ROOT = ../assets`）。切换后实测：

```
http://127.0.0.1:7800/dungeon/        → 200  13077 B      （画面）
http://127.0.0.1:7800/mc-control?v=1  → 200  {"ready":true}（控制口）
http://127.0.0.1:7800/mc-control.js   → 200  10517 B      （★注入脚本从 assets/ 读到 ⇒ ASSET_ROOT 正确）
http://127.0.0.1:7801/health          → 200                （协议）
http://127.0.0.1:7801/                → 200  2369 B        （控制台页）
service.err.log 只有 punycode 警告，无路径错
```

- ✅ **入库文件**已搬进 `src/`（4 个 `.mts` + `viewer-static.mjs`）；运行时资产进 `assets/`
  （含我们写的 `mc-control.js`，`.gitignore` 里为它留了 `!` 例外）
- ✅ **入口已改**：`server.mjs` 从本包加载。**未拆进程**——它仍同时宿主"画面"与"协议/控制台"两半，
  拆成两个进程/两个包留待以后（那样协议那半可以独立发布）
- ✅ 两个工具进 `tools/`；起停脚本仍在 `viewer-service/serve.ps1`（它只设环境变量再起 `server.mjs`）
- ☐ **仅剩发布一步**：`private: true` → `false` 并补 `files` —— **发布前需用户确认**
  （①引擎②资产是千灯纪自有项目的派生资源，随包分发要他自己拍板，见 `DIFF.md`）


（切换前的 5 步计划已全部执行完，描述见上。）

## 与千灯纪原版的差异

见 [DIFF.md](DIFF.md) —— 三件事：**他们裁掉了什么**、**我们加了什么**、以及接手源码时要照单搬哪些。
