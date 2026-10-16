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

export function validatedSelectionScope (value) {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || !/^[a-f0-9]{24,64}$/.test(value)) {
    throw new TypeError('Unsupported viewer appearance scope')
  }
  return value
}

export function pageSelectionScope (document) {
  try { return validatedSelectionScope(document?.body?.dataset.nativeSelectionScope) }
  catch { return undefined }
}
