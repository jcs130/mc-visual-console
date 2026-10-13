/** Pure selection; a server name/address is never evidence of a content pack. */
export function selectViewerPack(packs, { minecraftVersion, registrySha256 = null, contentProfile = null }) {
  const sameVersion = packs.filter(pack => pack.minecraftVersion === minecraftVersion);
  const compatible = sameVersion.filter(pack => registrySha256
    ? pack.registrySha256 === registrySha256
    : pack.registry === 'vanilla');
  const base = compatible.filter(pack => !pack.contentProfile);
  if (base.length !== 1) return { available: false, reason: base.length ? 'AMBIGUOUS_VIEWER_PACK' : 'MATCHING_VIEWER_PACK_MISSING', minecraftVersion };
  const result = { available: true, pack: base[0], overlays: [], minecraftVersion };
  if (!contentProfile) return result;
  // This value comes from the consumer's validated capability handshake, not
  // MOTD, chat, a hostname substring or a model's guess.
  if (contentProfile.verified !== true || typeof contentProfile.id !== 'string')
    return { ...result, content: { available: false, reason: 'CONTENT_PROFILE_UNVERIFIED' } };
  const overlays = compatible.filter(pack => pack.contentProfile === contentProfile.id);
  if (overlays.length !== 1) return { ...result, content: { available: false, reason: 'MATCHING_CONTENT_PACK_MISSING', id: contentProfile.id } };
  return { ...result, overlays, content: { available: true, id: contentProfile.id } };
}
