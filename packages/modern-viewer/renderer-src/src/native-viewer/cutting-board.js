// Farmer's Delight 1.3.4: saveAdditional writes Inventory (one-slot
// ItemStackHandler) and IsItemCarved. Its BlockEntityRenderer returns immediately
// for an empty stored ItemStack; the board itself is the original block JSON.
// Confirmed against this installed JAR and the action player's received tags.
export const CUTTING_BOARD_ID = 'farmersdelight:cutting_board'
export const FARMERS_DELIGHT_JAR_SHA256 = '139ad7696462c89c03eea463f805abffa552526c5dadaadae221dd9624cb197c'

export function cuttingBoardContent (data) {
  const unknown = reason => ({ content: 'unknown', reason })
  if (!data) return unknown('NATIVE_CUTTING_BOARD_ENTITY_NOT_RECEIVED')
  const inventory = data.Inventory
  if (!inventory || inventory.Size !== 1 || !Array.isArray(inventory.Items) ||
      ![0, 1, false, true].includes(data.IsItemCarved)) return unknown('NATIVE_CUTTING_BOARD_INVENTORY_UNVERIFIED')
  if (inventory.Items.length === 0) return { content: 'empty' }
  if (inventory.Items.length !== 1) return unknown('NATIVE_CUTTING_BOARD_INVENTORY_UNVERIFIED')
  const item = inventory.Items[0]
  if (item?.Slot !== 0 || typeof item.id !== 'string' || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(item.id) ||
      item.id === 'minecraft:air' || !Number.isSafeInteger(item.count) || item.count < 1) {
    return unknown('NATIVE_CUTTING_BOARD_STORED_ITEM_UNVERIFIED')
  }
  return { content: 'occupied', storedItem: { id: item.id, count: item.count }, reason: 'NATIVE_CUTTING_BOARD_TOP_ITEM_RENDERING_UNSUPPORTED' }
}

export function cuttingBoardStaticModelStatus (state, received, manifest) {
  if (state.name !== CUTTING_BOARD_ID || state.renderShape !== 'MODEL' || state.hasBlockEntity !== true) {
    return { available: false, reason: 'NATIVE_CUTTING_BOARD_STATE_UNSUPPORTED' }
  }
  if (!manifest?.sources?.some(source => source.sha256 === FARMERS_DELIGHT_JAR_SHA256)) {
    return { available: false, reason: 'NATIVE_FARMERS_DELIGHT_VERSION_UNSUPPORTED' }
  }
  if (!received || received.stateId !== state.stateId) return { available: false, reason: 'NATIVE_CUTTING_BOARD_ENTITY_NOT_RECEIVED' }
  if (received.content !== 'empty') {
    return { available: false, reason: received.reason || 'NATIVE_CUTTING_BOARD_INVENTORY_UNVERIFIED', storedItem: received.storedItem }
  }
  return { available: true }
}
