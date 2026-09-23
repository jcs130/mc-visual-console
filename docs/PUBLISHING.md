# 发布形态与待决事项

## 三块东西，三种命

| 块 | 是什么 | 能否发布 | 说明 |
|---|---|---|---|
| **组件**（本仓根包 `mc-visual-console`） | 接缝协议与实现（`src/`）+ 自绘 2.5D 操作台（`client/`，含那个客户端页）+ 假 bot 与测试 | **可以**（但有素材版权问题，见上） ✓ | 组件代码本身不 import mineflayer；**注意 `client/assets/blocks/` 那 46 张贴图来自游戏文件** —— 最干净的那一块。发布前需 `pnpm build:client` 并把构建产物 `client/app.js` 纳入 `files` |
| **画面层**（`packages/modern-viewer`） | 引擎 + 1.21.1 资产 + 桥接 + 点地走/轨迹注入 | **待拍板** ⏳ | 引擎与资产是**千灯纪自有项目**的派生资源（`D:\Projects\QiandengJi\vendor\modern-viewer`）⇒ 随包分发要项目所有者决定。`private: true` 现在是**故意的**，防误发 |
| **webplay**（`hosts/webplay`） | `prismarine-web-client` 的薄封装 | 不涉及 ✓ | 上游 MIT，引用即可；我们只提供"怎么装、怎么起"，不重发上游代码 |

## 两块可发布件的现状

**组件**（`mc-visual-console`）

```bash
corepack pnpm install && corepack pnpm build:client
corepack pnpm test          # 20/20
corepack pnpm dev:demo      # 自检：假 bot 演示
```

- 自包含 ✓（不 import mineflayer，只认 `ViewerBot` 形状）
- 缺的最后一步（发布前做）：根 `package.json` 加 `files` / `exports` / `prepublishOnly: build:client`

**画面层**（`mc-modern-viewer`）

```bash
cd packages/modern-viewer
npm run import-assets -- <千灯纪/vendor/modern-viewer 目录>   # 自备派生资源（不入库）
npm run patch-avatar                                          # 可选：官方角色
npm start                                                     # 独立启动器：自连 bot 并起画面
```

- 已能从宿主独立起（`bin/mc-modern-viewer.mjs`）✓
- 发布前须做：`private` → `false`、并按需把 `assets/` 里的派生资源纳入分发范围（**这一条要你拍板**）

## 我不会替你做的那一步

`npm publish` 是对外且基本撤不回来 —— 而且画面层还牵涉**你自有项目的派生资源** ⇒ **由你开口**。

确认后的命令（两条）：

```bash
# ① 组件（最干净的那块）
cd <repo> && npm publish --access public            # 建议先 npm pack --dry-run 看清单

# ② 画面层（需先把 package.json 的 private 改成 false）
cd <repo>/packages/modern-viewer && npm publish --access public
```

## 发布前建议的自检

```bash
npm pack --dry-run        # 看会打进包里什么（画面层要看 assets/ 有没有被带进去）
corepack pnpm test        # 组件：20/20
```
