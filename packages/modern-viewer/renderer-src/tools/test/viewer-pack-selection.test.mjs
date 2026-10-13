import test from 'node:test';
import assert from 'node:assert/strict';
import { selectViewerPack } from '../../host/viewer-pack-selection.mjs';

const packs = [
  { id: 'java-1.20.6', minecraftVersion: '1.20.6', registry: 'vanilla' },
  { id: 'vanilla-1.21.1', minecraftVersion: '1.21.1', registry: 'vanilla' },
  { id: 'native-1.21.1', minecraftVersion: '1.21.1', registrySha256: 'mod-registry' },
  { id: 'qiandengji-1.20.6', minecraftVersion: '1.20.6', registry: 'vanilla', contentProfile: 'qiandengji' },
];
test('selects exact version; modded registry cannot silently use vanilla', () => {
  assert.equal(selectViewerPack(packs, { minecraftVersion: '1.21.1' }).pack.id, 'vanilla-1.21.1');
  assert.equal(selectViewerPack(packs, { minecraftVersion: '1.20.6' }).pack.id, 'java-1.20.6');
  assert.equal(selectViewerPack(packs, { minecraftVersion: '1.21.1', registrySha256: 'mod-registry' }).pack.id, 'native-1.21.1');
  assert.equal(selectViewerPack(packs, { minecraftVersion: '1.21.1', registrySha256: 'unknown' }).available, false);
  assert.equal(selectViewerPack(packs, { minecraftVersion: '1.21.2' }).available, false);
});
test('content overlays require verified capability and matching version', () => {
  const choose = contentProfile => selectViewerPack(packs, { minecraftVersion: '1.20.6', contentProfile });
  assert.deepEqual(choose(null).overlays, []);
  assert.equal(choose({ id: 'qiandengji' }).content.available, false);
  assert.equal(choose({ id: 'qiandengji', verified: true }).overlays[0].id, 'qiandengji-1.20.6');
  assert.equal(selectViewerPack(packs, { minecraftVersion: '1.21.1', contentProfile: { id: 'qiandengji', verified: true } }).content.available, false);
});
test('duplicate matching packs fail explicitly', () => {
  assert.equal(selectViewerPack([...packs, packs[0]], { minecraftVersion: '1.20.6' }).reason, 'AMBIGUOUS_VIEWER_PACK');
});
