# 与千灯纪原版的差异清单

**两边的"原版"指什么**（都有一手出处）：

- **客户端产物**：`D:\Projects\QiandengJi\vendor\modern-viewer\`（`modern-viewer.js` 10.9 MB、`minecraft-renderer.js`、
  `mesher*.js`、`threeWorker.js`、`mod-assets/` 等）
- **宿主桥接**：千灯纪仓库 `world/src/mc-modern-viewer.mts`（其头部自述：*"萌悦 modern-viewer 的精裁接入，2026-08-26；
  参考实现 `mengyue-world-platform plugins/minecraft-codex-agent/src/dashboard/secure-viewer.ts`（1983 行）"*）

---

## 一、我们照原样复制、**未改**的部分

| 文件 | 内容 |
|---|---|
| `mc-modern-viewer.mts` 主体 | 双 Socket.IO 命名空间数据桥 · WorldView 区块流 · 实体/化身状态/特效序列化 · stateId 归一化 |
| `viewer-stream.mts` · `viewer-state-map.mts` · `observer-inventory.mts` | 同上，均未改 |
| 引擎与资产 | 由 `viewer-service/tools/import-modern-viewer.mjs` 从千灯纪源码目录导入（**派生资源，刻意不入库**） |

## 二、千灯纪**自己**裁掉的部分（他们的取舍，不是我们改的）

`mc-modern-viewer.mts` 头部原文：

> 裁剪：去掉可信 VRM 清单/画作/交易/**宿主头校验**/**检查射线**；保留双 Socket.IO 命名空间数据桥、
> WorldView 区块流、实体/化身状态/特效序列化、stateId 归一化（NeoForge 注册表与原版的差异兜底）。

其中 **"检查射线"就是原版「点地移动」的宿主侧接线** ⇒ 我们这份产物**天然点不动地**。
这正是我们后来补它的原因（见下节第 2 条）——**不是我们弄丢的，是那份裁剪版本来就没有**。

## 三、**我们改的**（2026-09-23，全部可复现；脚本都在 `viewer-service/tools/`）

1. **官方角色**（对 `modern-viewer.js` 的**补丁** → `tools/patch_official_avatar.py`）
   - 模型档默认 `a4`: `ember-wayfarer`（星火旅人 · 日系 VROID 人形）→ `minecraft-classic`（原版方块人）
   - 皮肤表四档的 `label`/`subtitle`/`texture` → 官方贴图（`wide/steve`、`slim/alex`、`slim/steve`、`wide/alex`）
   - 起因：用户令「默认角色贴图不要灯守，换成我的世界官方角色」。脚本**幂等**、每处替换要求唯一命中、自动备份
   - ⚠️ 导入资产会覆盖带补丁的 `modern-viewer.js` ⇒ **导入之后必须重跑这个补丁**

2. **点地走 + 寻路轨迹**（我们**新写**的注入脚本 `modern-viewer/mc-control.js` + 宿主侧 `/mc-control` 路由）
   - 起因：用户实测「点了接管但是也无法控制」——因为第 2 节的"检查射线"被裁掉了
   - 做法（**不改产物**）：注入同源脚本 → 读 `globalThis.world.camera` 算屏幕射线 → 交服务端沿射线求交
     （「脚下实心 + 本格为空」= 可站立）与 `pathfinder.getPathTo` 取路径 → 轨迹用同一相机投影回屏幕画在覆盖层
   - 关键坑：**相机矩阵在画面的局部帧里**（实测相机原点 `(7.72,11.70,-7.72)` vs 世界 `(-521,201,866)`，
     渲染器用 `sceneOrigin` 整体平移过）⇒ 用**锚点对账**：客户端送实体的局部坐标 + id（两边 id 同源），
     服务端拿 `bot.entities[id]` 的世界坐标相减、取中位数，得到平移量
   - 自报口（不看画面也能核）：`document.documentElement.dataset` 的 `mc-status` / `mc-target` / `mc-path-nodes` / …

3. **CSP 白名单**（`viewer-service/serve.ps1`；非产物改动）
   现代画面带 `frame-ancestors 'self' <MC_PANEL_ORIGIN> <MC_CONSOLE_ORIGIN>`（`mc-modern-viewer.mts:992`）
   ⇒ 只有列出的 origin 嵌得进去。真控制台由本服务在 **7801** 出，故两个 origin 都指向 `http://127.0.0.1:7801`
   （原先指向 7799 ⇒ 控制台里的 iframe 被 CSP 拦成空白）。
   ⚠️ `serve.ps1` 必须**纯 ASCII**（PowerShell 5.1 无 BOM 时按本地码页读 UTF-8，中文注释会连累相邻行）。

4. **`viewer.css`** 采纳导入源里的较新版本（与源一致）。

5. **`viewer-service/server.mjs`**（**我们自己的宿主，不是复制品**）：补 `GET /` 与 `/assets/*`（协议承诺的客户端页）、
   `snapshot()` 带上地面方块（自绘画布点地走需要）、修 `broadcast()` 遍历 `Map` 的崩溃（`sessions.keys()` + 逐连接 try/catch）。

## 四、若拿到客户端**源码**（萌悦那棵树）要照单搬三件

1. 第三节 1 的默认档与皮肤表 → **落进源码**（不再打补丁）
2. 第三节 2 的注入 → **落成源码里正式的交互**（而不是注入）
3. 第三节 3 的 origin 白名单 → **落成配置项**
