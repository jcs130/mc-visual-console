# 快捷栏对齐与自定义头颅物品

2026-10-13，基于 `f579863e` 的可选材质包修复继续开发。此页说明源码接入；远端宿主更新并重建以前，旧页面不会自动改变。

## 原因与修复

- 原生 182×22 快捷栏以 2 倍显示。第 n 个物品从 `(6+40n,6)` 开始，48×46 选中框从 `(-2+40n,-2)` 开始。此前两者向右偏了 6 px，图标又向下偏了 1 px。新布局共用原版格距，OBS 的整体移动、缩放不改变内部对齐。
- 旧宿主可能省略 `inWater`。把 `undefined` 当成 `classList.toggle` 的开关会每次反转水下布局，却仍预留陆地高度，导致心形/饥饿图标溢到经验条后面。现在只接受明确 `true`；省略、退出水下和重复更新都保持正确行数。浏览器覆盖普通、多排血量/吸收生命、护甲、水下及离水状态，在 1×/1.5× 下验证经验条和等级文字不覆盖状态图标。
- Minepacks 的大背包本来就是带自定义名称和 `minecraft:profile` 的 `player_head`。修改基础物品类型会损坏原插件语义。旧宿主只保留四层数据，截断了 `profile.properties`；旧 UI 又要求另外提供 `headTextureHash`，缺失时显示 Steve 图标。
- `item-profile.js` 同时读取原始 1.20.6 components、组件对象表和旧 NBT，保留原名称及纹理哈希。宿主保留必要嵌套，并限制每个物品的节点数和文本预算；截断时明确 `visualDataUnavailable`。
- `viewer-head-textures.mjs` 在原 HTTP 服务上代理当前连接实际观察到的 Mojang 纹理，固定 HTTPS 域名、拒绝重定向、限制 PNG 尺寸、请求并发、缓存容量和失败重试频率。不开新端口，不允许上传 URL 触发任意下载。
- 快捷栏、个人背包、容器、交易菜单、副手、钓获提示、第一人称、原版人物手持、YSM 手持和掉落物共用原 profile；图标用完整的双层头颅几何及原纹理生成。加载中/失败显示原名称与不可用状态，绝不回退成 Steve。换槽、换物品、旧请求迟到不能覆盖新物品。
- 女神相机也复用该代理。无 UI 照片等待画面中自定义头颅贴图完成；不可用时不把缺失贴图的画面当成成功照片。

## 消费端更新

1. 更新 `mc-visual-console/main`，同时更新宿主 `src/mc-modern-viewer.mts` 及 `renderer-src/host`，不能只拷贝浏览器 JS。
2. 对现有 **1.20.6** 原资产目录，以原 preset 重建：

   ```powershell
   node packages/modern-viewer/renderer-src/tools/build-minecraft-viewer-client.mjs packages/modern-viewer/renderer-src <现有资产目录> --preset=qiandengji
   ```

3. 重启消费该目录的 Web 宿主，再刷新浏览器/OBS 浏览器源。使用独立宿主的开发者需在原静态资源路由中调用 `createViewerHeadTextures().serve(req,res,pathname,bot)`，传入实际观战连接；使用 `serializeViewerItem` 或保留完整组件。由自己的静态服务器返回原纹理也可以。
4. 打开真实大背包，检查悬停名称为「大背包」、图标为原蓝色包、无 `/icons/player_head.png` 回退。`itemHeadDiagnostics()` 可查当前 GPU 物品的加载/不可用数量。

## 验证边界

隔离 Paper 使用真实 Minepacks 物品、共享宿主序列化、实际 HTTP 代理及 Chromium WebGL 验证；包括九格选择、背包窗口、OBS、手持和无 UI 照片。单元测试覆盖旧 NBT、组件嵌套、错误 profile、请求去重、限额、加载后换物品和照片就绪门禁。原型几何来自固定的 1.20.6 `template_skull` 及玩家头颅 UV；动态 PNG 原字节不入 Git。源资产一致和浏览器截图不等于 Java/手机逐像素一致；独立 1.21.1 原生模组后端不在本次部署范围内。
