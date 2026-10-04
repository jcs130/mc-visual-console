import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createNativeInterface, nativePresentationView, nativeSlotRows, NativeUiAssets,
  renderNativeItemSlot } from '../../src/native-viewer/native-ui-adapter.js'

const UUID = 'e371227c-09fa-3722-84f4-f3228a552c3c'
const OTHER = '1231227c-09fa-3722-84f4-f3228a552c3c'

import { shell } from './fixtures/native-console-dom.mjs'
function presentation (overrides = {}) {
  return { schemaVersion: 1, playerUuid: UUID, source: 'same_player_connection', available: true,
    self: { uuid: UUID, health: 17, maxHealth: 20, food: 18, armor: null, oxygen: null },
    inventory: { windowId: 0, inventoryStart: 9, hotbarStart: 36, offhandSlot: 45, selectedHotbarSlot: 3,
      slots: Array.from({ length: 46 }, (_, slot) => ({ slot, item: slot === 36 ? { name: 'ars_nouveau:apprentice_spell_book', count: 1, snbt: '{components:{"ars_nouveau:spell_caster":{}}}' } : null })) },
    nativeMenu: null, skills: null, gameMessages: [], ...overrides }
}
function harness () {
  const document = shell(), jobs = new Map(), previews = []; let time = 0, sequence = 0
  const ui = createNativeInterface({ document, now: () => time,
    setTimer: (callback, delay) => { const id = ++sequence; jobs.set(id, { callback, at: time + delay }); return id },
    clearTimer: id => jobs.delete(id),
    previewFactory: options => { const preview = { options, visible: false, attach (host) { this.host = host; this.visible = true }, setVisible (value) { this.visible = value }, reset () { this.visible = false }, dispose () { this.disposed = true } }; previews.push(preview); return preview } })
  ui.setIdentity({ confirmed: true, playerUuid: UUID }); ui.update({ epoch: 1, presentation: presentation() })
  const advance = milliseconds => { time += milliseconds; for (const [id, job] of [...jobs]) if (job.at <= time) { jobs.delete(id); job.callback() } }
  return { ui, document, jobs, previews, advance }
}

