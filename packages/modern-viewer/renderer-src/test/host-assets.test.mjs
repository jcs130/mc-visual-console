import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { viewerPageCss, viewerPageHtml } from '../host/viewer-page-assets.mjs';
import { serveViewerAsset, viewerByteRange } from '../host/viewer-asset-server.mjs';

async function temporary(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'viewer-host-assets-'));
  try { await mkdir(path.join(root, 'public')); await run(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
const legacy = '<body data-view-mode="__VIEW_MODE__">legacy</body>';

test('host serves generated fishing and audio mounts, camera pages and CSS', async () => {
  await temporary(async root => {
    const page = '<body data-view-mode="first"><aside id="viewer-fishing-catch"></aside>' +
      '<button id="corti-music-toggle"></button></body>';
    await writeFile(path.join(root, 'public', 'index.html'), page);
    await mkdir(path.join(root, 'public', 'third'));
    await writeFile(path.join(root, 'public', 'third', 'index.html'), '<body data-view-mode="third">third</body>');
    await writeFile(path.join(root, 'public', 'viewer.css'), '.viewer-fishing-catch{color:gold}');
    const frame = '<iframe id="corti-speech-bubble" hidden></iframe>';
    const script = '<script src="/speech-bubble.js" defer></script>';
    const html = await viewerPageHtml(root, 'first', legacy, frame, script);
    assert.ok(html.includes('id="viewer-fishing-catch"'));
    assert.ok(html.includes('id="corti-music-toggle"'));
    assert.ok(html.endsWith(frame + script + '</body>'));
    assert.ok(!html.includes('legacy'));
    assert.equal(await viewerPageHtml(root, 'third', legacy), '<body data-view-mode="third">third</body>');
    assert.ok((await viewerPageHtml(root, 'dungeon', legacy)).includes('data-view-mode="dungeon"'));
    assert.equal(await viewerPageCss(root, '.legacy{}', '.speech{}'), '.viewer-fishing-catch{color:gold}.speech{}');
    await writeFile(path.join(root, 'public', 'index.html'), html);
    assert.equal(await viewerPageHtml(root, 'first', legacy, frame, script), html);
  });
});

test('host keeps legacy packages usable and validates byte range boundaries', async () => {
  await temporary(async root => {
    assert.equal(await viewerPageHtml(root, 'dungeon', legacy), '<body data-view-mode="dungeon">legacy</body>');
    assert.equal(await viewerPageCss(root, '.legacy{}', '.speech{}'), '.legacy{}');
  });
  assert.deepEqual(viewerByteRange('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(viewerByteRange('bytes=2-', 10), { start: 2, end: 9 });
  assert.deepEqual(viewerByteRange('bytes=-3', 10), { start: 7, end: 9 });
  for (const invalid of ['bytes=10-', 'bytes=8-2', 'bytes=-0', 'bytes=0-2,4-6'])
    assert.equal(viewerByteRange(invalid, 10), null);
});

test('actual OGG requests return full bytes, selected bytes or an unsatisfiable range', async () => {
  await temporary(async root => {
    const bytes = Buffer.from('0123456789');
    await writeFile(path.join(root, 'sample.ogg'), bytes);
    const server = createServer((req, res) => {
      void serveViewerAsset(res, root, req.url.slice(1), undefined, req.headers.range).then(served => {
        if (!served) { res.writeHead(404); res.end(); }
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    try {
      const full = await fetch(`${origin}/sample.ogg`);
      assert.equal(full.status, 200);
      assert.equal(full.headers.get('accept-ranges'), 'bytes');
      assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
      const partial = await fetch(`${origin}/sample.ogg`, { headers: { Range: 'bytes=3-6' } });
      assert.equal(partial.status, 206);
      assert.equal(partial.headers.get('content-range'), 'bytes 3-6/10');
      assert.equal(await partial.text(), '3456');
      const invalid = await fetch(`${origin}/sample.ogg`, { headers: { Range: 'bytes=20-' } });
      assert.equal(invalid.status, 416);
      assert.equal(invalid.headers.get('content-range'), 'bytes */10');
      assert.equal(await invalid.text(), '');
      assert.equal(await serveViewerAsset({}, root, '../outside.ogg'), false);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
