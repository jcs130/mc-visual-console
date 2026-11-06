import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const SHA = /^[a-f0-9]{64}$/
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export const TLM_JAR_SHA256 = 'f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27'

/** Immutable original resources shared by observers; never a source of entity identity. */
export async function createMaidAppearanceSource({ directory, catalogSha256 }) {
  if (!path.isAbsolute(directory ?? '') || !SHA.test(catalogSha256 ?? '')) throw Error('TLM_CATALOG_CONFIGURATION')
  const raw = await fs.readFile(path.join(directory, 'catalog.json'))
  if (raw.length > 512 * 1024 || hash(raw) !== catalogSha256) throw Error('TLM_CATALOG_HASH_MISMATCH')
  const catalog = JSON.parse(raw)
  if (catalog.schemaVersion !== 1 || catalog.format !== 'tlm-bedrock-catalog' || catalog.jarSha256 !== TLM_JAR_SHA256) throw Error('TLM_CATALOG_SOURCE_MISMATCH')
  const assets = new Map(), pending = new Map(), failures = new Map()
  let bytes = 0
  const entry = modelId => Object.hasOwn(catalog.models, modelId ?? '') ? catalog.models[modelId] : null
  async function prepare(rows) {
    for (const row of Array.isArray(rows) ? rows.slice(0, 128) : []) {
      const ref = entry(row.modelId)
      if (row.ysm || !row.available || !ref?.available || !SHA.test(ref.bundleSha256 ?? '') || !Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > 4 * 1024 * 1024) continue
      const key = ref.bundleSha256
      if (assets.has(key) || pending.has(key) || Date.now() - (failures.get(key) ?? 0) < 5000) continue
      if (pending.size >= 8) break
      const task = fs.readFile(path.join(directory, 'assets', key + '.json')).then(data => {
        if (data.length !== ref.bytes || hash(data) !== key) throw Error('TLM_ASSET_HASH_MISMATCH')
        while (assets.size >= 32 || bytes + data.length > 32 * 1024 * 1024) {
          const old = assets.keys().next().value; bytes -= assets.get(old).length; assets.delete(old)
        }
        assets.set(key, data); bytes += data.length
      }).catch(() => failures.set(key, Date.now())).finally(() => pending.delete(key))
      pending.set(key, task)
    }
    await Promise.all([...pending.values()])
  }
  return { prepare, binding(row) {
    const ref = entry(row?.modelId)
    const reason = row?.ysm ? 'TLM_YSM_SOURCE_REQUIRED' : !row?.available ? 'TLM_NATIVE_STATE_UNAVAILABLE' :
      !ref ? 'TLM_MODEL_NOT_REGISTERED' : !ref.available ? ref.reason : !assets.has(ref.bundleSha256) ? 'TLM_ASSET_LOADING' : null
    return reason ? { available: false, reason } : { available: true, format: 'tlm-bedrock-original',
      modelId: row.modelId, bundleSha256: ref.bundleSha256, bytes: ref.bytes, jarSha256: TLM_JAR_SHA256 }
  }, read: digest => SHA.test(digest ?? '') ? assets.get(digest) : null }
}
