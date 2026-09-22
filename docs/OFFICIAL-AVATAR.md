# 画面角色：为什么是「原版方块人 + 原版史蒂夫」

> 落定 2026-09-23。起因：用户要求「默认角色贴图不要灯守，换成我的世界官方角色」。
> 这份文档记录**读源码得到的真实机制**与**可复现的改法**，避免下次重新踩坑。

## 一、机制（全部来自 `viewer-service/modern-viewer/modern-viewer.js` 源码，非推测）

画面里的"自己"由**两套各自独立的档案表**决定，都在上面那份派生 bundle 里：

| 表 | 变量 | 默认 | 内容 |
|---|---|---|---|
| 模型表 | `r4` → `TP` | `var a4="ember-wayfarer"` | 星火旅人 / 青风游侠 / 静月祈愿 / 蔚蓝星辉 / 晨光维塔（日系 VROID 人形）+ **`minecraft-classic`（原版方块人）** |
| 皮肤表 | `EP` → `IP` | `var e4="lantern-warden"` | 灯守正装 / 千灯祷衣 / 守夜铁衣 / 荒野测绘（四档 `texture` 均为**内嵌 `data:image/png;base64`**） |

关键事实：

1. **本体皮肤不吃实体载荷里的 `skinUrl`**。本体走
   `VWe()` → `` `${us.texture}#lantern-skin=${us.id}` `` → `applyTemporaryPlayerSkinOverride(...)`。
   （我们曾试过在桥接里给本体实体塞 `skinUrl` —— **完全无效**，已回滚。）
2. **宿主改档只能经父窗口 `postMessage`**：`{schemaVersion:1, type:"lantern-avatar-skin", skinId}`，
   且要求 `t.source === parent`。⇒ **直接打开 `:7800` 时没有宿主，只能吃 bundle 里的默认档**；
   被 iframe 嵌着（控制台 `:7799`）时才可由宿主切换。
3. 另有 `lantern-avatar-appearance`（皮肤 + 模型一起换）。
4. 客户端会把当前档案写进画布 dataset —— **这是不看画面也能验证的出口**：

```
#viewer-canvas
  data-player-skin-id / -label / -status
  data-player-model-id / -label / -kind / -status / -asset-id
```

## 二、改法（可复现）

bundle 是派生资源、不入库，所以**改法以脚本形式入库**：

```bash
python viewer-service/tools/patch_official_avatar.py --check   # 先看现状
python viewer-service/tools/patch_official_avatar.py           # 打补丁（幂等，自动备份）
```

它做两件事：

1. 模型档默认 `a4`: `ember-wayfarer` → **`minecraft-classic`**（原版方块人；客户端会走
   `Ik({restoreNative:!0, restoreRig:!0})`，日志「已恢复原版方块人模型」）。
2. 皮肤表四档的 `label`/`subtitle`/`texture` → 官方贴图：
   `/textures/1.21.1/entity/player/{wide/steve, slim/alex, slim/steve, wide/alex}.png`
   （由桥接的 `/textures/` 路由出；**id 保持不动**，`e4` 等引用不破）。

打完补丁**浏览器需 Ctrl+F5 硬刷新**（bundle 约 11 MB，有缓存）。

## 三、踩坑（务必记住）

> **别把"皮肤档"的默认 `e4` 也设成 `minecraft-classic`。**
> 那个 id 只存在于**模型表**里；皮肤表取不到 ⇒ `t4()` 返回 `undefined` ⇒ `us.id` 崩溃 ⇒
> 页面显示「现代 3D 渲染器启动失败 · Cannot read properties of undefined (reading 'id')」。

教训：**跨表复用 id 之前，先确认这个 id 属于哪张表。**

## 四、验证方式（不需要看图）

```js
// 浏览器侧（Playwright/locator 均可）
document.querySelector('#viewer-canvas').dataset
```

期望值：`playerModelLabel = 原版方块人`、`playerSkinLabel = 原版史蒂夫`、两者 `status = applied`。
