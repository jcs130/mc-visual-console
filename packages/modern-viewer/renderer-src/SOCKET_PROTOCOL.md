# 现代渲染器接入协议（Minecraft Java 1.20.6）

本文对应 `src/modern-viewer/client.js` 和 `tools/minecraft-viewer-*.js` 构建出的前端。它说明另一个 Mineflayer 项目需要提供什么数据；不要求使用 Cortico，也不要求连接千灯纪。

**这里是浏览器与画面服务之间的 Socket.IO 协议，不是 Minecraft 网络包协议。** 需要由宿主把 Mineflayer 状态和收到的游戏包转换成下面的事件。仓库中较早的 `../src/mc-modern-viewer.mts` 有自己的 1.21.1 宿主实现，并不提供本文全部 1.20.6 功能。

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
