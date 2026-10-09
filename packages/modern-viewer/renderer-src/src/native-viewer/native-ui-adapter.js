import * as THREE from 'three'
import { InventoryPlayerPreview } from '../modern-viewer/inventory-player-preview.js'
import { FishingCatchHud } from '../modern-viewer/fishing-catch.js'
import { NativeItemIcons } from './native-item-icons.js'
import { NativeLanguage } from './native-language.js'
import { nativeSoulSlabAnimationStyle, NATIVE_SOUL_SLAB_KEYFRAMES } from './native-soul-slab-icons.js'
import { NATIVE_CURIOS_GUI, NATIVE_DOMUM_GUIS, nativeCuriosMenuLayout, nativeDomumMenuLayout,
  nativeCoordinateMenuLayout } from './native-mod-menus.js'
export { NATIVE_CURIOS_GUI, NATIVE_DOMUM_GUIS, nativeCuriosMenuLayout, nativeDomumMenuLayout,
  nativeCoordinateMenuLayout } from './native-mod-menus.js'

// Adapt the original viewer's survival HUD, inventory layout and event panels.
// Class names and pixel coordinates originate in minecraft-viewer-hud.js and
// minecraft-viewer-panels.js. Actual inventory previews and fishing feeds use
// the original modules. No proxy registry, default player or game action API.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RESOURCE = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/
const slotRoleName = role => ({ material: '材料', result: '产物', inventory: '背包', input: '输入',
  output: '输出', fuel: '燃料', container: '容器', equipment: '装备', armor: '护甲' })[role] ?? role
const finite = value => typeof value === 'number' && Number.isFinite(value)
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const text = (value, limit = 240) => typeof value === 'string' ? value.slice(0, limit) : ''
const uuid = value => typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
const unavailable = reason => ({ available: false, reason, self: null, inventory: null,
  nativeMenu: null, skills: null, gameMessages: [], title: null, actionbar: null })

// Locked CraftingScreen fpg / CraftingMenu cqm, Minecraft 1.21.1. Coordinates
// are actual Slot item origins in GUI pixels, not an inferred container grid.
// Source class SHA256: fpg 2bdae8d835d46754180fda2459b04b477ab4acceb62b381f8d2b5521416af4eb;
// cqm 68025666eea6290a718ab8ff10ec17722ea741e54717e66a14428e25d5cb0551.
export const NATIVE_CRAFTING_GUI = Object.freeze({
  clientJarSha256: '499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99',
  path: 'assets/minecraft/textures/gui/container/crafting_table.png',
  sha256: 'baf65a599d8bb380b1b03efa1862c20fd29e936b43110d7438b9fe00086075b0',
  bytes: 404, width: 176, height: 166
})
// ContainerScreen fpe / ChestMenu cqc and AbstractFurnaceScreen fou /
// AbstractFurnaceMenu cpv from the same locked client. Texture crops and Slot
// origins are Java GUI pixels; all images still pass the reader's priority guard.
export const NATIVE_CHEST_GUI = Object.freeze({
  clientJarSha256: NATIVE_CRAFTING_GUI.clientJarSha256,
  path: 'assets/minecraft/textures/gui/container/generic_54.png',
  sha256: '1ca0500b1be97ba0dda9290bc16b554829b63de691cefe7dcbfd3078cae8c268',
  bytes: 348, width: 176
})
export const NATIVE_FURNACE_GUIS = Object.freeze(Object.fromEntries(['furnace', 'smoker', 'blast_furnace'].map(kind =>
  [`minecraft:${kind}`, Object.freeze({
    clientJarSha256: NATIVE_CRAFTING_GUI.clientJarSha256,
    path: `assets/minecraft/textures/gui/container/${kind}.png`,
    sha256: 'd700c1af4175a204e9e403c31dea2afdee575dac2bb23493f208b9f0bf3b2dc8',
    bytes: 452, width: 176, height: 166,
    lit: Object.freeze({ path: `assets/minecraft/textures/gui/sprites/container/${kind}/lit_progress.png`,
      sha256: '32f69838e8fbf0b980ec3f8b205d0ddb5f477fcf6202feddbd1b6a0b4524b6eb', bytes: 175, width: 14, height: 14 }),
    burn: Object.freeze({ path: `assets/minecraft/textures/gui/sprites/container/${kind}/burn_progress.png`,
      sha256: '9e042d39afe20bbdd4a0cfbb66be1c24f30327d460a48042d3a38cba7851c018', bytes: 143, width: 24, height: 16 })
  })])))
