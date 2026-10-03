// Portable page shell used by the modern renderer. Historical corti-* DOM names
// remain part of the browser helper contract; no Cortico runtime is required.
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PAGE = readFileSync(new URL('./page-template.html', import.meta.url), 'utf8');
export const VIEWER_CSS = readFileSync(new URL('./viewer.css', import.meta.url), 'utf8');

/** @param {'first' | 'third' | 'dungeon'} [viewMode] */
export function renderViewerPage(viewMode = 'first') {
  if (!['first', 'third', 'dungeon'].includes(viewMode)) {
    throw new TypeError('Unsupported viewer mode');
  }
  return PAGE.replace('__VIEW_MODE__', viewMode);
}

/** Emit page routes beside the exported textures and browser workers. */
export async function writeViewerPages(outputRoot) {
  const publicRoot = join(outputRoot, 'public');
  for (const [mode, route] of [['first', ''], ['third', 'third'], ['dungeon', 'dungeon']]) {
    const directory = join(publicRoot, route);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'index.html'), renderViewerPage(mode));
  }
  await writeFile(join(publicRoot, 'viewer.css'), VIEWER_CSS);
}
