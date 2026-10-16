// Portable page shell used by the modern renderer. Historical corti-* DOM names
// remain part of the browser helper contract; no Cortico runtime is required.
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validatedDefaultAppearance, validatedSelectionScope } from './native-viewer/native-appearance-default.js';

const PAGE = readFileSync(new URL('./page-template.html', import.meta.url), 'utf8');
export const VIEWER_CSS = readFileSync(new URL('./viewer.css', import.meta.url), 'utf8');

/** @param {'first' | 'third' | '3dview'} [viewMode] */
export function renderViewerPage(viewMode = 'first', { basePath = '/', defaultAppearance = 'server', selectionScope } = {}) {
  if (viewMode === 'dungeon') viewMode = '3dview'; // Compatibility input only.
  if (!['first', 'third', '3dview'].includes(viewMode)) {
    throw new TypeError('Unsupported viewer mode');
  }
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath)) throw new TypeError('Unsupported viewer base path');
  // The validated ID alphabet excludes HTML delimiters and quotes.
  const page = PAGE.replace('__VIEW_MODE__', viewMode)
    .replace('__DEFAULT_APPEARANCE__', validatedDefaultAppearance(defaultAppearance))
    .replace('__SELECTION_SCOPE__', validatedSelectionScope(selectionScope) ?? '');
  return basePath === '/' ? page : page.replaceAll('href="/', `href="${basePath}`).replaceAll('src="/', `src="${basePath}`);
}

/** Emit page routes beside the exported textures and browser workers. */
export async function writeViewerPages(outputRoot) {
  const publicRoot = join(outputRoot, 'public');
  for (const [mode, route] of [['first', ''], ['third', 'third'], ['3dview', '3dview']]) {
    const directory = join(publicRoot, route);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'index.html'), renderViewerPage(mode));
  }
  await writeFile(join(publicRoot, 'viewer.css'), VIEWER_CSS);
}
