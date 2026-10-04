import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { NativeWorldState, loadNativeStateRegistry, attachNativeWorld } from './native-world-host.mjs'

const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/native-viewer')
const MAX_EVENT_BYTES = 2 * 1024 * 1024, MAX_AGENT_BYTES = 65536
const CSP = "default-src 'self'; script-src 'self'; img-src 'self' blob:; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"
const SHA256 = /^[a-f0-9]{64}$/
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
// DefaultPlayerSkin.get(UUID), matched to the original 1.21.1 client. The
// client's order is all nine slim skins, then all nine wide skins.
const DEFAULT_PLAYER_SKINS = ['alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'steve', 'sunny', 'zuri']
const finiteNumber = value => Number.isFinite(value) ? value : null
const vector = value => value && [value.x, value.y, value.z].every(Number.isFinite) ? { x: value.x, y: value.y, z: value.z } : null

function defaultPlayerSkin (uuid, manifest) {
  const hex = uuid.replaceAll('-', '')
  // java.util.UUID.hashCode folds the four 32-bit words into a signed int.
  const hash = [0, 8, 16, 24].reduce((value, offset) => value ^ Number.parseInt(hex.slice(offset, offset + 8), 16), 0)
  const index = ((hash % 18) + 18) % 18, model = index < 9 ? 'slim' : 'wide'
  const assetPath = `assets/minecraft/textures/entity/player/${model}/${DEFAULT_PLAYER_SKINS[index % 9]}.png`
  const asset = manifest.assets[assetPath]
  if (!SHA256.test(asset?.sha256 || '') || !Number.isSafeInteger(asset?.bytes) || asset.bytes <= 0) return { kind: 'unavailable', reason: 'DEFAULT_PLAYER_SKIN_ASSET_MISSING' }
  return { kind: 'default', model, assetPath, sha256: asset.sha256 }
}

function maximumHealth (entity) {
  const attributes = entity?.attributes
  const attribute = attributes?.['minecraft:generic.max_health'] || attributes?.['generic.max_health'] || attributes?.['minecraft:max_health'] || attributes?.max_health
  if (!attribute || !Number.isFinite(attribute.value)) return null
  const modifiers = attribute.modifiers ?? []
  if (!Array.isArray(modifiers) || modifiers.some(m => !Number.isFinite(m?.amount) || ![0, 1, 2].includes(m.operation))) return null
  const base = modifiers.filter(m => m.operation === 0).reduce((value, m) => value + m.amount, attribute.value)
  const multipliedBase = modifiers.filter(m => m.operation === 1).reduce((value, m) => value + base * m.amount, base)
  const result = modifiers.filter(m => m.operation === 2).reduce((value, m) => value * (1 + m.amount), multipliedBase)
  // The matched vanilla max_health attribute bounds its effective value.
  return Number.isFinite(result) ? Math.max(1, Math.min(1024, result)) : null
}

export function parseNativeWorldPreviewArguments (args) {
  const [assetDirectory, nativePacketFile, username = 'MawWebRenderQA', gamePortString = '28980', portString = '28983'] = args
  if (!assetDirectory || !nativePacketFile) throw Error('Usage: node tools/serve-native-world-preview.mjs <native-assets-dir> <native-packet.cjs> [qa-player] [loopback-game-port] [loopback-http-port]')
  const gamePort = Number(gamePortString), port = Number(portString)
  if (![gamePort, port].every(p => Number.isInteger(p) && p >= 1024 && p <= 65535)) throw Error('NATIVE_WORLD_PORT_INVALID')
  if (!/^[A-Za-z0-9_]{1,16}$/.test(username)) throw Error('NATIVE_WORLD_PLAYER_INVALID')
  return { assetDirectory, nativePacketFile, username, gamePort, port }
}

// A write returning false still queues its bytes. Stop until drain rather than
// accumulating more frames behind a slow browser.
export function sendNativeWorldEvent (client, message) {
  if (client.blocked || client.response.destroyed) return false
  const text = JSON.stringify(message)
  if (Buffer.byteLength(text) > MAX_EVENT_BYTES) throw Error('NATIVE_WORLD_HTTP_MESSAGE_TOO_LARGE')
  client.blocked = !client.response.write(`data: ${text}\n\n`)
  return true
}

function injectedAgentStatus (getAgentStatus, now) {
  if (!getAgentStatus) return { available: false, source: 'caller_injected', reason: 'AGENT_STATUS_NOT_PROVIDED' }
  try {
    const value = getAgentStatus()
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.then === 'function') throw Error('AGENT_STATUS_INVALID')
    let nodes = 0
    const seen = new WeakSet()
    function validate (part, depth = 0) {
      if (++nodes > 4096 || depth > 12) throw Error('AGENT_STATUS_TOO_LARGE')
      if (part === null || typeof part === 'boolean') return
      if (typeof part === 'number' && Number.isFinite(part)) return
      if (typeof part === 'string' && part.length <= 8192) return
      if (typeof part !== 'object' || seen.has(part)) throw Error('AGENT_STATUS_INVALID')
      seen.add(part)
      if (Array.isArray(part)) {
        if (part.length > 256) throw Error('AGENT_STATUS_TOO_LARGE')
        for (const entry of part) validate(entry, depth + 1)
      } else {
        if (![Object.prototype, null].includes(Object.getPrototypeOf(part))) throw Error('AGENT_STATUS_INVALID')
        const keys = Object.keys(part)
        if (keys.length > 128 || keys.some(key => key.length > 256)) throw Error('AGENT_STATUS_TOO_LARGE')
        for (const key of keys) validate(part[key], depth + 1)
      }
      seen.delete(part)
    }
    validate(value)
    const text = JSON.stringify(value)
    if (Buffer.byteLength(text) > MAX_AGENT_BYTES) throw Error('AGENT_STATUS_TOO_LARGE')
    return { available: true, source: 'caller_injected', sampledAt: now(), details: JSON.parse(text) }
  } catch (error) {
    const reason = ['AGENT_STATUS_INVALID', 'AGENT_STATUS_TOO_LARGE'].includes(error?.message) ? error.message : 'AGENT_STATUS_UNAVAILABLE'
    return { available: false, source: 'caller_injected', reason }
  }
}

