export interface NamedPlayerCharacterIdentity {
  readonly playerName: "Naruto" | "Kirito" | "Sasuke" | "Kakashi" | "Minato" | "Hinata" | "Sakura" | "RockLee" | "Madara" | "ProfessionalXbot" | "Soldier";
  readonly identityName: "鸣人" | "桐人" | "佐助" | "卡卡西" | "波风水门" | "雏田" | "小樱" | "小李" | "斑" | "专业人物" | "士兵";
  readonly identityKey: string;
}

export interface NamedPlayerCharacterEntity {
  name?: string;
  username?: string;
  displayName?: string;
}

export const NAMED_PLAYER_CHARACTER_IDENTITIES: readonly NamedPlayerCharacterIdentity[];
export function resolveNamedPlayerCharacterIdentity(
  entity: NamedPlayerCharacterEntity | null | undefined,
): NamedPlayerCharacterIdentity | null;
export function isNamedPlayerCharacter(entity: NamedPlayerCharacterEntity | null | undefined): boolean;
