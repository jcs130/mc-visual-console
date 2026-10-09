# Touhou Little Maid 魂符图标

2026-10-09：初始化魂符与已收纳女仆魂符现在显示原模组动画图标。读取同一玩家的完整 ItemStack，分别绑定 `smart_slab_init`、`smart_slab_has_maid` 原模型；两份模型本来就使用同一张 `smart_slab_has_maid.png`，不是借用其他状态的图片。空魂符继续走既有 EMPTY 静态图标。

原 PNG 为 16×112，共七帧；原 `.mcmeta` 指定 frametime=2，无插值，20 次纹理 tick/秒，因此每帧 100ms、每轮 700ms。网页保留原 PNG 字节，以 32×32 裁剪窗口和 steps(7,end) 显示；同一缓存共用时钟起点，背包与快捷栏重绘不会各自从第一帧重启。网页与另一个 Java 客户端的动画起始相位未验。

INIT 的 `touhou_little_maid:init_maid_owner` 和 HAS_MAID 的 `touhou_little_maid:maid_info` 在锁定原类中用于归属、收纳和 tooltip，不参与物品图标模型选择。允许这些组件且保留完整 SNBT 作为缓存键，不读取其他玩家状态。未知视觉组件、错误物品 ID/数量、资源覆盖、JAR 或文件哈希不符仍拒绝；不调用女仆、消费魂符或改写玩家物品。

## 附魔光效边界

`ItemSmartSlab.isFoil()` 对 INIT/HAS_MAID 返回 true，EMPTY 为 false；显式 `minecraft:enchantment_glint_override=false` 仍按原 ItemStack 覆盖规则处理。当前已恢复原动画图标，**默认魂符的附魔光效仍未实现**。图标状态为 `partial`，悬停明确说明，缺口代码为 `NATIVE_GUI_GLINT_ATLAS_UV_UNAVAILABLE`，不能标成完整 Java 像素一致。

锁定 1.21.1 的 ItemRenderer 将原 BakedQuad 图集 UV 同时传给 glint consumer；RenderStateShard 使用 `translation(-t%110000/110000,t%30000/30000)·rotationZ(0.17453292)·scale(8)`，t 受原选项控制。glint blend 为 RGB `SRC_COLOR,ONE`、alpha `ZERO,ONE`。只用原 glint PNG 加上人为归一化 UV 或 CSS 渐变不能复现这个输入。后续须取得匹配客户端的原 sprite atlas placement/实际选项后移植；当前未给玩家关闭原附魔光效，也不使用假光效填补。

## 来源与验收

- Touhou Little Maid 1.5.3 JAR SHA256：`f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27`。
- INIT 模型：`98fbbd27ed26a48d8187dd5c474404704def39aa8252828a43ca940a567ed368`；HAS_MAID 模型：`87ec385a98e04a57c37eb3042770a93e813acc80494f45121484b353c0a4d4de`。
- 动画 PNG：`e1f986ff701bdc2fa57916e3cdfd0ce17ad66e7069e3580ff9b1ca6a88344cbd`，882 字节；mcmeta：`37ca1f757a42143edbc722b8933dc7ccb1b797ee3eaa4278783583d79858937d`，39 字节。
- 原类审计：ItemSmartSlab、AbstractStoreMaidItem、InitDataComponent，以及锁定 client.jar 的 ItemRenderer/RenderStateShard/RenderType。原类、JAR、PNG、包、截图与备份在仓库外 `research/soul-slab-icons-20261009`。

157 项相关 Node 原资产测试通过，0 skip；覆盖两种原模型、真实文件哈希、组件隔离、动画 tick/循环/重绘、缓存释放、原有图标和 UI。普通非 OP mc-agent-neko 身体实机，0 模型调用；浏览器同时看到背包和快捷栏魂符，原图尺寸/裁剪/700ms steps/同步 transform 已读回，错误日志为空。此为图标适配，不是手持模型、女仆完整玩法或完整 Java 渲染验收。
