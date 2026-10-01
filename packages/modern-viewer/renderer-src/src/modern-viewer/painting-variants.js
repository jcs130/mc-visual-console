/**
 * Minecraft Java 1.21.1 painting registry order and dimensions.
 *
 * Mineflayer exposes the painting variant as a numeric registry id in entity
 * metadata slot 8. Keeping this small data-only table next to the viewer lets
 * both the loopback server and the browser resolve exactly the same trusted,
 * local texture URL without accepting a path from the game server.
 */

const records = [
  ["alban", 1, 1],
  ["aztec", 1, 1],
  ["aztec2", 1, 1],
  ["backyard", 3, 4],
  ["baroque", 2, 2],
  ["bomb", 1, 1],
  ["bouquet", 3, 3],
  ["burning_skull", 4, 4],
  ["bust", 2, 2],
  ["cavebird", 3, 3],
  ["changing", 4, 2],
  ["cotan", 3, 3],
  ["courbet", 2, 1],
  ["creebet", 2, 1],
  ["donkey_kong", 4, 3],
  ["earth", 2, 2],
  ["endboss", 3, 3],
  ["fern", 3, 3],
  ["fighters", 4, 2],
  ["finding", 4, 2],
  ["fire", 2, 2],
  ["graham", 1, 2],
  ["humble", 2, 2],
  ["kebab", 1, 1],
  ["lowmist", 4, 2],
  ["match", 2, 2],
  ["meditative", 1, 1],
  ["orb", 4, 4],
  ["owlemons", 3, 3],
  ["passage", 4, 2],
  ["pigscene", 4, 4],
  ["plant", 1, 1],
  ["pointer", 4, 4],
  ["pond", 3, 4],
  ["pool", 2, 1],
  ["prairie_ride", 1, 2],
  ["sea", 2, 1],
  ["skeleton", 4, 3],
  ["skull_and_roses", 2, 2],
  ["stage", 2, 2],
  ["sunflowers", 3, 3],
  ["sunset", 2, 1],
  ["tides", 3, 3],
  ["unpacked", 4, 4],
  ["void", 2, 2],
  ["wanderer", 1, 2],
  ["wasteland", 1, 1],
  ["water", 2, 2],
  ["wind", 2, 2],
  ["wither", 2, 2],
];

export const MINECRAFT_PAINTING_VARIANTS = Object.freeze(records.map(([name, width, height], id) => Object.freeze({
  id,
  name,
  width,
  height,
  textureUrl: `/minecraft-assets/painting/${name}.png`,
})));

const variantsByName = new Map(MINECRAFT_PAINTING_VARIANTS.map((variant) => [variant.name, variant]));

export function extractPaintingVariantId(entity) {
  const metadata = entity?.metadata;
  const metadataEntry = Array.isArray(metadata) ? metadata[8] : metadata?.[8];
  const candidates = [
    entity?.paintingVariantId,
    entity?.variantId,
    metadataEntry?.variantId,
    metadataEntry?.value?.variantId,
    typeof metadataEntry === "number" ? metadataEntry : null,
  ];
  for (const candidate of candidates) {
    const id = Number(candidate);
    if (Number.isSafeInteger(id) && id >= 0 && id < MINECRAFT_PAINTING_VARIANTS.length) return id;
  }
  return null;
}

export function resolvePaintingVariant(value) {
  if (value && typeof value === "object") {
    const id = extractPaintingVariantId(value);
    if (id !== null) return MINECRAFT_PAINTING_VARIANTS[id] ?? null;
    const name = String(value.name || value.assetId || "").replace(/^minecraft:/u, "");
    return variantsByName.get(name) ?? null;
  }
  const numeric = Number(value);
  if (Number.isSafeInteger(numeric)) return MINECRAFT_PAINTING_VARIANTS[numeric] ?? null;
  return variantsByName.get(String(value || "").replace(/^minecraft:/u, "")) ?? null;
}
