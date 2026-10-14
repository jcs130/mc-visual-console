import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createNativeAgentVisualization } from '../../host/native-agent-visual.mjs'
import { createNativeSession } from '../../src/native-viewer/native-session.js'

const uuid = '01234567-89ab-cdef-0123-456789abcdef'
function body() {
  const bot = new EventEmitter()
  Object.assign(bot, { username: 'Player', player: { uuid }, entity: { id: 7, uuid, position: { x: 1, y: 65, z: 3 }, yaw: 0, pitch: 0 },
    game: { dimension: 'minecraft:overworld', gameMode: 'survival' }, controlState: { forward: true },
    _client: { state: 'play', write() {} } })
  return bot
}

test('native SSE reuses the real-body intent, path, trail and input bridge and cleans up', () => {
  const bot = body(), frames = []; let time = 1000
  const view = createNativeAgentVisualization(bot, { now: () => time, timers: false,
    getAgentStatus: () => ({ username: 'Player', online: true, mode: 'acting', goal: 'Find food', action: 'mc_do / collect' }) })
  const unsubscribe = view.subscribe(value => frames.push(value))
  view.flush()
  let frame = frames.findLast(row => row.event === 'agentVisualization').value
  assert.equal(frame.intent.goal, 'Find food')
  assert.deepEqual(frame.input.controls, ['forward'])
  bot.entity.position.x += 1; time += 100
  bot.emit('path_update', { status: 'success', path: [{ x: 2, y: 65, z: 3 }, { x: 4, y: 65, z: 3 }] })
  view.flush()
  frame = frames.findLast(row => row.event === 'agentVisualization').value
  assert.equal(frame.trail.length, 2)
  assert.equal(frame.route.points.at(-1).x, 4)
  bot._client.write('block_dig', { status: 0, location: { x: 2, y: 65, z: 3 } }); view.flush()
  assert.equal(frames.at(-1).value.input.operations.at(-1).kind, 'gather')
  unsubscribe(); const count = frames.length; view.flush(); assert.equal(frames.length, count)
  view.dispose(); assert.equal(bot.listenerCount('path_update'), 0)
})

test('foreign status cannot become this body intent', () => {
  const frames = [], view = createNativeAgentVisualization(body(), { timers: false,
    getAgentStatus: () => ({ username: 'Other', online: true, goal: 'foreign' }) })
  view.subscribe(value => frames.push(value)); view.flush()
  assert.equal(frames.at(-1).value.intent, null); view.dispose()
})

test('native session accepts only the same player and world epoch visualization', () => {
  const hash = 'a'.repeat(64), session = createNativeSession(hash)
  session.receive({ type: 'identity', registrySha256: hash, mode: 'live_same_player_connection', minecraftVersion: '1.21.1', player: 'Player', playerUuid: uuid, entityId: 7 })
  session.receive({ type: 'snapshot', registrySha256: hash, mode: 'live_same_player_connection', epoch: 2 })
  const frame = { type: 'agent_visual', epoch: 2, event: 'agentVisualization', value: { available: true, subject: { playerUuid: uuid, playerName: 'Player', entityId: 7 } } }
  assert.equal(session.receive(frame).kind, 'agent_visual')
  assert.equal(session.receive({ ...frame, epoch: 1 }).kind, 'ignored')
  assert.throws(() => session.receive({ ...frame, value: { ...frame.value, subject: { ...frame.value.subject, entityId: 8 } } }), /VISUAL_IDENTITY/)
})
