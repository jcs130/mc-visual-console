# 扩展形态：材质包 · NPC 造型 · 光影

本文件定的是**这个组件允许被怎么扩展**。设计依据不是想象 —— 是原项目（千灯纪 world 侧 / 其上游参考实现）里已经有、并跑通过的形态。

## 一、材质包（资源包式）

**原项目里的证据**

- `docs/COSMETICS-STATUS.md`：「需要下载时使用**资源包页面**。本包已预装上述资源，服务器也提供对应下载」
- 同文件：「**27 个内置模型、622 个资源文件**在 D 客户端、D 服务端与原服逐项一致」

**我们的形态**

```
packs/<包名>/
  pack.json          { "name": "...", "version": "1", "targets": ["blocks", "entities", "portraits", "lighting"] }
  blocks/            覆盖方块贴图（同名覆盖，缺失回落原版）
  models/            覆盖或新增方块/实体模型 JSON
```

**接法**：服务端建图集时**先查 packs/ 的覆盖，再回落 `mcAssets`/补丁数据**（资源包的语义就是这么简单：同名覆盖）。
切换材质包**不要求重启世界、也不重建角色** —— 这句是抄原项目的做法：*「更改外观不要求更改声音，也不要求重建女仆」*。

## 二、NPC / 玩家造型

**原项目里的证据（两条路都有）**

| 路线 | 证据 |
|---|---|
| **3D 模型 + 皮肤**（YSM，Yes Steve Model） | `docs/AUTONOMOUS-SURVIVOR.md`：NeoForge 附件绑定 YSM `qiandengji_kirito`、纹理 `skin`；`docs/PLAYER-MODELS-AUDIT.md`；`tools/build_game_models.py`；`tools/prepare_character_skins.mjs`（且**拒绝在 MC 运行时写存档**） |
| **2D 立绘**（角色档案面板） | `world/src/mc-modern-viewer.mts:726+` 的 `npc-panel`：`portrait` + `立绘 canvas 640×400` + 兜底首字；三种风格按钮：幻想日漫（默认）/ 职业绘卷 / 像素卡 |
| **VRM 三维化身** | 千灯纪自述「裁剪：去掉**可信 VRM 清单**…」⇒ 上游参考实现里本来就有（我们若需要可再引回） |

**我们的形态**

```
skins/<实体名或 UUID>.json     { "model": "...", "texture": "...", "variant": "..." }
portraits/<角色>.png           2D 立绘（面板里显示）
models/<模型>.json + textures/ 3D 模型与贴图
```

**接法**：实体 → 造型的绑定表由**扩展包**提供；协议里只多一个字段（实体带上 `skin` 引用），渲染与面板各自取用。
**默认必须有兜底**（原项目的立绘有"兜底首字" ✓ —— 造型缺失时不能白屏）。

## 三、光影与特效

**原项目里的证据**

- 渲染器本身是 three.js（`prismarine-viewer` 依赖 `three@0.128.0`）
- 特效有预算：`MAX_VIEWER_EFFECT_DISTANCE = 96` / `MAX_VIEWER_EFFECT_EVENTS_PER_SECOND = 80` / `MAX_VIEWER_EFFECT_PARTICLES = 24`
- `avatarState` 节流到 **100 ms**，并在 `docs/EYE-PERFORMANCE.md` 里调过（6 秒内完整 avatarState 60 次 → 7 次）

**我们的形态**

```
lighting/日光.json / 夜.json / 雨.json
  { "sun": {"intensity": 1.0, "color": "#fff3d6"},
    "ambient": {"intensity": 0.35},
    "shadows": true, "fog": {"near": 40, "far": 120},
    "post": ["vignette", "tone-map"] }
```

**接法**：光影是**画面层的事**（three.js 的光/雾/后处理开关与参数），由扩展包给预设、控制台可切。
**但预算必须继承** —— 粒子上限、每秒事件上限、状态节流不能因为"好看"就放开：那台机器上还住着别的服务。

## 四、三条扩展共同遵守的边界

1. **不碰业务语义**：谁能操作、走到哪里危险、看到什么该报告 —— 是宿主的事，不是扩展包的事。
2. **默认兜底**：任何造型/贴图/光影缺失都要有回落，不能白屏。
3. **能撤回**：材质包与光影预设都是"换一个目录 + 重启一次"的粒度；改坏了删掉即可。

## 五、两个平台都能跑（今天验过）

| | 做法 | 状态 |
|---|---|---|
| **Windows** | `npm install`（npm 会跑安装脚本；**pnpm 11 默认拦构建脚本**，这就是之前卡住的原因）+ 应用 `tools/patch-viewer-version.cjs` 把 1.21.11 别名到 1.21.4 | 已验：canvas 3.2.3 预编译拿到 ✓、prismarine-viewer 可 require ✓、补丁生效 ✓ |
| **Linux（容器）** | `viewer-service/Dockerfile`（apt 装 cairo/pango/rsvg 等，配方抄千灯纪 `Dockerfile.world`） | 已验：镜像 2.37 GB 建成、容器 `Up (healthy)` ✓ |

> 一句话：**画面交给 prismarine-viewer（成熟实现），我们的增量在协议、权限、两端适配与这些扩展形态上。**
