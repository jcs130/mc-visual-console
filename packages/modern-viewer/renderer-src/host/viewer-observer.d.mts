export function createViewerObserverBridge(bot: any, options?: {
  now?: () => number; staleMs?: number; serializeWindow?: (window: any) => unknown;
}): {
  snapshot(): Record<string, any> | null;
  subscribeSocket(socket: any): () => void;
  dispose(): void;
};
