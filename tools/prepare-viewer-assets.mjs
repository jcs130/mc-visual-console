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

export async function listAssetPackIds(assetRoot = SHARED_ASSET_ROOT) {
  const ids = [];
  for (const entry of await fs.readdir(assetRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = await fs.lstat(path.join(assetRoot, entry.name, 'pack.json')).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!manifest) continue;
    if (!manifest.isFile()) throw Error('ASSET_PACK_MANIFEST_INVALID: ' + entry.name);
    ids.push(entry.name);
  }
  return ids.sort();
}

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
  if (manifest.schemaVersion !== 1 || manifest.id !== id || !['java', 'native', 'sounds', 'bgm'].includes(manifest.kind) ||
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
  if (Object.hasOwn(pack.manifest.files, 'public/sounds/custom-bgm.json')) {
    const catalog = JSON.parse(await fs.readFile(path.join(pack.directory, 'public/sounds/custom-bgm.json'), 'utf8'));
    if (catalog.version !== 1 || !Array.isArray(catalog.tracks)) throw Error('ASSET_PACK_BGM_CATALOG_INVALID');
    for (const track of catalog.tracks) {
      if (typeof track.file !== 'string' || !Object.hasOwn(pack.manifest.files, `public/sounds/${track.file}`))
        throw Error('ASSET_PACK_BGM_RESOURCE_MISSING: ' + String(track.id));
    }
  }
  return pack;
}

async function copyAssetPack(pack, output) {
  // Publish catalog metadata after its files, so readers cannot observe a new
  // catalog whose audio is still being copied. Preserve private custom tracks.
  const catalogs = ['public/sounds/manifest.json', 'public/sounds/custom-bgm.json'];
  if (pack.manifest.kind === 'bgm') {
    const previous = await fs.readFile(path.join(output, 'public/sounds/custom-bgm.json')).catch(error => {
      if (error.code !== 'ENOENT') throw error; return null;
    });
    if (previous && hash(previous) !== pack.manifest.files['public/sounds/custom-bgm.json']?.sha256)
      return 'custom-catalog-preserved';
  }
  const copy = async ([relative, expected]) => {
    const bytes = await fs.readFile(path.join(pack.directory, relative));
    if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256) throw Error('ASSET_PACK_CHANGED_DURING_COPY: ' + relative);
    const destination = path.join(output, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
  };
  await eachFile(pack.entries.filter(([relative]) => !catalogs.includes(relative)), copy);
  for (const catalog of catalogs) {
    const manifest = pack.entries.find(([relative]) => relative === catalog);
    if (manifest) await copy(manifest);
  }
  return 'copied';
}

