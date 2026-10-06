import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { NativeWorldState, loadNativeStateRegistry, loadNativeEntityRegistry, attachNativeWorld } from './native-world-host.mjs'
import { NativeSnapshotCadence } from './native-snapshot-cadence.mjs'
import { createNativePlayerMotionTracker } from '../src/native-viewer/native-player-motion.js'
import { projectNativeYsmState } from '../src/native-viewer/native-ysm-state.js'
import { projectNativePlayerRenderState } from '../src/native-viewer/native-player-render-state.js'
import { renderViewerPage, VIEWER_CSS } from '../src/viewer-page.mjs'
import { nativePreviewAccess } from './native-preview-access.mjs'

const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/native-viewer')
const MAX_EVENT_BYTES = 2 * 1024 * 1024, MAX_AGENT_BYTES = 65536, MAX_PRESENTATION_BYTES = 128 * 1024
const CSP = "default-src 'self'; script-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'"
const SHA256 = /^[a-f0-9]{64}$/
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
// DefaultPlayerSkin.get(UUID), matched to the original 1.21.1 client. The
// client's order is all nine slim skins, then all nine wide skins.
const DEFAULT_PLAYER_SKINS = ['alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'steve', 'sunny', 'zuri']
const finiteNumber = value => Number.isFinite(value) ? value : null
const vector = value => value && [value.x, value.y, value.z].every(Number.isFinite) ? { x: value.x, y: value.y, z: value.z } : null

function boundedPrivateCopy (value, prefix) {
  let nodes = 0
  const seen = new WeakSet()
  function validate (part, depth = 0) {
    if (++nodes > 4096 || depth > 12) throw Error(prefix + '_TOO_LARGE')
    if (part === null || typeof part === 'boolean') return
    if (typeof part === 'number' && Number.isFinite(part)) return
    if (typeof part === 'string' && part.length <= MAX_AGENT_BYTES) return
    if (typeof part !== 'object' || seen.has(part)) throw Error(prefix + '_INVALID')
    seen.add(part)
    if (Array.isArray(part)) {
      if (part.length > 256) throw Error(prefix + '_TOO_LARGE')
      for (const entry of part) validate(entry, depth + 1)
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(part))) throw Error(prefix + '_INVALID')
      const keys = Object.keys(part)
      if (keys.length > 128 || keys.some(key => key.length > 256)) throw Error(prefix + '_TOO_LARGE')
      for (const key of keys) validate(part[key], depth + 1)
    }
    seen.delete(part)
  }
  validate(value)
  const text = JSON.stringify(value)
  if (Buffer.byteLength(text) > MAX_AGENT_BYTES) throw Error(prefix + '_TOO_LARGE')
  return JSON.parse(text)
}

function injectedPresentation (provider, uuid) {
  let hasYsm = false
  const unavailable = reason => ({ inventory: null, nativeMenu: null, skills: null,
    ...(hasYsm ? { nativeSelf: { ysm: projectNativeYsmState(null, uuid) } } : {}), nativeState: { available: false, reason } })
  if (!provider) return unavailable('PRESENTATION_NOT_PROVIDED')
  try {
    const value = provider()
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.then === 'function') throw Error('PRESENTATION_INVALID')
    const copy = boundedPrivateCopy(value, 'PRESENTATION')
    hasYsm = Boolean(copy.self && Object.hasOwn(copy.self, 'ysm'))
    if (copy.schemaVersion !== 1) throw Error('PRESENTATION_INVALID')
    function own (part) {
      if (!part || typeof part !== 'object') return
      if (Object.hasOwn(part, 'playerUuid') && (typeof part.playerUuid !== 'string' || part.playerUuid.toLowerCase() !== uuid)) throw Error('PRESENTATION_IDENTITY_MISMATCH')
      for (const [key, child] of Object.entries(part)) {
        // A foreign/malformed YSM row becomes an explicit unavailable binding,
        // never an absent field that permits a Minecraft replacement body.
        if (part === copy.self && ['ysm', 'motion'].includes(key)) continue
        own(child)
      }
    }
    if (typeof copy.playerUuid !== 'string' || copy.playerUuid.toLowerCase() !== uuid) throw Error('PRESENTATION_IDENTITY_MISMATCH')
    own(copy)
    // Only these private game fields belong in the presentation stream. Runtime
    // configuration, model journals and arbitrary provider fields do not.
    // A server observation may supplement missing native attribute packets.
    // Select only actual body/HUD fields; it cannot replace identity or pose.
    const ownSelf = copy.self && copy.self.playerUuid === uuid ? Object.fromEntries(
      ['health', 'maxHealth', 'absorption', 'armor', 'food', 'saturation', 'oxygen', 'airSupply', 'maxAirSupply',
        'inWater', 'experienceLevel', 'experienceProgress', 'experiencePoints', 'equipment', 'mainArm', 'usingItem',
        'useItemRemainingTicks', 'crouching', 'isPassenger', 'swimAmount', 'fallFlying', 'spinAttack', 'swinging', 'attackAnim', 'attackStrengthScale', 'pose', 'ysm', 'motion']
        .filter(key => Object.hasOwn(copy.self, key)).map(key => [key, key === 'ysm' ? projectNativeYsmState(copy.self.ysm, uuid)
          : key === 'motion' ? projectNativePlayerRenderState(copy.self.motion, uuid) : copy.self[key]])) : null
    return { inventory: copy.inventory ?? null, nativeMenu: copy.nativeMenu ?? null, skills: copy.skills ?? null,
      nativeSelf: ownSelf, renderRegistries: copy.renderRegistries ?? null,
      entityRenderStates: copy.entityRenderStates ?? null, nativeState: { available: true } }
  } catch (error) {
    const reason = ['PRESENTATION_INVALID', 'PRESENTATION_TOO_LARGE', 'PRESENTATION_IDENTITY_MISMATCH'].includes(error?.message) ? error.message : 'PRESENTATION_UNAVAILABLE'
    return unavailable(reason)
  }
}

