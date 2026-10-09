import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { mirrorInventoryPlayer, poseInventoryPlayer, releaseInventoryMirror } from '../../src/modern-viewer/inventory-player-preview.js'
import { createNativeInterface, nativePresentationView, nativeSlotRows, NativeUiAssets,
  renderNativeItemSlot, NATIVE_CRAFTING_GUI, nativeCraftingMenuLayout } from '../../src/native-viewer/native-ui-adapter.js'
import { NATIVE_CHEST_GUI, NATIVE_FURNACE_GUIS, nativeChestMenuLayout, nativeFurnaceMenuLayout,
  nativeFurnaceProgress, NATIVE_COOKING_POT_GUI, nativeCookingPotMenuLayout,
  nativeCookingPotState } from '../../src/native-viewer/native-ui-adapter.js'
import { NATIVE_CURIOS_GUI, NATIVE_DOMUM_GUIS, nativeCuriosMenuLayout, nativeCoordinateMenuLayout,
  nativeDomumMenuLayout } from '../../src/native-viewer/native-mod-menus.js'

const UUID = 'e371227c-09fa-3722-84f4-f3228a552c3c'
const OTHER = '1231227c-09fa-3722-84f4-f3228a552c3c'

import { shell } from './fixtures/native-console-dom.mjs'
import { nativeSoulSlabAnimationStyle } from '../../src/native-viewer/native-soul-slab-icons.js'

test('soul slab displays the original clipped animated image, discloses missing glint and clears state when the item changes', () => {
  const document = shell(), slot = document.createElement('div')
  const item = { name: 'touhou_little_maid:smart_slab_init', count: 1, displayName: '魂符' }
  const animation = { kind: 'native-soul-slab-sheet-v1', frameCount: 7, frameTicks: 2, tickMs: 50,
    frameWidth: 16, frameHeight: 16, sheetHeight: 112, epochMs: Date.now() }
  const icon = { verified: true, url: 'blob:soul-sheet', animation, effectUnavailableReason: 'NATIVE_GUI_GLINT_ATLAS_UV_UNAVAILABLE' }
  renderNativeItemSlot(document,slot,item,{ resolveItemIcon: () => icon })
  assert.equal(slot.querySelector('img').alt,'魂符')
  assert.equal(slot.querySelector('img').style.height,'224px')
  assert.equal(slot.querySelector('.corti-native-animated-icon').style.overflow,'hidden')
  assert.equal(slot.querySelector('.corti-item-fallback'),null)
  assert.equal(slot.dataset.modelState,'partial'); assert.equal(slot.dataset.animationFrames,'7')
  assert.match(slot.title,/附魔光效未适配/)
  assert.match(nativeSoulSlabAnimationStyle(animation).animation,/700ms steps\(7,end\)/)
  renderNativeItemSlot(document,slot,null)
  assert.equal(slot.dataset.modelState,'empty'); assert.equal(slot.dataset.effectReason,undefined)
  assert.equal(slot.dataset.animationFrames,undefined)
  renderNativeItemSlot(document,slot,item,{ resolveItemIcon: () => ({ ...icon, animation: { ...animation, frameCount: 8 } }) })
  assert.equal(slot.querySelector('img'),null); assert.equal(slot.dataset.modelReason,'NATIVE_SOUL_SLAB_ANIMATION_INVALID')
})
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

