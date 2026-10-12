import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkViewerBuild } from '../packages/modern-viewer/renderer-src/tools/viewer-build-source.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = process.argv[2];
if (!assets) throw Error('Usage: node tools/check-viewer-build.mjs <existing-asset-directory>');
const result = await checkViewerBuild(path.join(root, 'packages/modern-viewer/renderer-src'), path.resolve(assets));
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