// Farmer's Delight 1.21.1-1.3.4: CookingPotScreen, CookingPotMenu and
// CookingPotBlockEntity.createIntArray(). The server exposes TWO data slots;
// its client's SimpleContainerData(4) constructor is only a client placeholder.
export const NATIVE_COOKING_POT_GUI = Object.freeze({
  clientJarSha256: NATIVE_CRAFTING_GUI.clientJarSha256,
  sourceName: 'FarmersDelight-1.21.1-1.3.4.jar',
  sourceSha256: '139ad7696462c89c03eea463f805abffa552526c5dadaadae221dd9624cb197c',
  path: 'assets/farmersdelight/textures/gui/cooking_pot.png',
  sha256: '52ac5d706ff3d49213d7a664bd2ce0bb04b5fc707f38d0762ae9a01722f8e514',
  bytes: 3595, width: 176, height: 166,
  emptyContainer: Object.freeze({ path: 'assets/farmersdelight/textures/item/empty_container_slot_bowl.png',
    sha256: '69a633cb92a2b0062ac979df80a66fac078546ff6944c9edd79c41794b7d65eb', bytes: 143 })
})
function verifiedMenuRows (menu, expectedUuid, typeMatches, count, kind) {
  if (!uuid(expectedUuid) || uuid(menu?.playerUuid) !== uuid(expectedUuid)) throw Error(`NATIVE_${kind}_MENU_IDENTITY_MISMATCH`)
  if (!typeMatches || !Number.isSafeInteger(menu.windowId) || menu.windowId <= 0 ||
      !Number.isSafeInteger(menu.stateId) || menu.stateId < 0) throw Error(`NATIVE_${kind}_MENU_STATE_UNVERIFIED`)
  const rows = nativeSlotRows(menu.slots)
  if (!rows || rows.length !== count || rows.some((row, i) => row.slot !== i)) throw Error(`NATIVE_${kind}_MENU_SLOTS_UNVERIFIED`)
  return rows
}
export function nativeCraftingMenuLayout (menu, expectedUuid) {
  const rows = verifiedMenuRows(menu, expectedUuid, menu?.menuType === 'minecraft:crafting', 46, 'CRAFTING')
  return rows.map(row => {
    const i = row.slot
    if (i === 0) return { row, x: 124, y: 35, role: 'result' }
    if (i < 10) return { row, x: 30 + ((i - 1) % 3) * 18, y: 17 + Math.floor((i - 1) / 3) * 18, role: 'crafting' }
    if (i < 37) return { row, x: 8 + ((i - 10) % 9) * 18, y: 84 + Math.floor((i - 10) / 9) * 18, role: 'inventory' }
    return { row, x: 8 + (i - 37) * 18, y: 142, role: 'hotbar' }
  })
}
export function nativeChestMenuLayout (menu, expectedUuid) {
  const match = /^minecraft:generic_9x([1-6])$/.exec(menu?.menuType ?? ''), rowsCount = match ? Number(match[1]) : 0
  const rows = verifiedMenuRows(menu, expectedUuid, Boolean(match), rowsCount * 9 + 36, 'CHEST')
  const offset = (rowsCount - 4) * 18, containerSize = rowsCount * 9
  return { info: NATIVE_CHEST_GUI, width: 176, height: 114 + rowsCount * 18, rowsCount,
    // Original Java blits cover one less pixel than imageHeight; retain it.
    blits: [{ x: 0, y: 0, sourceX: 0, sourceY: 0, width: 176, height: rowsCount * 18 + 17 },
      { x: 0, y: rowsCount * 18 + 17, sourceX: 0, sourceY: 126, width: 176, height: 96 }],
    slots: rows.map(row => {
      const i = row.slot
      if (i < containerSize) return { row, x: 8 + (i % 9) * 18, y: 18 + Math.floor(i / 9) * 18, role: 'container' }
      if (i < containerSize + 27) return { row, x: 8 + ((i - containerSize) % 9) * 18,
        y: 103 + Math.floor((i - containerSize) / 9) * 18 + offset, role: 'inventory' }
      return { row, x: 8 + (i - containerSize - 27) * 18, y: 161 + offset, role: 'hotbar' }
    }) }
}
export function nativeFurnaceMenuLayout (menu, expectedUuid) {
  const info = Object.hasOwn(NATIVE_FURNACE_GUIS, menu?.menuType) ? NATIVE_FURNACE_GUIS[menu.menuType] : null
  const rows = verifiedMenuRows(menu, expectedUuid, Boolean(info), 39, 'FURNACE')
  return { info, width: info.width, height: info.height, slots: rows.map(row => {
    const i = row.slot
    if (i < 3) return { row, x: [56, 56, 116][i], y: [17, 53, 35][i], role: ['input', 'fuel', 'result'][i] }
    if (i < 30) return { row, x: 8 + ((i - 3) % 9) * 18, y: 84 + Math.floor((i - 3) / 9) * 18, role: 'inventory' }
    return { row, x: 8 + (i - 30) * 18, y: 142, role: 'hotbar' }
  }) }
}
export function nativeFurnaceProgress (menu, expectedUuid) {
  nativeFurnaceMenuLayout(menu, expectedUuid)
  const values = menu.dataValues
  if (values === undefined || values === null) return { available: false, reason: text(menu.dataValuesError, 512) || 'NATIVE_FURNACE_DATA_UNAVAILABLE' }
  if (!Array.isArray(values) || values.length !== 4 || Array.from(values).some(value => !Number.isInteger(value) ||
      value < -2147483648 || value > 2147483647)) return { available: false, reason: 'NATIVE_FURNACE_DATA_UNVERIFIED' }
  // AbstractFurnaceMenu indices 0..3: litTime, litDuration, cookingProgress,
  // cookingTotalTime. Cast ints, divide and multiply as Java float32; Mth.ceil
  // is used by the original screen, including the litDuration==0 -> 200 rule.
  const ratio = (a, b) => clamp(Math.fround(Math.fround(a) / Math.fround(b)), 0, 1)
  const litRatio = ratio(values[0], values[1] === 0 ? 200 : values[1])
  const cookRatio = values[2] === 0 || values[3] === 0 ? 0 : ratio(values[2], values[3])
  const litPixels = values[0] > 0 ? Math.ceil(Math.fround(litRatio * 13)) + 1 : 0
  const burnPixels = Math.ceil(Math.fround(cookRatio * 24))
  return { available: true, values: values.slice(), litPixels, burnPixels,
    lit: { x: 56, y: 50 - litPixels, sourceX: 0, sourceY: 14 - litPixels, width: 14, height: litPixels },
    burn: { x: 79, y: 34, sourceX: 0, sourceY: 0, width: burnPixels, height: 16 } }
}
export function nativeCookingPotMenuLayout (menu, expectedUuid) {
  const rows = verifiedMenuRows(menu, expectedUuid, menu?.menuType === 'farmersdelight:cooking_pot', 45, 'COOKING_POT')
  const slots = rows.map(row => {
    const i = row.slot
    if (i < 6) return { row, x: 30 + (i % 3) * 18, y: 17 + Math.floor(i / 3) * 18, role: 'ingredient' }
    if (i < 9) return { row, x: [124,92,124][i - 6], y: [26,55,55][i - 6],
      role: ['cooked_meal_buffer','serving_container','served_output'][i - 6] }
    if (i < 36) return { row, x: 8 + ((i - 9) % 9) * 18, y: 84 + Math.floor((i - 9) / 9) * 18, role: 'inventory' }
    return { row, x: 8 + (i - 36) * 18, y: 142, role: 'hotbar' }
  })
  // An explicit server layout, when supplied, must corroborate this original
  // screen; do not force a different mod's runtime menu into an original PNG.
  if (menu.slotLayout !== undefined && menu.slotLayout !== null) {
    if (!Array.isArray(menu.slotLayout) || menu.slotLayout.length !== 45 ||
        Array.from(menu.slotLayout).some((value, i) => !record(value) || value.slot !== i ||
          value.x !== slots[i].x || value.y !== slots[i].y)) throw Error('NATIVE_COOKING_POT_SLOT_LAYOUT_MISMATCH')
  }
  return { info: NATIVE_COOKING_POT_GUI, width: 176, height: 166, slots }
}
export function nativeCookingPotState (menu, expectedUuid) {
  nativeCookingPotMenuLayout(menu, expectedUuid)
  const values = menu.dataValues
  let progress
  if (values === undefined || values === null) progress = { available: false, reason: text(menu.dataValuesError, 512) || 'NATIVE_COOKING_POT_DATA_UNAVAILABLE' }
  else if (!Array.isArray(values) || values.length !== 2 || Array.from(values).some(value => !Number.isInteger(value) || value < 0 || value > 2147483647))
    progress = { available: false, reason: 'NATIVE_COOKING_POT_DATA_UNVERIFIED' }
  else {
    // getCookProgressionScaled() uses Java int multiplication/division, NOT
    // the vanilla furnace's float32/ceil rule. Preserve int32 overflow first.
    const scaled = values[0] !== 0 && values[1] !== 0 ? (Math.trunc(Math.imul(values[0], 24) / values[1]) | 0) : 0
    const width = scaled + 1
    progress = width >= 1 && width <= 25
      ? { available: true, values: values.slice(), scaled, arrow: { x: 89, y: 25, sourceX: 176, sourceY: 15, width, height: 17 } }
      : { available: false, reason: 'NATIVE_COOKING_POT_PROGRESS_RANGE_UNSUPPORTED' }
  }
  const native = menu.cookingPot
  const heat = record(native) && uuid(native.playerUuid) === uuid(expectedUuid) && native.source === 'native_cooking_pot_menu' && typeof native.isHeated === 'boolean'
    ? { available: true, isHeated: native.isHeated, icon: { x: 47, y: 55, sourceX: 176, sourceY: 0, width: 17, height: 15 } }
    : { available: false, reason: 'NATIVE_COOKING_POT_HEAT_UNAVAILABLE' }
  const containerRows = heat.available && Object.hasOwn(native, 'container') ? nativeSlotRows([{ slot: 0, item: native.container }]) : null
  return { progress, heat, container: containerRows ? { available: true, item: containerRows[0].item } : { available: false } }
}
function verifyGuiSource (reader, info, kind) {
  const manifest = reader.manifest
  const sources = manifest?.sources?.filter(source => source.name === 'minecraft-1.21.1-client.jar')
  if (manifest?.minecraftVersion !== '1.21.1' || manifest.assetIntegrityVerified !== true ||
      manifest.clientJarSha256 !== info.clientJarSha256 || sources?.length !== 1 ||
      sources[0].sha256 !== info.clientJarSha256 || sources[0].explicitOverride) throw Error(`NATIVE_${kind}_GUI_CLIENT_UNVERIFIED`)
  if (info.sourceName) {
    const mod = manifest.sources.filter(source => source.name === info.sourceName)
    if (mod.length !== 1 || mod[0].sha256 !== info.sourceSha256 || mod[0].explicitOverride) throw Error(`NATIVE_${kind}_GUI_MOD_UNVERIFIED`)
  }
  const entry = manifest.assets?.[info.path]
  if (entry?.sha256 !== info.sha256 || entry.bytes !== info.bytes || (info.sourceName && entry.source !== info.sourceName)) throw Error(`NATIVE_${kind}_GUI_TEXTURE_UNVERIFIED`)
}

export function nativeSlotRows (rows) {
  if (!Array.isArray(rows) || rows.length > 256) return null
  const seen = new Set(), result = []
  for (const row of rows) {
    if (!record(row) || !Number.isInteger(row.slot) || row.slot < 0 || row.slot > 255 || seen.has(row.slot)) return null
    seen.add(row.slot)
    if (!Object.hasOwn(row, 'item')) return null
    if (row.item !== null && (!record(row.item) ||
      typeof row.item.name !== 'string' || row.item.name.length > 256 || !RESOURCE.test(row.item.name) ||
      row.item.name.split('/').some(part => part === '..' || part === '.' || !part) ||
      !Number.isSafeInteger(row.item.count) || row.item.count < 1 || row.item.count > 2147483647)) return null
    // Retain native components/SNBT and namespace unchanged. This adapter never
    // reconstructs a mod item from a Mineflayer itemId or strips its components.
    result.push({ ...row, item: row.item ?? null })
  }
  return result.sort((a, b) => a.slot - b.slot)
}