test('YSM inventory mirrors only the actual own rig without fallback or disposing shared assets', async t => {
  const h = harness(), world = new THREE.Group(), root = new THREE.Group(), orientation = new THREE.Group(), content = new THREE.Group()
  const body = new THREE.Bone(), head = new THREE.Bone(), geometry = new THREE.BoxGeometry(.4, .7, .2)
  const map = new THREE.Texture(), material = new THREE.MeshLambertMaterial({ map }), mesh = new THREE.Mesh(geometry, material)
  const disposed = { geometry: 0, material: 0, map: 0 }
  for (const [key, asset] of Object.entries({ geometry, material, map })) asset.addEventListener('dispose', () => disposed[key]++)
  t.after(() => { h.ui.dispose(); geometry.dispose(); material.dispose(); map.dispose() })
  root.userData.playerUuid = UUID; root.position.set(7, 64, -3); root.rotation.set(.1, .6, 0); root.visible = false
  orientation.scale.set(-1, -1, 1); orientation.position.y = .01; content.position.y = -1.5
  body.name = 'body'; body.position.set(0, 1.1, 0); body.rotation.set(.1, 0, .2)
  head.name = 'head'; head.position.set(0, .4, 0); head.rotation.set(0, -.3, .1)
  world.add(root); root.add(orientation); orientation.add(content); content.add(body); body.add(head, mesh)
  const sourceNodes = [root, orientation, content, body, head, mesh]
  const transforms = sourceNodes.map(node => ({ position: node.position.toArray(), quaternion: node.quaternion.toArray(),
    scale: node.scale.toArray(), visible: node.visible, parent: node.parent }))
  const ownYsm = { root, assetInfo: { uuid: UUID, kind: 'ysm', inventoryPreviewAvailable: true } }
  await h.ui.setAssets({ bytes: async () => new Uint8Array([137,80,78,71]) })
  h.ui.setActor(ownYsm)
  h.document.getElementById('corti-inventory-toggle').dispatch('click')
  assert.equal(h.previews.length, 1); assert.equal(h.previews[0].options.resolveSource(), root)
  assert.equal(h.previews[0].options.createFallback, undefined)
  assert.equal(h.document.querySelector('[data-inventory-player-preview]').getAttribute('aria-label'), '本人 YSM 原模型预览；装备渲染未支持')
  assert.match(h.document.querySelector('[data-menu-body]').textContent, /YSM 背包人物沿用本人原模型与当前姿态；装备未适配/)
  assert.match(h.document.querySelector('[data-menu-body]').textContent, /ars_nouveau:apprentice_spell_book/)

  const mirror = mirrorInventoryPlayer(THREE, h.previews[0].options.resolveSource()), stage = new THREE.Group()
  stage.add(mirror.root); poseInventoryPlayer(mirror, .31, .2)
  assert.notStrictEqual(mirror.root, root); assert.equal(mirror.root.visible, true)
  assert.deepEqual(mirror.nodes.get(orientation).scale.toArray(), [-1, -1, 1])
  assert.notStrictEqual(mirror.nodes.get(body), body); assert.equal(mirror.nodes.get(body).isBone, true)
  assert.deepEqual(mirror.nodes.get(head).quaternion.toArray(), head.quaternion.toArray())
  assert.strictEqual(mirror.nodes.get(mesh).geometry, geometry); assert.strictEqual(mirror.nodes.get(mesh).material, material)
  assert.strictEqual(mirror.nodes.get(mesh).material.map, map)
  h.document.querySelector('[data-menu-close]').dispatch('click'); releaseInventoryMirror(mirror)
  assert.equal(h.previews[0].visible, false); assert.equal(mirror.root.parent, null)
  assert.equal(mirror.nodes.size, 0); assert.deepEqual(disposed, { geometry: 0, material: 0, map: 0 })
  sourceNodes.forEach((node, i) => {
    assert.deepEqual(node.position.toArray(), transforms[i].position); assert.deepEqual(node.quaternion.toArray(), transforms[i].quaternion)
    assert.deepEqual(node.scale.toArray(), transforms[i].scale); assert.equal(node.visible, transforms[i].visible)
    assert.strictEqual(node.parent, transforms[i].parent)
  })
  assert.strictEqual(mesh.geometry, geometry); assert.strictEqual(mesh.material, material); assert.strictEqual(material.map, map)

  root.userData.playerUuid = OTHER; h.ui.setActor(ownYsm)
  assert.equal(h.previews[0].options.resolveSource(), null)
  root.userData.playerUuid = UUID
  h.ui.setActor({ root, assetInfo: { ...ownYsm.assetInfo, uuid: OTHER } })
  assert.equal(h.previews[0].options.resolveSource(), null)
  h.ui.setActor({ root, assetInfo: { ...ownYsm.assetInfo, uuid: undefined } })
  assert.equal(h.previews[0].options.resolveSource(), null)
  h.ui.setActor({ root, assetInfo: { ...ownYsm.assetInfo, inventoryPreviewAvailable: false } })
  assert.equal(h.previews[0].options.resolveSource(), null)
  h.ui.setActor({ root: { userData: { playerUuid: UUID } }, assetInfo: ownYsm.assetInfo })
  assert.equal(h.previews[0].options.resolveSource(), null)
  h.ui.setActor(ownYsm); h.document.getElementById('corti-inventory-toggle').dispatch('click')
  const original = { playerObject: {}, userData: { playerUuid: UUID } }
  h.ui.setActor({ root: original, assetInfo: { uuid: UUID } })
  assert.equal(h.previews[0].options.resolveSource(), original)
  assert.doesNotMatch(h.document.querySelector('[data-menu-body]').textContent, /YSM 背包人物/)
  h.ui.dispose(); assert.deepEqual(disposed, { geometry: 0, material: 0, map: 0 })
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
const cookingPotMenu = (overrides = {}) => containerMenu('farmersdelight:cooking_pot',45,overrides)
const cookingPotReader = () => {
  const reader = containerReader(), info = NATIVE_COOKING_POT_GUI
  reader.manifest.sources.push({ name:info.sourceName,sha256:info.sourceSha256,explicitOverride:false })
  for(const image of [info,info.emptyContainer]) reader.manifest.assets[image.path] = { sha256:image.sha256,bytes:image.bytes,source:info.sourceName }
  return reader
}

const modMenuReader = () => {
  const reader = containerReader()
  for (const info of [NATIVE_CURIOS_GUI, ...NATIVE_DOMUM_GUIS]) {
    if (!reader.manifest.sources.some(row => row.name === info.sourceName)) reader.manifest.sources.push({ name: info.sourceName, sha256: info.sourceSha256, explicitOverride: false })
    reader.manifest.assets[info.path] = { sha256: info.sha256, bytes: info.bytes, source: info.sourceName }
  }
  const info = NATIVE_CURIOS_GUI.inventory
  reader.manifest.assets[info.path] = { sha256: info.sha256, bytes: info.bytes, source: 'minecraft-1.21.1-client.jar' }
  return reader
}
const curiosMenu = ({ count = 6, columns = 1, paged = false } = {}) => {
  const menu = containerMenu('curios:curios_container', 46 + count)
  menu.slotLayout = menu.slots.map(({ slot: i }) => {
    const point = i === 0 ? [154,28] : i < 5 ? [98 + ((i-1)%2)*18,18 + Math.floor((i-1)/2)*18]
      : i < 9 ? [8,8+(i-5)*18] : i < 36 ? [8+((i-9)%9)*18,84+Math.floor((i-9)/9)*18]
        : i < 45 ? [8+(i-36)*18,142] : i === 45 ? [77,62]
          : [7-(14+18*columns)+((i-46)%columns)*18,(paged ? 16 : 8)+Math.floor((i-46)/columns)*18]
    return { slot: i, x: point[0], y: point[1] }
  })
  return menu
}

test('Curios original side panel follows real negative slot origins, dynamic columns and paged rows', () => {
  const one = nativeCuriosMenuLayout(curiosMenu(), UUID)
  assert.equal(one.width,209); assert.equal(one.offsetX,33); assert.equal(one.slots[46].x,-25); assert.equal(one.slots[51].y,98)
  assert.deepEqual(one.blits[0], { path:NATIVE_CURIOS_GUI.inventory.path,x:0,y:0,sourceX:0,sourceY:0,width:176,height:166 })
  const two = nativeCuriosMenuLayout(curiosMenu({ count: 13,columns: 2,paged:true }), UUID)
  assert.equal(two.width,227); assert.equal(two.slots[46].x,-43); assert.equal(two.slots[47].x,-25)
  assert.equal(two.slots[58].y,124)
  assert.deepEqual(two.blits.filter(row => row.sourceX===7).map(row => row.height), [126,108])
  assert.throws(() => nativeCuriosMenuLayout(curiosMenu(), OTHER), /IDENTITY/)
  const damaged = curiosMenu(); damaged.slotLayout[46].x=8
  assert.throws(() => nativeCuriosMenuLayout(damaged, UUID), /LAYOUT_MISMATCH/)
})

test('Curios GUI uses original texture crops and updates real cursor/slots after native clicks without proxy items', async () => {
  const h=harness({ resolveItemIcon: () => ({ verified:true,url:'blob:native-item' }) })
  await h.ui.setAssets(modMenuReader())
  const menu=curiosMenu(), item={ name:'patchouli:guide_book',count:1,displayName:'幻想乡指南',snbt:'{id:"patchouli:guide_book",count:1,components:{}}' }
  menu.slots[37].item=item; menu.mayPickup=Array(52).fill(true)
  menu.curios={ playerUuid:UUID,menuOpen:true,containerId:1,stateId:17,page:0,totalPages:1,menuSlots:[] }
  h.ui.update({ epoch:1,presentation:presentation({ nativeMenu:menu }) })
  let panel=h.document.querySelector('.native-menu-curios')
  assert.ok(panel); assert.equal(panel.style.width,'418px')
  const side=panel.querySelectorAll('.corti-menu-slot').find(row=>row.dataset.slot==='46')
  assert.equal(side.style.left,'14px'); assert.equal(side.dataset.nativeSlotX,'-25'); assert.equal(side.dataset.mayPickup,'true')
  assert.equal(panel.querySelectorAll('.native-menu-background-blit').length,6)
  assert.equal(h.document.querySelector('.corti-menu-grid'),null)
  menu.slots[37].item=null; menu.carried=item; menu.stateId++
  h.ui.update({ epoch:1,presentation:presentation({ nativeMenu:menu }) })
  panel=h.document.querySelector('.native-menu-curios')
  assert.equal(panel.querySelectorAll('.corti-menu-slot').find(row=>row.dataset.slot==='37').dataset.itemName,'')
  assert.match(h.document.querySelector('.native-menu-carried').textContent,/幻想乡指南/)
  menu.slots[9].item=item; menu.carried=null; menu.stateId++
  h.ui.update({ epoch:1,presentation:presentation({ nativeMenu:menu }) })
  assert.equal(h.document.querySelector('.native-menu-carried'),null)
  assert.equal(h.document.querySelector('.native-menu-curios').querySelectorAll('.corti-menu-slot').find(row=>row.dataset.slot==='9').dataset.itemName,'patchouli:guide_book')
  h.ui.setActor(null,'NATIVE_YSM_MODEL_UNSUPPORTED')
  assert.match(h.previews.at(-1).options.getUnavailableReason(),/NATIVE_YSM_MODEL_UNSUPPORTED/)
  h.ui.setActor(null,'本人模型正在载入')
  assert.equal(h.previews.at(-1).options.getUnavailableReason(),null)
  h.ui.dispose()
})

test('overridden Curios textures cannot masquerade as the installed GUI; diagnostic view retains original coordinates', async () => {
  const reader=modMenuReader(); reader.manifest.assets[NATIVE_CURIOS_GUI.path].sha256='0'.repeat(64)
  const h=harness(); await h.ui.setAssets(reader)
  h.ui.update({ epoch:1,presentation:presentation({ nativeMenu:curiosMenu() }) })
  assert.equal(h.document.querySelector('.native-menu-curios'),null)
  const view=h.document.querySelector('.corti-menu-native-coordinates')
  assert.ok(view); assert.equal(view.querySelectorAll('.corti-menu-slot').find(row=>row.dataset.slot==='46').dataset.nativeSlotX,'-25')
  assert.match(h.document.querySelector('[data-menu-body]').textContent,/TEXTURE_UNVERIFIED/)
  const malformed=curiosMenu(); malformed.slotLayout[4].x=Infinity
  assert.throws(()=>nativeCoordinateMenuLayout(malformed,UUID),/INVALID/)
  h.ui.dispose()
})

test('Domum material/output layout requires a fresh native state matching the exact window and state id', () => {
  const menu=containerMenu('domum_ornamentum:architectscutter',39)
  menu.slotLayout=menu.slots.map(({slot:i})=>({ slot:i,x:i<2 ? 96 : i===2 ? 183 : 40+((i-3)%9)*18,
    y:i<2 ? 66+i*20 : i===2 ? 77 : i<30 ? 120+Math.floor((i-3)/9)*18 : 178 }))
  menu.domum={ playerUuid:UUID,source:'same_player_native_architects_cutter',windowId:1,stateId:17,inputs:[{},{}],outputSlot:2,groups:[],currentGroup:null }
  assert.equal(nativeDomumMenuLayout(menu,UUID).info.path,NATIVE_DOMUM_GUIS[0].path)
  menu.domum.currentGroup='domum_ornamentum:doors'
  assert.equal(nativeDomumMenuLayout(menu,UUID).info.path,NATIVE_DOMUM_GUIS[1].path)
  menu.domum.stateId++
  assert.throws(()=>nativeDomumMenuLayout(menu,UUID),/STATE_UNAVAILABLE/)
})

test('Domum original recipe previews retain real material SNBT and cannot be mistaken for inventory slots', async () => {
  const menu=containerMenu('domum_ornamentum:architectscutter',39)
  menu.slotLayout=menu.slots.map(({slot:i})=>({ slot:i,x:i<2 ? 96 : i===2 ? 183 : 40+((i-3)%9)*18,
    y:i<2 ? 66+i*20 : i===2 ? 77 : i<30 ? 120+Math.floor((i-3)/9)*18 : 178 }))
  const item={name:'domum_ornamentum:panel',count:1,displayName:'建筑面板',snbt:'{id:"domum_ornamentum:panel",count:1,components:{"domum_ornamentum:material":{material:"minecraft:birch_planks"}}}'}
  menu.domum={playerUuid:UUID,source:'same_player_native_architects_cutter',windowId:1,stateId:17,
    inputs:[{},{}],outputSlot:2,groups:[{groupId:'domum_ornamentum:panel',buttonId:0,variantCount:1}],currentGroup:'domum_ornamentum:panel',
    previewSource:'Domum_1.0.231_original_templates_current_materials',previewOffset:0,currentVariantIndex:0,variantPreviewTotal:1,
    groupPreviews:[{groupId:'domum_ornamentum:panel',buttonId:0,item}],variantPreviews:[{variantIndex:0,item}]}
  const seen=[],h=harness({resolveItemIcon:item=>{seen.push(item);return {verified:true,url:'blob:original-domum'}}})
  await h.ui.setAssets(modMenuReader()); h.ui.update({epoch:1,presentation:presentation({nativeMenu:menu})})
  const panel=h.document.querySelector('.native-menu-domum'),previews=panel.querySelectorAll('.native-domum-recipe-preview')
  assert.equal(panel.dataset.previewState,'available');assert.equal(previews.length,2)
  assert.equal(panel.querySelectorAll('.corti-menu-slot').length,39)
  assert.deepEqual(previews.map(p=>[p.style.left,p.style.top]),[['114px','36px'],['114px','82px']])
  assert(previews.every(p=>p.dataset.slot===undefined && p.dataset.selected==='true' && /不是可取物品/.test(p.title)))
  assert(seen.some(row=>row.snbt===item.snbt))
  const layout=nativeDomumMenuLayout(menu,UUID)
  assert.deepEqual(layout.previewBlits.slice(0,2).map(row=>[row.sourceX,row.sourceY]),[[0,202],[0,202]])
  menu.domum.groupPreviews[0].groupId='domum_ornamentum:other'
  assert.match(nativeDomumMenuLayout(menu,UUID).previewReason,/UNAVAILABLE/)
  menu.domum.playerUuid=OTHER
  assert.throws(()=>nativeDomumMenuLayout(menu,UUID),/STATE_UNAVAILABLE/)
  h.ui.dispose()
})

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
  assert.equal(panel.querySelector('.corti-menu-note'), null); assert.match(body.textContent, /窗口 1 · 状态编号 17/)
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
    assert.equal(assets.cookingPotReason,null);assert.equal(assets.cookingPotPlaceholderReason,null)
    for(const image of [NATIVE_COOKING_POT_GUI,NATIVE_COOKING_POT_GUI.emptyContainer]){
      assert.ok(assets.urls.has(image.path))
      const bytes=await readFile(join(directory,image.path)),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
      assert.equal(view.getUint32(16),image===NATIVE_COOKING_POT_GUI?256:16)
      assert.equal(view.getUint32(20),image===NATIVE_COOKING_POT_GUI?256:16)
    }
    assert.equal(assets.curiosReason,null); assert.equal(assets.domumReason,null)
    for(const image of [NATIVE_CURIOS_GUI,NATIVE_CURIOS_GUI.inventory,...NATIVE_DOMUM_GUIS]) {
      assert.ok(assets.urls.has(image.path))
      const bytes=await readFile(join(directory,image.path)),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
      assert.equal(view.getUint32(16),256); assert.equal(view.getUint32(20),256)
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

test('CookingPot original 45-slot layout keeps meal/container/output distinct and checks real server slot coordinates',()=>{
  const menu=cookingPotMenu(),layout=nativeCookingPotMenuLayout(menu,UUID),point=i=>[layout.slots[i].x,layout.slots[i].y,layout.slots[i].role]
  assert.equal(layout.slots.length,45)
  assert.deepEqual(point(0),[30,17,'ingredient']);assert.deepEqual(point(5),[66,35,'ingredient'])
  assert.deepEqual(point(6),[124,26,'cooked_meal_buffer']);assert.deepEqual(point(7),[92,55,'serving_container']);assert.deepEqual(point(8),[124,55,'served_output'])
  assert.deepEqual(point(9),[8,84,'inventory']);assert.deepEqual(point(35),[152,120,'inventory'])
  assert.deepEqual(point(36),[8,142,'hotbar']);assert.deepEqual(point(44),[152,142,'hotbar'])
  const slotLayout=layout.slots.map(({row,x,y})=>({slot:row.slot,x,y}))
  assert.equal(nativeCookingPotMenuLayout({...menu,slotLayout},UUID).slots.length,45)
  slotLayout[6].y=35;assert.throws(()=>nativeCookingPotMenuLayout({...menu,slotLayout},UUID),/SLOT_LAYOUT_MISMATCH/)
  for(const patch of [{playerUuid:OTHER},{windowId:0},{stateId:null},{menuType:'minecraft:crafting'},{slots:menu.slots.slice(1)}])
    assert.throws(()=>nativeCookingPotMenuLayout({...menu,...patch},UUID),/NATIVE_COOKING_POT_MENU_/)
})

test('CookingPot server has two actual progress ints, Java integer division and separate same-player heated/container inputs',()=>{
  const menu=cookingPotMenu(),native={playerUuid:UUID,source:'native_cooking_pot_menu',isHeated:false,container:null}
  assert.equal(nativeCookingPotState(menu,UUID).progress.reason,'NATIVE_COOKING_POT_DATA_UNAVAILABLE')
  assert.equal(nativeCookingPotState(menu,UUID).heat.reason,'NATIVE_COOKING_POT_HEAT_UNAVAILABLE')
  for(const [values,scaled,width]of [[[0,0],0,1],[[1,3],8,9],[[7,13],12,13],[[1,200],0,1],[[100,100],24,25],[[2147483647,2147483647],0,1]]){
    const state=nativeCookingPotState({...menu,dataValues:values,cookingPot:native},UUID)
    assert.equal(state.progress.available,true);assert.equal(state.progress.scaled,scaled);assert.equal(state.progress.arrow.width,width)
    assert.deepEqual([state.progress.arrow.x,state.progress.arrow.y,state.progress.arrow.sourceX,state.progress.arrow.sourceY,state.progress.arrow.height],[89,25,176,15,17])
    assert.equal(state.heat.available,true);assert.equal(state.heat.isHeated,false);assert.equal(state.container.available,true);assert.equal(state.container.item,null)
  }
  for(const values of [[1,2,0,0],[],[1],[1,2,3],['1',2],[1,NaN],[-1,200],[1,-2],[1.5,20],Array(2),[2147483648,1]])
    assert.equal(nativeCookingPotState({...menu,dataValues:values},UUID).progress.reason,'NATIVE_COOKING_POT_DATA_UNVERIFIED')
  assert.equal(nativeCookingPotState({...menu,dataValues:[200,100]},UUID).progress.reason,'NATIVE_COOKING_POT_PROGRESS_RANGE_UNSUPPORTED')
  assert.equal(nativeCookingPotState({...menu,dataValues:null,dataValuesError:'MENU_DATA_UNAVAILABLE'},UUID).progress.reason,'MENU_DATA_UNAVAILABLE')
  for(const invalid of [{...native,playerUuid:OTHER},{...native,source:'proxy'},{...native,isHeated:1}])
    assert.equal(nativeCookingPotState({...menu,cookingPot:invalid},UUID).heat.available,false)
  const actual={name:'minecraft:glass_bottle',count:1,snbt:'{id:"minecraft:glass_bottle",count:1}'}
  assert.strictEqual(nativeCookingPotState({...menu,cookingPot:{...native,isHeated:true,container:actual}},UUID).container.item,actual)
  assert.equal(nativeCookingPotState({...menu,cookingPot:{...native,container:{name:'bowl',count:1}}},UUID).container.available,false)
})

test('real mod CookingPot uses its original PNG/45 slots/empty atlas icon and complete component-sensitive items without vanilla layout',async()=>{
  const received=[],h=harness({resolveItemIcon:item=>{received.push(item);return{verified:true,url:'blob:actual-native-item'}}})
  await h.ui.setAssets(cookingPotReader())
  const meal={name:'farmersdelight:tomato_sauce',count:2,displayName:'本人原番茄酱',snbt:'{id:"farmersdelight:tomato_sauce",count:2,components:{"minecraft:custom_name":"本人原番茄酱"}}'}
  const bottle={name:'minecraft:glass_bottle',count:1,snbt:'{id:"minecraft:glass_bottle",count:1}'}
  const menu=cookingPotMenu({mayPickup:Array.from({length:45},(_,i)=>i!==6),cookingPot:{playerUuid:UUID,source:'native_cooking_pot_menu',isHeated:true,container:bottle},dataValues:[50,100]})
  menu.slots[6].item=meal
  h.ui.update({epoch:1,presentation:presentation({nativeMenu:menu})})
  const body=h.document.querySelector('[data-menu-body]'),panel=body.querySelector('.native-menu-cooking-pot'),slots=panel.querySelectorAll('.corti-menu-slot')
  assert.equal(panel.dataset.nativeGuiSource,NATIVE_COOKING_POT_GUI.path);assert.equal(panel.dataset.nativeGuiSha256,NATIVE_COOKING_POT_GUI.sha256)
  assert.equal(panel.style.width,'352px');assert.equal(panel.style.height,'332px');assert.equal(slots.length,45)
  assert.equal(slots[6].dataset.mayPickup,'false');assert.equal(slots[6].style.left,'246px');assert.equal(slots[6].style.top,'50px')
  assert.match(slots[6].title,/minecraft:glass_bottle/);assert.match(slots[6].title,/原模组禁止直接取出/);assert.ok(received.includes(meal));assert.equal(received.find(item=>item===meal).snbt,meal.snbt)
  assert.equal(slots[7].dataset.itemName,'');assert.equal(slots[7].dataset.modelState,'empty');assert.equal(slots[7].dataset.placeholderState,'verified')
  assert.equal(slots[7].querySelector('img').dataset.nativePlaceholderSource,NATIVE_COOKING_POT_GUI.emptyContainer.path)
  assert.match(slots[7].querySelector('img').alt,/当前槽没有物品/)
  assert.equal(panel.dataset.heatState,'heated');assert.equal(panel.dataset.progressState,'available')
  const heat=panel.querySelector('.native-menu-cooking-pot-heat'),progress=panel.querySelector('.native-menu-cooking-pot-progress')
  assert.deepEqual([heat.style.left,heat.style.top,heat.style.width,heat.style.height,heat.style.backgroundPosition],['94px','110px','34px','30px','-352px 0px'])
  assert.deepEqual([progress.style.left,progress.style.top,progress.style.width,progress.style.height,progress.style.backgroundPosition],['178px','50px','26px','34px','-352px -30px'])
  assert.equal(heat.style.backgroundSize,'512px 512px');assert.equal(progress.style.backgroundSize,'512px 512px')
  assert.equal(h.previews.length,0);assert.match(body.textContent,/只读/)
  for(const row of slots)assert.equal(row.listeners.size,0)
  const next=cookingPotMenu({stateId:18,cookingPot:{...menu.cookingPot,isHeated:false},dataValues:null});next.slots[7].item=bottle
  h.ui.update({epoch:1,presentation:presentation({nativeMenu:next})})
  const current=body.querySelector('.native-menu-cooking-pot')
  assert.equal(current.dataset.heatState,'not_heated');assert.equal(current.dataset.progressState,'unknown')
  assert.equal(current.querySelector('.native-menu-cooking-pot-heat'),null);assert.equal(current.querySelector('.native-menu-cooking-pot-progress'),null)
  const container=current.querySelectorAll('.corti-menu-slot')[7];assert.equal(container.dataset.itemName,bottle.name);assert.equal(container.dataset.placeholderState,undefined)
  assert.match(body.textContent,/NATIVE_COOKING_POT_DATA_UNAVAILABLE/)
  h.ui.dispose()
})

test('CookingPot source/SHA/priority/layout failures are explicit; missing heat never becomes unheated or inferred from progress',async()=>{
  const info=NATIVE_COOKING_POT_GUI
  for(const alter of [r=>{r.manifest.sources.push(r.manifest.sources.at(-1))},r=>{r.manifest.sources.at(-1).explicitOverride=true},
    r=>{r.manifest.sources.at(-1).sha256='other'},r=>{r.manifest.assets[info.path].source='other.jar'},r=>{r.manifest.assets[info.path].sha256='wrong'},
    r=>{r.bytes=async path=>{if(path===info.path)throw Error('NATIVE_RESOURCE_PRIORITY_UNRESOLVED:actual-pot');return new Uint8Array([137,80,78,71])}}]){
    const h=harness(),reader=cookingPotReader();alter(reader);await h.ui.setAssets(reader)
    h.ui.update({epoch:1,presentation:presentation({nativeMenu:cookingPotMenu()})})
    assert.equal(h.document.querySelector('.native-menu-cooking-pot'),null);assert.match(h.document.querySelector('[data-menu-body]').textContent,/NATIVE_COOKING_POT_GUI_(MOD|TEXTURE)_UNVERIFIED|NATIVE_RESOURCE_PRIORITY_UNRESOLVED:actual-pot/)
    h.ui.dispose()
  }
  const h=harness();await h.ui.setAssets(cookingPotReader())
  h.ui.update({epoch:1,presentation:presentation({nativeMenu:cookingPotMenu({dataValues:[100,100]})})})
  assert.equal(h.document.querySelector('.native-menu-cooking-pot').dataset.heatState,'unknown')
  assert.equal(h.document.querySelector('.native-menu-cooking-pot-heat'),null);assert.match(h.document.querySelector('[data-menu-body]').textContent,/HEAT_UNAVAILABLE/)
  h.ui.update({epoch:1,presentation:presentation({nativeMenu:cookingPotMenu({slotLayout:[]})})})
  assert.equal(h.document.querySelector('.native-menu-cooking-pot'),null);assert.match(h.document.querySelector('[data-menu-body]').textContent,/SLOT_LAYOUT_MISMATCH/)
  h.ui.dispose()
})

test('actual FOOD summaries enrich readonly text while the complete SNBT and registry name remain resolver inputs',()=>{
  const document=shell(),slot=document.createElement('div'),item={name:'minecraft:beef',count:1,snbt:'{id:"minecraft:beef",count:1}',
    food:{nutrition:3,saturation:1.8,canAlwaysEat:false,eatSeconds:1.6}}
  let seen
  renderNativeItemSlot(document,slot,item,{resolveItemIcon:value=>{seen=value;return null}})
  assert.strictEqual(seen,item);assert.equal(slot.dataset.itemName,'minecraft:beef');assert.equal(seen.snbt,item.snbt)
  assert.match(slot.title,/原生营养 3/);assert.match(slot.title,/食用 1.6 秒/)
  renderNativeItemSlot(document,slot,{...item,food:{nutrition:'full'}})
  assert.doesNotMatch(slot.title,/原生营养/)
})

test('furnace bridge read failures are retained and do not turn a missing data array into a full fire',()=>{
  const state=nativeFurnaceProgress(containerMenu('minecraft:furnace',39,{dataValues:null,dataValuesError:'MENU_DATA_REFLECTION_UNAVAILABLE'}),UUID)
  assert.deepEqual(state,{available:false,reason:'MENU_DATA_REFLECTION_UNAVAILABLE'})
})

test('native receipt projection preserves actual cooking data, meal FOOD and separate player inventory through the readonly UI',async()=>{
  const {createNativePlayerPresentation}=await import('../native-world-preview-host.mjs')
  const rice={id:'farmersdelight:cooked_rice',count:1,displayName:'实际米饭',
    snbt:'{id:"farmersdelight:cooked_rice",count:1,components:{"minecraft:food":{nutrition:4,saturation:2.4f}}}',
    food:{nutrition:4,saturation:2.4,canAlwaysEat:false,eatSeconds:1.6}}
  const bowl={id:'minecraft:bowl',count:1,snbt:'{id:"minecraft:bowl",count:1}'}
  const menu=cookingPotMenu(),receipt={...menu,slots:menu.slots.map(()=>null),
    playerInventory:Array(46).fill(null),dataValues:[37,100],dataValuesSource:'server_menu_data_slots',
    slotLayout:nativeCookingPotMenuLayout(menu,UUID).slots.map(({row,x,y})=>({slot:row.slot,x,y})),
    cookingPot:{playerUuid:UUID,source:'native_cooking_pot_menu',isHeated:true,container:bowl},
    mayPickup:Array.from({length:45},(_,slot)=>slot!==6)}
  receipt.slots[8]=rice;receipt.playerInventory[36]=bowl
  const projected=createNativePlayerPresentation({playerUuid:UUID,menu:receipt})
  assert.deepEqual(projected.nativeMenu.dataValues,[37,100]);assert.equal(projected.nativeMenu.dataValuesSource,'server_menu_data_slots')
  assert.equal(projected.nativeMenu.slots[8].item.snbt,rice.snbt);assert.deepEqual(projected.nativeMenu.slots[8].item.food,rice.food)
  assert.equal(projected.inventory.slots.length,46);assert.equal(projected.inventory.slots[36].item.name,'minecraft:bowl')
  const h=harness({resolveItemIcon:()=>null});await h.ui.setAssets(cookingPotReader())
  h.ui.update({epoch:1,presentation:presentation(projected)})
  const panel=h.document.querySelector('.native-menu-cooking-pot'),slots=panel.querySelectorAll('.corti-menu-slot')
  assert.equal(panel.dataset.heatState,'heated');assert.equal(panel.dataset.progressState,'available')
  assert.equal(slots[8].dataset.itemName,rice.id);assert.match(slots[8].title,/实际米饭/);assert.match(slots[8].title,/原生营养 4/)
  assert.equal(slots[8].style.left,'246px');assert.equal(slots[8].style.top,'108px');assert.equal(slots[6].dataset.mayPickup,'false')
  const foreign=createNativePlayerPresentation({playerUuid:UUID,menu:{...receipt,cookingPot:{...receipt.cookingPot,playerUuid:OTHER}}})
  assert.equal(foreign.nativeMenu.cookingPot,undefined)
  h.ui.update({epoch:1,presentation:presentation(foreign)})
  assert.equal(h.document.querySelector('.native-menu-cooking-pot').dataset.heatState,'unknown')
  assert.equal(h.document.querySelector('.native-menu-cooking-pot-heat'),null);h.ui.dispose()
})

test('original cooking-pot empty-container icon decode failure remains a literal empty slot and cannot damage a replacement window',async()=>{
  const h=harness();await h.ui.setAssets(cookingPotReader())
  h.ui.update({epoch:1,presentation:presentation({nativeMenu:cookingPotMenu()})})
  const oldSlot=h.document.querySelector('.native-menu-cooking-pot').querySelectorAll('.corti-menu-slot')[7],image=oldSlot.querySelector('img')
  image.dispatch('error')
  assert.equal(oldSlot.dataset.itemName,'');assert.equal(oldSlot.dataset.modelState,'empty')
  assert.equal(oldSlot.dataset.placeholderState,'unavailable');assert.match(oldSlot.title,/NATIVE_COOKING_POT_EMPTY_ICON_DECODE_FAILED/)
  assert.equal(oldSlot.querySelector('img'),null)
  const next=cookingPotMenu({stateId:19});next.slots[7].item={name:'minecraft:bowl',count:1,snbt:'{id:"minecraft:bowl",count:1}'}
  h.ui.update({epoch:1,presentation:presentation({nativeMenu:next})});image.dispatch('error')
  const current=h.document.querySelector('.native-menu-cooking-pot').querySelectorAll('.corti-menu-slot')[7]
  assert.equal(current.dataset.itemName,'minecraft:bowl');assert.equal(current.dataset.placeholderReason,undefined)
  assert.doesNotMatch(current.title,/EMPTY_ICON_DECODE_FAILED/);h.ui.dispose()
})
