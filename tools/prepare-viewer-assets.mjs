import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const runFile = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export const SHARED_ASSET_ROOT = path.join(repositoryRoot, 'packages/modern-viewer/asset-packs');
const rendererRoot = path.join(repositoryRoot, 'packages/modern-viewer/renderer-src');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (root, candidate) => candidate === root || candidate.startsWith(root + path.sep);

async function eachFile(entries, action) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, entries.length) }, async () => {
    while (next < entries.length) await action(entries[next++]);
  }));
}

export async function loadAssetPack(id, assetRoot = SHARED_ASSET_ROOT) {
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(id)) throw Error('ASSET_PACK_ID_INVALID');
  const directory = path.resolve(assetRoot, id);
  const manifestBytes = await fs.readFile(path.join(directory, 'pack.json'));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schemaVersion !== 1 || manifest.id !== id || !['java', 'native', 'sounds'].includes(manifest.kind) ||
      !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) throw Error('ASSET_PACK_MANIFEST_INVALID');
  const entries = Object.entries(manifest.files);
  if (manifest.fileCount !== entries.length || !entries.length) throw Error('ASSET_PACK_COUNT_INVALID');
  let bytes = 0;
  for (const [relative, expected] of entries) {
    if (relative.includes('\\') || relative.includes(':') || relative.includes('\0') ||
        relative.split('/').some(part => ['', '.', '..'].includes(part)) || relative === 'pack.json') throw Error('ASSET_PACK_PATH_INVALID');
    if (!/^[a-f0-9]{64}$/.test(expected?.sha256 || '') || !Number.isSafeInteger(expected.bytes) || expected.bytes < 0) throw Error('ASSET_PACK_HASH_INVALID');
    bytes += expected.bytes;
  }
  if (manifest.bytes !== bytes) throw Error('ASSET_PACK_BYTES_INVALID');
  return { directory, manifest, entries, manifestSha256: hash(manifestBytes) };
}

export async function verifyAssetPack(id, assetRoot = SHARED_ASSET_ROOT) {
  const pack = await loadAssetPack(id, assetRoot);
  const realRoot = await fs.realpath(pack.directory);
  await eachFile(pack.entries, async ([relative, expected]) => {
    const file = path.join(pack.directory, relative);
    const realFile = await fs.realpath(file);
    const metadata = await fs.lstat(file);
    if (!inside(realRoot, realFile) || !metadata.isFile() || metadata.isSymbolicLink()) throw Error('ASSET_PACK_FILE_INVALID: ' + relative);
    const bytes = await fs.readFile(file);
    if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256) throw Error('ASSET_PACK_HASH_MISMATCH: ' + relative);
  });
  return pack;
}

export async function prepareAssetPack({ id, outputDirectory, sounds = false, preset = null, assetRoot = SHARED_ASSET_ROOT, buildJava = true }) {
  if (preset !== null && preset !== 'qiandengji') throw Error('ASSET_PACK_PRESET_INVALID');
  const output = path.resolve(outputDirectory);
  for (const source of [path.resolve(assetRoot), rendererRoot]) {
    if (inside(source, output) || inside(output, source)) throw Error('ASSET_PACK_OUTPUT_OVERLAPS_SOURCE');
  }
  const primary = await verifyAssetPack(id, assetRoot);
  if (primary.manifest.kind === 'sounds') throw Error('ASSET_PACK_SELECT_VISUAL_PACK');
  if (primary.manifest.kind !== 'java' && (sounds || preset)) throw Error('ASSET_PACK_OPTIONS_REQUIRE_JAVA');
  const packs = [primary];
  if (sounds) {
    const audio = await verifyAssetPack(id + '-sounds', assetRoot);
    if (audio.manifest.kind !== 'sounds' || audio.manifest.minecraftVersion !== primary.manifest.minecraftVersion) throw Error('ASSET_PACK_SOUND_VERSION_MISMATCH');
    packs.push(audio);
  }
  for (const relative of ['viewer-assets.json', 'public/asset-source.json', 'native-assets.json']) {
    const previous = await fs.readFile(path.join(output, relative), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (previous && JSON.parse(previous).minecraftVersion !== primary.manifest.minecraftVersion) throw Error('ASSET_PACK_OUTPUT_VERSION_MISMATCH');
  }
  await fs.mkdir(output, { recursive: true });
  for (const pack of packs) await eachFile(pack.entries, async ([relative, expected]) => {
    const destination = path.join(output, relative);
    const bytes = await fs.readFile(path.join(pack.directory, relative));
    if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256) throw Error('ASSET_PACK_CHANGED_DURING_COPY: ' + relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
  });
  if (primary.manifest.kind === 'java' && buildJava) {
    const args = [path.join(rendererRoot, 'tools/build-minecraft-viewer-client.mjs'), rendererRoot, output];
    if (preset) args.push('--preset=' + preset);
    const result = await runFile(process.execPath, args, { maxBuffer: 1024 * 1024 });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  const receipt = { schemaVersion: 1, minecraftVersion: primary.manifest.minecraftVersion, kind: primary.manifest.kind,
    preparedAt: new Date().toISOString(), preset, packs: packs.map(pack => ({ id: pack.manifest.id,
      manifestSha256: pack.manifestSha256, fileCount: pack.manifest.fileCount, bytes: pack.manifest.bytes,
      source: pack.manifest.source ?? null })) };
  await fs.writeFile(path.join(output, 'viewer-assets.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--list' || args[0] === '--verify') {
    const ids = args[1] ? [args[1]] : (await fs.readdir(SHARED_ASSET_ROOT, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const id of ids) {
      const { manifest } = await (args[0] === '--verify' ? verifyAssetPack(id) : loadAssetPack(id));
      console.log(JSON.stringify({ id, minecraftVersion: manifest.minecraftVersion, files: manifest.fileCount, bytes: manifest.bytes,
        ...(args[0] === '--verify' ? { verified: true } : { scope: manifest.scope }) }));
    }
    return;
  }
  const [id, outputDirectory, ...options] = args;
  if (!id || !outputDirectory || options.some(option => !['--sounds', '--preset=qiandengji'].includes(option))) {
    throw Error('Usage: node tools/prepare-viewer-assets.mjs <java-1.20.6|native-1.21.1> <output-dir> [--sounds] [--preset=qiandengji]; --verify [pack]; --list');
  }
  const result = await prepareAssetPack({ id, outputDirectory, sounds: options.includes('--sounds'), preset: options.includes('--preset=qiandengji') ? 'qiandengji' : null });
  console.log(JSON.stringify(result));
  if (result.kind === 'native') console.log('Native source resources prepared. Supply registry/ and override variants from the matching server export before starting the native host.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
