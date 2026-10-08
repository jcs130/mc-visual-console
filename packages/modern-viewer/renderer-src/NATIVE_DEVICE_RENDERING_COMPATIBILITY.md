# 原生加工设备的有限场景适配

本轮选择 Create 磨石的原外壳和旋转内齿轮，补齐同玩家网页中可见的机械几何与实际 RPM。它不代表 Farmer's Delight / Create 全部实体方块、加工粒子、声音、光照或 Java 客户端像素已经兼容；完整场景 parity guard 保持关闭。加工是否在进行、输入/产物及拾取结果由原设备回执独立证明，齿轮旋转不能替代这些后置条件。

## 原始来源与几何

锁定 `create-1.21.1-6.0.10.jar` SHA 为 `ef87fe5709f1ba1f5b8bb20a2925b5afb4669e178fd6d8bf10c167759eefe37a`，Minecraft client SHA 为 `499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`。运行 provider 要求每个来源名字唯一、SHA 正确、非 explicitOverride；模型和 PNG 继续通过字节数、SHA 与资源优先级 guard。冲突不会按排序解决。

| 锁定 class，省略 `com/simibubi/create/` | SHA-256 | 原生规则 |
| --- | --- | --- |
| `content/kinetics/millstone/MillstoneRenderer.class` | `8ff700c2481772e85355f72b27719fa70e8fa39de69a22f6f2db7109787f1d57` | rotated model 仅取 `AllPartialModels.MILLSTONE_COG` |
| `AllPartialModels.class` | `c9e819b2a693a4e880d4cde97432e44d2fa9a3a7aff7b9e5b0eff4791a7a0749` | `MILLSTONE_COG=block("millstone/inner")` |
| `AllBlockEntityTypes.class` | `8dbcd61e02d817dfc29e08f6e370019c9562825c29cb82cf481b06206e21a948` | MillstoneRenderer 与 SingleAxisRotatingVisual 都绑定原 inner |
| `content/kinetics/millstone/MillstoneBlock.class` | `953ff7f295316da56b5804a6f7a1d9069915fda6e097649f0bd07441e30b8c2d` | 旋转轴 Y |
| `content/kinetics/base/KineticBlockEntityRenderer.class` | `b1f714dc285e7a129d851b8ea9aeec23a7f4b25379fc01b395db4cd72c65e144` | 原 float32 角度与 rotateCentered；颜色效果独立 |
| `content/kinetics/base/KineticBlockEntityVisual.class` | `61e363a3d09cbeaa4357848209c8710678478efb3e4fc9bfc85b9d3a8ff4c09c` | 垂直旋转轴的坐标和偶数时 offset 22.5° |
| `content/kinetics/base/KineticBlockEntity.class` | `3bce80f18d09ccff5e6c1b5cdbeeb2793f0a507006879b267148cde0df443572` | 默认 getRotationAngleOffset=0，磨石未重写 |

原资源如下；原 JAR、PNG、反编译记录和完整 manifest 保持在仓库外。

| 原路径 | SHA-256 |
| --- | --- |
| `assets/create/blockstates/millstone.json` | `e59885ea8662d36294b6f22c1c25b1fcbd8afb90ce138b63eb5220af191cd182` |
| `assets/create/models/block/millstone/block.json` | `3f89721be47d1c11825074b8a36baf80acc1bf7737b3bf55e1978370558a411c` |
| `assets/create/models/block/millstone/inner.json` | `bda2da531800443cdaa976e61a13984f6dd8c80df193f837b8d7bc366e97753c` |
| `assets/create/textures/block/millstone.png` | `ffe5d934c4749f628a22dd8e3f57ac705a02a250dd5b48388eabf16cc4a194a3` |
| `assets/create/textures/block/gearbox.png` | `7d33b15de024daa08ecec5d90c365114bea7c81370c99a0c566053e699800181` |
| `assets/create/textures/block/axis.png` | `0ae58aa6fcc369fee5a49270827bfa572631078f57163b8344f97ea5fcde2441` |
| `assets/create/textures/block/axis_top.png` | `d96400565f72e7270eeb9daaab2b1cf2a450e9491bbd488d217ed5f7e49c4bc3` |

