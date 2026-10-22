# Twilight Forest 1.21.1 原生物品状态

适配固定的 `twilightforest-1.21.1-4.8.3345-universal.jar`，原 SHA256 为
`493da16d10210f9f53a3c33b3d8fcb4ae9b14016ee420d753c894562bd9aba35`。
宿主只在已校验的原始素材 manifest 中找到这份确切 JAR 时开启组件适配。
不改变原版连接、物品 ID、数量或游戏动作，也不适用于任意 Twilight 版本。

服务端兼容网关按该 JAR 的 `TFDataComponents`、被引用的 `STREAM_CODEC` 与
原生注册表解析 47 种组件。网页宿主把其中 43 种转换回原 `ItemStack` 持久组件格式：
单位标记、整型/浮点型、UUID、完整 64 位冷却、原始 NBT、药水壶、头颅蜡烛及探矿数据。
药水壶字段为 `potion/doses/breakage/breakable`，不能把剂量误称容量。
药水名称来自本连接的原生注册表；探矿数据保留绝对区块坐标和完整 64 位标识。

`ore_filter`、`stored_broken_attributes`、`magic_painting_variant`、`item_display`
还需要额外注册表或递归格式适配，保持明确不可用，不能按原版 ID 猜值或丢弃组件。
也不把本批组件支持当成 Boss、魔法画、特殊地图或所有手持/实体渲染完成。

四项新增测试覆盖开启/关闭、真实字段、非原版药水编号、跨 32 位数据、组件移除和
未知类型拒绝；共享全套 1210 通过、32 条件跳过。正式消费端仍须冻结当前代码，
使用完全相同模组集合导出的注册表、原始素材与碰撞数据，再验证实际连接和 WebGL。
没有原始 TF 素材或动态状态时不得用普通原版模型替代。

来源：[官方固定版本](https://www.curseforge.com/minecraft/mc-mods/the-twilight-forest/files/7797302)。
JAR、生成资源、原始包、玩家库存与私有联机记录留在 Git 外。
