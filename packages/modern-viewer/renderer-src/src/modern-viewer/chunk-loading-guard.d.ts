export function pendingChunkOrigins(
  center: { x: number; z: number } | null,
  distance: number,
  finishedChunks: Record<string, boolean> | null,
): Array<{ x: number; z: number }>