export function nativePresentationView (value, expectedUuid) {
  const expected = uuid(expectedUuid)
  if (!expected || value?.schemaVersion !== 1 || value.available !== true ||
      value.source !== 'same_player_connection' || uuid(value.playerUuid) !== expected) {
    return unavailable(value?.reason || '本人展示状态未同步或身份不一致')
  }
  let inventory = null, nativeMenu = null
  if (record(value.inventory) && (!value.inventory.playerUuid || uuid(value.inventory.playerUuid) === expected)) {
    const slots = nativeSlotRows(value.inventory.slots)
    if (slots) inventory = { ...value.inventory, slots }
  }
  if (record(value.nativeMenu) && (!value.nativeMenu.playerUuid || uuid(value.nativeMenu.playerUuid) === expected)) {
    const slots = nativeSlotRows(value.nativeMenu.slots)
    if (slots) nativeMenu = { ...value.nativeMenu, slots }
  }
  return { ...value, available: true, self: record(value.self) && (!value.self.uuid || uuid(value.self.uuid) === expected) ? value.self : null,
    inventory, nativeMenu, skills: record(value.skills) ? value.skills : null,
    gameMessages: Array.isArray(value.gameMessages) ? value.gameMessages.slice(-40) : [],
    title: record(value.title) ? value.title : null, actionbar: record(value.actionbar) ? value.actionbar : null }
}

// These are exact resource paths from the same pack, not the old /textures
// alias. NativeAssetReader.bytes verifies SHA256 and pack priority before use.
export const HUD_SPRITES = Object.freeze(['heart/full', 'heart/half', 'heart/container',
  'heart/absorbing_full', 'heart/absorbing_half', 'food_full', 'food_half', 'food_empty',
  'armor_full', 'armor_half', 'armor_empty', 'air', 'air_bursting', 'crosshair',
  'hotbar', 'hotbar_selection', 'experience_bar_background', 'experience_bar_progress'])
export class NativeUiAssets {
  constructor (reader, { createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url) } = {}) {
    this.reader = reader; this.createUrl = createUrl; this.revokeUrl = revokeUrl
    this.urls = new Map(); this.pending = new Map(); this.errors = new Map(); this.disposed = false
    this.craftingReason = 'NATIVE_CRAFTING_GUI_LOADING'
    this.cookingPotReason = 'NATIVE_COOKING_POT_GUI_LOADING'; this.cookingPotPlaceholderReason = 'NATIVE_COOKING_POT_GUI_LOADING'
    this.chestReason = 'NATIVE_CHEST_GUI_LOADING'; this.furnaceReasons = new Map(); this.furnaceProgressReasons = new Map()
    this.curiosReason = 'NATIVE_CURIOS_GUI_LOADING'; this.domumReason = 'NATIVE_DOMUM_GUI_LOADING'
    for (const type of Object.keys(NATIVE_FURNACE_GUIS)) {
      this.furnaceReasons.set(type, 'NATIVE_FURNACE_GUI_LOADING')
      this.furnaceProgressReasons.set(type, 'NATIVE_FURNACE_GUI_LOADING')
    }
  }
  async texture (path) {
    if (this.disposed) throw Error('NATIVE_UI_ASSETS_DISPOSED')
    if (!/^assets\/[a-z0-9_.-]+\/textures\/[a-z0-9_./-]+\.png$/.test(path) || path.split('/').some(p => p === '..' || p === '.')) throw Error('NATIVE_UI_RESOURCE_INVALID')
    if (!this.pending.has(path)) this.pending.set(path, (async () => {
      try {
        const bytes = await this.reader.bytes(path)
        if (this.disposed) throw Error('NATIVE_UI_ASSETS_DISPOSED')
        const url = this.createUrl(new Blob([bytes], { type: 'image/png' }))
        this.urls.set(path, url); return url
      } catch (error) { this.errors.set(path, error.message); throw error }
    })())
    return this.pending.get(path)
  }
  hud (name) { return this.urls.get(`assets/minecraft/textures/gui/sprites/hud/${name}.png`) ?? null }
  async prepare () {
    await Promise.allSettled([...HUD_SPRITES.map(name => `assets/minecraft/textures/gui/sprites/hud/${name}.png`),
      'assets/minecraft/textures/gui/container/inventory.png'].map(path => this.texture(path)))
    const prepare = async (info, kind) => {
      try { verifyGuiSource(this.reader, info, kind); await this.texture(info.path); return null } catch (error) { return error.message }
    }
    await Promise.all([
      prepare(NATIVE_CRAFTING_GUI, 'CRAFTING').then(reason => { this.craftingReason = reason }),
      prepare(NATIVE_CHEST_GUI, 'CHEST').then(reason => { this.chestReason = reason }),
      Promise.all([NATIVE_CURIOS_GUI, NATIVE_CURIOS_GUI.inventory].map(info => prepare(info, 'CURIOS')))
        .then(reasons => { this.curiosReason = reasons.find(Boolean) ?? null }),
      Promise.all(NATIVE_DOMUM_GUIS.map(info => prepare(info, 'DOMUM')))
        .then(reasons => { this.domumReason = reasons.find(Boolean) ?? null }),
      prepare(NATIVE_COOKING_POT_GUI, 'COOKING_POT').then(reason => { this.cookingPotReason = reason }),
      prepare({ ...NATIVE_COOKING_POT_GUI, ...NATIVE_COOKING_POT_GUI.emptyContainer }, 'COOKING_POT').then(reason => { this.cookingPotPlaceholderReason = reason }),
      ...Object.entries(NATIVE_FURNACE_GUIS).map(async ([type, info]) => {
        this.furnaceReasons.set(type, await prepare(info, 'FURNACE'))
        const reasons = await Promise.all([info.lit, info.burn].map(sprite => prepare({ ...sprite, clientJarSha256: info.clientJarSha256 }, 'FURNACE')))
        this.furnaceProgressReasons.set(type, reasons.find(Boolean) ?? null)
      })
    ])
    return { available: this.errors.size === 0, failures: [...this.errors.keys()] }
  }
  dispose () {
    if (this.disposed) return
    this.disposed = true
    for (const url of this.urls.values()) this.revokeUrl(url)
    this.urls.clear()
  }
}

function node (document, tag, className, content) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (content !== undefined) element.textContent = content
  return element
}

