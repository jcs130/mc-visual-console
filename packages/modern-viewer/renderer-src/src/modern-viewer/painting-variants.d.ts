export interface MinecraftPaintingVariant {
  readonly id: number;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly textureUrl: string;
}

export const MINECRAFT_PAINTING_VARIANTS: readonly MinecraftPaintingVariant[];
export function extractPaintingVariantId(entity: unknown): number | null;
export function resolvePaintingVariant(value: unknown): MinecraftPaintingVariant | null;
