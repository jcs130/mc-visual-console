# 接缝协议（v0，草案）

本组件对外的**全部**接口就是这份文档。两个消费者（Cortico 的 World 扩展、dsh 的插件）都只依赖这里写死的东西；
组件内部怎么实现、用什么渲染，都不在协议范围内。

设计原则（照 Cortico 的 `AGENTS.md` 借来）：
**Minimal priors** —— 能用语义指令让模型/操作者自行判断的，不写死控制流；
**Design toward the frontier** —— 为绕过当前模型局限而存在的机制，必须在命名里就写成 fallback。

---

## 一、上游：它需要"一个像 mineflayer bot 的对象"

组件不要求真的 `mineflayer`，只要求一个满足下面这组能力的对象（`ViewerBot`）。
这样测试可以用脚本化假 bot，不必连服务器。

```ts
export interface ViewerBot {
  /** 稳定标识；同名重连视作同一个 bot */
  readonly username: string
  /** 世界：读取方块与维度信息 */
  world: {
    getBlock(pos: Vec3): { name: string; boundingBox: string } | null
    /** 可选：批量取区块（缺省时组件逐块取，慢但能跑） */
    getColumn?(x: number, z: number): unknown
  }
  /** 自述状态 */
  entity: {
    position: Vec3
    yaw: number
    pitch: number
    health?: number
    food?: number
  }
  entities: Record<string, EntityLike>   // 含玩家与生物；EntityLike 见 src/adapter.ts
  players: Record<string, { username: string; entity?: EntityLike }>
  /** 动作（缺省某个动作时，对应命令返回 not_supported，而不是抛错） */
  look?(yaw: number, pitch: number): Promise<void>
  /** 点地移动：走到某个方块附近；组件的 y 解析交给实现 */
  goto?(x: number, y: number, z: number, opts?: { range?: number }): Promise<void>
  attack?(entityId: string | number): Promise<void>
  activateEntity?(entityId: string | number): Promise<void>
  /** 事件（playerJoined/entitySpawned/blockUpdate/…）：组件靠它推增量 */
  on(event: string, handler: (...args: unknown[]) => void): void
  removeListener?(event: string, handler: (...args: unknown[]) => void): void
}
```

组件**不**自己决定"谁能接管"——那是宿主（Cortico 的 World / dsh 的插件）的事；
组件只负责记录当前持有者并拒绝非持有者的操作。

---

## 二、HTTP

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 客户端页面（单页） |
| GET | `/assets/*` | 静态资产（渲染器、贴图、样式） |
| GET | `/state` | 当前完整状态快照（断线重连时先用它对齐，再吃增量） |
| GET | `/health` | `200` + `{ ok, bot, viewers, holder }`；宿主用它判活 |
| POST | `/command` | 提交一条命令（见第三节）；无 WS 时的兜底通道 |

快照形状 `StateSnapshot`：

```ts
export interface StateSnapshot {
  /** 递增；客户端据此判断自己是否落后 */
  seq: number
  bot: { username: string; position: [number, number, number]; yaw: number; pitch: number; health?: number; food?: number }
  /** 当前接管持有者；null 表示无人接管（只读观战） */
  holder: string | null
  /** 视野半径（方块） */
  viewDistance: number
  /** 已加载的实体（增量里只带变化） */
  entities: Array<EntityLike>
  /** 已加载的方块（稀疏；客户端可请求补块） */
  blocks: Array<{ pos: [number, number, number]; name: string; states?: Record<string, unknown> }>
  /** 服务端自报的预算，客户端据此降级（对齐千灯纪 modern-viewer 的做法） */
  budget: { maxSessions: number; stateHz: number; maxEntities: number; maxBlocksPerChunk: number }
}
```

---

## 三、WebSocket（一条连接，双向）

同一条 WS：服务端**推状态**，客户端**发命令**。消息都是 JSON，`type` 字段判别（照 Cortico 的事件信封习惯）。

### 服务端 → 客户端

| type | 载荷 | 时机 |
|---|---|---|
| `hello` | `{ protocol: 0, snapshot: StateSnapshot }` | 连接建立即发，代替单独的 /state 请求 |
| `delta` | `{ seq, entities?, blocks?, bot? }` | 状态变化；**约 100ms 合并一次**发（`stateHz`），不逐事件抖 |
| `holder` | `{ holder: string \| null, reason?: string }` | 接管权变更（含被抢占、超时释放） |
| `notice` | `{ level: 'info' \| 'warn', text }` | 给人看的提示（例如"你的操作已过期"） |
| `error` | `{ id?, code, message }` | 命令失败；`id` 对应客户端的 `id` |

节拍与预算：默认 `stateHz=10`（100ms 合并窗口）、`viewDistance=6`、`maxEntities=200`、`maxBlocksPerChunk=…`；
超出预算时**丢增量不丢连接**，并在 `notice` 里说明。

### 客户端 → 服务端（命令）

| type | 载荷 | 语义 |
|---|---|---|
| `claim` | `{ force?: boolean }` | 请求接管；**身份由服务端按连接分配**（客户端自报可伪造，故 `as` 仅供备注）；同一时刻只有一个持有者，抢占需带 `force: true` |
| `release` | `{}` | 释放接管（只释放自己那份）|
| `moveTo` | `{ x: number, z: number, y?: number, range?: number }` | **点地移动**：走到该处（y 缺省由实现解析地表） |
| `lookAt` | `{ x, y, z }` | 转头看某点 |
| `action` | `{ on: string \| number, how: 'detail' \| 'approach' \| 'attack' \| 'use' }` | 右键/长按菜单的四个动作 |
| `camera` | `{ mode: 'follow' \| 'free' \| 'first'; fov?: number }` | 镜头 |
| `set` | `{ viewDistance?: number; stateHz?: number }` | 客户端按自己的性能调低预算 |

每条命令可带 `id`（任意字符串）；服务端在 `error` 或对应的 `delta`/`notice` 里回带它。

**权限**：非当前持有者发来的 `moveTo` / `action` / `lookAt` / `camera` / `set` 一律拒绝（`error.code='not_holder'`）；
`claim` / `release` 永远允许。**读**（快照、增量）不要求持有权——观战是默认权利。

---

## 四、宿主需要实现的（两端各一层薄壳）

宿主只做三件事，不做第四件：

1. **把 bot 递进来**：`attach(bot, opts)`；
2. **转发**：Cortico 用 `console().stream()` 把 `delta` 转出去、用 `invoke()` 收命令；
   dsh 用插件的 webServer 路由把 HTTP 与 WS 挂上；
3. **判活**：定时打 `/health`（组件不主动通知宿主）。

**不应该**做的事：宿主不解析渲染器、不碰协议内部、不在组件里塞业务语义。
业务语义（"谁在什么条件下能接管""走到哪里算危险"）属于宿主，不属于组件。

---

## 五、兼容与版本

- 协议号从 `0` 起；破坏性改动**必须**进 `hello`，客户端据此提示"版本不匹配"而不是静默错乱。
- 组件的渲染层实现可以整体替换（fork 或自研），只要协议不变，两个消费者都不用改。
