# viewer-agent.mjs / Agent 行动可视化与 Marker API

## 画面与 OBS

普通画面与 `/?obs=1` 共用同一套可视化。`/?obs=1&obsEdit=1` 或 F8 打开布局编辑器。新增八项：行动说明、轨迹颜色图例、按键/鼠标、场景路径、攻击/采集/交互、自定义 marker、屏幕指针、图文动画。每项可以显示/隐藏、移动、缩放，复制布局链接给 OBS；旧布局自动补默认项。没有数据的说明/图片不会显示占位示例。拍照模式不显示这些层。

| 含义 | 默认颜色 | 表现 |
| --- | --- | --- |
| 选择的寻路路径 | 青绿 `#4ee6b1` | 实线、沿行进方向流动的箭头 |
| 实际走过的轨迹 | 蓝 `#63b8ff` | 最近最多 12 个采样点，沿轨迹累计不超过 8 格 |
| 候选路径 | 灰蓝 `#a6b7d4` | 半透明虚线、方向箭头、候选名称 |
| 攻击 | 红 `#ff697b` | 从本人到目标的线与目标圈 |
| 采集 | 橙 `#ffbe55` | 从本人到方块的线与目标圈 |
| 交互 | 紫 `#c59aff` | 使用方块/物品/实体的标记 |

轨迹面板只显示颜色图例与当前状态，不再重复绘制轨迹小图；场景 marker 按当前相机投影。已走轨迹只裁剪网页显示，不修改收到的历史数据、选定路径或候选路径。OBS 的画幅、相机方向和 FOV 需与底层游戏捕获一致；无法投影的点不会编造屏幕位置。开发者也可提交归一化屏幕坐标。后台自动读取 Mineflayer pathfinder 事件、控制状态和实际发出的操作包；“已发送”不等于游戏操作完成。Mineflayer 没有真人鼠标坐标时只显示左右键操作，绝不拿观众鼠标冒充 Agent 鼠标。

### FOV 与原版画面对齐

OBS 设置增加游戏垂直 FOV（30–110）、底层游戏宽高比与“跟随 Agent 上报的实时 FOV”。未指定页面 FOV 的 OBS 默认 70；已有 `?fov=...` 仍有效，可在设置里覆盖。横向角度按 `2·atan(tan(垂直FOV/2)·宽高比)` 计算，不能把原版 FOV 滑杆值当成水平角。场景 marker 使用校准后的场景相机，并转换渲染器的浮动原点；OBS 不绘制地形时也更新相机父节点矩阵。手持物品保留渲染器独立的 70° 相机，横屏时共用校准画幅，不把场景动态 FOV 套到物品上。窗口尺寸变化会重新计算宽高比。底层录制画幅与 OBS 不同且进行了拉伸时，可明确填写原画幅宽高比。

原版协议不包含用户本地 FOV、疾跑/飞行/拉弓的最终渲染 FOV。接口接受 `camera:{verticalFov:84,ttlMs:1000}` 上报真实的当前垂直角，最多保留 3 秒；启用跟随后覆盖基础 FOV。缺少实时数据时明确显示“动态未同步”，不会用 viewer 的 1.04 疾跑系数假装原版动态。需要固定对齐时，把游戏 FOV 特效设为 0，填入相同基础 FOV；需要动态对齐时由实际游戏/Agent 画面源持续上报最终角度。完整 Java 视角摇晃、伤害晃动和 OBS 裁剪仍需实际画面对照。

意图、候选方案和图文由 Agent **主动提交公开说明**。接口不采集模型内部思维链、聊天原始上下文、密码或密钥。

## 宿主接入：同一条玩家连接

### 决策来源

系统一使用橙色 `#ffb454`，系统二使用蓝色 `#63b8ff`；人工与来源未提供分别为紫色与灰色。决策卡片和目标连线共用配色，运行概览的模型通道也使用这两种颜色。原有轨迹、采集、攻击等颜色仍表示动作类别。

宿主通过本体 `actionBot.emit('viewer:decision', {id,source,status,label,from?,target?,ttlMs?})` 上报已受理或被拒绝的选择。`source` 为 `system1|system2|human|unknown`；`status` 为 `accepted|rejected`。接口只复制这些公开字段，不复制提示、聊天或隐藏推理。每来源保留最新一项，默认八秒、最多十五秒，换维度或断开即清除。被拒绝的选择只进入卡片，不画目标连线。

该事件由实际任务或选择入口的宿主角色产生。网络包、按键类型、实体距离与 Agent 自报绘图均不能确认决策来源；公共绘图接口不接受 `decisions` 字段。任务受理不是动作已执行，目标连线也不证明存在可走路线。脚本或外部宿主没有提供来源时保留 `unknown`，不得默认补成系统二。

内置 `mc-modern-viewer.mts` 已挂载。自建宿主需接入一次：

