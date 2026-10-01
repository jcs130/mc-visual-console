const namedPlayerIdentity = (playerName, identityName, identityKey) => Object.freeze({
  playerName,
  identityName,
  identityKey,
});

export const NAMED_PLAYER_CHARACTER_IDENTITIES = Object.freeze([
  namedPlayerIdentity("Naruto", "鸣人", "npc-ebc83899d36711020777c76a"),
  namedPlayerIdentity("Kirito", "桐人", "npc-948131665d02111ab1893c3e"),
  namedPlayerIdentity("Sasuke", "佐助", "npc-9c462ab638f094291422f900"),
  namedPlayerIdentity("Kakashi", "卡卡西", "npc-493159088b50d1768180d8f3"),
  namedPlayerIdentity("Minato", "波风水门", "npc-ad2cef9fdeb4fe33f86d6a4f"),
  namedPlayerIdentity("Hinata", "雏田", "npc-0c87a3488ef4ec33474c3618"),
  namedPlayerIdentity("Sakura", "小樱", "npc-8b2046193680ab75b17b5362"),
  namedPlayerIdentity("RockLee", "小李", "npc-3fa37bbc8a2c8b5e3c1e3425"),
  namedPlayerIdentity("Madara", "斑", "npc-2807b2e233cebfea411a8df5"),
  namedPlayerIdentity("ProfessionalXbot", "专业人物", "npc-c0322f61aa5fb5a3d27481cb"),
  namedPlayerIdentity("Soldier", "士兵", "npc-eaa8dd04fd6812c86800f56d"),
]);

const identitiesByNormalizedPlayerName = new Map(
  NAMED_PLAYER_CHARACTER_IDENTITIES.map((identity) => [normalizeExactPlayerName(identity.playerName), identity]),
);

/**
 * Resolve one protected named player without fuzzy aliases. The protocol
 * username is authoritative when present; displayName is only a fallback for
 * streams which omit username, so a renamed LanternWarden (or any other
 * player) can never inherit a traveller model through a cosmetic label.
 */
export function resolveNamedPlayerCharacterIdentity(entity) {
  const source = dataRecord(entity);
  const entityName = normalizeEntityType(dataProperty(source, "name"));
  if (entityName !== "player") return null;

  const username = stringDataProperty(source, "username");
  const displayName = stringDataProperty(source, "displayName");
  const candidate = username || displayName;
  if (!candidate) return null;
  return identitiesByNormalizedPlayerName.get(normalizeExactPlayerName(candidate)) ?? null;
}

export function isNamedPlayerCharacter(entity) {
  return resolveNamedPlayerCharacterIdentity(entity) !== null;
}

function normalizeExactPlayerName(value) {
  if (typeof value !== "string") return "";
  try {
    return value.normalize("NFKC").toLocaleLowerCase("en-US");
  } catch {
    return value.toLowerCase();
  }
}

function normalizeEntityType(value) {
  const normalized = normalizeExactPlayerName(value);
  return normalized.startsWith("minecraft:") ? normalized.slice("minecraft:".length) : normalized;
}

function dataRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : Object.freeze({});
}

function dataProperty(source, key) {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function stringDataProperty(source, key) {
  const value = dataProperty(source, key);
  return typeof value === "string" ? value : "";
}
