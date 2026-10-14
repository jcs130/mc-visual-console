// File names are not provenance: the launcher calls the same original JAR
// 1.21.1.jar. Accept exactly one locked hash, while rejecting a conflicting
// canonical declaration, duplicate source or an explicitly overridden client.
export function nativeClientSourceVerified(manifest, sha256) {
  if (manifest?.minecraftVersion !== '1.21.1' || manifest.clientJarSha256 !== sha256 || !Array.isArray(manifest.sources)) return false
  const canonical = manifest.sources.filter(row => row.name === 'minecraft-1.21.1-client.jar')
  const matched = manifest.sources.filter(row => row.sha256 === sha256)
  return canonical.length <= 1 && canonical.every(row => row.sha256 === sha256 && !row.explicitOverride) &&
    matched.length === 1 && !matched[0].explicitOverride && typeof matched[0].name === 'string' && matched[0].name.length > 0
}
