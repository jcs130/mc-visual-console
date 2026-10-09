# 1.21.1 原生物品 GUI 支持范围与离线审计

此文档记录原生物品图标的注册证据、组件约束和可复现资源检查。统计对象是普通静态 JSON provider 的候选物品，不能用来宣称整个模组包、浏览器画面或 Java 客户端像素已经兼容。所有实际物品仍来自操作者本人的原生连接，保留 namespace、count 和完整 SNBT；未知渲染输入显示明确的不可用状态。

## 注册证据与锁定来源

[native-static-item-providers.js](src/native-viewer/native-static-item-providers.js) 的列表由实际注册调用及 item class/client hook 审查产生。模型 JSON 的存在本身不构成静态 provider 证据。

| 来源 | 正证据范围 | 候选数 | JAR SHA-256 |
| --- | --- | ---: | --- |
| Minecraft 1.21.1 client | 普通 `Item`、`BlockItem`、`ItemNameBlockItem`、`StandingAndWallBlockItem`，已审查的书、六种材料工具和投掷物 item class；排除 ItemColors/ItemProperties 动态项 | 942 | `499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99` |
| Farmer's Delight 1.21.1-1.3.4 | `ModItems` 的 41 个普通 `Item`、41 个普通 `BlockItem` 与 35 个直接 `ConsumableItem`；审查 JAR 内颜色、模型和 `IClientItemExtensions` hook，SKILLET 的专用 renderer/property 被排除 | 117 | `139ad7696462c89c03eea463f805abffa552526c5dadaadae221dd9624cb197c` |

客户端证据包含 `Items`（混淆名 `cut`）、`ItemColors`（`fhu`）、`ItemProperties`（`gps`）与具体 item class。三者 class SHA-256 分别为：

```text
Items:         63c118a911720b62d14709bc71709105ef3c9cb7fd75ec1baa44dc8500a11232
ItemColors:    2ac36e644129920977fdefa31867c103d03571b7585a33567a84569dbd69abd4
ItemProperties:0d0e77d78780c9dfedf86514d29cfec312459062f5a90175dda479006aa32f24
FD ModItems:   3b4917565f8d6f5f3ced18846f43dfdf92bc474313a19264db16ef9d4cfc9fbd
FD ConsumableItem:8af6c2428e80b5d321794c39a18e07cf0603a635c51bee9a49e416f5d295cbdd
FD ClientSetupEvents:0d3085ae62f7725d30882fcd1e1b49564fc3a50c32528a212e1d0202271543a7
```

注册 ID 不由 Java 字段名推断。例如 `Items.CUT_STANDSTONE_SLAB` 是字段拼写错误；`cut.eh` 实际注册 `dga.jG`（`Blocks.CUT_SANDSTONE_SLAB`），原生 ID 是 `minecraft:cut_sandstone_slab`。审计工具另外核对 SHA 已验证的 `registry/items.tsv` 中全部候选 ID。

provider 要求 manifest 为 1.21.1、`assetIntegrityVerified:true`，client JAR SHA 一致，相关来源名字恰好对应一条正确 SHA、非 `explicitOverride` 的记录。每个需要读取的模型、shader 和 PNG 继续由 `NativeAssetReader` 核对字节数、SHA 和 `variants`；来源冲突保持 `NATIVE_RESOURCE_PRIORITY_UNRESOLVED`，不选择最高/最低排序来掩盖未知资源栈。

FD `ConsumableItem` 只重写消费、容器返还和 tooltip，不重写模型、颜色或 client extension；`foodItem/bowlFoodItem` 只设置 FOOD、返还碗及堆叠上限。锁定 FD 全部 292 个 class 的相关 hook 扫描仅发现 SKILLET 的 renderer/property。35 个食物的原模型进一步逐件验证为单层 generated，包括 `cooked_rice`、`vegetable_soup` 和 `beef_stew`；实际 FOOD 组件及数值 tag 类型保持完整，不为取图标去掉组件。未审查的 `DrinkableItem`、`PlaceableItem` 和其他子类不借用该正证据。此检查不宣称已排除其他模组的第三方视觉覆盖。