[native-millstone.js](src/native-viewer/native-millstone.js) 的 `prepareNativeMillstoneModel(reader,state,'body'|'rotor')` 要求实际 `create:millstone`、MODEL、原实体方块与有效 stateId。静态 block 模型 28 个原面；inner 36 个原面，保留原齿轮的 45° element rotation、伸出边界的齿、原 UV 和贴图。原模型不换成圆柱或普通 cube，也不把物品 GUI 图片贴到世界。

[native-scene.js](src/native-viewer/native-scene.js) 将原 body 作为独立静态模板；[create-kinetics.js](src/native-viewer/create-kinetics.js) 只创建 inner 的动态 actor。原模型坐标先按现有模型 loader 除 16、减 .5，世界位置再加 block centre `.5,.5,.5`，绕原 Y 中心转。body 不跟着 RPM 旋转。

## 真实状态、渲染时钟和未知项

host 的本人原生 snapshot `kinetic` 节点使用真实 position/stateId/Speed。`0` 是已知停止，`null` 是未知，二者不能混用；不由 recipe timer、Agent目标、红石状态或网页时间推测 RPM。未知 Speed 去除旧动态 actor，原已验证 body 仍可以独立显示。来源/贴图失败也只拒绝该设备动态图层，保留具体原因，不中止整个网页。

角度沿原 float32 公式 `(renderTime*speed*3/10+offset)%360/180*PI`。磨石轴 Y，offset 按 X+Z 奇偶；默认额外 angle offset 为 0。

Create 内嵌 Ponder 1.0.82 的 `net/createmod/catnip/animation/AnimationTickHolder.class` SHA 为 `481d3864f63b513f61e715cf49fc20457a6260d8ef2882111b46a1ee62a90f6c`。普通世界使用客户端 ticks+partial，**不使用服务器绝对 world age**；原 ticks 周期 1,728,000。本浏览器按 connection epoch 建立独立 50 ms 渲染时钟，保持 float32 partial 和原周期。它不掌握匹配 Java 客户端的 DeltaTracker、暂停史或绝对 phase，所以 `javaReferencePhaseVerified:false`。

页面进入后台时显式暂停本渲染时钟并隐藏未知动态层；返回后不补进隐藏期间的墙钟时间。断流、换 epoch 和 dispose 重置或清除旧 actor/时钟。缺原生时间、非法时间或超过 15 秒未更新时隐藏转子，诊断为 `NATIVE_KINETIC_NATIVE_TIME_UNAVAILABLE` / `NATIVE_KINETIC_NATIVE_TIME_STALE`；15 秒是网页的保守 freshness guard，不是模组规则。RAF 和 visibility 回调统一使用 performance.now，避免混用时间戳倒退。真实 0 RPM 且时钟有效时保留原静止 inner。

诊断 `deviceVisuals` 保留原 model/sourcePaths、实际 speed、clockAvailable 和未适配图层；`kineticClock` 保留自身时钟来源与状态。以下项本轮不伪造或借用近似效果：

- 原客户端 stress/debug 动态颜色输入；原纹理与几何已核对，完整材质颜色效果仍未验收。
- 由真实加工输入与客户端随机数产生的碎料粒子。
- `SoundScapes` 原磨石环境声音。
- 匹配 Java 客户端的绝对相位、世界光照与像素比较。

在当前场景材料/光照下显示原几何和 PNG 不等于这些图层已完成。转动的空磨石也不能当作正在处理配方。

## 缓存、隔离与生命周期

[native-kinetic-layer.js](src/native-viewer/native-kinetic-layer.js) 只接原 scene 的当前 epoch。完整小表验证后才改变 actor；重复位置、未知 stateId 或非法位置拒绝，不选择先/后某一速度。最多检查 4096 节点、创建 512 个动态 actor，超出范围保持明确预算诊断。相同 position/state 只更新 RPM，不卡在按帧新建模型；replacement、remove、null RPM 和断流清掉旧几何。

