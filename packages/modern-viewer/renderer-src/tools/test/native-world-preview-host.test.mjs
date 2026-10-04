import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { prepareNativeWorldPreviewHost, parseNativeWorldPreviewArguments, sendNativeWorldEvent, createNativePlayerPresentation } from '../native-world-preview-host.mjs'

let directory, prepared, registryHash
const assetPath = 'assets/test/models/native.json'
const assetBytes = Buffer.from('{"parent":"test:original"}')
const defaultSkinNames = ['alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'steve', 'sunny', 'zuri']
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'native-viewer-host-test-'))
  await fs.mkdir(path.join(directory, 'registry'), { recursive: true })
  await fs.mkdir(path.dirname(path.join(directory, assetPath)), { recursive: true })
  const bytes = Buffer.from(JSON.stringify({ stateId: 70000, name: 'test:original', properties: { axis: 'x' }, renderShape: 'MODEL' }) + '\n')
  registryHash = digest(bytes)
  await fs.writeFile(path.join(directory, 'registry/block-states.jsonl'), bytes)
  await fs.writeFile(path.join(directory, assetPath), assetBytes)
  const assets = { [assetPath]: { sha256: digest(assetBytes), bytes: assetBytes.length } }
  // These fixture bytes test selection/integrity metadata, never scene parity.
  for (const model of ['slim', 'wide']) for (const name of defaultSkinNames) {
    const skinPath = `assets/minecraft/textures/entity/player/${model}/${name}.png`
    const skinBytes = Buffer.from(`test-native-default-skin:${model}:${name}`)
    await fs.mkdir(path.dirname(path.join(directory, skinPath)), { recursive: true })
    await fs.writeFile(path.join(directory, skinPath), skinBytes)
    assets[skinPath] = { sha256: digest(skinBytes), bytes: skinBytes.length }
  }
  await fs.writeFile(path.join(directory, 'native-assets.json'), JSON.stringify({ minecraftVersion: '1.21.1', assetIntegrityVerified: true,
    registryHashes: { 'block-states.jsonl': registryHash }, assets }))
  prepared = await prepareNativeWorldPreviewHost({ assetDirectory: directory, port: 0 })
})
after(async () => {
  // Delete only this freshly allocated test directory after checking its target.
  const resolved = await fs.realpath(directory), parent = await fs.realpath(os.tmpdir())
  assert.equal(path.dirname(resolved), parent)
  assert.match(path.basename(resolved), /^native-viewer-host-test-/)
  await fs.rm(resolved, { recursive: true })
})

function attachment (t, options = {}) {
  const bot = new EventEmitter()
  bot.username = 'ExistingAgent'
  bot._client = new EventEmitter()
  bot._client.uuid = '01234567-89ab-cdef-0123-456789abcdef'
  bot.registry = { dimensionsArray: [{ name: 'minecraft:overworld', minY: 0, height: 16 }] }
  let quitCount = 0, detachCount = 0
  bot.quit = () => { quitCount++ }
  const nativeStream = { events: new EventEmitter(), detach: () => { detachCount++ } }
  const host = prepared.attach({ bot, nativeStream, simplifyNBT: tag => tag.value, logger: null, now: () => 1000, ...options })
  t.after(() => host.close())
  return { bot, nativeStream, host, counts: () => ({ quitCount, detachCount }) }
}

function request (host, url = 'status.json', { headers = {}, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: host.port, path: '/' + url, method, headers, agent: false }, response => {
      const bytes = []
      response.on('data', chunk => bytes.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(bytes).toString() }))
    })
    req.on('error', reject); req.end()
  })
}

function events (host) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: host.port, path: '/events', agent: false }, response => {
      let pending = '', queue = []
      const waiting = []
      response.on('data', chunk => {
        pending += chunk.toString()
        let index
        while ((index = pending.indexOf('\n\n')) !== -1) {
          const line = pending.slice(0, index); pending = pending.slice(index + 2)
          if (!line.startsWith('data: ')) continue
          const value = JSON.parse(line.slice(6))
          if (waiting.length) waiting.shift()(value)
          else queue.push(value)
        }
      })
      resolve({ response, status: response.statusCode,
        next: () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => waiting.push(resolve)),
        close: () => { response.destroy(); req.destroy(); queue = [] } })
    })
    req.on('error', reject)
  })
}

function playerEntity (bot) {
  bot.entity = { id: 42, username: bot.username, isValid: true, position: { x: 3.5, y: 64, z: -8.25 },
    yaw: 0.75, pitch: -0.25, eyeHeight: 1.62, onGround: true, crouching: false, velocity: { x: 0.1, y: 0, z: -0.2 } }
  bot.health = 17; bot.food = 12
  return bot.entity
}

