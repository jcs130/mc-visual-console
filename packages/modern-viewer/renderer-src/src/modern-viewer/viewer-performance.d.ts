export type ViewerQualityPreference = "auto" | "high" | "balanced" | "performance";

export interface ViewerQualitySnapshot {
  preference: ViewerQualityPreference;
  mode: Exclude<ViewerQualityPreference, "auto">;
  pixelRatio: number;
  nativePixelRatio: number;
  estimatedPixelWork: number;
  samples: number;
  changes: number;
  pressureStreak: number;
  recoveryStreak: number;
  lastFps: number | null;
  changed: boolean;
  reason: string | null;
}

export function createAdaptiveQualityController(options?: {
  nativePixelRatio?: number;
  maximumPixelRatio?: number;
  preference?: ViewerQualityPreference | string;
  lowFpsThreshold?: number;
  recoveryFpsThreshold?: number;
  pressureSamples?: number;
  recoverySamples?: number;
  warmupSamples?: number;
}): Readonly<{
  sample(sample?: { fps?: number; hidden?: boolean }): ViewerQualitySnapshot;
  getSnapshot(): ViewerQualitySnapshot;
}>;

export function normalizeQualityPreference(value: unknown): ViewerQualityPreference;

export function rateLimitDelayMs(
  lastRunAt: number,
  now: number,
  intervalMs: number,
): number;

export function highDetailNpcModelBudget(
  qualityMode: ViewerQualitySnapshot["mode"] | ViewerQualityPreference | string,
): number;

export function selectHighDetailNpcModelIds(
  candidates: ReadonlyArray<{
    id: unknown;
    priority?: unknown;
    distance?: unknown;
  }> | unknown,
  qualityMode: ViewerQualitySnapshot["mode"] | ViewerQualityPreference | string,
): readonly string[];
