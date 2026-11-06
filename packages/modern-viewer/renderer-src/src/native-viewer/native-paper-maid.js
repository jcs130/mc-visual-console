import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createNativeBedrockModel } from './native-entity-model-bedrock.js'
import { nativeViewerUrl } from './native-url.js'

const SHA = /^[a-f0-9]{64}$/, F = Math.fround, RAD = F(Math.PI / 180)
const SOURCE = 'f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27'
const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0))
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('')
const wrap = value => ((value + 180) % 360 + 360) % 360 - 180
const lerp = (a, b, t) => a + (b - a) * t
const cache = new Map()
// MaidModelInfo.decorate() original defaults for an absent/empty list.
const DEFAULT_ANIMATIONS = ['head/default','head/blink','head/beg','head/music_shake','leg/default','arm/default','arm/swing','arm/vertical',
  'sit/default','armor/default','armor/reverse','wing/default','tail/default','sit/skirt_rotation'].map(p=>'touhou_little_maid:animation/maid/default/'+p+'.js').concat('touhou_little_maid:animation/base/float/default.js')

export function paperMaidBinding(entity) {
  const row = entity?.paperMaid
  if (entity?.name !== 'touhou_little_maid:maid' || row?.source !== 'paper_tracked_maids' ||
      row.uuid !== entity.uuid || row.entityId !== entity.entityId || !row.state) throw Error('TLM_OBSERVED_IDENTITY_INVALID')
  if (!row.asset?.available) throw Error(row.asset?.reason ?? 'TLM_ASSET_UNAVAILABLE')
  if (row.asset.modelId !== row.state.modelId || row.asset.jarSha256 !== SOURCE ||
      row.asset.format !== 'tlm-bedrock-original' || !SHA.test(row.asset.bundleSha256 ?? '') ||
      !Number.isSafeInteger(row.asset.bytes) || row.asset.bytes < 1 || row.asset.bytes > 4 * 1024 * 1024) throw Error('TLM_OBSERVED_ASSET_INVALID')
  return row
}

export function originalMaidGeometry(value) {
  if (value?.format_version === '1.12.0') return value
  const keys = Object.keys(value ?? {}).filter(k => k.startsWith('geometry.'))
  if (value?.format_version !== '1.10.0' || keys.length !== 1) throw Error('TLM_GEOMETRY_FORMAT_UNSUPPORTED')
  const original = value[keys[0]]
  // Original Bedrock 1.10 -> 1.12 envelope only. Bones, pivots, UVs, cubes,
  // fractional sizes and authored rotations are retained verbatim.
  return { format_version: '1.12.0', 'minecraft:geometry': [{ description: {
    identifier: keys[0], texture_width: original.texturewidth, texture_height: original.textureheight,
    visible_bounds_width: original.visible_bounds_width, visible_bounds_height: original.visible_bounds_height,
    visible_bounds_offset: original.visible_bounds_offset }, bones: original.bones }] }
}

export async function readMaidBundle(row, { fetcher = fetch, resolveUrl = nativeViewerUrl } = {}) {
  const key = row.bundleSha256
  if (cache.has(key)) return cache.get(key)
  const work = (async () => {
    const response = await fetcher(resolveUrl('api/server-appearance/assets/' + key + '.json'))
    if (!response.ok) throw Error('TLM_ASSET_DOWNLOAD_FAILED')
    const chunks = []; let size = 0
    for await (const chunk of response.body) { size += chunk.length; if (size > row.bytes) throw Error('TLM_ASSET_SIZE_INVALID'); chunks.push(chunk) }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    if (size !== row.bytes || await digest(bytes) !== key) throw Error('TLM_ASSET_HASH_MISMATCH')
    const bundle = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (bundle.schemaVersion !== 1 || bundle.format !== 'tlm-bedrock-original' || bundle.jarSha256 !== SOURCE ||
        bundle.modelId !== row.modelId || Object.keys(bundle.files ?? {}).length !== 3) throw Error('TLM_BUNDLE_INVALID')
    for (const [name, file] of Object.entries(bundle.files)) {
      if (!name.startsWith('assets/') || name.includes('..') || /[:\\]/.test(name) || typeof file.base64 !== 'string' || file.base64.length > 4 * 1024 * 1024) throw Error('TLM_ORIGINAL_FILE_INVALID')
      const data = decode(file.base64)
      if (data.length !== file.bytes || await digest(data) !== file.sha256) throw Error('TLM_ORIGINAL_FILE_HASH_MISMATCH')
    }
    const json = name => JSON.parse(new TextDecoder().decode(decode(bundle.files[name].base64)))
    if (![bundle.pack, bundle.model, bundle.texture].every(k => bundle.files[k])) throw Error('TLM_BUNDLE_FILES_MISSING')
    const definitions = json(bundle.pack).model_list?.filter(r => r.model_id === bundle.definitionId)
    if (definitions?.length !== 1) throw Error('TLM_DEFINITION_MISSING')
    return { bundle, definition: definitions[0], geometry: originalMaidGeometry(json(bundle.model)) }
  })()
  cache.set(key, work)
  while (cache.size > 16) cache.delete(cache.keys().next().value)
  try { return await work } catch (error) { if (cache.get(key) === work) cache.delete(key); throw error }
}