```js
import { createViewerAgentBridge, createViewerAgentHub, publishAgentVisualization }
  from 'mc-visual-console/agent-visuals';
// 未作为 npm 包使用时，可导入 renderer-src/host/viewer-agent.mjs。
const visuals = createViewerAgentBridge(actionBot);
io.on('connection', socket => visuals.subscribeSocket(socket));
// 结束宿主：visuals.dispose();

const accepted = publishAgentVisualization(actionBot, {
  intent: { status: 'acting', goal: '给公会补充木材', step: '沿河绕开怪物',
    summary: '选择河岸路线，先到树林边缘再采集。', progress: 0.25, ttlMs: 15000 }
});
// accepted.ok/code 确认可视化数据被接收，不表示任务完成。
```

也可 `actionBot.emit('viewer:agent', update, acknowledgement)`。这是同进程受信任插件接口。不得在已自动挂载的 bot 上再创建一个 bridge。

Eye/live 宿主传入 `getViewerSession: () => observer.snapshot()?.viewerSession ?? null`；同进程的本体与 Eye 默认共享 hub，也可显式创建一个 `createViewerAgentHub()` 并传给各 bridge。本体 bridge 绑定真实玩家 UUID/entity ID；Eye 只能显示服务器已确认且实际匹配的目标。未注册的目标明确返回 `AGENT_VISUAL_SOURCE_UNAVAILABLE`，不会把 Eye 自己的行为或另一个玩家的说明替代过去。

跨进程/跨电脑的 Agent 必须在其现有受信任数据链中转发这些公开数据，不能只凭用户名读取另一个进程的规划。共享渲染器更新不会让所有远端 Agent 自动具备意图发布能力。

### 可选的 Socket.IO JSON 发布接口

复用现有 Socket.IO 连接，无新端口。创建 bridge 时提供 `authorizePublish({socket, subject})`，用宿主已有的认证/接管权限判定，只接受明确返回 `true`。默认拒绝发布，观众仍可接收展示。

```js
const visuals = createViewerAgentBridge(actionBot, {
  authorizePublish: async ({socket, subject}) =>
    existingAccess.isAgentOwner(socket, subject.playerUuid)
});
// 已经由宿主认证的开发者客户端：
socket.emit('agentVisualUpdate', update, receipt => console.log(receipt));
```

每连接最多 5 次/秒。回执只发给提交者，`AGENT_VISUAL_PUBLISH_FORBIDDEN`/`AGENT_VISUAL_RATE_LIMIT`/`AGENT_VISUAL_INVALID_*` 不广播到公屏。内置宿主默认关闭此写入口；开发者应通过自己的已有鉴权启用。内置 Socket.IO 上行上限为 64KiB，大图片请用宿主 SDK 提交。

## Marker / 候选路线

```js
publishAgentVisualization(actionBot, {
  route: { points: [{x:10,y:64,z:20},{x:14,y:64,z:22},{x:18,y:65,z:25}],
    goal: {x:18,y:65,z:25}, status:'moving', ttlMs:10000 },
  candidates: [
    {id:'short',label:'近路，经过怪物',points:[{x:10,y:64,z:20},{x:18,y:65,z:25}]},
    {id:'river',label:'沿河绕行',points:[{x:10,y:64,z:20},{x:10,y:64,z:27},{x:18,y:65,z:25}]}
  ],
  markers: [
    {id:'tree',kind:'point',role:'gather',position:{x:18,y:65,z:25},label:'待采集树木'},
    {id:'door',kind:'label',role:'interact',position:{x:15,y:65,z:22},label:'入口'},
    {id:'danger',kind:'area',role:'attack',points:[{x:13,y:64,z:21},{x:16,y:64,z:21},{x:16,y:64,z:24}],label:'危险区'},
    {id:'flow',kind:'line',role:'path',points:[{x:10,y:64,z:20},{x:14,y:64,z:22}],flow:true,width:3},
    {id:'screen-note',kind:'label',space:'screen',position:{x:0.5,y:0.15},label:'先观察，再前进'}
  ]
});
```

- `kind`: `point` / `line` / `area` / `label`。`space` 默认 `world`（Minecraft 绝对方块坐标）；`screen` 的 x/y 为 0–1。
- `role`: `path` / `trail` / `candidate` / `attack` / `gather` / `interact` / `info`；可覆盖六位十六进制 `color`。
- `width`: 1–10 像素；`radius`: 2–24 像素；`dashed`、线条 `flow` 可选。面积仅在全部顶点可投影时填充。
- 同一批 marker 的 `id` 必须唯一。每次提交 `markers`、`candidates` 完整替换各自集合；传 `[]` 清空。其他字段省略保持，传 `null` 清空。非法批次整体拒绝。
- 最多 48 marker、1024 顶点；4 条候选，各 128 点；长路径等距采样保留终点。marker 默认 10 秒、最多 30 秒；候选 10 秒，需主动刷新。绘图批次限制 64KiB。
- 自动 pathfinder 路线优先反映实际最新路径；找到路径显示“行进中”，仅 `goal_reached` 显示“已到达”。`path_reset` 清空已失效路径。
- `pointer:{x:0.4,y:0.6,ttlMs:1500}` 表示 Agent 明确报告的屏幕指针，最多保留 3 秒。

## Agent 自制图文与动画

