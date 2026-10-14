import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { viewerVersionRegistry, viewerVersionCss } from '../host/viewer-version.mjs';
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