function ownPlayerInfo (bot, properties = []) {
  bot._client.emit('player_info', { action: { add_player: true }, data: [{ uuid: bot._client.uuid,
    player: { name: bot.username, properties } }] })
}

function nativeInventory (playerUuid) {
  const slots = new Array(46).fill(null)
  slots[36] = { id: 'farmersdelight:iron_knife', count: 1, snbt: '{id:"farmersdelight:iron_knife",count:1,components:{"minecraft:custom_name":"真正的刀"}}' }
  return { schemaVersion: 1, playerUuid, windowId: 0, stateId: 7, menuType: 'minecraft:inventory', selectedHotbarSlot: 0, carried: null,
    slots, mayPickup: slots.map(() => true) }
}

async function untilEvent (stream, predicate) {
  let timer
  try {
    return await Promise.race([(async () => { while (true) { const event = await stream.next(); if (predicate(event)) return event } })(),
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(Error('Expected SSE event timed out')), 3000) })])
  } finally { clearTimeout(timer) }
}

test('legacy positional CLI arguments and defaults are preserved without starting a bot', () => {
  assert.deepEqual(parseNativeWorldPreviewArguments(['assets', 'native.cjs']), {
    assetDirectory: 'assets', nativePacketFile: 'native.cjs', username: 'MawWebRenderQA', gamePort: 28980, port: 28983
  })
  assert.deepEqual(parseNativeWorldPreviewArguments(['assets', 'native.cjs', 'SameAgent', '28981', '28984']), {
    assetDirectory: 'assets', nativePacketFile: 'native.cjs', username: 'SameAgent', gamePort: 28981, port: 28984
  })
  assert.throws(() => parseNativeWorldPreviewArguments([]), /Usage:/)
  assert.throws(() => parseNativeWorldPreviewArguments(['assets', 'native.cjs', 'Invalid Name']), /PLAYER_INVALID/)
  assert.throws(() => parseNativeWorldPreviewArguments(['assets', 'native.cjs', 'QA', '0']), /PORT_INVALID/)
})

test('attachment synchronously reads the supplied stream before listening and preserves caller ownership', async t => {
  const { bot, nativeStream, host, counts } = attachment(t)
  const externalEnd = () => {}
  bot.on('end', externalEnd)
  assert.equal(host.url, null)
  nativeStream.events.emit('packet', { registrySha256: registryHash, sequence: 1, name: 'login', params: { worldState: { dimension: 0 } } })
  assert.equal(host.world.dimension.name, 'minecraft:overworld')
  assert.equal(host.world.lastSequence, 1)
  assert.equal(bot._client.listenerCount('registry_data'), 1)
  assert.equal(bot._client.listenerCount('player_info'), 1)
  await host.listen()
  assert.equal(host.server.address().address, '127.0.0.1')
  const close = host.close()
  assert.equal(host.close(), close)
  await close
  assert.deepEqual(counts(), { quitCount: 0, detachCount: 0 })
  assert.equal(nativeStream.events.listenerCount('packet'), 0)
  assert.equal(bot._client.listenerCount('registry_data'), 0)
  assert.equal(bot._client.listenerCount('player_info'), 0)
  assert.equal(bot.listenerCount('end'), 1)
  assert.equal(host.status().viewer.available, false)
  await assert.rejects(host.listen(), /HOST_CLOSED/)
})

test('real pre-login bot shape attaches immediately with expected username, then verifies authenticated login/spawn identity', async t => {
  const bot = new EventEmitter()
  bot._client = new EventEmitter()
  bot.registry = { dimensionsArray: [{ name: 'minecraft:overworld', minY: 0, height: 16 }] }
  const nativeStream = { events: new EventEmitter() }
  const host = prepared.attach({ bot, nativeStream, simplifyNBT: value => value, expectedUsername: 'EarlyAgent', logger: null })
  t.after(() => host.close())
  assert.equal(bot.username, undefined)
  assert.equal(host.status().identity.player, 'EarlyAgent')
  assert.equal(host.status().identity.confirmed, false)
  nativeStream.events.emit('packet', { registrySha256: registryHash, sequence: 1, name: 'login', params: { worldState: { dimension: 0 } } })
  assert.equal(host.world.lastSequence, 1)
  bot._client.username = 'EarlyAgent'; bot._client.uuid = 'actual-login-uuid'; bot.emit('login')
  assert.equal(host.status().identity.confirmed, true)
  assert.equal(host.status().identity.playerUuid, 'actual-login-uuid')
  bot.username = 'EarlyAgent'; bot.emit('spawn')
  assert.equal(host.world.error, null)
  await host.listen()
  assert.equal(JSON.parse((await request(host, 'healthz')).body).ok, true)
  bot.username = 'DifferentAgent'; bot.emit('spawn')
  assert.match(host.world.error, /PLAYER_IDENTITY_MISMATCH/)
  assert.equal(JSON.parse((await request(host, 'healthz')).body).ok, false)
  assert.throws(() => prepared.attach({ bot, nativeStream, simplifyNBT: value => value, expectedUsername: 'EarlyAgent' }), /ATTACHMENT_IDENTITY_MISMATCH/)
})

