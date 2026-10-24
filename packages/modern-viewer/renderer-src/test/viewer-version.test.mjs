import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { viewerVersionRegistry, viewerVersionCss, viewerVersionAssets, viewerVersionTexture } from '../host/viewer-version.mjs';
const require = createRequire(import.meta.url);
const data = require('minecraft-data'), item = createRequire(require.resolve('mineflayer'))('prismarine-item');

test('the preview uses matching real item and biome registries across both supported protocols', () => {
  for (const version of ['1.20.6', '1.21.1', '1.21.11']) {
    const registry = viewerVersionRegistry(version, data, item);
    assert.equal(registry.plainsBiomeId, data(version).biomesByName.plains.id);
    const Item = item(version), decoded = registry.TradeItem.fromNotch(Item.toNotch(new Item(data(version).itemsByName.cod.id, 3)));
    assert.equal(decoded.name, 'cod'); assert.equal(decoded.count, 3);
    const css = viewerVersionCss("url('/textures/1.20.6/misc/enchanted_glint_item.png')", version);
    assert.match(css, new RegExp(`/textures/${version.replaceAll('.', '\\.')}/`));
  }
  assert.throws(() => viewerVersionRegistry('1.21.1', () => data('1.20.6'), item), /VERSION_MISMATCH/);
});

test('legacy entity texture names resolve to original version assets without crossing versions', () => {
  assert.equal(viewerVersionTexture('textures/entity/squid.png', '1.21.1'), 'textures/1.21.1/entity/squid/squid.png');
  assert.equal(viewerVersionTexture('textures/entity/glow_squid.png', '1.21.1'), 'textures/1.21.1/entity/squid/glow_squid.png');
  assert.equal(viewerVersionTexture('textures/entity/squid.png', '1.20.6'), 'textures/1.20.6/entity/squid.png');
  assert.equal(viewerVersionTexture('icons/cod.png', '1.21.1'), null);
  assert.equal(viewerVersionTexture('textures/models/armor/iron_layer_2.png', '1.21.11'), 'textures/1.21.11/entity/equipment/humanoid_leggings/iron.png');
  assert.equal(viewerVersionTexture('textures/models/armor/leather_layer_1_overlay.png', '1.21.11'), 'textures/1.21.11/entity/equipment/humanoid/leather_overlay.png');
  assert.equal(viewerVersionTexture('textures/entity/elytra.png', '1.21.11'), 'textures/1.21.11/entity/equipment/wings/elytra.png');
  for (const version of ['1.20.6', '1.21.1'])
    assert.equal(viewerVersionTexture('minecraft-assets/painting/aztec.png', version), `textures/${version}/painting/aztec.png`);
  assert.equal(viewerVersionCss("const bow='/textures/1.20.6/item/bow.png'; const glint='/textures/1.20.6/misc/enchanted_glint_item.png';", '1.21.1'),
    "const bow='/textures/1.21.1/item/bow.png'; const glint='/textures/1.21.1/misc/enchanted_glint_item.png';");
});

test('an explicitly packaged second version is selected while missing and mismatched resources fail closed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'viewer-versions-'));
  const second = path.join(root, 'versions', '1.21.1'); await mkdir(second, { recursive: true });
  await writeFile(path.join(root, 'viewer-assets.json'), JSON.stringify({ minecraftVersion: '1.20.6' }));
  await writeFile(path.join(second, 'viewer-assets.json'), JSON.stringify({ minecraftVersion: '1.21.1' }));
  assert.equal(await viewerVersionAssets(root, '1.20.6'), root);
  assert.equal(await viewerVersionAssets(root, '1.21.1'), second);
  const newer = path.join(root, 'versions', '1.21.11'); await mkdir(newer, {recursive:true});
  await writeFile(path.join(newer, 'viewer-assets.json'), JSON.stringify({minecraftVersion:'1.21.11'}));
  assert.equal(await viewerVersionAssets(root, '1.21.11'), newer);
  await assert.rejects(viewerVersionAssets(root, '1.21.10'), /ASSETS_MISSING/);
  await writeFile(path.join(second, 'viewer-assets.json'), JSON.stringify({ minecraftVersion: '1.20.6' }));
  await assert.rejects(viewerVersionAssets(root, '1.21.1'), /VERSION_MISMATCH/);
  await assert.rejects(viewerVersionAssets(root, '../1.20.6'), /VERSION_UNSUPPORTED/);
});
