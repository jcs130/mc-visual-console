// Only a local presentation ID crosses the generated-page boundary.
export function validatedDefaultAppearance (value = 'server') {
  if (typeof value !== 'string' || value.length > 128 ||
      !/^(?:server|bundled:[A-Za-z0-9_-]+|native:[A-Za-z0-9_/-]+:[A-Za-z0-9_-]+)$/.test(value)) {
    throw new TypeError('Unsupported default viewer appearance')
  }
  return value
}

export function pageDefaultAppearance (document) {
  try { return validatedDefaultAppearance(document?.body?.dataset.nativeDefaultAppearance) }
  catch { return 'server' }
}
