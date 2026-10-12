# 千灯纪特色装备原创资源

原生 Minecraft 1.20.6，资源包版本 1.0.0，五件模型。由 `jcs130/minecraft-ai-friend` 的 `paper/item-appearances/catalog.json`、原创 `models/*.json` 与 `build.py` 生成。没有从第三方模型站复制素材。

- 源目录规范化摘要：`eebfa4a2c424d6a28b65605dd040c825cb88df54c6449677a1c4add9f0f4493d`。
- `manifest.json` SHA256：`6885cac28712ad6a56c65f2d134d5b4e4d460e6be32233b04a02bf9dc833adc4`。
- 清单为每份模型、纹理、图标记录原始字节数与 SHA256；读取时全部验证。
- 长方体使用 Java 原生模型布局；32×32 PNG 是原创调色板，128×128 PNG 是同一长方体的图标投影。基岩与 Java 的几何和贴图来自同一源。
- 构建器使用 Mojang 1.20.6 客户端中原铁剑／烈焰棒／弩基础配置维持 Java 回退规则。此目录仅包含五件原创外观，没有客户端 JAR 或基础模型副本。客户端来源与摘要记录在服务端构建说明。

只读原始 `custom_model_data` 和基础材质决定模型，不按展示名称猜测，不替换游戏注册表。缺包／坏摘要／未知保留编号会返回明确诊断。原 Java／手机／Xbox 的最终像素和完整效果等价尚未验收；Web 实际模型、持物挥动、OBS、照片已通过浏览器检查，三维附魔流光及机械弩自定义拉弦变体尚未实现。

安装与消费端重建见 [`renderer-src/docs/item-appearances.md`](../../renderer-src/docs/item-appearances.md)。普通1.21.1查看器继续使用自己的资源集，不能安装本包冒充版本兼容。
