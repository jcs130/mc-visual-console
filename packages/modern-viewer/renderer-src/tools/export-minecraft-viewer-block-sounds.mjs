/** Exact sound IDs and optional surface sounds; requires Java 21 and an installed 1.20.6 client. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateViewerSoundRegistry } from '../host/viewer-sound-registry.mjs';

const [versionArg, librariesArg, outputArg, javaArg = 'java'] = process.argv.slice(2);
if (!versionArg || !librariesArg || !outputArg) {
  console.error('用法：node tools/export-minecraft-viewer-block-sounds.mjs <1.20.6.json> <启动器 libraries 目录> <输出包目录> [Java 21 可执行文件]');
  process.exit(2);
}
const versionPath = path.resolve(versionArg);
const version = JSON.parse(await readFile(versionPath, 'utf8'));
if (version.id !== '1.20.6') throw Error('Block sounds require the exact 1.20.6 client');
const client = path.join(path.dirname(versionPath), '1.20.6.jar');
const bytes = await readFile(client);
if (createHash('sha1').update(bytes).digest('hex') !== version.downloads?.client?.sha1) {
  throw Error('Installed client does not match its official launcher metadata');
}
const clientJarSha256 = createHash('sha256').update(bytes).digest('hex');
if (clientJarSha256 !== '02dfd345ac1ad55692d5dbc8486ac7e4fea72cd54ac494a79cd48963048e56b2') {
  throw Error('Unrecognized client: native reflection layout is pinned to the original 1.20.6 release');
}
const librariesRoot = path.resolve(librariesArg);
const libraries = (version.libraries ?? []).map(value => value.downloads?.artifact)
  .filter(value => value?.path).map(value => ({ ...value, file: path.resolve(librariesRoot, value.path) }))
  .filter(value => existsSync(value.file));
for (const library of libraries) {
  if (!library.file.startsWith(`${librariesRoot}${path.sep}`)) throw Error('Invalid library path');
  if (createHash('sha1').update(readFileSync(library.file)).digest('hex') !== library.sha1) {
    throw Error(`Installed library integrity check failed: ${path.basename(library.file)}`);
  }
}
const temporary = await mkdtemp(path.join(tmpdir(), 'mc-block-sounds-'));
try {
  const source = path.join(temporary, 'ExportMinecraftBlockSounds.java');
  const resultFile = path.join(temporary, 'block-sounds.json');
  const registryFile = path.join(temporary, 'registry.json');
  await copyFile(fileURLToPath(new URL('./ExportMinecraftBlockSounds.java', import.meta.url)), source);
  const processResult = spawnSync(javaArg, ['-Djava.awt.headless=true', '-cp',
    [client, ...libraries.map(value => value.file)].join(path.delimiter), source, resultFile, registryFile],
  { cwd: temporary, timeout: 60_000, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (processResult.error || processResult.status !== 0) {
    throw Error('Native block sound export failed; check Java 21 and the installed client libraries');
  }
  const result = JSON.parse(await readFile(resultFile, 'utf8'));
  if (result.minecraftVersion !== '1.20.6' || Object.keys(result.blocks ?? {}).length !== 1060) {
    throw Error('Unexpected native block registry; no surface sound mapping was published');
  }
  result.clientJarSha256 = clientJarSha256;
  const registry = JSON.parse(await readFile(registryFile, 'utf8'));
  registry.clientJarSha256 = clientJarSha256;
  validateViewerSoundRegistry(registry, '1.20.6');
  const output = path.join(path.resolve(outputArg), 'public', 'sounds');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'block-sounds.json'), JSON.stringify(result) + '\n');
  await writeFile(path.join(output, 'registry.json'), JSON.stringify(registry) + '\n');
  console.log(`1.20.6 声音已导出：${Object.keys(result.blocks).length} 种方块，${Object.keys(registry.events).length} 个准确声音编号`);
} finally {
  // This path is the single directory returned by mkdtemp above.
  if (path.dirname(path.resolve(temporary)) !== path.resolve(tmpdir())
    || !path.basename(temporary).startsWith('mc-block-sounds-')) throw Error('Unexpected temporary directory');
  await rm(temporary, { recursive: true, force: true });
}
