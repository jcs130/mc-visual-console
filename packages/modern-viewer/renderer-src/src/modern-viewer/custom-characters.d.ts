import type { Group } from "three";

export interface CustomCharacterDefinition {
  id: string;
  identityName: string;
  identityKey: string;
  archetype: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
  };
  headgear: string;
  prop: string;
  skin: string;
  hair: string;
  eyes: string;
  hairStyle: string;
  beard: boolean;
  cape: boolean;
  robe: boolean;
}

export interface CustomCharacterEntity {
  id?: string | number;
  name?: string;
  username?: string;
  displayName?: string;
  identityName?: string;
  identityKey?: string;
  pos?: { x: number; y: number; z: number };
  position?: { x: number; y: number; z: number };
}

export interface CreatedCustomCharacter {
  root: Group;
  controller: {
    updateEntity(entity: CustomCharacterEntity): void;
    play(action: string, options?: { durationMs?: number; hand?: "left" | "right" }): boolean;
    getDiagnostics(): Record<string, unknown>;
    dispose(): void;
  };
  definition: CustomCharacterDefinition;
  diagnostics: {
    modelKind: "procedural-original";
    textureUv: "procedural-pixel-materials" | "procedural-toon-gradient";
    renderStyle: "pixel-lambert" | "anime-toon";
    styleId: string | null;
    meshes: number;
    materials: number;
    textures: number;
    triangles: number;
    performanceBudget: {
      maximumMeshes: number;
      maximumTriangles: number;
      maximumMaterials: number;
      withinBudget: boolean;
    } | null;
    partCounts: Record<string, number>;
    missingParts: string[];
    healthy: boolean;
  };
}

export interface AnimeHeroModelProfile {
  readonly styleId: string;
  readonly bodyType: "agile" | "slender";
  readonly accessoryPosition: readonly [number, number, number];
  readonly maximumMeshes: number;
  readonly maximumTriangles: number;
  readonly maximumMaterials: number;
}

export const CUSTOM_CHARACTER_DEFINITIONS: readonly CustomCharacterDefinition[];
export const ANIME_HERO_MODEL_PROFILES: Readonly<Record<"ninja" | "swordsman", AnimeHeroModelProfile>>;
export function resolveAnimeHeroModelProfile(
  definition: CustomCharacterDefinition | null | undefined,
): AnimeHeroModelProfile | null;
export function resolveCustomCharacterDefinition(entity: CustomCharacterEntity | null | undefined): CustomCharacterDefinition | null;
export function createCustomCharacter(
  definition: CustomCharacterDefinition,
  entity: CustomCharacterEntity,
): CreatedCustomCharacter;