// Prepare before createBot(), then attach synchronously before login packets.
// Preparation creates no Minecraft client, listening socket or signal handler.
export async function prepareNativeWorldPreviewHost ({ assetDirectory, port = 28983 }) {
  if (!Number.isInteger(port) || (port !== 0 && (port < 1024 || port > 65535))) throw Error('NATIVE_WORLD_PORT_INVALID')
  const root = await fs.realpath(assetDirectory)
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'native-assets.json'), 'utf8'))
  if (manifest.minecraftVersion !== '1.21.1' || manifest.assetIntegrityVerified !== true || !manifest.assets || !manifest.registryHashes) throw Error('NATIVE_WORLD_ASSETS_INVALID')
  const hash = manifest.registryHashes['block-states.jsonl']
  if (!SHA256.test(hash || '')) throw Error('NATIVE_WORLD_REGISTRY_HASH_INVALID')
  const states = loadNativeStateRegistry(await fs.readFile(path.join(root, 'registry/block-states.jsonl')), hash)
  const bundle = (await build({ entryPoints: [path.join(SOURCE, 'world-preview.js')], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022' })).outputFiles[0].contents
  const page = await fs.readFile(path.join(SOURCE, 'world-preview.html'))
  const manifestBytes = Buffer.from(JSON.stringify(manifest))
  return {
    registrySha256: hash,
    attach ({ bot, nativeStream, simplifyNBT, resolveDimension, expectedUsername, getAgentStatus = null, logger = console, now = Date.now }) {
      // Mineflayer 4.37.1 fills bot.username in its login plugin. Attach before
      // that packet using the caller's createBot username, then verify it.
      const username = bot?.username || expectedUsername
      if (!bot || !/^[A-Za-z0-9_]{1,16}$/.test(username || '') || !bot.on || !bot.off || !bot._client?.on || !nativeStream?.events?.on || typeof simplifyNBT !== 'function') throw Error('NATIVE_WORLD_ATTACHMENT_INVALID')
      if (expectedUsername !== undefined && (!/^[A-Za-z0-9_]{1,16}$/.test(expectedUsername) || (bot.username && bot.username !== expectedUsername))) throw Error('NATIVE_WORLD_ATTACHMENT_IDENTITY_MISMATCH')
      if (getAgentStatus !== null && typeof getAgentStatus !== 'function') throw Error('AGENT_STATUS_PROVIDER_INVALID')
      const world = new NativeWorldState({ states, registrySha256: hash, simplifyNBT, now,
        resolveDimension: resolveDimension || (p => {
          const type = typeof p.dimension === 'number' ? bot.registry.dimensionsArray[p.dimension] : bot.registry.dimensionsByName[String(p.dimension).replace('minecraft:', '')]
          return type && { name: p.name || p.worldName || type.name, minY: type.minY, height: type.height }
        }) })
      const detach = attachNativeWorld({ bot, nativeStream, world })
      const clients = new Set()
      let closed = false, closing = null, listening = null, currentPort = port, snapshotDirty = true, lastCenter = null, connectionEnded = false, identityConfirmed = Boolean(bot.username)
      let receivedProfile = null
      const ownProfile = () => {
        const uuid = bot._client.uuid
        if (!UUID.test(uuid || '') || !identityConfirmed || connectionEnded || world.error) return { available: false, hasCustomTextures: null }
        if (receivedProfile?.uuid === uuid.toLowerCase()) return { available: true, hasCustomTextures: receivedProfile.hasCustomTextures }
        // Also support attaching to an already logged-in caller. Mineflayer's
        // public profile is usable only after its UUID has matched this client.
        const player = [bot.players?.[username], bot.player].find(p => typeof p?.uuid === 'string' && p.uuid.toLowerCase() === uuid.toLowerCase() && p.username === username)
        if (!player) return { available: false, hasCustomTextures: null }
        return { available: true, hasCustomTextures: Boolean(player.skinData) }
      }
      const selfPlayer = () => {
        const uuid = bot._client.uuid, entity = bot.entity
        if (!identityConfirmed || closed || connectionEnded || world.error || !UUID.test(uuid || '') ||
            (bot.username || bot._client.username) !== username || (entity?.username && entity.username !== username) ||
            (entity?.uuid && (typeof entity.uuid !== 'string' || entity.uuid.toLowerCase() !== uuid.toLowerCase())) ||
            !Number.isSafeInteger(entity?.id) || entity.isValid === false || !vector(entity.position)) return null
        const profile = ownProfile()
        const skin = profile.hasCustomTextures === false ? defaultPlayerSkin(uuid, manifest) : {
          kind: 'unavailable', reason: profile.hasCustomTextures === true ? 'CUSTOM_PLAYER_SKIN_NOT_RESOLVED' : 'PLAYER_SKIN_PROFILE_UNAVAILABLE'
        }
        return { uuid: uuid.toLowerCase(), name: username, entityId: entity.id, position: vector(entity.position),
          yaw: finiteNumber(entity.yaw), pitch: finiteNumber(entity.pitch), eyeHeight: finiteNumber(entity.eyeHeight),
          health: finiteNumber(bot.health), maxHealth: maximumHealth(entity), food: finiteNumber(bot.food),
          onGround: typeof entity.onGround === 'boolean' ? entity.onGround : null,
          sneaking: typeof entity.crouching === 'boolean' ? entity.crouching : null, velocity: vector(entity.velocity), skin }
      }
      const identity = () => ({ player: username, confirmed: identityConfirmed, playerUuid: bot._client.uuid || null, entityId: bot.entity?.id ?? null, profile: ownProfile() })
      const status = () => ({ schemaVersion: 1, mode: 'live_same_player_connection', readOnly: true, identity: identity(),
        selfPlayer: selfPlayer(),
        connection: { ended: connectionEnded, playerEntityAvailable: Boolean(bot.entity) },
        viewer: { available: !closed && !world.error, closed, state: world.error || closed ? 'unavailable' : world.dimension && world.pose ? 'snapshot' : 'waiting',
          reason: world.error || (closed ? 'NATIVE_WORLD_HOST_CLOSED' : null), registrySha256: hash, epoch: world.epoch,
          packetSequence: world.lastSequence, packetCount: world.packetCount, loadedColumns: world.columns.size,
          entityRenderingAvailable: false, lightingParityVerified: false, completeSceneParityVerified: false },
        agent: injectedAgentStatus(getAgentStatus, now) })
      const headers = type => ({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP })
      const server = http.createServer(async (request, response) => {
        try {
          if (![`127.0.0.1:${currentPort}`, `localhost:${currentPort}`].includes(request.headers.host) ||
              (request.headers.origin && ![`http://127.0.0.1:${currentPort}`, `http://localhost:${currentPort}`].includes(request.headers.origin))) { response.writeHead(403); response.end(); return }
          if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end(); return }
          const requestPath = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${currentPort}`).pathname).slice(1)
          if (requestPath === 'events') {
            if (clients.size >= 4) { response.writeHead(429); response.end(); return }
            response.writeHead(200, { ...headers('text/event-stream'), 'X-Accel-Buffering': 'no' })
            const client = { response, blocked: false, needsSnapshot: true, missedWorld: false }
            clients.add(client)
            response.on('drain', () => { client.blocked = false; client.needsSnapshot ||= client.missedWorld; client.missedWorld = false })
            response.on('close', () => clients.delete(client))
            sendNativeWorldEvent(client, { type: 'identity', ...identity(), minecraftVersion: '1.21.1', registrySha256: hash, mode: 'live_same_player_connection' })
            return
          }
          let bytes, type
          if (['status', 'status.json', 'health', 'health.json', 'healthz'].includes(requestPath)) {
            const value = status()
            if (requestPath.startsWith('health')) {
              value.ok = value.viewer.available && !connectionEnded
              value.ready = value.ok && Boolean(world.pose && world.dimension && world.columns.size)
            }
            bytes = Buffer.from(JSON.stringify(value)); type = 'application/json; charset=utf-8'
          } else if (!requestPath) { bytes = page; type = 'text/html; charset=utf-8' }
          else if (requestPath === 'client.js') { bytes = bundle; type = 'text/javascript; charset=utf-8' }
          else if (requestPath === 'manifest.json') { bytes = manifestBytes; type = 'application/json' }
          else if (Object.hasOwn(manifest.assets, requestPath) && !requestPath.split('/').some(p => ['', '.', '..'].includes(p))) {
            const file = await fs.realpath(path.join(root, requestPath))
            if (!file.startsWith(`${root}${path.sep}`)) throw Error('NATIVE_WORLD_ASSET_PATH_ESCAPE')
            const expected = manifest.assets[requestPath]
            bytes = await fs.readFile(file)
            if (!SHA256.test(expected?.sha256 || '') || bytes.length !== expected.bytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw Error('NATIVE_WORLD_ASSET_HASH_MISMATCH')
            type = file.endsWith('.png') ? 'image/png' : 'application/json'
          } else { response.writeHead(404); response.end(); return }
          response.writeHead(200, headers(type)); response.end(bytes)
        } catch (error) {
          if (response.headersSent) response.destroy()
          else { response.writeHead(503, headers('text/plain; charset=utf-8')); response.end(error.message) }
        }
      })
      server.requestTimeout = 10000; server.headersTimeout = 10000
      const worldChanged = () => { snapshotDirty = true }
      const reset = () => { snapshotDirty = true; lastCenter = null }
      const pose = () => {
        const center = `${Math.floor(world.pose.x)},${Math.floor(world.pose.y)},${Math.floor(world.pose.z)}`
        if (lastCenter !== center) { lastCenter = center; snapshotDirty = true }
      }
      const unavailable = reason => {
        for (const client of clients) sendNativeWorldEvent(client, { type: 'unavailable', reason })
        logger?.error?.('NATIVE_WORLD_UNAVAILABLE ' + reason)
      }
      const error = error => world.unavailable(error)
      const kicked = reason => world.unavailable(Error('NATIVE_WORLD_PLAYER_KICKED:' + JSON.stringify(reason)))
      const ended = reason => { connectionEnded = true; world.unavailable(Error('NATIVE_WORLD_PLAYER_CONNECTION_ENDED:' + String(reason))) }
      const verifyIdentity = () => {
        // minecraft-protocol has already received its success username before
        // Mineflayer emits login, even when entities.js has not filled bot yet.
        const actual = bot.username || bot._client.username
        if (!actual) return
        if (actual !== username) world.unavailable(Error('NATIVE_WORLD_PLAYER_IDENTITY_MISMATCH'))
        else identityConfirmed = true
      }
      const playerInfo = packet => {
        if (!packet?.action?.add_player || !UUID.test(bot._client.uuid || '')) return
        const own = packet.data?.find(p => typeof p?.uuid === 'string' && p.uuid.toLowerCase() === bot._client.uuid.toLowerCase())
        if (!own || own.player?.name !== username) return
        receivedProfile = { uuid: own.uuid.toLowerCase(), hasCustomTextures: Array.isArray(own.player.properties)
          ? own.player.properties.some(p => p?.name === 'textures') : null }
      }
      world.on('world', worldChanged); world.on('reset', reset); world.on('pose', pose); world.on('unavailable', unavailable)
      bot.on('error', error); bot.on('kicked', kicked); bot.on('end', ended)
      bot.on('login', verifyIdentity); bot.on('spawn', verifyIdentity)
      bot._client.on('player_info', playerInfo)
      const timer = setInterval(() => {
        if (closed || !clients.size) return
        try {
          const player = selfPlayer()
          const snapshot = snapshotDirty || [...clients].some(c => c.needsSnapshot) ? { ...world.snapshot(), selfPlayer: player } : null
          for (const client of clients) {
            if (client.blocked) { client.missedWorld ||= snapshotDirty; continue }
            if (snapshot || client.needsSnapshot) {
              if (sendNativeWorldEvent(client, snapshot || { ...world.snapshot(), selfPlayer: player })) client.needsSnapshot = false
            } else sendNativeWorldEvent(client, { type: world.error ? 'unavailable' : 'frame', reason: world.error, epoch: world.epoch, pose: world.pose, selfPlayer: player, time: world.time, packetSequence: world.lastSequence })
          }
          snapshotDirty = false
        } catch (error) { world.unavailable(error) }
      }, 200)
      timer.unref()
      return {
        world, server, status, registrySha256: hash,
        get port () { return currentPort },
        get url () { return server.listening ? `http://127.0.0.1:${currentPort}/` : null },
        listen () {
          if (closed) return Promise.reject(Error('NATIVE_WORLD_HOST_CLOSED'))
          listening ||= new Promise((resolve, reject) => {
            const failed = error => { server.off('listening', ready); reject(error) }
            const ready = () => { server.off('error', failed); currentPort = server.address().port; resolve(this) }
            server.once('error', failed); server.once('listening', ready); server.listen(port, '127.0.0.1')
          })
          return listening
        },
        close () {
          if (closing) return closing
          closed = true; clearInterval(timer); detach()
          world.off('world', worldChanged); world.off('reset', reset); world.off('pose', pose); world.off('unavailable', unavailable)
          bot.off('error', error); bot.off('kicked', kicked); bot.off('end', ended)
          bot.off('login', verifyIdentity); bot.off('spawn', verifyIdentity)
          bot._client.off('player_info', playerInfo)
          for (const client of clients) client.response.end()
          clients.clear()
          // Both the action bot and native packet stream belong to the caller.
          closing = (async () => {
            if (listening) await listening.catch(() => {})
            if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
          })()
          return closing
        }
      }
    }
  }
}