test('status returns caller-provided goals, decisions and receipts without inventing game effects', async t => {
  const state = { goal: 'Read actual mana', decision: { action: 'spell.list', source: 'model', receivedAt: 7 }, actionReceipts: [{ requestId: 'actual-1', ok: false, effectVerified: false }] }
  const { host, bot } = attachment(t, { getAgentStatus: () => state })
  await host.listen()
  const response = await request(host)
  assert.equal(response.status, 200)
  const status = JSON.parse(response.body)
  assert.deepEqual(status.agent.details, state)
  assert.equal(status.agent.source, 'caller_injected')
  assert.equal(status.agent.sampledAt, 1000)
  assert.equal(status.identity.playerUuid, bot._client.uuid)
  assert.equal(status.identity.player, 'ExistingAgent')
  assert.equal(status.viewer.state, 'waiting')
  assert.equal(status.viewer.completeSceneParityVerified, false)
  const copied = host.status()
  state.goal = 'Changed actual caller goal'
  assert.equal(copied.agent.details.goal, 'Read actual mana')
  assert.equal(JSON.parse((await request(host, 'status')).body).agent.details.goal, state.goal)
  const health = JSON.parse((await request(host, 'health.json')).body)
  assert.equal(health.ok, true); assert.equal(health.ready, false)
  assert.deepEqual(JSON.parse((await request(host, 'healthz')).body), health)
})

test('self player reads only the caller connection, with real attribute modifiers and explicit missing fields', t => {
  const { bot, host, counts } = attachment(t)
  const entity = playerEntity(bot)
  entity.attributes = { 'minecraft:generic.max_health': { value: 20, modifiers: [
    { amount: 4, operation: 0 }, { amount: 0.25, operation: 1 }, { amount: 0.1, operation: 2 }
  ] } }
  bot._client.write = () => assert.fail('read-only preview must not write Minecraft packets')
  bot.players = { ExistingAgent: { username: 'ExistingAgent', uuid: 'ffffffff-ffff-ffff-ffff-ffffffffffff', skinData: { url: 'private-peer-texture' } } }
  const self = host.status().selfPlayer
  assert.equal(self.uuid, bot._client.uuid)
  assert.equal(self.name, 'ExistingAgent'); assert.equal(self.entityId, 42)
  assert.deepEqual(self.position, { x: 3.5, y: 64, z: -8.25 })
  assert.equal(self.yaw, 0.75); assert.equal(self.pitch, -0.25); assert.equal(self.eyeHeight, 1.62)
  assert.equal(self.health, 17); assert.equal(self.food, 12); assert.equal(self.maxHealth, 33)
  entity.attributes['minecraft:generic.max_health'].modifiers.push({ amount: 1, operation: 99 })
  assert.equal(host.status().selfPlayer.maxHealth, null)
  assert.equal(self.onGround, true); assert.equal(self.sneaking, false)
  assert.deepEqual(self.velocity, { x: 0.1, y: 0, z: -0.2 })
  assert.deepEqual(self.skin, { kind: 'unavailable', reason: 'PLAYER_SKIN_PROFILE_UNAVAILABLE' })
  assert.deepEqual(host.status().identity.profile, { available: false, hasCustomTextures: null })
  assert(!JSON.stringify(host.status()).includes('private-peer-texture'))
  delete entity.attributes; delete entity.onGround; delete entity.crouching; delete entity.velocity
  bot.health = NaN; bot.food = undefined
  const unavailable = host.status().selfPlayer
  for (const field of ['health', 'food', 'maxHealth', 'onGround', 'sneaking', 'velocity']) assert.equal(unavailable[field], null)
  entity.uuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  assert.equal(host.status().selfPlayer, null)
  assert.deepEqual(counts(), { quitCount: 0, detachCount: 0 })
})

