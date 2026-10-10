export const APPEARANCE_CHANNEL: string;
export const PAPER_YSM_JAR_SHA256: string;
export function parseAppearancePacket(packet: unknown): Record<string, unknown> | null;
export function createViewerAppearanceBridge(bot: any, options?: { now?: () => number }): {
  snapshot(): Array<Record<string, unknown>>;
  subscribeSocket(socket: { emit(name: string, value: unknown): unknown }): () => void;
  dispose(): void;
};
