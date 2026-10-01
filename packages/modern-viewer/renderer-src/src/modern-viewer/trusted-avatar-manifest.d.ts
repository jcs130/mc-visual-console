export type TrustedAvatarFormat = "glb" | "vrm";

export interface TrustedAvatarPerformanceBudget {
  readonly maximumBytes: number;
  readonly maximumNodes: number;
  readonly maximumMeshes: number;
  readonly maximumTriangles: number;
  readonly maximumMaterials: number;
  readonly maximumTextures: number;
  readonly maximumTextureSize: number;
  readonly maximumBones: number;
  readonly maximumAnimationClips: number;
}

export interface TrustedAvatarAssetRecord {
  readonly id: string;
  readonly fileName: string;
  readonly url: string;
  readonly format: TrustedAvatarFormat;
  readonly mimeType: "model/gltf-binary";
  readonly characterIds: readonly string[];
  readonly priority: number;
  readonly license: string;
  readonly targetHeight: number;
  readonly rotationY: number;
  readonly performanceBudget: TrustedAvatarPerformanceBudget;
}

export const TRUSTED_AVATAR_MANIFEST_SCHEMA_VERSION: 1;
export const TRUSTED_AVATAR_HARD_LIMITS: TrustedAvatarPerformanceBudget;
export const TRUSTED_AVATAR_ASSET_ALLOWLIST: readonly TrustedAvatarAssetRecord[];
export function getTrustedAvatarAsset(assetId: string): TrustedAvatarAssetRecord | null;
export function resolveTrustedAvatarAsset(
  characterId: string,
  availableAssetIds?: ReadonlySet<string> | readonly string[],
): TrustedAvatarAssetRecord | null;
export function isTrustedAvatarAssetPath(urlPath: string): boolean;