每设备源错误独立报告；异步原模型在 epoch 退役后完成时先 dispose，不能加入新 scene。绑定检查要求真正 Three Object3D 与正确 state；模型部分加载失败释放已经创建的 geometry。静态模板和共享 texture/material 保持现有 loader 所有权，动态 actor dispose 幂等且不销毁共享材料。

## FD 后续缺口

`cutting-board.js` 当前只允许真实空板原模型；occupied 快照仅保留 ID/count，会丢完整组件和 IsItemCarved。原 `CuttingBoardRenderer` 还依赖 FIXED 模型变换、是否 GUI 3D、FLAT_ON_CUTTING_BOARD tag、原 native item ID+damage 的 Java Random 种子、maxStackSize 对渲染件数的影响以及 carved tool class。未取得这些输入前不猜板上物品。

原 `DefaultStoveRenderer` 逐件使用真实六槽、原 stove offset 和 FIXED ItemRenderer，不能套 held-hand 或 GUI 变换。料理锅原背景菜单/食物图标已在 [FD 接缝](NATIVE_FARMERS_DELIGHT_COMPATIBILITY.md) 独立实现；当前场景中其他未适配实体方块仍明确不可用，不用普通块代理替代它们。

## 验证与运行验收

本轮四套定向 23/23 通过、无 skip，包括实际 v5 原资源校验、模型/UV goldens、正转/反转/停止、null区别、时钟周期/暂停/重置/旧时间、source/priority拒绝、设备错误隔离、geometry释放、晚到模型和 actor预算。命令从 renderer-src 执行：

```powershell
$env:NATIVE_DEVICE_ASSET_DIR = "<native-assets-dir>"
node --test tools/test/native-millstone.test.mjs tools/test/native-create.test.mjs tools/test/native-kinetic-layer.test.mjs tools/test/native-console.test.mjs
```

真实资产测试也接受 `NATIVE_GUIDE_ASSET_DIR`；未提供资产目录时该项跳过，不宣称原资源已验证。离线测试使用真实 SHA/JSON/PNG 和 Three 几何，但不建立 WebGL或游戏连接。

运行验收另记录同账号同连接的实际磨石/crank位置、Speed来源、原外壳与inner图像、正转/零/反转回执及相应动画、明确未适配诊断。确认 static body 不转且 null/断流不沿用旧 RPM；随后独立核对真实材料输入、加工与产物拾取。浏览器截图和匹配 Java 客户端比较由运行方另行记录，本页不提前声明通过。

## MineColonies 建设链路审计与有限 hut 修复

本次后续审计针对本人采集、制造、装备、建城、施工与居民请求链路。它没有执行游戏动作、运行模型或部署；以下区分已有查询、网页呈现与离线原资源验载，不宣称完整模组画面或原 GUI 已完成。

锁定 `minecolonies-1.1.1319-1.21.1.jar` SHA 为 `ab97c0eec45c3f2539ec31428e3c836bb30ba1c537af0c86f5ab4e38754f6a4d`。`structurize-1.0.832-1.21.1.jar` SHA 为 `b6ede7635c63a80bd3d034c1ad3e74c648b8478f341f883d7d29c3dcf90b79ce`；`blockui-1.0.209-1.21.1.jar` SHA 为 `eec023231b21a606306cac6c588b5b07f51741f5e5bc831dba709d52332b82ab`。源码/JAR/PNG、私有 manifest 和调查记录均保持在 Git 外。

[native-colony-huts.js](src/native-viewer/native-colony-huts.js) 枚举 48 个实际普通 `BlockHut*` 类及各 class/model/blockstate SHA，来自以下闭合注册链，未使用 `blockhut` 前缀通配或仅凭 JSON 存在开放实体方块：

