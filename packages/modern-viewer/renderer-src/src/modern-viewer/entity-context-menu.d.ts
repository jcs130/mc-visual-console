export type EntityContextAction = "details" | "approach" | "attack";

export interface EntityContextMenuModel {
  readonly kind: "entity";
  readonly entityId: number;
  readonly name: string;
  readonly title: string;
  readonly subtitle: string;
  readonly category: string;
  readonly isPlayer: boolean;
  readonly isNpc: boolean;
  readonly isTamed: boolean;
  readonly details: readonly { readonly label: string; readonly value: string }[];
  readonly actions: readonly { readonly action: EntityContextAction; readonly label: string; readonly tone: string }[];
}

export interface BlockContextMenuModel {
  readonly kind: "block";
  readonly name: string;
  readonly title: string;
  readonly subtitle: string;
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly details: readonly { readonly label: string; readonly value: string }[];
  readonly actions: readonly { readonly action: "interact"; readonly label: string; readonly tone: string }[];
}

export function createEntityContextMenuModel(entity: unknown, playerPosition?: unknown, classified?: unknown): EntityContextMenuModel | null;
export function createInteractableBlockContextModel(block: unknown): BlockContextMenuModel | null;
export function createEntityContextActionMessage(model: EntityContextMenuModel, action: EntityContextAction): Readonly<Record<string, unknown>> | null;
export function createBlockContextActionMessage(model: BlockContextMenuModel, action: "interact"): Readonly<Record<string, unknown>> | null;
export function renderEntityContextMenu(root: unknown, model: EntityContextMenuModel | BlockContextMenuModel, x: number, y: number): boolean;
export function renderEntityDetailCard(root: unknown, model: EntityContextMenuModel): boolean;
export function hideEntityContextSurface(root: unknown): void;