test('default skins follow the matched 1.21.1 UUID hash ordering including negative Java hashes', t => {
  const { bot, host } = attachment(t)
  playerEntity(bot)
  for (let index = 0; index < 18; index++) {
    bot._client.uuid = `00000000-0000-0000-0000-${index.toString(16).padStart(12, '0')}`
    ownPlayerInfo(bot)
    const skin = host.status().selfPlayer.skin, model = index < 9 ? 'slim' : 'wide'
    assert.equal(skin.kind, 'default'); assert.equal(skin.model, model)
    assert.equal(skin.assetPath, `assets/minecraft/textures/entity/player/${model}/${defaultSkinNames[index % 9]}.png`)
    assert.match(skin.sha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(host.status().identity.profile, { available: true, hasCustomTextures: false })
  }
  bot._client.uuid = '00000000-0000-0000-0000-0000ffffffff'
  ownPlayerInfo(bot)
  assert.equal(host.status().selfPlayer.skin.assetPath, 'assets/minecraft/textures/entity/player/wide/zuri.png')
})

test('custom or unknown own textures never silently become a default skin or disclose texture contents', async t => {
  const { bot, host } = attachment(t)
  playerEntity(bot)
  ownPlayerInfo(bot, [{ name: 'textures', value: 'private-base64-do-not-send', signature: 'private-signature' }])
  assert.deepEqual(host.status().identity.profile, { available: true, hasCustomTextures: true })
  assert.deepEqual(host.status().selfPlayer.skin, { kind: 'unavailable', reason: 'CUSTOM_PLAYER_SKIN_NOT_RESOLVED' })
  await host.listen()
  const stream = await events(host); t.after(() => stream.close())
  const identity = await stream.next()
  assert.deepEqual(identity.profile, { available: true, hasCustomTextures: true })
  assert(!JSON.stringify(identity).includes('private-'))
  const state = await stream.next()
  assert(!JSON.stringify(state).includes('private-'))
  // Missing properties differ from a received empty properties array.
  bot._client.emit('player_info', { action: { add_player: true }, data: [{ uuid: bot._client.uuid, player: { name: bot.username } }] })
  assert.equal(host.status().identity.profile.hasCustomTextures, null)
  assert.equal(host.status().selfPlayer.skin.reason, 'PLAYER_SKIN_PROFILE_UNAVAILABLE')
})

test('an already logged-in profile is accepted only for the same account UUID and name', t => {
  const { bot, host } = attachment(t)
  playerEntity(bot)
  bot.player = { username: bot.username, uuid: bot._client.uuid, skinData: { url: 'private-texture-url', model: 'slim' } }
  assert.equal(host.status().selfPlayer.skin.reason, 'CUSTOM_PLAYER_SKIN_NOT_RESOLVED')
  delete bot.player.skinData
  assert.equal(host.status().selfPlayer.skin.kind, 'default')
  bot.player.username = 'AnotherAgent'
  assert.equal(host.status().selfPlayer.skin.reason, 'PLAYER_SKIN_PROFILE_UNAVAILABLE')
})

test('SSE snapshot and frames resample the action player without borrowing another player or writing commands', async t => {
  const { bot, host, nativeStream } = attachment(t)
  const entity = playerEntity(bot)
  bot.registry.dimensionsArray[0].height = 128
  bot._client.write = () => assert.fail('preview is read-only')
  ownPlayerInfo(bot)
  nativeStream.events.emit('packet', { registrySha256: registryHash, sequence: 1, name: 'login', params: { worldState: { dimension: 0 } } })
  host.world.setPose({ ...entity.position, yaw: entity.yaw, pitch: entity.pitch, eyeHeight: entity.eyeHeight })
  await host.listen()
  const stream = await events(host); t.after(() => stream.close())
  assert.equal((await stream.next()).playerUuid, bot._client.uuid)
  const snapshot = await stream.next()
  assert.equal(snapshot.type, 'snapshot'); assert.equal(snapshot.selfPlayer.health, 17)
  assert.equal(snapshot.selfPlayer.uuid, bot._client.uuid)
  assert.equal(snapshot.selfPlayer.skin.kind, 'default')
  entity.position.x = 3.75; entity.yaw = -1.1; bot.health = 9; bot.food = 7; entity.onGround = false; entity.crouching = true
  const frame = await stream.next()
  assert.equal(frame.type, 'frame')
  assert.equal(frame.selfPlayer.position.x, 3.75); assert.equal(frame.selfPlayer.yaw, -1.1)
  assert.equal(frame.selfPlayer.health, 9); assert.equal(frame.selfPlayer.food, 7)
  assert.equal(frame.selfPlayer.onGround, false); assert.equal(frame.selfPlayer.sneaking, true)
  assert.equal(snapshot.selfPlayer.position.x, 3.5)
  bot.username = 'WrongPlayer'; bot.emit('spawn')
  assert.equal(host.status().selfPlayer, null)
  bot.emit('end', 'closed')
  assert.equal(host.status().selfPlayer, null)
})

test('missing, throwing, asynchronous, cyclic and oversized Agent data remain explicit unavailable', async t => {
  let supplied = null, mode = 'normal'
  const { host } = attachment(t, { getAgentStatus: () => {
    if (mode === 'throw') throw Error('secret=do-not-expose')
    return supplied
  } })
  await host.listen()
  const empty = attachment(t).host
  assert.equal(empty.status().agent.reason, 'AGENT_STATUS_NOT_PROVIDED')
  for (const value of [null, ['not-record'], Promise.resolve({ goal: 'later' }), { unsafe: 1n }, { bad: NaN }]) {
    supplied = value
    assert.equal(host.status().agent.reason, 'AGENT_STATUS_INVALID')
  }
  supplied = {}; supplied.cycle = supplied
  assert.equal(host.status().agent.available, false)
  supplied = { receipts: new Array(257).fill(null) }
  assert.equal(host.status().agent.reason, 'AGENT_STATUS_TOO_LARGE')
  supplied = { decisions: new Array(100).fill('x'.repeat(1000)) }
  assert.equal(host.status().agent.reason, 'AGENT_STATUS_TOO_LARGE')
  mode = 'throw'
  const response = await request(host)
  assert.equal(JSON.parse(response.body).agent.reason, 'AGENT_STATUS_UNAVAILABLE')
  assert(!response.body.includes('secret'))
  assert.equal(JSON.parse(response.body).viewer.available, true)
})

test('all HTTP routes reject foreign Host/Origin and non-GET requests before reading Agent data', async t => {
  let reads = 0
  const { host } = attachment(t, { getAgentStatus: () => { reads++; return { goal: 'actual' } } })
  await host.listen()
  for (const route of ['status.json', 'events', 'client.js', assetPath]) {
    assert.equal((await request(host, route, { headers: { Host: 'attacker.example' } })).status, 403)
    assert.equal((await request(host, route, { headers: { Origin: 'https://attacker.example' } })).status, 403)
    assert.equal((await request(host, route, { method: 'POST' })).status, 405)
  }
  assert.equal(reads, 0)
  assert.equal((await request(host, 'status.json', { headers: { Host: `localhost:${host.port}`, Origin: `http://localhost:${host.port}` } })).status, 200)
  assert.equal((await request(host, 'action?kind=cast')).status, 404)
  assert.equal(reads, 1)
})

test('full original shell modes and diagnostic page coexist with native bundles, exact hashed assets and read-only CSP', async t => {
  const { host } = attachment(t)
  await host.listen()
  for (const route of ['', 'third/', 'dungeon/', 'viewer.css', 'index.js', 'native-console.js', 'diagnostics', 'client.js', 'manifest.json', assetPath]) {
    const response = await request(host, route)
    assert.equal(response.status, 200)
    assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/)
    assert.equal(response.headers['x-content-type-options'], 'nosniff')
    assert.equal(response.headers['cache-control'], 'no-store')
  }
  for (const [route, mode] of [['', 'first'], ['third/', 'third'], ['dungeon/', 'dungeon']]) {
    const response = await request(host, route)
    assert.match(response.body, new RegExp(`data-view-mode="${mode}"`))
    assert.match(response.body, /src="\/index\.js"/)
    assert.match(response.body, /class="corti-hotbar"/)
    assert.match(response.body, /href="\/viewer\.css"/)
  }
  assert.match((await request(host, 'diagnostics')).body, /src="\/client\.js"/)
  assert.equal((await request(host, 'index.js')).body, (await request(host, 'native-console.js')).body)
  assert.equal((await request(host, 'third/', { method: 'POST' })).status, 405)
  assert.equal((await request(host, assetPath)).body, assetBytes.toString())
  assert.equal((await request(host, 'assets/test/models/unsupported.json')).status, 404)
  assert.equal((await request(host, 'registry/block-states.jsonl')).status, 404)
  assert.equal((await request(host, '../native-assets.json')).status, 404)
  await fs.writeFile(path.join(directory, assetPath), Buffer.from('{"parent":"minecraft:substitute"}'))
  try {
    const response = await request(host, assetPath)
    assert.equal(response.status, 503)
    assert.match(response.body, /ASSET_HASH_MISMATCH/)
  } finally { await fs.writeFile(path.join(directory, assetPath), assetBytes) }
})

