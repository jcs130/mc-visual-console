// Cache only manifest-addressed original Minecraft resources. Live state,
// inventories, user uploads and authentication responses never enter this cache.
const CACHE = 'mc-native-original-assets-v1'
const eligible = path => /^assets\/minecraft\/[a-z0-9_./-]+\.(?:json|png|mcmeta)$/.test(path) && !path.split('/').includes('..')
export function createNativeAssetCache ({ storage = globalThis.caches, origin = globalThis.location?.origin,
  maxEntries = 256, maxFileBytes = 64 * 1024 } = {}) {
  let opened
  const open = () => opened ??= Promise.resolve().then(() => storage?.open(CACHE)).catch(() => null)
  const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('')
  return async (path, entry, read) => {
    if (!eligible(path) || !/^[a-f0-9]{64}$/.test(entry?.sha256 ?? '') || !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 || entry.bytes > maxFileBytes || !/^https?:\/\//.test(origin ?? '')) return read()
    const key = origin + '/__mc_original_asset__/' + entry.sha256, cache = await open()
    if (cache) {
      try {
        const response = await cache.match(key)
        if (response) {
          const bytes = await response.arrayBuffer()
          if (bytes.byteLength === entry.bytes && await digest(bytes) === entry.sha256) return bytes
          await cache.delete(key)
        }
      } catch {} // Storage restrictions must not disable the original renderer.
    }
    const bytes = await read()
    if (cache && bytes.byteLength === entry.bytes && await digest(bytes) === entry.sha256) {
      try {
        await cache.put(key, new Response(bytes))
        const keys = await cache.keys()
        for (const old of keys.slice(0, Math.max(0, keys.length - maxEntries))) await cache.delete(old)
      } catch {}
    }
    return bytes
  }
}
