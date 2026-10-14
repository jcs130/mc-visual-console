import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { viewerVersionRegistry, viewerVersionCss, viewerVersionAssets } from '../host/viewer-version.mjs';
const require = createRequire(import.meta.url);
const data = require('minecraft-data'), item = require('prismarine-item');

test('the preview uses matching real item and biome registries across both supported protocols', () => {
  for (const version of ['1.20.6', '1.21.1']) {
    const registry = viewerVersionRegistry(version, data, item);
    assert.equal(registry.plainsBiomeId, data(version).biomesByName.plains.id);
    const Item = item(version), decoded = registry.TradeItem.fromNotch(Item.toNotch(new Item(data(version).itemsByName.cod.id, 3)));
    assert.equal(decoded.name, 'cod'); assert.equal(decoded.count, 3);
    const css = viewerVersionCss("url('/textures/1.20.6/misc/enchanted_glint_item.png')", version);
    assert.match(css, new RegExp(`/textures/${version.replaceAll('.', '\\.')}/`));
  }
  assert.throws(() => viewerVersionRegistry('1.21.1', () => data('1.20.6'), item), /VERSION_MISMATCH/);
});

test('an explicitly packaged second version is selected while missing and mismatched resources fail closed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'viewer-versions-'));
  const second = path.join(root, 'versions', '1.21.1'); await mkdir(second, { recursive: true });
  await writeFile(path.join(root, 'viewer-assets.json'), JSON.stringify({ minecraftVersion: '1.20.6' }));
  await writeFile(path.join(second, 'viewer-assets.json'), JSON.stringify({ minecraftVersion: '1.21.1' }));
  assert.equal(await viewerVersionAssets(root, '1.20.6'), root);
  assert.equal(await viewerVersionAssets(root, '1.21.1'), second);
  await writeFile(path.join(second, 'viewer-assets.json'), JSON.stringify({ minecraftVersion: '1.20.6' }));
  await assert.rejects(viewerVersionAssets(root, '1.21.1'), /VERSION_MISMATCH/);
  await assert.rejects(viewerVersionAssets(root, '../1.20.6'), /VERSION_UNSUPPORTED/);
});
