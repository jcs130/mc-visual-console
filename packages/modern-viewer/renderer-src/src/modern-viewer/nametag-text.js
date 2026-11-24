// Head nametags are drawn by minecraft-renderer from `username`. Run the same
// HUD cleaning used by boss bars (§ codes, private-use / borrowed-font glyphs,
// shift characters) on the copy handed to the renderer only; the entity cache
// keeps the authoritative name for identity, skins and team lookups. When
// nothing readable is left the renderer's own "EMPTY" sentinel skips the tag.
export function rendererNameTagEntity(entity, clean = globalThis.cortiHudText) {
  if (!entity || typeof entity.username !== 'string' || typeof clean !== 'function') return entity;
  const text = clean(entity.username, { limit: 48 });
  if (text === entity.username) return entity;
  return { ...entity, username: text || 'EMPTY' };
}
