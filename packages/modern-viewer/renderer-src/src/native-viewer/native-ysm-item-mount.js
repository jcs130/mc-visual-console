import { Matrix4, Vector3, Quaternion, Euler } from 'three'

// YSM 2.4.1's item layer operates in its X-left/Y-up locator basis. Our shared
// Bedrock hierarchy is ModelPart X-right/Y-down. Convert at this boundary,
// before the original offset, rotation and Java ItemTransform. Converting just
// the final sprite inverts the grip translation and breaks blocks/other hands.
// Geometry is already centred by the item baker; do not centre it again here.
export function nativeYsmItemMount(transform) {
  return new Matrix4().makeScale(-1, -1, 1)
    .multiply(new Matrix4().makeTranslation(0, -.0625, -.1))
    .multiply(new Matrix4().makeRotationX(-Math.PI / 2))
    .multiply(new Matrix4().compose(new Vector3(...transform.translation),
      new Quaternion().setFromEuler(new Euler(...transform.radians, 'XYZ')), new Vector3(...transform.scale)))
}
