import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { createFishingBobberOwnerTracker, serializeViewerEntity } from '../src/mc-modern-viewer.mts'

const position = (x) => ({ x, y: 63, z: 4 })
const bobber = (id, x) => ({ id, name: 'fishing_bobber', position: position(x) })
function fakeBot() {
  const bot = new EventEmitter()
  bot._client = new EventEmitter()
  bot.registry = { entitiesArray: [{ name: 'fishing_bobber', internalId: 107 }] }
  bot.entities = {}
  return bot
}

test('spawn_entity objectData keeps the correct owner with two nearby players', () => {
  const bot = fakeBot()
  bot.entities = {
    1: { id: 1, name: 'player', position: position(1) },
    2: { id: 2, name: 'player', position: position(18) },
    90: bobber(90, 2),
  }
  const changed = []
  const tracker = createFishingBobberOwnerTracker(bot, entity => changed.push(entity.id))
  try {
    bot._client.emit('spawn_entity', { entityId: 90, type: 107, objectData: 2 })
    assert.equal(tracker.ownerFor(bot.entities[90]), 2)
    assert.equal(serializeViewerEntity(bot, bot.entities[90], tracker.ownerFor(bot.entities[90])).ownerEntityId, 2)
    assert.deepEqual(changed, [90])
  } finally { tracker.close() }
})

test('source fallback and late entity creation retain the protocol owner', () => {
  const bot = fakeBot()
  const tracker = createFishingBobberOwnerTracker(bot)
  try {
    bot._client.emit('spawn_entity', { entityId: 91, type: 107, objectData: 0, source: { entityId: 8 } })
    bot.entities[91] = bobber(91, 5)
    assert.equal(serializeViewerEntity(bot, bot.entities[91], tracker.ownerFor(bot.entities[91])).ownerEntityId, 8)
    assert.equal(serializeViewerEntity(bot, { ...bobber(92, 5), source: { id: 9 } }).ownerEntityId, 9)
  } finally { tracker.close() }
})

test('entitiesByName identifies bobbers before Mineflayer creates the entity', () => {
  const bot = fakeBot()
  bot.registry = { entitiesByName: { fishing_bobber: { internalId: 123 } } }
  const tracker = createFishingBobberOwnerTracker(bot)
  try {
    bot._client.emit('spawn_entity', { entityId: 93, type: 123, objectData: 12 })
    bot.entities[93] = bobber(93, 6)
    assert.equal(tracker.ownerFor(bot.entities[93]), 12)
    assert.equal(serializeViewerEntity(bot, bot.entities[93], tracker.ownerFor(bot.entities[93])).ownerEntityId, 12)
  } finally { tracker.close() }
})

test('invalid owners are omitted and entity ID reuse clears old ownership', () => {
  const bot = fakeBot()
  bot.entities[90] = bobber(90, 3)
  const tracker = createFishingBobberOwnerTracker(bot)
  try {
    bot._client.emit('spawn_entity', { entityId: 90, type: 107, objectData: 2 })
    bot.emit('entityGone', bot.entities[90])
    assert.equal(tracker.ownerFor(bot.entities[90]), undefined)
    bot.entities[90] = bobber(90, 4)
    bot._client.emit('spawn_entity', { entityId: 90, type: 107, objectData: 0 })
    assert.equal('ownerEntityId' in serializeViewerEntity(bot, bot.entities[90], tracker.ownerFor(bot.entities[90])), false)
    bot._client.emit('spawn_entity', { entityId: 90, type: 107, objectData: 4 })
    bot.emit('respawn')
    assert.equal(tracker.ownerFor(bot.entities[90]), undefined)
  } finally { tracker.close() }
  assert.equal(bot._client.listenerCount('spawn_entity'), 0)
})