/** Port of TLM's ordered InnerAnimation list. No model-provided JS is executed. */
export function animatePaperMaid(model, definition, state, motion, partial = 0) {
  model.reset()
  const age = state.ageTicks + partial, speed = motion?.walk ? lerp(motion.walk.speedOld, motion.walk.speed, partial) : 0
  const limb = motion?.walk ? motion.walk.position - motion.walk.speed * (1 - partial) : 0
  const issues = [], bones = model.bones, initial = model.initial
  let translateY = 0
  const rotate = (name, axis, value) => { if (bones.has(name)) bones.get(name).rotation[axis] = F(value) }
  const base = (name, axis) => initial.get(name)?.rotation[axis] ?? 0
  const visible = (name, show) => { if (bones.has(name)) bones.get(name).visible = show }
  const seated = state.sitting || state.passenger
  for (const animation of definition.animation?.length ? definition.animation : DEFAULT_ANIMATIONS) {
    const key = animation.replace('touhou_little_maid:animation/maid/default/', '').replace(/\.js$/, '')
    switch (key) {
      case 'head/default':
        rotate('head', 'x', (state.sleeping ? 15 : state.pitch) * RAD)
        rotate('head', 'y', wrap(state.headYaw - state.bodyYaw) * RAD); visible('hat', !state.sleeping); break
      case 'head/music_shake': break // Original 1.5.3 isPortableAudioPlay() is false.
      case 'head/blink': {
        const signed = BigInt.asIntN(64, BigInt('0x' + state.uuid.replaceAll('-', '').slice(16)))
        const abs = signed === -(1n << 63n) ? signed : signed < 0 ? -signed : signed
        const phase = (age + Number(abs % 10n)) % 60
        for (const name of ['blink', 'blink2']) visible(name, state.sleeping || phase > 55 && phase < 60)
        break
      }
      case 'head/beg':
        rotate('head', 'z', state.begging ? .139 : base('head', 'z')); visible('begShow', state.begging)
        if (state.begging) { rotate('ahoge', 'x', Math.cos(age) * .05 + base('ahoge', 'x')); rotate('ahoge', 'z', Math.sin(age) * .05 + base('ahoge', 'z')) }
        break
      case 'arm/default':
        for (const [name, sign, off] of [['armLeft', -1, true], ['armRight', 1, false]]) {
          rotate(name, 'x', sign * Math.cos(limb * .67) * .7 * speed)
          rotate(name, 'z', -sign * Math.cos(age * .05) * .05 + base(name, 'z'))
          if (state.attackAnim > 0 && state.offhandSwing === off && bones.has(name)) {
            const attack = state.attackAnim, f2 = Math.sin((1 - (1 - attack) ** 4) * Math.PI), f3 = Math.sin(attack * Math.PI) * -.7 * .75
            rotate(name, 'x', bones.get(name).rotation.x - (f2 * 1.2 + f3))
            rotate(name, 'z', bones.get(name).rotation.z + Math.sin(attack * Math.PI) * -.4)
          }
          if (state.usingItem && state.offhandUse === off) { rotate(name, 'x', base(name, 'x') - Math.PI * 80 / 180); rotate(name, 'y', base(name, 'y') + Math.PI * (off ? 25 : -20) / 180) }
        }
        break
      case 'arm/swing':
        if (state.hasMainHand && state.armRise) { rotate('armLeft', 'x', -1.396); rotate('armLeft', 'y', .785); rotate('armRight', 'x', -1.396); rotate('armRight', 'y', -.174) }
        break
      case 'arm/vertical':
        for (const name of ['armLeft','armRight']) if(bones.has(name)) for(const axis of ['x','z']) rotate(name+'Vertical',axis,-bones.get(name).rotation[axis])
        break
      case 'armor/default': case 'armor/reverse': {
        const prefix=key==='armor/reverse'?'_':''
        for(const [group,worn] of [['helmet',state.hasHelmet],['chestPlate',state.hasChestPlate],['leggings',state.hasLeggings],['boots',state.hasBoots]])
          for(const suffix of ['', 'Left','Middle','Right']) visible(prefix+group+suffix,prefix?!worn:!!worn)
        break
      }
      case 'leg/default':
        rotate('legLeft', 'x', Math.cos(limb * .67) * .3 * speed); rotate('legRight', 'x', -Math.cos(limb * .67) * .3 * speed)
        if (state.task === 'touhou_little_maid:farm' && state.swingTime > 0) issues.push('TLM_FARM_POSTURE_UNAVAILABLE')
        break
      case 'sit/default': case 'sit/no_leg':
        if (seated) {
          if (state.sitting) { rotate('armLeft', 'x', -.798); rotate('armLeft', 'z', .274); rotate('armRight', 'x', -.798); rotate('armRight', 'z', -.274) }
          if (key !== 'sit/no_leg' || state.passenger) { rotate('legLeft', 'x', -1.134); rotate('legLeft', 'z', -.262); rotate('legRight', 'x', -1.134); rotate('legRight', 'z', .262); translateY += .3 }
        }
        break
      case 'sit/skirt_rotation': rotate('sittingRotationSkirt', 'x', seated ? -.567 : base('sittingRotationSkirt', 'x')); break
      case 'sit/skirt_hidden': visible('sittingHiddenSkirt', !seated); visible('_sittingHiddenSkirt', seated); break
      case 'sit/skirt_rotation_swing':
        rotate('sittingRotationSwingSkirt', 'x', seated ? -.567 : base('sittingRotationSwingSkirt', 'x'))
        rotate('sittingRotationSwingSkirt', 'z', base('sittingRotationSwingSkirt', 'z') + (seated ? 0 : Math.sin(age * .05) * .03)); break
      case 'wing/default':
        for (const [name, sign] of [['wingLeft', -1], ['wingRight', 1]]) { rotate(name, 'y', sign * Math.cos(age * .3) * .2 + base(name, 'y')); visible(name, !state.sleeping) }
        break
      case 'tail/default': rotate('tail', 'x', Math.sin(age * .2) * .05 + base('tail', 'x')); rotate('tail', 'z', Math.cos(age * .2) * .1 + base('tail', 'z')); visible('tail', !state.sleeping); break
      case 'sleep/default': visible('sleepHide', !state.sleeping); visible('sleepShow', state.sleeping); break
      case 'status/backpack': visible('backpackShow', state.backpack !== 'touhou_little_maid:empty'); visible('backpackHidden', state.backpack === 'touhou_little_maid:empty'); break
      case 'status/backpack_level': break // Deprecated original no-op.
      case 'touhou_little_maid:animation/base/float/default':
        for (const [name,fn,sign] of [['sinFloat',Math.sin,1],['cosFloat',Math.cos,1],['_sinFloat',Math.sin,-1],['_cosFloat',Math.cos,-1]])
          if(bones.has(name))bones.get(name).position.y=initial.get(name).position.y+F(sign*fn(age*.1)*.05)
        break
      default: issues.push('TLM_ANIMATION_UNSUPPORTED:' + animation)
    }
  }
  return { translateY, issues }
}