test('SSE identity and unavailable evidence come from the same supplied native connection with four-client cap', async t => {
  const { host, nativeStream, bot } = attachment(t)
  await host.listen()
  const streams = []
  t.after(() => streams.forEach(stream => stream.close()))
  for (let index = 0; index < 4; index++) {
    const stream = await events(host); streams.push(stream)
    assert.equal(stream.status, 200)
    const identity = await stream.next()
    assert.equal(identity.playerUuid, bot._client.uuid)
    assert.equal(identity.registrySha256, registryHash)
  }
  assert.equal((await request(host, 'events')).status, 429)
  const frame = await streams[0].next()
  assert.equal(frame.type, 'waiting')
  nativeStream.events.emit('packet', { registrySha256: registryHash, sequence: 2, name: 'update_time', params: { age: 1n, time: 1n } })
  let unavailable
  do { unavailable = await streams[0].next() } while (unavailable.type !== 'unavailable')
  assert.match(unavailable.reason, /SEQUENCE_OR_REGISTRY_MISMATCH/)
  const health = JSON.parse((await request(host, 'health')).body)
  assert.equal(health.ok, false); assert.equal(health.viewer.available, false)
})

test('backpressure does not queue another event and individual event byte limits fail closed', () => {
  const writes = []
  const client = { blocked: false, response: { destroyed: false, write: text => { writes.push(text); return false } } }
  assert.equal(sendNativeWorldEvent(client, { type: 'frame', packetSequence: 3 }), true)
  assert.equal(client.blocked, true)
  assert.equal(sendNativeWorldEvent(client, { type: 'frame', packetSequence: 4 }), false)
  assert.equal(writes.length, 1)
  client.blocked = false
  assert.throws(() => sendNativeWorldEvent(client, { data: 'x'.repeat(2 * 1024 * 1024) }), /MESSAGE_TOO_LARGE/)
  assert.equal(writes.length, 1)
  client.response.destroyed = true
  assert.equal(sendNativeWorldEvent(client, { type: 'frame' }), false)
})

