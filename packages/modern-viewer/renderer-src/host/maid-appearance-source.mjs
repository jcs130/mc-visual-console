import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const SHA = /^[a-f0-9]{64}$/
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export const TLM_JAR_SHA256 = 'f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27'
export const MAID_YSM_JAR_SHA256 = 'b285c73d4ec010d9a9be3c53c1bee890cf269645be5f1bcf1c27a2e8e82807cb'
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const choice = value => typeof value === 'string' && value.length > 0 && value.length <= 96 &&
  /^[-\p{L}\p{N}_./]+$/u.test(value) && !value.includes('..') && !value.startsWith('/')

/** Immutable original resources shared by observers; never a source of entity identity. */
export async function createMaidAppearanceSource({ directory, catalogSha256, ysmCatalogSha256 }) {
  if (!path.isAbsolute(directory ?? '') || !SHA.test(catalogSha256 ?? '')) throw Error('TLM_CATALOG_CONFIGURATION')
  const raw = await fs.readFile(path.join(directory, 'catalog.json'))
  if (raw.length > 512 * 1024 || hash(raw) !== catalogSha256) throw Error('TLM_CATALOG_HASH_MISMATCH')
  const catalog = JSON.parse(raw)
  if (catalog.schemaVersion !== 1 || catalog.format !== 'tlm-bedrock-catalog' || catalog.jarSha256 !== TLM_JAR_SHA256) throw Error('TLM_CATALOG_SOURCE_MISMATCH')
  const ysm = new Map()
  if (ysmCatalogSha256 !== undefined) {
    if (!SHA.test(ysmCatalogSha256)) throw Error('TLM_YSM_CATALOG_CONFIGURATION')
    const raw = await fs.readFile(path.join(directory, 'maid-ysm.json'))
    if (raw.length > 256 * 1024 || hash(raw) !== ysmCatalogSha256) throw Error('TLM_YSM_CATALOG_HASH_MISMATCH')
    const data = JSON.parse(raw)
    if (data.schemaVersion !== 1 || data.format !== 'maid-ysm-original-catalog' || data.tlmJarSha256 !== TLM_JAR_SHA256 ||
        data.ysmVersion !== '2.6.5' || data.ysmJarSha256 !== MAID_YSM_JAR_SHA256 || !Array.isArray(data.bindings) || data.bindings.length > 128) throw Error('TLM_YSM_CATALOG_SOURCE_MISMATCH')
    for (const ref of data.bindings) {
      if (!UUID.test(ref.maidUuid ?? '') || ysm.has(ref.maidUuid) || ![ref.nativeModelId, ref.nativeTexture, ref.modelId, ref.texture].every(choice) ||
          ![ref.bundleSha256, ref.assetSha256].every(v => SHA.test(v ?? '')) || !Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > 8 * 1024 * 1024 ||
          !['original', 'owner_web_projection'].includes(ref.presentation)) throw Error('TLM_YSM_CATALOG_BINDING_INVALID')
      ysm.set(ref.maidUuid, ref)
    }
  }
  const assets = new Map(), pending = new Map(), failures = new Map()
  let bytes = 0
  const entry = modelId => Object.hasOwn(catalog.models, modelId ?? '') ? catalog.models[modelId] : null
  const ysmEntry = row => {
    const ref = ysm.get(row?.uuid)
    return ref && row.ysmModelId === ref.nativeModelId && row.ysmTexture === ref.nativeTexture ? ref : null
  }
  async function prepare(rows) {
    for (const row of Array.isArray(rows) ? rows.slice(0, 128) : []) {
      const ref = row.ysm ? ysmEntry(row) : entry(row.modelId)
      if (!row.available || !ref || (!row.ysm && !ref.available) || !SHA.test(ref.bundleSha256 ?? '') || !Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > (row.ysm ? 8 : 4) * 1024 * 1024) continue
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
    if (row?.ysm) {
      const ref = ysmEntry(row)
      if (!row.available || !ref || !assets.has(ref.bundleSha256)) return { available: false,
        reason: !row.available ? 'TLM_NATIVE_STATE_UNAVAILABLE' : !ref ? 'TLM_YSM_SOURCE_REQUIRED' : 'TLM_ASSET_LOADING' }
      return { available: true, format: 'ysm-bedrock-original', kind: 'ysm', ysmVersion: '2.6.5',
        jarSha256: TLM_JAR_SHA256, ysmJarSha256: MAID_YSM_JAR_SHA256,
        ...Object.fromEntries(['modelId','texture','nativeModelId','nativeTexture','presentation','assetSha256','bundleSha256','bytes'].map(k => [k,ref[k]])) }
    }
    const ref = entry(row?.modelId)
    const reason = row?.ysm ? 'TLM_YSM_SOURCE_REQUIRED' : !row?.available ? 'TLM_NATIVE_STATE_UNAVAILABLE' :
      !ref ? 'TLM_MODEL_NOT_REGISTERED' : !ref.available ? ref.reason : !assets.has(ref.bundleSha256) ? 'TLM_ASSET_LOADING' : null
    return reason ? { available: false, reason } : { available: true, format: 'tlm-bedrock-original',
      modelId: row.modelId, bundleSha256: ref.bundleSha256, bytes: ref.bytes, jarSha256: TLM_JAR_SHA256 }
  }, read: digest => SHA.test(digest ?? '') ? assets.get(digest) : null }
}
