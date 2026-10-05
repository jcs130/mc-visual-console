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
