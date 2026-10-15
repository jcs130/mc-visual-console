import test from 'node:test'
import assert from 'node:assert/strict'
import { createNativeEnvironment, biomeAt, blendedBiomeColor, blockTint } from '../../src/native-viewer/native-environment.js'

const colormaps = Object.fromEntries(['grass', 'foliage'].map(kind => [kind, Uint8Array.from({ length: 256 * 256 * 4 }, (_, i) => (i * 13 + (kind === 'grass' ? 17 : 91)) % 256)]))
const fixture = (seed = '-12345678987654321') => ({ biomeSeed: seed,
  biomes: [{ id: 1, temperature: .5, downfall: .8, effects: { water_color: 0x128acf, grass_color_modifier: 'dark_forest' } },
    { id: 2, temperature: .8, downfall: .2, effects: { water_color: 0x9351c4, foliage_color: 0x16aa82 } }],
  biomeGrid: { x: -4, y: -2, z: -4, width: 9, height: 8, depth: 9, worldMinY: -2, worldMaxY: 5, ids: Array.from({ length: 648 }, (_, i) => 1 + (i % 3 === 0 ? 1 : 0)) } })

test('snapshot memoization preserves every exact fuzzy biome, blend radius and tint provider result', () => {
  for (const seed of ['0', '-1', '9223372036854775807', '-12345678987654321']) {
    const snapshot = fixture(seed), cached = createNativeEnvironment(snapshot, colormaps)
    for (let x = -5; x <= 5; x++) for (const y of [-19, 0, 11, 35]) {
      const p = { x, y, z: 2 - x }
      assert.equal(cached.biomeAt(p), biomeAt(snapshot, p))
      for (const kind of ['water', 'grass', 'foliage']) for (const radius of [0, 2, 3])
        assert.equal(cached.blendedBiomeColor(p, kind, radius), blendedBiomeColor(snapshot, p, kind, colormaps, radius))
      for (const state of [{ name: 'minecraft:oak_leaves' }, { name: 'minecraft:grass_block' }, { name: 'minecraft:tall_grass', properties: { half: 'upper' } }, { name: 'minecraft:birch_leaves' }])
        assert.equal(cached.blockTint(state, p, 0), blockTint(snapshot, state, p, 0, colormaps))
    }
  }
})

test('cache entries are bounded, disposable and isolated across received seed, effects and grid changes', () => {
  const a = fixture(), first = createNativeEnvironment(a, colormaps, { maxEntries: 32 })
  for (let x = -4; x <= 4; x++) first.blendedBiomeColor({ x, y: 3, z: 0 }, 'water')
  assert.ok(first.size <= 32)
  const b = fixture('17'); b.biomes[0].effects.water_color = 0xff6611; b.biomeGrid.ids.fill(1)
  const second = createNativeEnvironment(b, colormaps), p = { x: 0, y: 3, z: 0 }
  assert.equal(second.blendedBiomeColor(p, 'water'), blendedBiomeColor(b, p, 'water', colormaps))
  assert.notEqual(first.blendedBiomeColor(p, 'water'), second.blendedBiomeColor(p, 'water'))
  for (const property of ['x', 'y', 'z', 'worldMinY', 'worldMaxY']) {
    const changed = fixture(); changed.biomeGrid[property]++
    const next = createNativeEnvironment(changed, colormaps)
    for (const kind of ['water', 'grass', 'foliage'])
      assert.equal(next.blendedBiomeColor(p, kind), blendedBiomeColor(changed, p, kind, colormaps), property)
  }
  first.clear(); assert.equal(first.size, 0)
  assert.equal(first.blendedBiomeColor(p, 'water'), blendedBiomeColor(a, p, 'water', colormaps))
  assert.throws(() => createNativeEnvironment(a, colormaps, { maxEntries: 0 }), /CACHE_LIMIT/)
})

test('memoization retains explicit unavailable boundaries and unsupported distinctions', () => {
  const snapshot = fixture(), cached = createNativeEnvironment(snapshot, colormaps), p = { x: 0, y: 3, z: 0 }
  assert.throws(() => cached.biomeAt({ ...p, x: 1000 }), /OUTSIDE_RECEIVED_GRID/)
  assert.throws(() => cached.blendedBiomeColor(p, 'water', 4), /RADIUS_INVALID/)
  assert.throws(() => cached.blockTint({ name: 'mod:oak_leaves' }, p, 0), /PROVIDER_UNSUPPORTED/)
  const unsupported = fixture(); unsupported.biomes.forEach(b => { b.effects.grass_color_modifier = 'swamp' })
  assert.throws(() => createNativeEnvironment(unsupported, colormaps).blendedBiomeColor(p, 'grass'), /UNSUPPORTED/)
  const missing = fixture(); missing.biomeGrid.ids.fill(99)
  assert.throws(() => createNativeEnvironment(missing, colormaps).biomeAt(p), /NOT_RECEIVED/)
  assert.throws(() => createNativeEnvironment({ ...snapshot, biomeSeed: 'bad' }, colormaps).biomeAt(p), /SEED_UNAVAILABLE/)
})
