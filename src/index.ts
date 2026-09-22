/**
 * mc-viewer 入口。
 *
 * 宿主用法（两端都一样）：
 *   const viewer = attach(bot, { viewDistance: 6 })
 *   viewer.handler(req, res)        // 把 HTTP 路由接到自己的 server 上
 *   viewer.http.on('upgrade', …)    // WS 升级也走 handler 所在的 server
 */

export { attach } from './server.ts'
export type { Viewer, ViewerOptions } from './server.ts'
export type { ViewerBot, BotSelf } from './adapter.ts'
export {
  DEFAULT_BUDGET,
  HOLDER_ONLY,
  PROTOCOL_VERSION,
  isClientCommand,
  isServerMessage,
} from './protocol.ts'
export type {
  ActionHow, BlockEntry, BotState, Budget, CameraMode, ClientCommand, EntityLike,
  ErrorCode, ServerMessage, StateSnapshot, Vec3Tuple,
} from './protocol.ts'
