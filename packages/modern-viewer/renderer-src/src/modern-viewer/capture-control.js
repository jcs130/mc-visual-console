/** Render control for dedicated, read-only screenshot pages. Socket state and
 * meshing stay live; ordinary viewers never install this protocol. */
export function installCaptureControl({ enabled, target = globalThis, setRendering }) {
  if (!enabled) return null;
  let active = true;
  let disposed = false;
  const control = Object.freeze({
    schema: 'mc-viewer-capture/v1',
    setActive(value) {
      if (disposed || typeof value !== 'boolean') throw new Error('CAPTURE_CONTROL_INVALID');
      if (active !== value) { setRendering(value); active = value; }
      return active;
    },
    get active() { return active; },
  });
  target.__mcCaptureControl = control;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      setRendering(false);
      if (target.__mcCaptureControl === control) delete target.__mcCaptureControl;
    },
  };
}
