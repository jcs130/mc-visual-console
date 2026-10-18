import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import * as THREE from 'three'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { NativeItemIcons } from '../../src/native-viewer/native-item-icons.js'
import { prepareNativeHeldItem, buildNativeHeldItemObject, disposeNativeHeldItemObject } from '../../src/native-viewer/native-held-items.js'
import { BundledYsmHeldItems } from '../../src/native-viewer/native-bundled-ysm-items.js'
import { pngRgba } from './fixtures/png-rgba.mjs'

const root = new URL('../../../asset-packs/vanilla-1.21.1/', import.meta.url)
const uuid = '01234567-89ab-cdef-0123-456789abcdef'
const item = (name, components = '') => ({ name, count: 1, snbt: `{id:"${name}",count:1${components ? `,components:{${components}}` : ''}}` })
const decode = async bytes => pngRgba(bytes)
const texture = async bytes => { const { width, height } = pngRgba(bytes); return new THREE.Texture({ width, height }) }
async function reader () {
  return new NativeAssetReader(JSON.parse(await fs.readFile(new URL('native-assets.json', root), 'utf8')), p => fs.readFile(new URL(p, root)))
}
async function settle (done) {
  const start = Date.now()
  while (!done()) { if (Date.now() - start > 3000) assert.fail('item did not settle'); await new Promise(resolve => setImmediate(resolve)) }
}
function frame (arm = 'right') {
  return { playerUuid: uuid, self: { uuid, entityId: 7, health: 20, mainArm: arm, quickBarSlot: 0 },
    inventory: { playerUuid: uuid, windowId: 0, hotbarStart: 36, offhandSlot: 45, selectedHotbarSlot: 0,
      slots: Array.from({ length: 46 }, (_, slot) => ({ slot, item: slot === 36 ? item('minecraft:iron_sword', '"minecraft:enchantments":{levels:{"minecraft:sharpness":1}}') : slot === 45 ? item('minecraft:shield') : null })) } }
}

test('original 1.21.1 shield GUI uses native plate and handle, not text or an invented sprite', async () => {
  let renders = 0
  const icons = new NativeItemIcons(await reader(), { createUrl: () => 'blob:shield', revokeUrl () {}, shieldRendererOptions: {
    loadTexture: texture, createRenderer: () => ({ clear () {}, render (scene) { renders++; assert.equal(scene.children[0].children.length, 12) }, dispose () {} }),
    encode: async () => new Blob([new Uint8Array([1])], { type: 'image/png' }) } })
  const shield = item('minecraft:shield'); icons.resolve(shield)
  await settle(() => !icons.active)
  const result = icons.resolve(shield)
  assert.equal(result?.kind, 'native-builtin-shield-gui', icons.reason(shield)); assert.equal(renders, 1)
  assert.ok(result.sourcePaths.includes('assets/minecraft/textures/entity/shield_base_nopattern.png'))
  assert.deepEqual(result.guiTransform.rotation, [15, -25, -5]); icons.dispose()
})

test('both original shield hand transforms keep the 12 native faces and reject unsupported banner appearance', async () => {
  for (const arm of ['left', 'right']) {
    const plan = await prepareNativeHeldItem(await reader(), item('minecraft:shield'), arm, { readPixels: decode })
    assert.equal(plan.faces.length, 12); assert.equal(plan.geometry, 'Minecraft 1.21.1 ShieldModel plate and handle')
    assert.deepEqual(plan.transform.rotation, arm === 'left' ? [0, -90, -0] : [0, 90, 0])
    const textures = new Map(await Promise.all([...plan.textureLayers].map(async ([path, row]) => [path, await texture(row.bytes)])))
    const object = buildNativeHeldItemObject(plan, textures); assert.equal(object.children.length, 12)
    disposeNativeHeldItemObject(object); for (const t of textures.values()) t.dispose()
  }
  await assert.rejects(prepareNativeHeldItem(await reader(), item('minecraft:shield', '"minecraft:base_color":"red"'), 'left', { readPixels: decode }), /VISUAL_COMPONENT_UNSUPPORTED/)
})

test('observed furnace and ordinary bucket/saddle stacks retain their original vanilla appearance in either hand', async () => {
  for (const name of ['furnace', 'blast_furnace', 'smoker', 'bucket', 'saddle']) {
    const plan = await prepareNativeHeldItem(await reader(), item('minecraft:' + name), 'right', { readPixels: decode })
    assert.ok(plan.faces.length > 0); assert.ok(plan.sourcePaths.some(path => path.endsWith(`/item/${name}.json`)))
  }
})

test('YSM holds observed enchanted main item and shield independently of motion freshness, swaps hands and clears removed stacks', async () => {
  const model = { bones: new Map(['RightHandLocator', 'LeftHandLocator'].map(name => [name, new THREE.Group()])) }
  const held = new BundledYsmHeldItems(await reader(), model, uuid, texture, { readPixels: decode })
  for (const arm of ['right', 'left']) {
    held.apply(frame(arm)); await settle(() => [...held.hands.values()].every(row => row.status !== 'loading'))
    const state = held.state(), off = arm === 'right' ? 'left' : 'right'
    assert.equal(state.hands[arm].status, 'ready', JSON.stringify(state)); assert.equal(state.hands[arm].visible, true)
    assert.equal(state.hands[arm].effectUnavailableReason, 'NATIVE_HELD_GLINT_ATLAS_UV_UNAVAILABLE')
    assert.equal(state.hands[off].name, 'minecraft:shield'); assert.equal(state.hands[off].visible, true)
    assert.equal(held.hands.get(arm).mount.parent, model.bones.get(arm === 'right' ? 'RightHandLocator' : 'LeftHandLocator'))
  }
  const dead = frame(); dead.self.health = 0; held.apply(dead); assert.equal(held.state().available, false)
  const empty = frame(); empty.inventory.slots.forEach(row => { row.item = null }); held.apply(empty)
  assert.equal(held.state().available, false); assert.equal(held.state().hands.left.status, 'empty')
  held.apply(frame()); held.apply({ ...frame(), playerUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
  assert.deepEqual(held.state().hands, {}); held.dispose()
})