function presentationText (input, simplifyNBT) {
  try {
    if (input && typeof input === 'object') {
      if (input.type) input = simplifyNBT(input)
      else if (Object.values(input).length && Object.values(input).every(entry => entry && typeof entry === 'object' && typeof entry.type === 'string')) input = simplifyNBT({ type: 'compound', value: input })
    }
    if (typeof input === 'string' && /^[\s]*[\[{"]/.test(input)) {
      try { input = JSON.parse(input) } catch { return input.slice(0, 1024) }
    }
    let nodes = 0
    function flatten (part, depth = 0) {
      if (++nodes > 128 || depth > 8) return ''
      if (typeof part === 'string') return part
      if (Array.isArray(part)) return part.map(value => flatten(value, depth + 1)).join('')
      if (!part || typeof part !== 'object') return ''
      const text = typeof part.text === 'string' ? part.text : typeof part.translate === 'string' ? part.translate : ''
      return text + (Array.isArray(part.with) ? part.with.map(value => flatten(value, depth + 1)).join(' ') : '') + flatten(part.extra, depth + 1)
    }
    return flatten(input).slice(0, 1024)
  } catch { return '' }
}

// The worker injects only observations it already owns. This adapter performs
// no queries and never consults Mineflayer's vanilla proxy inventory.
export function createNativePlayerPresentation ({ playerUuid, menu, spellState, spellCatalog = null, spellObservedAt = null, now = Date.now() }) {
  const uuid = typeof playerUuid === 'string' ? playerUuid.toLowerCase() : null
  const own = value => UUID.test(uuid || '') && typeof value?.playerUuid === 'string' && value.playerUuid.toLowerCase() === uuid
  const nativeItem = item => {
    if (item === null) return null
    if (!item || typeof item.id !== 'string' || !/^[a-z0-9_.-]+:[a-z0-9/._-]+$/.test(item.id) || !Number.isSafeInteger(item.count) || item.count <= 0 || typeof item.snbt !== 'string') throw Error('PRESENTATION_NATIVE_ITEM_INVALID')
    return { name: item.id, count: item.count, snbt: item.snbt,
      ...(Object.hasOwn(item, 'food') ? { food: item.food } : {}),
      ...(typeof item.displayName === 'string' && item.displayName.length <= 512 ? { displayName: item.displayName } : {}),
      ...(typeof item.descriptionId === 'string' && item.descriptionId.length <= 512 ? { descriptionId: item.descriptionId } : {}) }
  }
  let nativeMenu = null, inventory = null, skills = null, self = null, renderRegistries = null
  if (own(menu) && Number.isSafeInteger(menu.windowId) && menu.windowId >= 0 && Array.isArray(menu.slots)) {
    if (own(menu.renderRegistries) && menu.renderRegistries.source === 'server_builtin_registries') {
      const registry = rows => {
        if (!Array.isArray(rows) || rows.length < 1 || rows.length > 128) return null
        const ids = new Set(), names = new Set()
        for (const row of rows) {
          if (!Number.isSafeInteger(row?.id) || row.id < 0 || row.id > 65535 ||
              typeof row.name !== 'string' || !/^[a-z0-9_.-]+:[a-z0-9/._-]+$/.test(row.name) ||
              ids.has(row.id) || names.has(row.name)) return null
          ids.add(row.id); names.add(row.name)
        }
        return rows.map(row => ({ id: row.id, name: row.name }))
      }
      const villagerTypes = registry(menu.renderRegistries.villagerTypes), villagerProfessions = registry(menu.renderRegistries.villagerProfessions)
      if (villagerTypes && villagerProfessions) renderRegistries = { playerUuid: uuid, source: 'server_builtin_registries', villagerTypes, villagerProfessions }
    }
    const slots = menu.slots.map((item, slot) => ({ slot, item: nativeItem(item) }))
    const selectedHotbarSlot = Number.isInteger(menu.selectedHotbarSlot) && menu.selectedHotbarSlot >= 0 && menu.selectedHotbarSlot <= 8 ? menu.selectedHotbarSlot : null
    nativeMenu = { playerUuid: uuid, windowId: menu.windowId, stateId: Number.isSafeInteger(menu.stateId) ? menu.stateId : null,
      menuType: typeof menu.menuType === 'string' ? menu.menuType : null, title: null, selectedHotbarSlot, slots,
      carried: nativeItem(menu.carried ?? null), mayPickup: menu.mayPickup ?? null, slotRoles: menu.slotRoles ?? null }
    for (const key of ['dataValues', 'dataValuesSource', 'dataValuesError', 'slotLayout']) {
      if (Object.hasOwn(menu, key)) nativeMenu[key] = menu[key]
    }
    if (own(menu.cookingPot) && menu.cookingPot.source === 'native_cooking_pot_menu') {
      nativeMenu.cookingPot = { playerUuid: uuid, source: menu.cookingPot.source,
        isHeated: typeof menu.cookingPot.isHeated === 'boolean' ? menu.cookingPot.isHeated : null,
        container: nativeItem(menu.cookingPot.container ?? null) }
    }
    // The server's generic container does not identify the player inventory
    // subset. Keep its original layout, rather than guessing from slot count.
    if (menu.windowId === 0 && menu.menuType === 'minecraft:inventory' && slots.length === 46) inventory = {
      playerUuid: uuid, windowId: 0, slots, selectedHotbarSlot, hotbarStart: 36, inventoryStart: 9, offhandSlot: 45
    }
    else if (Array.isArray(menu.playerInventory) && menu.playerInventory.length === 46) inventory = {
      playerUuid: uuid, windowId: 0, slots: menu.playerInventory.map((item, slot) => ({ slot, item: nativeItem(item) })),
      selectedHotbarSlot, hotbarStart: 36, inventoryStart: 9, offhandSlot: 45
    }
    if (own(menu.self)) {
      const source = menu.self
      const number = (key, min, max) => Number.isFinite(source[key]) && source[key] >= min && source[key] <= max ? source[key] : null
      const airSupply = number('airSupply', -32768, 2147483647), maxAirSupply = number('maxAirSupply', 1, 2147483647)
      self = { playerUuid: uuid, health: number('health', 0, 1024), maxHealth: number('maxHealth', 1, 1024),
        absorption: number('absorption', 0, 1024), armor: number('armor', 0, 1024), food: number('food', 0, 20),
        saturation: number('saturation', 0, 20), airSupply, maxAirSupply,
        oxygen: airSupply !== null && maxAirSupply !== null ? Math.max(0, Math.min(20, airSupply * 20 / maxAirSupply)) : null,
        inWater: typeof source.inWater === 'boolean' ? source.inWater : null,
        experienceLevel: number('experienceLevel', 0, 2147483647), experienceProgress: number('experienceProgress', 0, 1),
        experiencePoints: number('experiencePoints', 0, 2147483647),
        mainArm: ['left', 'right'].includes(source.mainArm) ? source.mainArm : null,
        usingItem: typeof source.usingItem === 'boolean' ? source.usingItem : null,
        useItemRemainingTicks: number('useItemRemainingTicks', 0, 2147483647),
        crouching: typeof source.crouching === 'boolean' ? source.crouching : null,
        isPassenger: typeof source.isPassenger === 'boolean' ? source.isPassenger : null,
        swimAmount: number('swimAmount', 0, 1), fallFlying: typeof source.fallFlying === 'boolean' ? source.fallFlying : null,
        spinAttack: typeof source.spinAttack === 'boolean' ? source.spinAttack : null,
        swinging: typeof source.swinging === 'boolean' ? source.swinging : null,
        attackAnim: number('attackAnim', 0, 1), attackStrengthScale: number('attackStrengthScale', 0, 1),
        pose: typeof source.pose === 'string' && /^[a-z_]{1,64}$/.test(source.pose) ? source.pose : null,
        ...(Object.hasOwn(source, 'ysm') ? { ysm: projectNativeYsmState(source.ysm, uuid) } : {}),
        ...(Object.hasOwn(source, 'motion') ? { motion: projectNativePlayerRenderState(source.motion, uuid) } : {}),
        equipment: source.equipment && typeof source.equipment === 'object' && !Array.isArray(source.equipment)
          ? Object.fromEntries(['mainhand', 'offhand', 'feet', 'legs', 'chest', 'head'].filter(key => Object.hasOwn(source.equipment, key)).map(key => [key, nativeItem(source.equipment[key])])) : null }
    }
  }
  if (own(spellState)) {
    const selected = nativeMenu?.selectedHotbarSlot
    const held = inventory && selected !== null ? inventory.slots[36 + selected].item : null
    const sameHeld = selected === spellState.selectedHotbarSlot && (!inventory || (held?.snbt || '') === spellState.heldSnbt)
    const sameCatalog = own(spellCatalog) && spellCatalog.state?.heldSnbt === spellState.heldSnbt && spellCatalog.state?.selectedHotbarSlot === spellState.selectedHotbarSlot
    skills = { playerUuid: uuid, mana: spellState.mana && Number.isFinite(spellState.mana.current) && Number.isFinite(spellState.mana.max)
      ? { current: spellState.mana.current, max: spellState.mana.max } : null, skills: [],
      abilities: sameHeld && sameCatalog && Array.isArray(spellCatalog.spells) ? spellCatalog.spells.slice(0, 24).map(spell => ({
        id: spell.id, name: spell.name, manaCost: finiteNumber(spell.manaCost), cooldownMs: null, cooldownRemainingMs: null
      })) : [], cooldown: spellState.cooldown ?? null, source: 'ars_nouveau_receipt', observedAt: finiteNumber(spellObservedAt),
      stale: !sameHeld || !Number.isFinite(spellObservedAt) || now - spellObservedAt > 5000 }
  }
  return { schemaVersion: 1, playerUuid: uuid, inventory, nativeMenu, skills, ...(self ? { self } : {}),
    ...(renderRegistries ? { renderRegistries } : {}),
    ...(own(menu) && Array.isArray(menu.entityRenderStates) && menu.entityRenderStates.length <= 16
      ? { entityRenderStates: menu.entityRenderStates } : {}) }
}

// Supplement only identities already present in this connection's native
// snapshot. A private bridge row cannot create an entity or cross a dimension.
export function injectTrackedMaidPresentation (entityState, presentation, dimension, playerUuid) {
  const rows = Array.isArray(presentation?.entityRenderStates) ? presentation.entityRenderStates : []
  const byId = new Map()
  for (const row of rows) {
    if (row?.source !== 'same_player_tracked_entity' || row.playerUuid !== playerUuid ||
        row.dimension !== dimension || !Number.isSafeInteger(row.entityId) || !UUID.test(row.uuid || '')) continue
    if (byId.has(row.entityId)) { byId.set(row.entityId, null); continue }
    byId.set(row.entityId, row)
  }
  return { ...entityState, renderRegistries: presentation?.renderRegistries ?? null,
    entities: (entityState.entities || []).map(entity => {
      const row = byId.get(entity.entityId)
      return entity.name === 'touhou_little_maid:maid' && row?.uuid === entity.uuid
        ? { ...entity, maidRenderState: { ...row, epoch: entityState.epoch } } : entity
    }) }
}

// A native console and its skin preview must share one Three module, including
// dependencies which have their own nested Three package. Resolve only the bare
// import; addon paths retain their normal package resolution.
async function browserBundle (entry) {
  const require = createRequire(import.meta.url)
  const threeRoot = path.dirname(path.dirname(require.resolve('three')))
  const threeModule = path.join(threeRoot, 'build/three.module.js')
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', metafile: true,
    plugins: [{ name: 'native-single-three', setup (builder) { builder.onResolve({ filter: /^three$/ }, () => ({ path: threeModule })) } }] })
  for (const input of Object.keys(result.metafile.inputs)) {
    const absolute = path.resolve(input)
    if (/[\\/]node_modules[\\/]three[\\/]/.test(absolute) && !absolute.startsWith(threeRoot + path.sep)) throw Error('NATIVE_WORLD_DUPLICATE_THREE')
  }
  return result.outputFiles[0].contents
}

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
export async function prepareNativeWorldPreviewHost ({ assetDirectory, port = 28983, lanAddress = null }) {
  if (!Number.isInteger(port) || (port !== 0 && (port < 1024 || port > 65535))) throw Error('NATIVE_WORLD_PORT_INVALID')
  const access = nativePreviewAccess(lanAddress)
  const root = await fs.realpath(assetDirectory)
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'native-assets.json'), 'utf8'))
  if (manifest.minecraftVersion !== '1.21.1' || manifest.assetIntegrityVerified !== true || !manifest.assets || !manifest.registryHashes) throw Error('NATIVE_WORLD_ASSETS_INVALID')
  const hash = manifest.registryHashes['block-states.jsonl']
  if (!SHA256.test(hash || '')) throw Error('NATIVE_WORLD_REGISTRY_HASH_INVALID')
  const states = loadNativeStateRegistry(await fs.readFile(path.join(root, 'registry/block-states.jsonl')), hash)
  const entityRegistrySha256 = manifest.registryHashes['entities.tsv'] ?? null
  const entityRegistry = entityRegistrySha256 === null ? null
    : loadNativeEntityRegistry(await fs.readFile(path.join(root, 'registry/entities.tsv')), entityRegistrySha256)
  const [bundle, consoleBundle, diagnosticsPage] = await Promise.all([
    browserBundle(path.join(SOURCE, 'world-preview.js')),
    browserBundle(path.join(SOURCE, 'native-console.js')),
    fs.readFile(path.join(SOURCE, 'world-preview.html'))
  ])
  const pages = new Map([['', 'first'], ['third/', 'third'], ['third', 'third'], ['dungeon/', 'dungeon'], ['dungeon', 'dungeon']]
    .map(([route, mode]) => [route, Buffer.from(renderViewerPage(mode))]))
  const viewerCss = Buffer.from(VIEWER_CSS)
  const manifestBytes = Buffer.from(JSON.stringify(manifest))
  return {
    registrySha256: hash,
    attach ({ bot, nativeStream, simplifyNBT, resolveDimension, expectedUsername, getAgentStatus = null, getPresentationState = null, logger = console, now = Date.now }) {
      // Mineflayer 4.37.1 fills bot.username in its login plugin. Attach before
      // that packet using the caller's createBot username, then verify it.
      const username = bot?.username || expectedUsername
      if (!bot || !/^[A-Za-z0-9_]{1,16}$/.test(username || '') || !bot.on || !bot.off || !bot._client?.on || !nativeStream?.events?.on || typeof simplifyNBT !== 'function') throw Error('NATIVE_WORLD_ATTACHMENT_INVALID')
      if (expectedUsername !== undefined && (!/^[A-Za-z0-9_]{1,16}$/.test(expectedUsername) || (bot.username && bot.username !== expectedUsername))) throw Error('NATIVE_WORLD_ATTACHMENT_IDENTITY_MISMATCH')
      if (getAgentStatus !== null && typeof getAgentStatus !== 'function') throw Error('AGENT_STATUS_PROVIDER_INVALID')
      if (getPresentationState !== null && typeof getPresentationState !== 'function') throw Error('PRESENTATION_PROVIDER_INVALID')
      const world = new NativeWorldState({ states, registrySha256: hash, entityRegistry, entityRegistrySha256, simplifyNBT, now,
        resolveDimension: resolveDimension || (p => {
          const type = typeof p.dimension === 'number' ? bot.registry.dimensionsArray[p.dimension] : bot.registry.dimensionsByName[String(p.dimension).replace('minecraft:', '')]
          return type && { name: p.name || p.worldName || type.name, minY: type.minY, height: type.height }
        }) })
      const detach = attachNativeWorld({ bot, nativeStream, world })
      const clients = new Set()
      let closed = false, closing = null, listening = null, currentPort = port, connectionEnded = false, identityConfirmed = Boolean(bot.username)
      const cadence = new NativeSnapshotCadence()
      let cachedSnapshot = null, snapshotBuildCount = 0, snapshotBuildMs = null
      const motionTracker = createNativePlayerMotionTracker()
      let physicsTickCount = 0
      let receivedProfile = null, messageSequence = 0, gameMessages = [], currentTitle = null, currentActionbar = null
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
        const nativeSelf = injectedPresentation(getPresentationState, uuid.toLowerCase()).nativeSelf
        const skin = profile.hasCustomTextures === false ? defaultPlayerSkin(uuid, manifest) : {
          kind: 'unavailable', reason: profile.hasCustomTextures === true ? 'CUSTOM_PLAYER_SKIN_NOT_RESOLVED' : 'PLAYER_SKIN_PROFILE_UNAVAILABLE'
        }
        return { uuid: uuid.toLowerCase(), name: username, entityId: entity.id, position: vector(entity.position),
          yaw: finiteNumber(entity.yaw), pitch: finiteNumber(entity.pitch), eyeHeight: finiteNumber(entity.eyeHeight),
          health: finiteNumber(bot.health), maxHealth: maximumHealth(entity), food: finiteNumber(bot.food),
          onGround: typeof entity.onGround === 'boolean' ? entity.onGround : null,
          sneaking: typeof entity.crouching === 'boolean' ? entity.crouching : null, velocity: vector(entity.velocity), skin,
          ...(Object.hasOwn(nativeSelf ?? {}, 'ysm') ? { ysm: nativeSelf.ysm } : {}) }
      }
      const playerPose = player => player && [player.yaw, player.pitch, player.eyeHeight].every(Number.isFinite)
        ? { ...player.position, yaw: player.yaw, pitch: player.pitch, eyeHeight: player.eyeHeight } : world.pose
      const identity = () => ({ player: username, confirmed: identityConfirmed, playerUuid: bot._client.uuid || null, entityId: bot.entity?.id ?? null, epoch: world.epoch, profile: ownProfile() })
      const sendIdentity = client => {
        const value = identity(), signature = JSON.stringify(value)
        if (client.identitySignature === signature) return true
        if (!sendNativeWorldEvent(client, { type: 'identity', ...value, minecraftVersion: '1.21.1', registrySha256: hash, mode: 'live_same_player_connection' })) return false
        client.identitySignature = signature
        return true
      }
      const presentation = (player = selfPlayer()) => {
        const unavailable = reason => ({ schemaVersion: 1, playerUuid: player?.uuid ?? null, available: false, source: 'same_player_connection', reason,
          sampledAt: now(), self: null, inventory: null, nativeMenu: null, skills: null, nativeState: { available: false, reason }, gameMessages: [], title: null, actionbar: null, time: null, weather: null })
        if (!player) return unavailable('PLAYER_PRESENTATION_UNAVAILABLE')
        const attributes = bot.entity?.attributes
        const armorAttribute = attributes?.['minecraft:generic.armor'] || attributes?.['generic.armor'] || attributes?.['minecraft:armor']
        // Armor modifiers are not yet resolved; expose a value only when the
        // packet contains the unmodified effective base, never a fabricated 0.
        const armor = armorAttribute && !(armorAttribute.modifiers?.length) ? finiteNumber(armorAttribute.value) : null
        const injected = injectedPresentation(getPresentationState, player.uuid)
        const value = { schemaVersion: 1, playerUuid: player.uuid, available: true, source: 'same_player_connection', sampledAt: now(),
          self: { ...player, saturation: finiteNumber(bot.foodSaturation), oxygen: finiteNumber(bot.oxygenLevel), armor,
            inWater: typeof bot.entity?.isInWater === 'boolean' ? bot.entity.isInWater : null,
            experienceLevel: finiteNumber(bot.experience?.level), experienceProgress: finiteNumber(bot.experience?.progress), experiencePoints: finiteNumber(bot.experience?.points),
            quickBarSlot: Number.isInteger(bot.quickBarSlot) && bot.quickBarSlot >= 0 && bot.quickBarSlot <= 8 ? bot.quickBarSlot : null,
            ...(injected.nativeSelf ?? {}) },
          inventory: injected.inventory, nativeMenu: injected.nativeMenu, skills: injected.skills, nativeState: injected.nativeState,
          renderRegistries: injected.renderRegistries,
          entityRenderStates: injected.entityRenderStates,
          gameMessages: gameMessages.map(message => ({ ...message })),
          title: currentTitle && { ...currentTitle }, actionbar: currentActionbar && { ...currentActionbar }, time: world.time && { ...world.time },
          weather: { raining: typeof bot.isRaining === 'boolean' ? bot.isRaining : null, thunder: finiteNumber(bot.thunderState), rain: finiteNumber(bot.rainState) } }
        if (Buffer.byteLength(JSON.stringify(value)) > MAX_PRESENTATION_BYTES) return unavailable('PRESENTATION_TOO_LARGE')
        return value
      }
      const status = () => ({ schemaVersion: 1, mode: 'live_same_player_connection', readOnly: true, identity: identity(),
        selfPlayer: selfPlayer(), presentation: presentation(),
        connection: { ended: connectionEnded, playerEntityAvailable: Boolean(bot.entity) },
        viewer: { available: !closed && !world.error, closed, state: world.error || closed ? 'unavailable' : world.dimension && world.pose ? 'snapshot' : 'waiting',
          reason: world.error || (closed ? 'NATIVE_WORLD_HOST_CLOSED' : null), registrySha256: hash, epoch: world.epoch,
          packetSequence: world.lastSequence, packetCount: world.packetCount, loadedColumns: world.columns.size,
          terrain: { coverage: cachedSnapshot?.viewCoverage ?? null, bounds: cachedSnapshot?.bounds ?? null,
            snapshotBuildCount, snapshotBuildMs, minimumIntervalMs: cadence.minimumIntervalMs, recenterDistance: cadence.recenterDistance },
          entityDataAvailable: world.entitySnapshot().available, entityDataReason: world.entitySnapshot().reason ?? null,
          entityRegistrySha256,
          entityRenderingAvailable: false, lightingParityVerified: false, completeSceneParityVerified: false },
        agent: injectedAgentStatus(getAgentStatus, now) })
      const headers = type => ({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP })
      const server = http.createServer(async (request, response) => {
        try {
          if (!access.allowsRequest(request, currentPort)) { response.writeHead(403); response.end(); return }
          if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end(); return }
          const requestPath = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${currentPort}`).pathname).slice(1)
          if (requestPath === 'events') {
            if (clients.size >= 4) { response.writeHead(429); response.end(); return }
            response.writeHead(200, { ...headers('text/event-stream'), 'X-Accel-Buffering': 'no' })
            const client = { response, blocked: false, needsSnapshot: true, missedWorld: false, identitySignature: null }
            clients.add(client)
            response.on('drain', () => { client.blocked = false; client.needsSnapshot ||= client.missedWorld; client.missedWorld = false })
            response.on('close', () => clients.delete(client))
            sendIdentity(client)
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
          } else if (pages.has(requestPath)) { bytes = pages.get(requestPath); type = 'text/html; charset=utf-8' }
          else if (['diagnostics', 'diagnostics/'].includes(requestPath)) { bytes = diagnosticsPage; type = 'text/html; charset=utf-8' }
          else if (requestPath === 'viewer.css') { bytes = viewerCss; type = 'text/css; charset=utf-8' }
          else if (['index.js', 'native-console.js'].includes(requestPath)) { bytes = consoleBundle; type = 'text/javascript; charset=utf-8' }
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
      const worldChanged = () => { cadence.invalidate() }
      const resetPresentation = () => { gameMessages = []; currentTitle = null; currentActionbar = null }
      const reset = () => { cadence.reset(); cachedSnapshot = null; motionTracker.reset('dimension'); resetPresentation() }
      const pose = () => { cadence.observe(world.pose) }
      const motionReset = () => motionTracker.reset('respawn')
      const motionDeath = () => motionTracker.reset('death')
      const motionTeleport = () => motionTracker.reset('teleport')
      const physicsTick = () => {
        if (closed || connectionEnded || world.error) return
        const player = selfPlayer()
        if (!player) { motionTracker.reset('connection'); return }
        const state = player.health > 0
          ? motionTracker.record({ epoch: world.epoch, tick: ++physicsTickCount, sampledAt: now(), pose: player.position })
          : motionTracker.reset(player.health === 0 ? 'death' : 'connection')
        const motion = { ...state, epoch: world.epoch }
        if (!clients.size || ![player.yaw, player.pitch, player.eyeHeight].every(Number.isFinite)) return
        const currentPose = playerPose(player)
        const value = { type: 'motion', epoch: world.epoch, playerUuid: player.uuid, pose: currentPose, motion }
        for (const client of clients) {
          if (client.blocked || client.needsSnapshot) continue
          if (!sendIdentity(client) || client.blocked) continue
          sendNativeWorldEvent(client, value)
        }
      }
      const unavailable = reason => {
        cachedSnapshot = null; cadence.reset(); motionTracker.reset('connection'); resetPresentation()
        for (const client of clients) client.needsSnapshot = true
        for (const client of clients) sendNativeWorldEvent(client, { type: 'unavailable', reason })
        logger?.error?.('NATIVE_WORLD_UNAVAILABLE ' + reason)
      }
      const error = error => world.unavailable(error)
      const kicked = reason => world.unavailable(Error('NATIVE_WORLD_PLAYER_KICKED:' + JSON.stringify(reason)))
      const ended = reason => { connectionEnded = true; resetPresentation(); world.unavailable(Error('NATIVE_WORLD_PLAYER_CONNECTION_ENDED:' + String(reason))) }
      const verifyIdentity = () => {
        // minecraft-protocol has already received its success username before
        // Mineflayer emits login, even when entities.js has not filled bot yet.
        const actual = bot.username || bot._client.username
        if (!actual) return
        if (actual !== username) world.unavailable(Error('NATIVE_WORLD_PLAYER_IDENTITY_MISMATCH'))
        else {
          identityConfirmed = true
          for (const client of clients) sendIdentity(client)
        }
      }
      const playerInfo = packet => {
        if (!packet?.action?.add_player || !UUID.test(bot._client.uuid || '')) return
        const own = packet.data?.find(p => typeof p?.uuid === 'string' && p.uuid.toLowerCase() === bot._client.uuid.toLowerCase())
        if (!own || own.player?.name !== username) return
        receivedProfile = { uuid: own.uuid.toLowerCase(), hasCustomTextures: Array.isArray(own.player.properties)
          ? own.player.properties.some(p => p?.name === 'textures') : null }
      }
      const message = (text, kind) => {
        if (!selfPlayer()) return
        const plain = presentationText(text, simplifyNBT)
        if (!plain) return
        if (kind === 'game_info') currentActionbar = { text: plain, seq: ++messageSequence, observedAt: now() }
        else gameMessages = [...gameMessages, { seq: ++messageSequence, kind: kind === 'chat' ? 'chat' : 'system', text: plain, observedAt: now() }].slice(-24)
      }
      const title = (text, kind) => {
        if (!selfPlayer() || !['title', 'subtitle'].includes(kind)) return
        currentTitle = { title: null, subtitle: null, fadeIn: null, stay: null, fadeOut: null, ...currentTitle, [kind]: presentationText(text, simplifyNBT), seq: ++messageSequence, observedAt: now() }
      }
      const titleTimes = (fadeIn, stay, fadeOut) => {
        if (!selfPlayer() || ![fadeIn, stay, fadeOut].every(Number.isFinite)) return
        currentTitle = { title: null, subtitle: null, ...currentTitle, fadeIn, stay, fadeOut, seq: ++messageSequence, observedAt: now() }
      }
      const titleClear = () => { currentTitle = null }
      world.on('world', worldChanged); world.on('reset', reset); world.on('pose', pose); world.on('unavailable', unavailable)
      bot.on('error', error); bot.on('kicked', kicked); bot.on('end', ended)
      bot.on('login', verifyIdentity); bot.on('spawn', verifyIdentity)
      bot.on('physicsTick', physicsTick); bot.on('spawn', motionReset); bot.on('death', motionDeath)
      bot._client.on('position', motionTeleport)
      bot.on('messagestr', message); bot.on('title', title); bot.on('title_times', titleTimes); bot.on('title_clear', titleClear)
      bot._client.on('player_info', playerInfo)
      const timer = setInterval(() => {
        if (closed || !clients.size) return
        try {
          // A blocked browser must not cause repeated world scans. Its next
          // drain requests one current snapshot instead of replaying old frames.
          for (const client of clients) if (client.blocked) client.missedWorld ||= cadence.dirty
          if (![...clients].some(client => !client.blocked)) return
          const player = selfPlayer()
          const ownPresentation = presentation(player)
          let snapshot = null
          const startedAt = performance.now()
          if (cadence.required(world.pose, startedAt, !cachedSnapshot && [...clients].some(c => !c.blocked && c.needsSnapshot))) {
            snapshot = world.snapshot()
            snapshotBuildMs = Math.round((performance.now() - startedAt) * 100) / 100; snapshotBuildCount++
            cachedSnapshot = snapshot.type === 'snapshot' ? snapshot : null
            cadence.completed(world.pose, startedAt, snapshot.type === 'snapshot', snapshot.bounds)
          }
          for (const client of clients) {
            if (client.blocked) { client.missedWorld ||= Boolean(snapshot) || cadence.dirty; continue }
            if (!sendIdentity(client) || client.blocked) { client.missedWorld ||= Boolean(snapshot) || cadence.dirty; continue }
            if (snapshot || client.needsSnapshot) {
              const value = snapshot || cachedSnapshot
              if (value && sendNativeWorldEvent(client, { ...value, entityState: injectTrackedMaidPresentation(world.entitySnapshot(value.bounds), ownPresentation, world.dimension?.name, player?.uuid), pose: playerPose(player), time: world.time, motion: { ...motionTracker.current(), epoch: world.epoch }, selfPlayer: player, presentation: ownPresentation })) client.needsSnapshot = false
            } else sendNativeWorldEvent(client, { type: world.error ? 'unavailable' : 'frame', reason: world.error, epoch: world.epoch, pose: playerPose(player), motion: { ...motionTracker.current(), epoch: world.epoch }, selfPlayer: player, presentation: ownPresentation, entityState: injectTrackedMaidPresentation(world.entitySnapshot(cachedSnapshot?.bounds), ownPresentation, world.dimension?.name, player?.uuid), time: world.time, packetSequence: world.lastSequence })
          }
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
            server.once('error', failed); server.once('listening', ready); server.listen(port, access.listenHost)
          })
          return listening
        },
        close () {
          if (closing) return closing
          closed = true; clearInterval(timer); detach()
          world.off('world', worldChanged); world.off('reset', reset); world.off('pose', pose); world.off('unavailable', unavailable)
          bot.off('error', error); bot.off('kicked', kicked); bot.off('end', ended)
          bot.off('login', verifyIdentity); bot.off('spawn', verifyIdentity)
          bot.off('physicsTick', physicsTick); bot.off('spawn', motionReset); bot.off('death', motionDeath)
          bot._client.off('position', motionTeleport)
          bot.off('messagestr', message); bot.off('title', title); bot.off('title_times', titleTimes); bot.off('title_clear', titleClear)
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