// An optional future icon resolver must consume the complete native item.
// Absence means a truthful text label, never /icons/<basename>.png.
export function renderNativeItemSlot (document, slot, item, { label = '', resolveItemIcon, resolveItemIconReason, resolveItemName } = {}) {
  slot.replaceChildren()
  slot.dataset.state = 'available'
  slot.dataset.itemName = item?.name ?? ''
  slot.dataset.modelState = item ? 'unavailable' : 'empty'
  delete slot.dataset.modelReason
  delete slot.dataset.effectReason; delete slot.dataset.animationFrames
  // Localize the original same-player Component, retaining the native ID and
  // complete SNBT. Unknown/custom names keep the authoritative server text.
  const displayName = text(resolveItemName?.(item), 256) || text(item?.displayName, 256) || item?.name
  const food = item?.food
  const foodText = record(food) && Number.isSafeInteger(food.nutrition) && food.nutrition >= 0 &&
    finite(food.saturation) && food.saturation >= 0 && typeof food.canAlwaysEat === 'boolean' && finite(food.eatSeconds) && food.eatSeconds >= 0
    ? `\n原生营养 ${food.nutrition} · 饱和度 ${food.saturation} · 食用 ${food.eatSeconds} 秒${food.canAlwaysEat ? ' · 可饱食食用' : ''}` : ''
  const identity = item ? `${displayName}${displayName !== item.name ? `\n${item.name}` : ''} × ${item.count}${foodText}` : ''
  slot.title = item ? `${identity} · 原生物品模型未支持` : `${label}：空`
  slot.setAttribute('aria-label', slot.title)
  if (!item) return
  let icon = resolveItemIcon?.(item), animationStyle = null, animationError = null
  if (icon?.animation) {
    try { animationStyle = nativeSoulSlabAnimationStyle(icon.animation) }
    catch (error) { animationError = error.message; icon = null }
  }
  if (record(icon) && icon.verified === true && typeof icon.url === 'string' && icon.url.startsWith('blob:')) {
    const image = node(document, 'img'); image.alt = displayName; image.src = icon.url
    slot.dataset.modelState = icon.effectUnavailableReason ? 'partial' : 'verified'; slot.title = identity
    let iconContainer = slot
    if (animationStyle) {
      iconContainer = node(document, 'span', 'corti-native-animated-icon')
      Object.assign(iconContainer.style, { position: 'relative', display: 'block', width: '32px', height: '32px', overflow: 'hidden', flexShrink: '0' })
      Object.assign(image.style, { position: 'absolute', left: '0', top: '0', width: '32px', maxHeight: 'none', imageRendering: 'pixelated', ...animationStyle })
      slot.dataset.animationFrames = String(icon.animation.frameCount)
      slot.title += ' · 原模组7帧动画图标'
    }
    if (icon.effectUnavailableReason) {
      slot.dataset.effectReason = icon.effectUnavailableReason
      slot.title += ' · 附魔光效未适配（原生图集坐标未同步）'
    }
    image.addEventListener('error', () => {
      if (image.parentNode !== iconContainer || (iconContainer !== slot && iconContainer.parentNode !== slot)) return
      if (iconContainer === slot) image.remove(); else iconContainer.remove()
      slot.dataset.modelState = 'unavailable'; delete slot.dataset.animationFrames; delete slot.dataset.effectReason
      slot.dataset.modelReason = 'NATIVE_ITEM_ICON_IMAGE_DECODE_FAILED'
      slot.title = `${identity} · 原生物品图标解码失败（${slot.dataset.modelReason}）`; slot.setAttribute('aria-label', slot.title)
      slot.prepend(node(document, 'span', 'corti-item-fallback', displayName))
    }, { once: true })
    if (iconContainer === slot) slot.append(image)
    else { iconContainer.append(image); slot.append(iconContainer) }
  } else {
    const reason = animationError || text(resolveItemIconReason?.(item), 512)
    if (reason) slot.dataset.modelReason = reason
    const loading = reason === 'loading' || reason === 'not_requested'
    if (loading) slot.dataset.modelState = 'loading'
    slot.title = `${identity} · ${loading ? '原生物品图标加载中' : `原生物品模型未支持${reason ? `（${reason}）` : ''}`}`
    slot.append(node(document, 'span', 'corti-item-fallback', displayName))
  }
  if (item.count > 1) slot.append(node(document, 'span', 'corti-slot-count', String(item.count)))
  slot.setAttribute('aria-label', slot.title)
}

// Reuse the original bounded queue/deduplication/reset controller. Its show()
// assumes the old /icons registry and normalizer removes visual components,
// so this native presentation override keeps the actual complete item and
// renders through the same strict item resolver as inventory/hotbar.
export class NativeFishingCatchHud extends FishingCatchHud {
  constructor (options) { super(options); this.nativeItems = new Map(); this.resolveItemName = options.resolveItemName }
  push (event) {
    const rows = nativeSlotRows([{ slot: 0, item: event?.item ? { ...event.item, count: event.count } : null }])
    if (!rows?.[0].item || !Number.isSafeInteger(event.seq)) return false
    this.nativeItems.set(event.seq, rows[0].item)
    while (this.nativeItems.size > 64) this.nativeItems.delete(this.nativeItems.keys().next().value)
    return super.push(event)
  }
  show (caught) {
    this.active = caught
    const document = this.root.ownerDocument
    const icon = node(document, 'div', 'viewer-fishing-catch-icon corti-slot')
    icon.setAttribute('aria-hidden', 'true')
    const actualItem=this.nativeItems.get(caught.seq) ?? caught.item
    const actualLabel=this.resolveItemName?.(actualItem)||text(actualItem?.displayName,256)||actualItem?.name||caught.label
    this.renderIcon?.(icon, actualItem)
    const copy = node(document, 'div', 'viewer-fishing-catch-copy')
    const name = node(document, 'strong', '', actualLabel); name.title = actualItem?.name ? `${actualLabel}\n${actualItem.name}` : actualLabel
    copy.append(node(document, 'small', '', '钓获'), name)
    this.root.replaceChildren(icon, copy, node(document, 'span', 'viewer-fishing-catch-count', `×${caught.count}`))
    this.root.hidden = false
    this.root.setAttribute('aria-label', `钓获 ${actualLabel}，${caught.count} 个`)
    this.timer = this.schedule(() => this.advance(), 4500)
  }
  reset () { super.reset(); this.nativeItems?.clear() }
}

