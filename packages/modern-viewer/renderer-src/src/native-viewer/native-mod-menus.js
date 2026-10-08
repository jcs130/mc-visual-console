// GUI geometry ported from the installed Curios 9.5.1 CuriosScreen and
// Domum Ornamentum 1.0.231 ArchitectsCutterScreen/Container, not proxy menus.
const CLIENT = '499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const own = (value, expected) => typeof expected === 'string' && UUID.test(expected) && typeof value?.playerUuid === 'string' && value.playerUuid.toLowerCase() === expected.toLowerCase()
export const NATIVE_CURIOS_GUI = Object.freeze({
  clientJarSha256: CLIENT, sourceName: 'curios-neoforge-9.5.1+1.21.1.jar',
  sourceSha256: 'a45df2125c26219974aba7507ffc9afe7b83acc941a386af3faacb1cc0056fde',
  path: 'assets/curios/textures/gui/curios/inventory.png', bytes: 1553,
  sha256: '0c81cd9620dc29121afa8a5f961fe9425d868af2333286009e3ea312d8dacd23',
  inventory: Object.freeze({ clientJarSha256: CLIENT,
    path: 'assets/minecraft/textures/gui/container/inventory.png', bytes: 454,
    sha256: 'c2f850076ad7ebd7a1b27d017fe5f66ac388f54de374de988cb79f86b1d59a65' })
})
export const NATIVE_DOMUM_GUIS = Object.freeze(['architectscutter', 'architectscutter2'].map((name, index) => Object.freeze({
  clientJarSha256: CLIENT, sourceName: 'domum-ornamentum-1.0.231-main.jar',
  sourceSha256: '04c0c902bdbcbd48e38bee5a323907ae0b7b7db4ff4a3e4da7c45334b65610a1',
  path: `assets/domum_ornamentum/textures/gui/container/${name}.png`, bytes: [13706,14429][index],
  sha256: ['42ee3d41bd1a55858d8dc725874aaaf719b6c66c1f89f9069fa1c499dcad685f',
    '40d3745e145ce35912c50a75d2d8b71de34e6933de369ab51f5f46e9ab7176ad'][index], width: 242, height: 202
})))

// Unknown screens retain real Slot coordinates. This is explicitly a diagnostic
// slot view; its neutral background must never be called the original mod GUI.
export function nativeCoordinateMenuLayout (menu, expectedUuid) {
  if (!own(menu, expectedUuid)) throw Error('NATIVE_MOD_MENU_IDENTITY_MISMATCH')
  if (!Number.isSafeInteger(menu.windowId) || menu.windowId <= 0 || !Number.isSafeInteger(menu.stateId) || menu.stateId < 0 ||
      !Array.isArray(menu.slots) || menu.slots.length < 1 || menu.slots.length > 256 ||
      !Array.isArray(menu.slotLayout) || menu.slotLayout.length !== menu.slots.length) throw Error('NATIVE_MOD_MENU_LAYOUT_UNAVAILABLE')
  const slots = menu.slots.map((row, i) => {
    const pos = menu.slotLayout[i]
    if (row?.slot !== i || !Object.hasOwn(row, 'item') || pos?.slot !== i || !Number.isInteger(pos.x) || !Number.isInteger(pos.y) ||
        pos.x < -512 || pos.x > 1024 || pos.y < -512 || pos.y > 1024) throw Error('NATIVE_MOD_MENU_LAYOUT_INVALID')
    return { row, x: pos.x, y: pos.y, role: 'native' }
  })
  const minX = Math.min(0, ...slots.map(row => row.x - 1)), minY = Math.min(0, ...slots.map(row => row.y - 1))
  const maxX = Math.max(...slots.map(row => row.x + 17)), maxY = Math.max(...slots.map(row => row.y + 17))
  return { width: maxX - minX + 7, height: maxY - minY + 7, offsetX: -minX, offsetY: -minY, slots }
}

