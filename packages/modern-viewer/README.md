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
node viewer-service/tools/import-modern-viewer.mjs <千灯纪/vendor/modern-viewer 目录>   # 导入 ①②
python viewer-service/tools/patch_official_avatar.py                                   # 可选：官方角色
powershell -File viewer-service/serve.ps1                                              # 起服务
```

两个口：**7800** 画面（`/` 第一人称 · `/third/` 环绕 · **`/dungeon/` 2.5D**）· **7801** 协议与控制台页（自绘可操作台）。
独立页可选：`?diagnostic` 会让状态行带诊断信息。

## 迁移步骤（把这个骨架变成真的独立包）

现在的 `viewer-service/` 是**在跑的那份**（它同时兼任"接入千灯纪"和"我们的协议/控制台"两件事）。
要变成真正独立的 `mc-modern-viewer` 包，按下面做（**需要一次停机切换**，单独安排）：

1. 把 `viewer-service/modern-viewer/` 的**入库文件**（4 个 `.mts` + `mc-control.js` + `viewer.css` + `.meta.json`）搬到本包的 `src/`；
2. 把 `viewer-service/server.mjs` 里**与现代画面有关的那半**（`startModernViewer` 调用、`/mc-control` 之外的部分）
   收进本包的启动器；`server.mjs` 的协议/控制台那半留在原处（那是另一个包的事）；
3. `import-modern-viewer.mjs` 与 `patch_official_avatar.py` 移进本包 `tools/`；
4. 起停脚本 `serve.ps1` 移进本包，计划任务改指向它；
5. 本包 `private: true` 改为 `false` 并补 `files` —— **发布前需用户确认**：
   ①②是千灯纪自有项目的派生资源，随包分发要他自己拍板（见 `DIFF.md` 第三节）。

## 与千灯纪原版的差异

见 [DIFF.md](DIFF.md) —— 三件事：**他们裁掉了什么**、**我们加了什么**、以及接手源码时要照单搬哪些。