/** Also used by direct renderer builds: updating visuals must not omit audio. */
export async function prepareSoundAssetPack({ minecraftVersion, outputDirectory, assetRoot = SHARED_ASSET_ROOT, originalBgm = assetRoot === SHARED_ASSET_ROOT }) {
  if (typeof minecraftVersion !== 'string' || !/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(minecraftVersion)) throw Error('ASSET_PACK_SOUND_VERSION_UNSUPPORTED');
  const output = path.resolve(outputDirectory), source = path.resolve(assetRoot);
  if (inside(source, output) || inside(output, source)) throw Error('ASSET_PACK_OUTPUT_OVERLAPS_SOURCE');
  const audio = await verifyAssetPack(`java-${minecraftVersion}-sounds`, assetRoot);
  if (audio.manifest.kind !== 'sounds' || audio.manifest.minecraftVersion !== minecraftVersion) throw Error('ASSET_PACK_SOUND_VERSION_MISMATCH');
  for (const relative of ['public/asset-source.json', 'viewer-assets.json', 'public/sounds/manifest.json']) {
    const previous = await fs.readFile(path.join(output, relative), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (previous && JSON.parse(previous).minecraftVersion !== minecraftVersion) throw Error('ASSET_PACK_OUTPUT_VERSION_MISMATCH');
  }
  await copyAssetPack(audio, output);
  let bgm = null;
  if (originalBgm) {
    const pack = await verifyAssetPack('original-bgm', assetRoot);
    bgm = { id: pack.manifest.id, status: await copyAssetPack(pack, output), manifestSha256: pack.manifestSha256,
      fileCount: pack.manifest.fileCount, bytes: pack.manifest.bytes };
  }
  const receipt = { schemaVersion: 1, minecraftVersion, preparedAt: new Date().toISOString(),
    id: audio.manifest.id, manifestSha256: audio.manifestSha256, fileCount: audio.manifest.fileCount,
    bytes: audio.manifest.bytes, source: audio.manifest.source ?? null, originalBgm: bgm };
  await fs.writeFile(path.join(output, 'viewer-audio-assets.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

export async function prepareAssetPack({ id, outputDirectory, sounds = true, preset = null, assetRoot = SHARED_ASSET_ROOT, buildJava = true, originalBgm = assetRoot === SHARED_ASSET_ROOT }) {
  if (preset !== null && preset !== 'qiandengji') throw Error('ASSET_PACK_PRESET_INVALID');
  const output = path.resolve(outputDirectory);
  for (const source of [path.resolve(assetRoot), rendererRoot]) {
    if (inside(source, output) || inside(output, source)) throw Error('ASSET_PACK_OUTPUT_OVERLAPS_SOURCE');
  }
  const primary = await verifyAssetPack(id, assetRoot);
  if (['sounds', 'bgm'].includes(primary.manifest.kind)) throw Error('ASSET_PACK_SELECT_VISUAL_PACK');
  if (primary.manifest.kind !== 'java' && preset) throw Error('ASSET_PACK_OPTIONS_REQUIRE_JAVA');
  if (sounds && !['java','native'].includes(primary.manifest.kind)) throw Error('ASSET_PACK_OPTIONS_REQUIRE_JAVA');
  const packs = [primary];
  if (sounds) {
    const audio = await verifyAssetPack(primary.manifest.kind==='native'?`java-${primary.manifest.minecraftVersion}-sounds`:id+'-sounds', assetRoot);
    if (audio.manifest.kind !== 'sounds' || audio.manifest.minecraftVersion !== primary.manifest.minecraftVersion) throw Error('ASSET_PACK_SOUND_VERSION_MISMATCH');
    packs.push(audio);
    if (originalBgm) packs.push(await verifyAssetPack('original-bgm', assetRoot));
  }
  for (const relative of ['viewer-assets.json', 'public/asset-source.json', 'native-assets.json']) {
    const previous = await fs.readFile(path.join(output, relative), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (previous && JSON.parse(previous).minecraftVersion !== primary.manifest.minecraftVersion) throw Error('ASSET_PACK_OUTPUT_VERSION_MISMATCH');
  }
  await fs.mkdir(output, { recursive: true });
  for (const pack of packs) pack.copyStatus = await copyAssetPack(pack, output);
  if (primary.manifest.kind === 'java' && buildJava) {
    // Selected packs have already been verified/copied above, including an
    // explicit silent deployment. Do not duplicate that work in the child.
    const args = [path.join(rendererRoot, 'tools/build-minecraft-viewer-client.mjs'), rendererRoot, output, '--no-sounds'];
    if (preset) args.push('--preset=' + preset);
    const result = await runFile(process.execPath, args, { maxBuffer: 1024 * 1024 });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  const receipt = { schemaVersion: 1, minecraftVersion: primary.manifest.minecraftVersion, kind: primary.manifest.kind,
    preparedAt: new Date().toISOString(), preset, audio: {requested:sounds, status:sounds?'prepared':'disabled'}, packs: packs.map(pack => ({ id: pack.manifest.id,
      manifestSha256: pack.manifestSha256, fileCount: pack.manifest.fileCount, bytes: pack.manifest.bytes,
      source: pack.manifest.source ?? null, status: pack.copyStatus })) };
  await fs.writeFile(path.join(output, 'viewer-assets.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--list' || args[0] === '--verify') {
    const ids = args[1] ? [args[1]] : await listAssetPackIds();
    for (const id of ids) {
      const { manifest } = await (args[0] === '--verify' ? verifyAssetPack(id) : loadAssetPack(id));
      console.log(JSON.stringify({ id, minecraftVersion: manifest.minecraftVersion, files: manifest.fileCount, bytes: manifest.bytes,
        ...(args[0] === '--verify' ? { verified: true } : { scope: manifest.scope }) }));
    }
    return;
  }
  const [id, outputDirectory, ...options] = args;
  if (!id || !outputDirectory || options.some(option => !['--sounds', '--no-sounds', '--preset=qiandengji'].includes(option))
    || (options.includes('--sounds') && options.includes('--no-sounds'))) {
    throw Error('Usage: node tools/prepare-viewer-assets.mjs <java-1.20.6|java-1.21.1|native-1.21.1> <output-dir> [--no-sounds] [--preset=qiandengji]; --verify [pack]; --list');
  }
  const result = await prepareAssetPack({ id, outputDirectory, sounds: !options.includes('--no-sounds'), preset: options.includes('--preset=qiandengji') ? 'qiandengji' : null });
  console.log(JSON.stringify(result));
  if (result.kind === 'native') console.log('Native source resources prepared. Supply registry/ and override variants from the matching server export before starting the native host.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