| 原 class，省略 `com/minecolonies/` | SHA-256 | 依据 |
| --- | --- | --- |
| `apiimp/initializer/ModBlocksInitializer.class` | `521234bef656371832f6c0b04983a636433c7a0341d8e6a6286833abd2122852` | 原具体类注册到对应 ModBlocks 字段 |
| `api/blocks/ModBlocks.class` | `0652d0a9b7576dd54657e8e48e22391f746d66854bf552e795df36ffed17411c` | `getHuts()` 的实际集合 |
| `api/blocks/AbstractColonyBlock.class` | `0042c6fad819afb10b63502684b9f8d109a702465f3de4fcd76e129c64ccfd75` | 未重写的 `newBlockEntity` 创建 BUILDING；原状态定义仅 facing |
| `apiimp/initializer/TileEntityInitializer.class` | `7a552dc58d818baecf4b676526b70fdc1fe881f407bd661eac1ef3f2f6d71350` | BUILDING 注册为 `minecolonies:colonybuilding` |
| `core/event/ClientRegistryHandler.class` | `92adc81eb7c02d1cadd3e2755bd196f757d59570269a9abdca2a92997b0e51ca` | BUILDING 注册 EmptyTileEntitySpecialRenderer；原 hut 使用 solid/cutout |
| `core/client/render/EmptyTileEntitySpecialRenderer.class` | `23a1667034217577e6dd7d8d1bf7ab49b0d3f1fe6209d5b4085dd064c757d5f1` | 原 `render` 方法为空，未丢弃一个已知动态层 |

`BlockHutEnchanter`、`BlockHutWareHouse` 虽出现在 `getHuts()`，却重写 `newBlockEntity`，因此继续排除；postbox、stash、quarry、旗帜、装饰控制器与其他实体方块也未借用此许可。居民是 `RenderBipedCitizen` 的动态专用模型，网页现有实体 dispatcher 未支持，不能替换成原版 villager、本人 PlayerObject 或任意默认皮肤。

场景原先一概拒绝普通 hut 的 `hasBlockEntity`；现在仅上述证据范围进入原 blockstate/facing/JSON/UV/PNG 管线。每个 provider 仍要求唯一锁定 client/MineColonies 来源、原 model/blockstate 指纹、实际 MODEL/实体方块/stateId/facing、原父模型来源和资源优先级。任何未知 model loader、tint、加权种子或优先级冲突仍明确拒绝。

实际 v5 私有资源的 48 类定向结果为：**10 类完整原 JSON/PNG 可验载，38 类拒绝**。10 类为 baker、blacksmith、crusher、mechanic、plantation、sifter、smeltery、stable、stonemason、tavern。它们只是离线 asset-ready，还未称 Java 客户端或浏览器像素验收。

| 拒绝分类 | 类数 | 当前原始原因 |
| --- | ---: | --- |
| 资源优先级冲突 | 18 | 14 类 `minecraft:oak_planks`，4 类 `minecraft:dark_oak_planks`；不选最高/最低排序 |
| 自定义模型 loader | 17 | 原模型声明尚未实现的 loader；未按普通 JSON 忽略 |
| 缺少原路径 | 2 | 模型引用 `assets/minecraft/textures/map/map_icons.png`，当前 1.21.1 导出中不存在；未用新 atlas 或别的图片冒充 |
| 加权模型种子未证 | 1 | `blockhutcitizen` 每 facing 有 5 个加权模型，未任选第一个 |

城镇大厅 `blockhuttownhall` 的原 block 模型为 60 面（SHA `cc4ab84d5303492c0909a309a8d0f975803542e3e328bd65f9f8ae03cae85315`）；建筑工人 `blockhutbuilder` 为 200 面（SHA `886c1947dbd709c0924ef8e54e331455cde1eca81d05e31841ebb8525a979a7a`）。两者原 blockstate 的 facing 旋转不同，均保留原值。当前两者的确切拒绝均为 `NATIVE_RESOURCE_PRIORITY_UNRESOLVED:assets/minecraft/textures/block/oak_planks.png`；其他各 5/10 张纹理 SHA 可读。该路径有 Minecraft client（`3a33db67a3ba30537d0890a5cb37c8087ca336be89cbb1393a71c23224e361a8`）与 Domum Ornamentum（`3b00412fec87bd07b83825b86de49bcb6c186ca7799f41721a36b04e5d8ed161`）两份不同字节，匹配 Java 客户端资源栈尚未提供，不能为了画出建城界面忽略 guard。