export function nativeCuriosMenuLayout (menu, expectedUuid) {
  const raw = nativeCoordinateMenuLayout(menu, expectedUuid)
  if (menu.menuType !== 'curios:curios_container' || raw.slots.length < 46 || raw.slots.length > 110) throw Error('NATIVE_CURIOS_MENU_INVALID')
  for (const { row, x, y } of raw.slots.slice(0, 46)) {
    const i = row.slot
    const expected = i === 0 ? [154,28] : i < 5 ? [98 + ((i - 1) % 2) * 18,18 + Math.floor((i - 1) / 2) * 18]
      : i < 9 ? [8,8 + (i - 5) * 18] : i < 36 ? [8 + ((i - 9) % 9) * 18,84 + Math.floor((i - 9) / 9) * 18]
        : i < 45 ? [8 + (i - 36) * 18,142] : [77,62]
    if (x !== expected[0] || y !== expected[1]) throw Error('NATIVE_CURIOS_BASE_LAYOUT_MISMATCH')
  }
  const curios = raw.slots.slice(46), columns = [...new Set(curios.map(row => row.x))].sort((a,b) => a-b)
  const rows = columns.map(x => curios.filter(row => row.x === x).length)
  const pageOffset = curios.length > 0 && curios[0].y === 16
  const panelWidth = 14 + columns.length * 18
  if (columns.length > 8 || rows.some(n => n < 1 || n > 8) || curios.some(({ x, y }, i) =>
    x !== 7 - panelWidth + (i % columns.length) * 18 || y !== (pageOffset ? 16 : 8) + Math.floor(i / columns.length) * 18)) throw Error('NATIVE_CURIOS_SLOT_LAYOUT_MISMATCH')
  const metadata = menu.curios
  const state = own(metadata, expectedUuid) && metadata.containerId === menu.windowId && metadata.stateId === menu.stateId && metadata.menuOpen === true ? metadata : null
  const offsetX = columns.length ? 33 + (columns.length - 1) * 18 : 0
  const blits = [{ path: NATIVE_CURIOS_GUI.inventory.path, x: 0, y: 0, sourceX: 0, sourceY: 0, width: 176, height: 166 }]
  let x = -offsetX
  for (let col = 0; col < columns.length; col++) {
    const upperHeight = 7 + rows[0] * 18 + (pageOffset ? 8 : 0), sourceX = col === 0 ? 91 : 98
    blits.push({ x, y: 0, sourceX, sourceY: 0, width: 25, height: upperHeight },
      { x, y: upperHeight, sourceX, sourceY: 159, width: 25, height: 7 })
    if (columns.length === 1) blits.push({ x: x+7, y: 0, sourceX: 98, sourceY: 0, width: 25, height: upperHeight },
      { x: x+7, y: upperHeight, sourceX: 98, sourceY: 159, width: 25, height: 7 })
    x += col === 0 ? 25 : 18
  }
  x -= columns.length * 18
  for (const count of rows) {
    blits.push({ x, y: (pageOffset ? 8 : 0) + 7, sourceX: 7, sourceY: 7, width: 18, height: count * 18 }); x += 18
  }
  for (const meta of state?.menuSlots ?? []) if (meta.cosmetic === true && curios.some(slot => slot.row.slot === meta.menuSlot)) {
    const slot = raw.slots[meta.menuSlot]
    blits.push({ x: slot.x-1, y: slot.y-1, sourceX: 32, sourceY: 50, width: 18, height: 18 })
  }
  return { info: NATIVE_CURIOS_GUI, width: 176 + offsetX, height: 166, offsetX, offsetY: 0, blits,
    slots: raw.slots.map(slot => ({ ...slot, role: slot.row.slot >= 46 ? 'curio' : slot.row.slot === 0 ? 'result' : slot.row.slot < 5 ? 'crafting' : slot.row.slot < 9 ? 'armor'
      : slot.row.slot < 36 ? 'inventory' : slot.row.slot < 45 ? 'hotbar' : 'offhand' })),
    page: state?.page ?? null, totalPages: state?.totalPages ?? null, stateAvailable: Boolean(state) }
}

export function nativeDomumMenuLayout (menu, expectedUuid) {
  const raw = nativeCoordinateMenuLayout(menu, expectedUuid), state = menu.domum
  if (!own(state, expectedUuid) || state.source !== 'same_player_native_architects_cutter' ||
      state.windowId !== menu.windowId || state.stateId !== menu.stateId || !Array.isArray(state.inputs) || !Array.isArray(state.groups)) throw Error('NATIVE_DOMUM_MENU_STATE_UNAVAILABLE')
  const inputs = state.inputs.length, output = state.outputSlot
  if (inputs < 1 || inputs > 2 || output !== inputs || raw.slots.length !== inputs + 37) throw Error('NATIVE_DOMUM_SLOT_LAYOUT_UNVERIFIED')
  for (const { row, x, y } of raw.slots) {
    const i = row.slot, inv = i - inputs - 1
    const expected = i < inputs ? [96,66 + i*20] : i === output ? [183,77]
      : inv < 27 ? [40 + (inv%9)*18,120 + Math.floor(inv/9)*18] : [40 + (inv-27)*18,178]
    if (x !== expected[0] || y !== expected[1]) throw Error('NATIVE_DOMUM_SLOT_LAYOUT_MISMATCH')
  }
  return { info: NATIVE_DOMUM_GUIS[state.currentGroup === null ? 0 : 1], width: 242, height: 202, slots: raw.slots.map(slot =>
    ({ ...slot, role: slot.row.slot < inputs ? 'material' : slot.row.slot === output ? 'result' : 'inventory' })), state }
}