// Collapse static cube faces within each animated bone. Bone hierarchy and
// animation pivots stay intact; a 300-cube maid must not cost 1,800 draw calls.
export function batchMaidGeometry(model, material) {
  const merged = []
  for (const bone of model.bones.values()) {
    const parts = [], originals = []
    function collect(node, matrix) {
      node.updateMatrix(); const transform = matrix.clone().multiply(node.matrix)
      if (node.isMesh) { parts.push(node.geometry.clone().applyMatrix4(transform)); originals.push(node) }
      else if (node.userData.nativeCubeRotation) for (const child of node.children) collect(child, transform)
    }
    for (const child of [...bone.children]) collect(child, new THREE.Matrix4())
    if (!parts.length) continue
    const geometry = mergeGeometries(parts)
    for (const part of parts) part.dispose()
    if (!geometry) throw Error('TLM_GEOMETRY_BATCH_FAILED')
    for (const mesh of originals) mesh.removeFromParent()
    bone.add(new THREE.Mesh(geometry, material)); merged.push(geometry)
  }
  return { drawCalls: merged.length, dispose: () => merged.forEach(g => g.dispose()) }
}

async function loadOriginalTexture(file) {
  const url = URL.createObjectURL(new Blob([decode(file.base64)], { type: 'image/png' }))
  try { return await new THREE.TextureLoader().loadAsync(url) } finally { URL.revokeObjectURL(url) }
}