test('native presentation requires confirmed same-player UUID and retains mod SNBT/components', () => {
  const p = presentation()
  assert.equal(nativePresentationView(p, UUID).inventory.slots[36].item.snbt, p.inventory.slots[36].item.snbt)
  assert.equal(nativePresentationView(p, OTHER).available, false)
  assert.equal(nativePresentationView({ ...p, source: 'proxy' }, UUID).available, false)
  assert.equal(nativePresentationView(p, null).available, false)
  assert.equal(nativeSlotRows([{ slot: 0, item: { name: 'ars_nouveau:spell_book', count: 1, components: { mod: [1] } } }])[0].item.name, 'ars_nouveau:spell_book')
})
test('malformed, duplicate, oversized and unnamespaced native slots reject without fake empty slots', () => {
  assert.equal(nativeSlotRows([{ slot: 0, item: { name: 'stone', count: 1 } }]), null)
  assert.equal(nativeSlotRows([{ slot: 0 }, { slot: 0 }]), null)
  assert.equal(nativeSlotRows(Array.from({ length: 257 }, (_, slot) => ({ slot }))), null)
  assert.equal(nativeSlotRows([{ slot: -1, item: null }]), null)
  assert.equal(nativeSlotRows([{ slot: 2, item: { name: 'minecraft:stone', count: -1 } }]), null)
})
test('unknown health/food/armor/XP never becomes full or zero, native slots preserve identity', () => {
  const h = harness()
  h.ui.update({ epoch: 1, presentation: presentation({ self: {} }) })
  assert.match(h.document.querySelector('[data-corti-hearts]').textContent, /未同步/)
  assert.match(h.document.querySelector('[data-corti-food]').textContent, /未同步/)
  assert.match(h.document.querySelector('[data-corti-armor]').textContent, /未同步/)
  assert.equal(h.document.querySelector('[data-corti-xp]').dataset.state, 'unavailable')
  const slot = h.document.querySelector('[data-corti-slots]').children[0]
  assert.equal(slot.dataset.itemName, 'ars_nouveau:apprentice_spell_book')
  assert.equal(slot.dataset.modelState, 'unavailable'); assert.equal(slot.querySelector('img'), null)
  assert.equal(h.document.querySelector('[data-corti-selection]').style.left, '124px')
})
test('verified native HUD assets load once, missing resources stay unavailable, disposal revokes own URLs', async () => {
  const calls = [], revoked = []; let counter = 0
  const assets = new NativeUiAssets({ bytes: async path => { calls.push(path); if (path.endsWith('missing.png')) throw Error('NATIVE_ASSET_MISSING'); return new Uint8Array([137]) } },
    { createUrl: () => `blob:verified-${++counter}`, revokeUrl: url => revoked.push(url) })
  const path = 'assets/minecraft/textures/gui/sprites/hud/heart/full.png'
  assert.equal(await assets.texture(path), 'blob:verified-1'); assert.equal(await assets.texture(path), 'blob:verified-1')
  assert.equal(calls.length, 1)
  await assert.rejects(assets.texture('assets/minecraft/textures/missing.png'), /MISSING/)
  await assert.rejects(assets.texture('assets/minecraft/textures/../skin.png'), /RESOURCE_INVALID/)
  assets.dispose(); assets.dispose(); assert.deepEqual(revoked, ['blob:verified-1'])
  await assert.rejects(assets.texture(path), /DISPOSED/)
})
test('verified asset preparation draws original heart/food sprites; no default URLs are used', async () => {
  const h = harness()
  const result = await h.ui.setAssets({ bytes: async () => new Uint8Array([137,80,78,71]) })
  assert.equal(result.available, true)
  const hearts = h.document.querySelector('[data-corti-hearts]')
  assert.equal(hearts.children.length, 10); assert.match(hearts.children[0].style.backgroundImage, /blob:/)
  assert.equal(h.document.querySelector('[data-corti-food]').children.length, 10)
  assert.equal(h.document.querySelector('[data-corti-armor]').dataset.state, 'unavailable')
  h.ui.dispose()
})
test('fresh native slots clear stale unavailable ARIA/title and inventory note stays outside its image', async () => {
  const h = harness()
  h.ui.reset()
  assert.match(h.document.querySelector('[data-corti-slots]').title, /未同步/)
  h.ui.update({ epoch: 1, presentation: presentation() })
  const bar = h.document.querySelector('[data-corti-slots]')
  assert.equal(bar.title, ''); assert.equal(bar.dataset.state, 'available')
  assert.equal(bar.getAttribute('aria-label'), null)
  assert.equal(h.document.querySelector('[data-corti-offhand]').getAttribute('aria-label'), '副手：空')
  await h.ui.setAssets({ bytes: async () => new Uint8Array([137,80,78,71]) })
  h.document.getElementById('corti-inventory-toggle').dispatch('click')
  const body = h.document.querySelector('[data-menu-body]'), panel = body.querySelector('.corti-menu-vanilla')
  assert.equal(panel.querySelector('.corti-menu-note'), null)
  assert.equal(body.children.at(-1).className, 'corti-menu-note')
  h.ui.dispose()
})
test('inventory preview reuses real actor only, has no fallback, and closing does not change the game rig', () => {
  const h = harness(), root = { playerObject: {}, userData: { playerUuid: UUID }, position: { x: 7 } }
  h.ui.setActor({ root, assetInfo: { uuid: UUID } })
  h.document.getElementById('corti-inventory-toggle').dispatch('click')
  assert.equal(h.previews.length, 1); assert.equal(h.previews[0].options.createFallback, undefined)
  assert.equal(h.previews[0].options.resolveSource(), root)
  assert.equal(root.position.x, 7)
  h.document.querySelector('[data-menu-close]').dispatch('click')
  assert.equal(h.previews[0].visible, false)
  h.ui.setActor({ root, assetInfo: { uuid: OTHER } })
  assert.equal(h.previews[0].options.resolveSource(), null)
  h.ui.dispose(); assert.equal(h.previews[0].disposed, true)
})
test('idle preview expires, manual takeover persists, native menus and combat cancel idle without actions', () => {
  const h = harness(), event = { type: 'inventoryPreview', playerUuid: UUID, open: true, ttlMs: 60000 }
  assert.equal(h.ui.event(event), true); assert.equal(h.ui.getState().idleOpen, true)
  h.advance(2400); assert.equal(h.document.getElementById('corti-menu').hidden, true)
  h.ui.event(event); h.document.getElementById('corti-inventory-toggle').dispatch('click'); h.advance(5000)
  assert.equal(h.ui.getState().manualOpen, true)
  h.document.querySelector('[data-menu-close]').dispatch('click')
  h.ui.event(event); h.ui.event({ type: 'entityDamage', playerUuid: UUID })
  assert.equal(h.ui.getState().idleOpen, false); assert.equal(h.ui.event(event), false)
  h.advance(5000)
  h.ui.update({ epoch: 1, presentation: presentation({ inventory: null, nativeMenu: { windowId: 4, stateId: 2, menuType: 'touhou_little_maid:maid', slots: [{ slot: 0, item: { name: 'ars_nouveau:source_gem', count: 4 } }] } }) })
  assert.equal(h.document.getElementById('corti-menu').dataset.inventorySource, 'container')
  assert.match(h.document.querySelector('[data-menu-body]').textContent, /ars_nouveau:source_gem/)
  assert.match(h.document.querySelector('[data-corti-slots]').textContent, /未同步/)
  assert.equal(h.ui.event(event), false)
})
test('the real window zero supplies inventory state without automatically opening a modal', () => {
  const h = harness()
  h.ui.update({ epoch: 1, presentation: presentation({ nativeMenu: { windowId: 0, stateId: 1,
    menuType: 'minecraft:inventory', slots: presentation().inventory.slots } }) })
  assert.equal(h.document.getElementById('corti-menu').hidden, true)
  assert.equal(h.document.querySelector('[data-corti-slots]').children.length, 9)
  assert.equal(h.ui.event({ type: 'inventoryPreview', playerUuid: UUID, open: true }), true)
  assert.equal(h.document.getElementById('corti-menu').dataset.inventorySource, 'idle')
  h.document.querySelector('[data-menu-close]').dispatch('click')
  h.document.getElementById('corti-inventory-toggle').dispatch('click')
  assert.equal(h.document.getElementById('corti-menu').dataset.inventorySource, 'manual')
  h.ui.update({ epoch: 1, presentation: presentation({ nativeMenu: { windowId: 3, stateId: 1,
    menuType: 'mod:container', slots: [{ slot: 0, item: null }] } }) })
  assert.equal(h.document.getElementById('corti-menu').dataset.inventorySource, 'container')
})
test('skills do not invent cooldown readiness; hostile message text is literal and deduped; reset drops stale data', () => {
  const h = harness()
  const state = { epoch: 1, presentation: presentation({ skills: { source: 'ars_nouveau_receipt', mana: { current: 110, max: 200 }, abilities: [{ id: 'self:heal', name: 'Heal', manaCost: null, cooldownRemainingMs: null }] },
    gameMessages: [{ seq: 1, kind: 'system', text: '<img src=x onerror=attack()>' }] }) }
  h.ui.update(state); h.ui.update(state)
  assert.equal(h.document.getElementById('corti-event-feed').children.length, 1)
  assert.equal(h.document.getElementById('corti-event-feed').querySelector('img'), null)
  assert.match(h.document.querySelector('[data-ability-list]').textContent, /冷却未同步/)
  assert.equal(h.document.querySelector('[data-mana]').textContent, '✦ 魔力 110/200')
  h.ui.setIdentity({ confirmed: true, playerUuid: OTHER })
  assert.equal(h.document.getElementById('corti-event-feed').children.length, 0)
  assert.match(h.document.querySelector('[data-mana]').textContent, /--/)
  assert.equal(h.jobs.size, 0)
})
test('fishing feed uses original bounded HUD but never maps a mod basename to vanilla icon', () => {
  const h = harness()
  assert.equal(h.ui.event({ type: 'fishingCatch', playerUuid: UUID, seq: 1, atMs: 0, count: 1, item: { name: 'ars_nouveau:cod', count: 1 } }), true)
  const feed = h.document.getElementById('viewer-fishing-catch')
  assert.match(feed.textContent, /ars_nouveau:cod/); assert.equal(feed.querySelector('img'), null)
  assert.equal(h.ui.event({ type: 'fishingCatch', playerUuid: OTHER, seq: 2, atMs: 0, count: 1, item: { name: 'minecraft:cod' } }), false)
  h.ui.dispose(); assert.equal(h.jobs.size, 0); assert.equal(feed.hidden, true)
})
test('fishing icon resolver receives actual component-sensitive item without the original normalizer dropping SNBT', () => {
  const document = shell(); let item
  const ui = createNativeInterface({ document, now: () => 0, setTimer: () => 1, clearTimer () {},
    resolveItemIcon: value => { item = value; return null } })
  ui.setIdentity({ confirmed: true, playerUuid: UUID })
  const snbt = '{components:{"minecraft:custom_model_data":7}}'
  ui.event({ type: 'fishingCatch', playerUuid: UUID, seq: 4, atMs: 0, count: 2,
    item: { name: 'minecraft:paper', count: 2, snbt, components: { 'minecraft:custom_model_data': 7 } } })
  assert.equal(item.snbt, snbt); assert.deepEqual(item.components, { 'minecraft:custom_model_data': 7 })
  assert.equal(document.getElementById('viewer-fishing-catch').querySelector('img'), null)
  ui.dispose()
})
test('an arbitrary URL cannot enter native slots; a verified Blob icon receives complete components', () => {
  const document = shell(), slot = document.createElement('div'), item = { name: 'minecraft:paper', count: 2, components: [{ type: 'minecraft:custom_model_data', data: 8 }] }
  let received
  renderNativeItemSlot(document, slot, item, { resolveItemIcon: value => { received = value; return { verified: true, url: '/icons/paper.png' } } })
  assert.equal(received, item); assert.equal(slot.querySelector('img'), null)
  renderNativeItemSlot(document, slot, item, { resolveItemIcon: () => ({ verified: true, url: 'blob:verified' }) })
  assert.equal(slot.querySelector('img').src, 'blob:verified'); assert.equal(slot.dataset.modelState, 'verified')
})
