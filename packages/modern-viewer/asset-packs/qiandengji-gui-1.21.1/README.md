# 千灯纪 Java 1.21.1 专用物品 GUI 目录

本目录解决原生网页中大背包、法杖和其他四件特色装备只显示文字的问题。
选择必须匹配本人连接实际收到的完整物品组件：基础 ID + 原 `custom_model_data`，
或 `player_head` 的原 `minecraft:profile` 纹理 SHA。名称不会选择贴图。

- 五份特色装备 GUI PNG 逐字节复用已收录的原创
  `qiandengji-items-1.20.6/icons/`，每份 SHA 和来源清单摘要见 `catalog.json`。
  这里验证的是 PNG 图标在 1.21.1 GUI 的读取，未把旧版 Java 模型当成已移植的手持模型。
- 大背包使用物品实际 profile 指向的 Mojang 原 64×64 PNG。
  原始 PNG 内容 SHA 与 texture URL hash 都是
  `8dcc6eb40f3bada41e4339888d6d207437598bdbd175c2e731191d5a9a42d3c8`。
  GUI 复用原 Java 1.21.1 头颅/帽层几何、UV 与 SkullBlockRenderer 变换。
- 此目录是单独、显式且必须校验 SHA 的服务端物品 GUI 扩展；不修改原版注册表，
  不替换模组物品，也不默认装进其他服务器的资源集。

宿主将 `catalog.json` 与其 SHA 传给 `serverItemCatalogFile` /
`serverItemCatalogSha256`。只有目录通过验证，宿主才自动把同一目录 ID 放入本人
presentation；不得另设一个可能漏填或串包的激活 ID。浏览器再校验目录和 PNG，
并按每件物品实际组件匹配图标。未知纹理或编号保持明确不可用。

本目录不证明完整手持动画、附魔效果或 Java 像素一致。网页验收必须检查实际
快捷栏和本人背包中的 `<img>` 已成功解码，不能以物品名称、HTTP200 或占位文字通过。