### 菜单、工单与 Agent 可用性

`PlayerColonyBridge` 已从本人 ServerPlayer 查询附近或本人拥有的 colony、权限、citizens、buildings、建设资源、requests、workOrders；Agent `modStates.colony` 使用同一 UUID 的查询回执，具备受限 `found/placeBuilder/requestBuild/deliver/stockResource` 动作接口。每次查询最多 24 条居民/建筑/请求/工单、最多 12 条建设资源，各 count/truncated 信息应随展示保留；缺字段不能当作 0 或已完成。材料 `availableReported` 是原模组报告量，交货成功与 worker 取用、工单完成仍需要后续状态分别核验。

网页当前 `presentation` 只接本人 self/inventory/nativeMenu/skills/message/time/weather，未接实时 colony 视图；Agent 紧凑状态栏只呈现目标、最后动作及回执。当前原生容器布局支持本人 inventory、crafting、generic_9x1..6、furnace/smoker/blast_furnace 和 FD cooking_pot，没有 MineColonies/Structurize BlockUI 页。

原 hut `useItemOn` 和 Structurize `ItemBuildTool.use/useOn` 在 client 分支打开窗口；普通 Mineflayer 没有这些 Java 客户端窗口对象。BlockUI XML/BuildingView、结构包选择、蓝图坐标/旋转/镜像/预览、权限页和嵌套请求树不能由 AbstractContainerMenu 槽或网页通用 5×9 网格推断。真实后端动作不等于原界面已被打开。

以下原 UI/纹理在当前资产中存在，并已通过 NativeAssetReader SHA/bytes/priority 验读，但本轮未移植它们：

| 原路径 | SHA-256 | 实际界面结构 |
| --- | --- | --- |
| `assets/minecolonies/gui/townhall/windowtownhall.xml` | `ebe23b6b8852a6bc39ac6cb77f0da88b77df1ce0e37e88236d17ca587345c1a6` | 524×290，本体与 actions/info/permissions/citizens/stats/alliance/settings 页 |
| `assets/minecolonies/gui/layouthuts/layoutbuilderres.xml` | `79b0e39c70aa1a52da98b04b989615f7188c727b1eb70fa7a6568505bf9092c3` | 190×244，constructionName/step/progress、资源列表及原 itemicon |
| `assets/minecolonies/gui/layouthuts/layoutworkorders.xml` | `4f045d9438f2d0257c20c830b5122daf7d5afbe029e1fff7b05d438cbf24bf78` | 190×244，workOrders 列表、位置及 manage 控件 |
| `assets/minecolonies/gui/citizen/requests.xml` | `dfe5a527b7520eb0a996a834c70a6f96fa7e4728fa998136b70983166eca9836` | citizen/nav include；RequestTreeWindowModule 动态挂载，并非完整静态请求页 |
| `assets/structurize/gui/windowbuildtool.xml` | `f5e2835e1aa080f66bd4dbaed7e847d075115f863a942c2df164c017fe901cfd` | 420×240，包/类别/级别/蓝图列表与 manipulation include |
| `assets/minecolonies/textures/gui/townhall_book.png` | `7341381f400acc93745105f193046a4e5e8350ed1e05ba1a62fb7b07e7488efc` | 原 townhall 背景 |
| `assets/minecolonies/textures/gui/builderhut/builder_paper.png` | `792d9d72a32220f930e64fcb5687c379796116e4aa735bf617b2c973270d4964` | 原 builder 页背景 |

当前 hut 物品和 Structurize buildtool 图标/持物 provider 也未开放，返回 `NATIVE_ITEM_STATIC_PROVIDER_UNVERIFIED`；原素材存在不代表未知视觉组件或客户端 hooks 可以忽略。居民原 renderer 还需 modelType、性别、baby、customTexture、装备、持物、动作/骑乘等实际输入；`citizens` 查询的名字/lastPosition/jobStatus 不能生成准确居民模型。`RenderBipedCitizen.class` SHA 为 `4a551f47877e643085cec804e18863dab9a749c7b75df72c70e912083237505e`。