test('disconnect invalidates viewer health while preserving genuine caller receipt status', async t => {
  const { bot, host } = attachment(t, { getAgentStatus: () => ({ actionReceipts: [{ requestId: 'pending-1', outcomeUnknown: true }] }) })
  await host.listen()
  bot.emit('end', 'connection_closed')
  const status = JSON.parse((await request(host, 'health.json')).body)
  assert.equal(status.ok, false)
  assert.equal(status.connection.ended, true)
  assert.match(status.viewer.reason, /CONNECTION_ENDED/)
  assert.equal(status.agent.details.actionReceipts[0].outcomeUnknown, true)
})

test('native presentation preserves real mod IDs/components and open-container slots without consulting proxy items', () => {
  const playerUuid = '01234567-89ab-cdef-0123-456789abcdef', menu = nativeInventory(playerUuid)
  const state = createNativePlayerPresentation({ playerUuid, menu })
  assert.equal(state.inventory.windowId, 0)
  assert.equal(state.inventory.hotbarStart, 36); assert.equal(state.inventory.offhandSlot, 45)
  assert.equal(state.inventory.slots.length, 46)
  assert.deepEqual(state.inventory.slots[35], { slot: 35, item: null })
  assert.deepEqual(state.inventory.slots[36].item, { name: menu.slots[36].id, count: 1, snbt: menu.slots[36].snbt })
  assert.equal(state.nativeMenu.title, null)
  menu.windowId = 4; menu.menuType = 'farmersdelight:cooking_pot'; menu.slots = menu.slots.slice(0, 45)
  menu.slotRoles = { ingredients: [0, 1, 2, 3, 4, 5], cooked_buffer: [6], serving_container: [7], served_output: [8] }
  const container = createNativePlayerPresentation({ playerUuid, menu })
  assert.equal(container.inventory, null)
  assert.equal(container.nativeMenu.windowId, 4); assert.equal(container.nativeMenu.slots.length, 45)
  assert.deepEqual(container.nativeMenu.slotRoles, menu.slotRoles)
  assert.equal(state.nativeMenu.windowId, 0)
  menu.playerUuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  assert.equal(createNativePlayerPresentation({ playerUuid, menu }).nativeMenu, null)
})

test('Ars HUD states are genuine timestamped receipts, unknown cooldowns stay null and changing held item hides the old catalogue', () => {
  const playerUuid = '01234567-89ab-cdef-0123-456789abcdef', menu = nativeInventory(playerUuid)
  const spellState = { playerUuid, heldSnbt: menu.slots[36].snbt, selectedHotbarSlot: 0, mana: { current: 23, max: 80 }, cooldown: { active: true, fraction: 0.5, totalTicks: null, remainingTicks: null } }
  const spellCatalog = { playerUuid, state: { ...spellState }, spells: [{ id: 'ars_nouveau:slot_0', name: '治愈', manaCost: 12 }] }
  const state = createNativePlayerPresentation({ playerUuid, menu, spellState, spellCatalog, spellObservedAt: 800, now: 1000 })
  assert.deepEqual(state.skills.mana, { current: 23, max: 80 })
  assert.equal(state.skills.source, 'ars_nouveau_receipt'); assert.equal(state.skills.observedAt, 800); assert.equal(state.skills.stale, false)
  assert.deepEqual(state.skills.abilities, [{ id: 'ars_nouveau:slot_0', name: '治愈', manaCost: 12, cooldownMs: null, cooldownRemainingMs: null }])
  assert.equal(createNativePlayerPresentation({ playerUuid, menu, spellState, spellCatalog, spellObservedAt: 800, now: 6000 }).skills.stale, true)
  menu.slots[36] = null
  const changed = createNativePlayerPresentation({ playerUuid, menu, spellState, spellCatalog, spellObservedAt: 800, now: 1000 })
  assert.equal(changed.skills.stale, true); assert.deepEqual(changed.skills.abilities, [])
  spellState.playerUuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  assert.equal(createNativePlayerPresentation({ playerUuid, menu, spellState, spellCatalog }).skills, null)
})

