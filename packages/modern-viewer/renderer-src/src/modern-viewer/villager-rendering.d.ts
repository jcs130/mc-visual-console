import type { Object3D } from "three";

export interface VillagerTextureLayerPlan {
  readonly professionKey: string;
  readonly levelKey: string;
  readonly hasProfession: boolean;
  readonly hasTradeLevel: boolean;
}

export interface NativeVillagerRigDiagnostics {
  readonly rig: "native-villager-obj";
  readonly speed: number;
  readonly targetSpeed: number;
  readonly phase: number;
  readonly renderedFrames: number;
  readonly legPivotY: number;
  readonly disposed: boolean;
}

export interface NativeVillagerRigController {
  readonly schemaVersion: 1;
  updateEntity(entity: unknown, suppliedAt?: number): void;
  render(suppliedAt?: number): void;
  getDiagnostics(): NativeVillagerRigDiagnostics;
  dispose(): void;
}

export function villagerTextureLayerPlan(appearance: unknown): VillagerTextureLayerPlan;

export function ensureNativeVillagerRig(
  modelRoot: Object3D | null | undefined,
  entity: unknown,
  options?: { now?: () => number },
): NativeVillagerRigController | null;
