import { realpath } from 'node:fs/promises';
import path from 'node:path';

/** A proxy and its subscribers must share the same module-level WeakMap. */
export async function viewerReactiveModule(sourceRoot) {
  const entry = await realpath(path.join(sourceRoot, 'node_modules', 'valtio', 'esm', 'vanilla.mjs'));
  return { name: 'viewer-reactive-module', setup(build) {
    build.onResolve({ filter: /^valtio(?:\/vanilla)?$/ }, () => ({ path: entry }));
  } };
}
