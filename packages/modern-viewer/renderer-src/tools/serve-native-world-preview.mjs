import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { prepareNativeWorldPreviewHost, parseNativeWorldPreviewArguments } from './native-world-preview-host.mjs'

// CLI-compatible QA wrapper. Production callers prepare/attach the HTTP host
// around their existing action bot instead of launching this separate client.
const { assetDirectory, nativePacketFile, username, gamePort, port } = parseNativeWorldPreviewArguments(process.argv.slice(2))
const prepared = await prepareNativeWorldPreviewHost({ assetDirectory, port })
const nativePackets = await import(pathToFileURL(path.resolve(nativePacketFile)))
const requireGame = createRequire(path.resolve(nativePacketFile))
const mineflayer = requireGame('mineflayer'), nbt = requireGame('prismarine-nbt')
let bot, world, stream, host, closed = false
bot = mineflayer.createBot({ host: '127.0.0.1', port: gamePort, username, version: '1.21.1', auth: 'offline', hideErrors: true })
stream = nativePackets.attachNativeViewerPackets(bot, prepared.registrySha256)
host = prepared.attach({ bot, nativeStream: stream, simplifyNBT: nbt.simplify, expectedUsername: username })
world = host.world
bot.once('spawn', () => console.log('NATIVE_WORLD_PLAYER ' + JSON.stringify({ username: bot.username, position: bot.entity.position, game: bot.game })))
try { await host.listen() } catch (error) {
  await host.close(); stream.detach(); bot.quit('native world preview failed'); throw error
}
console.log(`Native live world inspection: ${host.url} (QA action account ${username}; scene parity not yet accepted)`)
function shutdown () {
  if (closed) return
  closed = true; stream?.detach(); bot?.quit('native world preview stopped')
  void host.close().then(() => process.exit(0))
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown)

// Diagnostic harnesses can act through this same bot. The web surface is GET
// only; its reusable host owns neither the bot nor its native packet stream.
export { bot, world }
