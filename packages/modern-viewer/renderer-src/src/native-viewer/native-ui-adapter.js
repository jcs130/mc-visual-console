import * as THREE from 'three'
import { InventoryPlayerPreview } from '../modern-viewer/inventory-player-preview.js'
import { FishingCatchHud } from '../modern-viewer/fishing-catch.js'
import { NativeItemIcons } from './native-item-icons.js'

// Adapt the original viewer's survival HUD, inventory layout and event panels.
// Class names and pixel coordinates originate in minecraft-viewer-hud.js and
// minecraft-viewer-panels.js. Actual inventory previews and fishing feeds use
// the original modules. No proxy registry, default player or game action API.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RESOURCE = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/
const finite = value => typeof value === 'number' && Number.isFinite(value)
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const text = (value, limit = 240) => typeof value === 'string' ? value.slice(0, limit) : ''
const uuid = value => typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
const unavailable = reason => ({ available: false, reason, self: null, inventory: null,
  nativeMenu: null, skills: null, gameMessages: [], title: null, actionbar: null })

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
export function renderNativeItemSlot (document, slot, item, { label = '', resolveItemIcon } = {}) {
  slot.replaceChildren()
  slot.dataset.state = 'available'
  slot.dataset.itemName = item?.name ?? ''
  slot.dataset.modelState = item ? 'unavailable' : 'empty'
  slot.title = item ? `${item.name} × ${item.count} · 原生物品模型未支持` : `${label}：空`
  slot.setAttribute('aria-label', slot.title)
  if (!item) return
  const icon = resolveItemIcon?.(item)
  if (record(icon) && icon.verified === true && typeof icon.url === 'string' && icon.url.startsWith('blob:')) {
    const image = node(document, 'img'); image.alt = item.name; image.src = icon.url
    slot.dataset.modelState = 'verified'; slot.title = `${item.name} × ${item.count}`
    image.addEventListener('error', () => {
      image.remove(); slot.dataset.modelState = 'unavailable'
      slot.prepend(node(document, 'span', 'corti-item-fallback', item.name))
    }, { once: true })
    slot.append(image)
  } else slot.append(node(document, 'span', 'corti-item-fallback', item.name))
  if (item.count > 1) slot.append(node(document, 'span', 'corti-slot-count', String(item.count)))
  slot.setAttribute('aria-label', slot.title)
}

// Reuse the original bounded queue/deduplication/reset controller. Its show()
// assumes the old /icons registry and normalizer removes visual components,
// so this native presentation override keeps the actual complete item and
// renders through the same strict item resolver as inventory/hotbar.
export class NativeFishingCatchHud extends FishingCatchHud {
  constructor (options) { super(options); this.nativeItems = new Map() }
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
    this.renderIcon?.(icon, this.nativeItems.get(caught.seq) ?? caught.item)
    const copy = node(document, 'div', 'viewer-fishing-catch-copy')
    const name = node(document, 'strong', '', caught.label); name.title = caught.label
    copy.append(node(document, 'small', '', '钓获'), name)
    this.root.replaceChildren(icon, copy, node(document, 'span', 'viewer-fishing-catch-count', `×${caught.count}`))
    this.root.hidden = false
    this.root.setAttribute('aria-label', `钓获 ${caught.label}，${caught.count} 个`)
    this.timer = this.schedule(() => this.advance(), 4500)
  }
  reset () { super.reset(); this.nativeItems?.clear() }
}

