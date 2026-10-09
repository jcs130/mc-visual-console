import test from 'node:test'
import assert from 'node:assert/strict'
import { CUTTING_BOARD_ID, FARMERS_DELIGHT_JAR_SHA256, cuttingBoardContent, cuttingBoardStaticModelStatus } from '../../src/native-viewer/cutting-board.js'

const state = { stateId: 28710, name: CUTTING_BOARD_ID, properties: { facing: 'west', waterlogged: 'false' }, renderShape: 'MODEL', hasBlockEntity: true }
const manifest = { sources: [{ name: 'FarmersDelight-1.21.1-1.3.4.jar', sha256: FARMERS_DELIGHT_JAR_SHA256 }] }
const empty = { IsItemCarved: 0, Inventory: { Size: 1, Items: [] } }
const occupied = { IsItemCarved: 0, Inventory: { Size: 1, Items: [{ count: 1, Slot: 0, id: 'minecraft:mangrove_log' }] } }

test('received 1.3.4 empty-board tag enables the original static model only', () => {
  const content = cuttingBoardContent(empty)
  assert.deepEqual(content, { content: 'empty' })
  assert.deepEqual(cuttingBoardStaticModelStatus(state, { stateId: 28710, ...content }, manifest), { available: true })
  assert.deepEqual(empty, { IsItemCarved: 0, Inventory: { Size: 1, Items: [] } })
})

test('received stored log retains an explicit item-rendering gap instead of a fake empty board', () => {
  const content = cuttingBoardContent(occupied)
  assert.equal(content.content, 'occupied')
  assert.deepEqual(content.storedItem, { id: 'minecraft:mangrove_log', count: 1 })
  const support = cuttingBoardStaticModelStatus(state, { stateId: 28710, ...content }, manifest)
  assert.equal(support.available, false)
  assert.equal(support.reason, 'NATIVE_CUTTING_BOARD_TOP_ITEM_RENDERING_UNSUPPORTED')
  assert.equal(support.storedItem.id, 'minecraft:mangrove_log')
})

test('missing or partial native inventory cannot be inferred as empty', () => {
  for (const data of [undefined, null, {}, { IsItemCarved: 0 }, { IsItemCarved: 0, Inventory: {} },
    { IsItemCarved: 0, Inventory: { Items: [] } }, { IsItemCarved: 0, Inventory: { Size: 2, Items: [] } },
    { Inventory: { Size: 1, Items: [] } }, { IsItemCarved: 0, Inventory: { Size: 1, Items: null } }]) {
    const content = cuttingBoardContent(data)
    assert.equal(content.content, 'unknown')
    assert.equal(cuttingBoardStaticModelStatus(state, { stateId: 28710, ...content }, manifest).available, false)
  }
})

test('malformed occupied tags never become an empty inventory', () => {
  for (const item of [{ Slot: 1, count: 1, id: 'minecraft:oak_log' }, { Slot: 0, count: 0, id: 'minecraft:oak_log' },
    { Slot: 0, count: 1, id: 'minecraft:air' }, { Slot: 0, Count: 1, id: 'minecraft:oak_log' }]) {
    assert.equal(cuttingBoardContent({ IsItemCarved: 0, Inventory: { Size: 1, Items: [item] } }).content, 'unknown')
  }
})

test('the adapter is locked to the verified JAR, entity state and record', () => {
  const received = { stateId: 28710, ...cuttingBoardContent(empty) }
  assert.equal(cuttingBoardStaticModelStatus(state, received, { sources: [{ sha256: 'a-different-version' }] }).reason, 'NATIVE_FARMERS_DELIGHT_VERSION_UNSUPPORTED')
  assert.equal(cuttingBoardStaticModelStatus(state, received, {}).available, false)
  assert.equal(cuttingBoardStaticModelStatus(state, undefined, manifest).reason, 'NATIVE_CUTTING_BOARD_ENTITY_NOT_RECEIVED')
  assert.equal(cuttingBoardStaticModelStatus(state, { ...received, stateId: 123 }, manifest).available, false)
  for (const unsupported of [{ ...state, name: 'farmersdelight:cooking_pot' }, { ...state, hasBlockEntity: false }, { ...state, renderShape: 'ENTITYBLOCK_ANIMATED' }]) {
    assert.equal(cuttingBoardStaticModelStatus(unsupported, received, manifest).reason, 'NATIVE_CUTTING_BOARD_STATE_UNSUPPORTED')
  }
})
