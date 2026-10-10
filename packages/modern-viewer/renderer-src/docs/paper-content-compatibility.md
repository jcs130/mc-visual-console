# Paper 插件内容接入 Web 画面（1.20.6）

2026-10-09：新增同一 Mineflayer 行动连接的粒子、地图像素与地图展示框桥接，以及对应浏览器渲染。适用 Java **1.20.6 / protocol 766**；不把它用于 1.21.1 原生模组实验。远端局域网电脑尚未更新，本地验收不代表远端页面已经生效。

## 本轮范围

| 内容 | Web 接入与验收范围 |
| --- | --- |
| AgentFriend 技能特效 | 读取原始 `world_particles`，保留服务器给出的坐标、零速度、dust 颜色/大小和渐变终色。导出 12 类原版 sprite；实际技能 starlight 的渐变包与浏览器可见粒子已验。没有逐一验收全部技能。 |
| ImageFrame 截图照片 | 原始 `map` 像素、实际物品 `map_id`、普通/发光展示框、六个朝向、地图四分之一圈旋转、手持预览。实际截图经插件 upload 导入，两张地图组成的照片墙和本人手持预览已在浏览器看到。 |
| 普通地图、藏宝图、遗迹地图 | 复用相同的服务器像素。地图标记元数据已保留，**标记图层尚未绘制**，手持界面会提示；不能把它称为完整寻宝导航。 |
| Citizens、FancyNpcs、NamedVillagers、NPCSpeak、Shopkeepers | 继续使用原版实体、玩家皮肤、名称、聊天和交易窗口合约。宿主仍须转发实体 metadata、装备、皮肤和窗口变化。本轮没有逐个插件进行剧情/交易实测。 |
| Minepacks、公会箱、任务和技能菜单 | 继续转发本人真实窗口、槽位、完整物品组件、聊天和 `skillsState`；不会从插件名推测物品内容或技能资格。 |
| MythicMobs、WorldEvents、MagicSpells、AuraSkills、BetonQuest、ConditionalEvents、Denizen | 原版实体/已支持粒子/声音/文字可走现有合约。插件脚本引入的其他粒子、特殊展示实体、资源包模型与非槽位界面须另行适配；安装插件本身不保证其全部效果可视化。 |
| 文字气泡、探矿轮廓、方块展示实体 | 2026-10-10 补齐玩家/NPC TextDisplay 气泡，见[接入与更新说明](text-display-bubbles.md)。其他 TextDisplay 格式、BlockDisplay 与原版发光描边尚未完整实现；已有粒子引导可用。 |
| Geyser、Floodgate、ViaVersion、ViaBackwards | 属于服务端连接适配。此 Web 桥读取 Mineflayer 自己的 Java 1.20.6 包流，不能据此推断所有基岩版版本或控制台功能均已验收。 |

图片严格来自该玩家实际收到的 128×128 原版调色板像素。ImageFrame 的虚拟地图编号可能不同于插件内部编号，必须使用 `map_id`；浏览器不重新访问上传链接，也不读取他人的照片。原图会经过原版地图调色板量化，不能期待完整 RGB 照片画质。未收到的像素保持透明/等待，不补造内容。

粒子使用匹配客户端的原始 PNG 与定义，服务器编排的形状坐标得以保留。当前浏览器采用有界的 1 秒显示、简单速度推进和颜色插值，尚未移植每种原版粒子的 provider、完整物理、寿命、随机种子与帧动画。`nativeParticlePhysicsParityVerified=false`；照片也未完成 Java 客户端逐像素对照，`javaFramePixelParityVerified=false`。

## 远端宿主接入

桥接代码位于 [host/viewer-content.mjs](../host/viewer-content.mjs)。在创建行动 bot 后尽早挂接，每个 bot 只创建一次；浏览器连接只订阅，不创建额外游戏账号。以下代码应合入现有宿主的创建与关闭流程：