export async function createPaperMaidActor(reader, entity, { readBundle = readMaidBundle, loadMaidTexture = loadOriginalTexture } = {}) {
  const binding = paperMaidBinding(entity), resource = await readBundle(binding.asset)
  const { bundle, definition, geometry } = resource
  if (bundle.modelId !== binding.state.modelId || bundle.jarSha256 !== SOURCE) throw Error('TLM_MODEL_SELECTION_MISMATCH')
  if (definition.animation?.some(id => id.endsWith('.json'))) throw Error('TLM_GECKOLIB_ANIMATION_UNAVAILABLE')
  const texture = await loadMaidTexture(bundle.files[bundle.texture])
  texture.flipY = true; texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true
  const material = new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide, alphaTest: .1 })
  let model, batch, disposed = false
  const root = new THREE.Group(), orientation = new THREE.Group(), content = new THREE.Group()
  root.add(orientation); orientation.add(content); orientation.scale.set(-1, -1, 1); content.position.y = -1.501
  try {
    model = createNativeBedrockModel(geometry, material, { maxBones: 512, maxCubesPerBone: 256 })
    if (texture.image?.width !== model.dimensions[0] || texture.image?.height !== model.dimensions[1]) throw Error('TLM_TEXTURE_DIMENSIONS_MISMATCH')
    content.add(model.root); batch = batchMaidGeometry(model, material)
    const scale = definition.render_entity_scale ?? 1
    if (!Number.isFinite(scale) || scale <= 0 || scale > 8) throw Error('TLM_MODEL_SCALE_INVALID')
    const assetInfo = { type: entity.name, modelId: bundle.modelId, source: 'tlm-original', jarSha256: SOURCE,
      bundleSha256: binding.asset.bundleSha256, cubeCount: model.cubeCount, boneCount: model.bones.size, drawCalls: batch.drawCalls,
      originalGeometry: true, originalTexture: true, completeEntityParityVerified: false, issues: [] }
    return { root, model, assetInfo, update(next, now = Date.now()) {
      if (disposed) throw Error('TLM_ACTOR_DISPOSED')
      const row = paperMaidBinding(next)
      if (next.uuid !== entity.uuid || next.entityId !== entity.entityId || row.asset.bundleSha256 !== binding.asset.bundleSha256) throw Error('TLM_ACTOR_IDENTITY_CHANGED')
      const motion = next.motion, partial = motion ? Math.max(0, Math.min(1, (now - motion.sampledAt) / 50)) : 0
      const elapsed = row.displayBuffered ? 0 : Number.isFinite(row.sampledAt) ? Math.max(0,Math.min(5,(now-row.sampledAt)/50)) : partial
      const state = { ...row.state, uuid: next.uuid, ageTicks: row.state.ageTicks + elapsed - partial }
      const animation = animatePaperMaid(model, definition, state, motion, partial)
      const issues = [...animation.issues]
      if (state.backpack !== 'touhou_little_maid:empty') issues.push('TLM_BACKPACK_LAYER_UNAVAILABLE')
      if (next.equipment?.some(e => e.item?.itemCount > 0)) issues.push('TLM_EQUIPMENT_LAYER_UNAVAILABLE')
      if (state.sleeping) issues.push('TLM_BED_ORIENTATION_UNAVAILABLE')
      if (state.baby) issues.push('TLM_BABY_SCALE_UNAVAILABLE')
      if (state.inWater) issues.push('TLM_SWIM_POSTURE_UNAVAILABLE')
      const position = motion?.position ?? next.position
      root.position.set(position.x, position.y, position.z)
      root.rotation.y = Math.PI - state.bodyYaw * Math.PI / 180
      root.scale.setScalar(scale); content.position.y = -1.501 + animation.translateY
      root.visible = !((next.metadata?.find(r => r.key === 0)?.value ?? 0) & 32) && state.health > 0
      assetInfo.issues = issues; root.userData.nativeLiving = { health: state.health, issues }
    }, dispose() { if (disposed) return; disposed = true; root.removeFromParent(); model.dispose(); batch.dispose(); material.dispose(); texture.dispose(); root.clear() } }
  } catch (error) { model?.dispose(); batch?.dispose(); material.dispose(); texture.dispose(); root.clear(); throw error }
}
