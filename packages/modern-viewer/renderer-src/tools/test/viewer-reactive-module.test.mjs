import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, copyFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { viewerReactiveModule } from '../viewer-reactive-module.mjs';

test('bundled proxy and key subscribers share state through a linked dependency directory', async () => {
  const source = fileURLToPath(new URL('../../', import.meta.url));
  const root = await mkdtemp(path.join(tmpdir(), 'viewer-reactive-'));
  try {
    await mkdir(path.join(root, 'src'));
    await symlink(await realpath(path.join(source, 'node_modules')), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await copyFile(path.join(source, 'src/modern-viewer/valtio-utils-shim.js'), path.join(root, 'src/utils.js'));
    const bundled = await build({ stdin: { contents: `import { proxy } from 'valtio';
      import { subscribeKey } from './src/utils.js';
      const state = proxy({ value: 1 }); const seen = [];
      const stop = subscribeKey(state, 'value', value => seen.push(value), true);
      state.value = 2; stop(); state.value = 3; export default seen;`, resolveDir: root },
      bundle: true, write: false, format: 'esm', platform: 'node', plugins: [await viewerReactiveModule(root)] });
    const module = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
    assert.deepEqual(module.default, [2]);
  } finally {
    const target = await realpath(root);
    assert.equal(path.dirname(target), await realpath(tmpdir()));
    assert.ok(path.basename(target).startsWith('viewer-reactive-'));
    await rm(target, { recursive: true, force: true });
  }
});