```js
import { createViewerContentBridge } from './renderer-src/host/viewer-content.mjs';

const bot = mineflayer.createBot({ ...existingOptions, version: '1.20.6' });
const content = createViewerContentBridge(bot);

function connectViewer(socket) {
  socket.emit('version', '1.20.6');
  const stopContent = content.subscribeSocket(socket);
  // 原有区块、实体、本人背包、窗口、技能等数据流继续发送。
  // 同时保留 entityGone -> entityStream.remove，避免展示框实体残留。
  socket.once('disconnect', stopContent);
}
firstPersonIo.on('connection', connectViewer);
thirdPersonIo.on('connection', connectViewer);
bot.once('end', () => content.dispose());
// 宿主主动关闭时也调用 content.dispose()。
```

新桥直接监听 `bot._client` 的原始包，不修改 Mineflayer 的协议定义或写包方法，不调用聊天、移动、模型或施法。不要同时把 Mineflayer 的派生 `particle` 事件再次转发到旧 `viewerEffect`，否则会重复显示。内置旧宿主 `src/mc-modern-viewer.mts` 已有条件接入；其他远端宿主必须合入上述桥，单独更换网页 bundle 不够。

地图像素在行动连接到浏览器连接前缓存。若等到登录很久后才创建桥，已经错过的地图包不能从 Mineflayer 的实体缓存复原；重新手持地图或靠近照片墙，让服务器重新发送。已有展示框则可从 Mineflayer 的确切原版朝向与 metadata 缓存引导加载。

### Socket.IO 增量事件

事件均带 `schemaVersion: 1` 与非负 `epoch`；切换维度/重生递增 epoch，清空旧缓存。浏览器忽略旧 epoch，不重播过去的粒子。新增 `textDisplay` 共用这个重置和同连接受众边界。

