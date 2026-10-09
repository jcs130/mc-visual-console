# Farmer's Delight 原生读取、菜单与食物图标

本页记录锁定 Farmer's Delight 1.21.1-1.3.4 的源码接缝和只读前端实现。游戏操作由同一 Mineflayer 玩家的原生操作链执行；网页展示该玩家的真实回执，不提供取放、烹饪或切菜按钮。源码与离线测试通过不代表实服操作或匹配 Java 客户端像素验收已完成。

## 锁定来源

FD JAR SHA-256：`139ad7696462c89c03eea463f805abffa552526c5dadaadae221dd9624cb197c`。Minecraft 1.21.1 client SHA-256：`499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`。原 class、JAR、PNG、完整反编译记录与运行回执保留在仓库外。

| 原 class 路径，省略 `vectorwing/farmersdelight/` | SHA-256 | 关键依据 |
| --- | --- | --- |
| `client/gui/CookingPotScreen.class` | `cbd067756d723ee4e755c6edc9ccfda9a3c97203453183b0d678f5fe842e6bd2` | `renderBg` 原图、热源与进度裁剪 |
| `common/block/entity/container/CookingPotMenu.class` | `b4dda5c1e6edec15c5f392ea927759a4c1b2b4f6646c72324a5fdcfd6b815568` | 45 个 Slot、坐标与 `getCookProgressionScaled()` |
| `common/block/entity/CookingPotBlockEntity.class` | `7cf11661c732804923087ab4542df9096e41f6bb827d82b8445d423271d56363` | `createIntArray()`、`isHeated()`、`getContainer()`、烹饪和盛装 |
| `common/block/CookingPotBlock.class` | `2912f77bd929c1bd51ea7cc2cb3368829e5f52303c73807ea48ded4e676eeeab` | `useItemOn()` 开菜单、直接盛装和蹲下切换行为 |
| `common/block/entity/container/CookingPotMealSlot.class` | `6d5ce720aff47d2fe3296bb36a82c68e3ac0e98024fe4682799b757ae2d87d91` | 槽 6 不允许放入或取出 |
| `common/block/entity/AbstractStoveBlockEntity.class` | `43621b93b0768c661894d2b38786c79a29e836010e2f9686d66fb6ad27e76b54` | 原 6 槽、烹饪计时与世界掉落 |
| `common/block/entity/CuttingBoardBlockEntity.class` | `0eaaf1ca9d00d04cc26466fb8ef05f4acd7508edc4d61f7581949fb273a6df70` | 原单槽、工具匹配、消耗与掉落 |
| `common/crafting/ingredient/ChanceResult.class` | `a9badd793f14dde9f44ca89f453a3ef83bcc9f7219d8e054e5d8243e000f8859` | record `stack()` / `chance()`，默认 chance 1，逐件随机与 Fortune 修正 |
| `common/crafting/ingredient/ItemAbilityIngredient.class` | `f38b435c3f2713416fae1d4db48a651faa1032bc57a4744229515395d8f294da` | `isSimple()==false`、真实 `stack.canPerformAction` 谓词 |

## 料理锅只读屏幕

[native-ui-adapter.js](src/native-viewer/native-ui-adapter.js) 的 `nativeCookingPotMenuLayout(menu, expectedUuid)` 仅接受本人 UUID、`farmersdelight:cooking_pot`、有效非零 window、非负 state 和完整连续 45 槽。如果收到真实 `slotLayout`，45 项也须与原构造器逐项一致，不把任意同槽数模组窗口套进此图。

| 槽 | 原 item origin，GUI 像素 | 原生含义 |
| --- | --- | --- |
| 0–5 | `(30+18col,17+18row)`，3 列 2 行 | 原料 |
| 6 | `(124,26)` | 熟食缓冲，不可直接取出 |
| 7 | `(92,55)` | 盛装容器 |
| 8 | `(124,55)` | 盛装后成品 |
| 9–35 | `(8+18col,84+18row)` | 玩家背包 |
| 36–44 | `(8+18col,142)` | 玩家快捷栏 |

