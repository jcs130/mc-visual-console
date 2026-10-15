// Explicit local presentation resources; never server attachments or JAR assets.
export const BUNDLED_SCHEMA = 'mc-bundled-appearances/v1'
export const BUNDLED_LIMITS = Object.freeze({ catalog: 131072, file: 2 * 1024 * 1024, total: 8 * 1024 * 1024, files: 64, appearances: 16 })
export const bundledPath = value => typeof value === 'string' && value.length <= 240 && /^[a-zA-Z0-9_./-]+\.(?:png|json)$/.test(value) &&
  !value.startsWith('/') && !value.split('/').some(part => ['', '.', '..'].includes(part))
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
export function validateBundledCatalog (catalog) {
  if (!object(catalog) || catalog.schema !== BUNDLED_SCHEMA || catalog.source !== 'plugin_bundled' ||
      !object(catalog.assets) || !Array.isArray(catalog.appearances) || catalog.appearances.length > BUNDLED_LIMITS.appearances ||
      Object.keys(catalog.assets).length > BUNDLED_LIMITS.files) throw Error('BUNDLED_CATALOG_INVALID')
  let total = 0
  for (const [path, entry] of Object.entries(catalog.assets)) {
    if (!bundledPath(path) || !object(entry) || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '') ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > BUNDLED_LIMITS.file) throw Error('BUNDLED_ASSET_INVALID')
    total += entry.bytes
  }
  if (total > BUNDLED_LIMITS.total) throw Error('BUNDLED_ASSETS_TOO_LARGE')
  const ids = new Set()
  for (const row of catalog.appearances) {
    if (!object(row) || !/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(row.id ?? '') || ids.has(row.id) ||
        typeof row.label !== 'string' || !row.label.length || row.label.length > 100 ||
        typeof row.provenance !== 'string' || !row.provenance.length || row.provenance.length > 2048) throw Error('BUNDLED_APPEARANCE_INVALID')
    ids.add(row.id)
    const exists = path => bundledPath(path) && Object.hasOwn(catalog.assets, path)
    if (row.kind === 'skin') {
      if (!exists(row.path) || !row.path.endsWith('.png') || !['slim', 'wide'].includes(row.model)) throw Error('BUNDLED_SKIN_INVALID')
    } else if (row.kind === 'ysm') {
      if (!/^[a-z0-9_./-]{1,100}$/.test(row.modelId ?? '') || !/^[a-z0-9_-]{1,64}$/.test(row.texture ?? '') ||
          row.format !== 'ysm-bedrock-original' || typeof row.ysmVersion !== 'string' || row.ysmVersion.length > 32 ||
          !object(row.files) || !['definition', 'model', 'animation', 'texture', 'armModel', 'armAnimation', 'extraAnimation'].every(key => exists(row.files[key])) ||
          !['definition', 'model', 'animation', 'armModel', 'armAnimation', 'extraAnimation'].every(key => row.files[key].endsWith('.json')) ||
          !row.files.texture.endsWith('.png')) throw Error('BUNDLED_YSM_INVALID')
    } else throw Error('BUNDLED_KIND_UNSUPPORTED')
  }
  return catalog
}
