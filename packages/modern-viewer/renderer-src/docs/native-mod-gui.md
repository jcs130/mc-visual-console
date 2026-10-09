# 原生模组窗口的网页展示

2026-10-09 中文与图标后续：原始名称 Component/翻译参数保留到网页，接入原 Minecraft/模组中文；新增七种 Domum 默认图标、四种门和十五种活板门，补齐第一页十组图标。原版橡木按钮/木板/楼梯的两个已审计贴图覆盖按默认原生 pack 顺序解决，其他冲突和专用动画/glint 仍明确 unavailable。148 项相关测试通过。当前规则、来源及维护步骤见 [中文与图标](native-ui-localization.md)；下文“仅 panel/全部冲突拒绝”为较早增量范围。

2026-10-09：Domum Cutter 增加原生分组/款式第一页各最多 10 个预览，保留实际索引、完整物品组件、选择状态与原 PNG 按钮 UV。服务端只从原模组模板复制预览，已有真实输出材质时才按当前输入重映射；网页只读预览没有 `data-slot`、不作为库存或可取产物。页内预览仍须匹配本人 UUID、windowId、stateId 和新鲜度，后续滚动页没有伪装成已完成。

新增 `native-domum-item-icons.js`：按锁定 Domum 1.0.231 的原材质 loader、PanelBlockItem、15 个 TrapdoorType ordinal 和原 item overrides，读取实际 `domum_ornamentum:texture_data`、`minecraft:block_state`，保留原模型顶点/UV并替换实际材质 sprite。仅接受明确的无 tint、不透明、单一 sprite 方块材质；原模组随机材质、透明/染色/动态方块、其他 Domum 物品和未知视觉组件明确不可用。材质资源冲突继续拒绝，未按文件顺序猜优先级。

相机变换来自 `MateriallyTexturedBakedModel.getTransforms()` 委托的 `item/panel_spec` 原继承链；选中的 child 提供几何。NeoForge ItemRenderer 在 `getRenderPasses` 之前应用 camera transform，所以不能取 child 自身的空 display 或外层 loader JSON 的 translation 来画 GUI。证据为安装 JAR 的原 class，以及[官方 21.1.248 userdev 补丁包](https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.248/neoforge-21.1.248-userdev.jar)中的 ItemRenderer patch。原生源码/补丁与资产保持仓库外，代码不复制私有素材。

实机以普通非 OP mc-agent-neko 身体完成两次圆石 → 4 full panel，最终 8 面板和完整组件重连保留；网页见原切割台、圆石款式预览、真实产物及库存图标，控制台无错误。管理员站位与材料夹具已披露，测试 0 模型调用。139 项相关原资源/界面测试通过、0 skip；这不等于 Java 像素或全部模组 GUI 一致性验收。

界面与 Agent 操作来自同一个玩家连接。`createNativePlayerPresentation` 接收原生菜单、Ars 回执及可选 Curios/Domum 状态；不读取 Mineflayer 的代理物品，也不在渲染器中调用游戏动作。

已移植 Minecraft 1.21.1 原工作台、箱子、炉界面，以及 Farmer’s Delight 1.3.4 烹饪锅、Curios 9.5.1 的实际饰品槽布局。Curios 的负 X 坐标、动态列、分页行和装饰槽图层来自安装 JAR 的 `CuriosScreen.renderBg` 与 `CuriosContainer.setPage`，通过原 PNG 裁剪绘制。Domum Ornamentum 1.0.231 切割台支持材料/产物/玩家槽与按原生分组选择的两个背景。

每个菜单保留真实槽位索引、物品原命名空间、数量、显示名、SNBT、取出权限及光标物品。Curios/Domum 额外状态只有匹配本人 UUID、窗口和 stateId、且 5 秒内观测时才附加；旧状态或其他账号不能覆盖当前窗口。GUI 资产须通过原 JAR、PNG 哈希和资源优先级校验，修改后的原图不能冒充已经适配的安装版本。

未适配窗口可显示服务端给出的真实槽位坐标，但明确标为诊断视图。没有坐标时只展示标明缺口的槽位列表，不把 9 列网格称为原模组布局。未知物品模型/角色模型报告 unavailable；不使用替代图标或人物。已知原生角色模型拒绝会显示明确原因，而非无限载入。

窗口只读，网页关闭按钮只隐藏网页窗口，不能冒充游戏已经关闭。Agent 通过本人原生 `menu.click`、`menu.close`、`domum.select` 等操作；状态变化和私有回执驱动网页更新。回执 ok 只能证明该接口报告成功，未包含效果证明时不得解释为已经命中、完成生产或造出物品。

当前缺口：Curios 按钮/配方书，Domum 分组和款式按钮图标/滚动位置，其他模组专用非槽位窗口；完整角色装备/动画/场景一致性未验收。Domum 本次仅完成源码移植与测试，不能写成 Neko 实机已验证。

2026-10-08 实测：普通账号 MawNeko 由 mc-agent-neko + 线上 qwen3.7-plus 执行指南书 37 槽→光标→9 槽，原生 state 1→3→5，完整 SNBT 相同。重新登录后网页仍显示 9 槽，Ars 魔力 100/100 来自本人实时回执。未接 QwenPaw，未重启既有游戏服务。原始包/截图等私有证据不放入 Git。

资源/窗口/模型相关 88 项测试使用真实导出资产通过。运行：

```powershell
$env:NATIVE_GUIDE_ASSET_DIR='E:\QiandengJiSocietyLab\assets\native-20261008-v14-mod-operations'
$env:NATIVE_YSM_ASSET_DIR=$env:NATIVE_GUIDE_ASSET_DIR
node --test tools/test/native-ui-adapter.test.mjs tools/test/native-world-preview-host.test.mjs tools/test/inventory-player-preview.test.mjs tools/test/native-player-ysm.test.mjs tools/test/native-scene.test.mjs
```
