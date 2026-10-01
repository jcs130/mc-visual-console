export type DungeonInteractionCategory = "npc" | "hostile" | "other" | "unavailable";
export type DungeonInteractionAction = "view" | "attack" | "details" | "none";
export type DungeonInteractionTone = "friendly" | "danger" | "neutral" | "muted";
export type DungeonInteractionCursor = "pointer" | "crosshair" | "help" | "default";

export interface DungeonInteraction {
  readonly category: DungeonInteractionCategory;
  readonly action: DungeonInteractionAction;
  readonly canView: boolean;
  readonly canAttack: boolean;
  readonly cursor: DungeonInteractionCursor;
  readonly tone: DungeonInteractionTone;
  readonly reason: "invalid" | "self" | "removed" | "dead" | "invisible" | null;
}

export interface DungeonHoverLabel {
  readonly visible: boolean;
  readonly entityId: string | null;
  readonly title: string;
  readonly subtitle: string;
  readonly badge: string;
  readonly actionLabel: string;
  readonly category: DungeonInteractionCategory;
  readonly action: DungeonInteractionAction;
  readonly tone: DungeonInteractionTone;
  readonly cursor: DungeonInteractionCursor;
  readonly canAttack: boolean;
  readonly ariaLabel: string;
}

export function classifyDungeonInteraction(entity: unknown): DungeonInteraction;
export function isDungeonInteractionCandidate(entity: unknown): boolean;
export function createDungeonHoverLabel(
  entity: unknown,
  classifiedInteraction?: DungeonInteraction,
): DungeonHoverLabel;
