import { Group, Matrix4, Vector3, Quaternion, Euler } from 'three'
import { selectNativeHeldItems, prepareNativeHeldItem, buildNativeHeldItemObject, disposeNativeHeldItemObject } from './native-held-items.js'
import { parseNativeItemStack } from './native-item-stack.js'

// Same strict native stack/model provider as the vanilla actor, mounted at the
// original YSM2.4.1 locators. No Paper texture path or vanilla arm is substituted.
export class BundledYsmHeldItems {
  constructor(reader, model, uuid, loadTexture, { readPixels } = {}) {
    this.reader = reader; this.model = model; this.uuid = uuid; this.loadTexture = loadTexture
    this.hands = new Map(); this.disposed = false; this.reason = 'NATIVE_HELD_INVENTORY_UNAVAILABLE'
    this.readPixels = readPixels; this.visible = false
  }
  retire(arm) {
    const row = this.hands.get(arm)
    if (!row) return
    row.cancelled = true; row.mount?.removeFromParent()
    if (row.object) disposeNativeHeldItemObject(row.object)
    for (const texture of row.textures?.values() ?? []) { texture.dispose(); texture.image?.close?.() }
    this.hands.delete(arm)
  }
  apply(frame) {
    if (this.disposed) throw Error('BUNDLED_YSM_HELD_DISPOSED')
    let selected
    try { selected = selectNativeHeldItems(frame, this.uuid); this.reason = null } catch (error) {
      this.reason = error.message; for (const arm of ['right', 'left']) this.retire(arm); return this.state()
    }
    // Inventory and life state own equipment visibility. A sparse/stale physics
    // sample can pause an animation, but must not erase a confirmed held stack.
    this.setVisible(selected.self.health !== 0 && !['dead', 'respawn_pending'].includes(selected.self.deathLifecycle?.phase) &&
      ![2, 'sleeping', 'dying', 7].includes(selected.self.pose))
    for (const arm of ['right', 'left']) {
      const { raw, slot } = selected.hands[arm]
      let stack
      try { stack = raw === null ? null : parseNativeItemStack(raw) } catch (error) {
        this.retire(arm); this.hands.set(arm, { status: 'unavailable', reason: error.message, slot }); continue
      }
      const key = raw === null ? 'empty' : JSON.stringify(raw)
      if (this.hands.get(arm)?.key === key) continue
      this.retire(arm)
      const row = { key, slot, name: raw?.name ?? null, status: stack ? 'loading' : 'empty' }
      this.hands.set(arm, row)
      if (stack) void this.load(arm, row, stack)
    }
    return this.state()
  }
  async load(arm, row, stack) {
    const textures = new Map(); let object, retained = false
    const current = () => !this.disposed && !row.cancelled && this.hands.get(arm) === row
    try {
      const locator = this.model.bones.get(arm === 'right' ? 'RightHandLocator' : 'LeftHandLocator')
      if (!locator) throw Error('BUNDLED_YSM_ITEM_LOCATOR_MISSING')
      const plan = await prepareNativeHeldItem(this.reader, stack, arm, { readPixels: this.readPixels })
      if (!current()) return
      for (const [path, layer] of plan.textureLayers ?? new Map([[plan.texturePath, { bytes: plan.textureBytes }]])) {
        textures.set(path, await this.loadTexture(layer.bytes)); if (!current()) return
      }
      object = buildNativeHeldItemObject(plan, plan.textureLayers ? textures : textures.get(plan.texturePath))
      const mount = new Group(); mount.matrixAutoUpdate = false
      // Original locator -> T(0,-.0625,-.1) -> Rx(-90deg) -> ItemTransform.
      const t = plan.transform
      mount.matrix.makeTranslation(0, -.0625, -.1).multiply(new Matrix4().makeRotationX(-Math.PI / 2))
        .multiply(new Matrix4().compose(new Vector3(...t.translation), new Quaternion().setFromEuler(new Euler(...t.radians, 'XYZ')), new Vector3(...t.scale)))
      // Shield ModelPart grip faces opposite to this authored YSM locator.
      // Turn around the handle's centre, after the native item display transform.
      if (plan.appearance.family === 'shield') mount.matrix.multiply(new Matrix4().makeTranslation(-.5, -.5, -.5))
        .multiply(new Matrix4().makeTranslation(0, 0, -.25)).multiply(new Matrix4().makeRotationY(Math.PI))
        .multiply(new Matrix4().makeTranslation(.5, .5, .5))
      mount.add(object); mount.visible = this.visible; locator.add(mount)
      Object.assign(row, { object, mount, textures, status: 'ready', reason: null, glint: object.userData.glint, effectUnavailableReason: plan.appearance.requirements.effectUnavailableReason }); retained = true
    } catch (error) {
      if (object) disposeNativeHeldItemObject(object)
      if (current()) { row.status = 'unavailable'; row.reason = error.message }
    } finally { if (!retained) for (const texture of textures.values()) { texture.dispose(); texture.image?.close?.() } }
  }
  setVisible(value) { this.visible = !!value; for (const row of this.hands.values()) if (row.mount) row.mount.visible = this.visible }
  state() { const rows = [...this.hands.values()], available = rows.some(row => row.status === 'ready' && row.mount.visible)
    return { available, reason: available ? null : this.reason ?? rows.find(row => row.reason)?.reason ??
      (rows.some(row => row.status === 'loading') ? 'NATIVE_HELD_ITEMS_LOADING' : rows.some(row => row.status === 'ready') ? 'BUNDLED_YSM_HELD_POSE_HIDDEN' : 'NATIVE_HELD_HANDS_EMPTY'),
    hands: Object.fromEntries([...this.hands].map(([arm, row]) => [arm, { status: row.status, reason: row.reason ?? null, glint: row.glint ?? null, effectUnavailableReason: row.effectUnavailableReason ?? null, name: row.name, slot: row.slot, visible: !!row.mount?.visible }])),
    source: 'native_item_stack_original_ysm_locator', completeEntityParityVerified: false } }
  dispose() { if (this.disposed) return; this.disposed = true; for (const arm of ['right', 'left']) this.retire(arm) }
}