export function createNativeInterface ({ document = globalThis.document,
  previewFactory = options => new InventoryPlayerPreview(options), now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout, resolveItemIcon } = {}) {
  if (!document?.getElementById) throw Error('NATIVE_UI_DOCUMENT_INVALID')
  const el = id => document.getElementById(id), q = selector => document.querySelector(selector)
  let expectedUuid = null, actor = null, assets = null, assetsSequence = 0, current = null, itemIcons = null, iconRevision = 0
  let hudSignature = null, skillsSignature = null
  const resolveIcon = item => typeof resolveItemIcon === 'function' ? resolveItemIcon(item) : itemIcons?.resolve(item)
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
        else renderNativeItemSlot(document, slot, slotMap.get(index), { label: `快捷栏 ${i + 1}`, resolveItemIcon: resolveIcon })
        bar.append(slot)
      }
    }
    if (offhand) {
      if (inventory && Number.isInteger(inventory.offhandSlot) && slotMap.has(inventory.offhandSlot)) renderNativeItemSlot(document, offhand, slotMap.get(inventory.offhandSlot), { label: '副手', resolveItemIcon: resolveIcon })
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
    renderNativeItemSlot(document, element, row.item, { label, resolveItemIcon: resolveIcon }); body.append(element)
  }
  const actorSource = () => {
    if (!expectedUuid || uuid(actor?.assetInfo?.uuid ?? actor?.root?.userData?.playerUuid) !== expectedUuid || !actor.root?.playerObject) return null
    return actor.root
  }
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
      host.setAttribute('role', 'img'); host.setAttribute('aria-label', '本人真实皮肤预览；装备渲染未支持')
      panel.append(host)
      for (const [id, x, y, label] of [[5,8,8,'头盔'],[6,8,26,'胸甲'],[7,8,44,'护腿'],[8,8,62,'靴子'],
        [1,98,18,'合成'],[2,116,18,'合成'],[3,98,36,'合成'],[4,116,36,'合成'],[0,154,28,'合成结果'],[45,77,62,'副手']]) {
        if (map.has(id)) slot(panel, map.get(id), x, y, label)
      }
      for (let i = 0; i < 27; i++) if (map.has(9 + i)) slot(panel, map.get(9 + i), 8 + (i % 9) * 18, 84 + Math.floor(i / 9) * 18, '背包')
      for (let i = 0; i < 9; i++) if (map.has(36 + i)) slot(panel, map.get(36 + i), 8 + i * 18, 142, '快捷栏')
      body.append(panel)
      preview ??= previewFactory({ THREE, document, resolveSource: actorSource }) // Intentionally no createFallback.
      preview.attach(host)
    } else {
      const host = node(document, 'div', 'native-inventory-preview')
      host.style.width = '104px'; host.style.height = '140px'; host.style.position = 'relative'
      host.classList.add('corti-inventory-player-preview'); host.style.left = '0'; host.style.top = '0'
      host.dataset.previewState = 'waiting'; panel.append(host)
      const grid = node(document, 'div', 'corti-menu-grid')
      for (const row of inventory.slots) slot(grid, row, undefined, undefined, `原生槽 ${row.slot}`)
      panel.append(grid); body.append(panel)
      preview ??= previewFactory({ THREE, document, resolveSource: actorSource })
      preview.attach(host)
    }
    body.append(node(document, 'p', 'corti-menu-note', '本人原生物品与组件 · 只读；静态原版图标按原模型加载，其他图标/装备待适配'))
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
    const signature = JSON.stringify([showWindow ? window : presentation.inventory, manualOpen, idleOpen, assetsSequence])
    if (signature === lastMenuSignature) return
    lastMenuSignature = signature; preview?.setVisible(false); body.replaceChildren()
    const heading = q('[data-menu-title]'), source = q('[data-menu-source]')
    if (showWindow) {
      menu.dataset.inventorySource = 'container'
      if (heading) heading.textContent = text(window.title) || text(window.menuType) || '本人原生菜单'
      if (source) source.textContent = '真实游戏窗口 · 只读'
      const panel = node(document, 'div', 'corti-menu-generic'), grid = node(document, 'div', 'corti-menu-grid')
      for (const row of window.slots) slot(grid, row, undefined, undefined, `原生槽 ${row.slot}`)
      panel.append(grid, node(document, 'p', 'corti-menu-note', `窗口 ${window.windowId ?? '未同步'} · state ${window.stateId ?? '未同步'}；原生菜单布局未支持`)); body.append(panel)
      if (window.carried) body.append(node(document, 'p', 'corti-menu-note', `光标：${window.carried.name} × ${window.carried.count}`))
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
  const fishing = fishingRoot ? new NativeFishingCatchHud({ root: fishingRoot, now,
    schedule: later, cancel: timer => { clearTimer(timer); timers.delete(timer) },
    renderIcon: (target, item) => renderNativeItemSlot(document, target, item, { resolveItemIcon: resolveIcon }) }) : null
  const reset = () => {
    current = null; actor = null; presentation = unavailable('本人状态不可用')
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
    setActor (value) { actor = value; lastMenuSignature = null; renderMenu() },
    async setAssets (reader) {
      const sequence = ++assetsSequence
      assets?.dispose(); itemIcons?.dispose(); assets = new NativeUiAssets(reader)
      itemIcons = new NativeItemIcons(reader, { onChange: () => {
        if (disposed || sequence !== assetsSequence) return
        iconRevision++; lastMenuSignature = null; renderHud(); renderMenu()
      } })
      const result = await assets.prepare()
      if (disposed || sequence !== assetsSequence) return result
      const style = node(document, 'style')
      const background = (selector, name) => `${selector}{background-image:${uiSprite(name) ? `url("${uiSprite(name)}")` : 'none'}}`
      style.dataset.nativeHudAssets = ''
      style.textContent = [background('.corti-crosshair', 'crosshair'), background('.corti-hotbar', 'hotbar'),
        background('.corti-hotbar-selection', 'hotbar_selection'), background('.corti-xp', 'experience_bar_background'),
        background('.corti-xp-fill', 'experience_bar_progress')].join('\n')
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
