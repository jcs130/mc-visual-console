export interface PlayerModelDefinition {
  readonly id: string;
  readonly label: string;
  readonly subtitle: string;
  readonly kind: "trusted-avatar" | "minecraft-classic";
  readonly assetId: string | null;
  readonly presentation: "masculine" | "feminine" | "classic";
  readonly accent: string;
}

export const PLAYER_MODEL_SCHEMA_VERSION: 1;
export const DEFAULT_PLAYER_MODEL_ID: string;
export const PLAYER_MODELS: readonly Readonly<PlayerModelDefinition>[];
export function isPlayerModelId(value: unknown): value is string;
export function resolvePlayerModel(value?: string): Readonly<PlayerModelDefinition>;
