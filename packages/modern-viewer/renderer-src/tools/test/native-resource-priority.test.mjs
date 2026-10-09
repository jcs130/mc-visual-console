import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { NATIVE_BASE_TEXTURE_PRIORITY, verifiedNativeBasePriority } from '../../src/native-viewer/native-resource-priority.js'

test('only two audited vanilla/locked-mod conflicts resolve; user packs, changed sources and another variant remain closed', async () => {
  const dir = process.env.NATIVE_GUIDE_ASSET_DIR
  assert.ok(dir)
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'native-assets.json'), 'utf8'))
  for (const filename of Object.keys(NATIVE_BASE_TEXTURE_PRIORITY)) {
    const reader = new NativeAssetReader(manifest, filename => fs.readFile(path.join(dir, filename)))
    assert.equal(verifiedNativeBasePriority(manifest, filename, manifest.assets[filename]), true)
    assert.ok((await reader.bytes(filename)).length > 0)
    for (const edit of [copy => { delete copy.assets[filename].priorityResolution },
      copy => { copy.sources.find(source => source.name.startsWith('neoforge-21.1.248-universal.jar')).sha256 = '0'.repeat(64) },
      copy => { copy.sources.push({ name: 'user-pack.zip', explicitOverride: true }) },
      copy => { copy.assets[filename].variants.push({ source: 'other.jar', sha256: '0'.repeat(64) }) }]) {
      const copy = structuredClone(manifest); edit(copy)
      await assert.rejects(new NativeAssetReader(copy, () => { throw Error('must not read') }).bytes(filename), /RESOURCE_PRIORITY_UNRESOLVED/)
    }
  }
  const filename = 'assets/unknown/textures/fake.png', copy = structuredClone(manifest)
  copy.assets[filename] = { ...copy.assets[Object.keys(NATIVE_BASE_TEXTURE_PRIORITY)[0]] }
  await assert.rejects(new NativeAssetReader(copy, () => { throw Error('must not read') }).bytes(filename), /RESOURCE_PRIORITY_UNRESOLVED/)
})