其他模组及未审查的 vanilla item class 不在此通用正证据表。Ars 原 Gecko 书和组件选封面的 Patchouli/女仆物品使用独立专用 provider；它们不加入下方 1059 统计。

## 实际资源集的离线结果

2026-10-05 对私有 `native-20261005-v4` 执行下面的脚本，实际读取 client/FD JAR 并验证 SHA。原生 items 注册表 SHA 为 `a8f8aba7484010b8b32b39533265e95f191555019c1baf5243bfd5f901e7e619`，共有 4810 项；1059 个候选全部存在。此统计要求相同模型、纹理、注册表及资源优先级证据，不因仅更换运行 bridge SHA 而改变。

| 检查阶段 | 数量 | 含义 |
| --- | ---: | --- |
| 注册证据候选 | 1059 | 已审查静态 provider 的 ID，尚须模型与状态检查 |
| `assetIntegrityReady` | 1011 | 通过当前模型规则并实际读到所需模型/纹理 SHA；其中仍含透明块纹理 guard 的拒绝项 |
| `guardScope` | 940 | 当前离线模型、组件默认状态及材质/纹理 guard 范围：557 块模型、383 generated flat |
| Minecraft 当前 guard 范围 | 829 / 942 | 仅上述静态候选 |
| Farmer's Delight 当前 guard 范围 | 111 / 117 | 仅上述静态候选 |
| `browserVerified` / `pixelParityVerified` | `false` / `false` | 离线工具不建立 WebGL、不连接游戏，不做 Java 参考像素验收 |

此前 975/904 是修正 `CUT_STANDSTONE_SLAB` 字段名误映射前的历史统计；1024 候选、976/905 是加入这 35 个直接 ConsumableItem 食物前的统计。当前正式离线范围使用 1059 候选、1011/940。

119 个当前拒绝项的首个失败原因如下，不能计入兼容数量。数量针对此资源集和默认无额外视觉组件状态；实际携带视觉组件的物品还会被逐件拒绝。

| 拒绝原因 | 数量 |
| --- | ---: |
| `NATIVE_RESOURCE_PRIORITY_UNRESOLVED` | 16 |
| `NATIVE_BLOCK_ITEM_TRANSLUCENT_TEXTURE_UNSUPPORTED` | 71 |
| `NATIVE_BLOCK_ITEM_ANIMATION_UNSUPPORTED` | 13 |
| `NATIVE_BLOCK_TINT_UNAVAILABLE` | 2 |
| `NATIVE_ITEM_ANIMATION_UNSUPPORTED` | 1 |
| `NATIVE_BLOCK_ITEM_FRONT_LIGHT_UNSUPPORTED` | 3 |
| `NATIVE_ITEM_GUI_TRANSFORM_UNSUPPORTED` | 3 |
| `NATIVE_ITEM_GLINT_UNSUPPORTED` | 3 |
| `NATIVE_BLOCK_ITEM_RENDER_TYPE_UNSUPPORTED` | 1 |
| `NATIVE_BLOCK_ITEM_DYNAMIC_MODEL_UNSUPPORTED` | 6 |

通用 flat 路径限原模型继承 `builtin/generated`、单 layer0、front light、GUI 恒等变换和无动画 PNG；保持原 PNG 的 alpha。通用块路径保留原 JSON elements、UV、face/element rotation、GUI transform 和原 GUI 光照，只接当前可验证的 opaque、side-light、solid 材质。透明/动画/tint、模型 override/loader、其他材质或镜像 GUI 仍明确拒绝，不拿 flat PNG 或普通 cube 替代。

## 工作台 GUI 与背面资源

`minecraft:crafting_table` 使用原 `minecraft:block/cube` 六面、三个原工作台纹理、GUI rotation `[30,225,0]`、scale `[0.625,0.625,0.625]`。底面原纹理仍是 `minecraft:block/oak_planks`，其资源优先级没有被确认或改写。

[native-block-item-icons.js](src/native-viewer/native-block-item-icons.js) 在这个固定 GUI draw context 下根据原 face 三角形、正 scale 的 XYZ ItemTransform、FrontSide 和朝 -Z 的 orthographic camera 判定背面；原 GuiGraphics Y reflection 与屏幕投影 Y reflection 相抵。只有变换后法线 Z 明显小于 `-1e-5` 的面不请求纹理，近边缘面保守保留。此规则没有按 `down` 等名字排除面。

