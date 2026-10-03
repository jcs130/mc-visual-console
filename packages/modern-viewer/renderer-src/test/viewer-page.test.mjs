import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { renderViewerPage, VIEWER_CSS, writeViewerPages } from '../src/viewer-page.mjs';

test('all camera modes mount the same survival and interaction HUD without a deployment dependency', () => {
  for (const mode of ['first', 'third', 'dungeon']) {
    const html = renderViewerPage(mode);
    assert.ok(html.includes(`data-view-mode="${mode}"`));
    assert.ok(!html.includes('__VIEW_MODE__'));
    for (const mount of ['data-corti-hearts', 'data-corti-food', 'data-corti-air', 'data-corti-mana-vital',
      'data-corti-level', 'data-corti-slots', 'data-corti-offhand', 'id="corti-menu"', 'id="corti-minimap"']) {
      assert.ok(html.includes(mount), `${mode} is missing ${mount}`);
    }
    assert.match(html, /src="\/index\.js"/);
    assert.match(html, /href="\/viewer\.css"/);
    assert.doesNotMatch(html, /speech-bubble\.js|CortiLan|192\.168\.|127\.0\.0\.1|I:\\/);
  }
  assert.throws(() => renderViewerPage('<script>alert(1)</script>'), TypeError);
});

test('page export is repeatable and preserves other generated assets', async () => {
  const output = await mkdtemp(join(tmpdir(), 'modern-viewer-page-'));
  try {
    await writeViewerPages(output);
    await writeFile(join(output, 'public', 'asset-marker.json'), '{"keep":true}');
    await writeViewerPages(output);
    assert.equal(await readFile(join(output, 'public', 'asset-marker.json'), 'utf8'), '{"keep":true}');
    for (const [mode, route] of [['first', ''], ['third', 'third'], ['dungeon', 'dungeon']]) {
      assert.equal(await readFile(join(output, 'public', route, 'index.html'), 'utf8'), renderViewerPage(mode));
    }
    assert.equal(await readFile(join(output, 'public', 'viewer.css'), 'utf8'), VIEWER_CSS);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
