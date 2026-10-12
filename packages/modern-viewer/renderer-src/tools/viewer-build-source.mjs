import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** A portable digest of the renderer AND its Mineflayer host adapters. */
export async function viewerSourceDigest(rendererRoot) {
  const root = path.resolve(rendererRoot), files = [];
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', 'assets', 'asset-packs', 'public', 'dist', 'test'].includes(entry.name)) continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && /\.(?:mjs|mts|js|ts|json|css|html)$/.test(entry.name)) files.push(file);
    }
  }
  await walk(root);
  const host = path.resolve(root, '../src');
  await walk(host);
  if (files.length > 2000) throw Error('VIEWER_SOURCE_FILE_BUDGET');
  const digest = createHash('sha256');
  for (const file of files.sort()) {
    const text = (await readFile(file, 'utf8')).replaceAll('\r\n', '\n');
    digest.update(path.relative(path.resolve(root, '..'), file).replaceAll('\\', '/') + '\0');
    digest.update(text); digest.update('\0');
  }
  return { sourceSha256: digest.digest('hex'), sourceFiles: files.length, scope: 'renderer_source_and_mineflayer_host_adapters' };
}

export async function checkViewerBuild(rendererRoot, assetRoot) {
  const source = await viewerSourceDigest(rendererRoot);
  const manifest = JSON.parse(await readFile(path.join(assetRoot, 'viewer-client.json'), 'utf8'));
  const bundle = createHash('sha256').update(await readFile(path.join(assetRoot, 'dist/modern-viewer.js'))).digest('hex');
  return { ok: manifest.buildSource?.sourceSha256 === source.sourceSha256 && manifest.browserBundleSha256 === bundle,
    source, recordedSource: manifest.buildSource ?? null, bundleSha256: bundle, recordedBundleSha256: manifest.browserBundleSha256,
    minecraftVersion: manifest.minecraftVersion, preset: manifest.preset,
    nextAction: '若ok=false，用当前源码按原Minecraft版本与preset重建该资产目录，再重启消费它的Web宿主；不要只git pull。' };
}
