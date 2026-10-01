export interface ViewerEffectPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type ViewerEffectEvent =
  | { readonly schemaVersion: 1; readonly kind: "particle"; readonly source: "server-particle"; readonly name: string; readonly position: ViewerEffectPosition; readonly offset: ViewerEffectPosition; readonly count: number; readonly speed: number }
  | { readonly schemaVersion: 1; readonly kind: "sound"; readonly source: "server-sound"; readonly name: string; readonly position: ViewerEffectPosition; readonly volume: number; readonly pitch: number }
  | { readonly schemaVersion: 1; readonly kind: "status"; readonly source: "server-status"; readonly phase: "start" | "end"; readonly entityId: number | null; readonly position: ViewerEffectPosition | null; readonly effectId: number; readonly effectName: string; readonly amplifier: number; readonly durationTicks: number }
  | { readonly schemaVersion: 1; readonly kind: "burst"; readonly source: "server-entity-event"; readonly style: "critical" | "magic_critical" | "hurt" | "death" | "firework"; readonly entityId: number | null; readonly position: ViewerEffectPosition };

export interface SkillChatHint {
  readonly id: string;
  readonly source: "chat-inference";
  readonly sourceLabel: "聊天推断（非服务器粒子）";
  readonly actor: string;
  readonly skill: string;
  readonly evidence: string;
}

export const VIEWER_EFFECT_LIMITS: Readonly<{
  maximumActiveEffects: number;
  maximumActiveParticles: number;
  maximumParticlesPerEvent: number;
  maximumEventsPerSecond: number;
  maximumLifetimeMs: number;
  maximumChatHintsRemembered: number;
}>;

export function normalizeViewerEffectEvent(value: unknown): ViewerEffectEvent | null;
export function detectSkillChatHint(message: unknown): SkillChatHint | null;

export class ViewerEffectSystem {
  constructor(options?: {
    getWorld?: () => unknown;
    getEntity?: (id: number) => unknown;
    cueElement?: HTMLElement | null;
    now?: () => number;
    requestFrame?: (callback: FrameRequestCallback) => number;
    cancelFrame?: (handle: number) => void;
  });
  handle(value: unknown): boolean;
  ingestChat(messages: unknown[]): SkillChatHint | null;
  setSuspended(value: boolean): void;
  getDiagnostics(): Record<string, unknown>;
  dispose(): void;
}
