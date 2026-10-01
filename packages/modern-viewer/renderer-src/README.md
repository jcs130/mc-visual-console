# Minecraft 现代画面渲染器源码

`src/modern-viewer/` 是现代网页画面的浏览器源码。Cortico 的 1.20.6 构建脚本以本目录为
`<modern-viewer-source-dir>`，将原始客户端 JAR 导出的模型和贴图接入渲染器，再生成浏览器包。

本目录只保存源码和依赖版本。Minecraft 贴图、JAR、角色模型，以及 npm 包生成的 worker
和渲染器 bundle 均由使用者在本机生成，不进入 Git。

在本目录运行 `npm install` 后，从 Cortico 仓库根目录执行：

```powershell
python scripts/export-minecraft-viewer-assets.py <1.20.6-client.jar> <output-dir>
node scripts/build-minecraft-viewer-client.mjs <此目录> <output-dir>
node scripts/verify-minecraft-viewer-assets.mjs <1.20.6-client.jar> <output-dir>
```

`player-skins.js` 中的私有项目皮肤导入会由 Cortico 构建脚本替换为从同一客户端 JAR
导出的原版皮肤。独立使用该源码时，需要自己提供这些皮肤或作相同替换。
