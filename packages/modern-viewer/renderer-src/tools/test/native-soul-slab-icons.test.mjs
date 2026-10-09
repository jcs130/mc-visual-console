import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { parseNativeItemStack } from '../../src/native-viewer/native-item-stack.js'
import { NativeItemIcons } from '../../src/native-viewer/native-item-icons.js'
import { nativeSoulSlabEligible, nativeSoulSlabState, prepareNativeSoulSlabIcon,
  nativeSoulSlabAnimationStyle } from '../../src/native-viewer/native-soul-slab-icons.js'
import { animationFrames, frameAt } from '../../src/native-viewer/texture-animation.js'
const raw = (name = 'smart_slab_init', components = '') => ({ name: `touhou_little_maid:${name}`, count: 1,
  snbt: `{id:"touhou_little_maid:${name}",count:1,components:{${components}}}` })
const stack = (...args) => parseNativeItemStack(raw(...args))

test('INIT owner and HAS_MAID stored data keep their own model and native foil state', () => {
  const initial = stack('smart_slab_init', '"touhou_little_maid:init_maid_owner":[I;1,2,3,4]')
  assert.deepEqual(nativeSoulSlabState(initial), { modelId: 'touhou_little_maid:item/smart_slab_init', foil: true })
  assert.deepEqual(nativeSoulSlabState(stack('smart_slab_has_maid', '"touhou_little_maid:maid_info":{ModelId:"maid:model",Owner:[I;1,2,3,4]}')),
    { modelId: 'touhou_little_maid:item/smart_slab_has_maid', foil: true })
  assert.equal(nativeSoulSlabState(stack('smart_slab_init', '"minecraft:enchantment_glint_override":0b')).foil, false)
  assert.equal(nativeSoulSlabState(stack('smart_slab_init', '"!minecraft:enchantment_glint_override":{}')).foil, true)
  for (const name of ['touhou_little_maid:smart_slab_empty', 'other:smart_slab_init', 'touhou_little_maid:smart_slab']) assert.equal(nativeSoulSlabEligible(name), false)
})
test('unknown visual inputs and malformed complete-stack state never borrow a soul slab icon', () => {
  for (const components of ['"minecraft:custom_model_data":1','"minecraft:profile":{}','"mod:unknown":{}',
    '"minecraft:enchantment_glint_override":{type:"byte",value:0}', '"touhou_little_maid:maid_info":{}']) {
    assert.throws(() => nativeSoulSlabState(stack('smart_slab_init', components)), /COMPONENT_UNSUPPORTED|GLINT_STATE_INVALID/)
  }
  assert.throws(() => nativeSoulSlabState({ ...stack(), count: 2 }), /STACK_INVALID/)
  assert.throws(() => nativeSoulSlabState({ ...stack(), components: [] }), /STACK_INVALID/)
})
test('seven frames advance every two native texture ticks, loop at 700ms and share one epoch across remounts', () => {
  const native = animationFrames({ animation: { frametime: 2 } }, 16, 112)
  for (let tick = 0; tick < 42; tick++) assert.equal(frameAt(native,tick).index, Math.floor(tick / 2) % 7)
  const animation = { kind: 'native-soul-slab-sheet-v1', frameCount: 7, frameTicks: 2, tickMs: 50,
    frameWidth: 16, frameHeight: 16, sheetHeight: 112, epochMs: 1000 }
  assert.deepEqual(nativeSoulSlabAnimationStyle(animation, 2250), {
    height: '224px', animation: 'corti-native-soul-slab 700ms steps(7,end) infinite', animationDelay: '-550ms' })
  assert.equal(nativeSoulSlabAnimationStyle(animation,1700).animationDelay,'0ms')
  for (const patch of [{ frameCount: 8 }, { sheetHeight: 113 }, { epochMs: Infinity }, { kind: 'other' }]) {
    assert.throws(() => nativeSoulSlabAnimationStyle({ ...animation, ...patch }), /ANIMATION_INVALID/)
  }
})
const directory = process.env.NATIVE_GUIDE_ASSET_DIR
async function reader() {
  const manifest = JSON.parse(await readFile(join(directory,'native-assets.json'),'utf8'))
  return new NativeAssetReader(manifest,path => readFile(join(directory,path)))
}
test('locked original models select their real animated sheet and explicitly retain the unavailable atlas-dependent glint',
  { skip: !directory }, async () => {
    const r = await reader()
    for (const name of ['smart_slab_init','smart_slab_has_maid']) {
      const plan = await prepareNativeSoulSlabIcon(r,stack(name))
      assert.equal(plan.modelId,`touhou_little_maid:item/${name}`)
      assert.equal(plan.animation.frameCount,7); assert.equal(plan.foil,true)
      assert.equal(plan.glintVerified,false); assert.equal(plan.pixelParityVerified,false)
      assert.equal(plan.effectUnavailableReason,'NATIVE_GUI_GLINT_ATLAS_UV_UNAVAILABLE')
      assert.equal(createHash('sha256').update(Buffer.from(await plan.blob.arrayBuffer())).digest('hex'),
        'e1f986ff701bdc2fa57916e3cdfd0ce17ad66e7069e3580ff9b1ca6a88344cbd')
    }
    const plan = await prepareNativeSoulSlabIcon(r,stack('smart_slab_init','"minecraft:enchantment_glint_override":false'))
    assert.equal(plan.foil,false); assert.equal(plan.effectUnavailableReason,null)
  })
