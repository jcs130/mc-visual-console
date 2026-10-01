const ENTITY_NAME_ALIASES: Readonly<Record<string, string>> = {
  minecraft_villager: "villager",
  minecraft_zombie: "zombie",
  villager_v2: "villager",
  zombie_villager_v2: "zombie_villager",
};

export const VILLAGER_TYPE_KEYS = ["desert", "jungle", "plains", "savanna", "snow", "swamp", "taiga"] as const;
export const VILLAGER_PROFESSION_KEYS = [
  "none",
  "armorer",
  "butcher",
  "cartographer",
  "cleric",
  "farmer",
  "fisherman",
  "fletcher",
  "leatherworker",
  "librarian",
  "mason",
  "nitwit",
  "shepherd",
  "toolsmith",
  "weaponsmith",
] as const;
export const VILLAGER_LEVEL_KEYS = ["none", "stone", "iron", "gold", "emerald", "diamond"] as const;

const VILLAGER_TYPE_LABELS = ["沙漠", "丛林", "平原", "热带草原", "雪原", "沼泽", "针叶林"] as const;
const VILLAGER_PROFESSION_LABELS = [
  "无职业",
  "盔甲匠",
  "屠夫",
  "制图师",
  "牧师",
  "农民",
  "渔夫",
  "制箭师",
  "皮匠",
  "图书管理员",
  "石匠",
  "傻子",
  "牧羊人",
  "工具匠",
  "武器匠",
] as const;
const VILLAGER_LEVEL_LABELS = ["未交易", "新手", "学徒", "熟练工", "专家", "大师"] as const;

export interface VillagerAppearance {
  typeId: number;
  typeKey: (typeof VILLAGER_TYPE_KEYS)[number];
  typeLabel: string;
  professionId: number;
  professionKey: (typeof VILLAGER_PROFESSION_KEYS)[number];
  professionLabel: string;
  levelId: number;
  levelKey: (typeof VILLAGER_LEVEL_KEYS)[number];
  levelLabel: string;
}

/** Decode the fixed Java-edition villager registries carried in entity metadata. */
export function decodeVillagerAppearance(value: unknown): VillagerAppearance | undefined {
  const data = findVillagerData(value);
  if (!data) return undefined;
  const typeId = boundedInteger(data.villagerType, 0, VILLAGER_TYPE_KEYS.length - 1, 2);
  const professionId = boundedInteger(data.villagerProfession, 0, VILLAGER_PROFESSION_KEYS.length - 1, 0);
  const levelId = boundedInteger(data.level, 1, VILLAGER_LEVEL_KEYS.length - 1, 1);
  return {
    typeId,
    typeKey: VILLAGER_TYPE_KEYS[typeId]!,
    typeLabel: VILLAGER_TYPE_LABELS[typeId]!,
    professionId,
    professionKey: VILLAGER_PROFESSION_KEYS[professionId]!,
    professionLabel: VILLAGER_PROFESSION_LABELS[professionId]!,
    levelId,
    levelKey: VILLAGER_LEVEL_KEYS[levelId]!,
    levelLabel: VILLAGER_LEVEL_LABELS[levelId]!,
  };
}

function findVillagerData(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): { villagerType: unknown; villagerProfession: unknown; level: unknown } | undefined {
  if (!value || typeof value !== "object" || depth >= 5 || ArrayBuffer.isView(value)) return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (const entry of value.slice(0, 64)) {
        const match = findVillagerData(entry, depth + 1, seen);
        if (match) return match;
      }
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const normalized = new Map(
      Object.entries(record).map(([key, entry]) => [key.replaceAll("_", "").toLowerCase(), entry]),
    );
    if (normalized.has("villagertype") && normalized.has("villagerprofession") && normalized.has("level")) {
      return {
        villagerType: normalized.get("villagertype"),
        villagerProfession: normalized.get("villagerprofession"),
        level: normalized.get("level"),
      };
    }
    for (const entry of Object.values(record).slice(0, 48)) {
      const match = findVillagerData(entry, depth + 1, seen);
      if (match) return match;
    }
    return undefined;
  } finally {
    seen.delete(value);
  }
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

export function canonicalEntityName(value: unknown): string {
  if (typeof value !== "string") return "";
  const canonical = value
    .trim()
    .replace(/^minecraft:/iu, "")
    .replace(/([a-z\d])([A-Z])/gu, "$1_$2")
    .replace(/[\s-]+/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/^_|_$/gu, "")
    .toLowerCase();
  return ENTITY_NAME_ALIASES[canonical] ?? canonical;
}

export function normalizeMinecraftTime(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((Math.trunc(value) % 24_000) + 24_000) % 24_000;
}

/** Matches the renderer's 0-12000 day, 13000-23000 night transitions. */
export function minecraftDaylightFactor(value: number): number {
  const time = normalizeMinecraftTime(value);
  if (time < 12_000) return 1;
  if (time < 13_000) return 1 - (time - 12_000) / 1_000;
  if (time < 23_000) return 0;
  return (time - 23_000) / 1_000;
}

export function minecraftLightLevels(value: number): { ambient: number; directional: number; daylight: number } {
  const daylight = minecraftDaylightFactor(value);
  return {
    ambient: 0.16 + daylight * 0.84,
    directional: 0.06 + daylight * 0.44,
    daylight,
  };
}
