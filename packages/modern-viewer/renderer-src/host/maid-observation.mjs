const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const RESOURCE = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/
const BOOL = 'ysm sitting begging armRise sleeping passenger baby inWater usingItem offhandUse offhandSwing hasMainHand hasHelmet hasChestPlate hasLeggings hasBoots'.split(' ')
const NUM = 'attackAnim swingTime hurtTime health bodyYaw headYaw pitch ageTicks'.split(' ')

/** Never recognize a maid by label, position, or Allay type alone. */
export function injectObservedMaids(entityState, observed, context, source, now = Date.now()) {
  if (observed?.source !== 'paper_tracked_maids' || observed.playerUuid !== context.playerUuid ||
      observed.dimension !== context.dimension || observed.worldUuid !== context.worldUuid || observed.generation !== context.generation ||
      !UUID.test(observed.generation ?? '') || !UUID.test(observed.worldUuid ?? '') ||
      !Number.isFinite(observed.observedAt) || now - observed.observedAt > 3000 || observed.observedAt > now + 1000 ||
      !Array.isArray(observed.rows) || observed.rows.length > 128) return entityState
  const rows = new Map()
  for (const row of observed.rows) {
    if (!Number.isSafeInteger(row?.entityId) || !UUID.test(row.uuid ?? '') || row.type !== 'touhou_little_maid:maid') continue
    if (rows.has(row.entityId)) { rows.set(row.entityId, null); continue }
    rows.set(row.entityId, row)
  }
  return { ...entityState, entities: (entityState.entities ?? []).map(entity => {
    const row = rows.get(entity.entityId)
    if (!row || row.uuid !== entity.uuid || !['minecraft:allay', 'minecraft:villager', 'touhou_little_maid:maid'].includes(entity.name)) return entity
    const valid = row.available === true && RESOURCE.test(row.modelId ?? '') && row.modelId.length <= 256 && !row.modelId.includes('..') &&
      BOOL.every(k => typeof row[k] === 'boolean') && NUM.every(k => Number.isFinite(row[k])) &&
      Number.isFinite(row.sampledAt) && now - row.sampledAt <= 3000 && row.sampledAt <= now + 1000 &&
      row.ageTicks >= 0 && row.attackAnim >= 0 && row.attackAnim <= 1 && RESOURCE.test(row.task ?? '') && RESOURCE.test(row.backpack ?? '')
    const state = valid ? Object.fromEntries([...BOOL, ...NUM, 'modelId', 'task', 'backpack'].map(k => [k, row[k]])) : null
    if (state && row.ysm === true && [row.ysmModelId, row.ysmTexture].every(v => typeof v === 'string' && v.length > 0 && v.length <= 96 &&
        /^[-\p{L}\p{N}_./]+$/u.test(v) && !v.startsWith('/') && !v.includes('..'))) {
      state.ysmModelId = row.ysmModelId; state.ysmTexture = row.ysmTexture
    }
    if (state) {
      for (const k of ['onGround','sprinting']) if (typeof row[k] === 'boolean') state[k] = row[k]
      if (Number.isFinite(row.maxHealth) && row.maxHealth > 0) state.maxHealth = row.maxHealth
    }
    return { ...entity, name: 'touhou_little_maid:maid', paperMaid: {
      source: 'paper_tracked_maids', playerUuid: context.playerUuid, uuid: entity.uuid, entityId: entity.entityId,
      dimension: context.dimension, epoch: entityState.epoch, state,
      sampledAt: row.sampledAt,
      asset: valid ? source?.binding({ ...row, ...state }) ?? { available: false, reason: 'TLM_ASSET_SOURCE_UNAVAILABLE' } : { available: false, reason: 'TLM_NATIVE_STATE_UNAVAILABLE' }
    } }
  }) }
}
