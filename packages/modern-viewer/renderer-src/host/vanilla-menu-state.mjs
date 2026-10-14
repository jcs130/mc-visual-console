/** Server window state IDs/properties supplement the actual Mineflayer Window.
 * Never construct a container from slot count or open another player's UI. */
export function observeVanillaMenus(bot, { onChange = () => {} } = {}) {
  const windows = new Map(), client = bot._client
  let pending = false, closed = false
  const changed = () => {
    if (pending || closed) return
    pending = true
    queueMicrotask(() => { pending = false; if (!closed) onChange() })
  }
  const packet = (value, meta) => {
    if (meta?.state !== 'play' || bot.version !== '1.21.1') return
    if (['window_items','set_slot'].includes(meta.name) && Number.isInteger(value.windowId) && value.windowId >= 0 && value.windowId <= 255) {
      const row = windows.get(value.windowId) || { properties: new Map() }
      if (Number.isSafeInteger(value.stateId) && value.stateId >= 0) row.stateId = value.stateId
      if (meta.name === 'window_items') row.slotCount = value.items?.length
      windows.set(value.windowId, row); changed()
    } else if (meta.name === 'craft_progress_bar') {
      const row = windows.get(value.windowId)
      if (row && Number.isInteger(value.property) && value.property >= 0 && value.property < 32 && Number.isInteger(value.value)) {
        row.properties.set(value.property, value.value); changed()
      }
    } else if (['open_window','close_window','open_horse_window'].includes(meta.name)) { windows.delete(value.windowId); changed() }
  }
  const reset = () => { windows.clear(); changed() }
  client.on('packet', packet); bot.on?.('respawn', reset); bot.on?.('end', reset)
  return {
    snapshot() {
      const window = bot.currentWindow, row = windows.get(window?.id)
      if (!window || window.id <= 0 || !row || row.slotCount !== window.slots?.length || !Number.isSafeInteger(row.stateId)) return null
      const dataValues = ['minecraft:furnace','minecraft:blast_furnace','minecraft:smoker'].includes(window.type) &&
        [0,1,2,3].every(key => row.properties.has(key)) ? [0,1,2,3].map(key => row.properties.get(key)) : null
      return { window, stateId: row.stateId, dataValues }
    },
    close() { closed = true; client.off('packet', packet); bot.off?.('respawn', reset); bot.off?.('end', reset); windows.clear() }
  }
}
