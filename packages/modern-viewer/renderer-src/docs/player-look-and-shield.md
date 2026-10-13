# 玩家视线与 YSM 盾牌

普通玩家绑定动作控制器时，网络层可能已设置首次俯仰角。该角度不能再保存为头骨的静止姿势，否则之后每次视线更新都会叠加永久偏移。Minecraft 玩家适配器保留骨骼位置，头骨静止旋转使用原模型的零值；当前视线仍由实际网络采样驱动。其他类型的模型适配器不受此修订影响。

YSM 的主手和副手均使用实际装备槽与原模型 HandLocator。原版盾牌的 `builtin/entity` 不能按普通 item JSON 的 elements 烘焙。本实现移植 Minecraft 1.20.6 `ShieldModel` 的 plate、handle、64×64 UV，以及 `ItemRenderer` 居中和 `BlockEntityWithoutLevelRenderer` 的 Y/Z 翻转，保留左右手各自的原始 display 变换。

依据：Mojang 官方 1.20.6 客户端 SHA-256 `02dfd345ac1ad55692d5dbc8486ac7e4fea72cd54ac494a79cd48963048e56b2`，官方映射 `ShieldModel=fvt`、`ItemRenderer=gjx`、`BlockEntityWithoutLevelRenderer=gdd`。使用版本化资产包中的原始 `entity/shield_base_nopattern.png`，不新增近似素材。

范围：普通盾牌几何、原图和手部挂载。旗帜图案/自定义模型仍明确拒绝；附魔盾牌的基础模型可显示，原版 glint 尚未实现，保留 effectReason。阻挡时完整 Java 动作和 Java 客户端像素一致性尚未核验，`completeEntityParityVerified` 保持 false。

回归验证包括首次低头后恢复平视、后续俯仰、左右手原始矩阵与 UV、装备清空/换手、释放资源和不支持外观的显式失败。网页部署需重新构建版本匹配的资源并核验实际画面。

YSM HandLocator 与原版手部使用不同朝向基。盾牌在原握柄中心再绕 Y 轴转半周：保持握点不动，使盾面朝身体外侧。测试分别核对左右手及四个角色朝向的盾面/握柄关系；这是手部坐标适配，不能据矩阵测试宣称已经完成 Java 客户端像素对照。