| 事件 | 主要字段 |
| --- | --- |
| `contentReset` | `{ schemaVersion, epoch }` |
| `particleBatch` | `{ schemaVersion, epoch, atMs, events: [{ kind:'particle', name, position, spread, count, speed, exact, color?, colorEnd?, size? }] }` |
| `mapPixels` | `{ schemaVersion, epoch, mapId, scale, locked, icons?, columns, rows?, x?, y?, data? }`；重连快照另外含 `snapshot:true, coverage` |
| `mapFrame` | `{ schemaVersion, epoch, id, uuid?, name, position, normal, rotation, mapId, invisible }`；移除为 `{ schemaVersion, epoch, id, delete:true }` |
| `textDisplay` | 实际文字显示实体的 ID、位置、文字 runs、样式和静态变换；字段与限制见[气泡说明](text-display-bubbles.md#增量事件与预算) |

`data` 是原版调色板字节，大小为 columns×rows；columns=0 只更新元数据。Socket.IO 浏览器端二进制可能是 ArrayBuffer，已支持。快照是 16384 字节像素加 2048 字节覆盖位图；只有覆盖位为 1 的像素才是实际收到的内容。`position` 为原版展示框中心，桥已处理出生包的整数 TilePos 与后续 teleport 中心坐标的差异，宿主不得再加一次半格。

1.20.6 的部分 minecraft-data 版本把 `dust_color_transition` 七个 float 的第四项误标为 scale。新桥检查实际字段布局，并按原生顺序 fromRGB → toRGB → scale 解释；兼容已经修正的布局，未知布局明确拒绝，避免错误颜色/大小进入画面。

### 有界资源和慢浏览器

每个行动连接缓存最多 64 张地图、128 个展示框，每 50ms 最多发送 64 个粒子事件，只取玩家 80 格内粒子。浏览器最多 2048 个活粒子、32 个照片框实例，共享每张地图的 GPU 纹理。缓存满会丢弃/淘汰内容，这些上限不是全世界照片档案。

`subscribeSocket` 在 Socket.IO transport 堵塞时丢弃粒子，仅按有限 map/frame ID 合并最新状态；恢复后每轮最多补发 4 个最新快照。不要改用无界广播队列。慢浏览器不会积压过期技能演出，也不会反压 Agent 的行动逻辑。这里只验证了该模块的限流与慢连接行为，**没有进行 16 个 LLM Agent 的联合压力测试**。

## 构建匹配的网页资源

共享的 `java-1.20.6` 素材包已包含本轮的地图调色板、展示框模型、粒子 atlas 和原版纹理，每个文件记录 SHA-256。通常在仓库根目录直接准备即可，无需重新下载或导出 JAR：

```powershell
npm ci --prefix packages/modern-viewer/renderer-src
node tools/prepare-viewer-assets.mjs java-1.20.6 "<output-dir>" --preset=qiandengji
```

命令校验并复制素材，再构建当前源码，生成 `viewer-assets.json` 与 `viewer-client.json`。后者的 `viewerContent` 应声明地图像素、展示框和服务器粒子能力；完整物理和像素一致性验收仍为 false。

需要独立重新导出时，在现有 [独立构建](../README.md#独立构建) 导出原版方块/物品资源后增加以下步骤。需要 Python 的 Pillow（现有 tools/requirements.txt）、Java 21 的 `javap`，以及与客户端 JAR 同版本的 Mojang client mappings。客户端 JAR、生成的网页 bundle 与私人验收数据保持 Git 外。

```powershell
cd packages/modern-viewer/renderer-src
python tools/export-minecraft-viewer-content.py "<1.20.6-client.jar>" "<1.20.6-client-mappings.txt>" "<output-dir>" --javap "<java-21-bin/javap.exe>"
node tools/build-minecraft-viewer-client.mjs . "<output-dir>" --preset=qiandengji
node tools/verify-minecraft-viewer-assets.mjs "<1.20.6-client.jar>" "<output-dir>"
```

导出器读取原版 62 种 MapColor、展示框原模型与 PNG、12 类粒子定义/原 sprite。仅打包粒子 atlas，不重绘或缩放原 sprite。两个 squid 资源别名保留原 PNG，修复依赖模型请求旧扁平路径导致的贴图解码错误。构建会检查相同 JAR 身份、资源哈希、atlas 和模型可用性。

同步整个生成目录，包括 `dist/`、`public/`、`viewer-client.json`，并更新宿主桥。HTTP 继续按 README 的同源静态路由提供资源，新增 `/viewer-content.json`、`/particle-content.png` 和对应原版纹理。旧网页资源缺少内容包时，会显示明确的更新提示；更新后刷新网页。不需要为这部分适配重启 Minecraft 服务端，也不要求修改 Agent 决策客户端。

## 本地验收记录

隔离 Paper 1.20.6 / AgentFriend 0.4.5 / ImageFrame 2026.1.5.0，独立非 OP Mineflayer QA 行动连接，0 模型调用；没有把 QA 背包称为远端 Agent 的背包。地板、照片墙、位置与模式由控制台测试夹具设置，跨维度校验临时切旁观再恢复创造；不冒充 Agent 自主建造或通关。

- 使用真实生活截图，通过插件自己的 upload 入口创建两张原生地图；实际 map 包每张 16384 字节，并保留物品组件。
- 原生六面展示框的出生包、后续中心坐标与晚接宿主缓存一致；浏览器实见照片墙、四分之一圈旋转和手持预览。
- 实际 starlight 包的起止 RGB、size=0.75、speed=0 通过核对；浏览器实见该技能渐变粒子及原版 end_rod sprite。修复 logarithmic depth shader 后粒子正常被场景深度遮挡。
- 原生实体移除后照片与展示框清理；实际下界切换在新地图包到来前发出空缓存 reset。切换后仍持有的照片可收到新的有效地图包，不能以缓存永远为零作为验收条件。
- 纯协议/Three.js 测试覆盖地图增量、稀疏快照、ArrayBuffer、生命周期、空间/数量边界与慢 Socket.IO 接收者；并非 Java 全场景像素一致性验收。
- 完整回归 529 项通过、0 skip；两套 TypeScript 检查通过。原生模组的既有回归使用测试要求的 v15 原资产，历史 colony v5 审计单独绑定 v5 原资产。1.20.6 构建资源校验通过 26684 个方块状态。
- 同日发布前合并远端渲染与共享素材更新：完整回归 616 项通过、0 skip，TypeScript 检查通过；从共享包重新构建并校验 26684 个方块状态与内容资源。此项是合并后的回归和构建验证，上述游戏内/浏览器实测来自本轮合并前的隔离验收。

客户端 JAR、私有资产目录、实际地图包、截图、测试存档和上传地址留在仓库外；可复用的原版源素材纳入共享素材包。远端电脑的加载版本仍需在那里核验。
