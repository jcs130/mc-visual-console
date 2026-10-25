import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createNativeAssetCache } from '../../src/native-viewer/native-asset-cache.js'
import { NativeAssetReader, NativeModelLoader } from '../../src/native-viewer/model-loader.js'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
function cacheFixture () {
  const rows = new Map()
  const cache = { async match(key) { return rows.get(typeof key === 'string' ? key : key.url)?.clone() },
    async put(key, value) { rows.set(key, value.clone()) }, async delete(key) { return rows.delete(typeof key === 'string' ? key : key.url) },
    async keys() { return [...rows.keys()].map(url => ({ url })) } }
  return { rows, cache, storage: { async open() { return cache } } }
}
test('verified original assets survive a new viewer/channel; corrupt data is discarded and no live/private data is cached', async () => {
  const f = cacheFixture(), bytes = new TextEncoder().encode('original bytes'), entry = { bytes: bytes.length, sha256: sha(bytes) }
  let reads = 0
  const options = { storage: f.storage, origin: 'https://viewer.example', maxEntries: 2 }
  const read = async () => { reads++; return bytes.buffer }
  const first = createNativeAssetCache(options)
  await first('assets/minecraft/models/block/stone.json', entry, read); await first.flush()
  const second = createNativeAssetCache(options)
  await second('assets/minecraft/models/block/stone.json', entry, read); await second.flush()
  assert.equal(reads, 1)
  for (const path of ['status.json','events','api/server-items','api/bundled-appearances/assets/private.png','assets/upload/textures/a.png']) await createNativeAssetCache(options)(path, entry, read)
  assert.equal(f.rows.size, 1); assert.equal(reads, 6)
  await f.cache.put([...f.rows.keys()][0], new Response('corrupt'))
  const repaired = createNativeAssetCache(options)
  await repaired('assets/minecraft/models/block/stone.json', entry, read); await repaired.flush()
  assert.equal(reads, 7)
  for (let n = 0; n < 4; n++) {
    const data = new TextEncoder().encode('original ' + n)
    const next = createNativeAssetCache(options)
    await next('assets/minecraft/models/block/other.json', { bytes: data.length, sha256: sha(data) }, async () => data.buffer); await next.flush()
  }
  assert.equal(f.rows.size, 2, 'cache eviction bounds storage across many scene switches')
})

test('slow disk persistence never blocks foreground reads; background writes remain bounded and hash checked', { timeout: 2000 }, async () => {
  const f = cacheFixture(), put = f.cache.put, rows = []
  let release
  const gate = new Promise(resolve => { release = resolve })
  f.cache.put = async (...args) => { await gate; return put(...args) }
  const cache = createNativeAssetCache({ storage: f.storage, origin: 'https://viewer.example', maxEntries: 2, maxPendingWrites: 2 })
  for (let n = 0; n < 5; n++) {
    const bytes = new TextEncoder().encode('texture ' + n), entry = { bytes: bytes.length, sha256: sha(bytes) }
    rows.push(entry)
    assert.equal(await cache('assets/minecraft/textures/block/stone.png', entry, async () => bytes), bytes)
  }
  assert.equal(f.rows.size, 0, 'all reads completed while the disk is still blocked')
  release(); await cache.flush()
  assert.equal(f.rows.size, 2, 'overflow only skips optional persistence')
  assert.deepEqual([...f.rows.keys()].map(key => key.split('/').at(-1)), rows.slice(0, 2).map(row => row.sha256))
  const invalid = new Uint8Array([9,9])
  await cache('assets/minecraft/textures/block/stone.png', {bytes:2,sha256:sha(new Uint8Array([1,2]))}, async()=>invalid)
  await cache.flush(); assert.equal(f.rows.size, 2, 'unverified bytes never reach disk')
})
test('blocked cache storage and oversized files preserve the exact normal download path', async () => {
  const bytes = new Uint8Array([1,2]), entry = { bytes: bytes.length, sha256: sha(bytes) }
  const read = async () => bytes
  assert.equal(await createNativeAssetCache({ storage: { open() { throw Error('denied') } }, origin: 'https://viewer.example' })('assets/minecraft/models/a.json', entry, read), bytes)
  const f = cacheFixture()
  await createNativeAssetCache({ storage: f.storage, origin: 'https://viewer.example', maxFileBytes: 1 })('assets/minecraft/models/a.json', entry, read)
  assert.equal(f.rows.size, 0)
})
test('model prefetch runs bounded dependency chains in parallel, reuses checked bytes and leaves errors explicit', async () => {
  const files = new Map(), add = (path, data) => files.set('assets/test/' + path, Buffer.from(JSON.stringify(data)))
  const groups = [], definitions = new Map()
  for (let n = 0; n < 12; n++) {
    groups.push({ stateId: n, positions: [0,64,0] }); definitions.set(n, { stateId: n, name: 'test:b' + n, properties: {}, renderShape: 'MODEL' })
    add('blockstates/b' + n + '.json', { variants: { '': { model: 'test:m' + n } } })
    add('models/m' + n + '.json', { textures: { all: 'test:block/t' + n }, elements: [{ from:[0,0,0],to:[16,16,16],faces:{ up:{texture:'#all'} } }] })
    files.set('assets/test/textures/block/t' + n + '.png', Buffer.from('checked texture ' + n))
  }
  let release, first = 0, active = 0, max = 0, reads = 0
  const gate = new Promise(resolve => { release = resolve })
  const manifest = { minecraftVersion:'1.21.1',assetIntegrityVerified:true,assets:Object.fromEntries([...files].map(([path,bytes])=>[path,{bytes:bytes.length,sha256:sha(bytes)}])) }
  const reader = new NativeAssetReader(manifest, async path => {
    reads++; active++; max = Math.max(max, active)
    try { if (path.includes('/blockstates/')) { first++; await gate } return files.get(path) } finally { active-- }
  })
  const loader = new NativeModelLoader(reader), work = loader.prefetchBlockModels(groups, definitions, { concurrency: 4 })
  for (let n=0;n<30&&first<4;n++) await new Promise(resolve=>setImmediate(resolve))
  assert.equal(first, 4, 'independent block families must not serialize WAN round trips');release();await work
  assert.equal(max, 4);assert.equal(reads, files.size)
  await loader.prefetchBlockModels(groups, definitions);assert.equal(reads, files.size)
  await loader.prefetchBlockModels([{stateId:99,positions:[0,0,0]}],new Map([[99,{name:'test:missing',renderShape:'MODEL'}]]))
  await assert.rejects(loader.blockstate('test:missing'), /NATIVE_ASSET_MISSING/)
  await loader.dispose()
})
