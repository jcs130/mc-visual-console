import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { browserBundle } from './native-world-preview-host.mjs';
import { renderViewerPage, VIEWER_CSS } from '../src/viewer-page.mjs';
import { viewerSourceDigest } from './viewer-build-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function buildSpectatorSite(output) {
  const files = new Map([
    ['client.js', await browserBundle(path.join(root, 'src/native-viewer/world-preview.js'))],
    ['native-console.js', await browserBundle(path.join(root, 'src/native-viewer/native-console.js'))],
    // CSS URLs resolve beside this trusted stylesheet under /watch/:id/.
    ['viewer.css', Buffer.from(VIEWER_CSS.replace(/url\((['"]?)\//g, 'url($1'))],
    ...['first', 'third', '3dview'].map(mode => [mode + '.html', Buffer.from(renderViewerPage(mode, { basePath: '/__mc_spectator_base__/' }))])
  ]);
  await mkdir(output, { recursive: true });
  const manifest = { schemaVersion: 1, protocol: 'mc-spectator/1',
    buildSource: await viewerSourceDigest(root, { standaloneNative: true }), files: {} };
  for (const [name, bytes] of files) {
    await writeFile(path.join(output, name), bytes);
    manifest.files[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  // These standalone modules have only Node built-ins; the portal injects its
  // explicit ws dependency. There is no game connector in this site artifact.
  for (const name of ['spectator-protocol.mjs', 'spectator-site.mjs', 'spectator-relay.mjs', 'spectator-fanout.mjs']) {
    await copyFile(path.join(root, 'host', name), path.join(output, name));
  }
  await writeFile(path.join(output,'spectator-public.mjs'),(await readFile(path.join(root,'host/spectator-public.mjs'),'utf8')).replace("'../src/native-viewer/native-item-stack.js'","'./native-item-stack.js'"));
  await copyFile(path.join(root,'src/native-viewer/native-item-stack.js'),path.join(output,'native-item-stack.js'));
  await writeFile(path.join(output, 'spectator-site.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw Error('Usage: node tools/build-native-spectator-site.mjs <operator-site-directory>');
  const result = await buildSpectatorSite(path.resolve(process.argv[2]));
  console.log(JSON.stringify({ protocol: result.protocol, source: result.buildSource, files: result.files }));
}
