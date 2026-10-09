# 原生物品图标与中文显示

2026-10-09 后续：[魂符原动画图标](native-soul-slab-icons.md)已接通 INIT/HAS_MAID，原七帧/100ms、同缓存相位；默认附魔光效因原图集 UV 未取得仍明确 partial。当前相关测试为157项；以下148项为此前汉化/Domum增量记录。

2026-10-09：网页翻译同一玩家原始 `displayNameComponent`，保留 `translate`、`with`、`extra`；原 `displayName`、`descriptionId`、物品 ID 和完整 SNBT 不变。文字使用 DOM textContent，不执行点击、选择器或 NBT 内容。自定义命名优先，未知组件/翻译保留服务端名称，不按英文名称做字符串替换。

`NativeLanguage` 从校验过的原始 `assets/<namespace>/lang/en_us.json`、`zh_cn.json` 读取词条。中文优先；同语言同键冲突不按 namespace 排序猜优先级。Domum 常用分组和材质格式补有界的 viewer 中文覆盖表。原工作台、箱子、炉、烹饪锅、饰品栏、建筑切割台提供中文界面名；未知模组窗口及缺失翻译仍保留原类型/原文。

Minecraft 1.21.1 中文不在 client.jar 内。导出器支持三个同时提供的参数：

```
--minecraft-version-json <官方1.21.1版本JSON>
--asset-index <原始17.json>
--asset-objects-dir <以SHA1命名的对象目录>
```

导出核对 version 的 client SHA1、assetIndex SHA1/字节数及语言对象 SHA1/字节数。中文未经编辑：对象 SHA1 `f87510f4509890eaf176e0de1430f6bb326a6800`，555146 字节，SHA256 `10da480179ef720771e27aebec6f33a6d4cec5063401310ceb82bb576a6b7af0`。index 17 SHA1 为 `9b16298b1dc0697878cec88bb2d96168f5239e4f`。官方输入：[asset index](https://piston-meta.mojang.com/v1/packages/9b16298b1dc0697878cec88bb2d96168f5239e4f/17.json)、[中文对象](https://resources.download.minecraft.net/f8/f87510f4509890eaf176e0de1430f6bb326a6800)。这些资源和 JAR 保持在 Git 外。

## 图标范围

在既有图标基础上，新增七种 Domum 默认模型：栅栏、木框架、屋瓦、圆柱、框架隔板、灯饰、浅色砖；以及四种门、十五种活板门。读取实际材质和类型，沿原 loader/parent/ordinal 选择模型。原顶点、UV、铁铰链等未被重贴的 sprite 保留。GUI 相机变换来自外层 baked parent，translation 按原 ItemTransform 除以 16；嵌套 materially_textured wrapper 的 display 不会误覆盖 parent。

Domum 材料只支持已审计的不透明、无 tint、所有候选面为同一 sprite 的原方块。随机/透明/染色材质、未知属性/loader、未移植动画和 glint 仍明确 unavailable。魂符 INIT/HAS_MAID 动画现已按上文接入，附魔光效仍未实现，不借 EMPTY 图标替代。第一页十个 Cutter 分组图标已支持，不代表所有后续款式或整个模组已完成。

## 两个已审计的覆盖

Domum 原 JAR 覆盖 `minecraft/textures/block/oak_planks.png`、`dark_oak_planks.png`。默认 1.21.1 / NeoForge 21.1.248 中，vanilla 在 BOTTOM，mod_resources 在 TOP 且 children 随后展开，FallbackResourceManager 倒序查找。导出器只对锁定的两个路径、variant 哈希和三份来源 SHA 写入 `priorityResolution=neoforge-21.1.248-mods-above-vanilla`；reader 独立复核。用户资源包、其他模组覆盖和 atlas 合并不适用此规则。

| 审计 class | SHA256 |
| --- | --- |
| ClientPackSource / grc | `e5f833a22b1f144291f64472cb74ec057793920fc96b8b3b21efd90aaa390d41` |
| FallbackResourceManager / atv | `cb84739e30214079af9e1f511fb0857e33c80b5080afca45ab94923613f3c16a` |
| NeoForge ResourcePackLoader | `89f699b517eb79e76d48eb7387b31939b38938ac70d68b0764f8db8b0f83ac3b` |
| Domum DoorType | `90824af5965f14c695dfd254b31b753ba3f158e8d0ddd5ae12854cc5a9114a2d` |
| Domum TrapdoorType | `8b1ed227e7a2df70e9d4164d8273fda6cec3797fef559906972efb5915934fa1` |

其他 9 项资源覆盖仍未解决，完整场景 `resourcePriorityVerified`、`renderParityVerified`、`complete` 仍为 false。148 项相关 Node 测试使用当前原资产通过，0 skip；另有语言导出哈希拒绝测试及锁定 Java 编译/API 审计。完整 Java 客户端像素对照尚未完成。
