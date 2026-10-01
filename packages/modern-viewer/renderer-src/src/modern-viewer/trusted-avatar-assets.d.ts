import type { Object3D, Group } from "three";
import type { TrustedAvatarAssetRecord } from "./trusted-avatar-manifest.js";

export interface TrustedAvatarCreatedInstance {
  readonly root: Group;
  readonly asset: TrustedAvatarAssetRecord;
  readonly controller: {
    updateEntity(entity: object): unknown;
    play(action: string, options?: object): boolean;
    getDiagnostics(): Record<string, unknown>;
    dispose(): void;
  };
  readonly diagnostics: Record<string, unknown> & { healthy: true };
}

export class TrustedAvatarAssetPipeline {
  constructor(options?: Record<string, unknown>);
  availableAssetIds(): Promise<Set<string>>;
  loadCharacter(characterId: string, entity: object, visualProfile?: object | null): Promise<TrustedAvatarCreatedInstance | null>;
  loadAsset(assetId: string, entity: object, visualProfile?: object | null): Promise<TrustedAvatarCreatedInstance | null>;
  mount(options: {
    key: string | number;
    characterId: string;
    entity: object;
    visualProfile?: object | null;
    isCurrent?: () => boolean;
    install: (created: TrustedAvatarCreatedInstance) => boolean;
  }): Promise<{ status: "mounted" | "fallback" | "stale"; assetId: string | null }>;
  mountAsset(options: {
    key: string | number;
    assetId: string;
    entity: object;
    visualProfile?: object | null;
    isCurrent?: () => boolean;
    install: (created: TrustedAvatarCreatedInstance) => boolean;
  }): Promise<{ status: "mounted" | "fallback" | "stale"; assetId: string | null }>;
  cancel(key: string | number): void;
  getDiagnostics(): Record<string, unknown>;
  dispose(): void;
}

export function parseTrustedAvatarAsset(asset: TrustedAvatarAssetRecord, bytes: ArrayBuffer): Promise<Record<string, unknown>>;
export function createTrustedAvatarInstance(
  asset: TrustedAvatarAssetRecord,
  parsed: Record<string, unknown>,
  entity: object,
  options?: Record<string, unknown>,
): TrustedAvatarCreatedInstance;
export function prepareTrustedAvatarAppearance(
  root: Object3D,
  asset?: Partial<TrustedAvatarAssetRecord>,
): Readonly<Record<string, unknown>>;
export function inspectAvatarScene(root: Object3D, animations?: readonly object[]): Record<string, number>;
export function assertWithinPerformanceBudget(stats: object, budget?: object): true;
export function resolveHumanoidBoneMap(root: Object3D, vrm?: object | null): Record<string, Object3D | null>;
export function validateAvailabilityPayload(payload: unknown): Set<string>;