test('original model, PNG, metadata, source and asset-reader integrity failures remain closed',
  { skip: !directory }, async () => {
    for (const mutate of [r => { r.manifest.sources.find(x => x.name.startsWith('touhoulittlemaid-')).sha256 = 'changed' },
      r => { r.manifest.sources.find(x => x.name.startsWith('touhoulittlemaid-')).explicitOverride = true },
      r => { r.manifest.clientJarSha256 = 'changed' },
      r => { r.manifest.assets['assets/touhou_little_maid/models/item/smart_slab_init.json'].sha256 = 'changed' },
      r => { delete r.manifest.assets['assets/touhou_little_maid/textures/item/smart_slab_has_maid.png.mcmeta'] },
      r => { r.manifest.assets['assets/touhou_little_maid/textures/item/smart_slab_has_maid.png'].variants = [{ sha256: 'other' }] },
      r => { r.bytes = async () => { throw Error('NATIVE_ASSET_HASH_MISMATCH') } }]) {
      const r = await reader(); mutate(r)
      await assert.rejects(prepareNativeSoulSlabIcon(r,stack()), /UNVERIFIED|HASH_MISMATCH/)
    }
  })
test('same-player full SNBT caches the original sheet, keeps owner identities separate and revokes URLs',
  { skip: !directory }, async () => {
    let created = 0, changed; const revoked = [], r = await reader()
    const icons = new NativeItemIcons(r,{ createUrl: () => `blob:soul-${++created}`, revokeUrl: url => revoked.push(url), onChange: () => changed?.() })
    const load = async item => {
      const done = new Promise(resolve => { changed = resolve })
      assert.equal(icons.resolve(item),null); await done; return icons.resolve(item)
    }
    const initial = raw('smart_slab_init','"touhou_little_maid:init_maid_owner":[I;1,2,3,4]')
    const a = await load(initial)
    assert.equal(a.kind,'native-soul-slab-sheet'); assert.equal(icons.resolve(initial),a)
    const b = await load(raw('smart_slab_init','"touhou_little_maid:init_maid_owner":[I;4,3,2,1]'))
    assert.notEqual(a.url,b.url); assert.equal(a.animation.epochMs,b.animation.epochMs)
    assert.equal(icons.resolve({ ...initial,snbt: initial.snbt.replace('count:1','count:2') }),null)
    icons.dispose(); assert.deepEqual(revoked,['blob:soul-1','blob:soul-2'])
  })
