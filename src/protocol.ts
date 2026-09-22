/**
 * 协议类型 —— 与 docs/PROTOCOL.md 一一对应。
 *
 * 改这里的字段，必须同步改那份文档；破坏性改动要抬 protocol 号，
 * 并在 hello 里让客户端能自己发现"版本不匹配"。
 */

/** 协议号；破坏性改动 +1 */
export const PROTOCOL_VERSION = 0 as const

export type Vec3Tuple = [number, number, number]

/** 预算：客户端据此降级，服务端据此丢增量而不丢连接 */
export interface Budget {
  /** 同时允许的观战连接数 */
  maxSessions: number
  /** 状态合并频率（Hz）；10 表示约 100ms 一帧 */
  stateHz: number
  /** 单帧最多带多少实体 */
  maxEntities: number
  /** 单个区块列最多带多少方块 */
  maxBlocksPerChunk: number
}

export const DEFAULT_BUDGET: Budget = {
  maxSessions: 4,
  stateHz: 10,
  maxEntities: 200,
  maxBlocksPerChunk: 4096,
}

/** 实体（玩家、生物、掉落物…）；字段取"能渲染 + 能悬停识别"的最小集 */
export interface EntityLike {
  /** 稳定 id（string 或 number 都接受，内部统一转 string） */
  id: string | number
  /** mineflayer 的实体名，如 'player' / 'zombie' / 'item' */
  name: string
  /** 玩家名（仅玩家） */
  username?: string
  position: Vec3Tuple
  yaw?: number
  pitch?: number
  /** 血量（可见时） */
  health?: number
  /** 是否是自己 */
  self?: boolean
}

/** 稀疏方块条目 */
export interface BlockEntry {
  pos: Vec3Tuple
  name: string
  states?: Record<string, unknown>
}

export interface BotState {
  username: string
  position: Vec3Tuple
  yaw: number
  pitch: number
  health?: number
  food?: number
}

/** 完整快照：连接建立时给一次，之后只吃增量 */
export interface StateSnapshot {
  seq: number
  bot: BotState
  /** 当前接管持有者；null = 无人接管（只读观战） */
  holder: string | null
  viewDistance: number
  entities: EntityLike[]
  blocks: BlockEntry[]
  budget: Budget
}

/** 服务端 → 客户端 */
export type ServerMessage =
  | { type: 'hello'; protocol: typeof PROTOCOL_VERSION; snapshot: StateSnapshot }
  | { type: 'delta'; seq: number; bot?: Partial<BotState>; entities?: EntityLike[]; blocks?: BlockEntry[] }
  | { type: 'holder'; holder: string | null; reason?: string }
  | { type: 'notice'; level: 'info' | 'warn'; text: string }
  | { type: 'error'; id?: string; code: ErrorCode; message: string }

export type ErrorCode =
  | 'not_holder'
  | 'not_supported'
  | 'bad_request'
  | 'too_many_sessions'
  | 'internal'

/** 客户端 → 服务端 */
export type ClientCommand =
  | { type: 'claim'; id?: string; as: string; force?: boolean }
  | { type: 'release'; id?: string; as: string }
  | { type: 'moveTo'; id?: string; x: number; z: number; y?: number; range?: number }
  | { type: 'lookAt'; id?: string; x: number; y: number; z: number }
  | { type: 'action'; id?: string; on: string | number; how: ActionHow }
  | { type: 'camera'; id?: string; mode: CameraMode; fov?: number }
  | { type: 'set'; id?: string; viewDistance?: number; stateHz?: number }

/** 右键 / 长按菜单的四个动作 */
export type ActionHow = 'detail' | 'approach' | 'attack' | 'use'
export type CameraMode = 'follow' | 'free' | 'first'

/** 需要持有接管的命令（其余命令任何人都能发） */
export const HOLDER_ONLY = new Set<ClientCommand['type']>([
  'moveTo',
  'lookAt',
  'action',
  'camera',
  'set',
])

export function isServerMessage(value: unknown): value is ServerMessage {
  if (typeof value !== 'object' || value === null) return false
  const t = (value as { type?: unknown }).type
  return t === 'hello' || t === 'delta' || t === 'holder' || t === 'notice' || t === 'error'
}

export function isClientCommand(value: unknown): value is ClientCommand {
  if (typeof value !== 'object' || value === null) return false
  const t = (value as { type?: unknown }).type
  return (
    t === 'claim' || t === 'release' || t === 'moveTo' || t === 'lookAt' ||
    t === 'action' || t === 'camera' || t === 'set'
  )
}
