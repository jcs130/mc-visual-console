import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { NativeWorldState, loadNativeStateRegistry, attachNativeWorld } from './native-world-host.mjs'

// Isolated QA launcher. Applications should attachNativeWorld to their existing
// action bot. This read-only HTTP service never creates a second MC observer.
const [assetDirectory, nativePacketFile, username = 'MawWebRenderQA', gamePortString = '28980', portString = '28983'] = process.argv.slice(2)
if (!assetDirectory || !nativePacketFile) throw Error('Usage: node tools/serve-native-world-preview.mjs <native-assets-dir> <native-packet.cjs> [qa-player] [loopback-game-port] [loopback-http-port]')
const gamePort = Number(gamePortString), port = Number(portString)
if (![gamePort, port].every(p => Number.isInteger(p) && p >= 1024 && p <= 65535)) throw Error('NATIVE_WORLD_PORT_INVALID')
if (!/^[A-Za-z0-9_]{1,16}$/.test(username)) throw Error('NATIVE_WORLD_PLAYER_INVALID')
const root = await fs.realpath(assetDirectory)
const manifest = JSON.parse(await fs.readFile(path.join(root, 'native-assets.json'), 'utf8'))
if (manifest.minecraftVersion !== '1.21.1' || !manifest.assetIntegrityVerified) throw Error('NATIVE_WORLD_ASSETS_INVALID')
const hash = manifest.registryHashes['block-states.jsonl']
const states = loadNativeStateRegistry(await fs.readFile(path.join(root, 'registry/block-states.jsonl')), hash)
const nativePackets = await import(pathToFileURL(path.resolve(nativePacketFile)))
const requireGame = createRequire(path.resolve(nativePacketFile))
const mineflayer = requireGame('mineflayer'), nbt = requireGame('prismarine-nbt')
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/native-viewer')
const bundle = (await build({ entryPoints: [path.join(source, 'world-preview.js')], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022' })).outputFiles[0].contents
const page = await fs.readFile(path.join(source, 'world-preview.html'))
const manifestBytes = Buffer.from(JSON.stringify(manifest))
let bot, world, stream, detach, closed = false, snapshotDirty = true
const clients = new Set()
const server = http.createServer(async (request, response) => {
  try {
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(request.headers.host) ||
        (request.headers.origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(request.headers.origin))) { response.writeHead(403); response.end(); return }
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return }
    const requestPath = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname).slice(1)
    if (requestPath === 'events') {
      if (clients.size >= 4) { response.writeHead(429); response.end(); return }
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
      const client = { response, blocked: false, needsSnapshot: true, missedWorld: false }
      clients.add(client)
      response.on('drain', () => { client.blocked = false; client.needsSnapshot ||= client.missedWorld; client.missedWorld = false })
      response.on('close', () => clients.delete(client))
      send(client, { type: 'identity', player: username, minecraftVersion: '1.21.1', registrySha256: hash, mode: 'live_same_player_connection' })
      return
    }
    let bytes, type
    if (!requestPath) { bytes = page; type = 'text/html; charset=utf-8' }
    else if (requestPath === 'client.js') { bytes = bundle; type = 'text/javascript; charset=utf-8' }
    else if (requestPath === 'manifest.json') { bytes = manifestBytes; type = 'application/json' }
    else if (Object.hasOwn(manifest.assets, requestPath) && !requestPath.split('/').some(p => ['', '.', '..'].includes(p))) {
      const file = await fs.realpath(path.join(root, requestPath))
      if (!file.startsWith(`${root}${path.sep}`)) throw Error('NATIVE_WORLD_ASSET_PATH_ESCAPE')
      bytes = await fs.readFile(file)
      type = file.endsWith('.png') ? 'image/png' : 'application/json'
    } else { response.writeHead(404); response.end(); return }
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; img-src 'self' blob:; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'" })
    response.end(bytes)
  } catch (error) { response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(error.message) }
})
function send (client, message) {
  if (client.blocked || client.response.destroyed) return
  const text = JSON.stringify(message)
  if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw Error('NATIVE_WORLD_HTTP_MESSAGE_TOO_LARGE')
  client.blocked = !client.response.write(`data: ${text}\n\n`)
}
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
bot = mineflayer.createBot({ host: '127.0.0.1', port: gamePort, username, version: '1.21.1', auth: 'offline', hideErrors: true })
world = new NativeWorldState({ states, registrySha256: hash, simplifyNBT: nbt.simplify,
  resolveDimension: p => {
    const type = typeof p.dimension === 'number' ? bot.registry.dimensionsArray[p.dimension] : bot.registry.dimensionsByName[String(p.dimension).replace('minecraft:', '')]
    return type && { name: p.name || p.worldName || type.name, minY: type.minY, height: type.height }
  } })
stream = nativePackets.attachNativeViewerPackets(bot, hash)
detach = attachNativeWorld({ bot, nativeStream: stream, world })
let lastCenter = null
world.on('world', () => { snapshotDirty = true })
world.on('reset', () => { snapshotDirty = true; lastCenter = null })
world.on('pose', () => {
  const c = `${Math.floor(world.pose.x)},${Math.floor(world.pose.y)},${Math.floor(world.pose.z)}`
  if (lastCenter !== c) { lastCenter = c; snapshotDirty = true }
})
world.on('unavailable', reason => { for (const client of clients) send(client, { type: 'unavailable', reason }); console.error('NATIVE_WORLD_UNAVAILABLE ' + reason) })
bot.on('error', error => world.unavailable(error))
bot.on('kicked', reason => world.unavailable(Error('NATIVE_WORLD_PLAYER_KICKED:' + JSON.stringify(reason))))
bot.once('spawn', () => console.log('NATIVE_WORLD_PLAYER ' + JSON.stringify({ username: bot.username, position: bot.entity.position, game: bot.game })))
const timer = setInterval(() => {
  if (closed) return
  try {
    const snapshot = snapshotDirty || [...clients].some(c => c.needsSnapshot) ? world.snapshot() : null
    for (const client of clients) {
      if (client.blocked) { client.missedWorld ||= snapshotDirty; continue }
      if (snapshot || client.needsSnapshot) { send(client, snapshot || world.snapshot()); client.needsSnapshot = false }
      else send(client, { type: world.error ? 'unavailable' : 'frame', reason: world.error, epoch: world.epoch, pose: world.pose, time: world.time, packetSequence: world.lastSequence })
    }
    snapshotDirty = false
  } catch (error) { world.unavailable(error) }
}, 200)
timer.unref()
console.log(`Native live world inspection: http://127.0.0.1:${port}/ (QA action account ${username}; scene parity not yet accepted)`)
function shutdown () {
  if (closed) return
  closed = true; clearInterval(timer); detach?.(); stream?.detach(); bot?.quit('native world preview stopped')
  for (const client of clients) client.response.end()
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown)

// Diagnostic harnesses can act through this very same bot; the HTTP surface
// remains read-only and never accepts action requests.
export { bot, world }
