// Native renderer tests compare against the original export that is checked in
// under packages/modern-viewer/asset-packs/native-1.21.1. run-renderer-tests.mjs
// already points NATIVE_GUIDE_ASSET_DIR / NATIVE_YSM_ASSET_DIR there; importing
// this module gives a single `node --test <file>` run the same defaults. An
// explicitly exported directory in the environment still wins.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const trackedExport = fileURLToPath(new URL('../../../../asset-packs/native-1.21.1/', import.meta.url));
if (existsSync(trackedExport)) {
  process.env.NATIVE_GUIDE_ASSET_DIR ??= trackedExport;
  process.env.NATIVE_YSM_ASSET_DIR ??= trackedExport;
}
export const NATIVE_TRACKED_EXPORT = trackedExport;
