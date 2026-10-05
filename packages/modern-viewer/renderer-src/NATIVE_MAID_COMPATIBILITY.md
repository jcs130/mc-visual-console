# Touhou Little Maid 原始模型与同玩家状态

当前提供器仅适配 NeoForge 1.21.1、Touhou Little Maid 1.5.3 的实际变体 `touhou_little_maid:hakurei_reimu_type_b_1720614ea46709023787aae005df1134`。模型 ID 尾部摘要区分原变体，不得删除或将它替换为通用女仆。来源 JAR SHA-256 为 `f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27`。

`native-entity-dispatch-maid.js` 从原 pack 的 `maid_model.json`、`hakurei_reimu_type_b.json` 和 `hakurei_reimu_vengeful.png` 构建模型。模型包含 73 个骨骼、63 个原 cube，其中 28 个为零厚度面；`native-entity-model-bedrock.js` 保留原骨骼父子、pivot、inflate、镜像、UV、旋转和原面。每件资源核验 SHA，未知变体和错误优先级明确拒绝，不画原版实体替身。

实体身份、位置、元数据和装备来自行动玩家同一连接的实际原生实体包；服务器 `PlayerWorldBridge` 仅补充该玩家已跟踪、同维度、有视线的女仆状态。补充行携带请求玩家 UUID、实体 ID/UUID、维度、实际背包类型、背部/旗帜物品、乘骑、游泳量及流体状态。宿主组装 presentation 后，在当前实体 ID/UUID、维度和 epoch 均匹配时合并；补充行不能创建实体，也不能将其他玩家或旧实体状态注入画面。

本阶段移植原 Java 有序动画中的有限 idle、walk、head、beg、blink 和 sit 公式。使用实际网络运动和 50 ms tick，元数据缺省值来自锁定版本的 `defineSynchedData`，不是零值猜测。`hurt_animation` 使用 1.21.1 的实际受伤包；TLM 专用 `maid_animation` 仅解码原频道的两个 VarInt，其他自定义负载继续拒绝。

装备、背包/背部物品/旗帜层非空、YSM、未支持的变体、游泳/乘骑、使用物品、死亡、火焰/描边和复杂特殊动作保持显式缺口。受伤 overlay 尚未移植，实际受伤期间拒绝；挥击恢复所需的完整属性/效果未透传，不能猜测固定时长。有限模型与公式回归通过不等于完整动画、光照、声音或 Java 像素一致，`renderParityVerified`、`completeSceneParityVerified`、`complete` 保持 false。

真实浏览器验收应记录来源 manifest、同玩家 UUID/epoch、实体实际模型 ID、原始 PNG/模型加载结果和截图，再与匹配 Java 客户端场景对照。测试夹具或离线资源可读不能替代实服画面；未知状态拒绝也不得计为渲染成功。

2026-10-05 实服浏览器已看到同一个 MawExplorer 连接附近的该变体：实体 UUID `0e84aac1-b22a-4c51-b155-09c08f4f4694`、当前实体 ID 10、epoch 1，补充行确认空背包、无背部物品、未乘骑/游泳。只读诊断页转动相机后可见原女仆模型和红蓝贴图；没有新增游戏连接或管理动作。截图私存 `research/native-maid-live-20261005.png`。本次重载浏览器无 warn/error。该证据覆盖当前有限状态的实际可见结果，未进行匹配 Java 像素对照。
