import type {
  CustomCharacterDefinition,
  CustomCharacterEntity,
} from "./custom-characters.js";

export type NpcPortraitSource = "concept" | "procedural-2d" | "fallback";
export type NpcPortraitTheme = "guofeng" | "scroll" | "pixel";
export type NpcPortraitCropPosition = "0%" | "50%" | "100%" | null;

export interface NpcPortraitCrop {
  readonly url: string;
  readonly columns: 1 | 2 | 3 | 4;
  readonly index: number;
}

export interface NpcPortraitSpec {
  readonly id: string;
  readonly identityName: string;
  readonly theme: NpcPortraitTheme;
  readonly source: NpcPortraitSource;
  readonly portraitUrl: string | null;
  readonly cropPosition: NpcPortraitCropPosition;
  readonly portraitCrop: NpcPortraitCrop | null;
  readonly definition: CustomCharacterDefinition;
}

export interface NpcPortraitResult {
  readonly id: string;
  readonly identityName: string;
  readonly theme: NpcPortraitTheme;
  readonly source: NpcPortraitSource;
  readonly portraitUrl: string | null;
  readonly cropPosition: NpcPortraitCropPosition;
  readonly portraitCrop: NpcPortraitCrop | null;
  readonly width: number;
  readonly height: number;
}

export interface NpcPortraitRendererOptions {
  width?: number;
  height?: number;
  pixelRatio?: number;
}

export interface NpcPortraitComposition {
  readonly id: string;
  readonly identityName: string;
  readonly archetype: CustomCharacterDefinition["archetype"];
  readonly headgear: string;
  readonly prop: string;
  readonly palette: Readonly<CustomCharacterDefinition["palette"]>;
  readonly skin: string;
  readonly hair: string;
  readonly eyes: string;
  readonly hairStyle: CustomCharacterDefinition["hairStyle"];
  readonly beard: boolean;
  readonly cape: boolean;
  readonly robe: boolean;
  readonly seed: number;
  readonly variant: number;
  readonly glance: number;
  readonly profession: string;
}

export interface NpcPortraitDiagnostics {
  readonly disposed: boolean;
  readonly initialized: boolean;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly renderCount: number;
  readonly source: NpcPortraitSource | null;
  readonly characterId: string | null;
  readonly error: string | null;
}

export const CORE_NPC_PORTRAIT_URL: "/npc-portraits/core-trio-anime-v2.png";
export const PROFESSION_NPC_PORTRAIT_URL_A: "/npc-portraits/professions-a.png";
export const PROFESSION_NPC_PORTRAIT_URL_B: "/npc-portraits/professions-b.png";
export const GUOFENG_NPC_PORTRAIT_URL_A: "/npc-portraits/guofeng-a.png";
export const GUOFENG_NPC_PORTRAIT_URL_B: "/npc-portraits/anime-professions-b-v2.png";
export const NAMED_TRAVELLERS_PORTRAIT_URL: "/npc-portraits/named-travellers-fullbody-v3.png";
export const SPECIAL_CAST_PORTRAIT_URL: "/npc-portraits/village-special-cast-anime-v2.png";
export const GUILD_RECEPTIONIST_PORTRAIT_URL: "/npc-portraits/guild-receptionist-lan-fullbody-v3.png";

export function resolveNpcPortraitSpec<T extends CustomCharacterDefinition>(definition: T): NpcPortraitSpec;
export function resolveNpcPortraitSpec<T extends CustomCharacterDefinition>(
  definition: T,
  options: { theme?: NpcPortraitTheme },
): NpcPortraitSpec;
export function resolveNpcPortraitSpec(definition: null | undefined): null;

export function createFallbackNpcPortraitDefinition(
  profile?: unknown,
  entity?: unknown,
  archetype?: string,
): CustomCharacterDefinition;

export function createNpcPortraitComposition(
  definition: CustomCharacterDefinition,
  entity?: CustomCharacterEntity,
): NpcPortraitComposition;

export class NpcPortraitRenderer {
  constructor(canvas: HTMLCanvasElement, options?: NpcPortraitRendererOptions);
  render(
    definition: CustomCharacterDefinition,
    entity?: CustomCharacterEntity,
    options?: { theme?: NpcPortraitTheme },
  ): NpcPortraitResult;
  clear(): void;
  dispose(): void;
  getDiagnostics(): NpcPortraitDiagnostics;
}
