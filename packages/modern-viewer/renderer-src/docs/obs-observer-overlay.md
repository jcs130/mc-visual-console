# Paper 1.20.6 observer HUD and OBS overlay

2026-10-11 deployment status: Paper AgentFriend 0.4.19 / CortiEyeMirror 0.1.12 is deployed. The viewer host/bundle must also be updated independently; source publication does not install copied deployments or remote viewers.

Use `/?obs=1` (also `?overlay=1`) as an OBS Browser Source above the game capture. The document background is transparent. The existing original first-person hand/item passes now render on a transparent WebGL canvas, including native arm swings, weapon motion, eating/drinking, shield raising and ranged use. World, sky, entity and player-preview drawing stay disabled. The shared renderer performs a minimal bootstrap (one worker; no terrain ingestion/meshing jobs); `loadChunk`, block updates and world entity drawing are still skipped. This replaces the earlier mode that skipped the renderer entirely and therefore could not draw hands. No extra Minecraft account or HTTP listener is created by the overlay.

The existing 2D minimap, original inventory icons, hotbar, health, food, armor, XP, mana, skills and messages remain. The minimap uses the host's existing `minimap` feed without requesting extra Minecraft chunks. Subject switches, detachment, disconnects and stream expiry clear the old terrain; it resumes with the next map update. A host must publish the same `minimap` feed it uses in the normal viewer. Handheld map/photo pixels also update from inventory/map events, without enabling world item-frame rendering.

## OBS 布局设置（2026-10-12 源码更新）