test('same-player private presentation rejects foreign, asynchronous, cyclic and oversized callbacks without exposing unrelated provider data', t => {
  let supplied, throws = false, reads = 0
  const { bot, host, counts } = attachment(t, { getPresentationState: () => { reads++; if (throws) throw Error('private-auth-secret'); return supplied } })
  const entity = playerEntity(bot)
  Object.defineProperty(bot, 'inventory', { get () { assert.fail('never read vanilla proxy inventory') } })
  bot._client.write = () => assert.fail('presentation must not write to the game connection')
  supplied = { ...createNativePlayerPresentation({ playerUuid: bot._client.uuid, menu: nativeInventory(bot._client.uuid) }), runtimeSecret: 'private-auth-secret' }
  const current = host.status().presentation
  assert.equal(current.playerUuid, bot._client.uuid); assert.equal(current.available, true)
  assert.equal(current.source, 'same_player_connection'); assert.equal(current.nativeState.available, true)
  assert.equal(current.inventory.slots[36].item.name, 'farmersdelight:iron_knife')
  assert(!JSON.stringify(current).includes('private-auth-secret'))
  const original = supplied
  for (const value of [null, [], Promise.resolve(original), { ...original, playerUuid: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
    { ...original, nativeMenu: { playerUuid: 'ffffffff-ffff-ffff-ffff-ffffffffffff', slots: [] } }]) {
    supplied = value
    const result = host.status().presentation
    assert.equal(result.available, true); assert.equal(result.nativeState.available, false)
    assert.equal(result.inventory, null); assert.equal(result.nativeMenu, null); assert.equal(result.skills, null)
    assert.equal(result.self.health, 17)
  }
  supplied = { ...original }; supplied.loop = supplied
  assert.equal(host.status().presentation.nativeState.reason, 'PRESENTATION_INVALID')
  supplied = { ...original, skills: { abilities: new Array(257).fill(null) } }
  assert.equal(host.status().presentation.nativeState.reason, 'PRESENTATION_TOO_LARGE')
  supplied = { ...original, skills: { oversized: new Array(100).fill('x'.repeat(1000)) } }
  assert.equal(host.status().presentation.nativeState.reason, 'PRESENTATION_TOO_LARGE')
  throws = true
  assert.equal(host.status().presentation.nativeState.reason, 'PRESENTATION_UNAVAILABLE')
  assert(!JSON.stringify(host.status()).includes('private-auth-secret'))
  entity.uuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  const previousReads = reads
  const unavailable = host.status().presentation
  assert.equal(unavailable.available, false); assert.equal(unavailable.self, null); assert.equal(unavailable.playerUuid, null)
  assert.equal(reads, previousReads)
  assert.deepEqual(counts(), { quitCount: 0, detachCount: 0 })
})

test('own messages, title, actionbar, vitals and weather stay private and clear on native respawn/disconnect', t => {
  const { bot, host, nativeStream } = attachment(t)
  playerEntity(bot)
  bot.entity.isInWater = true
  bot.foodSaturation = 3.5; bot.oxygenLevel = 18; bot.experience = { level: 4, points: 42, progress: 0.25 }; bot.quickBarSlot = 2
  bot.isRaining = true; bot.rainState = 0.7; bot.thunderState = 0.1
  bot.emit('messagestr', '玩家私聊', 'chat'); bot.emit('messagestr', '本人系统回执', 'system'); bot.emit('messagestr', '技能生效', 'game_info')
  bot.emit('title_times', 10, 50, 10); bot.emit('title', '{"text":"咏唱","extra":[{"text":"成功"}]}', 'title'); bot.emit('title', '只给本人', 'subtitle')
  let state = host.status().presentation
  assert.deepEqual(state.gameMessages.map(m => [m.kind, m.text]), [['chat', '玩家私聊'], ['system', '本人系统回执']])
  assert.equal(state.actionbar.text, '技能生效'); assert.equal(state.title.title, '咏唱成功'); assert.equal(state.title.subtitle, '只给本人'); assert.equal(state.title.stay, 50)
  assert.equal(state.self.saturation, 3.5); assert.equal(state.self.oxygen, 18); assert.equal(state.self.armor, null); assert.equal(state.self.inWater, true)
  assert.equal(state.self.experienceLevel, 4); assert.equal(state.self.experienceProgress, 0.25); assert.equal(state.self.quickBarSlot, 2)
  assert.deepEqual(state.weather, { raining: true, rain: 0.7, thunder: 0.1 })
  for (let i = 0; i < 30; i++) bot.emit('messagestr', String(i), 'system')
  assert.equal(host.status().presentation.gameMessages.length, 24)
  assert.equal(host.status().presentation.gameMessages.at(-1).text, '29')
  bot.emit('title_clear'); assert.equal(host.status().presentation.title, null)
  nativeStream.events.emit('packet', { registrySha256: registryHash, sequence: 1, name: 'respawn', params: { worldState: { dimension: 0 } } })
  state = host.status().presentation
  assert.deepEqual(state.gameMessages, []); assert.equal(state.actionbar, null)
  bot.emit('end', 'connection_closed')
  state = host.status().presentation
  assert.equal(state.available, false); assert.deepEqual(state.gameMessages, []); assert.equal(state.weather, null)
})

test('SSE identity is refreshed after early browser login and a new respawn entity before its private frame', async t => {
  const bot = new EventEmitter(); bot._client = new EventEmitter()
  bot.registry = { dimensionsArray: [{ name: 'minecraft:overworld', minY: 0, height: 128 }] }
  const nativeStream = { events: new EventEmitter() }
  let menu = null
  const host = prepared.attach({ bot, nativeStream, expectedUsername: 'EarlyAgent', simplifyNBT: value => value, logger: null,
    getPresentationState: () => createNativePlayerPresentation({ playerUuid: bot._client.uuid, menu }) })
  t.after(() => host.close()); await host.listen()
  const stream = await events(host); t.after(() => stream.close())
  const initial = await stream.next()
  assert.equal(initial.type, 'identity'); assert.equal(initial.playerUuid, null); assert.equal(initial.confirmed, false)
  bot.username = 'EarlyAgent'; bot._client.username = bot.username; bot._client.uuid = '01234567-89ab-cdef-0123-456789abcdef'
  const entity = playerEntity(bot); menu = nativeInventory(bot._client.uuid)
  bot._client.write = () => assert.fail('no additional query, action or login')
  nativeStream.events.emit('packet', { registrySha256: registryHash, sequence: 1, name: 'login', params: { worldState: { dimension: 0 } } })
  bot.emit('login'); host.world.setPose({ ...entity.position, yaw: entity.yaw, pitch: entity.pitch, eyeHeight: entity.eyeHeight })
  const loggedIn = await untilEvent(stream, e => e.type === 'identity' && e.confirmed)
  assert.equal(loggedIn.playerUuid, bot._client.uuid); assert.equal(loggedIn.entityId, 42)
  const snapshot = await untilEvent(stream, e => e.type === 'snapshot')
  assert.equal(snapshot.presentation.playerUuid, bot._client.uuid); assert.equal(snapshot.presentation.inventory.slots[36].item.name, 'farmersdelight:iron_knife')
  menu.slots[36].count = 2
  const frame = await untilEvent(stream, e => e.type === 'frame')
  assert.equal(frame.presentation.inventory.slots[36].item.count, 2)
  assert.equal(snapshot.presentation.inventory.slots[36].item.count, 1)
  entity.id = 99
  nativeStream.events.emit('packet', { registrySha256: registryHash, sequence: 2, name: 'respawn', params: { worldState: { dimension: 0 } } })
  bot.emit('spawn'); host.world.setPose({ ...entity.position, yaw: entity.yaw, pitch: entity.pitch, eyeHeight: entity.eyeHeight })
  const respawned = await untilEvent(stream, e => e.type === 'identity' && e.entityId === 99)
  assert.equal(respawned.epoch, 2)
  const next = await untilEvent(stream, e => e.type === 'snapshot')
  assert.equal(next.selfPlayer.entityId, 99); assert.equal(next.presentation.self.entityId, 99)
})

test('tampered native registry prevents preparation before any bot can be attached', async () => {
  const registryPath = path.join(directory, 'registry/block-states.jsonl')
  const original = await fs.readFile(registryPath)
  await fs.writeFile(registryPath, Buffer.from('changed'))
  try { await assert.rejects(prepareNativeWorldPreviewHost({ assetDirectory: directory, port: 0 }), /REGISTRY_HASH_MISMATCH/) }
  finally { await fs.writeFile(registryPath, original) }
})
