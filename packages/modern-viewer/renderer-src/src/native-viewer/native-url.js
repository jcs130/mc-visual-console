// A scoped body view uses the same bundles/assets without reaching another
// account's root /events or /status endpoint.
export function nativeViewerUrl (path, base = document.baseURI) {
  return new URL(path.replace(/^\/+/, ''), base).href
}