- 在普通画面顶部点击 **OBS 布局设置**，或打开 `/?obs=1&obsEdit=1`。
- 28 类组件可分别显示/隐藏：原有 20 项（手与物品、生存状态与快捷栏、小地图、技能、聊天、背包/交易、背包按钮、状态效果、Boss、计分板、消息、行动提示、标题、施法、事件、气泡、战斗数字、着火、地图/照片、准星）和新增 8 项（Agent 行动说明、轨迹小图、按键/鼠标、场景路径、攻击/采集/交互、自定义 marker、屏幕指针、图文动画）。准星默认隐藏。接入与开发者接口见 [Agent 可视化](agent-visualization.md)。
- 选中组件后，拖动蓝色名称标签移动，拖动右下角调整大小；也可输入大小（0.3–3 倍）和横/纵偏移（相对于当前画幅的百分比）。单项复位和全部复位均可用。没有实际内容的组件不会凭空显示示例或过期窗口。
- 设置自动保存在当前浏览器。OBS 和普通浏览器的存储独立，点击 **复制布局链接**，粘贴到 OBS 浏览器来源即可携带布局。复制链接只保存与默认值不同的设置，自动移除 `obsEdit`。推荐浏览器来源宽高与底层游戏画幅一致。
- **完成** 或 Esc 退出设置，F8 可重新打开。设置面板、拖动框、透明棋盘格只在编辑时出现；直播链接不会带这些内容。
- **相机对齐** 可填写原版垂直 FOV 与底层画幅宽高比，设置随布局链接保存。可跟随 Agent 主动上报的实际动态 FOV；未同步时使用基础值并明确提示。需要固定对齐时将游戏 FOV 特效设为 0，不能把当前 viewer 的疾跑系数当成原版动态 FOV。详见 [FOV 对齐说明](agent-visualization.md#fov-与原版画面对齐)。
- 此编辑器只改网页显示，不发送游戏命令，不修改玩家背包，也不覆盖服务端控制的窗口关闭/到期状态。使用支持 CSS 独立 `translate`/`scale` 的浏览器/OBS 内置浏览器。

OBS 手持层读取当前本人状态；Eye/live 读取已通过服务器校验的实际观战目标。库存仍来自该连接的原生镜像，使用动作/挥手取自匹配 UUID/entity ID 的目标。换人、脱离、断线时清掉前一个对象的动作；3 秒没有本人库存快照则隐藏手持层，1.5 秒没有使用状态则停止吃喝动作。透明画布每帧清屏，隐藏组件也不会留下上一帧。

此次不卸载服务器插件，也不修改登录或 Eye 权限。网页负责这些可见层，不再依赖 Spectator 类插件绘制背包和手持界面；Eye/live 的数据仍需现有服务器镜像与鉴权桥。YSM 特制第一人称手臂的完整外观支持仍以正常查看器已有能力为限，不能据此宣称全部 YSM 动画已复现。

The Paper host needs AgentFriend 0.4.18+ and CortiEyeMirror 0.1.12+. Automatic `<name>eye` / `<name>_eye` cameras and the privileged `live` camera receive native inventory snapshots from the player they actually spectate. Names are case insensitive. Default suffix Eyes can connect once their corresponding Agent is successfully online, without IP matching; existing explicit access rules and the separate `live` grant retain priority. `live` chooses its target in the normal spectator UI; it is never assigned a fixed player by the watcher.

## Host adapter

Keep the existing Mineflayer connection and gameplay adapter. Attach the shared bridge before serving sockets:

```js
import { createViewerObserverBridge } from './host/viewer-observer.mjs';
const observer = createViewerObserverBridge(bot, {
  serializeWindow: window => serializeViewerWindow(bot, window),
});
io.on('connection', socket => observer.subscribeSocket(socket));
// On host shutdown:
observer.dispose();
```

The generic host in `src/mc-modern-viewer.mts` already enables this for 1.20.6. It exports `serializeViewerWindow` and `serializeAvatarState`; their item serializer preserves the native item components. A consumer with its own container adapter can omit `serializeWindow` and retain its richer trade/book adapter. Do not attach two observer bridges or duplicate the same state feed.

The bridge subscribes to `mcviewer:state`, validates the recipient UUID and schema, and accepts observer state only when the native camera entity ID matches the announced subject. It sends `viewerSession`, `observerState`, `skillsState` and authoritative container-close events. Source changes, disconnects, respawns and stale streams clear the previous HUD and window. Native container snapshots are optional and read only. The original avatar stream continues to provide native inventory items; server-attested vitals replace the spectator's own health and XP.

The page also dismisses an open window after cumulative horizontal motion over 0.35 blocks or vertical motion over 0.5 blocks. Rotating the camera and small position jitter retain it. Paper closes the actual player window at the same thresholds, and closes physical inventories when their source moves beyond 6.5 blocks. Virtual menus do not have a physical source. Closing a stale window cannot move or create items.

Connection recovery retains the shared capacity retry policy: a rejected full viewer waits for a slot; a reconnected OBS page reloads only after admission. Disconnect immediately clears the previous observed player's HUD and window.

## Update a copied viewer

Pull this repository, update the consumer's host import, and rebuild its existing asset directory with its original Minecraft version and preset:

```text
node packages/modern-viewer/renderer-src/tools/build-minecraft-viewer-client.mjs packages/modern-viewer/renderer-src <existing-assets> --preset=qiandengji
```

Retain the original asset manifest and versioned GUI textures. A host must continue mapping `/textures/gui/...` to its own version's GUI assets, as the generic static responder does. Restart only the consumer's viewer service through its normal manager when required; pulling source alone does not update a copied bundle or a remote computer.

## Verification boundaries

Disposable Paper actors verified automatic pairing, original inventory components, `live` switching/private isolation/detachment, native merchant copies, movement and range closure, and dimension following. Browser inspection verified transparent composition and actual source items/vitals. The fixture corrected known potion and food schema errors in its local minecraft-data 3.112.0 process using the actual 1.20.6 codecs; installed Agent clients were not modified. This is not a claim that every old Mineflayer dependency correctly decodes every vanilla item component. Native 1.21.1 uses its independent adapter. Actual OBS capture and phone/Xbox device appearance need separate checks.

2026-10-12 增量验证：`npm run test:obs` 覆盖透明手持渲染分支、真实使用时钟、目标 UUID/ID 绑定、挥击入口过滤、布局边界/导出、原生观战状态与宿主使用标志。另跑已有背包关闭、装备和地图/照片回归。隔离协议回放使用原 1.20.6 客户端导出的模型/纹理，在浏览器实见面包、剑、空手、盾牌、观战换人/脱离和布局设置；回放不是正式服务器实战，也不是 Java 像素一致性或实际 OBS 合成验收。未重启 Paper；更新远端查看器仍需按上面步骤重建并刷新其实际使用的资源。

同日后续 Agent marker/FOV 增量使用协议、DOM/Canvas 调用与投影数学测试，并完成隔离构建；该次浏览器工具没有可用浏览器，未新增截图或实际 OBS 合成验收。具体测试与更新边界见 [Agent 可视化验证](agent-visualization.md#2026-10-12-本次验证)。
