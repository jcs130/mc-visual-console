<!-- Owner: src/modern-viewer/client.js, tools/minecraft-viewer-panels.js, tools/minecraft-viewer-hud.js -->
# 现代渲染器接入协议（Minecraft Java 1.20.6）

本文对应 `src/modern-viewer/client.js` 和 `tools/minecraft-viewer-*.js` 构建出的前端。它说明另一个 Mineflayer 项目需要提供什么数据；不要求使用 Cortico，也不要求连接千灯纪。

**这里是浏览器与画面服务之间的 Socket.IO 协议，不是 Minecraft 网络包协议。** 需要由宿主把 Mineflayer 状态和收到的游戏包转换成下面的事件。仓库中较早的 `../src/mc-modern-viewer.mts` 有自己的 1.21.1 宿主实现，并不提供本文全部 1.20.6 功能。

1.20.6 的原始粒子、地图像素、展示框和手持照片使用 `contentReset`、`particleBatch`、`mapPixels`、`mapFrame`。2026-10-10 增加气泡 `textDisplay`。使用同一行动连接的 [viewer-content 桥](docs/paper-content-compatibility.md#socketio-增量事件)；[气泡事件、字库与更新方法](docs/text-display-bubbles.md)。不重复转发派生粒子，不从聊天记录生成私人对白。地图标记与完整原版粒子物理尚未实现。

## 1. 页面、资源和连接

只读截图客户端可在本地浏览器的 HTTP 与 WebSocket 请求中发送 `x-mc-viewer-capture: 1`。
支持此能力的宿主在 `/healthz` 提供 `viewers`、`maxSessions`、`captureSessions`、
`maxCaptureSessions` 与 `version`，分别表示观众连接和临时截图连接的计数及上限。
临时截图独占一个单独名额，关闭时释放，宿主也应设置租期清理失联连接；现有宿主租期为 60 秒。
截图名额满时拒绝该截图连接，保留观众连接。宿主未声明独立截图能力时，截图客户端应遵守
普通连接上限。截图客户端结束后关闭自己的浏览器，不操纵正在播放的观众页面。

| 页面 | 模式 | Socket.IO `path` |
| --- | --- | --- |
| `/` | 第一人称 | `/socket.io` |
| `/third/` | 第三人称 | `/third/socket.io` |
| `/dungeon/` | 2.5D 地下城视角 | `/third/socket.io` |

这些是 Socket.IO **传输路径**，不是 namespace。客户端使用同源连接，允许 WebSocket 和 polling。宿主应在同一个 HTTP 服务上提供页面、静态资源和两个 Socket.IO 入口；每个新连接都发送完整快照。第三人称与地下城共用同一份世界数据，镜头由前端选择。

前端入口是 `/index.js`，对应构建输出 `dist/modern-viewer.js`；样式是 `/viewer.css`。其余 worker、纹理、模型、图标资源应按构建输出 `public/` 的路径提供。HUD 使用 `/textures/gui/...`，导出的版本纹理位于 `public/textures/1.20.6/`，宿主需提供 `/textures/*` 到该目录的映射。资源及 Minecraft 数据版本必须一致，不能用 1.21.1 数据解释 1.20.6 的 state ID。

## 2. 最小可用数据流

连接后先发 `version`，再发送自身位置、实体及已加载区块。渲染器初始化时会暂存先到达的区块与实体；完成后回放。

```js
socket.emit('version', '1.20.6');
socket.emit('position', {
  pos: { x: 10.5, y: 64, z: -20.5 }, // 玩家脚下位置
  yaw: bot.entity.yaw,
  pitch: bot.entity.pitch,
  teleport: false,
});
```

| 事件 | 数据 | 用途 |
| --- | --- | --- |
| `version` | 字符串 `'1.20.6'` | 初始化版本数据和渲染器；每个连接发送一次 |
| `position` | `{ pos: {x,y,z}, yaw, pitch, teleport? }` | 主角色位置与镜头朝向 |
| `loadChunk` | `{ x, z, chunk, worldConfig, blockEntities?, isLightUpdate? }` | 加载或刷新一个完整区块柱 |
| `unloadChunk` | `{ x, z }` | 移除区块柱 |
| `blockUpdate` | `{ pos: {x,y,z}, stateId }` | 已加载区块内的方块状态变化 |
| `entity` | 完整实体，或 `{ id, delete: true }` | 出现、装备/metadata 改变、消失 |
| `entityMoved` | `{ id, pos, yaw, pitch, headYaw? }` | 已知实体的移动与朝向增量 |
| `playerEntity` | 自身完整实体 | 第一人称自身模型、手持物的身份 |
| `avatarState` | 见第 4 节 | 自身动作、生命、饥饿、装备和物品栏 |
| `time` | 数值，Minecraft 日内 tick | 天空、昼夜照明；通常为 `bot.time.timeOfDay` |
| `weather` | `{ raining: boolean, thunder: number }` | 实际天气，晴天要明确发送 `false` 与 `0` |
| `viewerReset` | 无数据 | 切换维度或清空世界；前端会重新加载页面 |

坐标是 Minecraft 的绝对世界坐标，单位为方块；区块、方块位置为整数，实体位置可以为小数。`yaw` / `pitch` / `headYaw` 使用 Mineflayer 的**弧度值**，不要直接发送原始网络包的 byte 角度或角度制数值。`time` 每日 24,000 tick；持续时间字段名称带 `Ms` 的才是毫秒。

### 区块柱和高度

`loadChunk.x` / `z` 是区块柱起点的**绝对方块坐标，16 的整数倍**，不是 chunk index。`chunk` 是当前版本 `prismarine-chunk` 实例的 `toJson()` 返回的 JSON **字符串**，不是网络 `map_chunk` 的 Buffer。

```js
// cx / cz 是 chunk index；注意负坐标用 Math.floor。
const column = bot.world.getColumn(cx, cz);
if (column) {
  socket.emit('loadChunk', {
    x: cx * 16,
    z: cz * 16,
    chunk: column.toJson(),
    worldConfig: {
      minY: column.minY,
      worldHeight: column.worldHeight,
    },
  });
}
```

1.20.6 普通主世界通常是 `{ minY: -64, worldHeight: 384 }`；宿主应读取当前区块或维度的实际高度。其他维度不能直接套用主世界高度。自定义服务器的动态 biome ID 需要按群系名称映射到前端同版本 `minecraft-data` 的 ID 后再传输；仅在 ID 已一致时可直接使用上面的 `toJson()`。

持续订阅区块加载、卸载、方块及光照更新。光照改变需要刷新相应区块数据；`isLightUpdate: true` 可标记光照刷新。仅发送首次快照会留下空洞或陈旧地形。建议优先发送玩家附近区块，合并同一位置的待发送变化，并周期检查 Mineflayer 已加载但浏览器尚未收到的区块。

可选 `chunkStreamState: { streamed, expected, retried }` 提供区块同步统计，不会替代真正的 `loadChunk`。`expected` 应按宿主实际视距计算，而非固定使用现役部署的 81。

### 方块实体

`blockEntities` 是**完整快照**，格式为 `{ '绝对x,绝对y,绝对z': blockEntityData }`，用于告示牌等额外渲染器。Mineflayer 区块柱的 x/z 键通常是 0–15 的局部坐标，宿主需加上区块起点转换为世界坐标；y 保持绝对高度。区块卸载后也更新快照，避免旧告示牌残留。

## 3. 实体、装备与动作

完整实体的通用格式：

```js
socket.emit('entity', {
  id: entity.id,
  name: entity.name, // 如 zombie / skeleton / player / fishing_bobber
  type: entity.type,
  pos: { x: entity.position.x, y: entity.position.y, z: entity.position.z },
  yaw: entity.yaw,
  pitch: entity.pitch,
  headYaw: entity.headYaw,
  width: entity.width,
  height: entity.height,
  metadata: serializableMetadata,
  equipment: serializedEquipment,
  username: entity.username,
  uuid: entity.uuid,
  burning: entity.isOnFire === true,
});
```

- 自身实体必须带 `name: 'player'` 和 `isSelf: true`。第一人称发送 `playerEntity`；第三人称/地下城发送 `entity`，后续用 `entityMoved` 更新同一个 ID。不要再创建另一个代表同一玩家的 ID。
- 玩家外观可带 `skinUrl: '/head-texture/<texture-hash>.png'` 和 `skinModel: 'classic' | 'slim'`，自身与其他玩家使用相同格式。宿主从服务端 player-info 的 `skinData` 转换并代理 Minecraft 官方材质域名，哈希为 40–64 位小写十六进制。档案没有材质时发送 `skinUrl: null, skinModel: null`，以清除旧外观。皮肤改变时重新发送完整实体，自身也在 `avatarState.entity` 中更新。背包预览复用这份外观。
- `equipment` 的 6 个位置固定为 **主手、副手、鞋、护腿、胸甲、头盔**。空位用 `null`。装备、年龄、姿势或 metadata 改变时发送完整 `entity`；日常移动用 `entityMoved`，避免每帧重建装备导致闪烁。
- `metadata` 保持该版本实体 metadata 的索引关系，并转为可 JSON 序列化的数据。不能把所有怪物当玩家模型，也不能只传显示名称：类型决定骨架，metadata 决定幼年、姿态、使用物品等状态。
- 羊可额外带 `sheepAppearance: { colorId, sheared }`（颜色 0–15）；村民可带 `villagerAppearance: { typeKey, professionKey, levelKey }`，字段使用 1.20.6 的群系、职业和等级键。
- 鱼漂需要 `name: 'fishing_bobber'` 和 `ownerEntityId`，后者取 1.20.6 `spawn_entity` 的 `objectData`。实体 ID 消失/复用时清掉旧归属；仅凭最近玩家位置猜归属会让鱼线接错人。

### 物品格式

`equipment`、物品栏和菜单使用同一种序列化物品；空格为 `null`：

```js
const sword = {
  name: 'diamond_sword',
  type: bot.registry.itemsByName.diamond_sword.id,
  itemId: bot.registry.itemsByName.diamond_sword.id,
  displayName: '钻石剑',
  count: 1,
  metadata: 0,
  enchanted: true,
  durability: { left: 1500, max: 1561 },
};
```

自定义名称用 `customName`，并让 `displayName` 优先显示它。玩家头可以带 `headTextureHash`，宿主提供 `/head-texture/<hash>.png`。保留经过范围限制和序列化的 `components` / `nbt` 可帮助渲染实际物品；不要直接传含 `Map` 或循环引用的 Mineflayer 对象。`enchanted` 和 `durability` 是明确的显示事实，不能仅凭物品类型推断。

### 动作事件

| 事件 | 示例数据 | 来源 |
| --- | --- | --- |
| `entityAnimation` | `{ id, animation: 'oneSwing', hand: 'right' }` | 实际挥手/挥砍；副手为 `'left'` |
| `entityDamage` | `{ id, isSelf: false }` | 实体实际受伤 |
| `rangedUse` | `{ kind: 'bow', phase: 'draw', hand: 'right' }` | 实际开始使用弓；`kind` 也支持 crossbow / trident |
| `rangedUse` | `{ kind: 'bow', phase: 'release', hand: 'right' }` | 放开使用键射出；切换物品则发 `'cancel'` |
| `digProgress` | `{ x, y, z, stage: 0 }` | 破坏进度 stage 为 0–9；结束发 `{ stage: null }` |

`rangedUse.hand` 表示发出使用指令的主/副手；弓的握持与搭箭动画由前端处理。不要为了“弓在左边”而改掉真实的主手字段。箭、三叉戟、药水等飞行实体仍通过常规 `entity` / `entityMoved` / 删除事件传输。

## 4. 自身 HUD：`avatarState`

现役桥接以约 10 Hz 发送。其他宿主可按动作变化发送，保持时间顺序；`capturedAt` 为 Unix 毫秒时间戳，`seq` / `sequence` 递增。

```js
socket.emit('avatarState', {
  seq: 1, sequence: 1, capturedAt: Date.now(),
  entity: selfEntity, // 第 3 节的自身完整实体
  movementState: 'walking', // idle / walking / running / crouch / crouchWalking
  horizontalSpeed: 0.12, verticalSpeed: 0,
  velocity: { x: 0.12, y: 0, z: 0 }, // Mineflayer 速度，方块/游戏 tick
  onGround: true, inWater: false, inLava: false,
  surfaceBlock: { name: 'grass_block', stateId: 9 }, // 实际脚下已加载方块，未知用 null
  sprinting: false, sneaking: false, burning: false,
  shieldRaised: false, usingHeldItem: false,
  heldItemEdible: false, // 原版 food 数据或真实物品 food component，不能只看名称猜测
  health: 20, maxHealth: 20, absorption: 0,
  food: 20, armor: 10, oxygen: 20,
  experienceLevel: 9, experienceProgress: 0.4,
  quickBarSlot: 0,
  offhand: null,
  equipment: selfEntity.equipment,
  hotbar: Array.from({ length: 9 }, (_, index) => ({
    index, slot: 36 + index, selected: index === 0, item: null,
  })),
  inventory: serializedInventorySlots,
});
```

生命是实际生命点（默认 20 点=10 颗心），吸收生命独立放在 `absorption`；饥饿、护甲、氧气范围 0–20，经验进度 0–1。`oxygen` 使用归一后的 HUD 值，不是原始空气 tick。`inventory` 保留玩家窗口的原始槽位索引，不能过滤空槽；`quickBarSlot` 为 0–8。快捷栏起点应读取 `bot.inventory.hotbarStart`，36 是 1.20.6 玩家窗口示例。

举盾应来自真实使用状态，而不是“副手有盾就始终举盾”。中毒等状态还需发送第 5 节的 effect 事件，单靠减少生命不能判断中毒。

## 5. 可选的原版显示能力

省略某个事件只会缺少相应显示，不影响基础地形与实体渲染。

| 事件 | 主要字段与语义 |
| --- | --- |
| `containerState` | 当前窗口完整快照，关闭发 `null`；`{ id, type, title, slots, inventoryStart, hotbarStart, containerCount, properties, furnace, trades }`。`furnace: { burn, cook }` 为 0–1 进度；交易表需要额外从 `trade_list` 解码，不能只看菜单槽位 |
| `inventoryPreview` | 可选的短暂只读背包预览：`{ open: true, ttlMs: 2400, source: 'idle' }`；取消发 `{ open: false }`。使用最新 `avatarState.inventory` 与当前人物装备，最长 2400 ms 后收起，不创建真实游戏容器 |
| `documentState` | 可选只读服务资料快照；完整结构见下文。关闭或失效发 `null`，新浏览器连接由宿主重发当前资料 |
| `minimap` | `{ centerX, centerZ, radius: 12, sampleY, dimension, cells }`，`cells` 是 25×25 共 625 个字符，z 为行、x 为列；`?` 未加载，空格为空气，W 水、L 岩浆、F 树叶、T 树干、G 草地、P 路径、S 沙、N 雪冰、C 作物、R 石、B 土、H 建筑、X 其他 |
| `biome` | `{ name, dimension, id }`，如 plains / minecraft:overworld；未知时 name 为 unknown，id 为 null |
| `lightingState` | `{ sky, block }`，玩家眼前天空光/方块光，均为 0–15；数据暂不可用可发 null |
| `gameMessage` | `{ kind, text }`；kind 支持 chat / system / whisper / advancement / title / subtitle / actionbar / death，text 为解析好的字符串 |
| `gameTitleTiming` | `{ fadeIn, stay, fadeOut }`，单位为游戏 tick |
| `gameTitleClear` | 无数据；清空标题 |
| `bossBars` | 完整数组 `[{ title, progress, color }]`，progress 0–1；最多 8 条，color 为 pink / blue / red / green / yellow / purple / white；删除时也要发送，全部消失发 `[]` |
| `scoreboardState` | `{ title, rows: [{ name, value }] }`；完整侧栏快照，移除时发空 title 和空 rows |
| `worldSound` | `{ name, position, volume, pitch, category?, entityId?, seed?, fixedRange? }`；name 为原版声音事件名，position 为绝对坐标或 null。宿主从原始 sound_effect / named_sound_effect / entity_sound_effect 包统一转发，不能再重复转发 Mineflayer 的 soundEffectHeard。category 为原版混音类别；entityId 让空间声音跟随实体，seed 用于变体选择；需要另行导出并提供声音资源 |
| `worldSoundStop` | `{ name?, category? }`；转发原始 stop_sound。仅 name 停止该声音，仅 category 停止该类别，空对象停止全部；不要把参数缺失当作忽略这个事件 |
| `musicContext` | 可选 `{ name }`，宿主指定实际场景的原版音乐事件；通常省略，前端按 biome / dimension 选曲并保留播放间隔 |
| `fishingCatch` | `{ seq, atMs, item, count, position? }`；实际确认的钓获入包事件，item 为上面的统一物品格式，count 为本次获得数量，atMs 为 Unix 毫秒。不能把任意背包增量当作钓获 |
| `presentationEvent` | 原版 `particle` / `explosion` / `world_event` / `pickup` / `effect` / `cooldown` 或自定义提示事件 |
| `tacticalRoute` | `{ points: [{x,y,z}], goal: {x,y,z} 或 null, status }`，最多 64 点；任务结束发空 points 和 null goal |
| `tacticalAttack` | `{ id, name, position }`，表示真实发出的攻击指令 |
| `combatFeedback` | `{ id, amount, critical }`，真实命中的目标 ID、实际伤害和暴击；不知伤害可省略 amount，显示“命中” |

状态效果示例（durationTicks 为游戏 tick，amplifier 从 0 开始）：

```js
socket.emit('presentationEvent', {
  kind: 'effect', id: effectId, name: 'poison', title: '中毒',
  self: true, active: true, type: 'bad', amplifier: 0, durationTicks: 200,
});
// 收到移除状态包时立即清除，不等计时器猜测。
socket.emit('presentationEvent', { kind: 'effect', id: effectId, active: false });
```

`name` 使用原版效果键，支持 `minecraft:poison`、`Poison` 和 `poison` 等形式；激活时必须提供，移除时只需 `id`。中毒显示绿色生命心，反胃 `nausea` 显示状态图标、倒计时及游戏画面扭曲，字幕和 HUD 保持稳定。效果在到期、移除、断开连接或 `viewerReset` 时清除；新连接需重发当前有效效果。`durationTicks: -1` 表示无限时长。系统启用减少动态效果时，反胃保留绿色边缘提示与图标，关闭画面扭曲。

钓获与声音有独立的通用 Mineflayer 桥接示例，见 [host/README.md](host/README.md)。钓获来源同时核对本人的鱼漂、上钩、真实收竿、向施法者飞来的掉落实体、本人的 collect 包和对应背包增量。宝藏、杂物和自定义物品使用同一逻辑，不维护鱼种白名单；新浏览器连接不重放过去的钓获。

原版也在客户端生成部分声音。`presentationEvent` 的 pickup 应带 `self`、`entityId`、`collectorId` 和 `entityName`，自捡物品或经验才能播放本地拾取音。脚步使用 avatarState 的实际位置、onGround 与 surfaceBlock；digProgress 可以带真实 blockName。前端读取从本机 1.20.6 客户端导出的 block-sounds.json，区分草地、木头、雪等声音。没有已加载的方块或对应资源时保持安静，不猜材质、不声称操作成功。客户端声音会与近期同名服务端声音去重。

`inWater` 的真实变化与位移驱动入水、游泳音，首次水中快照不误报入水；`burning` 驱动着火声，熄火清掉正在播或等待中的声音。按钮/菜单仅对可信用户点击播放原版 UI 点击音；展示数据不会制造伤害、死亡或成功施法声音。

网页声音须由浏览器中的首次点击或按键解锁。音效与背景音乐可以独立开关，并有总音量、音效和音乐三个音量控制；设置仅保存在本机浏览器。长音乐以流方式播放，声音包不会进入聊天或模型上下文。

音乐在已知世界就绪后等待 10–30 秒，歌曲结束后等待 5–10 分钟，群系变化稳定 15 秒后才切换，
避免在水边抖动或无间歇重复。服务端直接指定的音乐与唱片优先于自动背景音乐。
`worldSoundStop` 同时取消尚在下载/解码的声音；viewerReset、断线与页面离开清理全部声音，
迟到的异步音频不会在新世界重放。声音状态可由 `window.cortiWorldAudio.state()` 或窗口
`mc-viewer-audio-state` 事件检查；`setVolume(category, 0..1)` 支持原版全部类别。
完整 sounds.json 导出保留所有变体、权重、音量、音高与事件引用，不只抽取部分文件。

`inventoryPreview` 由宿主的空闲行为或演出通道发送即可，不要求 Cortico 或服务器插件。真实容器、本人受伤与攻击会取消待机预览；用户按 E 或按钮打开背包后由手动界面接管，待机计时器和取消事件不会关闭手动背包。断线、切换世界及页面退出会清理待机预览。

### 只读服务资料

宿主可以把实际收到的任务看板、调查记录或服务说明转换为 `documentState`。资料与真实容器分别显示，不会执行服务器命令或产生模型上下文。

```js
socket.emit('documentState', {
  schemaVersion: 1, id: 'example:journal', title: '调查记录',
  subtitle: '当前可接的调查', source: '服务端', observedAt: Date.now(),
  sections: [{ title: '今日调查', rows: [{
    id: 'river-survey', title: '沿岸调查', body: '寻找通往小溪对岸的桥梁',
    detail: '奖励由服务端给出', status: '可接',
  }] }],
  summary: { title: '沿岸调查', body: '寻找桥梁', status: '进行中 · 1/3' },
});
```

`observedAt` 是资料接收时间的 Unix 毫秒值。显示最多 8 组、共 64 行，名称、说明和奖励均为纯文本；`summary` 为宿主确认的当前项目，没有当前项时省略。收到快照后展开 18 秒，再缩成当前项目卡片；战斗或真实容器打开时紧凑显示。观众点“查看”仅改变网页展示。断线、`viewerReset` 和页面退出清空资料，刷新后没有新快照时不显示旧资料。

资料展开时临时隐藏技能图标栏，生命、饱食度和魔力 HUD 保持显示。资料收起、战斗紧凑或清空后恢复技能栏本身的显示状态。

可选浏览器适配器 `globalThis.mcViewerGameMessagePreset(event, MinecraftViewerDocuments)` 从现有 `gameMessage` 生成显示快照；确实消费该条消息时返回 `true`，普通消息继续走原有提示。适配器在系统提示限流前运行。`MinecraftViewerDocuments.set(snapshot, { expand: true })`、`clear()` 和 `state()` 提供只读显示与核验接口。

`--preset=qiandengji` 加入千灯纪公会文字显示适配：只接受系统来源的实际看板标题、委托行、认证及进行中进度。普通聊天与私聊不会更新公会资料，动态委托 ID 来自服务端原话。它不查询 `/mycli`，不猜刷新前的内容，不把只有日期和修订号的 `mcagent:board` 通知当成完整看板。其他服务器使用自己的适配器或直接发送 `documentState`。

## 6. 可选服务器技能扩展

魔力、服务器技能和技能冷却不属于原版 Mineflayer 固有状态。前端接受通用 `skillsState` 和 `castCue`；任意服务器适配器都可提供相同结构。

```js
socket.emit('skillsState', {
  schemaVersion: 1,
  mana: { current: 80, max: 100 }, // 无权威数据用 null，不要伪造恢复
  skills: [],
  abilities: [{
    id: 'example:frost_ring', name: '霜环', level: 1,
    manaCost: 20, icon: 'snowball',
    cooldownMs: 14000, cooldownRemainingMs: 4500,
  }],
  source: 'plugin', observedAt: Date.now(),
});
socket.emit('castCue', {
  seq: 1, phase: 'succeeded', spellId: 'example:frost_ring',
  spellName: '霜环', tone: 'frost', detail: '法术已生效',
  position: { x: 10.5, y: 64, z: -20.5 },
  dimension: 'minecraft:overworld', source: 'server',
});
```

`cooldownMs` 是总冷却，`cooldownRemainingMs` 是接收快照时的剩余冷却。每次魔力变化、技能状态改变、冷却归零都发布新快照；剩余时间在前端递减显示，但魔力不会凭空估算恢复。`icon` 是可用的原版物品名。技能列表使用服务端传入的集合，不需要硬编码千灯纪的技能目录。

`castCue.phase` 分别为 `sent`、`succeeded`、`failed`。只有确认生效才发成功和成功特效。`tone` 可选择 arcane / healing / frost / fire / movement；命中技能使用命中坐标，范围技能使用中心坐标，跨维度旧事件不应重放。

千灯纪的 AgentFriend 使用 Minecraft 插件消息 `mcagent:state` / `mcagent:event`，内容是该玩家连接收到的原始 UTF-8 JSON。**宿主先解析、校验、转成上面的 Socket.IO 事件**；浏览器不直接接收 Minecraft 插件包，也不需要把 JSON 放入聊天或 Agent 的文本上下文。其他服务器可接自己的状态 API，通用画面无需安装 AgentFriend。

千灯纪具体技能 ID、人物设定及特色演出属于可选 preset/服务器适配层。通用部分只消费状态事实和表现事件，不执行 `/mycli`、不提供 AI 决策循环，也不把名称相似的普通 NPC 当作千灯纪角色。

## 7. 重连与生命周期检查

1. 每个新连接重新发送完整世界/实体/HUD/天气快照，不能依赖上一个 socket 的缓存。
2. 切换维度发送 `viewerReset`，并在新页面连接后发送新维度的区块、高度和实体。
3. 用 `{ id, delete: true }` 删除实体；删除后不能让迟到的移动增量复活旧模型。
4. 用 `null` / `[]` 明确关闭窗口、移除技能状态或清掉 boss 条，避免旧 UI 悬挂。
5. 只发送账号已收到且已加载的世界信息；画面数据本身不代表视线可见，也不应额外扫描隐藏区块。
6. 调试 JSON 留在专用状态/事件通道。`gameMessage.text` 先解析 Minecraft 文本组件，避免显示 `[object Object]`。

本协议为前端的显示输入约定。接入后的导航、战斗、背包操作和服务器权限仍由宿主项目负责。

## 8. 1.21.1 模组原生前端：SSE

本节是与前七节独立的原生显示合约。它用于锁定 Minecraft 1.21.1 / NeoForge 模组包的已有动作玩家，
复用原完整页面；不把模组网络 ID 发给 1.20.6 Socket.IO 渲染器，也不是 `mcagent:state` 的 JSON 格式。

宿主先准备资源，再绑定调用方已经建立的 Mineflayer 连接：

```js
const prepared = await prepareNativeWorldPreviewHost({ assetDirectory, port });
const host = prepared.attach({
  bot, nativeStream, simplifyNBT, resolveDimension, expectedUsername,
  getAgentStatus,             // 可选：宿主的安全摘要
  getPresentationState,       // 可选：同步读取此账号已有的原生菜单/技能观察
});
await host.listen();          // 仅回环 HTTP；不另建游戏账号
// host.close() 释放网页、订阅和计时器；bot/nativeStream 生命周期仍归调用方。
```

`nativeStream` 在该连接收到登录包前挂接，校验同包的注册表 SHA-256 与连续包序号。
网关的私有 `mcviewer:native_packet` 使用 MCNP 头和压缩 V8 信封保存原生包语义（名称、参数、注册表与序号）；
它不是浏览器直接消费的 Socket.IO 事件，也不是原始 Minecraft 包逐字转发。
原生数据先进入专用世界状态，网页再通过 SSE 接收同账号快照。兼容前门的原版代理状态不参与此渲染。

### 路径与生命周期

| HTTP 路径 | 含义 |
| --- | --- |
| `/`、`/third/`、`/dungeon/` | 原完整页面：第一人称、第三人称、地下城 2.5D 跟随相机 |
| `/index.js` | 上述页面的原生 ESM 入口 |
| `/diagnostics`、`/client.js` | 原生诊断页及其独立入口 |
| `/events` | SSE；浏览器场景唯一订阅，界面共用它的状态 |
| `/status.json` | 当前身份、本人数据、原生流与 Agent 安全摘要的只读快照 |
| `/healthz` | 当前连接与原生世界流是否就绪；不证明模型目标或完整画面成功 |

SSE 首先发送 `type: "identity"`，包含 `minecraftVersion: "1.21.1"`、`registrySha256`、
`mode: "live_same_player_connection"`、账号名、已确认的 `playerUuid` 和世界 `epoch`。
登录前 UUID 未确认时不得显示另一个账号；登录/重生后的实际身份变化会重新发送 identity。
随后发送完整 `snapshot`，以及含 `epoch / pose / selfPlayer / presentation / time / packetSequence` 的 `frame`。
快照的方块、区块、方块实体、坐标与维度来自此玩家实际收到的原生包，不读取磁盘存档或额外加载区块。

快照默认水平±24、垂直上下各24格，随维度边界裁切。`groups` 保留实际 `bounds` 内全部非空气块；
`viewCoverage` 包含 `requestedBounds / receivedColumns / clippedBy / horizontalRangeReduced / verticalRangeLimited / limits / scanWorkVoxels`。
收到列中未出现在groups的格子才可按实际空气理解，未收到列必须保持未知。
`neighbors` 的语义为 `fluid_stencil_only`：仅流体几何需要的去重邻点，不能用它作为全体积方块表。
遇到扫描、模型数量或UTF-8预算限制，缩小整个水平矩形并声明实际bounds，无法提供完整最小范围时明确不可用。
地形合并刷新至少间隔500ms，移动4格重新锚定；本人HUD帧仍每200ms采样，二者不共享过期时间。

已建立快照后，真实 `bot.physicsTick` 发送轻量 `{type:"motion", epoch, playerUuid, pose, motion}`，约20Hz。
`motion` 是 `same_player_physics_tick` 来源的连续tick状态，包含 `tick / sampledAt / tickMs:50 / walk:{speedOld,speed,position}`；
未初始化、缺tick、显式传送/死亡/重生/换维度时 `available=false`，不补造动作。
它不含 `presentation`、背包、模型决策或游戏操作；客户端校验本人UUID/epoch，只允许插值一个已知tick，
不会用浏览器时钟续走。完整快照和HUD frame也携带最近motion，以防刷新时丢失动作状态。
该通道只提供基础步态，`animationParityVerified=false`；未知entity age的idle bob、bodyYaw与攻击姿势没有回退模拟。

客户端验证注册表、账号 UUID 与 epoch；先有可信身份和快照，才消费增量。
断线、重生、换维度、注册表/序号错误或 `unavailable` 清空旧场景和本人界面，旧 epoch 的迟到 frame 不能恢复它。
不知道的数据保持 `null` 或显式不可用，不填固定血量、默认皮肤、空背包或可施放状态。

### 本人界面 `presentation`

`snapshot`、`frame` 与 `/status.json` 携带相同来源的 `presentation`：

| 字段 | 当前含义 |
| --- | --- |
| `schemaVersion / playerUuid / source` | `1`、此连接本人的 UUID、`"same_player_connection"`；内嵌对象若声明 UUID 也必须相同 |
| `available / reason / sampledAt` | 本人状态是否可用、不可用原因、宿主采样 Unix 毫秒 |
| `self` | 真实位置/姿态、生命与已收到的最大生命属性、饥饿/饱和、氧气、护甲、经验与快捷栏选择；未解析属性为 null |
| `inventory` | 仅确认本人 window 0、`minecraft:inventory` 且 46 格后提供；热栏 36–44、主背包 9–35、副手 45 |
| `nativeMenu` | 当前真实原生窗口 ID、stateId、menuType、全部槽位、游标及可取/槽位角色；未知标题为 null |
| `skills` | 本人已收到的 Ars 回执：魔力、法术目录、来源、observedAt 与 stale；未知冷却为 null |
| `nativeState` | 可选原生数据回调是否通过校验；即使 self 已知，未提供菜单/技能时也可能 available=false |
| `gameMessages / title / actionbar` | 此游戏连接实际收到的消息、标题、动作栏；纯文本、安全有界，重生/断线清空 |
| `time / weather` | 此连接收到的时间、雨与雷状态；未知值保留 null |

原生槽位格式为 `{ slot, item: null | { name: "namespace:item", count, snbt } }`。
`name` 保留原生命名空间，`snbt` 保留物品完整原生组件；不使用 Mineflayer 前门代理背包代替。
打开通用容器时保留原始槽位布局，不按总格数猜测其中哪部分是玩家背包；缺少已确认的 window 0 时 `inventory=null`。
浏览器背包、菜单和物品详情是只读展示，点击、视角切换和 F5 不会调用游戏物品点击或施法。

`createNativePlayerPresentation({ playerUuid, menu, spellState, spellCatalog, spellObservedAt })` 可从宿主已有观察生成上述可选数据。
它不额外查询模型或游戏；目录只在本人当前持物与实际回执一致时显示。技能读数超过 5 秒或持物变化时标 stale，
`cooldownMs / cooldownRemainingMs` 未取得时保持 null，不能由旧回执推算技能可用。

回调必须同步返回 schemaVersion 1 与本人 UUID；Promise、循环对象、越界数据或其他玩家的嵌套 UUID 全部拒绝。
回调只提取 `inventory / nativeMenu / skills`，不转发任意配置、模型任务、prompt 或凭据。
每条字符串最多 65536 字符、数组最多 256 项，回调整体 UTF-8 JSON 仍最多 64 KiB、完整 presentation 最多 128 KiB；
超限明确不可用，不截断组件后伪装成完整物品。

### 展示与维护边界

原生生存 HUD 使用同一模组资产清单中经哈希验证的原始 1.21.1 GUI PNG。
有限的原版静态物品图标从原始 generated/handheld JSON 与单层 PNG 解析；模组颜色/模型提供器、组件敏感、动态 override、
动画、多层与未知 GUI 变换未支持时保留原生名称和 SNBT。泥土、橡木原木、圆石另外支持经原客户端核对的六面立方模型、
原始纹理、GUI变换和光照；此白名单不扩展到组件敏感或模组物品，像素一致性仍未验收。
原背包人物预览只克隆真实本人 actor，无默认人物回退。
专用物品provider可读取完整原生SNBT：Ars旧笔记本和三级法术书按原闭合Gecko模型/GUI规则显示，
读取BASE_COLOR选择纹理；已核实的女仆Patchouli书按patchouli:book选择原模型，空魂符使用原generated模型。
版本/来源不匹配、资源冲突、未知视觉组件或未移植的专用规则继续拒绝。缓存以完整SNBT区分数字tag类型和书/颜色状态，
不把另一个玩家的组件或普通书贴图当作原物品。这里的GUI支持不意味着手持模型、书页或完整像素一致性已经验收。
地下城相机的遮挡/切面/点击操控、装备/持物、声音、音乐、小地图、完整实体和整体画面一致性仍未验收。
复用钓获组件及待机预览 API 不代表宿主已发送真实钓获或待机事件。

宿主仅监听回环，拒绝非 GET、异源 Host/Origin；同源资源通过清单哈希读取，SSE 最多四个客户端、单事件最多 2 MiB。
遇到背压不继续排队堆积增量，按下一次完整快照恢复；关闭页面/宿主清理订阅、资源 URL 和计时器。
维护需分别验证身份/组件/生命周期回归、真实浏览器、匹配模组 Java 客户端画面对照及持续运行。
`completeSceneParityVerified=false` 保持关闭，网络完整与资源完整不能代替最终视觉一致。

2026-10-04 新 My Agent World 已使用这套合约实际发布完整页面；同账号身份、真实 46 格背包/本人预览、
三种视角、实际生命与 Ars 魔力在浏览器验过，页面无 warn/error。此部署记录不扩大本节的支持范围；
完整实体、装备、动画、光照、声音、持续运行及新服基岩连接仍需独立验收。
