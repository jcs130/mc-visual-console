import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createNativeInterface, nativePresentationView, nativeSlotRows, NativeUiAssets,
  renderNativeItemSlot, NATIVE_CRAFTING_GUI, nativeCraftingMenuLayout } from '../../src/native-viewer/native-ui-adapter.js'
import { NATIVE_CHEST_GUI, NATIVE_FURNACE_GUIS, nativeChestMenuLayout, nativeFurnaceMenuLayout,
  nativeFurnaceProgress } from '../../src/native-viewer/native-ui-adapter.js'

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
function harness (options = {}) {
  const document = shell(), jobs = new Map(), previews = []; let time = 0, sequence = 0
  const ui = createNativeInterface({ document, now: () => time,
    setTimer: (callback, delay) => { const id = ++sequence; jobs.set(id, { callback, at: time + delay }); return id },
    clearTimer: id => jobs.delete(id),
    previewFactory: options => { const preview = { options, visible: false, attach (host) { this.host = host; this.visible = true }, setVisible (value) { this.visible = value }, reset () { this.visible = false }, dispose () { this.disposed = true } }; previews.push(preview); return preview }, ...options })
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

test('actual server displayName is literal slot text/alt while native registry ID and complete SNBT remain intact',()=>{
  const document=shell(),slot=document.createElement('div'),item={name:'minecraft:paper',count:2,
    displayName:'<b>本人纸张</b>',snbt:'{id:"minecraft:paper",count:2,components:{"minecraft:custom_name":"本人纸张"}}'}
  let received
  renderNativeItemSlot(document,slot,item,{resolveItemIcon:value=>{received=value;return null}})
  assert.strictEqual(received,item);assert.equal(received.snbt,item.snbt)
  assert.match(slot.textContent,/<b>本人纸张<\/b>/);assert.equal(slot.querySelector('b'),null)
  assert.match(slot.title,/minecraft:paper/);assert.equal(slot.dataset.itemName,'minecraft:paper')
  renderNativeItemSlot(document,slot,item,{resolveItemIcon:()=>({verified:true,url:'blob:original-model'})})
  assert.equal(slot.querySelector('img').alt,item.displayName);assert.match(slot.title,/minecraft:paper/)
  renderNativeItemSlot(document,slot,{...item,displayName:undefined})
  assert.match(slot.textContent,/minecraft:paper/)
})

const craftingMenu = (overrides = {}) => ({ playerUuid: UUID, windowId: 1, stateId: 17, menuType: 'minecraft:crafting',
  slots: Array.from({ length: 46 }, (_, slot) => ({ slot, item: null })), carried: null, ...overrides })
const craftingReader = () => ({ manifest: { minecraftVersion: '1.21.1', assetIntegrityVerified: true,
  clientJarSha256: NATIVE_CRAFTING_GUI.clientJarSha256,
  sources: [{ name: 'minecraft-1.21.1-client.jar', sha256: NATIVE_CRAFTING_GUI.clientJarSha256, explicitOverride: false }],
  assets: { [NATIVE_CRAFTING_GUI.path]: { sha256: NATIVE_CRAFTING_GUI.sha256, bytes: NATIVE_CRAFTING_GUI.bytes } } },
  bytes: async () => new Uint8Array([137,80,78,71]) })
const containerMenu = (menuType, count, overrides = {}) => craftingMenu({ menuType,
  slots: Array.from({ length: count }, (_, slot) => ({ slot, item: null })), ...overrides })
const containerReader = () => {
  const reader = craftingReader()
  for (const info of [NATIVE_CHEST_GUI, ...Object.values(NATIVE_FURNACE_GUIS).flatMap(info => [info, info.lit, info.burn])])
    reader.manifest.assets[info.path] = { sha256: info.sha256, bytes: info.bytes }
  return reader
}

test('locked CraftingMenu slot origins cover the original result, 3x3 inputs and exact player inventory indices', () => {
  const menu = craftingMenu(), layout = nativeCraftingMenuLayout(menu, UUID)
  assert.equal(layout.length, 46); assert.deepEqual(layout[0].row, menu.slots[0])
  const point = i => [layout[i].row.slot, layout[i].x, layout[i].y, layout[i].role]
  assert.deepEqual(point(0), [0,124,35,'result'])
  assert.deepEqual(point(1), [1,30,17,'crafting']); assert.deepEqual(point(3), [3,66,17,'crafting'])
  assert.deepEqual(point(9), [9,66,53,'crafting'])
  assert.deepEqual(point(10), [10,8,84,'inventory']); assert.deepEqual(point(36), [36,152,120,'inventory'])
  assert.deepEqual(point(37), [37,8,142,'hotbar']); assert.deepEqual(point(45), [45,152,142,'hotbar'])
  assert.throws(() => nativeCraftingMenuLayout({ ...menu, playerUuid: OTHER }, UUID), /IDENTITY_MISMATCH/)
  for (const patch of [{ stateId: null }, { stateId: -1 }, { windowId: 0 }, { menuType: 'mod:crafting' }])
    assert.throws(() => nativeCraftingMenuLayout({ ...menu, ...patch }, UUID), /STATE_UNVERIFIED/)
  assert.throws(() => nativeCraftingMenuLayout({ ...menu, slots: menu.slots.slice(1) }, UUID), /SLOTS_UNVERIFIED/)
})

test('real crafting window draws the original PNG and all 46 native slots at the source item pixels, preserving SNBT and readonly state', async () => {
  const received = [], h = harness({ resolveItemIcon: item => { received.push(item); return { verified: true, url: 'blob:native-item' } } })
  await h.ui.setAssets(craftingReader())
  const menu = craftingMenu(), item = { name: 'minecraft:stick', count: 4, displayName: '本人木棍',
    snbt: '{count:4,id:"minecraft:stick",components:{"minecraft:custom_name":"本人木棍"}}' }
  menu.slots[0].item = item; menu.slots[1].item = { name: 'minecraft:oak_log', count: 1, snbt: '{count:1,id:"minecraft:oak_log"}' }
  h.ui.update({ epoch: 1, presentation: presentation({ nativeMenu: menu }) })
  const body = h.document.querySelector('[data-menu-body]'), panel = body.querySelector('.native-menu-crafting')
  assert.ok(panel); assert.match(panel.style.backgroundImage, /blob:/); assert.equal(panel.style.width, '352px'); assert.equal(panel.style.height, '332px')
  assert.equal(panel.dataset.nativeGuiSha256, NATIVE_CRAFTING_GUI.sha256); assert.equal(panel.dataset.stateId, '17')
  assert.equal(panel.querySelectorAll('.corti-menu-slot').length, 46)
  const result = panel.querySelectorAll('.corti-menu-slot').find(row => row.dataset.slot === '0')
  assert.equal(result.style.left, '246px'); assert.equal(result.style.top, '68px', 'CSS item +2px yields original (248px,70px) origin')
  assert.equal(result.dataset.nativeSlotX, '124'); assert.equal(result.dataset.nativeSlotY, '35'); assert.equal(result.dataset.slotRole, 'result')
  assert.match(result.title, /本人木棍/); assert.match(result.title, /minecraft:stick/); assert.ok(received.includes(item)); assert.equal(item.snbt, received.find(row => row === item).snbt)
  assert.equal(panel.querySelector('.corti-menu-note'), null); assert.match(body.textContent, /窗口 1 · state 17/)
  assert.match(body.textContent, /配方书与原生标题未接入/); assert.equal(h.previews.length, 0)
  for (const row of panel.querySelectorAll('.corti-menu-slot')) assert.equal(row.listeners.size, 0, 'no game/menu mutation event is installed')
  const replacement = craftingMenu({ stateId: 18 }); replacement.slots[0].item = { name: 'minecraft:oak_button', count: 1, snbt: '{count:1,id:"minecraft:oak_button"}' }
  h.ui.update({ epoch: 1, presentation: presentation({ nativeMenu: replacement }) })
  assert.equal(body.querySelector('.native-menu-crafting').dataset.stateId, '18')
  assert.match(body.querySelector('.native-menu-crafting').querySelectorAll('.corti-menu-slot')[0].title, /minecraft:oak_button/)
  assert.match(result.title, /minecraft:stick/, 'retired DOM keeps its own old state, never mutates the new native slot')
  h.ui.dispose()
})

test('crafting source/client/texture mismatch and unsupported mod layouts stay generic with the exact refusal reason', async () => {
  for (const alter of [r => { r.manifest.clientJarSha256 = 'other' }, r => { r.manifest.sources.push(r.manifest.sources[0]) },
    r => { r.manifest.sources[0].explicitOverride = true }, r => { r.manifest.assets[NATIVE_CRAFTING_GUI.path].sha256 = 'other' }]) {
    const h = harness(), reader = craftingReader(); alter(reader); await h.ui.setAssets(reader)
    h.ui.update({ epoch: 1, presentation: presentation({ nativeMenu: craftingMenu() }) })
    const body = h.document.querySelector('[data-menu-body]')
    assert.equal(body.querySelector('.native-menu-crafting'), null); assert.match(body.textContent, /NATIVE_CRAFTING_GUI_(CLIENT|TEXTURE)_UNVERIFIED/)
    h.ui.dispose()
  }
  const h = harness(); await h.ui.setAssets(craftingReader())
  h.ui.update({ epoch: 1, presentation: presentation({ nativeMenu: craftingMenu({ slots: craftingMenu().slots.slice(1) }) }) })
  assert.match(h.document.querySelector('[data-menu-body]').textContent, /NATIVE_CRAFTING_MENU_SLOTS_UNVERIFIED/)
  h.ui.update({ epoch: 1, presentation: presentation({ nativeMenu: craftingMenu({ menuType: 'mod:crafting' }) }) })
  assert.equal(h.document.querySelector('.native-menu-crafting'), null); assert.match(h.document.querySelector('[data-menu-body]').textContent, /原生菜单布局未支持/)
  h.ui.dispose()
})

test('icon loading is distinct from a real source/component rejection, and late retired image errors cannot overwrite a newer slot', () => {
  const document = shell(), slot = document.createElement('div'), item = { name: 'minecraft:oak_log', count: 1, snbt: '{count:1,id:"minecraft:oak_log"}' }
  renderNativeItemSlot(document, slot, item, { resolveItemIcon: () => null, resolveItemIconReason: () => 'loading' })
  assert.equal(slot.dataset.modelState, 'loading'); assert.match(slot.title, /加载中/); assert.doesNotMatch(slot.title, /未支持/)
  renderNativeItemSlot(document, slot, item, { resolveItemIcon: () => null, resolveItemIconReason: () => 'NATIVE_RESOURCE_PRIORITY_UNRESOLVED:assets/mod/real.png' })
  assert.equal(slot.dataset.modelState, 'unavailable'); assert.match(slot.title, /NATIVE_RESOURCE_PRIORITY_UNRESOLVED/)
  renderNativeItemSlot(document, slot, item, { resolveItemIcon: () => ({ verified: true, url: 'blob:old' }) })
  const oldImage = slot.querySelector('img')
  renderNativeItemSlot(document, slot, { ...item, name: 'minecraft:stick' })
  oldImage.dispatch('error'); assert.match(slot.title, /minecraft:stick/); assert.equal(slot.dataset.modelReason, undefined)
  assert.doesNotMatch(slot.textContent, /oak_log/)
})

test('private locked client crafting PNG is read through SHA and priority validation',
  { skip: !process.env.NATIVE_GUIDE_ASSET_DIR }, async () => {
    const { readFile } = await import('node:fs/promises'), { join } = await import('node:path')
    const { NativeAssetReader } = await import('../../src/native-viewer/model-loader.js')
    const directory = process.env.NATIVE_GUIDE_ASSET_DIR, manifest = JSON.parse(await readFile(join(directory, 'native-assets.json'), 'utf8'))
    const assets = new NativeUiAssets(new NativeAssetReader(manifest, path => readFile(join(directory, path))))
    await assets.prepare(); assert.equal(assets.craftingReason, null); assert.ok(assets.urls.has(NATIVE_CRAFTING_GUI.path))
    assert.equal(assets.chestReason, null); assert.ok(assets.urls.has(NATIVE_CHEST_GUI.path))
    for (const [type, info] of Object.entries(NATIVE_FURNACE_GUIS)) {
      assert.equal(assets.furnaceReasons.get(type), null); assert.equal(assets.furnaceProgressReasons.get(type), null)
      for (const image of [info, info.lit, info.burn]) {
        assert.ok(assets.urls.has(image.path))
        const bytes = await readFile(join(directory, image.path)), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        assert.equal(view.getUint32(16), image === info ? 256 : image.width)
        assert.equal(view.getUint32(20), image === info ? 256 : image.height)
      }
    }
    assets.dispose()
  })

test('all six original ChestMenu layouts preserve exact native slot indices and the two ContainerScreen crops', () => {
  for (let rows = 1; rows <= 6; rows++) {
    const count = rows * 9, menu = containerMenu(`minecraft:generic_9x${rows}`, count + 36)
    const layout = nativeChestMenuLayout(menu, UUID), point = i => [layout.slots[i].x, layout.slots[i].y, layout.slots[i].role]
    assert.equal(layout.height, 114 + rows * 18); assert.equal(layout.slots.length, count + 36)
    assert.deepEqual(layout.blits, [{ x: 0, y: 0, sourceX: 0, sourceY: 0, width: 176, height: rows * 18 + 17 },
      { x: 0, y: rows * 18 + 17, sourceX: 0, sourceY: 126, width: 176, height: 96 }])
    assert.equal(layout.blits.reduce((sum, part) => sum + part.height, 0), layout.height - 1)
    assert.deepEqual(point(0), [8,18,'container']); assert.deepEqual(point(count - 1), [152,18 + (rows - 1) * 18,'container'])
    assert.deepEqual(point(count), [8,31 + rows * 18,'inventory'])
    assert.deepEqual(point(count + 26), [152,67 + rows * 18,'inventory'])
    assert.deepEqual(point(count + 27), [8,89 + rows * 18,'hotbar']); assert.deepEqual(point(count + 35), [152,89 + rows * 18,'hotbar'])
    assert.throws(() => nativeChestMenuLayout({ ...menu, playerUuid: OTHER }, UUID), /IDENTITY_MISMATCH/)
    assert.throws(() => nativeChestMenuLayout({ ...menu, stateId: null }, UUID), /STATE_UNVERIFIED/)
    assert.throws(() => nativeChestMenuLayout({ ...menu, slots: menu.slots.slice(1) }, UUID), /SLOTS_UNVERIFIED/)
  }
  assert.throws(() => nativeChestMenuLayout(containerMenu('minecraft:generic_9x7',99), UUID), /STATE_UNVERIFIED/)
  assert.throws(() => nativeChestMenuLayout(containerMenu('mod:generic_9x3',63), UUID), /STATE_UNVERIFIED/)
})

test('real chests use two original PNG blits with variable height instead of a guessed 5x9 grid', async () => {
  const h = harness(); await h.ui.setAssets(containerReader())
  for (let rows = 1; rows <= 6; rows++) {
    const menu = containerMenu(`minecraft:generic_9x${rows}`, rows * 9 + 36, { stateId: rows })
    h.ui.update({ epoch: 1, presentation: presentation({ nativeMenu: menu }) })
    const panel = h.document.querySelector('.native-menu-chest'), crops = panel.querySelectorAll('.native-menu-background-blit')
    assert.equal(panel.dataset.nativeGuiSource, NATIVE_CHEST_GUI.path); assert.equal(panel.style.height, `${(114 + rows * 18) * 2}px`)
    assert.equal(panel.style.backgroundImage, 'none'); assert.equal(crops.length, 2)
    assert.equal(crops[1].style.backgroundPosition, '0px -252px'); assert.equal(crops[1].style.backgroundSize, '512px 512px')
    assert.equal(crops[1].style.top, `${(rows * 18 + 17) * 2}px`); assert.equal(crops[1].style.height, '192px')
    assert.equal(panel.querySelectorAll('.corti-menu-slot').length, rows * 9 + 36)
    assert.match(h.document.querySelector('[data-menu-body]').textContent, new RegExp(`9×${rows}`))
    assert.equal(h.previews.length, 0)
  }
  h.ui.dispose()
})

test('furnace/smoker/blast layouts are the original 39 slots and actual data values use Java float32/ceil crop rules', () => {
  for (const type of Object.keys(NATIVE_FURNACE_GUIS)) {
    const menu = containerMenu(type,39), layout = nativeFurnaceMenuLayout(menu, UUID)
    assert.equal(layout.info.path, NATIVE_FURNACE_GUIS[type].path)
    assert.deepEqual(layout.slots.slice(0,3).map(({ row,x,y,role }) => [row.slot,x,y,role]), [[0,56,17,'input'],[1,56,53,'fuel'],[2,116,35,'result']])
    assert.deepEqual([layout.slots[3].x,layout.slots[3].y,layout.slots[29].x,layout.slots[29].y], [8,84,152,120])
    assert.deepEqual([layout.slots[30].x,layout.slots[30].y,layout.slots[38].x,layout.slots[38].y], [8,142,152,142])
    assert.deepEqual(nativeFurnaceProgress(menu, UUID), { available: false, reason: 'NATIVE_FURNACE_DATA_UNAVAILABLE' })
    for (const [data, fire, arrow] of [[[0,0,0,0],0,0],[[200,200,200,200],14,24],[[1,0,1,3],2,8],
      [[7,13,2,3],9,16],[[1,13,1,24],2,1],[[201,200,201,200],14,24], [[-1,200,-1,200],0,0]]) {
      const actual = nativeFurnaceProgress({ ...menu, dataValues: data }, UUID)
      assert.equal(actual.available,true); assert.equal(actual.litPixels,fire); assert.equal(actual.burnPixels,arrow)
      assert.equal(actual.lit.sourceY,14-fire); assert.equal(actual.lit.y,50-fire)
      assert.equal(actual.burn.x,79); assert.equal(actual.burn.y,34); assert.deepEqual(actual.values,data); assert.notEqual(actual.values,data)
    }
    for (const dataValues of [[1,2,3], [1,2,3,4,5], [1,2,3,NaN], [1,2,3,0.5], ['1',2,3,4],
      [1,2,3,2147483648], [1,2,3,-2147483649], Array(4), { 0: 1 }])
      assert.deepEqual(nativeFurnaceProgress({ ...menu,dataValues }, UUID), { available:false,reason:'NATIVE_FURNACE_DATA_UNVERIFIED' })
    assert.throws(() => nativeFurnaceMenuLayout({ ...menu, playerUuid:OTHER },UUID), /IDENTITY_MISMATCH/)
    assert.throws(() => nativeFurnaceMenuLayout({ ...menu, slots:menu.slots.slice(1) },UUID), /SLOTS_UNVERIFIED/)
  }
  assert.throws(() => nativeFurnaceMenuLayout(containerMenu('constructor',39),UUID), /STATE_UNVERIFIED/)
})

test('real furnace GUI explicitly keeps missing progress unknown, crops actual sprites, and replaces late/full values on state changes', async () => {
  const h = harness(); await h.ui.setAssets(containerReader())
  for (const type of Object.keys(NATIVE_FURNACE_GUIS)) {
    const menu = containerMenu(type,39)
    h.ui.update({ epoch: 1, presentation: presentation({ nativeMenu:menu }) })
    const body=h.document.querySelector('[data-menu-body]'), unknown=body.querySelector('.native-menu-furnace')
    assert.equal(unknown.dataset.nativeGuiSource,NATIVE_FURNACE_GUIS[type].path); assert.equal(unknown.dataset.progressState,'unknown')
    assert.equal(unknown.querySelectorAll('.corti-menu-slot').length,39); assert.equal(unknown.querySelector('.native-menu-progress-lit'),null)
    assert.equal(unknown.querySelector('.native-menu-progress-burn'),null); assert.match(body.textContent,/进度未知（NATIVE_FURNACE_DATA_UNAVAILABLE）/)
    h.ui.update({ epoch: 1, presentation: presentation({ nativeMenu:{ ...menu,stateId:18,dataValues:[7,13,1,3] } }) })
    const actual=body.querySelector('.native-menu-furnace'),fire=actual.querySelector('.native-menu-progress-lit'),arrow=actual.querySelector('.native-menu-progress-burn')
    assert.equal(actual.dataset.progressState,'available'); assert.equal(actual.dataset.stateId,'18')
    assert.equal(fire.style.height,'18px'); assert.equal(fire.style.top,'82px'); assert.equal(fire.style.backgroundPosition,'0px -10px')
    assert.equal(fire.style.backgroundSize,'28px 28px'); assert.equal(arrow.style.width,'16px'); assert.equal(arrow.style.backgroundSize,'48px 32px')
    h.ui.update({ epoch: 1, presentation: presentation({ nativeMenu:{ ...menu,stateId:19,dataValues:[0,0,0,0] } }) })
    const empty=body.querySelector('.native-menu-furnace'); assert.equal(empty.dataset.progressState,'available')
    assert.equal(empty.querySelector('.native-menu-progress-lit'),null); assert.equal(empty.querySelector('.native-menu-progress-burn'),null)
    h.ui.update({ epoch: 1, presentation: presentation({ nativeMenu:{ ...menu,stateId:20,dataValues:[1,2,3] } }) })
    assert.equal(body.querySelector('.native-menu-furnace').dataset.progressState,'unknown'); assert.match(body.textContent,/NATIVE_FURNACE_DATA_UNVERIFIED/)
    for(const row of actual.querySelectorAll('.corti-menu-slot')) assert.equal(row.listeners.size,0)
  }
  h.ui.dispose()
})

test('container background and furnace sprite SHA/priority failures remain explicit without a substituted layout or full fire', async () => {
  const h=harness(),reader=containerReader();reader.bytes=async path=>{
    if(path===NATIVE_CHEST_GUI.path) throw Error('NATIVE_RESOURCE_PRIORITY_UNRESOLVED:actual-chest')
    if(path===NATIVE_FURNACE_GUIS['minecraft:furnace'].lit.path) throw Error('NATIVE_RESOURCE_PRIORITY_UNRESOLVED:actual-fire')
    return new Uint8Array([137,80,78,71])
  }
  await h.ui.setAssets(reader)
  h.ui.update({epoch:1,presentation:presentation({nativeMenu:containerMenu('minecraft:generic_9x3',63)})})
  assert.equal(h.document.querySelector('.native-menu-chest'),null);assert.match(h.document.querySelector('[data-menu-body]').textContent,/NATIVE_RESOURCE_PRIORITY_UNRESOLVED:actual-chest/)
  h.ui.update({epoch:1,presentation:presentation({nativeMenu:containerMenu('minecraft:furnace',39,{dataValues:[200,200,200,200]})})})
  assert.ok(h.document.querySelector('.native-menu-furnace'));assert.equal(h.document.querySelector('.native-menu-progress-lit'),null)
  assert.equal(h.document.querySelector('.native-menu-progress-burn'),null);assert.match(h.document.querySelector('[data-menu-body]').textContent,/NATIVE_RESOURCE_PRIORITY_UNRESOLVED:actual-fire/)
  h.ui.dispose()
  const altered=containerReader();altered.manifest.assets[NATIVE_FURNACE_GUIS['minecraft:smoker'].path].sha256='wrong'
  const x=harness();await x.ui.setAssets(altered)
  x.ui.update({epoch:1,presentation:presentation({nativeMenu:containerMenu('minecraft:smoker',39)})})
  assert.equal(x.document.querySelector('.native-menu-furnace'),null);assert.match(x.document.querySelector('[data-menu-body]').textContent,/NATIVE_FURNACE_GUI_TEXTURE_UNVERIFIED/)
  x.ui.dispose()
})
