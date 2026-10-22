import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadServerItemPack } from '../../host/server-item-pack.mjs';
import { ServerItemIcons } from '../../src/native-viewer/server-item-icons.js';
const file = fileURLToPath(new URL('../../../asset-packs/qiandengji-gui-1.21.1/catalog.json', import.meta.url));
const SHA = '30b6712dd2209700e18ba7f6f1f625396cb35f41e5778b8474baa983dda1ad8a';
const profileHash = '8dcc6eb40f3bada41e4339888d6d207437598bdbd175c2e731191d5a9a42d3c8';
test('all six GUI selectors and their original PNGs pass the immutable 1.21.1 catalog', async () => {
  const bytes = await fs.readFile(file); assert.equal(createHash('sha256').update(bytes).digest('hex'), SHA);
  const pack = await loadServerItemPack(file, SHA);
  assert.equal(pack.metadata.id, 'qiandengji-gui-1.21.1'); assert.equal(pack.metadata.items.length, 6);
  assert.equal(pack.assets.size, 6);
  const head = pack.assets.get('profiles/backpack.png'); assert.equal(head.readUInt32BE(16), 64); assert.equal(head.readUInt32BE(20), 64);
  assert.equal(createHash('sha256').update(head).digest('hex'), profileHash);
  await assert.rejects(loadServerItemPack(file, 'a'.repeat(64)), /HASH_MISMATCH/);
});
test('backpack and all five weapons match raw components, never their display names or slot numbers', async () => {
  const pack = await loadServerItemPack(file, SHA), icons = new ServerItemIcons();
  icons.id = pack.metadata.id; icons.catalog = pack.metadata;
  for (const row of pack.metadata.items) {
    let components;
    if (row.profileTextureHash) {
      const value = Buffer.from(JSON.stringify({ textures: { SKIN: { url: 'https://textures.minecraft.net/texture/' + profileHash } } })).toString('base64');
      components = '"minecraft:profile":{properties:[{name:"textures",value:' + JSON.stringify(value) + '}]}';
    } else components = '"minecraft:custom_model_data":' + row.customModelData;
    const item = { name: row.baseId, count: 1, snbt: `{id:"${row.baseId}",count:1,components:{${components},"minecraft:custom_name":'"任意名称"'}}` };
    assert.equal(icons.selector(item)?.icon, row.icon);
    if (row.customModelData) assert.equal(icons.selector({ ...item, snbt: item.snbt.replace(String(row.customModelData), '999999') }), null);
  }
  assert.equal(icons.selector({ name: 'minecraft:player_head', count: 1, displayName: '大背包', snbt: '{id:"minecraft:player_head",count:1,components:{}}' }), null);
  icons.clear(); assert.equal(icons.catalog, null);
});