### 有限验收建议

先以本人规范 inventory 的完整 SNBT 证明采集、制造和装备结果；已支持的物品显示原图标，hut/buildtool 未支持原因保持可见。建城/放 builder/请求施工分别核对真实 colonyId、建筑坐标/level/built/constructionPending、工单 ID/claimed 与当前 worker AI；供应材料再独立核对本人库存减少、建筑库存增加、requestState、施工资源和工单变化。不要把一次 `ok:true`、claim 成功、存入材料或齿轮转动当作任务已完成。

网页运行验收应记录同账号、连接 epoch、采样时间、当前 visible bounds、原 hut 资源/模型诊断和动作后置状态；工单/请求面板尚未接入时显著记为未支持，不能截通用槽网格称原 UI。后续 UI 数据接线要附 playerUuid/epoch/source/observedAt 与 truncate 边界，窗口状态/布局需来自原 BlockUI 和真实客户端或对应服务端 view API。建筑蓝图 ghost、殖民地边界和完整居民模型仍未支持；只看 terrain 中已放出的实际方块也不能证明蓝图预览一致。

```powershell
$env:NATIVE_COLONY_ASSET_DIR = "<native-assets-dir>"
node --test tools/test/native-colony-huts.test.mjs
```

真实资源测试使用当前原 manifest 和原 block-state registry，审计全部 48 类，并验证已支持 baker 的 107 原面/PNG 载入及 geometry 释放。提供目录时不跳过；缺目录时这一个原资产案例跳过，不能称已完成源资产验证。本轮不关闭完整 scene parity guard。

## Create 风车轴承与原生转子（2026-10-09）

锁定 Create 6.0.10 JAR `ef87fe5709f1ba1f5b8bb20a2925b5afb4669e178fd6d8bf10c167759eefe37a`。静态轴承本体读原 blockstate；动态半轴和木质顶部读原 `shaft_half`、`bearing/top_wooden` 模型、原 UV/PNG。六朝向按原 BearingVisual/Ponder 规则变换，半轴使用真实 RPM，顶部绑定相邻原生转子，不能选用另一台机器的角度。

本人 PlayerMenuBridge 只导出本人实际已跟踪、同维度、32 格内的 ControlledContraptionEntity；每帧最多 4 个、每个 96 方块、总几何 24 KiB。原生客户端本就接收已跟踪转子的几何；渲染交由深度测试遮挡，不能用中心点 LOS 误隐藏整组仍可见的帆。可见性查询 API 保持原规则。浏览器要求原实体包中的类型/UUID/entityId 与同 playerUuid/epoch 的渲染状态一致，不凭桥数据生成幽灵实体。转子加载真实 block ID/全部 state properties 的原模型，在原 anchor 中心按实际轴、当前/前一 tick 角度旋转；保留 Flywheel 1.0.6 的 entityId nudge。超过 1 秒无新角度隐藏动态模型；新鲜数据可恢复。包含未适配 BlockEntity 的转子或超预算明确 unavailable。

测试覆盖真实安装资源、全部六朝向、身份/几何限制、陈旧状态、重复/迟到实体和模型释放。原资产与状态链通过不等于完整 Java 画面一致，`pixelParityVerified/renderParityVerified` 仍为 false；客户端插值相位、光照、完整场景及所有复杂移动机器尚未逐项对照。

实机普通 MawNeko 制作并启动八帆风车，服务端确认 1 RPM、8 帆、无卡转及两次同 UUID 角度变化。浏览器同账号观察已见原帆模型转动，重启后同转子 UUID 正常恢复、新 entityId 正确绑定；不是另开观战账号。最终相关 53 项 Node 测试在实际 v14 资源下全通过，无跳过。角色未支持的 YSM 模型、特殊物品及完整 Java 场景对照仍明确未验收。
