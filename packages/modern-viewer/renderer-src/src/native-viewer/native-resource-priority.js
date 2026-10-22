// Exact default client stack: ClientPackSource puts vanilla at BOTTOM;
// NeoForge ResourcePackLoader puts mod_resources (including child mod packs)
// at TOP; FallbackResourceManager searches the stack backwards. This is NOT a
// filename-order rule for two mods, atlas merging or user resource packs.
// Audited class SHA256s: grc e5f833a2…390d41, atv cb84739e…3c16a,
// ResourcePackLoader 89f699b5…ac3b (full hashes in export tool/docs).
export const NATIVE_BASE_PRIORITY_RULE = 'neoforge-21.1.248-mods-above-vanilla'
const CLIENT = '499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'
const DOMUM = '04c0c902bdbcbd48e38bee5a323907ae0b7b7db4ff4a3e4da7c45334b65610a1'
// These two exact JARs contain the same audited ResourcePackLoader.class.
const PLATFORMS = Object.freeze({
  'neoforge-21.1.248-universal.jar': '90a56f70425711b4e1a4b94ff0c2904ae9f6d74ca6478b3b2152ac794a07b8e5',
  'neoforge-21.1.250-universal.jar': '1f9cc68fe9ec0416475d34ce76e95a696b9721d5d338168563dab0632c3d2956'
})
export const NATIVE_BASE_TEXTURE_PRIORITY = Object.freeze({
  'assets/minecraft/textures/block/oak_planks.png': Object.freeze([
    '3a33db67a3ba30537d0890a5cb37c8087ca336be89cbb1393a71c23224e361a8',
    '3b00412fec87bd07b83825b86de49bcb6c186ca7799f41721a36b04e5d8ed161'
  ]),
  'assets/minecraft/textures/block/dark_oak_planks.png': Object.freeze([
    '2bccdc1ef269b7ae6050d46b70071ead5c3ad4c3a16e3f6baf24fc629752b8bc',
    '3d04f576678df35491ccc43b0fafddce13e310fa5f363ca13193f8a2f55b285b'
  ])
})
// Stacked language resources merge individual keys. This proves only vanilla
// below mod_resources; it supplies no ordering between two different mods.
export function verifiedNativeLanguageBasePriority(manifest){
  const platforms=manifest.sources?.filter(s=>Object.hasOwn(PLATFORMS,s.name))
  return manifest.clientJarSha256===CLIENT&&!manifest.sources?.some(s=>s.explicitOverride)&&
    platforms?.length===1&&platforms[0].sha256===PLATFORMS[platforms[0].name]
}
export function verifiedNativeBasePriority(manifest, path, entry) {
  const hashes = NATIVE_BASE_TEXTURE_PRIORITY[path]
  if (!hashes || entry.priorityResolution !== NATIVE_BASE_PRIORITY_RULE || manifest.clientJarSha256 !== CLIENT ||
      manifest.sources?.some(source => source.explicitOverride)) return false
  const clients = manifest.sources?.filter(source => source.sha256 === CLIENT)
  const mods = manifest.sources?.filter(source => source.name === 'domum-ornamentum-1.0.231-main.jar')
  const platforms = manifest.sources?.filter(source => Object.hasOwn(PLATFORMS, source.name))
  if (clients?.length !== 1 || mods?.length !== 1 || mods[0].sha256 !== DOMUM ||
      platforms?.length !== 1 || platforms[0].sha256 !== PLATFORMS[platforms[0].name]) return false
  const variants = entry.variants
  return variants?.length === 2 && variants[0].source === clients[0].name && variants[0].sha256 === hashes[0] &&
    variants[1].source === 'domum-ornamentum-1.0.231-main.jar' && variants[1].sha256 === hashes[1] &&
    entry.source === variants[1].source && entry.sha256 === hashes[1] && entry.bytes === variants[1].bytes
}
