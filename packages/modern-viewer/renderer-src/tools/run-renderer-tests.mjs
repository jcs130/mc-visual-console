import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const originalAssets = fileURLToPath(new URL('../../asset-packs/native-1.21.1/', import.meta.url));
const tests = fileURLToPath(new URL('./test/', import.meta.url));
const files = (await readdir(tests)).filter(name => name.endsWith('.test.mjs')).sort().map(name => tests + name);
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', env: {
  ...process.env,
  NATIVE_GUIDE_ASSET_DIR: process.env.NATIVE_GUIDE_ASSET_DIR ?? originalAssets,
  NATIVE_YSM_ASSET_DIR: process.env.NATIVE_YSM_ASSET_DIR ?? originalAssets,
} });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
