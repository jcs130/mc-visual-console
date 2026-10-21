import { nativeCubeFaces } from './native-entity-model.js'
import { nativeGuiItemTransform } from './native-block-item-icons.js'
import { verifyNativeStaticItemEvidence } from './native-static-item-providers.js'

// Original 1.21.1 ShieldModel.createLayer: ModelPart pixels and UVs. The
// builtin renderer centres the item, then flips ModelPart's Y/Z axes.
// fxb.class SHA256 3fce6d7c1b78c8693dc11e6c7aaf24491a3bfc17be2597461835ce2a27220592;
// gem.class 7667fd54fd26c8754f3dd83b7022c49505c8c3100719132e1f2069e0c5a8bcea.
export const NATIVE_SHIELD_PARTS = Object.freeze([
  { name: 'plate', origin: [-6, -11, -2], size: [12, 22, 1], uv: [0, 0] },
  { name: 'handle', origin: [-1, -3, -1], size: [2, 6, 6], uv: [26, 0] }
])
export async function prepareNativeShieldItem (reader, name) {
  const evidence = verifyNativeStaticItemEvidence(reader, name)
  if (evidence.kind !== 'shield') throw Error('NATIVE_SHIELD_ITEM_UNSUPPORTED')
  const path = 'assets/minecraft/models/item/shield.json', model = await reader.json(path)
  if (!['builtin/entity', 'minecraft:builtin/entity'].includes(model.parent) || model.gui_light !== 'front' ||
      Object.keys(model).some(key => !['parent', 'gui_light', 'textures', 'display', 'overrides'].includes(key)) ||
      JSON.stringify(model.overrides) !== JSON.stringify([{ predicate: { blocking: 1 }, model: 'item/shield_blocking' }])) throw Error('NATIVE_SHIELD_ITEM_MODEL_UNSUPPORTED')
  const texturePath = 'assets/minecraft/textures/entity/shield_base_nopattern.png'
  if (reader.manifest.assets[texturePath + '.mcmeta']) throw Error('NATIVE_SHIELD_ANIMATION_UNSUPPORTED')
  const textureBytes = await reader.bytes(texturePath), data = new DataView(textureBytes.buffer, textureBytes.byteOffset, textureBytes.byteLength)
  if (textureBytes.length < 33 || data.getUint32(16) !== 64 || data.getUint32(20) !== 64) throw Error('NATIVE_SHIELD_TEXTURE_INVALID')
  const faces = NATIVE_SHIELD_PARTS.flatMap(part => nativeCubeFaces(part, [64, 64]).map(face => ({ ...face,
    part: part.name, texture: 'minecraft:entity/shield_base_nopattern',
    position: face.position.map((value, index) => value / 16 * (index % 3 === 0 ? 1 : -1) - .5),
    normal: face.normal.map((value, index) => value * (index === 0 ? 1 : -1)) })))
  return { name, kind: 'native-builtin-shield-gui', model: { ...model, sourcePaths: [path] }, faces,
    transform: nativeGuiItemTransform(model.display?.gui), texturePaths: [texturePath], textureDimensions: [64, 64],
    sourcePaths: [path, texturePath], evidence, blockingPoseAvailable: false, pixelParityVerified: false }
}