三种展示类型：`card` 纯文本、`image` PNG/JPEG/GIF/WebP、`scene` 声明式画布动画。GIF/动画 WebP 会正常播放。没有任意 HTML/JS 执行或第三方资源抓取。

```js
publishAgentVisualization(actionBot, { presentation: {
  id: 'plan-image', kind: 'image', title: '我准备修的桥', caption: '桥面与支撑布局',
  src: `data:image/png;base64,${pngBuffer.toString('base64')}`, ttlMs: 30000
}});
publishAgentVisualization(actionBot, { presentation: {
  id: 'route-explanation', kind: 'scene', title: '沿河绕行示意', width: 360, height: 180,
  nodes: [
    {kind:'line',x:30,y:100,x2:300,y2:100,color:'#4ee6b1',width:3},
    {kind:'circle',x:30,y:100,radius:8,color:'#63b8ff',motion:{dx:270,dy:0,periodMs:3000}},
    {kind:'text',x:25,y:40,text:'避开危险区，再去采集',size:20,color:'#ffffff'}
  ], ttlMs: 30000
}});
```

图片最多 512KiB、解码后宽高至多 4096；scene 最多 64 节点、1920×1080，支持 rect/circle/line/text 和往返位移动画。默认展示 30 秒，最多 120 秒；需要持续显示时主动刷新。图片只在修订变化/新订阅时发送一次，10Hz 状态只带引用。不能在没有收到对应图片时沿用上一个人的图片。

## 传输、清理与更新

- `agentVisualization`: schemaVersion=1，服务端绑定 subject/epoch/sequence，最多 10Hz；至少 1 秒心跳。`input` 是实际控制/已发包，`intent` 是主动公开说明，两者分开。
- `agentPresentation`: 同 subject/epoch、revision 的媒体内容，需已有匹配状态引用才能显示。
- 浏览器以本地单调时钟计时，3.5 秒无数据清空。换观战目标、脱离、断线、重生/换世界清理旧状态。瞬移不画成走路。
- 绘制最多约 30fps；箭头先裁剪再生成，限制数量；隐藏的层不绘制并释放大画布，场景画布各有 4M 像素上限。
- 旧 `tacticalRoute` / `tacticalAttack` 输入继续兼容，旧独立绘制循环不再重复安装。现有指令、背包、技能和游戏协议不变。
- 当前接入的是 Mineflayer / Paper 1.20.6 共享宿主；原生 1.21.1 的独立场景与已有状态适配保持原实现，不能据此宣称其原生 marker 接口已接通。

更新远端查看器：拉取源码，接入宿主 bridge，用原 Minecraft 版本和 preset 重建实际使用的资产目录，再重启/刷新该 Web 宿主。Paper 无需为此重启；仅更新网页 bundle 无法补出尚未接入的 Agent 意图数据。

```text
npm run test:agent-visuals
npm run test:obs
node tools/prepare-viewer-assets.mjs java-1.20.6 <新的资产目录> --preset=qiandengji
```

测试使用显式夹具与协议回放；正式远端 Agent/实际 OBS 合成需在各自运行端更新后验收。

### 2026-10-12 本次验证

- `npm run test:agent-visuals`：28 项通过，无跳过。覆盖实际 host→浏览器模块→DOM/Canvas 调用、换目标与断流清理、媒体修订、16 个本体隔离、编辑器保存/导出，以及 FOV、远坐标浮动原点和相机父节点变换。
- `npm run test:obs`：17 项 Node 与 2 项 TS 测试通过；`npm run typecheck` 通过。`npm test` 全部测试阶段通过，其中 renderer tools 604 项、594 通过、10 项依现有条件跳过，无失败；各命令有重叠，不相加。
- 使用原 `java-1.20.6` 资源和 `qiandengji` preset 完成隔离构建，源码摘要和 bundle SHA-256 与生成清单一致。生成资源与日志留在仓库外。
- 当前浏览器检查工具没有可用浏览器，新增面板的像素布局、真实 OBS/原版叠加及动态 FOV 实机效果尚未验收。上面的 DOM/Canvas 调用测试不代表截图一致性。
- 本次没有部署正式/远端 Web 宿主，也没有重启 Paper。需按上一节同时更新宿主 bridge 与浏览器资源。
# 飞行输入遥测（schemaVersion 1 可选字段）

`createViewerAgentBridge(bot, { getFlightState })` 可选回调由实际动作身体的宿主提供，返回 `allowed`、`flying`、`serverFlying`、`mode:ground|hover|input|route`、`direction:{x,y,z}|null` 和可选 `expiresAtMs`。方向表示客户端当前移动指令，不能用作服务端位移证明。桥只传递白名单字段，并将截止时间转换为剩余毫秒；没有回调或读取失败时 `input.flight` 为 null，旧宿主保持可用。

网页分别显示许可、按键飞行、坐标飞行、悬停及升降。真实按键仍只取 `bot.controlState`；坐标路线或施法回执不能伪造按键。输入飞行时 jump/sneak/sprint 显示为上升/下降/加速。整帧仍按原来的本人 UUID/entity、epoch、序列和过期规则隔离。

这需要同时更新宿主桥与网页资源。只有刷新网页不能使旧宿主产生新遥测。

