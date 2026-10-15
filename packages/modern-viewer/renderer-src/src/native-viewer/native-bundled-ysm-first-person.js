import { Group, Matrix4 } from 'three'
import { createNativeBedrockModel } from './native-entity-model-bedrock.js'
import { nativeFirstPersonPlayerArmMatrix } from './native-first-person-motion.js'

export const BUNDLED_YSM_ARM_BASIS = 'authored_y_up_blocks_V_Yarm_Qup'

// Original YSM 2.4.1 Fabric 1.21.1, SHA256 ec51cfae84d219a45fac5098a31bfe980bcb7c2d8b413e8fffbd05a411a85680:
// oo00OO0ooooooOoOoO00OoOO arm dispatch: left T(+.25,1.8,0), right T(-.25,1.8,0), then S(-1,-1,1).
// Q_up restores authored Y-up blocks from this browser's H=(x,24-y,z)/16.
// This explicit browser contract does NOT establish the opaque JNI baker's basis.
export function bundledYsmFirstPersonArmMatrix (progress, arm) {
  return nativeFirstPersonPlayerArmMatrix(progress, arm)
    .multiply(new Matrix4().makeTranslation(arm === 'left' ? .25 : -.25, 1.8, 0))
    .multiply(new Matrix4().makeScale(-1, -1, 1))
    .multiply(new Matrix4().makeTranslation(0, 24 / 16, 0))
    .multiply(new Matrix4().makeScale(1, -1, 1))
}

// Asset-specific YUI partition, not an inferred generic native name-prefix filter.
// Move intact subtrees; material/texture remain owned by the enclosing actor.
export function createBundledYsmFirstPersonArms (definition, material) {
  const bones = definition?.['minecraft:geometry']?.[0]?.bones
  if (!Array.isArray(bones) || bones.length !== 8) throw Error('BUNDLED_YSM_ARM_HIERARCHY_INVALID')
  for (const side of ['Left', 'Right']) {
    const names = [`${side}Arm`, `${side}ForeArm`, `${side}Hand`, `${side}HandLocator`]
    for (const [index, name] of names.entries()) {
      const matches = bones.filter(bone => bone.name === name), bone = matches[0]
      if (matches.length !== 1 || bone.parent !== names[index - 1] ||
          (index === 0 && (bone.rotation ?? [0, 0, 0]).some(value => value !== 0))) throw Error('BUNDLED_YSM_ARM_HIERARCHY_INVALID')
    }
    if (bones.filter(bone => names.includes(bone.name)).reduce((sum, bone) => sum + (bone.cubes?.length ?? 0), 0) !== 8) throw Error('BUNDLED_YSM_ARM_HIERARCHY_INVALID')
  }
  const model = createNativeBedrockModel(definition, material), mounts = new Map()
  for (const [arm, name] of [['left', 'LeftArm'], ['right', 'RightArm']]) {
    const mount = new Group(); mount.name = `bundled-ysm-first-${arm}`; mount.matrixAutoUpdate = false
    mount.add(model.bones.get(name)); mounts.set(arm, mount)
  }
  let disposed = false
  return { model, mounts, dispose () {
    if (disposed) return
    disposed = true
    for (const mount of mounts.values()) { mount.visible = false; mount.removeFromParent(); mount.clear() }
    model.dispose()
  } }
}