export function createNativeInterface ({ document = globalThis.document,
  previewFactory = options => new InventoryPlayerPreview(options), now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout, resolveItemIcon, resolveItemIconReason, language = new NativeLanguage() } = {}) {
  if (!document?.getElementById) throw Error('NATIVE_UI_DOCUMENT_INVALID')
  const el = id => document.getElementById(id), q = selector => document.querySelector(selector)
  let expectedUuid = null, actor = null, actorReason = null, assets = null, assetsSequence = 0, current = null, itemIcons = null, iconRevision = 0
  let hudSignature = null, skillsSignature = null
  const resolveIcon = item => typeof resolveItemIcon === 'function' ? resolveItemIcon(item) : itemIcons?.resolve(item)
  const resolveName = item => language.item(item)
  const resolveIconReason = item => typeof resolveItemIconReason === 'function' ? resolveItemIconReason(item)
    : typeof resolveItemIcon === 'function' ? null : itemIcons?.reason(item)
  let presentation = unavailable('等待本人状态'), manualOpen = false, idleOpen = false,
    idleTimer = null, dismissedMenu = null, preview = null, disposed = false, lastMenuSignature = null
  let combatUntil = 0
  const timers = new Set(), seenMessages = new Set(), seenTitles = new Set(), listeners = []
  const listen = (target, event, callback) => { target?.addEventListener(event, callback); listeners.push([target, event, callback]) }
  const later = (callback, delay) => {
    const handle = setTimer(() => { timers.delete(handle); if (!disposed) callback() }, delay)
    timers.add(handle); return handle
  }
  const cancelIdle = () => { if (idleTimer !== null) { clearTimer(idleTimer); timers.delete(idleTimer) }; idleTimer = null; idleOpen = false }
  const note = (target, label) => {
    if (!target) return
    target.replaceChildren(node(document, 'span', 'native-unavailable', label))
    target.dataset.state = 'unavailable'; target.dataset.itemName = ''; target.title = label
    target.setAttribute('aria-label', label)
  }
  const uiSprite = name => assets?.hud(name)
  const iconRow = (selector, count, value, full, half, empty, label) => {
    const target = q(selector)
    if (!target) return
    if (!finite(value) || !Number.isInteger(count) || !uiSprite(full) || !uiSprite(half) || !uiSprite(empty)) { note(target, label); return }
    target.dataset.state = 'available'; target.title = ''; target.removeAttribute('aria-label'); target.replaceChildren()
    for (let i = 0; i < clamp(count, 0, 80); i++) {
      const icon = node(document, 'span', 'corti-icon'), amount = value - i * 2
      const overlay = amount >= 2 ? full : amount > 0 ? half : null
      icon.style.backgroundImage = overlay ? `url("${uiSprite(overlay)}"),url("${uiSprite(empty)}")` : `url("${uiSprite(empty)}")`
      target.append(icon)
    }
  }
  const selfState = () => presentation.self ?? (expectedUuid && uuid(current?.selfPlayer?.uuid) === expectedUuid ? current?.selfPlayer : null)
  const renderHud = () => {
    const self = selfState() ?? {}, health = self.health, maxHealth = self.maxHealth
    const signature = JSON.stringify([health, maxHealth, self.food, self.armor, self.oxygen, self.inWater,
      self.experienceLevel, self.experienceProgress, presentation.inventory, assetsSequence, iconRevision])
    if (hudSignature === signature) return
    hudSignature = signature
    iconRow('[data-corti-hearts]', finite(maxHealth) && maxHealth > 0 ? Math.ceil(clamp(maxHealth, 1, 160) / 2) : null,
      health, 'heart/full', 'heart/half', 'heart/container', finite(health) ? `生命 ${health} · 上限或纹理未同步` : '生命未同步')
    const hearts = q('[data-corti-hearts]')
    if (hearts?.dataset.state === 'available') {
      hearts.style.display = 'grid'; hearts.style.gridTemplateColumns = 'repeat(10, 16px)'
      const rows = Math.max(1, Math.ceil(hearts.children.length / 10))
      hearts.style.gridAutoRows = '18px'; hearts.style.height = `${rows * 18}px`
      hearts.title = `生命 ${health}/${maxHealth}`
    }
    iconRow('[data-corti-food]', 10, self.food, 'food_full', 'food_half', 'food_empty', finite(self.food) ? `饥饿 ${self.food}/20 · 纹理未同步` : '饥饿未同步')
    iconRow('[data-corti-armor]', finite(self.armor) && self.armor > 0 ? 10 : 0, self.armor,
      'armor_full', 'armor_half', 'armor_empty', '护甲未同步')
    // Host oxygen is the normalized 0..20 HUD reading, not raw airSupply ticks.
    iconRow('[data-corti-air]', self.inWater === true && finite(self.oxygen) && self.oxygen < 20 ? 10 : 0,
      self.oxygen, 'air', 'air', 'air_bursting', '氧气未同步')
    const level = q('[data-corti-level]'), xp = q('[data-corti-xp]')
    if (level) { level.textContent = finite(self.experienceLevel) ? String(self.experienceLevel) : '等级未同步'; level.title = level.textContent }
    if (xp) { xp.style.width = finite(self.experienceProgress) ? `${clamp(self.experienceProgress, 0, 1) * 364}px` : '0px'; xp.title = finite(self.experienceProgress) ? `经验 ${self.experienceProgress}` : '经验未同步'; xp.dataset.state = finite(self.experienceProgress) ? 'available' : 'unavailable' }
    const inventory = presentation.inventory, bar = q('[data-corti-slots]'), offhand = q('[data-corti-offhand]'), selection = q('[data-corti-selection]')
    const slotMap = new Map(inventory?.slots.map(row => [row.slot, row.item]) ?? [])
    if (bar) {
      bar.replaceChildren(); bar.title = ''; bar.removeAttribute('aria-label'); bar.dataset.state = inventory ? 'available' : 'unavailable'
      if (!inventory || !Number.isInteger(inventory.hotbarStart)) note(bar, '快捷栏未同步')
      else for (let i = 0; i < 9; i++) {
        const index = inventory.hotbarStart + i, slot = node(document, 'div', 'corti-slot')
        slot.dataset.slot = String(index)
        if (!slotMap.has(index)) note(slot, '槽未同步')
        else renderNativeItemSlot(document, slot, slotMap.get(index), { label: `快捷栏 ${i + 1}`, resolveItemIcon: resolveIcon, resolveItemIconReason: resolveIconReason, resolveItemName: resolveName })
        bar.append(slot)
      }
    }
    if (offhand) {
      if (inventory && Number.isInteger(inventory.offhandSlot) && slotMap.has(inventory.offhandSlot)) renderNativeItemSlot(document, offhand, slotMap.get(inventory.offhandSlot), { label: '副手', resolveItemIcon: resolveIcon, resolveItemIconReason: resolveIconReason, resolveItemName: resolveName })
      else note(offhand, '副手未同步')
    }
    if (selection) {
      const selected = inventory?.selectedHotbarSlot
      selection.hidden = !Number.isInteger(selected) || selected < 0 || selected > 8
      if (!selection.hidden) selection.style.left = `${4 + selected * 40}px`
    }
  }
  const slot = (body, row, x, y, label) => {
    const element = node(document, 'div', 'corti-menu-slot')
    element.dataset.slot = String(row.slot)
    if (x !== undefined) { element.style.left = `${x * 2}px`; element.style.top = `${y * 2}px` }
    renderNativeItemSlot(document, element, row.item, { label, resolveItemIcon: resolveIcon, resolveItemIconReason: resolveIconReason, resolveItemName: resolveName }); body.append(element)
    return element
  }
  const actorSource = () => {
    if (!expectedUuid || uuid(actor?.assetInfo?.uuid ?? actor?.root?.userData?.playerUuid) !== expectedUuid || !actor.root) return null
    if (actor.assetInfo?.kind === 'ysm') {
      if (uuid(actor.assetInfo.uuid) !== expectedUuid || actor.assetInfo.inventoryPreviewAvailable !== true || !actor.root.isObject3D ||
          uuid(actor.root.userData?.playerUuid) !== expectedUuid) return null
      return actor.root
    }
    if (!actor.root.playerObject) return null
    return actor.root
  }
  const actorUnavailableReason = () => typeof actorReason === 'string' && /^(NATIVE_|PLAYER_)/.test(actorReason)
    ? `本人模型暂不可用（${actorReason.slice(0, 160)}）` : null
  const actualContainer = () => Number.isInteger(presentation.nativeMenu?.windowId) && presentation.nativeMenu.windowId > 0 ? presentation.nativeMenu : null
  const renderInventory = (body, inventory) => {
    const map = new Map(inventory.slots.map(row => [row.slot, row]))
    const classic = inventory.windowId === 0 && inventory.inventoryStart === 9 && inventory.hotbarStart === 36 && inventory.offhandSlot === 45
    const background = assets?.urls.get('assets/minecraft/textures/gui/container/inventory.png')
    const panel = node(document, 'div', classic && background ? 'corti-menu-body corti-menu-vanilla' : 'corti-menu-generic')
    if (classic && background) {
      panel.style.backgroundImage = `url("${background}")`
      const host = node(document, 'div', 'corti-inventory-player-preview')
      host.dataset.inventoryPlayerPreview = ''; host.dataset.previewState = 'waiting'
      host.setAttribute('role', 'img'); host.setAttribute('aria-label', actor?.assetInfo?.kind === 'ysm'
        ? '本人 YSM 原模型预览；装备渲染未支持' : '本人真实皮肤预览；装备渲染未支持')
      panel.append(host)
      for (const [id, x, y, label] of [[5,8,8,'头盔'],[6,8,26,'胸甲'],[7,8,44,'护腿'],[8,8,62,'靴子'],
        [1,98,18,'合成'],[2,116,18,'合成'],[3,98,36,'合成'],[4,116,36,'合成'],[0,154,28,'合成结果'],[45,77,62,'副手']]) {
        if (map.has(id)) slot(panel, map.get(id), x, y, label)
      }
      for (let i = 0; i < 27; i++) if (map.has(9 + i)) slot(panel, map.get(9 + i), 8 + (i % 9) * 18, 84 + Math.floor(i / 9) * 18, '背包')
      for (let i = 0; i < 9; i++) if (map.has(36 + i)) slot(panel, map.get(36 + i), 8 + i * 18, 142, '快捷栏')
      body.append(panel)
      preview ??= previewFactory({ THREE, document, resolveSource: actorSource, getUnavailableReason: actorUnavailableReason }) // Intentionally no createFallback.
      preview.attach(host)
    } else {
      const host = node(document, 'div', 'native-inventory-preview')
      host.style.width = '104px'; host.style.height = '140px'; host.style.position = 'relative'
      host.classList.add('corti-inventory-player-preview'); host.style.left = '0'; host.style.top = '0'
      host.dataset.previewState = 'waiting'; panel.append(host)
      const grid = node(document, 'div', 'corti-menu-grid')
      for (const row of inventory.slots) slot(grid, row, undefined, undefined, `原生槽 ${row.slot}`)
      panel.append(grid); body.append(panel)
      preview ??= previewFactory({ THREE, document, resolveSource: actorSource, getUnavailableReason: actorUnavailableReason })
      preview.attach(host)
    }
    body.append(node(document, 'p', 'corti-menu-note', '本人原生物品与组件 · 只读；已支持图标按原生模型加载，未支持的专用模型及装备明确标注'))
    if (actor?.assetInfo?.kind === 'ysm') body.append(node(document, 'p', 'corti-menu-note', actorSource()
      ? 'YSM 背包人物沿用本人原模型与当前姿态；装备未适配' : '本人 YSM 背包人物预览不可用；装备未适配'))
  }
  const renderMenu = () => {
    const menu = el('corti-menu'), body = q('[data-menu-body]')
    if (!menu || !body) return
    const window = actualContainer()
    const windowKey = window ? `${window.windowId ?? ''}:${window.stateId ?? ''}` : null
    const showWindow = window && dismissedMenu !== windowKey
    const visible = Boolean(showWindow || manualOpen || idleOpen)
    menu.hidden = !visible
    if (!visible) { preview?.setVisible(false); lastMenuSignature = null; return }
    const signature = JSON.stringify([showWindow ? window : presentation.inventory, presentation.modOperations, manualOpen, idleOpen, assetsSequence])
    if (signature === lastMenuSignature) return
    lastMenuSignature = signature; preview?.setVisible(false); body.replaceChildren()
    const heading = q('[data-menu-title]'), source = q('[data-menu-source]')
    if (showWindow) {
      menu.dataset.inventorySource = 'container'
      if (heading) heading.textContent = language.menu(window)
      if (source) source.textContent = '真实游戏窗口 · 只读'
      let layout = null, kind = null, reason = null
      try {
        if (window.menuType === 'minecraft:crafting') {
          kind = 'crafting'
          layout = { info: NATIVE_CRAFTING_GUI, width: 176, height: 166, slots: nativeCraftingMenuLayout(window, expectedUuid) }
          reason = assets ? assets.craftingReason : 'NATIVE_CRAFTING_GUI_LOADING'
        } else if (/^minecraft:generic_9x[1-6]$/.test(window.menuType)) {
          kind = 'chest'; layout = nativeChestMenuLayout(window, expectedUuid)
          reason = assets ? assets.chestReason : 'NATIVE_CHEST_GUI_LOADING'
        } else if (Object.hasOwn(NATIVE_FURNACE_GUIS, window.menuType)) {
          kind = 'furnace'; layout = nativeFurnaceMenuLayout(window, expectedUuid)
          reason = assets ? assets.furnaceReasons.get(window.menuType) : 'NATIVE_FURNACE_GUI_LOADING'
        } else if (window.menuType === 'farmersdelight:cooking_pot') {
          kind = 'cooking-pot'; layout = nativeCookingPotMenuLayout(window, expectedUuid)
          reason = assets ? assets.cookingPotReason : 'NATIVE_COOKING_POT_GUI_LOADING'
        } else if (window.menuType === 'curios:curios_container') {
          kind = 'curios'; layout = nativeCuriosMenuLayout(window, expectedUuid)
          reason = assets ? assets.curiosReason : 'NATIVE_CURIOS_GUI_LOADING'
        } else if (window.menuType?.startsWith('domum_ornamentum:') && window.domum) {
          kind = 'domum'; layout = nativeDomumMenuLayout(window, expectedUuid)
          reason = assets ? assets.domumReason : 'NATIVE_DOMUM_GUI_LOADING'
        }
        if (reason || (layout && !assets?.urls.get(layout.info.path))) layout = null
      } catch (error) { reason = error.message; layout = null }
      if (layout) {
        const { info } = layout, background = assets.urls.get(info.path)
        const panel = node(document, 'div', `corti-menu-body corti-menu-vanilla native-menu-${kind}`)
        panel.style.width = `${layout.width * 2}px`; panel.style.height = `${layout.height * 2}px`
        panel.style.position = 'relative'
        panel.dataset.nativeGuiSource = info.path; panel.dataset.nativeGuiSha256 = info.sha256
        panel.dataset.windowId = String(window.windowId); panel.dataset.stateId = String(window.stateId)
        const blit = (image, imageWidth, imageHeight, crop, className) => {
          if (crop.width <= 0 || crop.height <= 0) return
          const part = node(document, 'div', className)
          part.style.position = 'absolute'; part.style.pointerEvents = 'none'
          part.style.left = `${(crop.x + (layout.offsetX ?? 0)) * 2}px`; part.style.top = `${(crop.y + (layout.offsetY ?? 0)) * 2}px`
          part.style.width = `${crop.width * 2}px`; part.style.height = `${crop.height * 2}px`
          part.style.backgroundImage = `url("${image}")`; part.style.backgroundRepeat = 'no-repeat'
          part.style.backgroundSize = `${imageWidth * 2}px ${imageHeight * 2}px`
          part.style.backgroundPosition = `${-crop.sourceX * 2}px ${-crop.sourceY * 2}px`
          part.style.imageRendering = 'pixelated'
          part.dataset.nativeSourceX = String(crop.sourceX); part.dataset.nativeSourceY = String(crop.sourceY)
          part.dataset.nativeBlitWidth = String(crop.width); part.dataset.nativeBlitHeight = String(crop.height)
          panel.append(part)
        }
        if (layout.blits) {
          panel.style.backgroundImage = 'none'
          for (const crop of layout.blits) blit(crop.path ? assets.urls.get(crop.path) : background, 256, 256, crop, 'native-menu-background-blit')
        } else panel.style.backgroundImage = `url("${background}")`
        if (kind === 'curios') {
          const host = node(document, 'div', 'corti-inventory-player-preview')
          host.style.left = `${52 + layout.offsetX * 2}px`; host.dataset.previewState = 'waiting'
          host.setAttribute('role', 'img'); host.setAttribute('aria-label', '本人原模型预览；装备渲染未支持')
          panel.append(host)
          preview ??= previewFactory({ THREE, document, resolveSource: actorSource, getUnavailableReason: actorUnavailableReason })
          preview.attach(host)
        }
        let progress = null, cookingPot = null
        if (kind === 'furnace') {
          progress = nativeFurnaceProgress(window, expectedUuid)
          const spriteReason = assets.furnaceProgressReasons.get(window.menuType)
          if (progress.available && spriteReason) progress = { available: false, reason: spriteReason }
          panel.dataset.progressState = progress.available ? 'available' : 'unknown'
          if (progress.available) {
            if (progress.litPixels > 0) blit(assets.urls.get(info.lit.path), 14, 14, progress.lit, 'native-menu-progress-lit')
            blit(assets.urls.get(info.burn.path), 24, 16, progress.burn, 'native-menu-progress-burn')
          } else panel.dataset.progressReason = progress.reason
        } else if (kind === 'cooking-pot') {
          cookingPot = nativeCookingPotState(window, expectedUuid)
          panel.dataset.progressState = cookingPot.progress.available ? 'available' : 'unknown'
          panel.dataset.heatState = cookingPot.heat.available ? (cookingPot.heat.isHeated ? 'heated' : 'not_heated') : 'unknown'
          if (cookingPot.progress.available) blit(background, 256, 256, cookingPot.progress.arrow, 'native-menu-cooking-pot-progress')
          else panel.dataset.progressReason = cookingPot.progress.reason
          if (cookingPot.heat.available && cookingPot.heat.isHeated) blit(background, 256, 256, cookingPot.heat.icon, 'native-menu-cooking-pot-heat')
          else if (!cookingPot.heat.available) panel.dataset.heatReason = cookingPot.heat.reason
        }
        if (kind === 'domum') {
          panel.dataset.previewState = layout.previewReason ? 'unavailable' : 'available'
          if (layout.previewReason) panel.dataset.previewReason = layout.previewReason
          for (const crop of layout.previewBlits) blit(assets.urls.get(NATIVE_DOMUM_GUIS[0].path), 256, 256, crop, 'native-domum-preview-background')
          for (const preview of layout.previews) {
            const element = node(document, 'div', 'native-domum-recipe-preview')
            element.style.position = 'absolute'; element.style.left = `${preview.x * 2}px`; element.style.top = `${preview.y * 2}px`
            element.style.width = '32px'; element.style.height = '32px'; element.style.pointerEvents = 'none'
            element.dataset.previewKind = preview.kind; element.dataset.selected = String(preview.selected)
            element.dataset.nativePreviewIndex = String(preview.buttonId ?? preview.variantIndex)
            renderNativeItemSlot(document, element, preview.item, { label: '原生配方预览（不是物品栏）', resolveItemIcon: resolveIcon, resolveItemIconReason: resolveIconReason, resolveItemName: resolveName })
            element.title += ' · 配方预览，不是可取物品'; element.setAttribute('aria-label', element.title)
            for (const image of element.querySelectorAll('img')) { image.style.width = '32px'; image.style.height = '32px'; image.style.imageRendering = 'pixelated' }
            panel.append(element)
          }
        }
        for (const { row, x, y, role } of layout.slots) {
          // Original Slot coords address the 16px item; existing CSS draws its
          // 32px image 2px inside this 36px div, so place the div one GUI pixel back.
          const itemSlot = slot(panel, row, x - 1 + (layout.offsetX ?? 0), y - 1 + (layout.offsetY ?? 0), `原生${slotRoleName(role)}槽 ${row.slot}`)
          itemSlot.dataset.nativeSlotX = String(x); itemSlot.dataset.nativeSlotY = String(y); itemSlot.dataset.slotRole = role
          if (typeof window.mayPickup?.[row.slot] === 'boolean') itemSlot.dataset.mayPickup = String(window.mayPickup[row.slot])
          if (kind === 'cooking-pot' && row.slot === 7 && row.item === null) {
            const placeholder = assets.urls.get(NATIVE_COOKING_POT_GUI.emptyContainer.path)
            if (!assets.cookingPotPlaceholderReason && placeholder) {
              const image = node(document, 'img'); image.src = placeholder; image.alt = '原模组空容器槽提示；当前槽没有物品'
              image.dataset.nativePlaceholderSource = NATIVE_COOKING_POT_GUI.emptyContainer.path
              image.addEventListener('error', () => {
                if (image.parentNode !== itemSlot) return
                image.remove(); itemSlot.dataset.placeholderState = 'unavailable'
                itemSlot.dataset.placeholderReason = 'NATIVE_COOKING_POT_EMPTY_ICON_DECODE_FAILED'
                itemSlot.title += ` · 空容器槽图标解码失败（${itemSlot.dataset.placeholderReason}）`
                itemSlot.setAttribute('aria-label', itemSlot.title)
              }, { once: true })
              itemSlot.append(image); itemSlot.dataset.placeholderState = 'verified'
            } else { itemSlot.dataset.placeholderState = 'unavailable'; itemSlot.dataset.placeholderReason = assets.cookingPotPlaceholderReason }
          }
          if (kind === 'cooking-pot' && row.slot === 6) {
            const container = cookingPot.container
            const item = container.item
            itemSlot.title += `\n熟食缓冲槽；原模组禁止直接取出；盛装容器：${container.available ? (item ? `${resolveName(item)} (${item.name})` : '原回执为空') : '未同步'}`
            itemSlot.setAttribute('aria-label', itemSlot.title)
          }
        }
        body.append(panel)
        const label = kind === 'crafting' ? '原版 3×3 工作台与玩家背包布局'
          : kind === 'chest' ? `原版 9×${layout.rowsCount} 容器与玩家背包布局`
          : kind === 'curios' ? `Curios 原背包与饰品槽布局${layout.page !== null ? ` · 第 ${layout.page + 1}/${layout.totalPages} 页` : ' · 分页状态未同步'}`
          : kind === 'domum' ? 'Domum Ornamentum 原建筑切割台材料、产物与玩家背包布局'
          : kind === 'cooking-pot' ? 'Farmer’s Delight 原 3×2 原料、熟食缓冲、容器、成品与玩家背包布局' : '原版炉输入、燃料、结果与玩家背包布局'
        const missing = kind === 'curios' ? '配方书、饰品按钮与原生标题未接入'
          : kind === 'domum' ? `${layout.previewReason ? '分组/款式预览未同步' : '已显示原始分组/款式预览第一页'}；其他滚动页与原生标题未接入`
            : kind === 'chest' ? '原生标题未接入' : '配方书与原生标题未接入'
        const progressText = progress ? `；${progress.available ? '火焰与烧炼进度来自本人原生 dataValues'
          : `火焰与烧炼进度未知（${progress.reason}）`}` : cookingPot ? `；热源${cookingPot.heat.available ? (cookingPot.heat.isHeated ? '已加热' : '未加热') : `未知（${cookingPot.heat.reason}）`}；烹饪进度${cookingPot.progress.available ? '来自本人原生 dataValues' : `未知（${cookingPot.progress.reason}）`}` : ''
        const placeholderText = kind === 'cooking-pot' && assets.cookingPotPlaceholderReason ? `；空槽图标未支持（${assets.cookingPotPlaceholderReason}）` : ''
        body.append(node(document, 'p', 'corti-menu-note', `窗口 ${window.windowId} · 状态编号 ${window.stateId}；${label} · 只读；${missing}${progressText}${placeholderText}`))
        if (kind === 'domum') {
          const state = layout.state, variant = state.currentVariant
          body.append(node(document, 'p', 'corti-menu-note', `本人原生选择 · 分组：${language.translate(`cuttergroup.${state.currentGroup}`) ?? state.currentGroup ?? '未选择'}；款式：${variant?.count > 0 ? resolveName({ ...variant, name: variant.id, displayName: variant.name }) : '未选择'}；可用分组：${state.groups.length}；匹配配方：${state.matchingRecipeCount ?? '未同步'}。可选款式是配方预览，不是背包物品。`))
        }
      } else {
        let coordinates = null
        try { coordinates = nativeCoordinateMenuLayout(window, expectedUuid) } catch {}
        const panel = node(document, 'div', coordinates ? 'corti-menu-native-coordinates' : 'corti-menu-generic')
        if (coordinates) {
          panel.style.position = 'relative'; panel.style.width = `${coordinates.width * 2}px`; panel.style.height = `${coordinates.height * 2}px`
          for (const { row, x, y } of coordinates.slots) {
            const itemSlot = slot(panel, row, x - 1 + coordinates.offsetX, y - 1 + coordinates.offsetY, `原生槽 ${row.slot}`)
            itemSlot.dataset.nativeSlotX = String(x); itemSlot.dataset.nativeSlotY = String(y)
            if (typeof window.mayPickup?.[row.slot] === 'boolean') itemSlot.dataset.mayPickup = String(window.mayPickup[row.slot])
          }
        } else {
          const grid = node(document, 'div', 'corti-menu-grid')
          for (const row of window.slots) slot(grid, row, undefined, undefined, `原生槽 ${row.slot}`)
          panel.append(grid)
        }
        body.append(panel)
        body.append(node(document, 'p', 'corti-menu-note', `窗口 ${window.windowId ?? '未同步'} · 状态编号 ${window.stateId ?? '未同步'}；${coordinates ? '本人原生槽位坐标诊断视图；原模组界面贴图/控件未支持' : '原生菜单布局未支持'}${reason ? `（${reason}）` : ''}`))
      }
      if (window.carried) {
        const carried = node(document, 'div', 'native-menu-carried'), icon = node(document, 'div', 'corti-menu-slot')
        renderNativeItemSlot(document, icon, window.carried, { label: '本人光标', resolveItemIcon: resolveIcon, resolveItemIconReason: resolveIconReason, resolveItemName: resolveName })
        carried.append(icon, node(document, 'span', '', `光标：${resolveName(window.carried)} × ${window.carried.count}`)); body.append(carried)
      }
      const operation = presentation.modOperations?.at(-1)
      if (operation?.playerUuid === expectedUuid) {
        const outcome = operation.outcomeUnknown ? '结果未知，需核查；请勿自动重试'
          : operation.ok === false ? `操作被拒绝（${operation.code || '未提供原因'}）`
            : operation.ok === true ? (operation.readOnly ? '查询已返回' : operation.changed === true ? '服务端已确认状态变化' : '服务端已接受；实际效果以原生状态为准') : '未确认'
        body.append(node(document, 'p', 'corti-menu-note native-menu-operation', `${operation.operation} · ${outcome} · request ${operation.requestId || '未提供'}`))
      }
    } else {
      menu.dataset.inventorySource = manualOpen ? 'manual' : 'idle'
      if (heading) heading.textContent = '本人背包'
      if (source) source.textContent = manualOpen ? '玩家物品 · 只读' : '待机预览 · 只读'
      if (presentation.inventory) renderInventory(body, presentation.inventory)
      else body.append(node(document, 'p', 'corti-menu-note', '本人背包未同步；当前窗口无玩家槽映射'))
    }
  }
  const renderSkills = () => {
    const skills = presentation.skills, mana = skills?.mana
    const signature = JSON.stringify(skills)
    if (skillsSignature === signature) return
    skillsSignature = signature
    const known = finite(mana?.current) && finite(mana?.max) && mana.max > 0
    const value = known ? `${Math.round(mana.current)}/${Math.round(mana.max)}` : '--/--'
    for (const selector of ['[data-mana]', '[data-corti-mana-label]']) { const target = q(selector); if (target) target.textContent = `✦ 魔力 ${value}` }
    for (const selector of ['[data-mana-fill]', '[data-corti-mana-fill]']) { const target = q(selector); if (target) target.style.width = known ? `${clamp(mana.current / mana.max, 0, 1) * 100}%` : '0%' }
    const list = q('[data-skill-list]'), abilities = q('[data-ability-list]'), status = q('[data-skill-status]')
    list?.replaceChildren(); abilities?.replaceChildren()
    for (const skill of (Array.isArray(skills?.skills) ? skills.skills : []).slice(0, 64)) {
      if (typeof skill?.name !== 'string') continue
      list?.append(node(document, 'div', 'corti-skill', `${text(skill.name, 80)}${finite(skill.level) ? ` Lv.${skill.level}` : ''}`))
    }
    for (const ability of (Array.isArray(skills?.abilities) ? skills.abilities : []).slice(0, 64)) {
      if (typeof ability?.name !== 'string') continue
      // Plain read-only rows: these are observed spells, not clickable casts.
      const row = node(document, 'div', 'corti-skill')
      row.textContent = text(ability.name, 80)
      const cooldown = finite(ability.cooldownRemainingMs) ? `冷却 ${ability.cooldownRemainingMs / 1000}秒` : '冷却未同步'
      row.title = `${text(ability.id, 128)} · ${finite(ability.manaCost) ? `${ability.manaCost}魔力` : '消耗未同步'} · ${cooldown}`
      row.append(node(document, 'small', '', cooldown)); abilities?.append(row)
    }
    if (status) status.textContent = skills ? `${text(skills.source, 80)} · ${skills.stale ? '上次读数，等待更新' : '本人回执'}${finite(skills.observedAt) ? ` · ${new Date(skills.observedAt).toLocaleTimeString()}` : ''}` : '本人法术与魔力未同步'
  }
  const showMessages = () => {
    const feed = el('corti-event-feed')
    const epoch = current?.epoch ?? ''
    for (const message of presentation.gameMessages) {
      if (!Number.isSafeInteger(message?.seq) || typeof message.text !== 'string') continue
      const id = `${epoch}:${message.seq}`
      if (seenMessages.has(id)) continue
      seenMessages.add(id); while (seenMessages.size > 128) seenMessages.delete(seenMessages.values().next().value)
      if (!feed) continue
      const row = node(document, 'div', 'corti-event'); row.dataset.kind = text(message.kind, 40)
      row.append(node(document, 'small', '', text(message.kind, 40)), node(document, 'span', '', text(message.text, 500)))
      feed.append(row); while (feed.children.length > 4) feed.firstElementChild.remove()
      later(() => row.remove(), 7000)
    }
    for (const [kind, event, target] of [['title', presentation.title, el('corti-game-title')], ['actionbar', presentation.actionbar, el('corti-actionbar')]]) {
      if (!event || !target || !Number.isSafeInteger(event.seq)) continue
      const id = `${epoch}:${kind}:${event.seq}`
      if (seenTitles.has(id)) continue
      seenTitles.add(id); while (seenTitles.size > 64) seenTitles.delete(seenTitles.values().next().value)
      target.dataset.event = id; target.hidden = false
      if (kind === 'title') {
        const main = q('[data-game-title]'), sub = q('[data-game-subtitle]')
        if (main) main.textContent = text(event.title, 300)
        if (sub) sub.textContent = text(event.subtitle, 300)
      } else target.textContent = text(event.text, 500)
      const duration = kind === 'title' && [event.fadeIn, event.stay, event.fadeOut].every(finite) ? clamp((event.fadeIn + event.stay + event.fadeOut) * 50, 0, 60000) : 3000
      later(() => { if (target.dataset.event === id) target.hidden = true }, duration)
    }
  }
  const closeMenu = () => {
    cancelIdle(); manualOpen = false
    const window = actualContainer()
    if (window) dismissedMenu = `${window.windowId ?? ''}:${window.stateId ?? ''}`
    renderMenu()
  }
  listen(el('corti-inventory-toggle'), 'click', () => { cancelIdle(); manualOpen = !manualOpen; dismissedMenu = null; renderMenu() })
  listen(q('[data-menu-close]'), 'click', closeMenu)
  listen(document, 'keydown', event => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable) return
    if (event.code === 'KeyE') { event.preventDefault(); cancelIdle(); manualOpen = !manualOpen; dismissedMenu = null; renderMenu() }
    else if (event.code === 'Escape') { event.preventDefault(); closeMenu() }
  })
  const fishingRoot = el('viewer-fishing-catch')
  const fishing = fishingRoot ? new NativeFishingCatchHud({ root: fishingRoot, now, resolveItemName: resolveName,
    schedule: later, cancel: timer => { clearTimer(timer); timers.delete(timer) },
    renderIcon: (target, item) => renderNativeItemSlot(document, target, item, { resolveItemIcon: resolveIcon, resolveItemIconReason: resolveIconReason, resolveItemName: resolveName }) }) : null
  const reset = () => {
    current = null; actor = null; actorReason = null; presentation = unavailable('本人状态不可用')
    manualOpen = false; cancelIdle(); dismissedMenu = null; lastMenuSignature = null; hudSignature = null; skillsSignature = null
    for (const timer of timers) clearTimer(timer)
    timers.clear(); seenMessages.clear(); seenTitles.clear(); fishing?.reset(); preview?.reset()
    el('corti-event-feed')?.replaceChildren()
    for (const id of ['corti-game-title', 'corti-actionbar']) { const target = el(id); if (target) target.hidden = true }
    renderHud(); renderSkills(); renderMenu()
  }
  return {
    setIdentity (identity) {
      const next = identity?.confirmed === true ? uuid(identity.playerUuid) : null
      if (expectedUuid !== next) { reset(); expectedUuid = next }
    },
    setActor (value, reason = null) { actor = value; actorReason = reason; lastMenuSignature = null; renderMenu() },
    async setAssets (reader) {
      const sequence = ++assetsSequence
      assets?.dispose(); itemIcons?.dispose(); assets = new NativeUiAssets(reader)
      itemIcons = new NativeItemIcons(reader, { onChange: () => {
        if (disposed || sequence !== assetsSequence) return
        iconRevision++; lastMenuSignature = null; renderHud(); renderMenu()
      } })
      const nextLanguage = new NativeLanguage(reader)
      const [result] = await Promise.all([assets.prepare(), nextLanguage.prepare()])
      if (disposed || sequence !== assetsSequence) return result
      language = nextLanguage
      const style = node(document, 'style')
      const background = (selector, name) => `${selector}{background-image:${uiSprite(name) ? `url("${uiSprite(name)}")` : 'none'}}`
      style.dataset.nativeHudAssets = ''
      style.textContent = [background('.corti-crosshair', 'crosshair'), background('.corti-hotbar', 'hotbar'),
        background('.corti-hotbar-selection', 'hotbar_selection'), background('.corti-xp', 'experience_bar_background'),
        background('.corti-xp-fill', 'experience_bar_progress'), NATIVE_SOUL_SLAB_KEYFRAMES].join('\n')
      q('style[data-native-hud-assets]')?.remove(); document.head?.append(style)
      lastMenuSignature = null; hudSignature = null; renderHud(); renderMenu(); return result
    },
    update (state) {
      if (disposed) return
      if (current?.epoch !== undefined && state?.epoch !== current.epoch) { const saved = actor; reset(); actor = saved }
      current = state
      presentation = nativePresentationView(state?.presentation, expectedUuid)
      if (!presentation.available) { cancelIdle(); manualOpen = false; fishing?.reset() }
      if (actualContainer()) cancelIdle()
      renderHud(); renderSkills(); renderMenu(); showMessages()
      return presentation
    },
    event (event) {
      if (disposed || !expectedUuid || uuid(event?.playerUuid) !== expectedUuid) return false
      if (event.type === 'inventoryPreview') {
        if (event.open !== true) { cancelIdle(); renderMenu(); return true }
        if (manualOpen || actualContainer() || !presentation.inventory || now() < combatUntil) return false
        cancelIdle(); idleOpen = true; renderMenu()
        idleTimer = later(() => { idleTimer = null; idleOpen = false; renderMenu() }, finite(event.ttlMs) ? clamp(event.ttlMs, 1, 2400) : 2400)
        return true
      }
      if (event.type === 'entityDamage' || event.type === 'combatFeedback') { combatUntil = now() + 5000; cancelIdle(); renderMenu(); return true }
      if (event.type === 'fishingCatch') return fishing?.push(event) ?? false
      return false
    },
    reset,
    getState () { return { expectedUuid, presentation, manualOpen, idleOpen, actorAvailable: Boolean(actorSource()) } },
    dispose () {
      if (disposed) return
      reset(); disposed = true; assetsSequence++
      preview?.dispose(); fishing?.dispose(); assets?.dispose(); itemIcons?.dispose()
      for (const [target, event, callback] of listeners) target?.removeEventListener(event, callback)
    }
  }
}
