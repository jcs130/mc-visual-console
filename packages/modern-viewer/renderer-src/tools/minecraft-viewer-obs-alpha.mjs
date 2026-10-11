/** minecraft-renderer 0.1.96 doesn't expose alpha in its WebGL options.
 * Opt in only for OBS. Normal game and photo renderers retain their context.
 * Fail the build if upstream changes instead of shipping an opaque overlay. */
export function patchObsRendererAlpha(source) {
  const anchor = 'preserveDrawingBuffer:!0,logarithmicDepthBuffer:!0';
  if (source.split(anchor).length !== 2) throw Error('OBS WebGL alpha 源码锚点已变化');
  return source.replace(anchor, 'preserveDrawingBuffer:!0,alpha:!!this.config.obsOverlay,logarithmicDepthBuffer:!0');
}
