import { BUNDLED_SCHEMA, BUNDLED_LIMITS, validateBundledCatalog } from './native-bundled-contract.js'

export class BundledAppearanceReader {
  constructor (catalog, readBytes) {
    validateBundledCatalog(catalog)
    this.catalog = structuredClone(catalog); this.readBytes = readBytes; this.cache = new Map()
  }
  // Endpoint is supplied by the scene's scoped nativeViewerUrl helper. Asset
  // URLs are relative to that endpoint, so nested same-player routes work.
  static async load (endpoint, fetcher = globalThis.fetch) {
    try {
      const response = await fetcher(endpoint)
      if (!response.ok) throw Error('BUNDLED_CATALOG_UNAVAILABLE')
      const text = await response.text()
      if (new TextEncoder().encode(text).length > BUNDLED_LIMITS.catalog) throw Error('BUNDLED_CATALOG_TOO_LARGE')
      const catalog = JSON.parse(text)
      const prefix = String(endpoint).replace(/\/?$/, '/') + 'assets/'
      return new BundledAppearanceReader(catalog, async path => {
        const response = await fetcher(prefix + path)
        if (!response.ok) throw Error('BUNDLED_ASSET_UNAVAILABLE')
        const length = Number(response.headers?.get('content-length'))
        if (length > BUNDLED_LIMITS.file) throw Error('BUNDLED_ASSET_TOO_LARGE')
        return response.arrayBuffer()
      })
    } catch {
      return new BundledAppearanceReader({ schema: BUNDLED_SCHEMA, source: 'plugin_bundled', available: false,
        reason: 'BUNDLED_CATALOG_UNAVAILABLE', assets: {}, appearances: [] }, async () => { throw Error('BUNDLED_ASSET_UNAVAILABLE') })
    }
  }
  choices () { return this.catalog.available === true ? this.catalog.appearances.map(row => ({ id: `bundled:${row.id}`, label: row.label, kind: row.kind })) : [] }
  get (id) {
    const row = this.catalog.available === true && this.catalog.appearances.find(row => `bundled:${row.id}` === id)
    if (!row) throw Error('BUNDLED_APPEARANCE_UNAVAILABLE')
    return structuredClone(row)
  }
  async bytes (path) {
    const entry = this.catalog.assets[path]
    if (!entry) throw Error('BUNDLED_ASSET_UNAVAILABLE')
    if (!this.cache.has(path)) this.cache.set(path, (async () => {
      const bytes = new Uint8Array(await this.readBytes(path))
      if (bytes.length !== entry.bytes) throw Error('BUNDLED_ASSET_HASH_MISMATCH')
      const hash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
      if (hash !== entry.sha256) throw Error('BUNDLED_ASSET_HASH_MISMATCH')
      return bytes
    })())
    return this.cache.get(path)
  }
  async json (path) { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await this.bytes(path))) }
}