原图 `assets/farmersdelight/textures/gui/cooking_pot.png` 是 256×256 PNG，屏幕背景裁剪 176×166；SHA 为 `52ac5d706ff3d49213d7a664bd2ce0bb04b5fc707f38d0762ae9a01722f8e514`、3595 bytes。空容器槽原 16×16 提示 `assets/farmersdelight/textures/item/empty_container_slot_bowl.png` SHA 为 `69a633cb92a2b0062ac979df80a66fac078546ff6944c9edd79c41794b7d65eb`、143 bytes。两张图均核对唯一正确 FD source、SHA、bytes，并经原 reader 的资源优先级 guard；不替换图像。

`nativeCookingPotState()` 接受服务端实际 `dataValues=[cookTime,cookTimeTotal]` **两项**；`CookingPotBlockEntity.createIntArray().getCount()` 为 2，客户端 `SimpleContainerData(4)` 是占位构造参数。原菜单计算 Java int `cookTime*24/cookTimeTotal`，保留 int32 乘法与整数截断；screen 箭头宽为该值+1，原图 `(176,15)`、目标 `(89,25)`、高 17。零进度依原代码仍画 1 px；不把它表示为成品可取。异常裁剪范围、负/非 int/缺数据保持明确 unknown。

热源图独立读取 `cookingPot={playerUuid,source:'native_cooking_pot_menu',isHeated,container}`。原图 `(176,0)`、目标 `(47,55)`、17×15，仅实际 `isHeated:true` 时显示。缺数据不能按食物、燃料、已流逝时间或进度推测。`container` 来自原 `getContainer()`，可以为 null；不会一律猜碗。空槽提示 PNG 也不改变槽 7 的 null 物品身份。槽 6 标注原规则且保留回执的 `mayPickup:false`。

原配方书、标题/字体、原 hover 效果、原客户端 tooltip 排版未移植；网页不是完整 Java screen 像素 parity。未知模组菜单仍显示真实槽与明确布局缺口。

## 原生读取接缝

本轮后端与 host 源码提供以下数据；运行端缺字段时前端保留 unknown。读取不赋予物品、配方或技能。

| 回执 | 来源与字段 | 限制 |
| --- | --- | --- |
| `menu_receipt.state` | 原 `AbstractContainerMenu.dataSlots` → `dataValues`、`dataValuesSource:'server_menu_data_slots'`；读取失败 `dataValues:null` 和 `dataValuesError`；实际 `Slot.x/y` → `slotLayout` | 料理锅 2 项；原版炉 4 项，不能共用索引 |
| `state.cookingPot` | 本人实际 `CookingPotMenu.blockEntity.isHeated()` 与 `getContainer()`，私有单播并带本人 UUID | 热源与 cookTime 分开；不猜容器 |
| 原物品 `food` | `DataComponents.FOOD` 实际 nutrition、saturation、canAlwaysEat、eatSeconds 摘要 | tooltip 只显示已收到的完整有效摘要；仍保留原 SNBT，不由代理名字推断食物 |
| `world_query kind:'recipes'` | 服务器实际 RecipeManager；过滤 `recipeId`、`recipeType`、`outputId`，offset，limit 最大 12；返回 `world_receipt` | `definitionAvailable:false` 时只有发现信息，不能自动规划成完整可执行配方 |
| 料理锅配方 processing | `cookTimeTicks`、`experience`、`servingContainer`、`containerOverride`、`heatRequired:true` | 实际 ingredient alternatives 是备选，不能把所有 tag 成员同时放入 |
| 切菜配方 processing | 原 `toolIngredient` Ingredient.CODEC JSON；本人 `matchingOwnedTools`、`heldToolMatches`；原 `rollableResults[{item,baseChancePerItem}]` | 自定义 ability 谓词不能压成 `getItems()` 名单；Fortune 可能改变概率，dropsIntoWorld=true，toolConsumed=false 不等于不受损 |
| 本人可见 `world_receipt.block.farmersDelight` | stove 的实际 6 槽、slotLimit1、lit、CookingTimes/CookingTotalTimes；board 的实际单槽、storedItem/maxStackSize/empty/isItemCarvingBoard | 来自当前加载的原 block entity；不读取保存世界、不靠 NBT 代理创造方块 |

`PlayerMenuBridge` 的物品仍是完整 namespace ID/count/SNBT；host 将其映射为前端 name/count/SNBT，并保留 food、displayName、descriptionId。打开料理锅时，独立 `playerInventory` 保持本人 canonical 46 槽；不能拿菜单 45 槽推断本人 inventory 46 槽。前端没有直接消费配方表或执行原料移动的游戏入口。