工作台仍保留 6 个原面和全部原纹理引用；实际 draw 为 up/north/east 三面。down/south/west 的记录包含 faceIndex、direction、原 resourcePath、normalZ、`native_gui_frontside_backface`，以及 `resourceRequested:false`、`resourceVerified:false`。这说明底面没有像素贡献，不表示 oak_planks 的内容/优先级已通过校验。回归将同一底面旋转至可见时，仍收到原优先级错误；镜像/零 scale 直接拒绝。该剔除证明不能用于持物、世界、其他相机或 DoubleSide/translucent provider。

`minecraft:oak_planks` 和 `minecraft:oak_stairs` 的可见面需要 oak_planks.png，当前仍不可用。完整资源栈 proof 与匹配客户端参考验收是独立待办。

## 原生容器 GUI 的有限布局

[native-ui-adapter.js](src/native-viewer/native-ui-adapter.js) 另外移植以下锁定 1.21.1 原窗口布局。这是本人原生窗口的只读展示，不增加网页取放物品、合成、炉子或其他游戏动作入口，也不计入上方 940 个物品图标范围。

| 原生 menuType | 原始来源 | 实际窗口槽数与显示范围 |
| --- | --- | --- |
| `minecraft:crafting` | `CraftingScreen` / `CraftingMenu`；`textures/gui/container/crafting_table.png` | 46 槽：结果 0、3×3 输入 1–9、玩家背包 10–36、快捷栏 37–45 |
| `minecraft:generic_9x1` … `minecraft:generic_9x6` | `ContainerScreen` / `ChestMenu`；`textures/gui/container/generic_54.png` | `9R+36` 槽；原 `R` 行箱槽、玩家背包、快捷栏；窗口高度 `114+18R` |
| `minecraft:furnace`、`minecraft:smoker`、`minecraft:blast_furnace` | `AbstractFurnaceScreen` / `AbstractFurnaceMenu` 及三种具体 screen 的原资源路径 | 39 槽：输入 0、燃料 1、结果 2、玩家背包 3–29、快捷栏 30–38 |
| `farmersdelight:cooking_pot` | 锁定 FD `CookingPotScreen` / `CookingPotMenu` / `CookingPotBlockEntity` 的原 PNG、Slot 和数据公式 | 45 槽：3×2 原料 0–5、禁止取出的熟食缓冲 6、容器 7、成品 8、玩家背包 9–35、快捷栏 36–44 |

布局要求菜单内的 `playerUuid` 等于已确认的本人 UUID、`windowId>0`、有效非负 `stateId` 与完整连续原槽号。身份、槽数、状态、锁定 client/source SHA 或 PNG SHA 不一致时保持原生槽的通用只读展示，并列出具体拒绝原因。window 0 保持原本人 46 槽背包的手动/待机入口，不自动弹窗，也不套用工作台槽号。物品仍逐件保留完整 SNBT、实际名字及组件。

工作台 result 原 item origin 是 `(124,35)`，3×3 输入是 `(30+18col,17+18row)`；玩家背包从 `(8,84)` 开始，快捷栏 Y 为 142。箱子按原 screen 做两段 PNG blit：源 `(0,0)` 到 `176×(18R+17)`，再把源 `(0,126)` 的 `176×96` 放在 Y=`18R+17`；原两段总高度比 imageHeight 少 1 px，保留这一原行为。槽位来自真实 Java 构造器，未根据客户端通用网格猜测。

炉子进度只接受同一窗口原 `dataValues=[litTime,litDuration,cookingProgress,cookingTotalTime]` 四个完整 Java int。保持原 float32 除法、clamp、乘法舍入与 `Mth.ceil`：火焰仅 litTime>0 时绘制，高度为 `ceil(float(litRatio*13))+1`，litDuration=0 按原代码使用 200；箭头宽度为 `ceil(float(cookRatio*24))`。从原 `14×14` 火焰的底部、原 `24×16` 箭头的左侧裁剪，而非缩放整图。边界回归包括 cooking 1/3→8 px、lit 7/13→9 px。本轮后端源码增加真实 `AbstractContainerMenu.dataSlots` 读取和 host 字段保留；运行端未收到这四项时仍明确为 unknown，不由燃料物品或时间推测。缺 sprite、SHA/优先级冲突、读数据异常或非法数据也保持 unknown，显示原失败原因。部署及真实炉子浏览器验收另行记录。

