/** Vanilla 1.20.6 leaves without a registered block color provider. */
export const UNTINTED_LEAF_BLOCKS = Object.freeze([
  'cherry_leaves', 'azalea_leaves', 'flowering_azalea_leaves',
])

/**
 * Vanilla ignores a model's tintindex when the block has no color provider.
 * minecraft-renderer instead gives every leaf a foliage/grass tint. Remove
 * these unused indices in the three derived models, so terrain, WASM/shader
 * geometry and held blocks all use the original texture color. The exported
 * JAR data and the shared leaves/cube models remain untouched.
 */
export function normalizeUntintedLeafModels(blockStatesModels) {
  const models = blockStatesModels.models?.latest
  if (!models) throw Error('缺少原版 1.20.6 方块模型')
  const derived = { ...models }
  for (const name of UNTINTED_LEAF_BLOCKS) {
    const key = `block/${name}`
    const model = models[key]
    if (!model) throw Error(`缺少原版 1.20.6 树叶模型：${name}`)
    let inherited = model
    const parents = new Set([key])
    while (!inherited.elements && inherited.parent) {
      const parent = inherited.parent.replace(/^minecraft:/, '')
      if (parents.has(parent)) throw Error(`树叶模型继承成环：${name}`)
      parents.add(parent)
      inherited = models[parent]
      if (!inherited) throw Error(`树叶模型父模型缺失：${name} / ${parent}`)
    }
    if (!inherited.elements?.length) throw Error(`树叶模型缺少几何体：${name}`)
    if (!inherited.elements.some(element => Object.values(element.faces ?? {})
      .some(face => face.tintindex !== undefined))) continue
    derived[key] = { ...model, elements: inherited.elements.map(element => ({
      ...element,
      faces: Object.fromEntries(Object.entries(element.faces ?? {}).map(([name, face]) => {
        const { tintindex, ...untinted } = face
        return [name, untinted]
      })),
    })) }
  }
  return { ...blockStatesModels, models: { ...blockStatesModels.models, latest: derived } }
}