旧链路的准确缺口是：Agent inspect 曾只转发菜单槽而不转发 cook data、slotLayout、heat/container；use_block 只有已发送状态，不能证明设备处理完成；普通 eat 使用代理名字挑选原版食物，不能证明吃的是指定模组食物。这些须由 Agent/原生后端链修复并以实际后置条件验收，不能用网页图标或菜单打开成功替代。

## 食物图标正证据

[native-static-item-providers.js](src/native-viewer/native-static-item-providers.js) 新增 35 个**直接** `ConsumableItem` 注册，包括米饭、各汤、沙拉及盘装菜。锁定 `ConsumableItem` 只修改消费、容器返还和 tooltip，FD 的 client renderer/property 只注册 SKILLET；35 个原模型另经逐件检查，均为单层 generated 原 PNG。没有扩展未经审查的 DrinkableItem、PlaceableItem、其他子类或煎锅专用 renderer。

完整 FOOD patch、custom_name、NBT 数值类型和 removal patch 保持原样；图标缓存是原 ID+完整 SNBT。FOOD 摘要及 displayName 不会替换该身份。custom model、tint、glint 和未知视觉组件继续明确拒绝。此名单不等于整包第三方视觉 hook 已验收。

离线 v4 资源总审计为 1059 候选、1011 assetIntegrityReady、940 guardScope（FD 为 111/117）；原 119 项拒绝和 16 项优先级冲突保持。详情及完整命令见 [通用 GUI 支持范围](NATIVE_ITEM_GUI_COMPATIBILITY.md)。

## 实服验收条件

1. 同一玩家查实际 RecipeManager，例如 `recipeType:'farmersdelight:cooking',outputId:'farmersdelight:cooked_rice'`，记录实际材料 alternatives、servingContainer 和 cookTimeTicks。锁定原 `cooking/cooked_rice.json` 是一份 `c:crops/rice`、成品米饭×1、100 tick；运行数据包可以改变它，行动以实际回执为准。
2. 本人 look 确认设备/热源；空主手且不蹲下正常打开料理锅，记录本人 UUID、45 槽、window/state、2 项进度与热源。带兼容容器右键可能直接盛装，不能把该行为当成打开菜单。
3. 用实际匹配材料与容器，经有当前 state、预期物品完整 SNBT 和 carried 前置条件的原生菜单操作放入。多余原料槽非空可能使原无序配方不匹配；每次操作读取新回执，不复用旧 state。
4. 等待服务器真实 cookTime 与槽 6/8 变化。槽 6 熟食不是可取物；尝试取出应保持原内容与 carried 不变，实际 bridge 可以返回 `no_change`。在槽 7 有原兼容容器时验证原缓冲→槽 8 盛装后的内容与计数变化。
5. 从槽 8 取实际成品，并验证本人 canonical inventory/carried 的实际 namespace、count、SNBT 后置条件。若继续吃饭，先确认实际 FOOD、当前主手和饥饿允许，再核对食物数量、容器返还及本人真实饥饿/饱和度变化；不能仅凭 sent/CONSUME 字样断言成功。
6. 网页记录同一个 window/state 的原背景、45 个原位置、实际饭/碗图标、nutrition 摘要、热源/进度和资源诊断。等待图标 loading 完成；具体拒绝原因保持可见。源码测试与浏览器观察分别记录；匹配 Java 客户端像素比较仍单独待验。

炉灶和切菜板均**没有 GUI**。炉灶每槽只放一件，通过原 campfire cooking recipe 处理，结果掉进世界；掉落不能当作已进入本人背包。切菜板高度 1/16，需要原命中点/实际 useOn cursor，按当前实物 toolIngredient.test 操作；确定性示例是原 beef 切菜配方、无 Fortune 工具，牛肉×1→碎牛肉×2（chance 默认 1）。核对板输入减一、工具耐久、原掉落实体和本人拾取后计数分别完成，不给它们套用炉子窗口或伪造进度。

本轮前端测试与私有原资产检查已通过；部署、真实料理锅操作、炉灶/切菜板动作与浏览器截图由运行方另行记录，不在此预先声明通过。