料理锅沿原 screen 在 `(89,25)` 裁剪原图 `(176,15)` 箭头，宽度为 Java int `cookTime*24/cookTimeTotal+1`、高度 17；保留 int32 乘法与截断规则。服务端实际 data slot **只有 `[cookTime,cookTimeTotal]` 两项**，不是客户端 placeholder `SimpleContainerData(4)`。热源图独立来自本人 `cookingPot.isHeated`，位置 `(47,55)`、原图 `(176,0)`、大小 `17×15`；缺热源数据不会按进度推断。容器来自真实 `CookingPotBlockEntity.getContainer()`。空容器槽使用原 `empty_container_slot_bowl.png` 提示图，但仍是 null 物品，不凭空添加碗。实际 `slotLayout` 如果提供，必须逐个与 45 个原坐标一致。原 PNG、来源及详细验收方法见 [Farmer's Delight 接缝](NATIVE_FARMERS_DELIGHT_COMPATIBILITY.md)。

背景 PNG SHA：工作台 `baf65a599d8bb380b1b03efa1862c20fd29e936b43110d7438b9fe00086075b0`；箱子 `1ca0500b1be97ba0dda9290bc16b554829b63de691cefe7dcbfd3078cae8c268`；三种炉子均为 `d700c1af4175a204e9e403c31dea2afdee575dac2bb23493f208b9f0bf3b2dc8`。火焰和箭头 sprite SHA 分别为 `32f69838e8fbf0b980ec3f8b205d0ddb5f477fcf6202feddbd1b6a0b4524b6eb`、`9e042d39afe20bbdd4a0cfbb66be1c24f30327d460a48042d3a38cba7851c018`；每条原路径均单独通过 reader 的 bytes/SHA/priority 检查。

原 source class SHA-256：

```text
CraftingScreen fpg:       2bdae8d835d46754180fda2459b04b477ab4acceb62b381f8d2b5521416af4eb
CraftingMenu cqm:         68025666eea6290a718ab8ff10ec17722ea741e54717e66a14428e25d5cb0551
ContainerScreen fpe:      5dc716403edc9dde896ac7ffae7305d62de16af01b27031313b02a83046ee57b
ChestMenu cqc:            f757996c845486aef6a0948407c1c8728b80ec6c6676b39aa64dbd26d84017f6
AbstractFurnaceScreen fou:dd0e07cdac646915dd4be265fa645e672fdff255af6b368d66133b662b036f07
AbstractFurnaceMenu cpv:  14a0302f416eac1f45f21e199d80511a4de9f20d9d14e27d4f209dc5716e3630
FurnaceScreen fpo:        f17ac4e973a904a90dd82435690eaac233b2930568195fbc60f7ea4ff830fb15
BlastFurnaceScreen foy:   3d8c8a5809cb7e764cd84cdcb15bc4b9a4fdb6013849717ee5b813f67416b325
SmokerScreen fqf:         f0943a03706a6850aba17a7c85754f92c8910924250414ca146673aa8043d25c
```

配方书、原生标题/字体、原客户端槽 hover 效果和未知模组 GUI 尚未移植；这些窗口不能宣称完整 Java GUI 像素 parity。对应 source、JAR 和原 PNG 留在仓库外。加载中的物品图标单独标记 loading；真实拒绝的 tooltip / `data-model-reason` 保留完整有界原因，不再将异步加载当作已确认不支持。2026-10-05 只读本人状态确认 Oak Button 与 Oak Planks 的原 SNBT 无额外组件，实际拒绝均是 `NATIVE_RESOURCE_PRIORITY_UNRESOLVED:assets/minecraft/textures/block/oak_planks.png`，不能算作兼容或绕过 guard。

## 原生组件与显示名称

所有入口先调用 [native-item-stack.js](src/native-viewer/native-item-stack.js) 解析完整原 SNBT；缺 SNBT、双 structured components 来源、ID/count 不一致、重复 key、类型或预算非法均拒绝。parser 的 byte/short/long/float/double、typed arrays 和 `!component` removal patch 保留原语义。缓存使用 registry `name + '#' + 完整原 SNBT`，不会把不同视觉组件或 tag 类型合并。

通用 provider 只接受已审查不改变静态模型的名称、lore、rarity、damage、stack size、repair、food、属性/使用限制、书内容等组件，并保留全部值。附魔/原生默认 glint 或 glint override true 均拒绝；真实 false override 可关闭 glint，正/removal 双 patch 仍拒绝。`written_book`、`nether_star`、`enchanted_golden_apple` 的默认 glint 不能被当作普通无光图标。custom model、dyed color、profile、block state、未知 mod component 等未实现的视觉输入不会被剥除后渲染。

[native-ui-adapter.js](src/native-viewer/native-ui-adapter.js) 的槽文本、图片 alt 与钓获名称优先显示服务端本人物品 `displayName`，没有该值时才显示原 `name`。使用 literal text，tooltip 仍含原 namespace ID；resolver 仍收到同一完整 item/SNBT。`displayName` 不参与 icon key 或模型选择，自定义名称组件仍保留在原 SNBT 中。运行 host 的背包/装备映射保留 `displayName`、`descriptionId`；本人背包来自 canonical 46 个原槽，打开模组菜单时由独立 `playerInventory` 保留该 46 槽，而非根据容器槽猜映射。

## 可复现检查

从本目录运行，输出目录应预先存在，报告必须留在 Git 仓库外：

```powershell
node tools/audit-native-item-gui.mjs --assets "<native-assets-dir>" --client "<minecraft-1.21.1-client.jar>" --mods "<locked-mods-dir>" --output "<external-report.json>"
```

[audit-native-item-gui.mjs](tools/audit-native-item-gui.mjs) 核对 manifest、注册表 SHA 与真实 ID、可选实际 source JAR SHA、每个候选的原模型继承与所需资源，独立解 PNG filter/palette/tRNS/alpha 并检查生产透明纹理 guard。限制包括 4 MiB 注册表、4096 候选、16 MiB PNG、2048 边长、4M 总像素、4096 PNG chunks、有界 inflate；CRC、未知 critical chunks、APNG/未支持格式、超预算输入均拒绝。输出包含每个候选的原因、sourcePaths 和 GUI culled-face 记录。工具没有网络/GPU/游戏操作。

定向回归 97 项全部通过、无 skip，包含私有真实 guide、35 项 FD 食物和容器 GUI asset 校验；UI 单独 32 项，console 4 项，图标入口 12 项：

```powershell
$env:NATIVE_GUIDE_ASSET_DIR = "<native-assets-dir>"
node --test tools/test/native-item-icons.test.mjs tools/test/native-block-item-icons.test.mjs tools/test/native-item-stack.test.mjs tools/test/native-ars-item-icons.test.mjs tools/test/native-guide-item-icons.test.mjs tools/test/native-special-item-cache.test.mjs tools/test/native-item-gui-audit.test.mjs tools/test/native-ui-adapter.test.mjs tools/test/native-console.test.mjs
```

测试覆盖原模型/UV/transform、工作台剔除与反例、SHA/provider/组件拒绝、真实名字与 icon key、PNG 编解码边界、缓存和销毁中的晚到异步结果，以及本人窗口身份、工作台/六种箱子/三种炉子/料理锅原槽、PNG 分段裁剪、float32 与 int32 进度边界、真实 host 料理锅/FOOD 字段保留及缺数据 unknown。未设置 `NATIVE_GUIDE_ASSET_DIR` 时跳过对应私有资产测试；图标食物资产测试也接受 `NATIVE_ITEM_ASSET_DIR`。源码与合成测试可提交；原 JAR、PNG、私有注册调查和运行截图/完整资源报告留在仓库外。

浏览器验收须另记录同连接物品、实际槽图像、资源诊断和控制台结果；匹配 modded Java 客户端比较须另记录像素/材质/光照差异。场景中的原 bed renderer 与本人连接 entity layer、专用 Ars/guide GUI 及第一/第三人称持物属于各自独立范围，本文统计不会把它们算作完整实体、动画、装备或场景 parity。
