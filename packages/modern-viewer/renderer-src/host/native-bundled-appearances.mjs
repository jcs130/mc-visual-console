import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { BUNDLED_SCHEMA, BUNDLED_LIMITS, validateBundledCatalog } from '../src/native-viewer/native-bundled-contract.js'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
// Retain a bounded verified snapshot. Later filesystem replacement cannot alter
// either served bytes or the build digest, and requests never resolve paths.
export async function loadBundledAppearances (catalogFile = '', { limits = BUNDLED_LIMITS } = {}) {
  const empty = reason => {
    const metadata = { schema: BUNDLED_SCHEMA, source: 'plugin_bundled', available: false, reason, assets: {}, appearances: [] }
    return { metadata, sha256: sha(JSON.stringify(metadata)), read: () => null }
  }
  if (!catalogFile) return empty('BUNDLED_APPEARANCES_NOT_CONFIGURED')
  try {
    const file = path.resolve(catalogFile), root = path.dirname(file)
    const check = async (target, maximum) => {
      const stat = await fs.lstat(target)
      if (stat.isSymbolicLink() || !stat.isFile()) throw Error('BUNDLED_ASSET_LINK_UNSUPPORTED')
      if (stat.size < 1 || stat.size > maximum) throw Error('BUNDLED_ASSET_TOO_LARGE')
      return stat
    }
    // Reject junctions/symlinks in the entire configured package path too.
    let ancestor = root
    while (ancestor !== path.dirname(ancestor)) {
      if ((await fs.lstat(ancestor)).isSymbolicLink()) throw Error('BUNDLED_ASSET_LINK_UNSUPPORTED')
      ancestor = path.dirname(ancestor)
    }
    await check(file, limits.catalog)
    const catalogBytes = await fs.readFile(file)
    if (catalogBytes.length > limits.catalog) throw Error('BUNDLED_CATALOG_TOO_LARGE')
    const catalog = validateBundledCatalog(JSON.parse(catalogBytes.toString('utf8')), { limits }), files = new Map()
    const digest = createHash('sha256').update(catalogBytes)
    for (const [relative, entry] of Object.entries(catalog.assets).sort(([a], [b]) => a.localeCompare(b))) {
      let target = root
      for (const part of relative.split('/').slice(0, -1)) {
        target = path.join(target, part)
        const stat = await fs.lstat(target)
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('BUNDLED_ASSET_LINK_UNSUPPORTED')
      }
      target = path.join(root, relative)
      await check(target, limits.file)
      const bytes = await fs.readFile(target)
      if (bytes.length !== entry.bytes || sha(bytes) !== entry.sha256) throw Error('BUNDLED_ASSET_HASH_MISMATCH')
      digest.update(relative).update(bytes); files.set(relative, bytes)
    }
    const metadata = { ...catalog, available: true, reason: null }
    return { metadata, sha256: digest.digest('hex'), read: relative => files.has(relative) ? Buffer.from(files.get(relative)) : null }
  } catch (error) {
    // Optional plugin assets must never take down the original game/viewer.
    return empty(/^BUNDLED_[A-Z_]+$/.test(error.message) ? error.message : 'BUNDLED_CATALOG_UNAVAILABLE')
  }
}
