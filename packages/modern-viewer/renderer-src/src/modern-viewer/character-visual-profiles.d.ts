export type CharacterGenderPresentation = "masculine" | "feminine";
export type CharacterLifeStage = "child" | "young-adult" | "adult" | "middle-aged" | "older-adult";
export type CharacterStature = "short" | "average" | "tall";
export type CharacterBuild = "child" | "slender" | "lean" | "athletic" | "average" | "sturdy" | "broad" | "stocky" | "rugged" | "round";

export interface CharacterVisualProfile {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly identityName: string;
  readonly identityKey: string;
  readonly presentation: {
    readonly gender: CharacterGenderPresentation;
    readonly lifeStage: CharacterLifeStage;
    readonly stature: CharacterStature;
    readonly build: CharacterBuild;
  };
  readonly proportions: {
    readonly heightScale: number;
    readonly shoulderScale: number;
    readonly headScale: number;
  };
  readonly face: {
    readonly shape: string;
    readonly skinTone: string;
    readonly eyeColor: string;
    readonly eyeShape: string;
    readonly facialHair: string;
    readonly distinguishingMarks: readonly string[];
  };
  readonly hair: {
    readonly style: string;
    readonly length: string;
    readonly color: string;
    readonly ornaments: readonly string[];
  };
  readonly outfit: {
    readonly silhouette: string;
    readonly palette: Readonly<Record<"primary" | "secondary" | "accent" | "metal", string>>;
    readonly layers: readonly {
      readonly slot: string;
      readonly garment: string;
      readonly material: string;
      readonly color: "primary" | "secondary" | "accent" | "metal";
      readonly detail: string;
    }[];
  };
  readonly props: readonly {
    readonly id: string;
    readonly label: string;
    readonly category: string;
    readonly attachment: string;
    readonly color: string;
  }[];
  readonly profession: {
    readonly key: string;
    readonly label: string;
    readonly defaultPose: string;
  };
  readonly signatureMotif: string;
  readonly signatureFeatures: readonly string[];
  readonly asset: {
    readonly manifestId: string;
    readonly preferredFormat: "glb";
    readonly acceptedFormats: readonly ["glb", "vrm"];
    readonly rig: "humanoid-standard-v1";
    readonly animationSet: "lantern-humanoid-v1";
    readonly fallbackRenderer: "procedural-toon-v2";
    readonly budget: {
      readonly maximumTriangles: number;
      readonly maximumMaterials: number;
      readonly maximumTextures: number;
      readonly maximumTextureSize: number;
    };
  };
  readonly fallback: {
    readonly archetype: string;
    readonly headgear: string;
    readonly prop: string;
    readonly hairStyle: string;
    readonly beard: boolean;
    readonly cape: boolean;
    readonly robe: boolean;
  };
}

export interface CharacterVisualAudit {
  readonly healthy: boolean;
  readonly definitions: number;
  readonly profiles: number;
  readonly matched: number;
  readonly missing: readonly { readonly identityName: string; readonly identityKey: string }[];
  readonly orphaned: readonly { readonly identityName: string; readonly identityKey: string }[];
  readonly duplicateAppearanceSignatures: readonly { readonly signature: string; readonly identityNames: readonly string[] }[];
  readonly invalid: readonly string[];
}

export const CHARACTER_VISUAL_PROFILE_SCHEMA_VERSION: 1;
export const CHARACTER_VISUAL_PROFILES: readonly CharacterVisualProfile[];
export function getCharacterVisualProfile(identityKey: string | null | undefined): CharacterVisualProfile | null;
export function resolveCharacterVisualProfile(value: { identityName?: string; identityKey?: string } | null | undefined): CharacterVisualProfile | null;
export function createCharacterVisualSignature(profile: CharacterVisualProfile | null | undefined): string;
export function auditCharacterVisualProfiles(definitions: readonly { identityName: string; identityKey: string }[] | null | undefined): CharacterVisualAudit;
